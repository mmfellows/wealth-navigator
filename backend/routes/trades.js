const express = require('express');
const { db, docToObj } = require('../services/database');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

const { randomUUID } = require('crypto');
const generateId = () => randomUUID();

// Get all trades
router.get('/', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const snapshot = await db.collection('trades')
      .where('user_id', '==', userId)
      .orderBy('date', 'desc')
      .orderBy('created_at', 'desc')
      .get();

    res.json(snapshot.docs.map(docToObj));
  } catch (error) {
    console.error('Error fetching trades:', error);
    res.status(500).json({ error: 'Failed to fetch trades' });
  }
});

// Unified trade journal: manual entries + Plaid investment transactions
// (auto-imported buys / sells / dividends / fees), joined with security
// metadata so each row has a ticker even when the manual collection only
// has a free-form symbol.
router.get('/journal', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 365, 7), 1825);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffDate = cutoff.toISOString().slice(0, 10);

    const [manualSnap, plaidSnap, secSnap, acctSnap] = await Promise.all([
      db.collection('trades').where('user_id', '==', userId).get(),
      db.collection('plaid_investment_transactions').where('user_id', '==', userId).get(),
      db.collection('plaid_securities').where('user_id', '==', userId).get(),
      db.collection('plaid_accounts').where('user_id', '==', userId).get(),
    ]);

    const securitiesById = new Map(secSnap.docs.map(d => [d.data().security_id, d.data()]));
    const accountsById = new Map(acctSnap.docs.map(d => [d.data().account_id, d.data()]));

    const manual = manualSnap.docs
      .map(docToObj)
      .filter(t => !t.date || t.date >= cutoffDate)
      .map(t => ({
        source: 'manual',
        id: t.id,
        date: t.date,
        ticker: (t.ticker || '').toUpperCase(),
        name: t.ticker || '',
        type: t.type, // buy | sell
        subtype: t.strategy || '',
        quantity: t.shares,
        price: t.price,
        amount: (t.shares || 0) * (t.price || 0) * (t.type === 'buy' ? -1 : 1),
        fees: null,
        account_name: t.platform || '',
        institution_name: t.platform || '',
        rationale: t.rationale || '',
      }));

    const plaid = plaidSnap.docs
      .map(d => d.data())
      .filter(t => !t.date || t.date >= cutoffDate)
      .map(t => {
        const sec = securitiesById.get(t.security_id);
        const acct = accountsById.get(t.account_id);
        return {
          source: 'plaid',
          id: t.investment_transaction_id,
          date: t.date,
          ticker: (sec?.ticker_symbol || '').toUpperCase(),
          name: sec?.name || '',
          type: t.type, // buy, sell, cash, dividend, fee, transfer (Plaid normalized)
          subtype: t.subtype || '',
          quantity: t.quantity,
          price: t.price,
          amount: t.amount,
          fees: t.fees,
          account_name: acct?.name || acct?.official_name || '',
          institution_name: acct?.institution_name || '',
          rationale: '',
        };
      });

    const all = [...manual, ...plaid].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    res.json({
      entries: all,
      manual_count: manual.length,
      plaid_count: plaid.length,
    });
  } catch (error) {
    console.error('Error building trade journal:', error);
    res.status(500).json({ error: 'Failed to build trade journal' });
  }
});

// Add trade
router.post('/', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { ticker, type, shares, price, date, platform, rationale = '', strategy = 'Long' } = req.body;

    if (!ticker || !type || !shares || !price || !date || !platform) {
      return res.status(400).json({ error: 'All fields except rationale are required' });
    }

    if (!['buy', 'sell'].includes(type)) {
      return res.status(400).json({ error: 'Type must be buy or sell' });
    }

    const validStrategies = ['Trade', 'Swing', '1 Year', '5 Years', 'Long'];
    if (strategy && !validStrategies.includes(strategy)) {
      return res.status(400).json({ error: 'Invalid strategy. Must be one of: Trade, Swing, 1 Year, 5 Years, Long' });
    }

    const id = generateId();
    const data = {
      user_id: userId,
      ticker: ticker.toUpperCase(),
      type,
      shares,
      price,
      date,
      platform,
      rationale,
      strategy,
      created_at: new Date().toISOString(),
    };

    await db.collection('trades').doc(id).set(data);

    res.status(201).json({ id, ...data });
  } catch (error) {
    console.error('Error adding trade:', error);
    res.status(500).json({ error: 'Failed to add trade' });
  }
});

// Update trade rationale
router.patch('/:id', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { rationale } = req.body;

    if (rationale === undefined) {
      return res.status(400).json({ error: 'Rationale is required' });
    }

    const doc = await db.collection('trades').doc(id).get();
    if (!doc.exists || doc.data().user_id !== userId) {
      return res.status(404).json({ error: 'Trade not found' });
    }

    await db.collection('trades').doc(id).update({ rationale });

    const updatedDoc = await db.collection('trades').doc(id).get();
    res.json(docToObj(updatedDoc));
  } catch (error) {
    console.error('Error updating trade rationale:', error);
    res.status(500).json({ error: 'Failed to update trade rationale' });
  }
});

// Update trade
router.put('/:id', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const updates = req.body;

    const doc = await db.collection('trades').doc(id).get();
    if (!doc.exists || doc.data().user_id !== userId) {
      return res.status(404).json({ error: 'Trade not found' });
    }

    const allowedFields = ['ticker', 'type', 'shares', 'price', 'date', 'platform', 'rationale', 'strategy'];
    const updateData = {};

    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        updateData[key] = key === 'ticker' ? updates[key].toUpperCase() : updates[key];
      }
    });

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    await db.collection('trades').doc(id).update(updateData);

    const updatedDoc = await db.collection('trades').doc(id).get();
    res.json(docToObj(updatedDoc));
  } catch (error) {
    console.error('Error updating trade:', error);
    res.status(500).json({ error: 'Failed to update trade' });
  }
});

// Delete trade
router.delete('/:id', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const doc = await db.collection('trades').doc(id).get();
    if (!doc.exists || doc.data().user_id !== userId) {
      return res.status(404).json({ error: 'Trade not found' });
    }

    await db.collection('trades').doc(id).delete();
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting trade:', error);
    res.status(500).json({ error: 'Failed to delete trade' });
  }
});

module.exports = router;
