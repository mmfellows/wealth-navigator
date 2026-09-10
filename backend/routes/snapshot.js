const express = require('express');
const { db } = require('../services/database');
const { optionalAuth } = require('../middleware/auth');
const { ensureSyntheticCoreBet } = require('./bets');
const { computeSnapshot } = require('../services/snapshotService');

const router = express.Router();

// One unified snapshot for the Dashboard:
//   net worth, asset / liability breakdown, allocation by bet type, accounts.
router.get('/', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    await ensureSyntheticCoreBet(userId);
    const snapshot = await computeSnapshot(userId);
    res.json(snapshot);
  } catch (error) {
    console.error('Error in /snapshot:', error);
    res.status(500).json({ error: 'Failed to compute snapshot' });
  }
});

// Net-worth time series for the Dashboard chart.
// Driven by balance_snapshots, written daily by the scheduled cron.
router.get('/history', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 90, 7), 730);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffDate = cutoff.toISOString().slice(0, 10);

    const snap = await db.collection('balance_snapshots')
      .where('user_id', '==', userId)
      .where('date', '>=', cutoffDate)
      .get();

    const points = snap.docs
      .map(d => d.data())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({
        date: d.date,
        net_worth: d.net_worth,
        total_assets: d.total_assets,
        total_liabilities: d.total_liabilities,
        cash: d.cash ?? 0,
        investments: d.investments ?? 0,
      }));

    res.json({ points });
  } catch (error) {
    console.error('Error in /snapshot/history:', error);
    res.status(500).json({ error: 'Failed to load snapshot history' });
  }
});

module.exports = router;
