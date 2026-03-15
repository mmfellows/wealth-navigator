const express = require('express');
const { db, docToObj } = require('../services/database');
const stockService = require('../services/stockService');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

const { v4: uuidv4 } = require('uuid');
const generateId = () => {
  return require('crypto').randomUUID ? require('crypto').randomUUID() : uuidv4();
};

// Get company name for ticker
router.get('/company-name/:ticker', optionalAuth, async (req, res) => {
  try {
    const { ticker } = req.params;
    if (!ticker || ticker.length === 0) {
      return res.status(400).json({ error: 'Ticker is required' });
    }
    const companyName = await stockService.getCompanyName(ticker);
    res.json({ ticker: ticker.toUpperCase(), name: companyName });
  } catch (error) {
    console.error('Error fetching company name:', error);
    res.status(500).json({ error: 'Failed to fetch company name' });
  }
});

// Get all ideas
router.get('/', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { category } = req.query;

    let query = db.collection('ideas').where('user_id', '==', userId);

    if (category && category !== 'all') {
      query = query.where('category', '==', category);
    }

    const snapshot = await query.orderBy('date_added', 'desc').get();
    const ideas = snapshot.docs.map(docToObj);

    // Update current prices and market caps
    const tickers = [...new Set(ideas.map(idea => idea.ticker))];
    if (tickers.length > 0) {
      const currentPrices = await stockService.getMultiplePrices(tickers);

      for (const idea of ideas) {
        const currentPrice = currentPrices[idea.ticker];
        const updateData = {};

        if (currentPrice && currentPrice !== idea.current_price) {
          idea.current_price = currentPrice;
          updateData.current_price = currentPrice;
        }

        if (!idea.market_cap || !idea.market_cap_category) {
          try {
            const marketCap = await stockService.getMarketCap(idea.ticker);
            const marketCapCategory = stockService.getMarketCapCategory(marketCap);
            idea.market_cap = marketCap;
            idea.market_cap_category = marketCapCategory;
            updateData.market_cap = marketCap;
            updateData.market_cap_category = marketCapCategory;
          } catch (error) {
            console.error(`Error updating market cap for ${idea.ticker}:`, error);
          }
        }

        if (Object.keys(updateData).length > 0) {
          await db.collection('ideas').doc(idea.id).update(updateData);
        }
      }
    }

    res.json(ideas);
  } catch (error) {
    console.error('Error fetching ideas:', error);
    res.status(500).json({ error: 'Failed to fetch investment ideas' });
  }
});

// Add idea
router.post('/', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { ticker, category, confidence = 'medium', notes, price_target } = req.body;

    if (!ticker || !category || !notes) {
      return res.status(400).json({ error: 'Ticker, category, and notes are required' });
    }

    if (!['low-risk', 'growth', 'speculative'].includes(category)) {
      return res.status(400).json({ error: 'Category must be low-risk, growth, or speculative' });
    }

    if (!['high', 'medium', 'low'].includes(confidence)) {
      return res.status(400).json({ error: 'Confidence must be high, medium, or low' });
    }

    const currentPrice = await stockService.getStockPrice(ticker);
    const companyName = await stockService.getCompanyName(ticker);
    const marketCap = await stockService.getMarketCap(ticker);
    const marketCapCategory = stockService.getMarketCapCategory(marketCap);

    const id = generateId();
    const data = {
      user_id: userId,
      ticker: ticker.toUpperCase(),
      name: companyName,
      category,
      confidence,
      current_price: currentPrice,
      notes,
      price_target: price_target || null,
      market_cap: marketCap,
      market_cap_category: marketCapCategory,
      date_added: new Date().toISOString().split('T')[0],
      created_at: new Date().toISOString(),
    };

    await db.collection('ideas').doc(id).set(data);

    res.status(201).json({ id, ...data });
  } catch (error) {
    console.error('Error adding idea:', error);
    res.status(500).json({ error: 'Failed to add investment idea' });
  }
});

// Update idea
router.put('/:id', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const updates = req.body;

    const doc = await db.collection('ideas').doc(id).get();
    if (!doc.exists || doc.data().user_id !== userId) {
      return res.status(404).json({ error: 'Investment idea not found' });
    }

    const allowedFields = ['ticker', 'name', 'category', 'confidence', 'notes', 'price_target'];
    const updateData = {};

    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        updateData[key] = key === 'ticker' ? updates[key].toUpperCase() : updates[key];
      }
    });

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    await db.collection('ideas').doc(id).update(updateData);

    const updatedDoc = await db.collection('ideas').doc(id).get();
    res.json(docToObj(updatedDoc));
  } catch (error) {
    console.error('Error updating idea:', error);
    res.status(500).json({ error: 'Failed to update investment idea' });
  }
});

// Delete idea
router.delete('/:id', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const doc = await db.collection('ideas').doc(id).get();
    if (!doc.exists || doc.data().user_id !== userId) {
      return res.status(404).json({ error: 'Investment idea not found' });
    }

    await db.collection('ideas').doc(id).delete();
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting idea:', error);
    res.status(500).json({ error: 'Failed to delete investment idea' });
  }
});

module.exports = router;
