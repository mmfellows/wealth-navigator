// Options trades — covered calls and cash-secured puts.
//
// A trade is short premium: you sell a call against shares you hold, or a
// put against cash you've set aside. Lifecycle: planned → open → closed
// (expired / assigned / bought_back). Metric math (breakeven, annualized
// return on collateral) lives client-side in src/lib/options.ts; this route
// is storage plus the coverage check against real holdings and cash.

const express = require('express');
const { randomUUID } = require('crypto');
const { db, docToObj } = require('../services/database');
const { optionalAuth } = require('../middleware/auth');
const stockService = require('../services/stockService');

const router = express.Router();

const STRATEGIES = ['covered_call', 'cash_secured_put'];
const STATUSES = ['planned', 'open', 'closed'];
const CLOSE_METHODS = ['expired', 'assigned', 'bought_back'];

function validateTrade(body) {
  const errors = [];
  const underlying = (body.underlying || '').toUpperCase().trim();
  if (!underlying) errors.push('underlying is required');
  if (!STRATEGIES.includes(body.strategy)) errors.push(`strategy must be one of ${STRATEGIES.join(', ')}`);
  const contracts = parseInt(body.contracts, 10);
  if (!Number.isInteger(contracts) || contracts < 1) errors.push('contracts must be a positive integer');
  const strike = Number(body.strike);
  if (!(strike > 0)) errors.push('strike must be positive');
  const premium = Number(body.premium);
  if (!(premium >= 0)) errors.push('premium must be >= 0');
  if (!body.expiration || isNaN(Date.parse(body.expiration))) errors.push('expiration must be a valid date');
  const status = body.status || 'planned';
  if (!['planned', 'open'].includes(status)) errors.push('status must be planned or open');
  return { errors, underlying, contracts, strike, premium, status };
}

// List trades. ?status=open|planned|closed filters; default returns all.
// Each trade also gets a live underlying price (best effort) so the UI can
// show moneyness without another round trip.
router.get('/', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { status } = req.query;

    let query = db.collection('option_trades').where('user_id', '==', userId);
    if (status && STATUSES.includes(status)) {
      query = query.where('status', '==', status);
    }
    const snapshot = await query.get();
    const trades = snapshot.docs.map(docToObj)
      .sort((a, b) => (a.expiration || '').localeCompare(b.expiration || ''));

    const tickers = [...new Set(trades.map(t => t.underlying).filter(Boolean))];
    let prices = {};
    if (tickers.length > 0) {
      try { prices = await stockService.getMultiplePrices(tickers); } catch { /* best effort */ }
    }
    for (const t of trades) {
      t.underlying_price = prices[t.underlying] ?? null;
    }

    res.json({ trades });
  } catch (error) {
    console.error('Error listing option trades:', error);
    res.status(500).json({ error: 'Failed to list option trades' });
  }
});

// Coverage check for the planner: how many shares of each ticker the user
// holds (for covered calls) and how much brokerage cash is available (for
// cash-secured puts). Shares come from plaid_holdings + manual investments;
// cash is the CUR:/cash-type positions inside investment accounts.
router.get('/coverage', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const [holdingsSnap, securitiesSnap, manualSnap] = await Promise.all([
      db.collection('plaid_holdings').where('user_id', '==', userId).get(),
      db.collection('plaid_securities').where('user_id', '==', userId).get(),
      db.collection('investments').where('user_id', '==', userId).get(),
    ]);

    const securitiesById = new Map(securitiesSnap.docs.map(d => [d.data().security_id, d.data()]));
    const sharesByTicker = {};
    let brokerageCash = 0;

    for (const doc of holdingsSnap.docs) {
      const h = doc.data();
      const sec = securitiesById.get(h.security_id);
      const ticker = (sec?.ticker_symbol || '').toUpperCase();
      const isCash = (sec?.type || '').toLowerCase() === 'cash' || ticker.startsWith('CUR:');
      if (isCash) {
        brokerageCash += h.institution_value
          ?? (h.institution_price != null && h.quantity != null ? h.institution_price * h.quantity : 0);
        continue;
      }
      if (!ticker) continue;
      sharesByTicker[ticker] = (sharesByTicker[ticker] || 0) + (h.quantity || 0);
    }

    for (const doc of manualSnap.docs) {
      const inv = doc.data();
      const ticker = (inv.ticker || '').toUpperCase();
      if (!ticker) continue;
      sharesByTicker[ticker] = (sharesByTicker[ticker] || 0) + (inv.shares || 0);
    }

    // Cash already pledged to other open/planned CSPs counts against
    // available collateral.
    const openTrades = await db.collection('option_trades')
      .where('user_id', '==', userId)
      .where('status', 'in', ['planned', 'open'])
      .get();
    let pledgedCash = 0;
    const committedShares = {};
    for (const doc of openTrades.docs) {
      const t = doc.data();
      if (t.strategy === 'cash_secured_put') {
        pledgedCash += (t.strike || 0) * 100 * (t.contracts || 0);
      } else if (t.strategy === 'covered_call') {
        const u = (t.underlying || '').toUpperCase();
        committedShares[u] = (committedShares[u] || 0) + 100 * (t.contracts || 0);
      }
    }

    res.json({
      shares_by_ticker: sharesByTicker,
      committed_shares: committedShares,
      brokerage_cash: brokerageCash,
      pledged_cash: pledgedCash,
    });
  } catch (error) {
    console.error('Error computing option coverage:', error);
    res.status(500).json({ error: 'Failed to compute coverage' });
  }
});

// Create a trade (planned or open)
router.post('/', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { errors, underlying, contracts, strike, premium, status } = validateTrade(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    const now = new Date().toISOString();
    const trade = {
      user_id: userId,
      underlying,
      strategy: req.body.strategy,
      contracts,
      strike,
      premium,
      expiration: req.body.expiration,
      status,
      open_date: status === 'open' ? (req.body.open_date || now.slice(0, 10)) : null,
      close_date: null,
      close_method: null,
      close_price: null,
      notes: req.body.notes || '',
      created_at: now,
      updated_at: now,
    };

    const id = randomUUID();
    await db.collection('option_trades').doc(id).set(trade);
    res.status(201).json({ id, ...trade });
  } catch (error) {
    console.error('Error creating option trade:', error);
    res.status(500).json({ error: 'Failed to create option trade' });
  }
});

// Update a trade (edit fields, or promote planned → open)
router.put('/:id', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const ref = db.collection('option_trades').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().user_id !== userId) {
      return res.status(404).json({ error: 'Trade not found' });
    }
    if (doc.data().status === 'closed') {
      return res.status(400).json({ error: 'Closed trades cannot be edited' });
    }

    const updates = { updated_at: new Date().toISOString() };
    const editable = ['underlying', 'strategy', 'contracts', 'strike', 'premium', 'expiration', 'notes', 'status', 'open_date'];
    for (const key of editable) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (updates.underlying) updates.underlying = String(updates.underlying).toUpperCase().trim();
    if (updates.status && !['planned', 'open'].includes(updates.status)) {
      return res.status(400).json({ error: 'Use POST /:id/close to close a trade' });
    }
    if (updates.status === 'open' && !updates.open_date && !doc.data().open_date) {
      updates.open_date = new Date().toISOString().slice(0, 10);
    }

    await ref.update(updates);
    const updated = await ref.get();
    res.json(docToObj(updated));
  } catch (error) {
    console.error('Error updating option trade:', error);
    res.status(500).json({ error: 'Failed to update option trade' });
  }
});

// Close a trade: expired (keep full premium), assigned (premium kept, shares
// called away / put to you), or bought_back (pay close_price per share).
router.post('/:id/close', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { method, close_price, close_date } = req.body;
    if (!CLOSE_METHODS.includes(method)) {
      return res.status(400).json({ error: `method must be one of ${CLOSE_METHODS.join(', ')}` });
    }
    if (method === 'bought_back' && !(Number(close_price) >= 0)) {
      return res.status(400).json({ error: 'close_price (per share) is required when buying back' });
    }

    const ref = db.collection('option_trades').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().user_id !== userId) {
      return res.status(404).json({ error: 'Trade not found' });
    }
    if (doc.data().status === 'closed') {
      return res.status(400).json({ error: 'Trade is already closed' });
    }

    await ref.update({
      status: 'closed',
      close_method: method,
      close_price: method === 'bought_back' ? Number(close_price) : null,
      close_date: close_date || new Date().toISOString().slice(0, 10),
      updated_at: new Date().toISOString(),
    });
    const updated = await ref.get();
    res.json(docToObj(updated));
  } catch (error) {
    console.error('Error closing option trade:', error);
    res.status(500).json({ error: 'Failed to close option trade' });
  }
});

// Delete a trade
router.delete('/:id', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const ref = db.collection('option_trades').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().user_id !== userId) {
      return res.status(404).json({ error: 'Trade not found' });
    }
    await ref.delete();
    res.json({ deleted: true });
  } catch (error) {
    console.error('Error deleting option trade:', error);
    res.status(500).json({ error: 'Failed to delete option trade' });
  }
});

module.exports = router;
