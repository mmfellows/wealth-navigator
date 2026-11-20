// Category budget "envelopes", derived from budget line items.
//
// The budget system stores line items (budget_items) with a
// monthlyExpectedSpend each; the monthly envelope for a category is the sum
// of its active items, plus any one-off planned costs (planned_costs) dated
// in that month. Derived here in one place so monthly close, weekly pacing,
// the burn strip, the emailed reports, and the quarterly review all agree —
// there is no parallel category-level budget store.

const { db } = require('./database');
const { TRIPS_CATEGORY, isTravelBudgetItem, tripBudgetInMonth, loadTrips } = require('./trips');

// Budget lines belong to a plan year. Lines created before plan years
// existed carry no plan_year; they are the budget for every year up to the
// first explicitly planned one. A year without its own plan uses the most
// recent earlier plan, so the budget carries forward until it is re-planned.
function linesForYear(items, year) {
  const planned = [...new Set(items.map(i => i.plan_year).filter(Boolean))].sort((a, b) => a - b);
  const usable = planned.filter(y => y <= year);
  const planYear = usable.length ? usable[usable.length - 1] : null;
  return items.filter(i => (i.plan_year || null) === planYear);
}

function isActiveForMonth(item, month) {
  if (item.status && item.status !== 'active') return false;
  if (month) {
    if (item.startDate && item.startDate.substring(0, 7) > month) return false;
    if (item.endDate && item.endDate.substring(0, 7) < month) return false;
  }
  return true;
}

// Read the raw inputs once; computeEnvelopes() can then be called for many
// months without re-reading (the period reports need up to 24).
async function loadEnvelopeSources() {
  const [itemsSnap, plannedSnap, trips] = await Promise.all([
    db.collection('budget_items').get(),
    db.collection('planned_costs').get(),
    loadTrips(),
  ]);
  return {
    trips,
    items: itemsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    planned: plannedSnap.docs.map(d => ({ id: d.id, ...d.data() })),
  };
}

// Returns { total, plannedTotal, byCategory: { [main]: { total, planned,
// bySubcategory: { [sub]: total } } } } for the given month ('YYYY-MM').
// Without a month: recurring items active today, no planned costs.
function computeEnvelopes({ items, planned, trips = [] }, month) {
  const byCategory = {};
  let total = 0;
  let plannedTotal = 0;
  const bucket = main => (byCategory[main] = byCategory[main] || { total: 0, planned: 0, bySubcategory: {} });
  const year = month ? Number(month.slice(0, 4)) : new Date().getFullYear();

  linesForYear(items, year).forEach(item => {
    if (!isActiveForMonth(item, month)) return;
    const monthly = Number(item.monthlyExpectedSpend) || 0;
    // The travel line funds the trips bucket, not its nominal main category.
    const b = bucket(isTravelBudgetItem(item) ? TRIPS_CATEGORY : (item.mainCategory || 'Uncategorized'));
    const sub = item.secondaryCategory || 'General';
    b.total += monthly;
    b.bySubcategory[sub] = (b.bySubcategory[sub] || 0) + monthly;
    total += monthly;
  });

  if (month) {
    planned.forEach(p => {
      if (p.month !== month) return;
      const amount = Number(p.amount) || 0;
      const b = bucket(p.category || 'Special Expense');
      const sub = p.subcategory || 'Planned';
      b.total += amount;
      b.planned += amount;
      b.bySubcategory[sub] = (b.bySubcategory[sub] || 0) + amount;
      total += amount;
      plannedTotal += amount;
    });
  }

  // A month with a budgeted trip uses the trip's own budget (pro-rated by
  // days) for the trips bucket, in place of the monthly travel line.
  if (month) {
    const tripBudget = trips.reduce((sum, t) => sum + tripBudgetInMonth(t, month), 0);
    if (tripBudget > 0) {
      const b = bucket(TRIPS_CATEGORY);
      total += tripBudget - b.total;
      b.total = tripBudget;
      b.bySubcategory = { Trips: tripBudget };
    }
  }

  return { total, plannedTotal, byCategory };
}

async function getCategoryEnvelopes(month) {
  return computeEnvelopes(await loadEnvelopeSources(), month);
}

module.exports = { getCategoryEnvelopes, loadEnvelopeSources, computeEnvelopes, linesForYear, isActiveForMonth };
