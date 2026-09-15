// sync_logs writer shared by the user-facing Plaid routes, the webhook
// handler and the scheduled cron. Until 2026-09-15 this lived as a private
// helper inside routes/plaid.js, so the cron path (routes/internal.js ->
// plaidService.syncAllUsers) could not reach it and every scheduled run went
// unlogged.

const { db } = require('./database');

// Append one row. `extra` is merged in as-is (e.g. { metadata: {...} }).
async function addSyncLog(userId, syncType, status, message, extra = {}) {
  await db.collection('sync_logs').add({
    user_id: userId,
    sync_type: syncType,
    status,
    message,
    ...extra,
    created_at: new Date().toISOString(),
  });
}

// Roll up an array of plaidService.syncItem results into the totals the
// manual /api/plaid/sync route has always logged, plus a list of failed
// streams so a partial failure is visible in the log rather than silent.
function summarizeItemResults(itemResults) {
  const totals = { institutions: itemResults.length, accounts: 0, transactions: 0, holdings: 0, investment_txns: 0, liabilities: 0 };
  const failures = [];
  for (const r of itemResults) {
    const s = r.streams || {};
    totals.accounts += s.accounts?.count || 0;
    totals.transactions += s.transactions?.added || 0;
    totals.holdings += s.holdings?.holdings || 0;
    totals.investment_txns += s.investment_transactions?.added || 0;
    totals.liabilities += s.liabilities?.total || 0;
    for (const [stream, val] of Object.entries(s)) {
      if (val && val.success === false) failures.push({ institution: r.institution, stream, error: val.error });
    }
  }
  const message = `${totals.institutions} institutions: ${totals.accounts} accounts, ${totals.transactions} txns, `
    + `${totals.holdings} holdings, ${totals.investment_txns} inv txns, ${totals.liabilities} liabilities`
    + (failures.length ? `; ${failures.length} stream failure${failures.length === 1 ? '' : 's'}: `
      + failures.map(f => `${f.institution}/${f.stream}: ${f.error}`).join('; ') : '');
  return { totals, failures, message };
}

module.exports = { addSyncLog, summarizeItemResults };
