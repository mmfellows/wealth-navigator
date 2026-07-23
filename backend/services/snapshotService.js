// Net-worth snapshot logic — shared between the /api/snapshot route and the
// daily cron that writes balance_snapshots time-series rows.
//
// Single source of truth for "what does this user's balance sheet look like
// right now" so the dashboard total and the historical chart always agree.

const { db } = require('./database');
const stockService = require('./stockService');

const RETIREMENT_SUBTYPES = new Set([
  '401k', '401a', '403b', 'ira', 'roth', 'roth 401k',
  'sep ira', 'simple ira', 'sarsep', 'tsp', 'thrift savings plan',
  '529', 'hsa', 'pension', 'retirement',
]);

async function computeSnapshot(userId) {
  const [accountsSnap, holdingsSnap, securitiesSnap, liabilitiesSnap, manualSnap, betsSnap] = await Promise.all([
    db.collection('plaid_accounts').where('user_id', '==', userId).get(),
    db.collection('plaid_holdings').where('user_id', '==', userId).get(),
    db.collection('plaid_securities').where('user_id', '==', userId).get(),
    db.collection('plaid_liabilities').where('user_id', '==', userId).get(),
    db.collection('investments').where('user_id', '==', userId).get(),
    db.collection('bets').where('user_id', '==', userId).get(),
  ]);

  const securitiesById = new Map(securitiesSnap.docs.map(d => [d.data().security_id, d.data()]));
  const accountsById = new Map(accountsSnap.docs.map(d => [d.data().account_id, d.data()]));

  // Cash = depository balances
  let cash = 0;
  for (const doc of accountsSnap.docs) {
    const a = doc.data();
    if (a.type === 'depository') cash += a.balance_current || 0;
  }

  // Investments: Plaid holdings (institution_value already includes idle
  // brokerage cash as a cash-equivalent position, no double-count).
  let investmentsPlaid = 0;
  for (const doc of holdingsSnap.docs) {
    const h = doc.data();
    const value = h.institution_value
      ?? (h.institution_price != null && h.quantity != null ? h.institution_price * h.quantity : 0);
    investmentsPlaid += value || 0;
  }

  // Manual investments (off-platform). Best-effort live prices.
  const manualTickers = Array.from(new Set(
    manualSnap.docs.map(d => (d.data().ticker || '').toUpperCase()).filter(Boolean)
  ));
  let livePrices = {};
  if (manualTickers.length > 0) {
    try { livePrices = await stockService.getMultiplePrices(manualTickers); } catch { /* fall back to stored */ }
  }
  let investmentsManual = 0;
  for (const doc of manualSnap.docs) {
    const inv = doc.data();
    const price = livePrices[(inv.ticker || '').toUpperCase()] ?? inv.current_price ?? inv.purchase_price ?? 0;
    investmentsManual += (inv.shares || 0) * price;
  }

  // Liabilities by kind. Primary source is plaid_accounts (credit/loan
  // balances are always present there even when the item doesn't have the
  // Liabilities product enabled). plaid_liabilities rows only fill in
  // accounts we haven't already counted, so the two sources never double up.
  const liabilities = { credit: 0, student: 0, mortgage: 0, other: 0, total: 0 };
  const countedAccountIds = new Set();
  const addLiability = (kind, bal) => {
    const key = ['credit', 'student', 'mortgage'].includes(kind) ? kind : 'other';
    liabilities[key] += bal;
    liabilities.total += bal;
  };
  for (const doc of accountsSnap.docs) {
    const a = doc.data();
    if (a.type !== 'credit' && a.type !== 'loan') continue;
    const bal = Math.abs(a.balance_current || 0);
    if (bal === 0) continue;
    countedAccountIds.add(a.account_id);
    const subtype = (a.subtype || '').toLowerCase();
    const kind = a.type === 'credit' ? 'credit'
      : subtype.includes('student') ? 'student'
      : subtype.includes('mortgage') ? 'mortgage'
      : 'other';
    addLiability(kind, bal);
  }
  for (const doc of liabilitiesSnap.docs) {
    const l = doc.data();
    if (countedAccountIds.has(l.account_id)) continue;
    const bal = Math.abs(l.balance || 0);
    if (bal === 0) continue;
    addLiability(l.kind, bal);
  }

  // Allocation by bet type (mirrors /portfolio/by-bet bucketing)
  const bets = betsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const tickerToType = new Map();
  for (const b of bets) {
    if (b.is_synthetic && b.type === 'Core') continue;
    if (b.status === 'closed') continue;
    for (const t of b.tickers || []) if (!tickerToType.has(t)) tickerToType.set(t, b.type);
  }

  const allocation = { Long: 0, Mid: 0, Short: 0, Core: 0, Unallocated: 0, Cash: cash };

  for (const doc of holdingsSnap.docs) {
    const h = doc.data();
    const sec = securitiesById.get(h.security_id);
    const acct = accountsById.get(h.account_id);
    const ticker = (sec?.ticker_symbol || '').toUpperCase();
    const value = h.institution_value
      ?? (h.institution_price != null && h.quantity != null ? h.institution_price * h.quantity : 0);
    const isRetirement = RETIREMENT_SUBTYPES.has((acct?.subtype || '').toLowerCase());

    let type;
    if (isRetirement) type = 'Core';
    else if (ticker && tickerToType.has(ticker)) type = tickerToType.get(ticker);
    else type = 'Unallocated';

    allocation[type] = (allocation[type] || 0) + (value || 0);
  }

  for (const doc of manualSnap.docs) {
    const inv = doc.data();
    const ticker = (inv.ticker || '').toUpperCase();
    const price = livePrices[ticker] ?? inv.current_price ?? inv.purchase_price ?? 0;
    const value = (inv.shares || 0) * price;
    let type;
    if (inv.category === 'retirement') type = 'Core';
    else if (ticker && tickerToType.has(ticker)) type = tickerToType.get(ticker);
    else type = 'Unallocated';
    allocation[type] = (allocation[type] || 0) + value;
  }

  // Per-ticker concentration across all accounts (Plaid + manual, cash
  // positions excluded). pct_invested is share of total invested dollars —
  // the "how exposed am I to X" number the dashboard surfaces.
  // The denominator is non-cash invested dollars (idle brokerage cash and
  // CUR: pseudo-tickers excluded) so the percentages line up with the
  // Holdings page's "Investments" section.
  const byTicker = new Map();
  let nonCashInvested = 0;
  const addExposure = (ticker, name, value) => {
    if (!value) return;
    nonCashInvested += value;
    if (!ticker) return;
    let row = byTicker.get(ticker);
    if (!row) {
      row = { ticker, name: name || ticker, value: 0 };
      byTicker.set(ticker, row);
    }
    row.value += value;
  };
  for (const doc of holdingsSnap.docs) {
    const h = doc.data();
    const sec = securitiesById.get(h.security_id);
    const ticker = (sec?.ticker_symbol || '').toUpperCase();
    if ((sec?.type || '').toLowerCase() === 'cash' || ticker.startsWith('CUR:')) continue;
    const value = h.institution_value
      ?? (h.institution_price != null && h.quantity != null ? h.institution_price * h.quantity : 0);
    addExposure(ticker, sec?.name, value);
  }
  for (const doc of manualSnap.docs) {
    const inv = doc.data();
    const ticker = (inv.ticker || '').toUpperCase();
    const price = livePrices[ticker] ?? inv.current_price ?? inv.purchase_price ?? 0;
    addExposure(ticker, inv.name, (inv.shares || 0) * price);
  }
  const topHoldings = Array.from(byTicker.values())
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)
    .map(r => ({
      ticker: r.ticker,
      name: r.name,
      value: r.value,
      pct_invested: nonCashInvested > 0 ? (r.value / nonCashInvested) * 100 : 0,
    }));

  const totalAssets = cash + investmentsPlaid + investmentsManual;
  const netWorth = totalAssets - liabilities.total;

  const accounts = accountsSnap.docs.map(doc => {
    const d = doc.data();
    return {
      id: doc.id,
      institution_name: d.institution_name,
      name: d.name,
      mask: d.mask,
      type: d.type,
      subtype: d.subtype,
      balance: d.balance_current,
    };
  });

  return {
    net_worth: netWorth,
    assets: { cash, investments: investmentsPlaid, manual_investments: investmentsManual, total: totalAssets },
    liabilities,
    allocation,
    top_holdings: topHoldings,
    accounts,
    generated_at: new Date().toISOString(),
  };
}

// Idempotent on (user_id, date) — re-running on the same day overwrites the
// row so we always have the latest balance for "today" but historical days
// stay frozen.
async function writeBalanceSnapshot(userId, snapshot) {
  const snap = snapshot || await computeSnapshot(userId);
  const today = new Date().toISOString().slice(0, 10);
  const docId = `${userId}_${today}`;

  await db.collection('balance_snapshots').doc(docId).set({
    user_id: userId,
    date: today,
    net_worth: snap.net_worth,
    total_assets: snap.assets.total,
    total_liabilities: snap.liabilities.total,
    cash: snap.assets.cash,
    investments: snap.assets.investments + snap.assets.manual_investments,
    created_at: snap.generated_at,
  }, { merge: true });

  return { date: today, net_worth: snap.net_worth };
}

// Iterate every connected user and write their daily snapshot.
// Called by the cron right after syncAllUsers so the snapshot reflects the
// freshly-pulled balances/holdings/liabilities.
async function writeAllBalanceSnapshots() {
  const itemsSnapshot = await db.collection('plaid_items').get();
  const userIds = new Set(itemsSnapshot.docs.map(d => d.data().user_id));

  const results = [];
  for (const userId of userIds) {
    try {
      const r = await writeBalanceSnapshot(userId);
      results.push({ user_id: userId, success: true, ...r });
    } catch (err) {
      console.error(`[balance_snapshot] user ${userId} failed:`, err.message);
      results.push({ user_id: userId, success: false, error: err.message });
    }
  }
  return { users: userIds.size, results };
}

module.exports = { computeSnapshot, writeBalanceSnapshot, writeAllBalanceSnapshots };
