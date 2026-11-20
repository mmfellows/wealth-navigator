// Planned costs: one-off expenses you know are coming (flights in March, a
// car repair, holiday gifts). Each is pinned to a month and a category, and
// is added to that month's envelope (see services/budgetEnvelopes.js) so
// pacing doesn't flag a known cost as overspending.

const express = require('express');
const { db, docToObj } = require('../services/database');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

router.use(optionalAuth);

const MONTH_RE = /^\d{4}-\d{2}$/;

// List planned costs. ?from=YYYY-MM returns that month onward.
router.get('/', async (req, res) => {
  try {
    const { from } = req.query;
    const snapshot = await db.collection('planned_costs').get();
    let costs = snapshot.docs.map(docToObj);
    if (from && MONTH_RE.test(from)) costs = costs.filter(c => c.month >= from);
    costs.sort((a, b) => a.month.localeCompare(b.month) || (b.amount - a.amount));
    res.json({ planned_costs: costs });
  } catch (error) {
    console.error('Error fetching planned costs:', error);
    res.status(500).json({ error: 'Failed to fetch planned costs' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, amount, month, category, subcategory, note } = req.body;
    const value = Number(amount);
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name is required' });
    if (!Number.isFinite(value) || value <= 0) return res.status(400).json({ error: 'amount must be a positive number' });
    if (!month || !MONTH_RE.test(month)) return res.status(400).json({ error: 'month must be YYYY-MM' });

    const data = {
      name: String(name).trim(),
      amount: value,
      month,
      category: category || 'Special Expense',
      subcategory: subcategory || null,
      note: note || null,
      user_id: req.user?.id || null,
      created_at: new Date().toISOString(),
    };
    const ref = await db.collection('planned_costs').add(data);
    res.status(201).json({ id: ref.id, ...data });
  } catch (error) {
    console.error('Error creating planned cost:', error);
    res.status(500).json({ error: 'Failed to create planned cost' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const ref = db.collection('planned_costs').doc(req.params.id);
    if (!(await ref.get()).exists) return res.status(404).json({ error: 'Planned cost not found' });
    await ref.delete();
    res.json({ message: 'Planned cost removed' });
  } catch (error) {
    console.error('Error deleting planned cost:', error);
    res.status(500).json({ error: 'Failed to delete planned cost' });
  }
});

module.exports = router;
