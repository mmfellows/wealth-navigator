// Year plans: see services/budgetPlans.js.

const express = require('express');
const { optionalAuth } = require('../middleware/auth');
const { buildPlanView, ensureFrozen, startPlan, discardPlan, saveIncomeLines } = require('../services/budgetPlans');

const router = express.Router();

router.use(optionalAuth);

const yearOf = (req, res) => {
  const year = Number(req.params.year);
  if (Number.isInteger(year) && year >= 2000 && year <= 2100) return year;
  res.status(400).json({ error: 'year must be a four-digit year' });
  return null;
};

router.get('/:year', async (req, res) => {
  const year = yearOf(req, res);
  if (!year) return;
  try {
    await ensureFrozen(year);
    res.json(await buildPlanView(year));
  } catch (error) {
    console.error('Error building year plan:', error);
    res.status(500).json({ error: 'Failed to build year plan' });
  }
});

// Start a future year's plan from the current budget.
router.post('/:year/start', async (req, res) => {
  const year = yearOf(req, res);
  if (!year) return;
  try {
    const result = await startPlan(year);
    if (result.error) return res.status(400).json(result);
    res.status(201).json(result);
  } catch (error) {
    console.error('Error starting year plan:', error);
    res.status(500).json({ error: 'Failed to start year plan' });
  }
});

router.put('/:year/income', async (req, res) => {
  const year = yearOf(req, res);
  if (!year) return;
  try {
    const result = await saveIncomeLines(year, req.body.income_lines);
    if (result.error) return res.status(400).json(result);
    res.json(result);
  } catch (error) {
    console.error('Error saving planned income:', error);
    res.status(500).json({ error: 'Failed to save planned income' });
  }
});

router.delete('/:year', async (req, res) => {
  const year = yearOf(req, res);
  if (!year) return;
  try {
    const result = await discardPlan(year);
    if (result.error) return res.status(400).json(result);
    res.json(result);
  } catch (error) {
    console.error('Error discarding year plan:', error);
    res.status(500).json({ error: 'Failed to discard year plan' });
  }
});

module.exports = router;
