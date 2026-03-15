const express = require('express');
const { db, docToObj } = require('../services/database');
const stockService = require('../services/stockService');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Get portfolio metrics
router.get('/metrics', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get all investments
    const snapshot = await db.collection('investments').where('user_id', '==', userId).get();
    const investments = snapshot.docs.map(docToObj);

    // Update current prices
    const tickers = [...new Set(investments.map(inv => inv.ticker))];
    const currentPrices = await stockService.getMultiplePrices(tickers);

    // Update investments with current prices
    for (const investment of investments) {
      const currentPrice = currentPrices[investment.ticker];
      if (currentPrice) {
        investment.current_price = currentPrice;
        await db.collection('investments').doc(investment.id).update({
          current_price: currentPrice,
        });
      }
    }

    // Calculate metrics
    let totalInvested = 0;
    let currentValue = 0;
    const categoryBreakdown = {
      retirement: { amount: 0, percentage: 0 },
      lowRisk: { amount: 0, percentage: 0 },
      growth: { amount: 0, percentage: 0 },
      speculative: { amount: 0, percentage: 0 }
    };

    investments.forEach(investment => {
      const investedAmount = investment.shares * investment.purchase_price;
      const currentAmount = investment.shares * (investment.current_price || investment.purchase_price);

      totalInvested += investedAmount;
      currentValue += currentAmount;

      const categoryMap = {
        'retirement': 'retirement',
        'low-risk': 'lowRisk',
        'growth': 'growth',
        'speculative': 'speculative'
      };

      const category = categoryMap[investment.category] || 'growth';
      categoryBreakdown[category].amount += currentAmount;
    });

    // Calculate percentages
    Object.keys(categoryBreakdown).forEach(category => {
      categoryBreakdown[category].percentage = currentValue > 0
        ? (categoryBreakdown[category].amount / currentValue) * 100
        : 0;
    });

    const totalCash = 65000;
    const netWorth = currentValue + totalCash;

    res.json({
      netWorth,
      totalInvested: currentValue,
      totalCash,
      categoryBreakdown
    });
  } catch (error) {
    console.error('Error calculating portfolio metrics:', error);
    res.status(500).json({ error: 'Failed to calculate portfolio metrics' });
  }
});

module.exports = router;
