const express = require('express');
const plaidService = require('../services/plaidService');
const { writeAllBalanceSnapshots } = require('../services/snapshotService');
const { auditStoredSecrets, rotateStoredSecrets } = require('../services/keyRotation');
const { addSyncLog, summarizeItemResults } = require('../services/syncLog');

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
    const startedAt = Date.now();
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

    // One sync_logs row per user per run, so the scheduled sync is visible in
    // the same place as manual syncs. Status is `completed` when every stream
    // on every item succeeded, `partial` when some streams failed, `error`
    // when the user's sync threw. No `in_progress` row: the cron is
    // synchronous, and open in_progress rows only ever mean "never finished".
    const durationMs = Date.now() - startedAt;
    for (const r of results) {
      const snapshot = snapshots.results.find(s => s.user_id === r.user_id);
      const metadata = {
        trigger: 'cron',
        days,
        duration_ms: durationMs,
        snapshot: snapshot ? (snapshot.success ? { date: snapshot.date, success: true } : { success: false, error: snapshot.error }) : null,
      };
      try {
        if (!r.success) {
          await addSyncLog(r.user_id, 'cron_sync', 'error', r.error, { metadata });
          continue;
        }
        const { totals, failures, message } = summarizeItemResults(r.items || []);
        const status = failures.length ? 'partial' : 'completed';
        await addSyncLog(r.user_id, 'cron_sync', status, message, {
          metadata: { ...metadata, totals, failures, items: (r.items || []).map(i => i.institution) },
        });
      } catch (err) {
        console.error('[cron sync-all] failed to write sync_logs:', err.message);
      }
    }

    res.json({ success: true, users, ok, days, results, snapshots });
  } catch (error) {
    console.error('[cron sync-all] failed:', error);
    res.status(500).json({ error: error.message || 'sync-all failed' });
  }
};

router.get('/sync-all', requireCronSecret, handleSyncAll);
router.post('/sync-all', requireCronSecret, handleSyncAll);

// Emailed spending reports. One daily cron; the service decides what is due
// on this calendar day (digest on the 8th/22nd, monthly lookback on the 2nd,
// quarterly on the 3rd of Jan/Apr/Jul/Oct, annual on Jan 4th). Each period's
// report is sent at most once, so a retried cron run can't double-send.
// ?type=digest|monthly|quarterly|annual runs one regardless of the date.
const handleReports = async (req, res) => {
  try {
    const { dueReports, sendReport, TYPES } = require('../services/spendingReports');
    const requested = req.query.type;
    if (requested && !TYPES.includes(requested)) {
      return res.status(400).json({ error: `type must be one of ${TYPES.join(', ')}` });
    }
    // Same daily tick: keep the frozen copy of this year's plan (taken once,
    // the first day the plan is live).
    try {
      await require('../services/budgetPlans').ensureFrozen(new Date().getFullYear());
    } catch (err) {
      console.error('[cron reports] plan freeze failed:', err.message);
    }
    const types = requested ? [requested] : dueReports();
    const results = [];
    for (const type of types) {
      try {
        results.push(await sendReport(type));
      } catch (err) {
        console.error(`[cron reports] ${type} failed:`, err.message);
        results.push({ type, error: err.message });
      }
    }
    const failed = results.some(r => r.error);
    res.status(failed ? 500 : 200).json({ success: !failed, due: types, results });
  } catch (error) {
    console.error('[cron reports] failed:', error);
    res.status(500).json({ error: error.message || 'reports failed' });
  }
};

router.get('/reports', requireCronSecret, handleReports);
router.post('/reports', requireCronSecret, handleReports);

// Encryption-key rotation. See backend/services/encryption.js for the
// procedure. Both routes need the cron secret; neither returns a secret value.
router.get('/encryption-key-status', requireCronSecret, async (req, res) => {
  try {
    res.json(await auditStoredSecrets());
  } catch (error) {
    console.error('[encryption-key-status] failed:', error);
    res.status(500).json({ error: error.message || 'audit failed' });
  }
});

router.post('/rotate-encryption-key', requireCronSecret, async (req, res) => {
  try {
    const summary = await rotateStoredSecrets();
    console.log('[rotate-encryption-key]', JSON.stringify({ ...summary, unreadable: summary.unreadable.length }));
    res.json(summary);
  } catch (error) {
    console.error('[rotate-encryption-key] failed:', error);
    res.status(500).json({ error: error.message || 'rotation failed' });
  }
});

module.exports = router;
