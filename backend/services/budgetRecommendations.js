// Budget recommendations from actuals.
//
// Looks at the last N complete months of spending (6 or 12) and, for every
// budget line, works out what was actually spent per month on average — so
// each line can be compared with reality and either updated or kept as a
// target to spend down to.
//
// Budget lines are free-form names (e.g. "Spotify", "Restaurants & Bars")
// under a category/subcategory, while transactions only carry
// category/subcategory + merchant. So actuals are attributed in two steps:
//   1. merchant — a line whose name matches a merchant ("Spotify" ↔ SPOTIFY,
//      "Water" ↔ GUARDIAN WATER & POWER) gets that merchant's spend, wherever
//      those transactions happen to be categorized.
//   2. shared   — whatever is left in a subcategory is compared against the
//      lines in it that didn't match a merchant, as a group.
// Nothing is written here; applying a suggestion is an ordinary budget edit.

const { db } = require('./database');
const { normalizeMerchant } = require('./merchantRules');
const { loadTrips, makeTripResolver, TRAVEL_SUBCATEGORY } = require('./trips');
const { linesForYear } = require('./budgetEnvelopes');

const pad = n => String(n).padStart(2, '0');
const SEP = '::';

const isSpend = e =>
  !e.is_transfer && !e.is_credit_card_payment && e.date &&
  e.category !== 'Income' && e.category !== 'Taxes' && e.category !== 'Credit Card Payment';

// Round a suggestion to a number a person would actually budget.
function roundNice(x) {
  if (x <= 0) return 0;
  const step = x < 50 ? 1 : x < 200 ? 5 : x < 1000 ? 10 : 25;
  return Math.max(step, Math.round(x / step) * step);
}

// 'over' = spending more than planned, 'under' = budget has slack, 'ok' = close.
function compare(budget, actual) {
  const tolerance = Math.max(10, budget * 0.1);
  if (Math.abs(actual - budget) <= tolerance) return 'ok';
  return actual > budget ? 'over' : 'under';
}

// Whole-word matching between a budget line's name and a merchant name:
// one side's words must all appear in the other. Names too generic to
// identify a merchant never match.
const GENERIC = new Set(['OTHER', 'CASH', 'MISC', 'MISCELLANEOUS', 'GENERAL', 'FEES', 'FEE', 'SHOPPING', 'TRAVEL', 'FOOD', 'DINING', 'GROCERIES', 'RENT', 'INSURANCE']);
const tokens = name => normalizeMerchant(String(name || '').replace(/\bgeneral\b/ig, ''))
  .split(/[^A-Z0-9']+/).filter(t => t.length >= 2 && t !== 'THE' && t !== 'AND');
function namesMatch(a, b) {
  if (a.length === 0 || b.length === 0) return false;
  const [small, big] = a.length <= b.length ? [a, b] : [b, a];
  if (small.join('').length < 4 || small.every(t => GENERIC.has(t))) return false;
  return small.every(t => big.includes(t));
}

function isActive(item, month) {
  if (item.status && item.status !== 'active') return false;
  if (item.startDate && item.startDate.substring(0, 7) > month) return false;
  if (item.endDate && item.endDate.substring(0, 7) < month) return false;
  return true;
}

async function getBudgetRecommendations(windowMonths = 12, now = new Date(), planYear) {
  const n = windowMonths === 6 ? 6 : 12;
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-based; the current month is excluded (incomplete)
  const currentMonth = `${y}-${pad(m + 1)}`;
  const startD = new Date(y, m - n, 1);
  const endD = new Date(y, m, 0);
  const startDate = `${startD.getFullYear()}-${pad(startD.getMonth() + 1)}-01`;
  const endDate = `${endD.getFullYear()}-${pad(endD.getMonth() + 1)}-${pad(endD.getDate())}`;

  const [expSnap, itemSnap, trips] = await Promise.all([
    db.collection('expenses').where('date', '>=', startDate).where('date', '<=', endDate).get(),
    db.collection('budget_items').get(),
    loadTrips(),
  ]);
  // Compare against one plan year's lines: this year's by default, or a
  // future year's draft (judged as of its January).
  const year = planYear || y;
  const refMonth = year > y ? `${year}-01` : currentMonth;
  const items = linesForYear(itemSnap.docs.map(d => ({ id: d.id, ...d.data() })), year).filter(i => isActive(i, refMonth));

  // Spending on a trip is compared against the travel budget line, not the
  // everyday line for its category — so vacation dinners don't make the
  // dining budget look too small.
  const tripOf = makeTripResolver(trips);
  const travelLine = items.find(i => i.secondaryCategory === TRAVEL_SUBCATEGORY);
  const travelMain = travelLine ? travelLine.mainCategory : 'Discretionary';
  const expenses = expSnap.docs.map(d => d.data()).filter(isSpend)
    .map(e => (tripOf(e) ? { ...e, category: travelMain, subcategory: TRAVEL_SUBCATEGORY } : e));

  // History may be shorter than the window; average over the months that
  // exist (first month with any spend → last complete month).
  const firstMonth = expenses.reduce((min, e) => (e.date.slice(0, 7) < min ? e.date.slice(0, 7) : min), endDate.slice(0, 7));
  const monthsUsed = Math.max(1,
    (Number(endDate.slice(0, 4)) - Number(firstMonth.slice(0, 4))) * 12
    + Number(endDate.slice(5, 7)) - Number(firstMonth.slice(5, 7)) + 1);
  const recentCut = (() => {
    const d = new Date(y, m - 3, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
  })();
  const recentMonths = Math.min(3, monthsUsed);

  // Actuals per subcategory, and per merchant within it.
  const subs = {};
  const subOf = (category, subcategory) => {
    const key = `${category}${SEP}${subcategory}`;
    return (subs[key] = subs[key] || { key, category, subcategory, total: 0, recent: 0, months: new Set(), matched: 0, items: [] });
  };
  const merchants = {}; // normalized name → { name, tokens, total, bySub: { subKey: total } }
  expenses.forEach(e => {
    const s = subOf(e.category || 'Uncategorized', e.subcategory || 'Uncategorized');
    const amount = e.amount || 0;
    s.total += amount;
    if (e.date >= recentCut) s.recent += amount;
    s.months.add(e.date.slice(0, 7));
    const mk = normalizeMerchant(e.merchant || e.description || '');
    if (mk) {
      const mm = (merchants[mk] = merchants[mk] || { name: e.merchant || e.description, tokens: tokens(mk), total: 0, bySub: {} });
      mm.total += amount;
      mm.bySub[s.key] = (mm.bySub[s.key] || 0) + amount;
    }
  });
  items.forEach(i => subOf(i.mainCategory || 'Uncategorized', i.secondaryCategory || 'General').items.push(i));

  const itemResults = {};

  // 1. Lines that name a merchant. A merchant is claimed by one line only;
  //    its spend is then taken out of the "shared" remainder of whichever
  //    subcategories it was categorized under.
  const claimed = new Set();
  const sharedBySub = {};
  Object.values(subs).forEach(s => {
    sharedBySub[s.key] = [];
    s.items.forEach(item => {
      const key = tokens(item.itemName);
      const hits = Object.entries(merchants).filter(([mk, v]) => !claimed.has(mk) && namesMatch(key, v.tokens));
      if (hits.length === 0) { sharedBySub[s.key].push(item); return; }
      hits.forEach(([mk, v]) => {
        claimed.add(mk);
        Object.entries(v.bySub).forEach(([subKey, amt]) => { subs[subKey].matched += amt; });
      });
      const total = hits.reduce((sum, [, v]) => sum + v.total, 0);
      const lineActual = total / monthsUsed;
      const lineBudget = Number(item.monthlyExpectedSpend) || 0;
      itemResults[item.id] = {
        basis: 'merchant',
        merchants: hits.map(([, v]) => v.name),
        budget_monthly: lineBudget,
        actual_monthly: lineActual,
        suggested_monthly: roundNice(lineActual),
        status: compare(lineBudget, lineActual),
        group_size: 1,
      };
    });
  });

  const subcategories = Object.values(subs).map(s => {
    const actual = s.total / monthsUsed;
    const budget = s.items.reduce((sum, i) => sum + (Number(i.monthlyExpectedSpend) || 0), 0);
    const shared = sharedBySub[s.key];

    // 2. Everything else in the subcategory, against the remaining lines.
    const restActual = Math.max(0, s.total - s.matched) / monthsUsed;
    const restBudget = shared.reduce((sum, i) => sum + (Number(i.monthlyExpectedSpend) || 0), 0);
    const restSuggested = roundNice(restActual);
    shared.forEach(item => {
      const lineBudget = Number(item.monthlyExpectedSpend) || 0;
      itemResults[item.id] = {
        basis: 'shared',
        merchants: [],
        budget_monthly: restBudget,          // the group's budget
        actual_monthly: restActual,          // the group's actual
        // This line's amount if it alone absorbed the group's difference.
        suggested_monthly: roundNice(Math.max(0, lineBudget + (restSuggested - restBudget))),
        status: compare(restBudget, restActual),
        group_size: shared.length,
      };
    });

    return {
      category: s.category,
      subcategory: s.subcategory,
      budget_monthly: budget,
      actual_monthly: actual,
      recent_monthly: s.recent / recentMonths,
      months_with_spend: s.months.size,
      suggested_monthly: roundNice(actual),
      status: s.items.length === 0 ? 'unbudgeted' : compare(budget, actual),
      line_count: s.items.length,
    };
  }).filter(s => s.budget_monthly > 0 || s.actual_monthly >= 1)
    .sort((a, b) => Math.abs(b.actual_monthly - b.budget_monthly) - Math.abs(a.actual_monthly - a.budget_monthly));

  const sum = f => subcategories.reduce((t, s) => t + f(s), 0);
  return {
    window: { requested_months: n, months_used: monthsUsed, start: firstMonth, end: endDate.slice(0, 7) },
    totals: {
      budget_monthly: sum(s => s.budget_monthly),
      actual_monthly: sum(s => s.actual_monthly),
      suggested_monthly: sum(s => s.suggested_monthly),
    },
    subcategories,
    items: itemResults,
  };
}

module.exports = { getBudgetRecommendations };
