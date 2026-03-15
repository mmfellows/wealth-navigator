const express = require('express');
const { db, docToObj } = require('../services/database');

const router = express.Router();

// Get all budget items
router.get('/', async (req, res) => {
  try {
    const snapshot = await db.collection('budget_items').orderBy('created_at').get();
    const items = snapshot.docs.map(docToObj);
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
