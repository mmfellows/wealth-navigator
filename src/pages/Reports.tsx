import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';

interface CategoryStat {
  category: string;
  count: number;
  total: number;
  average: number;
}

interface MonthlyStat {
  month: string;
  count: number;
  total: number;
  income: number;
  expenses: number;
}

interface BudgetItem {
  id: string;
  itemName: string;
  mainCategory: string;
  secondaryCategory: string;
  amount: number;
  frequency: string;
  monthlyExpectedSpend: number;
  status: string;
}

interface SubcategoryStat {
  subcategory: string;
  category: string;
  count: number;
  total: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  'Discretionary': 'bg-purple-500',
  'Fixed Costs': 'bg-blue-500',
  'Home': 'bg-indigo-500',
  'Other Spending': 'bg-gray-500',
  'Special Expense': 'bg-amber-500',
};

const CATEGORY_TEXT_COLORS: Record<string, string> = {
  'Discretionary': 'text-purple-600',
  'Fixed Costs': 'text-blue-600',
  'Home': 'text-indigo-600',
  'Other Spending': 'text-gray-600',
  'Special Expense': 'text-amber-600',
};

const Reports: React.FC = () => {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'));
  const [viewMode, setViewMode] = useState<'month' | 'year'>('year');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  // Closed months for pacing (persisted per year)
  const [closedMonths, setClosedMonths] = useState<Set<number>>(() => {
    try {
      const stored = localStorage.getItem(`closedMonths-${now.getFullYear()}`);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });

  const toggleClosedMonth = (month: number) => {
    setClosedMonths(prev => {
      const next = new Set(prev);
      if (next.has(month)) next.delete(month);
      else next.add(month);
      localStorage.setItem(`closedMonths-${selectedYear}`, JSON.stringify([...next]));
      return next;
    });
  };

  // Reload closed months when year changes
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(`closedMonths-${selectedYear}`);
      setClosedMonths(stored ? new Set(JSON.parse(stored)) : new Set());
    } catch { setClosedMonths(new Set()); }
  }, [selectedYear]);

  const startDate = viewMode === 'month'
    ? `${selectedYear}-${selectedMonth}-01`
    : `${selectedYear}-01-01`;
  const endDate = viewMode === 'month'
    ? `${selectedYear}-${selectedMonth}-${new Date(Number(selectedYear), Number(selectedMonth), 0).getDate()}`
    : `${selectedYear}-12-31`;

  // Fetch expense stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['expenseStats', startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams({ startDate, endDate });
      const res = await fetch(`http://localhost:3001/api/expenses/stats/summary?${params}`);
      if (!res.ok) throw new Error('Failed to fetch stats');
      return res.json();
    },
  });

  // Fetch subcategory-level breakdown
  const { data: expensesData } = useQuery({
    queryKey: ['expensesForReport', startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate, endDate, limit: '5000', includeTransfers: 'false',
      });
      const res = await fetch(`http://localhost:3001/api/expenses?${params}`);
      if (!res.ok) throw new Error('Failed to fetch expenses');
      return res.json();
    },
  });

  // Fetch budget items
  const { data: budgetItems } = useQuery({
    queryKey: ['budgetItems'],
    queryFn: async () => {
      const res = await fetch('http://localhost:3001/api/budgets');
      if (!res.ok) throw new Error('Failed to fetch budgets');
      return res.json() as Promise<BudgetItem[]>;
    },
    staleTime: 60000,
  });

  // Compute subcategory stats from raw expenses
  const subcategoryStats = useMemo(() => {
    if (!expensesData?.expenses) return [];
    const map: Record<string, SubcategoryStat> = {};
    for (const e of expensesData.expenses) {
      if (e.is_transfer) continue;
      const sub = e.subcategory || '(uncategorized)';
      const cat = e.category || '(uncategorized)';
      const key = `${cat}::${sub}`;
      if (!map[key]) map[key] = { subcategory: sub, category: cat, count: 0, total: 0 };
      map[key].count++;
      map[key].total += e.amount || 0;
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [expensesData]);

  // Subcategories grouped by main category for drill-down
  const subcatsByCategory = useMemo(() => {
    const map: Record<string, SubcategoryStat[]> = {};
    for (const s of subcategoryStats) {
      if (!map[s.category]) map[s.category] = [];
      map[s.category].push(s);
    }
    return map;
  }, [subcategoryStats]);

  // Budget lookup by main category and subcategory
  const budgetByCategory = useMemo(() => {
    if (!budgetItems) return {};
    const map: Record<string, number> = {};
    const monthCount = viewMode === 'year' ? 12 : 1;
    for (const item of budgetItems) {
      if (item.status !== 'active') continue;
      const monthly = item.frequency === 'annual' ? item.amount / 12 : item.amount;
      const key = item.mainCategory;
      map[key] = (map[key] || 0) + monthly * monthCount;
    }
    return map;
  }, [budgetItems, viewMode]);

  const budgetBySubcategory = useMemo(() => {
    if (!budgetItems) return {};
    const map: Record<string, number> = {};
    const monthCount = viewMode === 'year' ? 12 : 1;
    for (const item of budgetItems) {
      if (item.status !== 'active') continue;
      const monthly = item.frequency === 'annual' ? item.amount / 12 : item.amount;
      const key = `${item.mainCategory}::${item.secondaryCategory}`;
      map[key] = (map[key] || 0) + monthly * monthCount;
    }
    return map;
  }, [budgetItems, viewMode]);

  const totalBudget = useMemo(() => {
    return Object.values(budgetByCategory).reduce((s, v) => s + v, 0);
  }, [budgetByCategory]);

  // Monthly budget (for pacing calc)
  const monthlyBudget = useMemo(() => {
    if (!budgetItems) return 0;
    return budgetItems
      .filter(i => i.status === 'active')
      .reduce((s, i) => s + (i.frequency === 'annual' ? i.amount / 12 : i.amount), 0);
  }, [budgetItems]);

  const categoryStats: CategoryStat[] = stats?.by_category || [];
  const monthlyStats: MonthlyStat[] = stats?.by_month || [];
  const totalSpent = stats?.totals?.total_amount || 0;
  const totalIncome = stats?.income?.total_amount || 0;
  const savings = totalIncome - totalSpent;
  const savingsRate = totalIncome > 0 ? (savings / totalIncome) * 100 : 0;
  const txCount = stats?.totals?.total_count || 0;
  const uncategorizedCount = expensesData?.expenses?.filter(
    (e: any) => !e.is_transfer && !e.category && !e.subcategory
  ).length || 0;

  // Annual spend pacing — uses manually closed months
  const pacing = useMemo(() => {
    if (viewMode !== 'year') return null;
    const yr = Number(selectedYear);
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    // Determine which months are in the future (can't be closed)
    const isFutureMonth = (month: number) => {
      if (yr > currentYear) return true;
      if (yr < currentYear) return false;
      return month > currentMonth;
    };

    const actualsMap: Record<number, number> = {};
    monthlyStats
      .filter(m => m.month.startsWith(selectedYear))
      .forEach(m => {
        actualsMap[parseInt(m.month.split('-')[1])] = m.expenses;
      });

    let completedMonths = 0;
    let cumulativeOverage = 0;

    for (let m = 1; m <= 12; m++) {
      if (closedMonths.has(m) && !isFutureMonth(m)) {
        completedMonths++;
        const actual = actualsMap[m] || 0;
        cumulativeOverage += actual - monthlyBudget;
      }
    }

    const annualBudget = monthlyBudget * 12;
    const projectedTotal = annualBudget + cumulativeOverage;
    const actualTotal = Object.values(actualsMap).reduce((s, v) => s + v, 0);

    return {
      projectedTotal,
      annualBudget,
      pacingDiff: cumulativeOverage,
      completedMonths,
      remainingMonthCount: 12 - completedMonths,
      actualTotal,
      isFutureMonth,
    };
  }, [viewMode, selectedYear, monthlyStats, monthlyBudget, now, closedMonths]);

  const fmt = (n: number) => '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtShort = (n: number) => '$' + n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const maxCategorySpend = Math.max(...categoryStats.map(c => c.total), 1);

  if (statsLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Spending Dashboard</h1>
        <div className="flex gap-2 items-center">
          <button
            onClick={() => setViewMode('month')}
            className={`px-4 py-2 rounded-md font-medium transition-colors ${
              viewMode === 'month' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setViewMode('year')}
            className={`px-4 py-2 rounded-md font-medium transition-colors ${
              viewMode === 'year' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Yearly
          </button>
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(e.target.value)}
            className="px-3 py-2 rounded-md text-sm border border-gray-300"
          >
            {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {viewMode === 'month' && (
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="px-3 py-2 rounded-md text-sm border border-gray-300"
            >
              {['01','02','03','04','05','06','07','08','09','10','11','12'].map(m => (
                <option key={m} value={m}>
                  {new Date(2000, parseInt(m) - 1).toLocaleString('default', { month: 'long' })}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <div className="bg-white rounded-lg p-5 shadow-sm border">
          <p className="text-sm text-gray-500">Income</p>
          <p className="text-2xl font-bold text-green-600">{fmt(totalIncome)}</p>
        </div>
        <div className="bg-white rounded-lg p-5 shadow-sm border">
          <p className="text-sm text-gray-500">Spent</p>
          <p className="text-2xl font-bold text-gray-900">{fmt(totalSpent)}</p>
          <p className={`text-sm mt-1 ${totalSpent > totalBudget ? 'text-red-600' : 'text-green-600'}`}>
            {totalBudget > 0 && (totalSpent > totalBudget
              ? `${fmt(totalSpent - totalBudget)} over budget`
              : `${fmt(totalBudget - totalSpent)} under budget`)}
          </p>
        </div>
        <div className="bg-white rounded-lg p-5 shadow-sm border">
          <p className="text-sm text-gray-500">Budget</p>
          <p className="text-2xl font-bold text-gray-900">{fmt(totalBudget)}</p>
        </div>
        <div className="bg-white rounded-lg p-5 shadow-sm border">
          <p className="text-sm text-gray-500">Savings</p>
          <p className={`text-2xl font-bold ${savings >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {fmt(savings)}
          </p>
          {totalIncome > 0 && (
            <p className="text-sm mt-1 text-gray-500">{savingsRate.toFixed(1)}% rate</p>
          )}
        </div>
        <div className="bg-white rounded-lg p-5 shadow-sm border">
          <p className="text-sm text-gray-500">Transactions</p>
          <p className="text-2xl font-bold text-gray-900">{txCount}</p>
        </div>
        <div className="bg-white rounded-lg p-5 shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Uncategorized</p>
              <p className="text-2xl font-bold text-gray-900">{uncategorizedCount}</p>
            </div>
            {uncategorizedCount > 0 && <AlertTriangle className="h-8 w-8 text-amber-400" />}
          </div>
        </div>
      </div>

      {/* Annual Spend Pacing */}
      {pacing && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Annual Spend Pacing</h2>
            <div className="flex gap-1">
              {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((label, i) => {
                const month = i + 1;
                const isFuture = pacing.isFutureMonth(month);
                const isClosed = closedMonths.has(month);
                return (
                  <button
                    key={month}
                    onClick={() => !isFuture && toggleClosedMonth(month)}
                    disabled={isFuture}
                    className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
                      isFuture
                        ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                        : isClosed
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                    title={isFuture ? 'Future month' : isClosed ? `${label} closed (using actuals)` : `${label} open (using budget)`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-4">
            <div>
              <p className="text-sm text-gray-500">Actual ({pacing.completedMonths} months)</p>
              <p className="text-xl font-bold text-gray-900">{fmt(pacing.actualTotal)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Projected ({pacing.remainingMonthCount} months at budget)</p>
              <p className="text-xl font-bold text-gray-900">{fmt(pacing.projectedTotal)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Annual Budget</p>
              <p className="text-xl font-bold text-gray-900">{fmt(pacing.annualBudget)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Pacing</p>
              <p className={`text-xl font-bold ${pacing.pacingDiff > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {pacing.pacingDiff > 0 ? '+' : ''}{fmt(pacing.pacingDiff)}
              </p>
              <p className={`text-sm ${pacing.pacingDiff > 0 ? 'text-red-500' : 'text-green-500'}`}>
                {pacing.pacingDiff > 0 ? 'over budget' : 'under budget'}
              </p>
            </div>
          </div>
          <div className="relative">
            <div className="w-full bg-gray-100 rounded-full h-4">
              <div
                className={`h-4 rounded-full transition-all ${pacing.pacingDiff > 0 ? 'bg-red-500' : 'bg-green-500'}`}
                style={{ width: `${Math.min((pacing.projectedTotal / pacing.annualBudget) * 100, 100)}%` }}
              />
            </div>
            {/* Budget line marker at 100% */}
            <div
              className="absolute top-0 h-4 border-r-2 border-gray-800"
              style={{ left: `${Math.min((pacing.annualBudget / Math.max(pacing.projectedTotal, pacing.annualBudget)) * 100, 100)}%` }}
              title="Annual Budget"
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Based on {pacing.completedMonths} month{pacing.completedMonths !== 1 ? 's' : ''} of actual spending + {pacing.remainingMonthCount} month{pacing.remainingMonthCount !== 1 ? 's' : ''} at {fmtShort(monthlyBudget)}/mo budget
          </p>
        </div>
      )}

      {/* Main content: Category breakdown + Monthly trend */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Spending by Category */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Spending by Category</h2>
          </div>
          <div className="p-6 space-y-4">
            {categoryStats.length === 0 && (
              <p className="text-gray-400 text-center py-8">No categorized spending data</p>
            )}
            {categoryStats.map(cat => {
              const budget = budgetByCategory[cat.category] || 0;
              const pct = totalSpent > 0 ? (cat.total / totalSpent) * 100 : 0;
              const overBudget = budget > 0 && cat.total > budget;
              const barColor = CATEGORY_COLORS[cat.category] || 'bg-gray-400';
              const textColor = CATEGORY_TEXT_COLORS[cat.category] || 'text-gray-700';
              const isExpanded = expandedCategories.has(cat.category);
              const subs = subcatsByCategory[cat.category] || [];

              return (
                <div key={cat.category}>
                  <button
                    onClick={() => toggleCategory(cat.category)}
                    className="flex items-center justify-between mb-1 w-full text-left"
                  >
                    <span className={`text-sm font-medium ${textColor} flex items-center`}>
                      {isExpanded
                        ? <ChevronDown className="h-4 w-4 mr-1 flex-shrink-0" />
                        : <ChevronRight className="h-4 w-4 mr-1 flex-shrink-0" />
                      }
                      {cat.category}
                    </span>
                    <div className="text-right text-sm">
                      <span className="font-medium text-gray-900">{fmt(cat.total)}</span>
                      {budget > 0 && (
                        <span className={`ml-2 ${overBudget ? 'text-red-500' : 'text-gray-400'}`}>
                          / {fmtShort(budget)}
                        </span>
                      )}
                    </div>
                  </button>
                  <div className="w-full bg-gray-100 rounded-full h-3 relative">
                    <div
                      className={`${barColor} h-3 rounded-full transition-all`}
                      style={{ width: `${Math.min((cat.total / maxCategorySpend) * 100, 100)}%` }}
                    />
                    {budget > 0 && (
                      <div
                        className="absolute top-0 h-3 border-r-2 border-gray-800"
                        style={{ left: `${Math.min((budget / maxCategorySpend) * 100, 100)}%` }}
                        title={`Budget: ${fmtShort(budget)}`}
                      />
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">{pct.toFixed(1)}% of total -- {cat.count} transactions</div>
                  {isExpanded && subs.length > 0 && (
                    <div className="ml-5 mt-2 mb-1 space-y-1.5">
                      {subs.map(sub => {
                        const subBudget = budgetBySubcategory[`${cat.category}::${sub.subcategory}`] || 0;
                        const subOver = subBudget > 0 && sub.total > subBudget;
                        return (
                          <div key={sub.subcategory}>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-gray-600">{sub.subcategory}</span>
                              <div className="text-right">
                                <span className="font-medium text-gray-800">{fmt(sub.total)}</span>
                                {subBudget > 0 && (
                                  <span className={`ml-1.5 ${subOver ? 'text-red-500' : 'text-gray-400'}`}>
                                    / {fmtShort(subBudget)}
                                  </span>
                                )}
                                <span className="ml-1.5 text-gray-400">{sub.count} txn</span>
                              </div>
                            </div>
                            <div className="w-full bg-gray-50 rounded-full h-1.5 mt-0.5">
                              <div
                                className={`${barColor} opacity-60 h-1.5 rounded-full`}
                                style={{ width: `${Math.min((sub.total / cat.total) * 100, 100)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Monthly Trend - Income vs Expenses */}
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Income vs Expenses</h2>
          </div>
          <div className="p-6">
            {monthlyStats.length === 0 && (
              <p className="text-gray-400 text-center py-8">No data</p>
            )}
            {(() => {
              const maxVal = Math.max(...monthlyStats.map(m => Math.max(m.income, m.expenses)), 1);
              return [...monthlyStats].reverse().map(m => {
                const net = m.income - m.expenses;
                return (
                  <div key={m.month} className="mb-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600 font-medium">
                        {new Date(m.month + '-01').toLocaleString('default', { month: 'short', year: 'numeric' })}
                      </span>
                      <span className={`text-xs font-medium ${net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {net >= 0 ? '+' : ''}{fmt(net)}
                      </span>
                    </div>
                    {m.income > 0 && (
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-gray-400 w-12">In</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-2">
                          <div
                            className="bg-green-500 h-2 rounded-full transition-all"
                            style={{ width: `${(m.income / maxVal) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-20 text-right">{fmtShort(m.income)}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-12">Out</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div
                          className="bg-red-400 h-2 rounded-full transition-all"
                          style={{ width: `${(m.expenses / maxVal) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 w-20 text-right">{fmtShort(m.expenses)}</span>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </div>

      {/* Subcategory breakdown */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Subcategory Breakdown</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Subcategory</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Spent</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Budget</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Remaining</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Txns</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase w-48">Progress</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {subcategoryStats.map(sub => {
                const budgetKey = `${sub.category}::${sub.subcategory}`;
                const budget = budgetBySubcategory[budgetKey] || 0;
                const remaining = budget - sub.total;
                const pct = budget > 0 ? (sub.total / budget) * 100 : 0;
                const overBudget = budget > 0 && sub.total > budget;

                return (
                  <tr key={budgetKey} className={overBudget ? 'bg-red-50' : ''}>
                    <td className="px-6 py-2.5 text-sm text-gray-600">{sub.category}</td>
                    <td className="px-6 py-2.5 text-sm font-medium text-gray-900">{sub.subcategory}</td>
                    <td className="px-6 py-2.5 text-sm text-right font-medium text-gray-900">{fmt(sub.total)}</td>
                    <td className="px-6 py-2.5 text-sm text-right text-gray-500">
                      {budget > 0 ? fmtShort(budget) : '--'}
                    </td>
                    <td className={`px-6 py-2.5 text-sm text-right font-medium ${
                      budget === 0 ? 'text-gray-400' : remaining >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {budget > 0 ? fmt(remaining) : '--'}
                    </td>
                    <td className="px-6 py-2.5 text-sm text-right text-gray-500">{sub.count}</td>
                    <td className="px-6 py-2.5">
                      {budget > 0 ? (
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${overBudget ? 'bg-red-500' : 'bg-green-500'}`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300">--</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Reports;
