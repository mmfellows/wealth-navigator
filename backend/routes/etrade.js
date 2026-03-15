const express = require('express');
const db = require('../services/database');
const { optionalAuth } = require('../middleware/auth');
const EtradeService = require('../services/etradeService');

const router = express.Router();

// ETrade API testing endpoints
router.post('/test-connection', optionalAuth, async (req, res) => {
  try {
    const { consumerKey, consumerSecret, sandboxMode } = req.body;

    if (!consumerKey || !consumerSecret) {
      return res.status(400).json({
        success: false,
        message: 'Consumer key and secret are required'
      });
    }

    // Mock connection test for now - would implement actual ETrade OAuth flow
    const testResult = {
      success: true,
      message: 'ETrade API connection test successful',
      endpoint: sandboxMode ? 'sandbox' : 'production',
      timestamp: new Date().toISOString(),
      details: {
        consumerKey: consumerKey.slice(0, 8) + '...',
        sandboxMode,
        status: 'connected'
      }
    };

    res.json(testResult);
  } catch (error) {
    console.error('ETrade connection test error:', error);
    res.status(500).json({
      success: false,
      message: 'Connection test failed',
      error: error.message
    });
  }
});

router.post('/test-accounts', optionalAuth, async (req, res) => {
  try {
    const { consumerKey, consumerSecret, sandboxMode } = req.body;

    if (!consumerKey || !consumerSecret) {
      return res.status(400).json({
        success: false,
        message: 'Consumer key and secret are required'
      });
    }

    // Mock account data for testing
    const mockAccounts = [
      {
        accountId: '123456789',
        accountType: 'BROKERAGE',
        accountDescription: 'INDIVIDUAL',
        registrationType: 'INDIVIDUAL',
        institutionType: 'BROKERAGE',
        totalValue: 156847.32
      },
      {
        accountId: '987654321',
        accountType: 'IRA',
        accountDescription: 'TRADITIONAL IRA',
        registrationType: 'IRA',
        institutionType: 'BROKERAGE',
        totalValue: 89423.18
      }
    ];

    const testResult = {
      success: true,
      message: 'Account information retrieved successfully',
      accounts: mockAccounts,
      timestamp: new Date().toISOString()
    };

    res.json(testResult);
  } catch (error) {
    console.error('ETrade accounts test error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve account information',
      error: error.message
    });
  }
});

router.post('/test-market-data', optionalAuth, async (req, res) => {
  try {
    const { consumerKey, consumerSecret, sandboxMode, symbol } = req.body;

    if (!consumerKey || !consumerSecret) {
      return res.status(400).json({
        success: false,
        message: 'Consumer key and secret are required'
      });
    }

    const requestedSymbol = symbol || 'AAPL';

    // Mock market data for testing
    const mockQuote = {
      symbol: requestedSymbol,
      companyName: requestedSymbol === 'AAPL' ? 'Apple Inc.' : `${requestedSymbol} Company`,
      lastPrice: 175.43 + (Math.random() - 0.5) * 10,
      change: -2.31 + (Math.random() - 0.5) * 5,
      changePercent: -1.30 + (Math.random() - 0.5) * 3,
      volume: 45672891,
      marketCap: 2750000000000,
      peRatio: 28.4,
      week52High: 199.62,
      week52Low: 164.08,
      lastTradeTime: new Date().toISOString()
    };

    const testResult = {
      success: true,
      message: `Market data for ${requestedSymbol} retrieved successfully`,
      quote: mockQuote,
      timestamp: new Date().toISOString()
    };

    res.json(testResult);
  } catch (error) {
    console.error('ETrade market data test error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve market data',
      error: error.message
    });
  }
});

// OAuth flow endpoints
router.post('/oauth/request-token', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const etradeService = new EtradeService();

    await etradeService.initializeForUser(userId);

    const requestToken = await etradeService.getRequestToken();
    const authorizationURL = etradeService.getAuthorizationURL(requestToken.oauth_token);

    res.json({
      success: true,
      requestToken: requestToken.oauth_token,
      requestTokenSecret: requestToken.oauth_token_secret,
      authorizationURL
    });
  } catch (error) {
    console.error('OAuth request token error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get request token',
      error: error.message
    });
  }
});

router.post('/oauth/access-token', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { requestToken, requestTokenSecret, verifier } = req.body;

    if (!requestToken || !requestTokenSecret || !verifier) {
      return res.status(400).json({
        success: false,
        message: 'Request token, secret, and verifier are required'
      });
    }

    const etradeService = new EtradeService();
    await etradeService.initializeForUser(userId);

    const accessTokens = await etradeService.getAccessToken(requestToken, requestTokenSecret, verifier);
    await etradeService.saveAccessTokens(userId);

    res.json({
      success: true,
      message: 'Access tokens saved successfully',
      authenticated: true
    });
  } catch (error) {
    console.error('OAuth access token error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get access token',
      error: error.message
    });
  }
});

// Real portfolio data endpoint
router.post('/portfolio', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const etradeService = new EtradeService();

    const initialized = await etradeService.initializeForUser(userId);
    if (!initialized) {
      return res.status(400).json({
        success: false,
        message: 'ETrade API keys not configured'
      });
    }

    if (!etradeService.isAuthenticated()) {
      return res.status(401).json({
        success: false,
        message: 'ETrade OAuth authentication required',
        requiresAuth: true
      });
    }

    // Get account list
    const accountList = await etradeService.getAccountList();

    if (!accountList || !accountList.AccountListResponse || !accountList.AccountListResponse.Accounts) {
      return res.status(404).json({
        success: false,
        message: 'No accounts found'
      });
    }

    const accounts = accountList.AccountListResponse.Accounts.Account;
    const portfolioPositions = [];

    // Get portfolio for each account
    for (const account of accounts) {
      try {
        const accountKey = account.accountIdKey;
        const portfolio = await etradeService.getPortfolioPositions(accountKey);

        if (portfolio && portfolio.PortfolioResponse && portfolio.PortfolioResponse.AccountPortfolio) {
          const positions = portfolio.PortfolioResponse.AccountPortfolio[0].Position || [];

          for (const position of positions) {
            const positionData = position.Product;
            const instrument = position.Instrument[0];

            portfolioPositions.push({
              symbol: positionData.symbol,
              companyName: positionData.companyName || positionData.symbol,
              quantity: parseFloat(position.quantity || 0),
              currentPrice: parseFloat(position.Quick?.lastTrade || position.marketValue / position.quantity || 0),
              marketValue: parseFloat(position.marketValue || 0),
              costBasis: parseFloat(position.costPerShare * position.quantity || 0),
              gainLoss: parseFloat(position.totalGainLoss || 0),
              gainLossPercent: parseFloat(position.totalGainLossPct || 0),
              dayChange: parseFloat(position.Quick?.change || 0),
              dayChangePercent: parseFloat(position.Quick?.changePct || 0),
              accountId: account.accountId,
              accountType: account.accountType
            });
          }
        }
      } catch (accountError) {
        console.error(`Error fetching portfolio for account ${account.accountId}:`, accountError);
        // Continue with other accounts
      }
    }

    res.json({
      success: true,
      accounts: accounts.map(acc => ({
        accountId: acc.accountId,
        accountType: acc.accountType,
        accountDescription: acc.accountDesc,
        totalValue: 0 // Will be calculated from positions
      })),
      positions: portfolioPositions,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Portfolio fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch portfolio data',
      error: error.message
    });
  }
});

// Get real-time quotes for portfolio positions
router.post('/quotes', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { symbols } = req.body;

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Symbols array is required'
      });
    }

    const etradeService = new EtradeService();
    const initialized = await etradeService.initializeForUser(userId);

    if (!initialized || !etradeService.isAuthenticated()) {
      return res.status(401).json({
        success: false,
        message: 'ETrade authentication required'
      });
    }

    const quotes = [];

    // Fetch quotes for each symbol
    for (const symbol of symbols) {
      try {
        const quote = await etradeService.getQuote(symbol);

        if (quote && quote.QuoteResponse && quote.QuoteResponse.QuoteData) {
          const quoteData = quote.QuoteResponse.QuoteData[0];

          quotes.push({
            symbol: symbol,
            lastPrice: parseFloat(quoteData.Product?.lastTrade || quoteData.All?.lastTrade || 0),
            change: parseFloat(quoteData.Product?.change || quoteData.All?.change || 0),
            changePercent: parseFloat(quoteData.Product?.changePct || quoteData.All?.changePct || 0),
            volume: parseInt(quoteData.Product?.volume || quoteData.All?.volume || 0),
            lastTradeTime: quoteData.Product?.lastTradeTime || quoteData.All?.lastTradeTime || new Date().toISOString()
          });
        }
      } catch (symbolError) {
        console.error(`Error fetching quote for ${symbol}:`, symbolError);
        // Add error entry for this symbol
        quotes.push({
          symbol: symbol,
          error: 'Failed to fetch quote',
          lastPrice: null,
          change: null,
          changePercent: null
        });
      }
    }

    res.json({
      success: true,
      quotes,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Quotes fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch quotes',
      error: error.message
    });
  }
});

// Check authentication status
router.get('/auth-status', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const etradeService = new EtradeService();

    const initialized = await etradeService.initializeForUser(userId);
    if (!initialized) {
      return res.json({
        success: true,
        authenticated: false,
        configured: false
      });
    }

    res.json({
      success: true,
      authenticated: etradeService.isAuthenticated(),
      configured: true
    });
  } catch (error) {
    console.error('Auth status check error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check authentication status'
    });
  }
});

module.exports = router;