// Category budget "envelopes", derived from budget line items.
//
// The budget system stores line items (budget_items) with a
// monthlyExpectedSpend each; the monthly envelope for a category is the sum
// of its active items. Derived here in one place so monthly close, weekly
// pacing, the burn strip, and the quarterly review all agree — there is no
// parallel category-level budget store.

const { db } = require('./database');

function isActiveForMonth(item, month) {
  if (item.status && item.status !== 'active') return false;
  if (month) {
    if (item.startDate && item.startDate.substring(0, 7) > month) return false;
    if (item.endDate && item.endDate.substring(0, 7) < month) return false;
  }
  return true;
}

// Returns { total, byCategory: { [main]: { total, bySubcategory: { [sub]: total } } } }
// for the given month ('YYYY-MM'; defaults to items active today).
async function getCategoryEnvelopes(month) {
  const snapshot = await db.collection('budget_items').get();
  const byCategory = {};
  let total = 0;

  snapshot.docs.forEach(doc => {
    const item = doc.data();
    if (!isActiveForMonth(item, month)) return;
    const monthly = Number(item.monthlyExpectedSpend) || 0;
    const main = item.mainCategory || 'Uncategorized';
    const sub = item.secondaryCategory || 'General';

    if (!byCategory[main]) byCategory[main] = { total: 0, bySubcategory: {} };
    byCategory[main].total += monthly;
    byCategory[main].bySubcategory[sub] = (byCategory[main].bySubcategory[sub] || 0) + monthly;
    total += monthly;
  });

  return { total, byCategory };
}

module.exports = { getCategoryEnvelopes };
