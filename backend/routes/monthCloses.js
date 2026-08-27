// Month closes: the server-side "books are closed" record for a month.
// Replaces the localStorage closedMonths set that Reports.tsx kept per year.
// A close freezes a stats snapshot so closed months don't drift as data is
// edited later; deleting a close reopens the month.

const express = require('express');
const { db, docToObj } = require('../services/database');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

router.use(optionalAuth);

const MONTH_RE = /^\d{4}-\d{2}$/;

function closeDocId(userId, month) {
  return `${userId}_${month}`;
}

// List closes, optionally filtered to a year (?year=2026)
router.get('/', async (req, res) => {
  try {
    const { year } = req.query;
    let query = db.collection('month_closes').where('user_id', '==', req.user.id);
    if (year) {
      query = query.where('month', '>=', `${year}-01`).where('month', '<=', `${year}-12`);
    }
    const snapshot = await query.get();
    const closes = snapshot.docs.map(docToObj).sort((a, b) => b.month.localeCompare(a.month));
    res.json(closes);
  } catch (error) {
    console.error('Error fetching month closes:', error);
    res.status(500).json({ error: 'Failed to fetch month closes' });
  }
});

// Get one month's close (404 = month is open)
router.get('/:month', async (req, res) => {
  try {
    const { month } = req.params;
    if (!MONTH_RE.test(month)) {
      return res.status(400).json({ error: 'month must be YYYY-MM' });
    }
    const doc = await db.collection('month_closes').doc(closeDocId(req.user.id, month)).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Month is not closed' });
    }
    res.json(docToObj(doc));
  } catch (error) {
    console.error('Error fetching month close:', error);
    res.status(500).json({ error: 'Failed to fetch month close' });
  }
});

// Close a month. Body: { month: 'YYYY-MM', stats?: {...frozen summary} }.
// Idempotent per month: closing an already-closed month refreshes its stats.
router.post('/', async (req, res) => {
  try {
    const { month, stats } = req.body;
    if (!month || !MONTH_RE.test(month)) {
      return res.status(400).json({ error: 'month (YYYY-MM) is required' });
    }
    const currentMonth = new Date().toISOString().substring(0, 7);
    if (month >= currentMonth) {
      return res.status(400).json({ error: 'Only past months can be closed' });
    }

    const data = {
      user_id: req.user.id,
      month,
      stats: stats || null,
      closed_at: new Date().toISOString(),
    };
    await db.collection('month_closes').doc(closeDocId(req.user.id, month)).set(data);
    res.status(201).json(data);
  } catch (error) {
    console.error('Error closing month:', error);
    res.status(500).json({ error: 'Failed to close month' });
  }
});

// Reopen a month
router.delete('/:month', async (req, res) => {
  try {
    const { month } = req.params;
    if (!MONTH_RE.test(month)) {
      return res.status(400).json({ error: 'month must be YYYY-MM' });
    }
    await db.collection('month_closes').doc(closeDocId(req.user.id, month)).delete();
    res.json({ message: `Reopened ${month}` });
  } catch (error) {
    console.error('Error reopening month:', error);
    res.status(500).json({ error: 'Failed to reopen month' });
  }
});

module.exports = router;
