// "What this plan may be missing": a checklist comparing one year's plan with
// the last 12 months of actual spending. Read-only; each finding carries what
// the page needs to fix it in one click (add a line, raise a line, add a
// special expense), or says where to go when the fix is a judgement call.
//
//   travel       the plan's travel is far below what was actually spent
//   unbudgeted   spending in a subcategory with no budget line
//   low          a subcategory budgeted below what is actually spent
//   idle         budget lines whose subcategory had no transactions at all —
//                usually the spending is filed under a different subcategory
//   recurring    regular charges with no line of their own, inside a
//                subcategory that is already over or unbudgeted
//   yearly       charges seen in only one or two months (fees, memberships,
//                registrations): easy to forget, best planned for the month
//                they fall due

const { db } = require('./database');
const { getBudgetRecommendations, namesMatch, nameTokens } = require('./budgetRecommendations');
const { detectRecurringCosts } = require('./recurringCosts');
const { normalizeMerchant } = require('./merchantRules');
const { linesForYear } = require('./budgetEnvelopes');
const { buildPlanView } = require('./budgetPlans');
const { loadTrips, makeTripResolver, isSpendRow, effectiveCategory, TRIPS_CATEGORY } = require('./trips');

const pad = n => String(n).padStart(2, '0');
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// One-off purchases in these subcategories are ordinary lumpy spending, not
// yearly obligations; they are summarized instead of listed.
const LUMPY_SUBCATEGORIES = new Set(['Food & Dining', 'Shopping', 'Entertainment', 'Groceries', 'Travel & Vacation', 'Gifts', 'Charity']);
// Never yearly obligations in their own right (monthly bills under a variant
// name, fuel, cash).
const IGNORED_SUBCATEGORIES = new Set(['Housing', 'Utilities', 'Rideshares', 'Cash']);
const YEARLY_WORDS = /ANNUAL|MEMBERSHIP|RENEW|REGISTRATION|\bDMV\b|\bFEE\b|SUBSCRIPTION|INSURANCE|LICENSE/i;

async function getPlanGaps(year, now = new Date()) {
  const cy = now.getFullYear();
  const [recs, view, itemSnap, plannedSnap, recurring, trips] = await Promise.all([
    getBudgetRecommendations(12, now, year),
    buildPlanView(year, now),
    db.collection('budget_items').get(),
    db.collection('planned_costs').get(),
    detectRecurringCosts().catch(() => []),
    loadTrips(),
  ]);

  const refMonth = year > cy ? `${year}-01` : `${cy}-${pad(now.getMonth() + 1)}`;
  const lines = linesForYear(itemSnap.docs.map(d => ({ id: d.id, ...d.data() })), year)
    .filter(i => (!i.status || i.status === 'active') && (!i.endDate || i.endDate.slice(0, 7) >= refMonth));
  const linesIn = (category, subcategory) => lines.filter(i => i.mainCategory === category && i.secondaryCategory === subcategory);
  const lineTokens = lines.map(i => nameTokens(i.itemName));
  const hasLineFor = merchant => { const t = nameTokens(merchant); return lineTokens.some(lt => namesMatch(lt, t)); };
  const planned = plannedSnap.docs.map(d => d.data()).filter(p => String(p.month).startsWith(`${year}-`));

  // ---- travel ----
  const travelSub = recs.subcategories.find(s => s.subcategory === 'Travel & Vacation');
  const actualTravelYear = travelSub ? travelSub.actual_monthly * 12 : 0;
  const plannedTravelYear = (view.categories.find(c => c.name === TRIPS_CATEGORY) || { total: 0 }).total;
  const travel = actualTravelYear >= 1000 && plannedTravelYear < actualTravelYear * 0.7 ? {
    planned_year: Math.round(plannedTravelYear),
    actual_year: Math.round(actualTravelYear),
    gap_year: Math.round(actualTravelYear - plannedTravelYear),
    trips_planned: view.trips.length,
  } : null;

  // ---- unbudgeted / low / idle ----
  const unbudgeted = [];
  const low = [];
  const idle = [];
  recs.subcategories.forEach(s => {
    if (s.subcategory === 'Travel & Vacation') return; // covered by `travel`
    const base = { category: s.category, subcategory: s.subcategory, budget_monthly: Math.round(s.budget_monthly), actual_monthly: Math.round(s.actual_monthly), suggested_monthly: s.suggested_monthly };
    if (s.status === 'unbudgeted') {
      if (s.actual_monthly >= 10) unbudgeted.push(base);
    } else if (s.status === 'over') {
      // One click: the biggest general line in the subcategory absorbs the
      // gap. A line named after one merchant (Spotify) is left alone; if every
      // line is like that, the fix is a new catch-all line for the difference.
      const gap = Math.round(s.suggested_monthly - s.budget_monthly);
      const subLines = linesIn(s.category, s.subcategory);
      const subWords = new Set(nameTokens(s.subcategory));
      const isGeneral = i => subLines.length === 1
        || /general|other|misc|\ball\b/i.test(i.itemName)
        || nameTokens(i.itemName).some(t => subWords.has(t));
      const target = subLines
        .filter(i => recs.items[i.id]?.basis !== 'merchant' && isGeneral(i))
        .sort((a, b) => (b.monthlyExpectedSpend || 0) - (a.monthlyExpectedSpend || 0))[0];
      low.push({
        ...base,
        fix: target ? {
          kind: 'raise', item_id: target.id, item_name: target.itemName, frequency: target.frequency,
          new_monthly: Math.max(0, Math.round((target.monthlyExpectedSpend || 0) + gap)),
        } : { kind: 'add', item_name: `Other ${s.subcategory}`, new_monthly: gap },
      });
    } else if (s.status === 'under' && s.months_with_spend === 0 && s.budget_monthly > 0) {
      idle.push({ ...base, lines: linesIn(s.category, s.subcategory).map(i => i.itemName) });
    }
  });

  // Where an idle line's spending probably went: merchants named like the
  // line, or — failing that — the subcategories with unbudgeted/over spending.
  const expSnap = await db.collection('expenses')
    .where('date', '>=', `${cy - 1}-${pad(now.getMonth() + 1)}-01`).get();
  const tripOf = makeTripResolver(trips);
  const spend = expSnap.docs.map(d => d.data()).filter(e => e.date && isSpendRow(e));
  const merchantHome = {}; // normalized merchant → { name, category, subcategory, total }
  spend.forEach(e => {
    const k = normalizeMerchant(e.merchant || e.description || '');
    if (!k) return;
    const m = (merchantHome[k] = merchantHome[k] || { name: e.merchant || e.description, category: e.category, subcategory: e.subcategory, total: 0 });
    m.total += e.amount || 0;
  });
  idle.forEach(row => {
    const tokensOfLines = row.lines.map(nameTokens);
    row.filed_elsewhere = Object.values(merchantHome)
      .filter(m => (m.category !== row.category || m.subcategory !== row.subcategory) && tokensOfLines.some(t => namesMatch(t, nameTokens(m.name))))
      .sort((a, b) => b.total - a.total).slice(0, 3)
      .map(m => ({ merchant: m.name, category: m.category, subcategory: m.subcategory, total: Math.round(m.total) }));
  });

  // ---- recurring charges with no line, in subcategories that are short ----
  const short = new Set([...unbudgeted, ...low].map(s => `${s.category}::${s.subcategory}`));
  const recurringFindings = recurring
    .filter(r => short.has(`${r.category}::${r.subcategory}`) && !hasLineFor(r.merchant) && r.monthly_cost >= 5)
    .map(r => ({
      merchant: r.merchant, category: r.category, subcategory: r.subcategory,
      monthly: Math.round(r.monthly_cost), months_seen: r.distinct_months,
    }));

  // ---- yearly / infrequent charges ----
  const byMerchant = {};
  spend.filter(e => (e.amount || 0) >= 50 && effectiveCategory(e, tripOf) !== TRIPS_CATEGORY).forEach(e => {
    const k = normalizeMerchant(e.merchant || e.description || '');
    if (k) (byMerchant[k] = byMerchant[k] || []).push(e);
  });
  const yearly = [];
  const lumpy = {};
  Object.values(byMerchant).forEach(group => {
    const months = [...new Set(group.map(e => e.date.slice(0, 7)))];
    if (months.length > 2) return;
    const total = group.reduce((s, e) => s + e.amount, 0);
    const first = group[0];
    const label = first.merchant || first.description || '';
    if (IGNORED_SUBCATEGORIES.has(first.subcategory)) return;
    if (LUMPY_SUBCATEGORIES.has(first.subcategory)) {
      lumpy[first.subcategory] = (lumpy[first.subcategory] || 0) + total;
      return;
    }
    if (hasLineFor(label)) return; // already a named line
    // A variant spelling of something that is really a regular charge.
    if (recurring.some(r => namesMatch(nameTokens(r.merchant), nameTokens(label)))) return;
    months.sort().forEach(m => {
      const inMonth = group.filter(e => e.date.slice(0, 7) === m);
      const amount = Math.round(inMonth.reduce((s, e) => s + e.amount, 0));
      const name = label;
      // Small charges only count when the name says they recur yearly.
      if (amount < 100 && !YEARLY_WORDS.test(`${label} ${first.statement || ''}`)) return;
      const dueMonth = `${year}-${m.slice(5)}`;
      const already = planned.some(p => p.month === dueMonth && namesMatch(nameTokens(p.name), nameTokens(name)));
      yearly.push({
        merchant: name, category: first.category, subcategory: first.subcategory,
        amount, last_charged: m, due_month: dueMonth, due_label: `${MONTH_NAMES[Number(m.slice(5)) - 1]} ${year}`,
        already_planned: already,
      });
    });
  });
  yearly.sort((a, b) => b.amount - a.amount);

  return {
    year,
    status: view.status,
    window: recs.window,
    plan: { budget: view.totals.budget, income_planned: view.totals.income_planned, savings_planned: view.totals.savings_planned },
    travel,
    unbudgeted,
    low,
    idle,
    recurring: recurringFindings,
    yearly: yearly.slice(0, 25),
    lumpy: Object.entries(lumpy).map(([subcategory, total]) => ({ subcategory, total: Math.round(total) })).sort((a, b) => b.total - a.total),
    count: (travel ? 1 : 0) + unbudgeted.length + low.length + idle.length + recurringFindings.length + yearly.filter(y => !y.already_planned).length,
  };
}

module.exports = { getPlanGaps };
