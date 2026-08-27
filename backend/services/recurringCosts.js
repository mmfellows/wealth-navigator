// Recurring-cost detection over the user's own transaction history.
// (Home-grown rather than Plaid's /transactions/recurring/get so it works
// across every linked institution and needs no extra Plaid product consent.)
//
// A merchant is "recurring" when it shows up in enough distinct months of
// the lookback window with a stable charge amount — subscriptions, bills,
// rent. A recurring merchant whose first-ever appearance is recent is a
// *new* recurring cost, the highest-priority radar item.

const { db } = require('./database');
const { normalizeMerchant } = require('./merchantRules');

const LOOKBACK_MONTHS = 6;
const MIN_DISTINCT_MONTHS = 3;
const AMOUNT_STABILITY = 0.25; // median absolute deviation / median
const NEW_WITHIN_DAYS = 60;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Returns [{merchant, merchant_key, category, subcategory, occurrences,
//   distinct_months, median_amount, monthly_cost, first_date, last_date, is_new}]
// sorted by monthly cost, largest first.
async function detectRecurringCosts() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - LOOKBACK_MONTHS, 1);
  const startDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`;

  const snapshot = await db.collection('expenses')
    .where('date', '>=', startDate)
    .get();

  const groups = new Map();
  snapshot.docs.forEach(doc => {
    const e = doc.data();
    if (e.is_transfer || e.category === 'Income' || e.category === 'Taxes'
      || e.category === 'Credit Card Payment' || !(e.amount > 0)) return;
    const key = normalizeMerchant(e.merchant || e.description);
    if (!key) return;
    const g = groups.get(key) || { rows: [], merchant: e.merchant };
    g.rows.push(e);
    groups.set(key, g);
  });

  const monthsInWindow = LOOKBACK_MONTHS;
  const results = [];
  const newCutoff = new Date(now.getTime() - NEW_WITHIN_DAYS * 24 * 3600 * 1000)
    .toISOString().substring(0, 10);

  for (const [key, g] of groups.entries()) {
    const months = new Set(g.rows.map(e => e.date.substring(0, 7)));
    if (months.size < MIN_DISTINCT_MONTHS) continue;

    const amounts = g.rows.map(e => e.amount);
    const med = median(amounts);
    if (med <= 0) continue;
    const mad = median(amounts.map(a => Math.abs(a - med)));
    if (mad / med > AMOUNT_STABILITY) continue;

    const dates = g.rows.map(e => e.date).sort();
    const total = amounts.reduce((s, a) => s + a, 0);
    const sample = g.rows[g.rows.length - 1];
    results.push({
      merchant: sample.merchant || g.merchant,
      merchant_key: key,
      category: sample.category || null,
      subcategory: sample.subcategory || null,
      occurrences: g.rows.length,
      distinct_months: months.size,
      median_amount: med,
      monthly_cost: total / monthsInWindow,
      first_date: dates[0],
      last_date: dates[dates.length - 1],
      is_new: dates[0] >= newCutoff,
    });
  }

  return results.sort((a, b) => b.monthly_cost - a.monthly_cost);
}

module.exports = { detectRecurringCosts };
