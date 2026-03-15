import React, { useState, useEffect } from 'react';
import { Key, TestTube, CheckCircle, XCircle, AlertTriangle, Loader2, TrendingUp, TrendingDown, DollarSign, Building2, RefreshCw } from 'lucide-react';

const ApiTesting: React.FC = () => {
  const [etradeConfig, setEtradeConfig] = useState({
    consumerKey: '',
    consumerSecret: '',
    sandboxMode: false
  });
  const [testResults, setTestResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [portfolioData, setPortfolioData] = useState<any[]>([]);
  const [accountSummary, setAccountSummary] = useState<any>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'loading' | 'auth-required'>('disconnected');
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [showOAuthModal, setShowOAuthModal] = useState(false);
  const [requestToken, setRequestToken] = useState<string | null>(null);
  const [requestTokenSecret, setRequestTokenSecret] = useState<string | null>(null);
  const [verifierCode, setVerifierCode] = useState('');
  const [lastPriceUpdate, setLastPriceUpdate] = useState<Date | null>(null);
  const [priceUpdateInterval, setPriceUpdateInterval] = useState<NodeJS.Timeout | null>(null);

  // Load ETrade keys on component mount
  useEffect(() => {
    loadEtradeKeys();
  }, []);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (priceUpdateInterval) {
        clearInterval(priceUpdateInterval);
      }
    };
  }, [priceUpdateInterval]);

  const loadEtradeKeys = async () => {
    try {
      const response = await fetch('/api/settings/etrade-keys');
      const result = await response.json();

      if (result.success && result.keys) {
        setEtradeConfig(result.keys);
        // Check authentication status
        if (result.keys.consumerKey && result.keys.consumerSecret) {
          await checkAuthStatus();
        }
      }
    } catch (error) {
      console.error('Failed to load ETrade keys:', error);
    }
  };

  const checkAuthStatus = async () => {
    try {
      const response = await fetch('/api/etrade/auth-status');
      const result = await response.json();

      if (result.success) {
        if (result.authenticated) {
          await fetchPortfolioData();
        } else if (result.configured) {
          setConnectionStatus('auth-required');
        } else {
          setConnectionStatus('disconnected');
        }
      }
    } catch (error) {
      console.error('Failed to check auth status:', error);
      setConnectionStatus('disconnected');
    }
  };

  const handleConfigChange = (field: string, value: string | boolean) => {
    setEtradeConfig(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const fetchPortfolioData = async () => {
    setConnectionStatus('loading');
    setIsLoading(true);

    try {
      // Fetch real portfolio data from ETrade API
      const portfolioResponse = await fetch('/api/etrade/portfolio', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!portfolioResponse.ok) {
        const errorData = await portfolioResponse.json();
        if (errorData.requiresAuth) {
          setConnectionStatus('auth-required');
          return;
        }
        throw new Error(errorData.message || 'Failed to fetch portfolio data');
      }

      const portfolioData = await portfolioResponse.json();

      if (portfolioData.success) {
        setAccountSummary(portfolioData.accounts);
        setPortfolioData(portfolioData.positions || []);
        setConnectionStatus('connected');

        setTestResults(prev => [{
          timestamp: new Date().toLocaleTimeString(),
          test: 'Portfolio Data',
          status: 'success',
          message: `Loaded ${portfolioData.positions?.length || 0} positions from ${portfolioData.accounts?.length || 0} accounts`,
          details: portfolioData
        }, ...prev]);

        // Start real-time price updates if we have positions
        if (portfolioData.positions && portfolioData.positions.length > 0) {
          setTimeout(() => startRealTimePriceUpdates(), 1000);
        }
      } else {
        throw new Error(portfolioData.message || 'Unknown error');
      }

    } catch (error) {
      console.error('Failed to fetch portfolio data:', error);
      setConnectionStatus('auth-required');
      setTestResults(prev => [{
        timestamp: new Date().toLocaleTimeString(),
        test: 'Portfolio Data',
        status: 'error',
        message: 'Failed to fetch portfolio data',
        details: { error: error.message }
      }, ...prev]);
    } finally {
      setIsLoading(false);
    }
  };

  const startOAuthFlow = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/etrade/oauth/request-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error('Failed to start OAuth flow');
      }

      const result = await response.json();
      if (result.success) {
        setRequestToken(result.requestToken);
        setRequestTokenSecret(result.requestTokenSecret);
        setAuthUrl(result.authorizationURL);
        setShowOAuthModal(true);

        // Open authorization URL in new window
        window.open(result.authorizationURL, '_blank');
      } else {
        throw new Error(result.message || 'OAuth initialization failed');
      }
    } catch (error) {
      console.error('OAuth flow error:', error);
      setTestResults(prev => [{
        timestamp: new Date().toLocaleTimeString(),
        test: 'OAuth Authentication',
        status: 'error',
        message: 'Failed to start OAuth flow',
        details: { error: error.message }
      }, ...prev]);
    } finally {
      setIsLoading(false);
    }
  };

  const completeOAuthFlow = async () => {
    if (!requestToken || !requestTokenSecret || !verifierCode) {
      alert('Please enter the verification code');
      return;
    }

    try {
      setIsLoading(true);
      const response = await fetch('/api/etrade/oauth/access-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requestToken,
          requestTokenSecret,
          verifier: verifierCode
        })
      });

      if (!response.ok) {
        throw new Error('Failed to complete OAuth flow');
      }

      const result = await response.json();
      if (result.success) {
        setShowOAuthModal(false);
        setVerifierCode('');
        setTestResults(prev => [{
          timestamp: new Date().toLocaleTimeString(),
          test: 'OAuth Authentication',
          status: 'success',
          message: 'OAuth authentication completed successfully',
          details: result
        }, ...prev]);

        // Now fetch portfolio data
        await fetchPortfolioData();
      } else {
        throw new Error(result.message || 'OAuth completion failed');
      }
    } catch (error) {
      console.error('OAuth completion error:', error);
      setTestResults(prev => [{
        timestamp: new Date().toLocaleTimeString(),
        test: 'OAuth Authentication',
        status: 'error',
        message: 'Failed to complete OAuth flow',
        details: { error: error.message }
      }, ...prev]);
    } finally {
      setIsLoading(false);
    }
  };

  const updateRealTimePrices = async () => {
    if (portfolioData.length === 0 || connectionStatus !== 'connected') {
      return;
    }

    try {
      const symbols = portfolioData.map(position => position.symbol);
      const response = await fetch('/api/etrade/quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ symbols })
      });

      if (!response.ok) {
        throw new Error('Failed to fetch updated quotes');
      }

      const quotesData = await response.json();

      if (quotesData.success && quotesData.quotes) {
        // Update portfolio data with new prices
        const updatedPortfolio = portfolioData.map(position => {
          const quote = quotesData.quotes.find(q => q.symbol === position.symbol);
          if (quote && quote.lastPrice && !quote.error) {
            const newPrice = quote.lastPrice;
            const newMarketValue = newPrice * position.quantity;
            const newGainLoss = newMarketValue - position.costBasis;
            const newGainLossPercent = position.costBasis > 0 ? (newGainLoss / position.costBasis) * 100 : 0;

            return {
              ...position,
              currentPrice: newPrice,
              marketValue: newMarketValue,
              gainLoss: newGainLoss,
              gainLossPercent: newGainLossPercent,
              dayChange: quote.change || position.dayChange,
              dayChangePercent: quote.changePercent || position.dayChangePercent
            };
          }
          return position;
        });

        setPortfolioData(updatedPortfolio);
        setLastPriceUpdate(new Date());
      }
    } catch (error) {
      console.error('Failed to update real-time prices:', error);
      // Don't show error to user for price updates, just log it
    }
  };

  const startRealTimePriceUpdates = () => {
    // Clear existing interval
    if (priceUpdateInterval) {
      clearInterval(priceUpdateInterval);
    }

    // Update prices immediately
    updateRealTimePrices();

    // Set up interval to update every 30 seconds
    const interval = setInterval(updateRealTimePrices, 30000);
    setPriceUpdateInterval(interval);
  };

  const stopRealTimePriceUpdates = () => {
    if (priceUpdateInterval) {
      clearInterval(priceUpdateInterval);
      setPriceUpdateInterval(null);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const formatPercent = (percent: number) => {
    return `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`;
  };

  const getTotalPortfolioValue = () => {
    return portfolioData.reduce((total, position) => total + position.marketValue, 0);
  };

  const getTotalGainLoss = () => {
    return portfolioData.reduce((total, position) => total + position.gainLoss, 0);
  };

  const getTotalGainLossPercent = () => {
    const totalCost = portfolioData.reduce((total, position) => total + position.costBasis, 0);
    const totalGain = getTotalGainLoss();
    return totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">ETrade Portfolio</h1>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${
              connectionStatus === 'connected' ? 'bg-green-500' :
              connectionStatus === 'loading' ? 'bg-yellow-500' :
              connectionStatus === 'auth-required' ? 'bg-orange-500' : 'bg-red-500'
            }`} />
            <span className="text-sm text-gray-600 capitalize">
              {connectionStatus === 'auth-required' ? 'auth required' : connectionStatus}
            </span>
          </div>
          {connectionStatus === 'auth-required' ? (
            <button
              onClick={startOAuthFlow}
              disabled={isLoading}
              className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              <Key className="h-4 w-4" />
              <span>Authenticate</span>
            </button>
          ) : (
            <button
              onClick={() => fetchPortfolioData()}
              disabled={isLoading || !etradeConfig.consumerKey || connectionStatus !== 'connected'}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          )}
        </div>
      </div>

      {/* Portfolio Summary Cards */}
      {connectionStatus === 'connected' && portfolioData.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg p-6 shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Portfolio Value</p>
                <p className="text-3xl font-bold text-gray-900">{formatCurrency(getTotalPortfolioValue())}</p>
              </div>
              <DollarSign className="h-12 w-12 text-blue-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Gain/Loss</p>
                <p className={`text-3xl font-bold ${getTotalGainLoss() >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(getTotalGainLoss())}
                </p>
                <div className={`flex items-center mt-2 ${getTotalGainLoss() >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {getTotalGainLoss() >= 0 ? <TrendingUp className="h-4 w-4 mr-1" /> : <TrendingDown className="h-4 w-4 mr-1" />}
                  <span className="text-sm font-medium">{formatPercent(getTotalGainLossPercent())}</span>
                </div>
              </div>
              {getTotalGainLoss() >= 0 ? <TrendingUp className="h-12 w-12 text-green-500" /> : <TrendingDown className="h-12 w-12 text-red-500" />}
            </div>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Positions</p>
                <p className="text-3xl font-bold text-gray-900">{portfolioData.length}</p>
                <p className="text-sm text-gray-500 mt-2">
                  Live Production Data
                </p>
              </div>
              <Building2 className="h-12 w-12 text-purple-500" />
            </div>
          </div>
        </div>
      )}

      {/* Portfolio Holdings Table */}
      {connectionStatus === 'connected' && portfolioData.length > 0 ? (
        <div className="bg-white rounded-lg p-6 shadow-sm border">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Portfolio Holdings</h2>
            <div className="flex items-center space-x-4">
              {priceUpdateInterval && (
                <div className="flex items-center space-x-2 text-green-600">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-sm font-medium">Live Updates</span>
                </div>
              )}
              <div className="text-sm text-gray-500">
                {lastPriceUpdate ? (
                  <>Prices updated: {lastPriceUpdate.toLocaleTimeString()}</>
                ) : (
                  <>Portfolio loaded: {new Date().toLocaleString()}</>
                )}
              </div>
              <button
                onClick={priceUpdateInterval ? stopRealTimePriceUpdates : startRealTimePriceUpdates}
                disabled={connectionStatus !== 'connected' || portfolioData.length === 0}
                className={`px-3 py-1 rounded-md text-sm font-medium ${
                  priceUpdateInterval
                    ? 'bg-red-100 text-red-700 hover:bg-red-200'
                    : 'bg-green-100 text-green-700 hover:bg-green-200'
                } disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed`}
              >
                {priceUpdateInterval ? 'Stop Updates' : 'Start Updates'}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Symbol
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Quantity
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Price
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Market Value
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cost Basis
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Gain/Loss
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Day Change
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {portfolioData.map((position) => (
                  <tr key={position.symbol} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {position.symbol}
                        </div>
                        <div className="text-sm text-gray-500">
                          {position.companyName}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                      {position.quantity.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                      {formatCurrency(position.currentPrice)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-gray-900">
                      {formatCurrency(position.marketValue)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-500">
                      {formatCurrency(position.costBasis)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className={`text-sm font-medium ${position.gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(position.gainLoss)}
                      </div>
                      <div className={`text-xs ${position.gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatPercent(position.gainLossPercent)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className={`text-sm ${position.dayChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(position.dayChange)}
                      </div>
                      <div className={`text-xs ${position.dayChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatPercent(position.dayChangePercent)}
                      </div>
                    </td>
                  </tr>
                ))}

                {/* Total Row */}
                <tr className="bg-gray-50 border-t-2 border-gray-300">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-semibold text-gray-900">Total Portfolio</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-500">
                    {portfolioData.length} positions
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap"></td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-gray-900">
                    {formatCurrency(getTotalPortfolioValue())}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-500">
                    {formatCurrency(portfolioData.reduce((total, position) => total + position.costBasis, 0))}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className={`text-sm font-bold ${getTotalGainLoss() >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(getTotalGainLoss())}
                    </div>
                    <div className={`text-xs ${getTotalGainLoss() >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatPercent(getTotalGainLossPercent())}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className={`text-sm ${portfolioData.reduce((total, position) => total + position.dayChange, 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(portfolioData.reduce((total, position) => total + position.dayChange, 0))}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : connectionStatus === 'auth-required' && !isLoading ? (
        <div className="bg-white rounded-lg p-8 shadow-sm border text-center">
          <AlertTriangle className="h-12 w-12 text-orange-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">ETrade Authentication Required</h3>
          <p className="text-gray-600 mb-6">
            Your ETrade API keys are configured, but you need to authenticate with ETrade to access your portfolio data.
          </p>
          <button
            onClick={startOAuthFlow}
            disabled={isLoading}
            className="px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            <Key className="h-4 w-4 inline mr-2" />
            Authenticate with ETrade
          </button>
        </div>
      ) : connectionStatus === 'disconnected' && !isLoading ? (
        <div className="bg-white rounded-lg p-8 shadow-sm border text-center">
          <Key className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">ETrade API Not Connected</h3>
          <p className="text-gray-600 mb-6">
            Configure your ETrade API keys in Settings to view your portfolio data.
          </p>
          <button
            onClick={() => window.location.href = '/settings'}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Go to Settings
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-lg p-8 shadow-sm border text-center">
          <Loader2 className="h-12 w-12 text-blue-600 mx-auto mb-4 animate-spin" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Loading Portfolio Data</h3>
          <p className="text-gray-600">Connecting to ETrade API...</p>
        </div>
      )}

      {/* OAuth Modal */}
      {showOAuthModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">ETrade OAuth Authentication</h3>
              <button
                onClick={() => setShowOAuthModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-4">
                  A new browser window has been opened to ETrade's authorization page. After authorizing the application,
                  you will receive a verification code. Please enter it below:
                </p>

                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Verification Code
                </label>
                <input
                  type="text"
                  value={verifierCode}
                  onChange={(e) => setVerifierCode(e.target.value)}
                  placeholder="Enter verification code"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={completeOAuthFlow}
                  disabled={!verifierCode || isLoading}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                      Verifying...
                    </>
                  ) : (
                    'Complete Authentication'
                  )}
                </button>
                <button
                  onClick={() => setShowOAuthModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>

              {authUrl && (
                <div className="mt-4 p-3 bg-gray-50 rounded-md">
                  <p className="text-xs text-gray-600 mb-2">Authorization URL:</p>
                  <a
                    href={authUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-800 break-all"
                  >
                    {authUrl}
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ApiTesting;