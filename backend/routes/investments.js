const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db, docToObj } = require('../services/database');
const stockService = require('../services/stockService');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

const generateId = () => {
  return require('crypto').randomUUID ? require('crypto').randomUUID() : uuidv4();
};

// Get all investments
router.get('/', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const snapshot = await db.collection('investments')
      .where('user_id', '==', userId)
      .orderBy('purchase_date', 'desc')
      .get();
    const investments = snapshot.docs.map(docToObj);

    // Update current prices
    const tickers = [...new Set(investments.map(inv => inv.ticker))];
    if (tickers.length > 0) {
      const currentPrices = await stockService.getMultiplePrices(tickers);

      for (const investment of investments) {
        const currentPrice = currentPrices[investment.ticker];
        if (currentPrice && currentPrice !== investment.current_price) {
          investment.current_price = currentPrice;
          await db.collection('investments').doc(investment.id).update({
            current_price: currentPrice,
          });
        }
      }
    }

    res.json(investments);
  } catch (error) {
    console.error('Error fetching investments:', error);
    res.status(500).json({ error: 'Failed to fetch investments' });
  }
});

// Add investment
router.post('/', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { ticker, name, shares, purchasePrice, purchaseDate, platform, category } = req.body;

    if (!ticker || !shares || !purchasePrice || !purchaseDate || !platform || !category) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const currentPrice = await stockService.getStockPrice(ticker);
    const id = generateId();

    const data = {
      user_id: userId,
      ticker: ticker.toUpperCase(),
      name: name || '',
      shares,
      current_price: currentPrice,
      purchase_price: purchasePrice,
      purchase_date: purchaseDate,
      platform,
      category,
      created_at: new Date().toISOString(),
    };

    await db.collection('investments').doc(id).set(data);

    res.status(201).json({ id, ...data });
  } catch (error) {
    console.error('Error adding investment:', error);
    res.status(500).json({ error: 'Failed to add investment' });
  }
});

// Update investment
router.put('/:id', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const updates = req.body;

    // Verify ownership
    const doc = await db.collection('investments').doc(id).get();
    if (!doc.exists || doc.data().user_id !== userId) {
      return res.status(404).json({ error: 'Investment not found' });
    }

    const allowedFields = ['ticker', 'name', 'shares', 'purchase_price', 'purchase_date', 'platform', 'category'];
    const updateData = {};

    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        updateData[key] = updates[key];
      }
    });

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    await db.collection('investments').doc(id).update(updateData);

    const updatedDoc = await db.collection('investments').doc(id).get();
    res.json(docToObj(updatedDoc));
  } catch (error) {
    console.error('Error updating investment:', error);
    res.status(500).json({ error: 'Failed to update investment' });
  }
});

// Delete investment
router.delete('/:id', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const doc = await db.collection('investments').doc(id).get();
    if (!doc.exists || doc.data().user_id !== userId) {
      return res.status(404).json({ error: 'Investment not found' });
    }

    await db.collection('investments').doc(id).delete();
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting investment:', error);
    res.status(500).json({ error: 'Failed to delete investment' });
  }
});

module.exports = router;
