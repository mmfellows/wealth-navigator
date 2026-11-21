// Emailed spending reports, on demand: preview the HTML in the browser or
// send one to yourself now. The scheduled sends live in routes/internal.js.

const express = require('express');
const { optionalAuth } = require('../middleware/auth');
const {
  buildReport, sendReport, mailProvider, gmailCheck, sendHistory, TYPES,
  DIGEST_FREQUENCIES, loadSettings, saveSettings, nextSends,
} = require('../services/spendingReports');

const router = express.Router();

router.use(optionalAuth);

const validType = (req, res) => {
  const { type } = req.params;
  if (TYPES.includes(type)) return type;
  res.status(400).json({ error: `type must be one of ${TYPES.join(', ')}` });
  return null;
};

// What's configured, so the settings page can explain a missing setup.
router.get('/status', async (req, res) => {
  const [history, settings] = await Promise.all([sendHistory().catch(() => ({})), loadSettings()]);
  res.json({
    history,
    settings,
    digest_frequencies: DIGEST_FREQUENCIES,
    next: nextSends(settings),
    email_configured: mailProvider() !== null,
    provider: mailProvider(),
    gmail_check: gmailCheck(),
    recipient: process.env.REPORT_EMAIL_TO || (mailProvider() === 'gmail' ? String(process.env.GMAIL_USER).trim().replace(/^["']|["']$/g, '') : null) || req.user?.email || null,
    schedule: {
      digest: DIGEST_FREQUENCIES[settings.digest],
      monthly: '2nd of each month',
      quarterly: '3rd of January, April, July and October',
      annual: 'January 4th',
    },
  });
});

// Change how often the check-in is sent, or switch a lookback on or off.
// Body: any of { digest: <frequency>, monthly: bool, quarterly: bool, annual: bool }.
router.put('/settings', async (req, res) => {
  try {
    const result = await saveSettings(req.body || {});
    if (result.error) return res.status(400).json(result);
    res.json({ ...result, next: nextSends(result.settings) });
  } catch (error) {
    console.error('Error saving report settings:', error);
    res.status(500).json({ error: 'Failed to save report settings' });
  }
});

// → { subject, html }
router.get('/:type/preview', async (req, res) => {
  const type = validType(req, res);
  if (!type) return;
  try {
    const { subject, html } = await buildReport(type);
    res.json({ subject, html });
  } catch (error) {
    console.error('Error building report preview:', error);
    res.status(500).json({ error: 'Failed to build report' });
  }
});

router.post('/:type/send', async (req, res) => {
  const type = validType(req, res);
  if (!type) return;
  try {
    res.json(await sendReport(type, { force: true }));
  } catch (error) {
    console.error('Error sending report:', error);
    res.status(502).json({ error: error.message || 'Failed to send report' });
  }
});

module.exports = router;
