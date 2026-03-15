import React, { useState, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown, Shield, Dice1, ChevronDown, ChevronRight, Settings, Building } from 'lucide-react';
import { useIdeas } from '../hooks/usePortfolio';

const Portfolio: React.FC = () => {
  const [selectedPlatform, setSelectedPlatform] = useState('all');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [showColumnToggle, setShowColumnToggle] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem('portfolio_visible_columns');
    if (saved) {
      try { return JSON.parse(saved); } catch { /* fall through */ }
    }
    return {
      platform: true,
      shares: true,
      currentPrice: true,
      costBasis: true,
      target: true,
      marketCap: true,
      maturity: true,
      currentValue: true,
      gainLoss: true,
      category: true,
      confidence: true
    };
  });
  const { data: ideas = [] } = useIdeas();
  const columnToggleRef = useRef<HTMLDivElement>(null);

  const mockInvestments = [
    {
      id: '1',
      ticker: 'AAPL',
      name: 'Apple Inc.',
      shares: 50,
      currentPrice: 175.43,
      purchasePrice: 162.50,
      purchaseDate: '2023-11-15',
      platform: 'etrade',
      category: 'growth',
      currentValue: 8771.50,
      totalGainLoss: 646.50,
      percentGainLoss: 7.95
    },
    {
      id: '2',
      ticker: 'MSFT',
      name: 'Microsoft Corporation',
      shares: 25,
      currentPrice: 378.85,
      purchasePrice: 365.20,
      purchaseDate: '2023-12-01',
      platform: 'schwab',
      category: 'growth',
      currentValue: 9471.25,
      totalGainLoss: 341.25,
      percentGainLoss: 3.74
    },
    {
      id: '3',
      ticker: 'JNJ',
      name: 'Johnson & Johnson',
      shares: 75,
      currentPrice: 162.87,
      purchasePrice: 168.40,
      purchaseDate: '2023-10-20',
      platform: 'chase',
      category: 'low-risk',
      currentValue: 12215.25,
      totalGainLoss: -414.75,
      percentGainLoss: -3.29
    }
  ];

  const filteredInvestments = selectedPlatform === 'all'
    ? mockInvestments
    : mockInvestments.filter(investment => investment.platform === selectedPlatform);

  const totalPortfolioValue = mockInvestments.reduce((sum, investment) => sum + investment.currentValue, 0);
  const totalGainLoss = mockInvestments.reduce((sum, investment) => sum + investment.totalGainLoss, 0);
  const totalPercentGainLoss = (totalGainLoss / (totalPortfolioValue - totalGainLoss)) * 100;

  // Handle clicking outside to close column toggle
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (columnToggleRef.current && !columnToggleRef.current.contains(event.target as Node)) {
        setShowColumnToggle(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const toggleColumnVisibility = (column: string) => {
    setVisibleColumns((prev: typeof visibleColumns) => {
      const updated = { ...prev, [column]: !prev[column as keyof typeof prev] };
      localStorage.setItem('portfolio_visible_columns', JSON.stringify(updated));
      return updated;
    });
  };

  const toggleRowExpansion = (investmentId: string) => {
    const newExpandedRows = new Set(expandedRows);
    if (newExpandedRows.has(investmentId)) {
      newExpandedRows.delete(investmentId);
    } else {
      newExpandedRows.add(investmentId);
    }
    setExpandedRows(newExpandedRows);
  };

  const getIdeaForTicker = (ticker: string) => {
    return ideas.find(idea => idea.ticker === ticker);
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'low-risk': return Shield;
      case 'growth': return TrendingUp;
      case 'speculative': return Dice1;
      default: return TrendingUp;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'low-risk': return 'text-green-600 bg-green-100';
      case 'growth': return 'text-blue-600 bg-blue-100';
      case 'speculative': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'high': return 'text-green-700 bg-green-50 border-green-200';
      case 'medium': return 'text-yellow-700 bg-yellow-50 border-yellow-200';
      case 'low': return 'text-red-700 bg-red-50 border-red-200';
      default: return 'text-gray-700 bg-gray-50 border-gray-200';
    }
  };

  const formatMarketCap = (marketCap: number) => {
    if (!marketCap) return '--';
    if (marketCap >= 1000000000000) { // Trillions
      return `$${(marketCap / 1000000000000).toFixed(1)}T`;
    } else if (marketCap >= 1000000000) { // Billions
      return `$${(marketCap / 1000000000).toFixed(1)}B`;
    } else if (marketCap >= 1000000) { // Millions
      return `$${(marketCap / 1000000).toFixed(1)}M`;
    } else {
      return `$${marketCap.toLocaleString()}`;
    }
  };

  const getMarketCapCategoryColor = (category: string) => {
    switch (category) {
      case 'large': return 'text-purple-700 bg-purple-100 border-purple-200';
      case 'mid': return 'text-blue-700 bg-blue-100 border-blue-200';
      case 'small': return 'text-orange-700 bg-orange-100 border-orange-200';
      default: return 'text-gray-700 bg-gray-100 border-gray-200';
    }
  };

  const getMarketCapCategoryLabel = (category: string) => {
    switch (category) {
      case 'large': return 'Large Cap';
      case 'mid': return 'Mid Cap';
      case 'small': return 'Small Cap';
      default: return 'Unknown';
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Portfolio</h1>
          <div className="flex items-center space-x-6 mt-2">
            <div className="text-sm text-gray-600">
              Total Value: <span className="font-semibold text-gray-900">${totalPortfolioValue.toLocaleString()}</span>
            </div>
            <div className={`text-sm ${totalGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              Total Gain/Loss: <span className="font-semibold">
                ${Math.abs(totalGainLoss).toLocaleString()} ({totalPercentGainLoss > 0 ? '+' : ''}{totalPercentGainLoss.toFixed(2)}%)
              </span>
            </div>
          </div>
        </div>
        <div className="relative" ref={columnToggleRef}>
          <button
            onClick={() => setShowColumnToggle(!showColumnToggle)}
            className="flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
          >
            <Settings className="h-4 w-4 mr-2" />
            Columns
          </button>
          {showColumnToggle && (
            <div className="absolute right-0 top-12 w-64 bg-white rounded-md shadow-lg border border-gray-200 py-2 z-50">
              <div className="px-4 py-2 text-sm font-medium text-gray-900 border-b border-gray-100">
                Show/Hide Columns
              </div>
              {[
                { key: 'platform', label: 'Platform' },
                { key: 'shares', label: 'Shares' },
                { key: 'currentPrice', label: 'Current Price' },
                { key: 'costBasis', label: 'Cost Basis' },
                { key: 'target', label: 'Target' },
                { key: 'marketCap', label: 'Market Cap' },
                { key: 'maturity', label: 'Maturity' },
                { key: 'currentValue', label: 'Current Value' },
                { key: 'gainLoss', label: 'Gain/Loss' },
                { key: 'category', label: 'Category' },
                { key: 'confidence', label: 'Confidence' }
              ].map((column) => (
                <button
                  key={column.key}
                  onClick={() => toggleColumnVisibility(column.key)}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center justify-between"
                >
                  <span>{column.label}</span>
                  <div className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                    visibleColumns[column.key as keyof typeof visibleColumns]
                      ? 'bg-green-600'
                      : 'bg-gray-200'
                  }`}>
                    <span className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white transition-transform ${
                      visibleColumns[column.key as keyof typeof visibleColumns]
                        ? 'translate-x-3.5'
                        : 'translate-x-0.5'
                    }`} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex space-x-4">
        {[
          { key: 'all', label: 'All Platforms' },
          { key: 'etrade', label: 'E*Trade' },
          { key: 'schwab', label: 'Schwab' },
          { key: 'chase', label: 'Chase' }
        ].map((platform) => (
          <button
            key={platform.key}
            onClick={() => setSelectedPlatform(platform.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium ${
              selectedPlatform === platform.key
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {platform.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-8 px-3 py-3"></th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Security
                </th>
                {visibleColumns.platform && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Platform
                  </th>
                )}
                {visibleColumns.shares && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Shares
                  </th>
                )}
                {visibleColumns.currentPrice && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Current Price
                  </th>
                )}
                {visibleColumns.costBasis && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cost Basis
                  </th>
                )}
                {visibleColumns.target && (
                  <th className="w-20 px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Target
                  </th>
                )}
                {visibleColumns.marketCap && (
                  <th className="w-20 px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Market Cap
                  </th>
                )}
                {visibleColumns.maturity && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Maturity
                  </th>
                )}
                {visibleColumns.currentValue && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Current Value
                  </th>
                )}
                {visibleColumns.gainLoss && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Gain/Loss
                  </th>
                )}
                {visibleColumns.category && (
                  <th className="w-24 px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category
                  </th>
                )}
                {visibleColumns.confidence && (
                  <th className="w-20 px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Conf.
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredInvestments.map((investment) => {
                const idea = getIdeaForTicker(investment.ticker);
                const isExpanded = expandedRows.has(investment.id);
                return (
                  <React.Fragment key={investment.id}>
                    <tr
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => toggleRowExpansion(investment.id)}
                    >
                      <td className="px-3 py-3 whitespace-nowrap">
                        {idea ? (
                          isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-gray-400" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-gray-400" />
                          )
                        ) : (
                          <div className="w-4 h-4" />
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{investment.ticker}</div>
                          <div className="text-sm text-gray-500">{investment.name}</div>
                        </div>
                      </td>
                      {visibleColumns.platform && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full capitalize">
                            {investment.platform}
                          </span>
                        </td>
                      )}
                      {visibleColumns.shares && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {investment.shares}
                        </td>
                      )}
                      {visibleColumns.currentPrice && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          ${investment.currentPrice.toFixed(2)}
                        </td>
                      )}
                      {visibleColumns.costBasis && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          ${investment.purchasePrice.toFixed(2)}
                        </td>
                      )}
                      {visibleColumns.target && (
                        <td className="px-3 py-3 whitespace-nowrap text-right">
                          <div className="text-sm font-semibold text-blue-600">
                            {idea?.price_target ? `$${idea.price_target.toFixed(2)}` : '--'}
                          </div>
                        </td>
                      )}
                      {visibleColumns.marketCap && (
                        <td className="px-2 py-3 whitespace-nowrap text-center">
                          {idea ? (
                            <div className={`inline-flex items-center justify-center px-2 py-1 rounded-full text-xs font-medium border ${getMarketCapCategoryColor(idea.market_cap_category || 'mid')}`} title={`${getMarketCapCategoryLabel(idea.market_cap_category || 'mid')} - ${formatMarketCap(idea.market_cap)}`}>
                              <Building className="h-3 w-3 mr-1" />
                              {idea.market_cap_category ? idea.market_cap_category.charAt(0).toUpperCase() : 'M'}
                            </div>
                          ) : (
                            <div className="text-xs text-gray-400">--</div>
                          )}
                        </td>
                      )}
                      {visibleColumns.maturity && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          {(() => {
                            const purchaseDate = new Date(investment.purchaseDate);
                            const currentDate = new Date();
                            const monthsDiff = (currentDate.getFullYear() - purchaseDate.getFullYear()) * 12 +
                                              (currentDate.getMonth() - purchaseDate.getMonth());
                            const maturityMonths = Math.min(monthsDiff, 12);
                            const progressPercent = (maturityMonths / 12) * 100;
                            const isFullyMature = monthsDiff >= 12;

                            return (
                              <div className="w-full">
                                <div className="flex items-center space-x-2">
                                  <div className="flex-1 bg-gray-200 rounded-full h-2">
                                    <div
                                      className={`h-2 rounded-full transition-all ${
                                        isFullyMature ? 'bg-green-500' : 'bg-blue-500'
                                      }`}
                                      style={{ width: `${progressPercent}%` }}
                                    />
                                  </div>
                                  <span className={`text-xs font-medium ${
                                    isFullyMature ? 'text-green-600' : 'text-gray-600'
                                  }`}>
                                    {monthsDiff >= 12 ? '12+' : monthsDiff}mo
                                  </span>
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                  {isFullyMature ? 'Long-term gains' : 'Short-term gains'}
                                </div>
                              </div>
                            );
                          })()}
                        </td>
                      )}
                      {visibleColumns.currentValue && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          ${investment.currentValue.toLocaleString()}
                        </td>
                      )}
                      {visibleColumns.gainLoss && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className={`flex items-center ${investment.totalGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {investment.totalGainLoss >= 0 ? (
                              <TrendingUp className="h-4 w-4 mr-1" />
                            ) : (
                              <TrendingDown className="h-4 w-4 mr-1" />
                            )}
                            <div className="text-sm">
                              <div className="font-medium">
                                ${Math.abs(investment.totalGainLoss).toLocaleString()}
                              </div>
                              <div className="text-xs">
                                ({investment.percentGainLoss > 0 ? '+' : ''}{investment.percentGainLoss.toFixed(2)}%)
                              </div>
                            </div>
                          </div>
                        </td>
                      )}
                      {visibleColumns.category && (
                        <td className="px-2 py-3 whitespace-nowrap text-center">
                          {idea ? (
                            <div className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-medium ${getCategoryColor(idea.category)}`} title={idea.category.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}>
                              {(() => {
                                const Icon = getCategoryIcon(idea.category);
                                return <Icon className="h-4 w-4" />;
                              })()}
                            </div>
                          ) : (
                            <div className="text-xs text-gray-400">--</div>
                          )}
                        </td>
                      )}
                      {visibleColumns.confidence && (
                        <td className="px-2 py-3 whitespace-nowrap text-center">
                          {idea ? (
                            <div className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold ${getConfidenceColor(idea.confidence || 'medium')}`} title={`${idea.confidence || 'medium'} confidence`.replace(/\b\w/g, l => l.toUpperCase())}>
                              {(idea.confidence || 'medium').charAt(0).toUpperCase()}
                            </div>
                          ) : (
                            <div className="text-xs text-gray-400">--</div>
                          )}
                        </td>
                      )}
                    </tr>
                    {isExpanded && idea && (
                      <tr>
                        <td colSpan={Object.values(visibleColumns).filter(Boolean).length + 2} className="px-6 py-4 bg-gray-50">
                          <div className="text-sm text-gray-700">
                            <h4 className="font-medium text-gray-900 mb-2">Investment Rationale:</h4>
                            <p className="whitespace-pre-wrap">{idea.notes}</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg p-6 shadow-sm border">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Best Performer</h3>
          <div className="text-2xl font-bold text-green-600">AAPL</div>
          <div className="text-sm text-gray-600">+7.95% gain</div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow-sm border">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Worst Performer</h3>
          <div className="text-2xl font-bold text-red-600">JNJ</div>
          <div className="text-sm text-gray-600">-3.29% loss</div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow-sm border">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Largest Position</h3>
          <div className="text-2xl font-bold text-gray-900">JNJ</div>
          <div className="text-sm text-gray-600">${mockInvestments.find(i => i.ticker === 'JNJ')?.currentValue.toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
};

export default Portfolio;