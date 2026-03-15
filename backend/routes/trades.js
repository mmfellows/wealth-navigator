const express = require('express');
const { db, docToObj } = require('../services/database');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

const { v4: uuidv4 } = require('uuid');
const generateId = () => {
  return require('crypto').randomUUID ? require('crypto').randomUUID() : uuidv4();
};

// Get all trades
router.get('/', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const snapshot = await db.collection('trades')
      .where('user_id', '==', userId)
      .orderBy('date', 'desc')
      .orderBy('created_at', 'desc')
      .get();

    res.json(snapshot.docs.map(docToObj));
  } catch (error) {
    console.error('Error fetching trades:', error);
    res.status(500).json({ error: 'Failed to fetch trades' });
  }
});

// Add trade
router.post('/', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { ticker, type, shares, price, date, platform, rationale = '', strategy = 'Long' } = req.body;

    if (!ticker || !type || !shares || !price || !date || !platform) {
      return res.status(400).json({ error: 'All fields except rationale are required' });
    }

    if (!['buy', 'sell'].includes(type)) {
      return res.status(400).json({ error: 'Type must be buy or sell' });
    }

    const validStrategies = ['Trade', 'Swing', '1 Year', '5 Years', 'Long'];
    if (strategy && !validStrategies.includes(strategy)) {
      return res.status(400).json({ error: 'Invalid strategy. Must be one of: Trade, Swing, 1 Year, 5 Years, Long' });
    }

    const id = generateId();
    const data = {
      user_id: userId,
      ticker: ticker.toUpperCase(),
      type,
      shares,
      price,
      date,
      platform,
      rationale,
      strategy,
      created_at: new Date().toISOString(),
    };

    await db.collection('trades').doc(id).set(data);

    res.status(201).json({ id, ...data });
  } catch (error) {
    console.error('Error adding trade:', error);
    res.status(500).json({ error: 'Failed to add trade' });
  }
});

// Update trade rationale
router.patch('/:id', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { rationale } = req.body;

    if (rationale === undefined) {
      return res.status(400).json({ error: 'Rationale is required' });
    }

    const doc = await db.collection('trades').doc(id).get();
    if (!doc.exists || doc.data().user_id !== userId) {
      return res.status(404).json({ error: 'Trade not found' });
    }

    await db.collection('trades').doc(id).update({ rationale });

    const updatedDoc = await db.collection('trades').doc(id).get();
    res.json(docToObj(updatedDoc));
  } catch (error) {
    console.error('Error updating trade rationale:', error);
    res.status(500).json({ error: 'Failed to update trade rationale' });
  }
});

// Update trade
router.put('/:id', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const updates = req.body;

    const doc = await db.collection('trades').doc(id).get();
    if (!doc.exists || doc.data().user_id !== userId) {
      return res.status(404).json({ error: 'Trade not found' });
    }

    const allowedFields = ['ticker', 'type', 'shares', 'price', 'date', 'platform', 'rationale', 'strategy'];
    const updateData = {};

    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        updateData[key] = key === 'ticker' ? updates[key].toUpperCase() : updates[key];
      }
    });

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    await db.collection('trades').doc(id).update(updateData);

    const updatedDoc = await db.collection('trades').doc(id).get();
    res.json(docToObj(updatedDoc));
  } catch (error) {
    console.error('Error updating trade:', error);
    res.status(500).json({ error: 'Failed to update trade' });
  }
});

// Delete trade
router.delete('/:id', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const doc = await db.collection('trades').doc(id).get();
    if (!doc.exists || doc.data().user_id !== userId) {
      return res.status(404).json({ error: 'Trade not found' });
    }

    await db.collection('trades').doc(id).delete();
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting trade:', error);
    res.status(500).json({ error: 'Failed to delete trade' });
  }
});

module.exports = router;
