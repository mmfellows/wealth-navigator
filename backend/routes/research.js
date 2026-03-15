const express = require('express');
const { db } = require('../services/database');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Submit research query
router.post('/query', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const mockResponse = generateMockResponse(query);

    // Save query to Firestore
    await db.collection('research_queries').add({
      user_id: userId,
      query,
      response: mockResponse,
      created_at: new Date().toISOString(),
    });

    res.json({
      query,
      response: mockResponse,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error processing research query:', error);
    res.status(500).json({ error: 'Failed to process research query' });
  }
});

// Get research history
router.get('/history', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 20 } = req.query;

    const snapshot = await db.collection('research_queries')
      .where('user_id', '==', userId)
      .orderBy('created_at', 'desc')
      .limit(parseInt(limit))
      .get();

    const queries = snapshot.docs.map(doc => {
      const data = doc.data();
      return { query: data.query, response: data.response, created_at: data.created_at };
    });

    res.json(queries);
  } catch (error) {
    console.error('Error fetching research history:', error);
    res.status(500).json({ error: 'Failed to fetch research history' });
  }
});

// Generate mock AI response
function generateMockResponse(query) {
  const lowerQuery = query.toLowerCase();

  if (lowerQuery.includes('dividend')) {
    return `Based on current market analysis, here are some strong dividend stocks to consider:

**Top Dividend Stocks:**
• **Johnson & Johnson (JNJ)** - 3.2% yield, healthcare sector, consistent 60+ year dividend growth
• **Coca-Cola (KO)** - 3.1% yield, consumer staples, reliable dividend aristocrat
• **Microsoft (MSFT)** - 0.7% yield, but strong dividend growth potential with cloud revenue

**Key Considerations:**
- Look for dividend aristocrats with 25+ years of consecutive increases
- Consider dividend yield vs. growth balance
- Evaluate payout ratios (ideally under 60%)
- Diversify across sectors for stability

*Note: This is AI-generated research for educational purposes. Always consult with financial advisors and do your own due diligence.*`;
  }

  if (lowerQuery.includes('technical analysis') || lowerQuery.includes('chart')) {
    const ticker = extractTicker(query);
    return `Technical Analysis${ticker ? ` for ${ticker}` : ''}:

**Current Market Indicators:**
• **RSI**: Currently at 45-55 range (neutral territory)
• **Moving Averages**: 50-day MA crossing above 200-day MA (bullish signal)
• **Support/Resistance**: Key support at recent lows, resistance at recent highs
• **Volume**: Above average volume suggests institutional interest

**Trading Signals:**
- Short-term: Cautiously optimistic
- Medium-term: Bullish trend continuation likely
- Risk Level: Moderate

**Recommended Strategy:**
Consider dollar-cost averaging into positions with proper risk management.

*This is AI-generated analysis for educational purposes. Not financial advice.*`;
  }

  if (lowerQuery.includes('etf') || lowerQuery.includes('index')) {
    return `**Top ETF Recommendations by Category:**

**Broad Market:**
• **VTI** - Total Stock Market ETF (0.03% expense ratio)
• **SPY** - S&P 500 ETF (0.09% expense ratio)

**Technology:**
• **QQQ** - Nasdaq-100 ETF
• **VGT** - Vanguard Information Technology ETF

**International:**
• **VXUS** - Total International Stock ETF
• **VEA** - Developed Markets ETF

**Bonds (Low Risk):**
• **BND** - Total Bond Market ETF
• **SCHZ** - Intermediate-Term Treasury ETF

**Key Benefits:**
- Instant diversification
- Low expense ratios
- Professional management
- High liquidity

*Research expense ratios and holdings before investing.*`;
  }

  return `I've analyzed your query about "${query}". Here are some key insights:

**Market Overview:**
Current market conditions suggest a mixed outlook with both opportunities and risks present.

**Investment Considerations:**
• Diversification remains crucial across asset classes
• Consider your risk tolerance and investment timeline
• Dollar-cost averaging can help manage volatility
• Stay informed about economic indicators and earnings reports

**Next Steps:**
1. Research specific companies or sectors that interest you
2. Review your current portfolio allocation
3. Consider consulting with a financial advisor
4. Set up alerts for stocks on your watchlist

*This is AI-generated research for educational purposes. Always do your own due diligence and consider consulting financial professionals.*`;
}

function extractTicker(query) {
  const tickerRegex = /\b[A-Z]{1,5}\b/g;
  const matches = query.match(tickerRegex);
  return matches ? matches[0] : null;
}

module.exports = router;
