import React, { useState, useMemo } from 'react';
import { authedFetch } from '../services/authRedirect';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import SpendingOverTimeChart, { SpendingPoint } from '../components/charts/SpendingOverTimeChart';
import { Card, CardHeader, StatCard } from '../components/ui';
import { cn } from '../lib/cn';

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

// Evergreen categorical palette for progress-bar fills (violet/teal/lime/orange + neutral).
const CATEGORY_COLORS: Record<string, string> = {
  'Discretionary': 'bg-violet-500',
  'Fixed Costs': 'bg-teal-500',
  'Home': 'bg-lime-500',
  'Other Spending': 'bg-slate-500',
  'Special Expense': 'bg-orange-500',
};

const CATEGORY_TEXT_COLORS: Record<string, string> = {
  'Discretionary': 'text-violet-300',
  'Fixed Costs': 'text-teal-300',
  'Home': 'text-lime-300',
  'Other Spending': 'text-ever-dim',
  'Special Expense': 'text-orange-300',
};

const Reports: React.FC = () => {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'));
  const [viewMode, setViewMode] = useState<'month' | 'year'>('year');
  const [segmentBy, setSegmentBy] = useState<'category' | 'spend_type'>('spend_type');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  // Default pacing selection: every completed month is closed (uses actuals),
  // the current and future months stay open (assume budget).
  const defaultClosedMonths = (year: string): Set<number> => {
    const y = Number(year);
    if (y < now.getFullYear()) return new Set(Array.from({ length: 12 }, (_, i) => i + 1));
    if (y > now.getFullYear()) return new Set();
    return new Set(Array.from({ length: now.getMonth() }, (_, i) => i + 1));
  };

  // Closed months for pacing (persisted per year once manually changed)
  const [closedMonths, setClosedMonths] = useState<Set<number>>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(`closedMonths-${now.getFullYear()}`) || '[]');
      return stored.length > 0 ? new Set<number>(stored) : defaultClosedMonths(String(now.getFullYear()));
    } catch { return defaultClosedMonths(String(now.getFullYear())); }
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
      const stored = JSON.parse(localStorage.getItem(`closedMonths-${selectedYear}`) || '[]');
      setClosedMonths(stored.length > 0 ? new Set<number>(stored) : defaultClosedMonths(selectedYear));
    } catch { setClosedMonths(defaultClosedMonths(selectedYear)); }
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
      const res = await authedFetch(`/api/expenses/stats/summary?${params}`);
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
      const res = await authedFetch(`/api/expenses?${params}`);
      if (!res.ok) throw new Error('Failed to fetch expenses');
      return res.json();
    },
  });

  // Spending time series — always the full selected year, monthly buckets
  const { data: timeseries } = useQuery({
    queryKey: ['expenseTimeseries', selectedYear, segmentBy],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: `${selectedYear}-01-01`,
        endDate: `${selectedYear}-12-31`,
        segmentBy,
      });
      const res = await authedFetch(`/api/expenses/stats/timeseries?${params}`);
      if (!res.ok) throw new Error('Failed to fetch spending timeseries');
      return res.json() as Promise<{ points: SpendingPoint[]; segments: string[] }>;
    },
  });

  // Fetch budget items
  const { data: budgetItems } = useQuery({
    queryKey: ['budgetItems'],
    queryFn: async () => {
      const res = await authedFetch('/api/budgets');
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
  const totalTaxes = stats?.taxes?.total_amount || 0;
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ever-lime"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight text-ever-ink md:text-[26px]">Spending Dashboard</h1>
        <div className="flex gap-2 items-center">
          <button
            onClick={() => setViewMode('month')}
            className={cn(
              'px-4 py-2 rounded-lg text-sm transition',
              viewMode === 'month'
                ? 'bg-ever-lime font-semibold text-ever-lime-ink'
                : 'border border-ever-line text-ever-dim hover:text-ever-ink',
            )}
          >
            Monthly
          </button>
          <button
            onClick={() => setViewMode('year')}
            className={cn(
              'px-4 py-2 rounded-lg text-sm transition',
              viewMode === 'year'
                ? 'bg-ever-lime font-semibold text-ever-lime-ink'
                : 'border border-ever-line text-ever-dim hover:text-ever-ink',
            )}
          >
            Yearly
          </button>
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm bg-ever-bg border border-ever-line text-ever-ink focus:outline-none focus:border-ever-lime"
          >
            {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {viewMode === 'month' && (
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm bg-ever-bg border border-ever-line text-ever-ink focus:outline-none focus:border-ever-lime"
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
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <StatCard
          label="Income"
          value={<span className="text-ever-pos">{fmt(totalIncome)}</span>}
          dot="var(--ever-pos)"
        />
        <StatCard
          label="Spent"
          value={fmt(totalSpent)}
          dot="var(--ever-violet)"
          sub={totalBudget > 0 ? (
            <span className={totalSpent > totalBudget ? 'text-ever-neg' : 'text-ever-pos'}>
              {totalSpent > totalBudget
                ? `${fmt(totalSpent - totalBudget)} over budget`
                : `${fmt(totalBudget - totalSpent)} under budget`}
            </span>
          ) : undefined}
        />
        <StatCard label="Budget" value={fmt(totalBudget)} dot="var(--ever-teal)" />
        <StatCard
          label="Savings"
          value={<span className={savings >= 0 ? 'text-ever-pos' : 'text-ever-neg'}>{fmt(savings)}</span>}
          dot="var(--ever-lime)"
          sub={totalIncome > 0 ? `${savingsRate.toFixed(1)}% rate` : undefined}
        />
        <StatCard label="Taxes" value={fmt(totalTaxes)} dot="var(--ever-orange)" sub="excluded from Spent" />
        <StatCard
          label="Transactions"
          value={
            <span className="flex items-center justify-between gap-2">
              {txCount}
              {uncategorizedCount > 0 && <AlertTriangle className="h-5 w-5 text-ever-orange" />}
            </span>
          }
          dot="var(--ever-teal)"
          sub={uncategorizedCount > 0 ? (
            <span className="text-ever-orange">{uncategorizedCount} uncategorized</span>
          ) : undefined}
        />
      </div>

      {/* Annual Spend Pacing */}
      {pacing && (
        <Card>
          <CardHeader
            title="Annual Spend Pacing"
            right={
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
                      className={cn(
                        'px-2 py-1 text-xs rounded font-medium transition',
                        isFuture
                          ? 'bg-ever-track text-ever-faint cursor-not-allowed'
                          : isClosed
                            ? 'bg-ever-lime font-semibold text-ever-lime-ink'
                            : 'border border-ever-line text-ever-dim hover:text-ever-ink',
                      )}
                      title={isFuture ? 'Future month' : isClosed ? `${label} closed (using actuals)` : `${label} open (using budget)`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            }
          />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-4">
            <div>
              <p className="text-sm text-ever-dim">Actual ({pacing.completedMonths} months)</p>
              <p className="text-xl font-bold text-ever-ink">{fmt(pacing.actualTotal)}</p>
            </div>
            <div>
              <p className="text-sm text-ever-dim">Projected ({pacing.remainingMonthCount} months at budget)</p>
              <p className="text-xl font-bold text-ever-ink">{fmt(pacing.projectedTotal)}</p>
            </div>
            <div>
              <p className="text-sm text-ever-dim">Annual Budget</p>
              <p className="text-xl font-bold text-ever-ink">{fmt(pacing.annualBudget)}</p>
            </div>
            <div>
              <p className="text-sm text-ever-dim">Pacing</p>
              <p className={`text-xl font-bold ${pacing.pacingDiff > 0 ? 'text-ever-neg' : 'text-ever-pos'}`}>
                {pacing.pacingDiff > 0 ? '+' : ''}{fmt(pacing.pacingDiff)}
              </p>
              <p className={`text-sm ${pacing.pacingDiff > 0 ? 'text-ever-neg' : 'text-ever-pos'}`}>
                {pacing.pacingDiff > 0 ? 'over budget' : 'under budget'}
              </p>
            </div>
          </div>
          <div className="relative">
            <div className="w-full bg-ever-track rounded-full h-4">
              <div
                className={`h-4 rounded-full transition-all ${pacing.pacingDiff > 0 ? 'bg-ever-neg' : 'bg-ever-pos'}`}
                style={{ width: `${Math.min((pacing.projectedTotal / pacing.annualBudget) * 100, 100)}%` }}
              />
            </div>
            {/* Budget line marker at 100% */}
            <div
              className="absolute top-0 h-4 border-r-2 border-ever-ink"
              style={{ left: `${Math.min((pacing.annualBudget / Math.max(pacing.projectedTotal, pacing.annualBudget)) * 100, 100)}%` }}
              title="Annual Budget"
            />
          </div>
          <p className="text-xs text-ever-faint mt-2">
            Based on {pacing.completedMonths} month{pacing.completedMonths !== 1 ? 's' : ''} of actual spending + {pacing.remainingMonthCount} month{pacing.remainingMonthCount !== 1 ? 's' : ''} at {fmtShort(monthlyBudget)}/mo budget
          </p>
        </Card>
      )}

      {/* Spending over time — stacked by category or spend type */}
      <Card>
        <div className="flex items-center justify-between mb-4 gap-3">
          <div>
            <h3 className="text-[15px] font-semibold tracking-tight text-ever-ink">Spending Over Time</h3>
            <p className="text-xs text-ever-dim mt-0.5">{selectedYear} monthly spend, excluding transfers, income, and taxes</p>
          </div>
          <select
            value={segmentBy}
            onChange={e => setSegmentBy(e.target.value as 'category' | 'spend_type')}
            className="px-3 py-2 rounded-lg text-sm bg-ever-bg border border-ever-line text-ever-ink focus:outline-none focus:border-ever-lime"
          >
            <option value="spend_type">By Type</option>
            <option value="category">By Category</option>
          </select>
        </div>
        <SpendingOverTimeChart
          points={timeseries?.points || []}
          segments={timeseries?.segments || []}
          segmentBy={segmentBy}
        />
      </Card>

      {/* Main content: Category breakdown + Monthly trend */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Spending by Category */}
        <div className="lg:col-span-2 rounded-ever border border-ever-line bg-ever-card">
          <div className="px-6 py-4 border-b border-ever-line">
            <h3 className="text-[15px] font-semibold tracking-tight text-ever-ink">Spending by Category</h3>
          </div>
          <div className="p-6 space-y-4">
            {categoryStats.length === 0 && (
              <p className="text-ever-dim text-center py-8">No categorized spending data</p>
            )}
            {categoryStats.map(cat => {
              const budget = budgetByCategory[cat.category] || 0;
              const pct = totalSpent > 0 ? (cat.total / totalSpent) * 100 : 0;
              const overBudget = budget > 0 && cat.total > budget;
              const barColor = CATEGORY_COLORS[cat.category] || 'bg-slate-500';
              const textColor = CATEGORY_TEXT_COLORS[cat.category] || 'text-ever-dim';
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
                      <span className="font-medium text-ever-ink">{fmt(cat.total)}</span>
                      {budget > 0 && (
                        <span className={`ml-2 ${overBudget ? 'text-ever-neg' : 'text-ever-faint'}`}>
                          / {fmtShort(budget)}
                        </span>
                      )}
                    </div>
                  </button>
                  <div className="w-full bg-ever-track rounded-full h-3 relative">
                    <div
                      className={`${barColor} h-3 rounded-full transition-all`}
                      style={{ width: `${Math.min((cat.total / maxCategorySpend) * 100, 100)}%` }}
                    />
                    {budget > 0 && (
                      <div
                        className="absolute top-0 h-3 border-r-2 border-ever-ink"
                        style={{ left: `${Math.min((budget / maxCategorySpend) * 100, 100)}%` }}
                        title={`Budget: ${fmtShort(budget)}`}
                      />
                    )}
                  </div>
                  <div className="text-xs text-ever-faint mt-0.5">{pct.toFixed(1)}% of total -- {cat.count} transactions</div>
                  {isExpanded && subs.length > 0 && (
                    <div className="ml-5 mt-2 mb-1 space-y-1.5">
                      {subs.map(sub => {
                        const subBudget = budgetBySubcategory[`${cat.category}::${sub.subcategory}`] || 0;
                        const subOver = subBudget > 0 && sub.total > subBudget;
                        return (
                          <div key={sub.subcategory}>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-ever-dim">{sub.subcategory}</span>
                              <div className="text-right">
                                <span className="font-medium text-ever-ink">{fmt(sub.total)}</span>
                                {subBudget > 0 && (
                                  <span className={`ml-1.5 ${subOver ? 'text-ever-neg' : 'text-ever-faint'}`}>
                                    / {fmtShort(subBudget)}
                                  </span>
                                )}
                                <span className="ml-1.5 text-ever-faint">{sub.count} txn</span>
                              </div>
                            </div>
                            <div className="w-full bg-ever-track rounded-full h-1.5 mt-0.5">
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
        <div className="rounded-ever border border-ever-line bg-ever-card">
          <div className="px-6 py-4 border-b border-ever-line">
            <h3 className="text-[15px] font-semibold tracking-tight text-ever-ink">Income vs Expenses</h3>
          </div>
          <div className="p-6">
            {monthlyStats.length === 0 && (
              <p className="text-ever-dim text-center py-8">No data</p>
            )}
            {(() => {
              const maxVal = Math.max(...monthlyStats.map(m => Math.max(m.income, m.expenses)), 1);
              return [...monthlyStats].reverse().map(m => {
                const net = m.income - m.expenses;
                return (
                  <div key={m.month} className="mb-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-ever-dim font-medium">
                        {new Date(m.month + '-01').toLocaleString('default', { month: 'short', year: 'numeric' })}
                      </span>
                      <span className={`text-xs font-medium ${net >= 0 ? 'text-ever-pos' : 'text-ever-neg'}`}>
                        {net >= 0 ? '+' : ''}{fmt(net)}
                      </span>
                    </div>
                    {m.income > 0 && (
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-ever-faint w-12">In</span>
                        <div className="flex-1 bg-ever-track rounded-full h-2">
                          <div
                            className="bg-ever-pos h-2 rounded-full transition-all"
                            style={{ width: `${(m.income / maxVal) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-ever-dim w-20 text-right">{fmtShort(m.income)}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-ever-faint w-12">Out</span>
                      <div className="flex-1 bg-ever-track rounded-full h-2">
                        <div
                          className="bg-ever-neg h-2 rounded-full transition-all"
                          style={{ width: `${(m.expenses / maxVal) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-ever-dim w-20 text-right">{fmtShort(m.expenses)}</span>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </div>

      {/* Subcategory breakdown */}
      <div className="rounded-ever border border-ever-line bg-ever-card">
        <div className="px-6 py-4 border-b border-ever-line">
          <h3 className="text-[15px] font-semibold tracking-tight text-ever-ink">Subcategory Breakdown</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-ever-line">
            <thead>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-ever-dim uppercase">Category</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-ever-dim uppercase">Subcategory</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-ever-dim uppercase">Spent</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-ever-dim uppercase">Budget</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-ever-dim uppercase">Remaining</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-ever-dim uppercase">Txns</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-ever-dim uppercase w-48">Progress</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ever-line">
              {subcategoryStats.map(sub => {
                const budgetKey = `${sub.category}::${sub.subcategory}`;
                const budget = budgetBySubcategory[budgetKey] || 0;
                const remaining = budget - sub.total;
                const pct = budget > 0 ? (sub.total / budget) * 100 : 0;
                const overBudget = budget > 0 && sub.total > budget;

                return (
                  <tr key={budgetKey} className={overBudget ? 'bg-white/5' : 'hover:bg-white/5'}>
                    <td className="px-6 py-2.5 text-sm text-ever-dim">{sub.category}</td>
                    <td className="px-6 py-2.5 text-sm font-medium text-ever-ink">{sub.subcategory}</td>
                    <td className="px-6 py-2.5 text-sm text-right font-medium text-ever-ink tabular-nums">{fmt(sub.total)}</td>
                    <td className="px-6 py-2.5 text-sm text-right text-ever-dim tabular-nums">
                      {budget > 0 ? fmtShort(budget) : '--'}
                    </td>
                    <td className={`px-6 py-2.5 text-sm text-right font-medium tabular-nums ${
                      budget === 0 ? 'text-ever-faint' : remaining >= 0 ? 'text-ever-pos' : 'text-ever-neg'
                    }`}>
                      {budget > 0 ? fmt(remaining) : '--'}
                    </td>
                    <td className="px-6 py-2.5 text-sm text-right text-ever-dim tabular-nums">{sub.count}</td>
                    <td className="px-6 py-2.5">
                      {budget > 0 ? (
                        <div className="w-full bg-ever-track rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${overBudget ? 'bg-ever-neg' : 'bg-ever-pos'}`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                      ) : (
                        <span className="text-xs text-ever-faint">--</span>
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
