const express = require('express');
const stockService = require('../services/stockService');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Get stock price
router.get('/:ticker/price', optionalAuth, async (req, res) => {
  try {
    const { ticker } = req.params;
    const price = await stockService.getStockPrice(ticker.toUpperCase());

    res.json({ ticker: ticker.toUpperCase(), price });
  } catch (error) {
    console.error('Error fetching stock price:', error);
    res.status(500).json({ error: 'Failed to fetch stock price' });
  }
});

// Search stocks
router.get('/search', optionalAuth, async (req, res) => {
  try {
    const { q: query } = req.query;

    if (!query) {
      return res.status(400).json({ error: 'Search query required' });
    }

    const results = await stockService.searchStocks(query);
    res.json(results);
  } catch (error) {
    console.error('Error searching stocks:', error);
    res.status(500).json({ error: 'Failed to search stocks' });
  }
});

// Get multiple stock prices
router.post('/prices', optionalAuth, async (req, res) => {
  try {
    const { tickers } = req.body;

    if (!Array.isArray(tickers)) {
      return res.status(400).json({ error: 'Tickers array required' });
    }

    const prices = await stockService.getMultiplePrices(tickers);
    res.json(prices);
  } catch (error) {
    console.error('Error fetching multiple prices:', error);
    res.status(500).json({ error: 'Failed to fetch prices' });
  }
});

module.exports = router;