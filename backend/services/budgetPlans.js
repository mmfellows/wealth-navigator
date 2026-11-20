// Year plans.
//
// A plan is what you expect a calendar year to look like: the monthly budget
// lines for that year (budget_items with plan_year), the trips and special
// one-off expenses dated in it, and planned income. One document per year in
// `budget_plans` holds the planned income and, once the year is under way, a
// frozen copy of the plan as it stood when it went live — so later edits to
// the budget never rewrite "what I thought this year would be".
//
//   draft  a future year you are still shaping
//   live   the current year; its lines are what pacing and the reports use
//   past   an earlier year
//
// A plan goes live by date alone: from January 1 the envelopes read that
// year's lines (see linesForYear). The frozen copy is taken the first time
// the plan is read on or after that date (the daily cron guarantees this).

const { db, docToObj } = require('./database');
const { loadEnvelopeSources, computeEnvelopes, linesForYear, isActiveForMonth } = require('./budgetEnvelopes');
const { makeTripResolver, effectiveCategory, tripBudgetInMonth, isSpendRow, isTravelBudgetItem, TRIPS_CATEGORY } = require('./trips');

const pad = n => String(n).padStart(2, '0');
const monthsOf = year => Array.from({ length: 12 }, (_, i) => `${year}-${pad(i + 1)}`);
const round2 = n => Math.round(n * 100) / 100;

const planRef = year => db.collection('budget_plans').doc(String(year));

async function loadPlanDoc(year) {
  const doc = await planRef(year).get();
  return doc.exists ? docToObj(doc) : null;
}

// Planned income for one month from the plan's income lines:
// { name, amount, frequency: 'monthly' | 'once', month: 'YYYY-MM' (once only) }
function incomeForMonth(incomeLines, month) {
  return (incomeLines || []).reduce((sum, l) => {
    const amount = Number(l.amount) || 0;
    if (l.frequency === 'once') return sum + (l.month === month ? amount : 0);
    return sum + amount;
  }, 0);
}

function validateIncomeLines(year, lines) {
  if (!Array.isArray(lines)) return { error: 'income_lines must be an array' };
  const out = [];
  for (const l of lines) {
    const name = String(l.name || '').trim();
    const amount = Number(l.amount);
    const frequency = l.frequency === 'once' ? 'once' : 'monthly';
    if (!name) return { error: 'Each income line needs a name' };
    if (!Number.isFinite(amount) || amount < 0) return { error: `Amount for "${name}" must be a positive number` };
    if (frequency === 'once' && !new RegExp(`^${year}-(0[1-9]|1[0-2])$`).test(l.month || '')) {
      return { error: `"${name}" needs a month in ${year}` };
    }
    out.push({ name, amount, frequency, month: frequency === 'once' ? l.month : null });
  }
  return { data: out };
}

const statusOf = (year, hasOwnLines, now) => {
  const cy = now.getFullYear();
  if (year > cy) return hasOwnLines ? 'draft' : 'not_started';
  return year === cy ? 'live' : 'past';
};

// Everything the plan page needs for one year.
async function buildPlanView(year, now = new Date()) {
  const cy = now.getFullYear();
  const currentMonth = `${cy}-${pad(now.getMonth() + 1)}`;
  const months = monthsOf(year);

  const [sources, plan, expSnap] = await Promise.all([
    loadEnvelopeSources(),
    loadPlanDoc(year),
    db.collection('expenses').where('date', '>=', `${year - 1}-01-01`).where('date', '<=', `${year}-12-31`).get(),
  ]);

  const tripOf = makeTripResolver(sources.trips);
  const actual = {}; // month → { spend, income, byCategory }
  expSnap.docs.forEach(d => {
    const e = d.data();
    if (e.is_transfer || !e.date) return;
    const m = (actual[e.date.slice(0, 7)] = actual[e.date.slice(0, 7)] || { spend: 0, income: 0, byCategory: {} });
    if (e.category === 'Income') { m.income += -e.amount; return; }
    if (!isSpendRow(e)) return;
    const cat = effectiveCategory(e, tripOf) || 'Uncategorized';
    m.spend += e.amount || 0;
    m.byCategory[cat] = (m.byCategory[cat] || 0) + (e.amount || 0);
  });

  const incomeLines = plan?.income_lines || [];
  const categoryTotals = {};
  const monthRows = months.map(month => {
    const env = computeEnvelopes(sources, month);
    const byCategory = {};
    Object.entries(env.byCategory).forEach(([cat, v]) => {
      if (v.total <= 0) return;
      byCategory[cat] = round2(v.total);
      categoryTotals[cat] = (categoryTotals[cat] || 0) + v.total;
    });
    const lastYear = actual[`${year - 1}-${month.slice(5)}`];
    const thisYear = month <= currentMonth ? actual[month] : null;
    return {
      month,
      budget_total: round2(env.total),
      budget_by_category: byCategory,
      income_planned: incomeLines.length ? round2(incomeForMonth(incomeLines, month)) : null,
      special: sources.planned.filter(p => p.month === month).map(p => ({ name: p.name, amount: p.amount })),
      trips: sources.trips
        .filter(t => t.start_date.slice(0, 7) <= month && t.end_date.slice(0, 7) >= month)
        .map(t => ({ name: t.name, budget_share: round2(tripBudgetInMonth(t, month)) })),
      actual_spend: thisYear ? round2(thisYear.spend) : null,
      actual_income: thisYear ? round2(thisYear.income) : null,
      actual_complete: month < currentMonth,
      last_year_spend: lastYear ? round2(lastYear.spend) : null,
      last_year_income: lastYear ? round2(lastYear.income) : null,
    };
  });

  const lines = linesForYear(sources.items, year).filter(i => !i.status || i.status === 'active');
  const hasOwnLines = sources.items.some(i => i.plan_year === year);
  const sum = f => monthRows.reduce((t, r) => t + (f(r) || 0), 0);
  const budgetTotal = sum(r => r.budget_total);
  const incomeTotal = incomeLines.length ? sum(r => r.income_planned) : null;
  const elapsed = monthRows.filter(r => r.actual_spend !== null);

  return {
    year,
    status: statusOf(year, hasOwnLines, now),
    has_own_lines: hasOwnLines,
    inherits_from: hasOwnLines ? null : (lines[0]?.plan_year || 'earlier budget'),
    months: monthRows,
    categories: Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).map(([name, total]) => ({ name, total: round2(total) })),
    totals: {
      budget: round2(budgetTotal),
      income_planned: incomeTotal === null ? null : round2(incomeTotal),
      savings_planned: incomeTotal === null ? null : round2(incomeTotal - budgetTotal),
      last_year_spend: round2(sum(r => r.last_year_spend)),
      last_year_months: monthRows.filter(r => r.last_year_spend !== null).length,
      actual_spend: round2(sum(r => r.actual_spend)),
      actual_income: round2(sum(r => r.actual_income)),
      actual_months: elapsed.length,
      budget_to_date: round2(elapsed.reduce((t, r) => t + r.budget_total, 0)),
    },
    income_lines: incomeLines,
    lines_by_category: Object.values(lines.reduce((acc, i) => {
      const k = isTravelBudgetItem(i) ? TRIPS_CATEGORY : (i.mainCategory || 'Uncategorized');
      acc[k] = acc[k] || { category: k, monthly: 0, lines: 0 };
      acc[k].monthly += Number(i.monthlyExpectedSpend) || 0;
      acc[k].lines += 1;
      return acc;
    }, {})).sort((a, b) => b.monthly - a.monthly),
    line_count: lines.length,
    trips: sources.trips.filter(t => t.start_date.slice(0, 4) === String(year))
      .map(t => ({ id: t.id, name: t.name, start_date: t.start_date, end_date: t.end_date, budget: t.budget || null })),
    special_total: round2(sources.planned.filter(p => String(p.month).startsWith(`${year}-`)).reduce((t, p) => t + (Number(p.amount) || 0), 0)),
    original: plan?.frozen ? {
      at: plan.frozen.at,
      note: plan.frozen.note || null,
      totals: plan.frozen.totals,
      months: plan.frozen.months,
    } : null,
  };
}

// The frozen copy: taken once, when a plan is first read as the live year.
async function ensureFrozen(year, now = new Date()) {
  if (year !== now.getFullYear()) return false;
  const plan = await loadPlanDoc(year);
  if (plan?.frozen) return false;

  const [view, sources] = await Promise.all([buildPlanView(year, now), loadEnvelopeSources()]);
  const startedLate = now.getMonth() > 0 || now.getDate() > 1;
  const frozen = {
    at: now.toISOString(),
    note: startedLate ? 'Saved part-way through the year, when plans were first recorded.' : null,
    lines: linesForYear(sources.items, year)
      .filter(i => !i.status || i.status === 'active')
      .map(i => ({
        itemName: i.itemName, mainCategory: i.mainCategory, secondaryCategory: i.secondaryCategory,
        frequency: i.frequency, amount: i.amount, monthlyExpectedSpend: i.monthlyExpectedSpend,
      })),
    income_lines: view.income_lines,
    trips: view.trips,
    special: sources.planned.filter(p => String(p.month).startsWith(`${year}-`))
      .map(p => ({ name: p.name, amount: p.amount, month: p.month, category: p.category || null })),
    months: view.months.map(m => ({
      month: m.month, budget_total: m.budget_total, budget_by_category: m.budget_by_category, income_planned: m.income_planned,
    })),
    totals: { budget: view.totals.budget, income_planned: view.totals.income_planned, savings_planned: view.totals.savings_planned },
  };
  await planRef(year).set({ year, frozen, updated_at: now.toISOString() }, { merge: true });
  return true;
}

// Start a future year's plan as a copy of the budget it would otherwise
// inherit, with planned income seeded from the last 12 months' average.
async function startPlan(year, now = new Date()) {
  const cy = now.getFullYear();
  if (year <= cy) return { error: `${year} is already under way; edit its budget directly.` };
  if (year > cy + 2) return { error: 'Plans can be started up to two years ahead.' };

  const itemSnap = await db.collection('budget_items').get();
  const all = itemSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (all.some(i => i.plan_year === year)) return { error: `A ${year} plan already exists.` };

  const source = linesForYear(all, year).filter(i => isActiveForMonth(i, `${year}-01`));
  const stamp = now.toISOString();
  const batch = db.batch();
  source.forEach(i => {
    const { id, ...rest } = i;
    batch.set(db.collection('budget_items').doc(), {
      ...rest,
      plan_year: year,
      copied_from: id,
      startDate: `${year}-01-01`,
      endDate: null,
      status: 'active',
      archivedDate: null,
      priceHistory: [],
      created_at: stamp,
      updated_at: stamp,
    });
  });

  // Seed planned income from the trailing 12 complete months.
  const start = new Date(now.getFullYear(), now.getMonth() - 12, 1);
  const startDate = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-01`;
  const endDate = `${cy}-${pad(now.getMonth() + 1)}-01`;
  const incSnap = await db.collection('expenses').where('date', '>=', startDate).where('date', '<', endDate).get();
  const byMonth = {};
  incSnap.docs.forEach(d => {
    const e = d.data();
    if (e.is_transfer || e.category !== 'Income') return;
    byMonth[e.date.slice(0, 7)] = (byMonth[e.date.slice(0, 7)] || 0) + -e.amount;
  });
  const monthsWithIncome = Object.keys(byMonth).length;
  const avgIncome = monthsWithIncome ? Object.values(byMonth).reduce((a, b) => a + b, 0) / monthsWithIncome : 0;
  const existing = await loadPlanDoc(year);
  const income_lines = existing?.income_lines?.length ? existing.income_lines : (avgIncome > 0
    ? [{ name: `Income (average of the last ${monthsWithIncome} months)`, amount: Math.round(avgIncome / 50) * 50, frequency: 'monthly', month: null }]
    : []);

  batch.set(planRef(year), { year, income_lines, started_at: stamp, updated_at: stamp }, { merge: true });
  await batch.commit();
  return { copied: source.length };
}

// Throw away a future year's draft (its lines and planned income).
async function discardPlan(year, now = new Date()) {
  if (year <= now.getFullYear()) return { error: 'Only a future year\'s draft can be discarded.' };
  const snap = await db.collection('budget_items').where('plan_year', '==', year).get();
  const batch = db.batch();
  snap.docs.forEach(d => batch.delete(d.ref));
  batch.delete(planRef(year));
  await batch.commit();
  return { deleted: snap.size };
}

async function saveIncomeLines(year, lines) {
  const { error, data } = validateIncomeLines(year, lines);
  if (error) return { error };
  await planRef(year).set({ year, income_lines: data, updated_at: new Date().toISOString() }, { merge: true });
  return { income_lines: data };
}

module.exports = { buildPlanView, ensureFrozen, startPlan, discardPlan, saveIncomeLines, incomeForMonth };
