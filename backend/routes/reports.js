// Emailed spending reports, on demand: preview the HTML in the browser or
// send one to yourself now. The scheduled sends live in routes/internal.js.

const express = require('express');
const { optionalAuth } = require('../middleware/auth');
const { buildReport, sendReport, TYPES } = require('../services/spendingReports');

const router = express.Router();

router.use(optionalAuth);

const validType = (req, res) => {
  const { type } = req.params;
  if (TYPES.includes(type)) return type;
  res.status(400).json({ error: `type must be one of ${TYPES.join(', ')}` });
  return null;
};

// What's configured, so the settings page can explain a missing setup.
router.get('/status', (req, res) => {
  res.json({
    email_configured: !!process.env.RESEND_API_KEY,
    recipient: process.env.REPORT_EMAIL_TO || req.user?.email || null,
    schedule: {
      digest: '8th and 22nd of each month',
      monthly: '2nd of each month',
      quarterly: '3rd of January, April, July and October',
      annual: 'January 4th',
    },
  });
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
