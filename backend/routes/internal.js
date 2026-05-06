const express = require('express');
const plaidService = require('../services/plaidService');
const { writeAllBalanceSnapshots } = require('../services/snapshotService');

const router = express.Router();

// Vercel Cron hits this endpoint on a schedule. Vercel sends an
// `Authorization: Bearer <CRON_SECRET>` header when CRON_SECRET is set as an env var.
// We accept either that header or a custom `x-cron-secret` for manual invocation.
function requireCronSecret(req, res, next) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return res.status(503).json({ error: 'CRON_SECRET not configured' });
  }
  const auth = req.get('authorization') || '';
  const headerSecret = req.get('x-cron-secret') || '';
  const ok = auth === `Bearer ${secret}` || headerSecret === secret;
  if (!ok) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// GET so Vercel Cron can trigger it without a body. POST also allowed for manual runs.
const handleSyncAll = async (req, res) => {
  try {
    const days = Number(req.query.days || 30);
    const { users, results } = await plaidService.syncAllUsers(days);
    const ok = results.filter(r => r.success).length;

    // After syncing every user, freeze a balance_snapshots row per user so
    // the net-worth-over-time chart stays continuous even if a user opens
    // the app days later.
    let snapshots = { users: 0, results: [] };
    try {
      snapshots = await writeAllBalanceSnapshots();
    } catch (err) {
      console.error('[cron snapshot] failed:', err.message);
    }

    res.json({ success: true, users, ok, days, results, snapshots });
  } catch (error) {
    console.error('[cron sync-all] failed:', error);
    res.status(500).json({ error: error.message || 'sync-all failed' });
  }
};

router.get('/sync-all', requireCronSecret, handleSyncAll);
router.post('/sync-all', requireCronSecret, handleSyncAll);

module.exports = router;
