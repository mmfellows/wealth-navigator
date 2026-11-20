const express = require('express');
const { db, docToObj } = require('../services/database');
const { optionalAuth } = require('../middleware/auth');
const { getCategoryEnvelopes, linesForYear } = require('../services/budgetEnvelopes');

const router = express.Router();

router.use(optionalAuth);

// Derived monthly budget per category (sum of active line items).
// ?month=YYYY-MM scopes to items active in that month.
router.get('/envelopes', async (req, res) => {
  try {
    const envelopes = await getCategoryEnvelopes(req.query.month);
    res.json(envelopes);
  } catch (error) {
    console.error('Error computing envelopes:', error);
    res.status(500).json({ error: 'Failed to compute budget envelopes' });
  }
});

// What the budget would look like if it matched actual spending over the
// last 6 or 12 complete months (?months=6|12), per subcategory and per line.
router.get('/recommendations', async (req, res) => {
  try {
    const { getBudgetRecommendations } = require('../services/budgetRecommendations');
    const year = Number(req.query.year) || undefined;
    res.json(await getBudgetRecommendations(Number(req.query.months) === 6 ? 6 : 12, new Date(), year));
  } catch (error) {
    console.error('Error computing budget recommendations:', error);
    res.status(500).json({ error: 'Failed to compute budget recommendations' });
  }
});

// Get all budget items
router.get('/', async (req, res) => {
  try {
    // Lines for one plan year (?year=YYYY, default this year). A year with
    // no plan of its own gets the plan it inherits; ?strict=1 returns only
    // lines that belong to that exact year.
    const snapshot = await db.collection('budget_items').orderBy('created_at').get();
    const all = snapshot.docs.map(docToObj);
    const year = Number(req.query.year) || new Date().getFullYear();
    const items = req.query.strict === '1'
      ? all.filter(i => i.plan_year === year)
      : linesForYear(all, year);
    res.json(items);
  } catch (error) {
    console.error('Error fetching budget items:', error);
    res.status(500).json({ error: 'Failed to fetch budget items' });
  }
});

// Create a budget item
router.post('/', async (req, res) => {
  try {
    const { itemName, mainCategory, secondaryCategory, frequency, amount, startDate, endDate } = req.body;
    // A new line joins the plan year it was created under; by default that's
    // whichever plan is in force this year.
    let planYear = Number(req.body.plan_year) || null;
    if (!planYear) {
      const all = (await db.collection('budget_items').get()).docs.map(d => d.data());
      const current = linesForYear(all, new Date().getFullYear());
      planYear = current.length ? (current[0].plan_year || null) : null;
    }
    if (!itemName || !mainCategory || !secondaryCategory || !frequency) {
      return res.status(400).json({ error: 'itemName, mainCategory, secondaryCategory, and frequency are required' });
    }

    const monthlyExpectedSpend = frequency === 'annual' ? amount / 12 : amount;

    const data = {
      itemName,
      mainCategory,
      secondaryCategory,
      frequency,
      amount: Number(amount),
      ...(planYear ? { plan_year: planYear } : {}),
      startDate: startDate || new Date().toISOString().split('T')[0],
      endDate: endDate || null,
      monthlyExpectedSpend,
      status: 'active',
      archivedDate: null,
      priceHistory: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const ref = await db.collection('budget_items').add(data);
    res.status(201).json({ id: ref.id, ...data });
  } catch (error) {
    console.error('Error creating budget item:', error);
    res.status(500).json({ error: 'Failed to create budget item' });
  }
});

// Update a budget item
router.put('/:id', async (req, res) => {
  try {
    const docRef = db.collection('budget_items').doc(req.params.id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Budget item not found' });
    }

    const updateData = { ...req.body, updated_at: new Date().toISOString() };
    await docRef.update(updateData);

    const updated = await docRef.get();
    res.json(docToObj(updated));
  } catch (error) {
    console.error('Error updating budget item:', error);
    res.status(500).json({ error: 'Failed to update budget item' });
  }
});

// Delete a budget item
router.delete('/:id', async (req, res) => {
  try {
    await db.collection('budget_items').doc(req.params.id).delete();
    res.json({ message: 'Budget item deleted' });
  } catch (error) {
    console.error('Error deleting budget item:', error);
    res.status(500).json({ error: 'Failed to delete budget item' });
  }
});

// Seed default budget items (only if collection is empty)
router.post('/seed', async (req, res) => {
  try {
    const snapshot = await db.collection('budget_items').limit(1).get();
    if (!snapshot.empty) {
      return res.json({ message: 'Budget items already exist, skipping seed' });
    }

    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array is required' });
    }

    const batch = db.batch();
    const now = new Date().toISOString();
    items.forEach(item => {
      const ref = db.collection('budget_items').doc();
      batch.set(ref, {
        ...item,
        created_at: now,
        updated_at: now,
      });
    });
    await batch.commit();

    res.status(201).json({ message: `Seeded ${items.length} budget items` });
  } catch (error) {
    console.error('Error seeding budget items:', error);
    res.status(500).json({ error: 'Failed to seed budget items' });
  }
});

module.exports = router;
