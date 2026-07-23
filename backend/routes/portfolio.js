const express = require('express');
const { db, docToObj } = require('../services/database');
const stockService = require('../services/stockService');
const { optionalAuth } = require('../middleware/auth');
const { ensureSyntheticCoreBet } = require('./bets');

const router = express.Router();

// Account subtypes that auto-route into the synthetic Core bet.
// Plaid normalizes subtypes to lowercase strings.
const RETIREMENT_SUBTYPES = new Set([
  '401k', '401a', '403b', 'ira', 'roth', 'roth 401k',
  'sep ira', 'simple ira', 'sarsep', 'tsp', 'thrift savings plan',
  '529', 'hsa', 'pension', 'retirement',
]);

const isRetirementAccount = (account) => {
  if (!account) return false;
  return RETIREMENT_SUBTYPES.has((account.subtype || '').toLowerCase());
};

// Get portfolio metrics
router.get('/metrics', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get all investments
    const snapshot = await db.collection('investments').where('user_id', '==', userId).get();
    const investments = snapshot.docs.map(docToObj);

    // Update current prices
    const tickers = [...new Set(investments.map(inv => inv.ticker))];
    const currentPrices = await stockService.getMultiplePrices(tickers);

    // Update investments with current prices
    for (const investment of investments) {
      const currentPrice = currentPrices[investment.ticker];
      if (currentPrice) {
        investment.current_price = currentPrice;
        await db.collection('investments').doc(investment.id).update({
          current_price: currentPrice,
        });
      }
    }

    // Calculate metrics
    let totalInvested = 0;
    let currentValue = 0;
    const categoryBreakdown = {
      retirement: { amount: 0, percentage: 0 },
      lowRisk: { amount: 0, percentage: 0 },
      growth: { amount: 0, percentage: 0 },
      speculative: { amount: 0, percentage: 0 }
    };

    investments.forEach(investment => {
      const investedAmount = investment.shares * investment.purchase_price;
      const currentAmount = investment.shares * (investment.current_price || investment.purchase_price);

      totalInvested += investedAmount;
      currentValue += currentAmount;

      const categoryMap = {
        'retirement': 'retirement',
        'low-risk': 'lowRisk',
        'growth': 'growth',
        'speculative': 'speculative'
      };

      const category = categoryMap[investment.category] || 'growth';
      categoryBreakdown[category].amount += currentAmount;
    });

    // Calculate percentages
    Object.keys(categoryBreakdown).forEach(category => {
      categoryBreakdown[category].percentage = currentValue > 0
        ? (categoryBreakdown[category].amount / currentValue) * 100
        : 0;
    });

    const totalCash = 65000;
    const netWorth = currentValue + totalCash;

    res.json({
      netWorth,
      totalInvested: currentValue,
      totalCash,
      categoryBreakdown
    });
  } catch (error) {
    console.error('Error calculating portfolio metrics:', error);
    res.status(500).json({ error: 'Failed to calculate portfolio metrics' });
  }
});

// Holdings grouped by bet. Returns one bucket per user-defined bet,
// plus the synthetic Core bucket (retirement-account holdings) and an
// Unallocated bucket (everything that didn't match).
//
// Bucketing rule:
//   1. If a holding lives in a retirement-type account → Core (always wins)
//   2. Otherwise: first user-defined bet whose tickers include the symbol
//   3. Otherwise: Unallocated
router.get('/by-bet', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    await ensureSyntheticCoreBet(userId);

    const [betsSnap, holdingsSnap, securitiesSnap, accountsSnap, manualSnap] = await Promise.all([
      db.collection('bets').where('user_id', '==', userId).get(),
      db.collection('plaid_holdings').where('user_id', '==', userId).get(),
      db.collection('plaid_securities').where('user_id', '==', userId).get(),
      db.collection('plaid_accounts').where('user_id', '==', userId).get(),
      db.collection('investments').where('user_id', '==', userId).get(),
    ]);

    const bets = betsSnap.docs.map(docToObj);
    const securitiesById = new Map(securitiesSnap.docs.map(d => [d.data().security_id, d.data()]));
    const accountsById = new Map(accountsSnap.docs.map(d => [d.data().account_id, d.data()]));

    // Index ticker → bet for fast bucketing. Closed bets are excluded.
    const tickerToBet = new Map();
    let coreBet = null;
    const userBets = [];
    for (const bet of bets) {
      if (bet.is_synthetic && bet.type === 'Core') { coreBet = bet; continue; }
      if (bet.status === 'closed') continue;
      userBets.push(bet);
      for (const t of bet.tickers || []) {
        if (!tickerToBet.has(t)) tickerToBet.set(t, bet);
      }
    }

    // Initialize buckets
    const initBucket = (bet) => ({
      bet,
      holdings: [],
      cost_basis: 0,
      current_value: 0,
    });
    const buckets = new Map();
    if (coreBet) buckets.set(coreBet.id, initBucket(coreBet));
    for (const bet of userBets) buckets.set(bet.id, initBucket(bet));
    const unallocated = initBucket({
      id: '__unallocated__',
      name: 'Unallocated',
      type: 'Unallocated',
      tickers: [],
      status: 'active',
      is_synthetic: true,
    });

    // Refresh stock prices. Manual investments always use best-effort live
    // prices. Plaid holdings use the institution's stored price unless the
    // caller asks for live with ?live=true, in which case we pull fresh
    // quotes for every distinct ticker.
    const useLive = String(req.query.live || '').toLowerCase() === 'true';
    const tickersToPrice = new Set();
    manualSnap.docs.forEach(d => {
      const inv = d.data();
      if (inv.ticker) tickersToPrice.add(inv.ticker.toUpperCase());
    });
    if (useLive) {
      for (const doc of holdingsSnap.docs) {
        const sec = securitiesById.get(doc.data().security_id);
        const t = (sec?.ticker_symbol || '').toUpperCase();
        if (t && !t.startsWith('CUR:')) tickersToPrice.add(t);
      }
    }
    let livePrices = {};
    try {
      livePrices = await stockService.getMultiplePrices(Array.from(tickersToPrice));
    } catch (e) {
      // non-fatal — fall back to stored current_price
    }

    // Plaid holdings → buckets
    for (const doc of holdingsSnap.docs) {
      const h = doc.data();
      const sec = securitiesById.get(h.security_id);
      const acct = accountsById.get(h.account_id);
      const ticker = (sec?.ticker_symbol || '').toUpperCase();
      const livePrice = useLive ? livePrices[ticker] : null;
      const price = livePrice ?? h.institution_price ?? sec?.close_price ?? null;
      const value = livePrice != null && h.quantity != null
        ? livePrice * h.quantity
        : (h.institution_value ?? (price != null && h.quantity != null ? price * h.quantity : null));
      // Plaid returns `cost_basis` as the position's total cost basis (not
      // per-share) for the brokerages we support (Schwab, E*TRADE). Treat it
      // as total and derive per-share from quantity.
      const costBasis = h.cost_basis ?? null;
      const costBasisPerShare = costBasis != null && h.quantity ? costBasis / h.quantity : null;

      const holdingRow = {
        source: 'plaid',
        holding_id: doc.id,
        ticker,
        name: sec?.name || ticker || 'Unknown',
        type: sec?.type || '',
        quantity: h.quantity,
        cost_basis_per_share: costBasisPerShare,
        cost_basis_total: costBasis,
        current_price: price,
        current_value: value,
        account_name: acct?.name || acct?.official_name || '',
        account_subtype: acct?.subtype || '',
        institution_name: acct?.institution_name || '',
        is_retirement: isRetirementAccount(acct),
      };

      let bucket;
      if (isRetirementAccount(acct) && coreBet) {
        bucket = buckets.get(coreBet.id);
      } else if (ticker && tickerToBet.has(ticker)) {
        bucket = buckets.get(tickerToBet.get(ticker).id);
      } else {
        bucket = unallocated;
      }

      bucket.holdings.push(holdingRow);
      if (value != null) bucket.current_value += value;
      if (costBasis != null) bucket.cost_basis += costBasis;
    }

    // Manual investments → buckets (off-platform holdings keep working)
    for (const doc of manualSnap.docs) {
      const inv = doc.data();
      const ticker = (inv.ticker || '').toUpperCase();
      const price = livePrices[ticker] ?? inv.current_price ?? inv.purchase_price;
      const value = (inv.shares || 0) * (price || 0);
      const costBasis = (inv.shares || 0) * (inv.purchase_price || 0);

      const holdingRow = {
        source: 'manual',
        holding_id: doc.id,
        ticker,
        name: inv.name || ticker,
        type: inv.category || '',
        quantity: inv.shares,
        cost_basis_per_share: inv.purchase_price,
        cost_basis_total: costBasis,
        current_price: price,
        current_value: value,
        account_name: inv.platform || '',
        account_subtype: inv.category === 'retirement' ? 'ira' : '',
        institution_name: inv.platform || '',
        is_retirement: inv.category === 'retirement',
      };

      let bucket;
      if (inv.category === 'retirement' && coreBet) {
        bucket = buckets.get(coreBet.id);
      } else if (ticker && tickerToBet.has(ticker)) {
        bucket = buckets.get(tickerToBet.get(ticker).id);
      } else {
        bucket = unallocated;
      }

      bucket.holdings.push(holdingRow);
      bucket.current_value += value;
      bucket.cost_basis += costBasis;
    }

    // Finalize each bucket: compute pnl + sort holdings
    const finalize = (b) => {
      const pnl = b.current_value - b.cost_basis;
      const pnlPct = b.cost_basis > 0 ? (pnl / b.cost_basis) * 100 : 0;
      b.holdings.sort((a, c) => (c.current_value || 0) - (a.current_value || 0));
      return { ...b, pnl, pnl_pct: pnlPct };
    };

    const buckets_out = [];
    if (coreBet) buckets_out.push(finalize(buckets.get(coreBet.id)));
    for (const bet of userBets) {
      const b = buckets.get(bet.id);
      if (b.holdings.length > 0 || bet.status === 'planned') buckets_out.push(finalize(b));
    }
    if (unallocated.holdings.length > 0) buckets_out.push(finalize(unallocated));

    // Top-line totals so the UI doesn't have to re-sum
    const totals = buckets_out.reduce((acc, b) => {
      acc.cost_basis += b.cost_basis;
      acc.current_value += b.current_value;
      return acc;
    }, { cost_basis: 0, current_value: 0 });
    totals.pnl = totals.current_value - totals.cost_basis;
    totals.pnl_pct = totals.cost_basis > 0 ? (totals.pnl / totals.cost_basis) * 100 : 0;

    res.json({ buckets: buckets_out, totals });
  } catch (error) {
    console.error('Error in /portfolio/by-bet:', error);
    res.status(500).json({ error: 'Failed to compute portfolio by bet' });
  }
});

module.exports = router;
