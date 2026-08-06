import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Edit, Trash2, TrendingUp, Shield, Dice1, Loader2, ChevronDown, ChevronRight, CheckCircle, MoreHorizontal, ArrowUpDown, ArrowUp, ArrowDown, Building, Target } from 'lucide-react';
import { useIdeas, useAddIdea, useUpdateIdea, useDeleteIdea, useInvestments } from '../hooks/usePortfolio';
import { Card, Button } from '../components/ui';
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
    price_target: '',
    intended_bet_type: '',
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
      const response = await axios.get(`/api/ideas/company-name/${ticker}`);
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
      price_target: idea.price_target ? idea.price_target.toString() : '',
      intended_bet_type: idea.intended_bet_type || '',
    });
    setCompanyNamePreview(idea.name);
    setShowAddForm(true);
    setOpenMenuId(null);
  };

  const resetForm = () => {
    setFormData({ ticker: '', category: 'growth', confidence: 'high', notes: '', price_target: '', intended_bet_type: '' });
    setCompanyNamePreview('');
    setEditingIdea(null);
    setShowAddForm(false);
  };

  // Promote a watchlist item to an active bet. Asks the user to confirm
  // bet type if the idea didn't already have one set.
  const handlePromote = async (idea: any) => {
    setOpenMenuId(null);
    let betType = idea.intended_bet_type;
    if (!betType) {
      const choice = window.prompt(
        `Promote ${idea.ticker} to a bet. Bet type? (Long, Mid, or Short)`,
        'Long'
      );
      if (!choice) return;
      const normalized = choice.trim().charAt(0).toUpperCase() + choice.trim().slice(1).toLowerCase();
      if (!['Long', 'Mid', 'Short'].includes(normalized)) {
        alert('Bet type must be Long, Mid, or Short.');
        return;
      }
      betType = normalized;
    }

    if (!window.confirm(
      `Promote ${idea.ticker} to a ${betType} bet? This will create a new bet, set buy_date to today, and remove the watchlist entry.`
    )) return;

    try {
      await axios.post(`/api/ideas/${idea.id}/promote`, { bet_type: betType });
      // Refetch — the easiest way without restructuring the hooks is a soft reload.
      window.location.href = '/bets';
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to promote idea';
      alert(msg);
    }
  };

  const handleSubmitIdea = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.ticker || !formData.notes) {
      alert('Ticker and notes are required');
      return;
    }

    try {
      const intendedBetType = formData.intended_bet_type || null;
      if (editingIdea) {
        // Update existing idea
        await updateIdeaMutation.mutateAsync({
          ideaId: editingIdea.id,
          updates: {
            ticker: formData.ticker.toUpperCase(),
            category: formData.category as 'low-risk' | 'growth' | 'speculative',
            confidence: formData.confidence as 'high' | 'medium' | 'low',
            notes: formData.notes,
            price_target: formData.price_target ? parseFloat(formData.price_target) : null,
            intended_bet_type: intendedBetType,
          } as any,
        });
      } else {
        // Add new idea
        await addIdeaMutation.mutateAsync({
          ticker: formData.ticker.toUpperCase(),
          category: formData.category as 'low-risk' | 'growth' | 'speculative',
          confidence: formData.confidence as 'high' | 'medium' | 'low',
          notes: formData.notes,
          price_target: formData.price_target ? parseFloat(formData.price_target) : null,
          intended_bet_type: intendedBetType,
        } as any);
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
        <Loader2 className="h-8 w-8 animate-spin text-ever-lime" />
        <span className="ml-2 text-ever-dim">Loading investment ideas...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-ever-neg">Failed to load investment ideas. Please try again.</p>
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
      case 'low-risk': return 'text-ever-teal bg-white/5';
      case 'growth': return 'text-ever-lime bg-white/5';
      case 'speculative': return 'text-ever-orange bg-white/5';
      default: return 'text-ever-dim bg-white/5';
    }
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'high': return 'text-ever-pos bg-white/5';
      case 'medium': return 'text-ever-orange bg-white/5';
      case 'low': return 'text-ever-neg bg-white/5';
      default: return 'text-ever-dim bg-white/5';
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
      return <ArrowUpDown className="h-3 w-3 text-ever-faint" />;
    }
    return sortConfig.direction === 'asc' ? (
      <ArrowUp className="h-3 w-3 text-ever-lime" />
    ) : (
      <ArrowDown className="h-3 w-3 text-ever-lime" />
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
      case 'large': return 'text-ever-violet bg-white/5 border-ever-line';
      case 'mid': return 'text-ever-lime bg-white/5 border-ever-line';
      case 'small': return 'text-ever-orange bg-white/5 border-ever-line';
      default: return 'text-ever-dim bg-white/5 border-ever-line';
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
          <h1 className="text-2xl font-extrabold tracking-tight text-ever-ink md:text-[26px]">Watchlist</h1>
          <p className="text-ever-dim mt-1 text-sm">Theses you're tracking. Promote one to a bet when you actually buy in.</p>
        </div>
        <Button onClick={() => setShowAddForm(true)}>
          <Plus className="h-4 w-4" />
          Add to Watchlist
        </Button>
      </div>

      <div className="flex space-x-2">
        {[
          { key: 'all', label: 'All Ideas' },
          { key: 'low-risk', label: 'Low Risk' },
          { key: 'growth', label: 'Growth' },
          { key: 'speculative', label: 'Speculative' }
        ].map((category) => (
          <button
            key={category.key}
            onClick={() => setSelectedCategory(category.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              selectedCategory === category.key
                ? 'bg-ever-lime text-ever-lime-ink'
                : 'border border-ever-line text-ever-dim hover:text-ever-ink'
            }`}
          >
            {category.label}
          </button>
        ))}
      </div>

      {showAddForm && (
        <Card className="p-6">
          <h2 className="text-xl font-semibold text-ever-ink mb-4">
            {editingIdea ? 'Edit Investment Idea' : 'Add New Investment Idea'}
          </h2>
          <form onSubmit={handleSubmitIdea}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ever-dim mb-2">Ticker Symbol *</label>
                <input
                  type="text"
                  placeholder="e.g., AAPL"
                  value={formData.ticker}
                  onChange={(e) => setFormData(prev => ({ ...prev, ticker: e.target.value.toUpperCase() }))}
                  className="w-full px-3 py-2 bg-ever-bg border border-ever-line text-ever-ink placeholder-ever-faint rounded-lg focus:outline-none focus:border-ever-lime"
                  required
                />
                {formData.ticker && (
                  <div className="mt-2 min-h-[20px]">
                    {isLoadingPreview ? (
                      <div className="flex items-center text-xs text-ever-dim">
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        Looking up company...
                      </div>
                    ) : companyNamePreview ? (
                      <div className="text-sm text-ever-dim">
                        📈 {companyNamePreview}
                      </div>
                    ) : formData.ticker.length > 0 ? (
                      <div className="text-xs text-ever-neg">
                        Company not found - please verify ticker symbol
                      </div>
                    ) : null}
                  </div>
                )}
                {!formData.ticker && (
                  <p className="mt-1 text-xs text-ever-faint">Company name will be fetched automatically</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-ever-dim mb-2">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full px-3 py-2 bg-ever-bg border border-ever-line text-ever-ink rounded-lg focus:outline-none focus:border-ever-lime"
                >
                  <option value="low-risk">Low Risk</option>
                  <option value="growth">Growth</option>
                  <option value="speculative">Speculative</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-ever-dim mb-2">Confidence Level</label>
                <select
                  value={formData.confidence}
                  onChange={(e) => setFormData(prev => ({ ...prev, confidence: e.target.value }))}
                  className="w-full px-3 py-2 bg-ever-bg border border-ever-line text-ever-ink rounded-lg focus:outline-none focus:border-ever-lime"
                >
                  <option value="high">High Confidence</option>
                  <option value="medium">Medium Confidence</option>
                  <option value="low">Low Confidence</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-ever-dim mb-2">Price Target (Optional)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-ever-dim sm:text-sm">$</span>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formData.price_target}
                    onChange={(e) => setFormData(prev => ({ ...prev, price_target: e.target.value }))}
                    className="w-full pl-7 pr-3 py-2 bg-ever-bg border border-ever-line text-ever-ink placeholder-ever-faint rounded-lg focus:outline-none focus:border-ever-lime"
                  />
                </div>
                <p className="mt-1 text-xs text-ever-faint">The price you'd consider buying this stock</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-ever-dim mb-2">Intended Bet Type</label>
                <select
                  value={formData.intended_bet_type}
                  onChange={(e) => setFormData(prev => ({ ...prev, intended_bet_type: e.target.value }))}
                  className="w-full px-3 py-2 bg-ever-bg border border-ever-line text-ever-ink rounded-lg focus:outline-none focus:border-ever-lime"
                >
                  <option value="">— not sure yet —</option>
                  <option value="Long">Long Bet (multi-year)</option>
                  <option value="Mid">Mid Bet (months to a couple years)</option>
                  <option value="Short">Short / Speculative Bet</option>
                </select>
                <p className="mt-1 text-xs text-ever-faint">Pre-decide so promote-to-bet is one click later</p>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-ever-dim mb-2">Investment Rationale *</label>
                <textarea
                  rows={3}
                  placeholder="Why do you think this is a good investment opportunity?"
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-3 py-2 bg-ever-bg border border-ever-line text-ever-ink placeholder-ever-faint rounded-lg focus:outline-none focus:border-ever-lime"
                  required
                />
              </div>
              <div className="md:col-span-2 flex justify-end space-x-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={resetForm}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={addIdeaMutation.isPending || updateIdeaMutation.isPending}
                >
                  {(addIdeaMutation.isPending || updateIdeaMutation.isPending) ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {editingIdea ? 'Updating...' : 'Adding...'}
                    </>
                  ) : (
                    editingIdea ? 'Update Idea' : 'Add Idea'
                  )}
                </Button>
              </div>
            </div>
          </form>
        </Card>
      )}

      {filteredAndSortedIdeas.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-ever-dim">No investment ideas found. Add your first idea!</p>
        </div>
      ) : (
        <div className="bg-ever-card rounded-ever border border-ever-line overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full divide-y divide-ever-line">
              <thead className="bg-white/5">
                <tr>
                  <th className="w-8 px-3 py-3"></th>
                  <th className="w-16 px-3 py-3 text-left text-xs font-medium text-ever-dim uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('ticker')}
                      className="flex items-center space-x-1 hover:text-ever-ink focus:outline-none"
                    >
                      <span>Ticker</span>
                      {getSortIcon('ticker')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-ever-dim uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('name')}
                      className="flex items-center space-x-1 hover:text-ever-ink focus:outline-none"
                    >
                      <span>Company</span>
                      {getSortIcon('name')}
                    </button>
                  </th>
                  <th className="w-20 px-3 py-3 text-right text-xs font-medium text-ever-dim uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('current_price')}
                      className="flex items-center space-x-1 hover:text-ever-ink focus:outline-none ml-auto"
                    >
                      <span>Price</span>
                      {getSortIcon('current_price')}
                    </button>
                  </th>
                  <th className="w-20 px-3 py-3 text-right text-xs font-medium text-ever-dim uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('price_target')}
                      className="flex items-center space-x-1 hover:text-ever-ink focus:outline-none ml-auto"
                    >
                      <span>Target</span>
                      {getSortIcon('price_target')}
                    </button>
                  </th>
                  <th className="w-24 px-2 py-3 text-right text-xs font-medium text-ever-dim uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('market_cap')}
                      className="flex items-center space-x-1 hover:text-ever-ink focus:outline-none ml-auto"
                    >
                      <span>Market Cap</span>
                      {getSortIcon('market_cap')}
                    </button>
                  </th>
                  <th className="w-20 px-2 py-3 text-center text-xs font-medium text-ever-dim uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('market_cap_category')}
                      className="flex items-center space-x-1 hover:text-ever-ink focus:outline-none mx-auto"
                    >
                      <span>Cap</span>
                      {getSortIcon('market_cap_category')}
                    </button>
                  </th>
                  <th className="w-24 px-2 py-3 text-center text-xs font-medium text-ever-dim uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('category')}
                      className="flex items-center space-x-1 hover:text-ever-ink focus:outline-none mx-auto"
                    >
                      <span>Category</span>
                      {getSortIcon('category')}
                    </button>
                  </th>
                  <th className="w-20 px-2 py-3 text-center text-xs font-medium text-ever-dim uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('confidence')}
                      className="flex items-center space-x-1 hover:text-ever-ink focus:outline-none mx-auto"
                    >
                      <span>Conf.</span>
                      {getSortIcon('confidence')}
                    </button>
                  </th>
                  <th className="w-16 px-2 py-3 text-center text-xs font-medium text-ever-dim uppercase tracking-wider">
                    Owned
                  </th>
                  <th className="w-20 px-3 py-3 text-center text-xs font-medium text-ever-dim uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('date_added')}
                      className="flex items-center space-x-1 hover:text-ever-ink focus:outline-none mx-auto"
                    >
                      <span>Added</span>
                      {getSortIcon('date_added')}
                    </button>
                  </th>
                  <th className="w-12 px-2 py-3 text-center text-xs font-medium text-ever-dim uppercase tracking-wider">
                    •••
                  </th>
                </tr>
              </thead>
            <tbody className="divide-y divide-ever-line">
              {filteredAndSortedIdeas.map((idea) => {
                const Icon = getCategoryIcon(idea.category);
                const isExpanded = expandedRows.has(idea.id);
                return (
                  <React.Fragment key={idea.id}>
                    <tr
                      className="hover:bg-white/5 cursor-pointer"
                      onClick={() => toggleRowExpansion(idea.id)}
                    >
                      <td className="px-3 py-3 whitespace-nowrap">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-ever-faint" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-ever-faint" />
                        )}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="text-sm font-bold text-ever-ink">{idea.ticker}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-ever-ink truncate max-w-xs" title={idea.name}>
                          {idea.name}
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-right">
                        <div className="text-sm font-semibold text-ever-pos tabular-nums">
                          ${idea.current_price ? idea.current_price.toFixed(2) : '--'}
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-right">
                        <div className="text-sm font-semibold text-ever-lime tabular-nums">
                          {idea.price_target ? `$${idea.price_target.toFixed(2)}` : '--'}
                        </div>
                      </td>
                      <td className="px-2 py-3 whitespace-nowrap text-right">
                        <div className="text-sm font-medium text-ever-ink tabular-nums">
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
                        <div className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-medium ${getCategoryColor(idea.category)}`} title={idea.category.replace('-', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}>
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
                          <span title="Owned"><CheckCircle className="h-4 w-4 text-ever-pos mx-auto" /></span>
                        ) : (
                          <div className="w-4 h-4 rounded-full border-2 border-ever-line mx-auto" title="Not Owned" />
                        )}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-center">
                        <div className="text-xs text-ever-dim">
                          {new Date(idea.date_added || idea.dateAdded).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                      </td>
                      <td className="px-2 py-3 whitespace-nowrap text-center">
                        <div className="relative" ref={openMenuId === idea.id ? menuRef : null}>
                          <button
                            className="p-1 text-ever-faint hover:text-ever-ink"
                            onClick={(e) => toggleMenu(idea.id, e)}
                            title="More actions"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                          {openMenuId === idea.id && (
                            <div className="absolute right-0 top-8 w-40 bg-ever-card rounded-ever shadow-lg border border-ever-line py-1 z-50">
                              <button
                                className="w-full px-3 py-2 text-left text-sm text-ever-lime hover:bg-white/5 flex items-center"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePromote(idea);
                                }}
                                title="Promote to a bet"
                              >
                                <Target className="h-3 w-3 mr-2" />
                                Promote to Bet
                              </button>
                              <button
                                className="w-full px-3 py-2 text-left text-sm text-ever-ink hover:bg-white/5 flex items-center"
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
                                className="w-full px-3 py-2 text-left text-sm text-ever-neg hover:bg-white/5 flex items-center"
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
                        <td colSpan={12} className="px-6 py-4 bg-white/5">
                          <div className="text-sm text-ever-dim">
                            <h4 className="font-medium text-ever-ink mb-2">Investment Rationale:</h4>
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