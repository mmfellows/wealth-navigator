import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Edit, Trash2, TrendingUp, Shield, Dice1, Loader2, ChevronDown, ChevronRight, CheckCircle, MoreHorizontal, ArrowUpDown, ArrowUp, ArrowDown, Building } from 'lucide-react';
import { useIdeas, useAddIdea, useUpdateIdea, useDeleteIdea, useInvestments } from '../hooks/usePortfolio';
import axios from 'axios';

const Ideas: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingIdea, setEditingIdea] = useState<any>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState({
    ticker: '',
    category: 'growth',
    confidence: 'high',
    notes: '',
    price_target: ''
  });
  const [companyNamePreview, setCompanyNamePreview] = useState('');
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: 'asc' | 'desc' | null;
  }>({ key: '', direction: null });
  const menuRef = useRef<HTMLDivElement>(null);

  const { data: ideas = [], isLoading, error } = useIdeas();
  const { data: investments = [] } = useInvestments();
  const addIdeaMutation = useAddIdea();
  const updateIdeaMutation = useUpdateIdea();
  const deleteIdeaMutation = useDeleteIdea();

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortedIdeas = (ideas: any[]) => {
    if (!sortConfig.key || !sortConfig.direction) {
      return ideas;
    }

    return [...ideas].sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];

      // Handle different data types
      if (sortConfig.key === 'ticker' || sortConfig.key === 'name') {
        aValue = aValue?.toString().toLowerCase() || '';
        bValue = bValue?.toString().toLowerCase() || '';
      } else if (sortConfig.key === 'current_price' || sortConfig.key === 'price_target' || sortConfig.key === 'market_cap') {
        aValue = parseFloat(aValue) || 0;
        bValue = parseFloat(bValue) || 0;
      } else if (sortConfig.key === 'date_added' || sortConfig.key === 'dateAdded') {
        aValue = new Date(aValue || 0).getTime();
        bValue = new Date(bValue || 0).getTime();
      } else if (sortConfig.key === 'confidence') {
        const confidenceOrder = { high: 3, medium: 2, low: 1 };
        aValue = confidenceOrder[aValue as keyof typeof confidenceOrder] || 0;
        bValue = confidenceOrder[bValue as keyof typeof confidenceOrder] || 0;
      } else if (sortConfig.key === 'category') {
        const categoryOrder = { 'low-risk': 1, growth: 2, speculative: 3 };
        aValue = categoryOrder[aValue as keyof typeof categoryOrder] || 0;
        bValue = categoryOrder[bValue as keyof typeof categoryOrder] || 0;
      } else if (sortConfig.key === 'market_cap_category') {
        const capOrder = { small: 1, mid: 2, large: 3 };
        aValue = capOrder[aValue as keyof typeof capOrder] || 0;
        bValue = capOrder[bValue as keyof typeof capOrder] || 0;
      }

      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  };

  const filteredAndSortedIdeas = getSortedIdeas(
    selectedCategory === 'all'
      ? ideas
      : ideas.filter(idea => idea.category === selectedCategory)
  );

  // Create a set of tickers from portfolio for quick lookup
  const portfolioTickers = new Set(investments.map(inv => inv.ticker));

  const checkHoldings = (ticker: string) => {
    return portfolioTickers.has(ticker.toUpperCase());
  };

  // Debounced company name lookup
  const fetchCompanyName = useCallback(async (ticker: string) => {
    if (!ticker || ticker.length === 0) {
      setCompanyNamePreview('');
      return;
    }

    setIsLoadingPreview(true);
    try {
      const response = await axios.get(`http://localhost:3001/api/ideas/company-name/${ticker}`);
      setCompanyNamePreview(response.data.name);
    } catch (error) {
      console.error('Failed to fetch company name:', error);
      setCompanyNamePreview('');
    } finally {
      setIsLoadingPreview(false);
    }
  }, []);

  // Debounce the company name lookup
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (formData.ticker.trim().length >= 1) {
        fetchCompanyName(formData.ticker.trim());
      } else {
        setCompanyNamePreview('');
        setIsLoadingPreview(false);
      }
    }, 500); // 500ms delay

    return () => clearTimeout(timeoutId);
  }, [formData.ticker, fetchCompanyName]);

  // Handle clicking outside to close menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const toggleMenu = (ideaId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setOpenMenuId(openMenuId === ideaId ? null : ideaId);
  };

  const handleEditIdea = (idea: any) => {
    setEditingIdea(idea);
    setFormData({
      ticker: idea.ticker,
      category: idea.category,
      confidence: idea.confidence || 'medium',
      notes: idea.notes,
      price_target: idea.price_target ? idea.price_target.toString() : ''
    });
    setCompanyNamePreview(idea.name);
    setShowAddForm(true);
    setOpenMenuId(null);
  };

  const resetForm = () => {
    setFormData({ ticker: '', category: 'growth', confidence: 'high', notes: '', price_target: '' });
    setCompanyNamePreview('');
    setEditingIdea(null);
    setShowAddForm(false);
  };

  const handleSubmitIdea = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.ticker || !formData.notes) {
      alert('Ticker and notes are required');
      return;
    }

    try {
      if (editingIdea) {
        // Update existing idea
        await updateIdeaMutation.mutateAsync({
          ideaId: editingIdea.id,
          updates: {
            ticker: formData.ticker.toUpperCase(),
            category: formData.category as 'low-risk' | 'growth' | 'speculative',
            confidence: formData.confidence as 'high' | 'medium' | 'low',
            notes: formData.notes,
            price_target: formData.price_target ? parseFloat(formData.price_target) : null
          }
        });
      } else {
        // Add new idea
        await addIdeaMutation.mutateAsync({
          ticker: formData.ticker.toUpperCase(),
          category: formData.category as 'low-risk' | 'growth' | 'speculative',
          confidence: formData.confidence as 'high' | 'medium' | 'low',
          notes: formData.notes,
          price_target: formData.price_target ? parseFloat(formData.price_target) : null
        });
      }

      resetForm();
    } catch (error) {
      console.error('Failed to save idea:', error);
      alert(`Failed to ${editingIdea ? 'update' : 'add'} investment idea`);
    }
  };

  const handleDeleteIdea = async (ideaId: string) => {
    if (window.confirm('Are you sure you want to delete this investment idea?')) {
      try {
        await deleteIdeaMutation.mutateAsync(ideaId);
      } catch (error) {
        console.error('Failed to delete idea:', error);
        alert('Failed to delete investment idea');
      }
    }
  };

  const toggleRowExpansion = (ideaId: string) => {
    const newExpandedRows = new Set(expandedRows);
    if (newExpandedRows.has(ideaId)) {
      newExpandedRows.delete(ideaId);
    } else {
      newExpandedRows.add(ideaId);
    }
    setExpandedRows(newExpandedRows);
    setOpenMenuId(null); // Close any open menus when toggling rows
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading investment ideas...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">Failed to load investment ideas. Please try again.</p>
      </div>
    );
  }

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

  const getConfidenceLabel = (confidence: string) => {
    switch (confidence) {
      case 'high': return 'High Confidence';
      case 'medium': return 'Medium Confidence';
      case 'low': return 'Low Confidence';
      default: return 'Unknown';
    }
  };

  const getSortIcon = (columnKey: string) => {
    if (sortConfig.key !== columnKey || !sortConfig.direction) {
      return <ArrowUpDown className="h-3 w-3 text-gray-400" />;
    }
    return sortConfig.direction === 'asc' ? (
      <ArrowUp className="h-3 w-3 text-blue-600" />
    ) : (
      <ArrowDown className="h-3 w-3 text-blue-600" />
    );
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
        <h1 className="text-3xl font-bold text-gray-900">My Best 20 Ideas</h1>
        <button
          onClick={() => setShowAddForm(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Idea
        </button>
      </div>

      <div className="flex space-x-4">
        {[
          { key: 'all', label: 'All Ideas' },
          { key: 'low-risk', label: 'Low Risk' },
          { key: 'growth', label: 'Growth' },
          { key: 'speculative', label: 'Speculative' }
        ].map((category) => (
          <button
            key={category.key}
            onClick={() => setSelectedCategory(category.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium ${
              selectedCategory === category.key
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {category.label}
          </button>
        ))}
      </div>

      {showAddForm && (
        <div className="bg-white rounded-lg p-6 shadow-sm border">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            {editingIdea ? 'Edit Investment Idea' : 'Add New Investment Idea'}
          </h2>
          <form onSubmit={handleSubmitIdea}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Ticker Symbol *</label>
                <input
                  type="text"
                  placeholder="e.g., AAPL"
                  value={formData.ticker}
                  onChange={(e) => setFormData(prev => ({ ...prev, ticker: e.target.value.toUpperCase() }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
                {formData.ticker && (
                  <div className="mt-2 min-h-[20px]">
                    {isLoadingPreview ? (
                      <div className="flex items-center text-xs text-gray-500">
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        Looking up company...
                      </div>
                    ) : companyNamePreview ? (
                      <div className="text-sm text-gray-600">
                        📈 {companyNamePreview}
                      </div>
                    ) : formData.ticker.length > 0 ? (
                      <div className="text-xs text-red-500">
                        Company not found - please verify ticker symbol
                      </div>
                    ) : null}
                  </div>
                )}
                {!formData.ticker && (
                  <p className="mt-1 text-xs text-gray-500">Company name will be fetched automatically</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="low-risk">Low Risk</option>
                  <option value="growth">Growth</option>
                  <option value="speculative">Speculative</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Confidence Level</label>
                <select
                  value={formData.confidence}
                  onChange={(e) => setFormData(prev => ({ ...prev, confidence: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="high">High Confidence</option>
                  <option value="medium">Medium Confidence</option>
                  <option value="low">Low Confidence</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Price Target (Optional)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-gray-500 sm:text-sm">$</span>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formData.price_target}
                    onChange={(e) => setFormData(prev => ({ ...prev, price_target: e.target.value }))}
                    className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">The price you'd consider buying this stock</p>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Investment Rationale *</label>
                <textarea
                  rows={3}
                  placeholder="Why do you think this is a good investment opportunity?"
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <div className="md:col-span-2 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addIdeaMutation.isPending || updateIdeaMutation.isPending}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  {(addIdeaMutation.isPending || updateIdeaMutation.isPending) ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      {editingIdea ? 'Updating...' : 'Adding...'}
                    </>
                  ) : (
                    editingIdea ? 'Update Idea' : 'Add Idea'
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {filteredAndSortedIdeas.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500">No investment ideas found. Add your first idea!</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="w-8 px-3 py-3"></th>
                  <th className="w-16 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('ticker')}
                      className="flex items-center space-x-1 hover:text-gray-700 focus:outline-none"
                    >
                      <span>Ticker</span>
                      {getSortIcon('ticker')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('name')}
                      className="flex items-center space-x-1 hover:text-gray-700 focus:outline-none"
                    >
                      <span>Company</span>
                      {getSortIcon('name')}
                    </button>
                  </th>
                  <th className="w-20 px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('current_price')}
                      className="flex items-center space-x-1 hover:text-gray-700 focus:outline-none ml-auto"
                    >
                      <span>Price</span>
                      {getSortIcon('current_price')}
                    </button>
                  </th>
                  <th className="w-20 px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('price_target')}
                      className="flex items-center space-x-1 hover:text-gray-700 focus:outline-none ml-auto"
                    >
                      <span>Target</span>
                      {getSortIcon('price_target')}
                    </button>
                  </th>
                  <th className="w-24 px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('market_cap')}
                      className="flex items-center space-x-1 hover:text-gray-700 focus:outline-none ml-auto"
                    >
                      <span>Market Cap</span>
                      {getSortIcon('market_cap')}
                    </button>
                  </th>
                  <th className="w-20 px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('market_cap_category')}
                      className="flex items-center space-x-1 hover:text-gray-700 focus:outline-none mx-auto"
                    >
                      <span>Cap</span>
                      {getSortIcon('market_cap_category')}
                    </button>
                  </th>
                  <th className="w-24 px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('category')}
                      className="flex items-center space-x-1 hover:text-gray-700 focus:outline-none mx-auto"
                    >
                      <span>Category</span>
                      {getSortIcon('category')}
                    </button>
                  </th>
                  <th className="w-20 px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('confidence')}
                      className="flex items-center space-x-1 hover:text-gray-700 focus:outline-none mx-auto"
                    >
                      <span>Conf.</span>
                      {getSortIcon('confidence')}
                    </button>
                  </th>
                  <th className="w-16 px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Owned
                  </th>
                  <th className="w-20 px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('date_added')}
                      className="flex items-center space-x-1 hover:text-gray-700 focus:outline-none mx-auto"
                    >
                      <span>Added</span>
                      {getSortIcon('date_added')}
                    </button>
                  </th>
                  <th className="w-12 px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    •••
                  </th>
                </tr>
              </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredAndSortedIdeas.map((idea) => {
                const Icon = getCategoryIcon(idea.category);
                const isExpanded = expandedRows.has(idea.id);
                return (
                  <React.Fragment key={idea.id}>
                    <tr
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => toggleRowExpansion(idea.id)}
                    >
                      <td className="px-3 py-3 whitespace-nowrap">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        )}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="text-sm font-bold text-gray-900">{idea.ticker}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-900 truncate max-w-xs" title={idea.name}>
                          {idea.name}
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-right">
                        <div className="text-sm font-semibold text-green-600">
                          ${idea.current_price ? idea.current_price.toFixed(2) : '--'}
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-right">
                        <div className="text-sm font-semibold text-blue-600">
                          {idea.price_target ? `$${idea.price_target.toFixed(2)}` : '--'}
                        </div>
                      </td>
                      <td className="px-2 py-3 whitespace-nowrap text-right">
                        <div className="text-sm font-medium text-gray-900">
                          {formatMarketCap(idea.market_cap)}
                        </div>
                      </td>
                      <td className="px-2 py-3 whitespace-nowrap text-center">
                        <div className={`inline-flex items-center justify-center px-2 py-1 rounded-full text-xs font-medium border ${getMarketCapCategoryColor(idea.market_cap_category || 'mid')}`} title={`${getMarketCapCategoryLabel(idea.market_cap_category || 'mid')} - ${formatMarketCap(idea.market_cap)}`}>
                          <Building className="h-3 w-3 mr-1" />
                          {idea.market_cap_category ? idea.market_cap_category.charAt(0).toUpperCase() : 'M'}
                        </div>
                      </td>
                      <td className="px-2 py-3 whitespace-nowrap text-center">
                        <div className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-medium ${getCategoryColor(idea.category)}`} title={idea.category.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}>
                          <Icon className="h-4 w-4" />
                        </div>
                      </td>
                      <td className="px-2 py-3 whitespace-nowrap text-center">
                        <div className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold ${getConfidenceColor(idea.confidence || 'medium')}`} title={getConfidenceLabel(idea.confidence || 'medium')}>
                          {(idea.confidence || 'medium').charAt(0).toUpperCase()}
                        </div>
                      </td>
                      <td className="px-2 py-3 whitespace-nowrap text-center">
                        {checkHoldings(idea.ticker) ? (
                          <CheckCircle className="h-4 w-4 text-green-500 mx-auto" title="Owned" />
                        ) : (
                          <div className="w-4 h-4 rounded-full border-2 border-gray-300 mx-auto" title="Not Owned" />
                        )}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-center">
                        <div className="text-xs text-gray-500">
                          {new Date(idea.date_added || idea.dateAdded).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                      </td>
                      <td className="px-2 py-3 whitespace-nowrap text-center">
                        <div className="relative" ref={openMenuId === idea.id ? menuRef : null}>
                          <button
                            className="p-1 text-gray-400 hover:text-gray-600"
                            onClick={(e) => toggleMenu(idea.id, e)}
                            title="More actions"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                          {openMenuId === idea.id && (
                            <div className="absolute right-0 top-8 w-32 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50">
                              <button
                                className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditIdea(idea);
                                }}
                                title="Edit idea"
                              >
                                <Edit className="h-3 w-3 mr-2" />
                                Edit
                              </button>
                              <button
                                className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-gray-100 flex items-center"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenuId(null);
                                  handleDeleteIdea(idea.id);
                                }}
                                disabled={deleteIdeaMutation.isPending}
                                title="Delete idea"
                              >
                                <Trash2 className="h-3 w-3 mr-2" />
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={12} className="px-6 py-4 bg-gray-50">
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
      )}
    </div>
  );
};

export default Ideas;