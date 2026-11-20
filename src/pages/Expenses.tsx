import React, { useState, useEffect, useMemo } from 'react';
import { authedFetch } from '../services/authRedirect';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { CreditCard, Search, PlusCircle, Info, Upload, Download, Eye, X, ArrowLeftRight, FileText, BarChart3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { fetchBudgetCategories } from '../constants/budgetCategories';
import { Card, StatCard, Button, toast } from '../components/ui';
import { everPill } from '../lib/categoryColors';
import { cn } from '../lib/cn';

interface Expense {
  id: number;
  date: string;
  merchant?: string;
  description?: string;
  amount: number;
  statement?: string;
  category?: string;
  subcategory?: string;
  account?: string;
  is_transfer?: boolean;
  imported_from?: string;
  imported_at?: string;
  created_at?: string;
  updated_at?: string;
}

interface ExpensesResponse {
  expenses: Expense[];
  totalAmount: number;
  totals?: { spending: number; spending_count: number; income: number; income_count: number; taxes: number; taxes_count: number; transfers: number };
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

// ---- chart grouping ----
type Grouping = 'week' | 'month' | 'quarter' | 'year';
const GROUPINGS: Array<{ id: Grouping; label: string }> = [
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
  { id: 'quarter', label: 'Quarterly' },
  { id: 'year', label: 'Yearly' },
];
interface Bucket { key: string; start: string; end: string }
interface ChartBucket extends Bucket { label: string; total: number; count: number }

const p2 = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
// 'YYYY-MM-DD' as a local date (new Date(string) would read it as UTC).
const localDate = (iso: string) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const nextDay = (iso: string) => { const d = localDate(iso); d.setDate(d.getDate() + 1); return ymd(d); };
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The week (Monday to Sunday), month, quarter or year a date falls in.
function bucketOf(iso: string, grouping: Grouping): Bucket {
  const d = localDate(iso);
  const y = d.getFullYear();
  const m = d.getMonth();
  if (grouping === 'week') {
    const day = d.getDay();
    const monday = new Date(y, m, d.getDate() - (day === 0 ? 6 : day - 1));
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    return { key: ymd(monday), start: ymd(monday), end: ymd(sunday) };
  }
  if (grouping === 'month') return { key: `${y}-${p2(m + 1)}`, start: ymd(new Date(y, m, 1)), end: ymd(new Date(y, m + 1, 0)) };
  if (grouping === 'quarter') {
    const q = Math.floor(m / 3);
    return { key: `${y}-Q${q + 1}`, start: ymd(new Date(y, q * 3, 1)), end: ymd(new Date(y, q * 3 + 3, 0)) };
  }
  return { key: String(y), start: `${y}-01-01`, end: `${y}-12-31` };
}

// Short axis label.
function bucketLabel(b: Bucket, grouping: Grouping, spansYears: boolean): string {
  const d = localDate(b.start);
  const yy = String(d.getFullYear()).slice(2);
  if (grouping === 'week') return `${d.getMonth() + 1}/${d.getDate()}`;
  if (grouping === 'month') return spansYears ? `${MONTH_ABBR[d.getMonth()]} '${yy}` : MONTH_ABBR[d.getMonth()];
  if (grouping === 'quarter') return spansYears ? `Q${Math.floor(d.getMonth() / 3) + 1} '${yy}` : `Q${Math.floor(d.getMonth() / 3) + 1}`;
  return String(d.getFullYear());
}

// Full name, for the tooltip and the banner.
function bucketTitle(b: Bucket, grouping: Grouping): string {
  const s = localDate(b.start);
  const e = localDate(b.end);
  const md = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (grouping === 'week') return `the week of ${md(s)} – ${md(e)}, ${e.getFullYear()}`;
  if (grouping === 'month') return s.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  if (grouping === 'quarter') return `Q${Math.floor(s.getMonth() / 3) + 1} ${s.getFullYear()}`;
  return String(s.getFullYear());
}

// Signed dollars with the minus in front of the symbol: -$1,234.56, not $-1,234.56.
const money = (n: number, digits = 2) =>
  `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

const Expenses: React.FC = () => {
  // Deep links (e.g. from the dashboard's drill-down) can preset the filters:
  // /expenses?category=Home&subcategory=Utilities&month=2026-10  (or &year=2026)
  const [searchParams] = useSearchParams();
  const urlMonth = /^\d{4}-\d{2}$/.test(searchParams.get('month') || '') ? searchParams.get('month')! : null;
  const urlYear = /^\d{4}$/.test(searchParams.get('year') || '') ? searchParams.get('year')! : null;

  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('search') || '');
  const [selectedCategory, setSelectedCategory] = useState(() => searchParams.get('category') || 'all');
  const [selectedSubcategory, setSelectedSubcategory] = useState(() => searchParams.get('subcategory') || 'all');
  const [dateRange, setDateRange] = useState<'all' | 'month' | 'quarter' | 'year' | 'custom-month' | 'custom-year'>(
    urlMonth ? 'custom-month' : urlYear ? 'custom-year' : 'year',
  );
  const [selectedMonth, setSelectedMonth] = useState(() => {
    if (urlMonth) return urlMonth;
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedYear, setSelectedYear] = useState(() => urlYear || urlMonth?.slice(0, 4) || String(new Date().getFullYear()));
  const [uncategorizedOnly, setUncategorizedOnly] = useState(() => searchParams.get('uncategorized') === '1');
  const [includeTransfers, setIncludeTransfers] = useState(false);
  // This page is about money going out; income lives on the dashboard.
  const [includeIncome, setIncludeIncome] = useState(false);
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [displayColumns, setDisplayColumns] = useState<string[]>(['amount', 'date', 'merchant', 'description', 'category', 'subcategory', 'statement']);
  const [currentPage, setCurrentPage] = useState(0);
  const [limit] = useState(200);
  const [, setCsvFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [showCsvPreview, setShowCsvPreview] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [showColumnAlert, setShowColumnAlert] = useState(true);
  const [pdfPreview, setPdfPreview] = useState<any[] | null>(null);
  const [isPdfUploading, setIsPdfUploading] = useState(false);
  const [pdfImportStats, setPdfImportStats] = useState<any>(null);
  const [editingCell, setEditingCell] = useState<{ id: number; field: 'category' | 'subcategory' } | null>(null);
  const [, setEditingValue] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkSearchFilter, setBulkSearchFilter] = useState('');
  const [bulkHighlightedIndex, setBulkHighlightedIndex] = useState(0);
  const [showBulkDropdown, setShowBulkDropdown] = useState(false);

  // Budget categories for inline editing dropdowns (fetched from settings API)
  const [BUDGET_CATEGORIES, setBudgetCategories] = useState<Record<string, string[]>>({});

  useEffect(() => {
    fetchBudgetCategories().then(setBudgetCategories).catch(console.error);
  }, []);

  // Reverse lookup: subcategory → main category
  const subToMain = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [main, subs] of Object.entries(BUDGET_CATEGORIES)) {
      for (const sub of subs) {
        map[sub] = main;
      }
    }
    return map;
  }, [BUDGET_CATEGORIES]);

  // All unique subcategories for the combobox
  const allSubcategories = useMemo(() => {
    return Object.values(BUDGET_CATEGORIES).flat().filter((v, i, a) => a.indexOf(v) === i);
  }, [BUDGET_CATEGORIES]);

  const saveInlineEdit = async (expenseId: number, field: 'category' | 'subcategory', value: string) => {
    try {
      const expense = expenses.find(e => e.id === expenseId);
      if (!expense) return;

      const updates: any = { [field]: value || null };

      // Auto-assign main category when subcategory is selected
      if (field === 'subcategory' && value && subToMain[value]) {
        updates.category = subToMain[value];
      }

      // If changing category and current subcategory doesn't belong to new category, clear it
      if (field === 'category' && value && expense.subcategory) {
        const subs = BUDGET_CATEGORIES[value] || [];
        if (!subs.includes(expense.subcategory)) {
          updates.subcategory = null;
        }
      }

      const response = await authedFetch(`/api/expenses/${expenseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (response.ok) refetch();
    } catch (error) {
      console.error('Error saving inline edit:', error);
    }
    setEditingCell(null);
  };

  const bulkUpdateCategory = async (subcategory: string) => {
    if (selectedIds.size === 0) return;
    const mainCategory = subToMain[subcategory] || null;
    try {
      const response = await authedFetch('/api/expenses/bulk-update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: Array.from(selectedIds),
          updates: { category: mainCategory, subcategory },
        }),
      });
      if (response.ok) {
        setSelectedIds(new Set());
        setBulkSearchFilter('');
        setShowBulkDropdown(false);
        refetch();
      }
    } catch (error) {
      console.error('Error bulk updating:', error);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredExpenses.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredExpenses.map(e => e.id)));
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Calculate date ranges
  const getDateRange = (range: typeof dateRange) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const quarter = Math.floor(month / 3);

    let startDate: string;
    let endDate: string;

    switch (range) {
      case 'all':
        startDate = '2000-01-01';
        endDate = '2099-12-31';
        break;
      case 'month':
        startDate = new Date(year, month, 1).toISOString().split('T')[0];
        endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];
        break;
      case 'quarter':
        startDate = new Date(year, quarter * 3, 1).toISOString().split('T')[0];
        endDate = new Date(year, quarter * 3 + 3, 0).toISOString().split('T')[0];
        break;
      case 'year':
        startDate = `${year}-01-01`;
        endDate = `${year}-12-31`;
        break;
      case 'custom-month': {
        const [y, m] = selectedMonth.split('-').map(Number);
        startDate = new Date(y, m - 1, 1).toISOString().split('T')[0];
        endDate = new Date(y, m, 0).toISOString().split('T')[0];
        break;
      }
      case 'custom-year':
        startDate = `${selectedYear}-01-01`;
        endDate = `${selectedYear}-12-31`;
        break;
    }

    return { startDate, endDate };
  };

  // API function to fetch expenses
  const fetchExpenses = async (): Promise<ExpensesResponse> => {
    const { startDate, endDate } = getDateRange(dateRange);
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: (currentPage * limit).toString(),
      sortBy: 'date',
      sortOrder: 'DESC',
      startDate,
      endDate,
      includeTransfers: includeTransfers.toString(),
      includeIncome: includeIncome.toString()
    });

    if (searchTerm) params.append('search', searchTerm);
    if (selectedCategory !== 'all') params.append('category', selectedCategory);
    if (selectedSubcategory !== 'all') params.append('subcategory', selectedSubcategory);

    const response = await authedFetch(`/api/expenses?${params}`);
    if (!response.ok) {
      throw new Error('Failed to fetch expenses');
    }
    return response.json();
  };

  // Fetch filter options (categories, subcategories, accounts)
  const { data: filterOptions } = useQuery({
    queryKey: ['expenseFilters'],
    queryFn: async () => {
      const response = await authedFetch('/api/expenses/filters');
      if (!response.ok) throw new Error('Failed to fetch filter options');
      return response.json();
    },
    staleTime: 300000, // 5 minutes
  });

  // Use React Query to fetch expenses
  const {
    data: expensesData,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['expenses', currentPage, limit, searchTerm, selectedCategory, selectedSubcategory, dateRange, selectedMonth, selectedYear, uncategorizedOnly, includeTransfers, includeIncome],
    queryFn: fetchExpenses,
    staleTime: 30000, // 30 seconds
  });

  const expenses = useMemo(() => {
    const raw = expensesData?.expenses || [];
    if (uncategorizedOnly) return raw.filter(e => !e.category && !e.subcategory);
    return raw;
  }, [expensesData?.expenses, uncategorizedOnly]);

  // Fetch all expenses (unpaginated) for the chart
  const { data: allExpensesData } = useQuery({
    queryKey: ['expenses-chart', searchTerm, selectedCategory, selectedSubcategory, dateRange, selectedMonth, selectedYear, includeTransfers, includeIncome],
    queryFn: async (): Promise<ExpensesResponse> => {
      const { startDate, endDate } = getDateRange(dateRange);
      const params = new URLSearchParams({
        limit: '10000',
        offset: '0',
        sortBy: 'date',
        sortOrder: 'DESC',
        startDate,
        endDate,
        includeTransfers: includeTransfers.toString(),
        includeIncome: includeIncome.toString(),
      });
      if (searchTerm) params.append('search', searchTerm);
      if (selectedCategory !== 'all') params.append('category', selectedCategory);
      if (selectedSubcategory !== 'all') params.append('subcategory', selectedSubcategory);
      const response = await authedFetch(`/api/expenses?${params}`);
      if (!response.ok) throw new Error('Failed to fetch expenses for chart');
      return response.json();
    },
    staleTime: 30000,
  });
  const chartExpenses = useMemo(() => {
    const raw = allExpensesData?.expenses || [];
    if (uncategorizedOnly) return raw.filter(e => !e.category && !e.subcategory);
    return raw;
  }, [allExpensesData?.expenses, uncategorizedOnly]);
  const categories = ['all', ...(filterOptions?.categories || []).filter((c: string) => includeIncome || c !== 'Income')];
  const subcategories = ['all', ...(filterOptions?.subcategories || [])];

  // CSV handling functions
  const handleCsvUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setCsvFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text.trim()) {
          toast.error('CSV file appears to be empty');
          return;
        }

        const rows = text.split('\n').filter(row => row.trim());
        if (rows.length < 2) {
          toast.error('CSV file must have at least a header row and one data row');
          return;
        }

        // Parse CSV properly handling quoted fields
        const parseCSVRow = (row: string): string[] => {
          const result: string[] = [];
          let current = '';
          let inQuotes = false;

          for (let i = 0; i < row.length; i++) {
            const char = row[i];
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              result.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }
          result.push(current.trim());
          return result;
        };

        const headers = parseCSVRow(rows[0]).map(h => h.toLowerCase().replace(/"/g, ''));
        console.log('CSV Headers found:', headers);

        const data = rows.slice(1).map((row) => {
          const values = parseCSVRow(row);
          const item: any = {};

          headers.forEach((header, headerIndex) => {
            let value = values[headerIndex]?.trim() || '';

            // Remove quotes if present
            if (value.startsWith('"') && value.endsWith('"')) {
              value = value.slice(1, -1);
            }

            // Convert amount to number if it's an amount field
            if (header.includes('amount') || header.includes('price') || header.includes('debit') || header.includes('credit')) {
              const numValue = parseFloat(value.replace(/[$,]/g, ''));
              item[header] = isNaN(numValue) ? 0 : Math.abs(numValue); // Take absolute value
            } else {
              item[header] = value;
            }
          });
          return item;
        }).filter(item => {
          // Filter out completely empty rows
          return Object.values(item).some(value => value !== '' && value !== 0);
        });

        console.log('Parsed CSV data:', data.slice(0, 3)); // Log first 3 rows for debugging
        setCsvData(data);
        setShowCsvPreview(true);
      } catch (error) {
        console.error('Error parsing CSV:', error);
        toast.error('Error parsing CSV file. Please check the file format.');
      }
    };
    reader.readAsText(file);
  };

  const applyCsvImport = async () => {
    if (!csvData.length) {
      toast.error('No CSV data to import');
      return;
    }

    console.log('Starting CSV import with data:', csvData.slice(0, 2)); // Log first 2 items
    setIsUploading(true);
    try {
      const response = await authedFetch('/api/expenses/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expenses: csvData.map((item, index) => {
            // Helper function to find field value by possible field names
            const getField = (possibleNames: string[]) => {
              for (const name of possibleNames) {
                if (item[name] !== undefined && item[name] !== '') {
                  return item[name];
                }
              }
              return null;
            };

            const merchant = getField(['merchant', 'description', 'payee', 'vendor']);
            const statement = getField(['statement', 'memo', 'notes', 'description']);

            // Auto-detect transfers based on merchant/description
            const isTransfer =
              (merchant && merchant.toLowerCase().includes('credit card payment')) ||
              (statement && statement.toLowerCase().includes('credit card payment')) ||
              (merchant && merchant.toLowerCase().includes('transfer')) ||
              (statement && statement.toLowerCase().includes('transfer'));

            const mappedExpense = {
              date: getField(['date', 'transaction date', 'posted date']) || new Date().toISOString().split('T')[0],
              merchant: merchant,
              amount: getField(['amount', 'transaction amount', 'debit', 'credit']) || 0,
              statement: statement,
              category: getField(['category', 'main category', 'primary category']),
              subcategory: getField(['subcategory', 'sub category', 'secondary category']),
              account: getField(['account', 'account name', 'bank account']),
              imported_from: 'csv_import',
              is_transfer: isTransfer
            };

            // Log first few mappings for debugging
            if (index < 2) {
              console.log(`Mapped expense ${index + 1}:`, {
                original: item,
                mapped: mappedExpense
              });
            }

            return mappedExpense;
          })
        }),
      });

      if (!response.ok) {
        // Try to get error details from the response
        let errorMessage = 'Failed to import expenses';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
          if (errorData.errors && errorData.errors.length > 0) {
            console.error('Import errors:', errorData.errors);
            errorMessage += `: ${errorData.errors[0].error}`;
          }
        } catch (e) {
          // If parsing response fails, use the default error message
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      console.log('Import result:', result);

      // Reset CSV state
      setCsvData([]);
      setShowCsvPreview(false);
      setCsvFile(null);

      // Refresh the expenses list
      refetch();

      // Create detailed success message
      let message = `Successfully imported ${result.successCount} expenses`;
      if (result.duplicateCount > 0) {
        message += `, skipped ${result.duplicateCount} duplicates`;
      }
      if (result.errorCount > 0) {
        message += `, ${result.errorCount} errors`;
      }

      toast.success(message);
    } catch (error) {
      console.error('Error importing CSV:', error);
      toast.error('Failed to import CSV. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const cancelCsvImport = () => {
    setCsvData([]);
    setShowCsvPreview(false);
    setCsvFile(null);
  };

  // PDF upload handlers
  const handlePdfUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsPdfUploading(true);
    setPdfImportStats(null);

    try {
      const formData = new FormData();
      Array.from(files).forEach(file => formData.append('files', file));

      const response = await authedFetch('/api/expenses/preview-pdf', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Failed to parse PDF files');

      const data = await response.json();
      setPdfPreview(data.transactions);
      setPdfImportStats({
        total: data.total,
        duplicates: data.duplicates,
        newTransactions: data.newTransactions,
      });
    } catch (error) {
      console.error('Error parsing PDFs:', error);
      toast.error('Failed to parse PDF files. Make sure they are Chase statements.');
    } finally {
      setIsPdfUploading(false);
      // Reset the file input
      event.target.value = '';
    }
  };

  const applyPdfImport = async () => {
    if (!pdfPreview) return;

    const newTransactions = pdfPreview.filter(t => !t.is_duplicate && !t.error);
    if (newTransactions.length === 0) {
      toast.info('No new transactions to import.');
      return;
    }

    setIsPdfUploading(true);
    try {
      const response = await authedFetch('/api/expenses/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expenses: newTransactions.map(t => ({
            date: t.date,
            merchant: t.merchant,
            amount: t.amount,
            statement: t.statement,
            account: t.account,
            is_transfer: t.is_transfer,
            imported_from: t.imported_from,
          })),
        }),
      });

      if (!response.ok) throw new Error('Failed to import');
      const result = await response.json();

      setPdfPreview(null);
      setPdfImportStats(null);
      refetch();

      let message = `Imported ${result.successCount} transactions`;
      if (result.duplicateCount > 0) message += `, ${result.duplicateCount} duplicates skipped`;
      toast.success(message);
    } catch (error) {
      console.error('Error importing PDF transactions:', error);
      toast.error('Failed to import transactions.');
    } finally {
      setIsPdfUploading(false);
    }
  };

  const cancelPdfImport = () => {
    setPdfPreview(null);
    setPdfImportStats(null);
  };

  const downloadCsvTemplate = () => {
    const headers = ['date', 'merchant', 'amount', 'statement', 'category', 'subcategory', 'account'];
    const sampleData = [
      ['2024-01-15', 'Whole Foods', '125.43', 'Weekly grocery shopping', 'Food & Dining', 'Groceries', 'Checking'],
      ['2024-01-14', 'Shell', '45.20', 'Gas fill-up', 'Transportation', 'Fuel', 'Credit Card'],
      ['2024-01-13', 'Netflix', '15.99', 'Monthly subscription', 'Entertainment', 'Streaming', 'Credit Card']
    ];

    const csvContent = [
      headers.join(','),
      ...sampleData.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'expense_template.csv';
    link.click();
    window.URL.revokeObjectURL(url);
  };

  // Detect available columns from data
  useEffect(() => {
    if (expenses.length > 0) {
      const allColumns = new Set<string>();
      expenses.forEach(expense => {
        Object.keys(expense).forEach(key => allColumns.add(key));
      });
      setAvailableColumns(Array.from(allColumns));
    }
  }, [expenses]);

  // Helper function to format column name for display
  const formatColumnName = (column: string) => {
    return column.charAt(0).toUpperCase() + column.slice(1).replace(/([A-Z])/g, ' $1');
  };

  // Helper function to format cell value
  const formatCellValue = (value: any, column: string) => {
    if (value === null || value === undefined) return '-';

    if (column.toLowerCase().includes('amount') || column.toLowerCase().includes('price')) {
      const num = parseFloat(value);
      if (isNaN(num)) return value;
      const abs = Math.abs(num);
      const formatted = `$${abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      return num < 0 ? `-${formatted}` : formatted;
    }

    if (column.toLowerCase().includes('date')) {
      try {
        return new Date(value).toLocaleDateString();
      } catch {
        return value;
      }
    }

    return value.toString();
  };

  const categoryColors: { [key: string]: string } = {
    'Food & Dining': 'bg-green-100 text-green-800',
    'Transportation': 'bg-yellow-100 text-yellow-800',
    'Entertainment': 'bg-purple-100 text-purple-800',
    'Utilities': 'bg-blue-100 text-blue-800',
    'Shopping': 'bg-pink-100 text-pink-800',
    'Housing': 'bg-indigo-100 text-indigo-800',
    'Health & Fitness': 'bg-red-100 text-red-800',
  };

  const [showChart, setShowChart] = useState(true);
  // The chart groups the current selection by week, month, quarter or year.
  // Until a grouping is picked by hand it follows the date range: weeks for a
  // month or quarter, months for anything longer.
  const [groupChoice, setGroupChoice] = useState<Grouping | null>(null);
  const grouping: Grouping = groupChoice ?? (['month', 'custom-month', 'quarter'].includes(dateRange) ? 'week' : 'month');
  // Clicking a bar narrows the list to that bar's dates.
  const [selectedBucket, setSelectedBucket] = useState<{ key: string; start: string; end: string; title: string } | null>(null);
  useEffect(() => { setSelectedBucket(null); }, [grouping, dateRange, selectedMonth, selectedYear]);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const handleColumnSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      // Default sort direction by data type
      const isNumeric = column.toLowerCase().includes('amount') || column.toLowerCase().includes('price');
      const isDate = column.toLowerCase() === 'date' || column.toLowerCase().includes('_at');
      setSortDirection(isNumeric ? 'desc' : isDate ? 'desc' : 'asc');
    }
  };

  // Since filtering is handled by the API, we use the returned expenses directly
  // If a week is selected from the chart, further filter to that week
  const filteredExpenses = useMemo(() => {
    let result = expenses;
    if (selectedBucket) {
      result = result.filter(e => e.date >= selectedBucket.start && e.date <= selectedBucket.end);
    }
    if (sortColumn) {
      result = [...result].sort((a, b) => {
        const va = (a as any)[sortColumn] ?? '';
        const vb = (b as any)[sortColumn] ?? '';
        const isNumeric = sortColumn.toLowerCase().includes('amount') || sortColumn.toLowerCase().includes('price');
        let cmp: number;
        if (isNumeric) {
          cmp = (parseFloat(va) || 0) - (parseFloat(vb) || 0);
        } else {
          cmp = String(va).localeCompare(String(vb));
        }
        return sortDirection === 'asc' ? cmp : -cmp;
      });
    }
    return result;
  }, [expenses, selectedBucket, sortColumn, sortDirection]);
  // Spending only: income (stored negative) and taxes would net it to nonsense.
  const isSpendRow = (e: Expense) =>
    !e.is_transfer && e.category !== 'Income' && e.category !== 'Taxes' && e.category !== 'Credit Card Payment';
  const totalAmount = filteredExpenses.filter(isSpendRow).reduce((sum, expense) => sum + expense.amount, 0);

  // Weekly spending data for chart (uses all expenses, not paginated)
  const chartData = useMemo(() => {
    const spend = chartExpenses.filter(isSpendRow).filter(e => /^\d{4}-\d{2}-\d{2}/.test(e.date || ''));
    if (spend.length === 0) return { buckets: [] as ChartBucket[], average: 0 };

    const dates = spend.map(e => e.date.slice(0, 10)).sort();
    const first = bucketOf(dates[0], grouping);
    const last = bucketOf(dates[dates.length - 1], grouping);
    const spansYears = first.start.slice(0, 4) !== last.start.slice(0, 4);

    // Every bucket from the first to the last, so a period with no spending
    // shows as an empty slot instead of silently disappearing.
    const map = new Map<string, ChartBucket>();
    for (let b = first; b.key <= last.key; b = bucketOf(nextDay(b.end), grouping)) {
      map.set(b.key, { ...b, label: bucketLabel(b, grouping, spansYears), total: 0, count: 0 });
      if (map.size > 400) break;
    }
    for (const e of spend) {
      const b = map.get(bucketOf(e.date.slice(0, 10), grouping).key);
      if (b) { b.total += e.amount; b.count += 1; }
    }
    const buckets = [...map.values()].map(b => ({ ...b, total: Math.round(b.total * 100) / 100 }));
    const average = Math.round((buckets.reduce((sum, b) => sum + b.total, 0) / buckets.length) * 100) / 100;
    return { buckets, average };
  }, [chartExpenses, grouping]);

  // Reset page and selection when filters change
  useEffect(() => {
    setCurrentPage(0);
    setSelectedIds(new Set());
  }, [searchTerm, selectedCategory, selectedSubcategory, dateRange, selectedMonth, selectedYear, uncategorizedOnly, includeTransfers, includeIncome]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-ever-lime"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-ever-neg">Error loading expenses. Please try again.</p>
        <Button onClick={() => refetch()} className="mt-4">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-ever-ink">Expenses</h1>
        <div className="flex space-x-3">
          <div className="relative group">
            <label className="border border-ever-line text-ever-ink hover:bg-white/5 px-4 py-2 rounded-[11px] flex items-center cursor-pointer text-sm transition">
              <Upload className="h-4 w-4 mr-2" />
              Import CSV
              <input
                type="file"
                accept=".csv"
                onChange={handleCsvUpload}
                className="hidden"
              />
            </label>

            {/* Hover dropdown for template options */}
            <div className="absolute left-0 top-full mt-1 bg-ever-card border border-ever-line rounded-ever shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 w-48">
              <button
                onClick={downloadCsvTemplate}
                className="w-full px-4 py-2 text-left text-sm text-ever-dim hover:bg-white/5 flex items-center"
              >
                <Download className="h-3 w-3 mr-2" />
                Download Template
              </button>
              <button
                onClick={() => setShowTemplate(!showTemplate)}
                className="w-full px-4 py-2 text-left text-sm text-ever-dim hover:bg-white/5 flex items-center border-t border-ever-line"
              >
                <Eye className="h-3 w-3 mr-2" />
                View Template
              </button>
            </div>
          </div>

          <label className={cn(
            'border border-ever-line text-ever-ink px-4 py-2 rounded-[11px] flex items-center cursor-pointer text-sm transition',
            isPdfUploading ? 'opacity-50 pointer-events-none' : 'hover:bg-white/5',
          )}>
            <FileText className="h-4 w-4 mr-2" />
            {isPdfUploading ? 'Processing...' : 'Import Chase PDF'}
            <input
              type="file"
              accept=".pdf"
              multiple
              onChange={handlePdfUpload}
              disabled={isPdfUploading}
              className="hidden"
            />
          </label>

          <Button>
            <PlusCircle className="h-4 w-4" />
            Add Expense
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-6">
        {availableColumns.length > displayColumns.length && showColumnAlert && (
          <div className="mb-4 p-3 bg-white/5 border border-ever-line rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Info className="h-4 w-4 text-ever-lime mr-2" />
                <span className="text-sm text-ever-dim">
                  Additional columns detected from imported data.
                  <button
                    onClick={() => {
                      setDisplayColumns(availableColumns.filter(col => col !== 'id'));
                      setShowColumnAlert(false);
                    }}
                    className="ml-2 text-ever-lime hover:underline"
                  >
                    Show all columns
                  </button>
                </span>
              </div>
              <button
                onClick={() => setShowColumnAlert(false)}
                className="text-ever-dim hover:text-ever-ink ml-4"
                aria-label="Dismiss alert"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {/* Date Range Buttons */}
          <div className="flex items-center justify-between">
            <div className="flex gap-2 items-center flex-wrap">
              {(['all', 'month', 'quarter', 'year'] as const).map(range => (
                <button
                  key={range}
                  onClick={() => setDateRange(range)}
                  className={cn(
                    'px-4 py-2 rounded-md font-medium transition-colors',
                    dateRange === range
                      ? 'bg-ever-lime text-ever-lime-ink font-semibold'
                      : 'border border-ever-line text-ever-dim hover:text-ever-ink',
                  )}
                >
                  {range === 'all' ? 'All' : range === 'month' ? 'This Month' : range === 'quarter' ? 'This Quarter' : 'This Year'}
                </button>
              ))}

              <div className="border-l border-ever-line pl-3 ml-1 flex gap-2">
                <select
                  value={selectedYear}
                  onChange={e => {
                    setSelectedYear(e.target.value);
                    setSelectedMonth(e.target.value + selectedMonth.slice(4));
                    setDateRange(dateRange === 'custom-month' ? 'custom-month' : 'custom-year');
                  }}
                  onClick={() => { if (dateRange !== 'custom-month') setDateRange('custom-year'); }}
                  className={cn(
                    'px-3 py-2 rounded-lg text-sm border transition-colors cursor-pointer bg-ever-bg focus:outline-none',
                    dateRange === 'custom-year' || dateRange === 'custom-month'
                      ? 'border-ever-lime text-ever-ink'
                      : 'border-ever-line text-ever-dim hover:border-ever-lime',
                  )}
                >
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <select
                  value={dateRange === 'custom-year' ? 'all' : selectedMonth.slice(5)}
                  onChange={e => {
                    if (e.target.value === 'all') {
                      setDateRange('custom-year');
                    } else {
                      const newMonth = `${selectedYear}-${e.target.value}`;
                      setSelectedMonth(newMonth);
                      setDateRange('custom-month');
                    }
                  }}
                  className={cn(
                    'px-3 py-2 rounded-lg text-sm border transition-colors cursor-pointer bg-ever-bg focus:outline-none',
                    dateRange === 'custom-month' || dateRange === 'custom-year'
                      ? 'border-ever-lime text-ever-ink'
                      : 'border-ever-line text-ever-dim hover:border-ever-lime',
                  )}
                >
                  <option value="all">All Months</option>
                  {['01','02','03','04','05','06','07','08','09','10','11','12'].map(m => (
                    <option key={m} value={m}>
                      {new Date(2000, parseInt(m) - 1).toLocaleString('default', { month: 'short' })}
                    </option>
                  ))}
                </select>
              </div>

              <div className="border-l border-ever-line pl-3 ml-1 flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={uncategorizedOnly}
                    onChange={(e) => setUncategorizedOnly(e.target.checked)}
                    className="w-4 h-4 accent-ever-orange border-ever-line rounded"
                  />
                  <span className="text-sm text-ever-dim">Uncategorized</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeTransfers}
                    onChange={(e) => setIncludeTransfers(e.target.checked)}
                    className="w-4 h-4 accent-ever-lime border-ever-line rounded"
                  />
                  <span className="text-sm text-ever-dim">Include Transfers</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer" title="Show pay, refunds and interest in the list as well">
                  <input
                    type="checkbox"
                    checked={includeIncome}
                    onChange={(e) => setIncludeIncome(e.target.checked)}
                    className="w-4 h-4 accent-ever-lime border-ever-line rounded"
                  />
                  <span className="text-sm text-ever-dim">Include Income</span>
                </label>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-sm text-ever-dim">Total Spending</div>
                <div className="text-2xl font-bold text-ever-ink tabular-nums">
                  {money(expensesData?.totals?.spending ?? 0)}
                </div>
              </div>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-ever-faint h-4 w-4" />
              <input
                type="text"
                placeholder="Search expenses..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 bg-ever-bg border border-ever-line text-ever-ink placeholder-ever-faint rounded-lg w-full focus:outline-none focus:border-ever-lime"
              />
            </div>

            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                // Reset subcategory when category changes
                if (e.target.value === 'all') {
                  setSelectedSubcategory('all');
                }
              }}
              className="bg-ever-bg border border-ever-line text-ever-ink rounded-lg px-3 py-2 focus:outline-none focus:border-ever-lime"
            >
              {categories.map(category => (
                <option key={category} value={category}>
                  {category === 'all' ? 'All Categories' : category}
                </option>
              ))}
            </select>

            <select
              value={selectedSubcategory}
              onChange={(e) => setSelectedSubcategory(e.target.value)}
              className="bg-ever-bg border border-ever-line text-ever-ink rounded-lg px-3 py-2 focus:outline-none focus:border-ever-lime"
            >
              {subcategories.map(subcategory => (
                <option key={subcategory} value={subcategory}>
                  {subcategory === 'all' ? 'All Subcategories' : subcategory}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* CSV Template Preview Modal */}
      {showTemplate && (
        <Card className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-ever-ink">
              CSV Template Format
            </h2>
            <div className="flex space-x-2">
              <Button onClick={downloadCsvTemplate}>
                <Download className="h-4 w-4" />
                Download
              </Button>
              <Button variant="ghost" onClick={() => setShowTemplate(false)}>
                Close
              </Button>
            </div>
          </div>

          <div className="mb-4">
            <p className="text-sm text-ever-dim mb-2">
              Your CSV file should have the following columns in this exact order:
            </p>
            <div className="bg-white/5 p-3 rounded-md">
              <code className="text-sm font-mono text-ever-lime">
                date,merchant,amount,statement,category,subcategory,account
              </code>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ever-line">
              <thead>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-ever-dim uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-ever-dim uppercase tracking-wider">Merchant</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-ever-dim uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-ever-dim uppercase tracking-wider">Statement</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-ever-dim uppercase tracking-wider">Category</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-ever-dim uppercase tracking-wider">Subcategory</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-ever-dim uppercase tracking-wider">Account</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ever-line">
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-ever-ink">2024-01-15</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-ever-ink">Whole Foods</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-ever-ink">125.43</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-ever-ink">Weekly grocery shopping</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-ever-ink">Food & Dining</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-ever-ink">Groceries</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-ever-ink">Checking</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-ever-ink">2024-01-14</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-ever-ink">Shell</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-ever-ink">45.20</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-ever-ink">Gas fill-up</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-ever-ink">Transportation</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-ever-ink">Fuel</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-ever-ink">Credit Card</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-ever-ink">2024-01-13</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-ever-ink">Netflix</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-ever-ink">15.99</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-ever-ink">Monthly subscription</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-ever-ink">Entertainment</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-ever-ink">Streaming</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-ever-ink">Credit Card</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-4 text-xs text-ever-dim">
            <p><strong>Required fields:</strong> date, amount</p>
            <p><strong>Date format:</strong> YYYY-MM-DD (e.g., 2024-01-15)</p>
            <p><strong>Amount format:</strong> Numbers only, no currency symbols (e.g., 125.43)</p>
            <p><strong>Duplicate detection:</strong> Entries with identical date, merchant, amount, and statement will be automatically skipped</p>
          </div>
        </Card>
      )}

      {/* CSV Preview Modal */}
      {showCsvPreview && (
        <Card className="p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-lg font-semibold text-ever-ink">
                CSV Import Preview ({csvData.length} rows)
              </h2>
              <p className="text-sm text-ever-dim mt-1">
                Duplicates will be automatically detected and skipped
              </p>
            </div>
            <div className="flex space-x-2">
              <Button onClick={applyCsvImport} disabled={isUploading}>
                {isUploading ? 'Importing...' : 'Import'}
              </Button>
              <Button variant="ghost" onClick={cancelCsvImport} disabled={isUploading}>
                Cancel
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto max-h-64">
            <table className="min-w-full divide-y divide-ever-line">
              <thead>
                <tr>
                  {csvData[0] && Object.keys(csvData[0]).map(header => (
                    <th key={header} className="px-6 py-3 text-left text-xs font-medium text-ever-dim uppercase tracking-wider">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ever-line">
                {csvData.slice(0, 5).map((row, index) => (
                  <tr key={index}>
                    {Object.values(row).map((value: any, cellIndex) => (
                      <td key={cellIndex} className="px-6 py-4 whitespace-nowrap text-sm text-ever-ink">
                        {value?.toString() || '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {csvData.length > 5 && (
              <p className="text-sm text-ever-dim mt-2">
                Showing first 5 rows of {csvData.length} total rows
              </p>
            )}
          </div>
        </Card>
      )}

      {/* PDF Preview Modal */}
      {pdfPreview && (
        <Card className="p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-lg font-semibold text-ever-ink">
                Chase PDF Import Preview
              </h3>
              {pdfImportStats && (
                <p className="text-sm text-ever-dim mt-1">
                  {pdfImportStats.total} transactions found —{' '}
                  <span className="text-ever-pos font-medium">{pdfImportStats.newTransactions} new</span>
                  {pdfImportStats.duplicates > 0 && (
                    <span className="text-ever-orange font-medium"> — {pdfImportStats.duplicates} duplicates (will be skipped)</span>
                  )}
                </p>
              )}
            </div>
            <div className="flex space-x-3">
              <Button variant="ghost" onClick={cancelPdfImport}>
                Cancel
              </Button>
              <Button
                onClick={applyPdfImport}
                disabled={isPdfUploading || !pdfImportStats?.newTransactions}
              >
                {isPdfUploading ? 'Importing...' : `Import ${pdfImportStats?.newTransactions || 0} Transactions`}
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="min-w-full divide-y divide-ever-line text-sm">
              <thead className="bg-ever-card sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-ever-dim uppercase">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-ever-dim uppercase">Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-ever-dim uppercase">Merchant</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-ever-dim uppercase">Amount</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-ever-dim uppercase">Account</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-ever-dim uppercase">Type</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-ever-dim uppercase">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ever-line">
                {pdfPreview.map((tx, idx) => (
                  <tr
                    key={idx}
                    className={
                      tx.is_duplicate ? 'bg-white/5 opacity-60' :
                      tx.is_transfer ? 'bg-white/5 opacity-60' :
                      ''
                    }
                  >
                    <td className="px-4 py-2 whitespace-nowrap">
                      {tx.is_duplicate ? (
                        <span className={cn('inline-flex px-2 py-0.5 text-xs font-medium rounded-full', everPill('bg-amber-100'))}>Duplicate</span>
                      ) : tx.is_transfer ? (
                        <span className={cn('inline-flex px-2 py-0.5 text-xs font-medium rounded-full', everPill('bg-gray-100'))}>Transfer</span>
                      ) : (
                        <span className={cn('inline-flex px-2 py-0.5 text-xs font-medium rounded-full', everPill('bg-green-100'))}>New</span>
                      )}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-ever-ink">{tx.date}</td>
                    <td className="px-4 py-2 text-ever-ink max-w-xs truncate" title={tx.statement}>{tx.merchant}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-right font-medium text-ever-ink tabular-nums">
                      ${tx.amount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-ever-dim text-xs">{tx.account}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-ever-dim text-xs">{tx.source_type}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-ever-dim text-xs">{tx.source_file}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Expense Summary Cards */}
      {/* Spending, income and taxes are shown apart: added together they net
          out to a number that is none of the three. */}
      {(() => {
        const t = expensesData?.totals;
        const spending = t?.spending ?? 0;
        return (
          <div className={cn('grid grid-cols-2 gap-4 md:gap-6', includeIncome ? 'lg:grid-cols-4' : 'lg:grid-cols-3')}>
            <StatCard
              label="Spending"
              dot="var(--ever-neg)"
              value={money(spending)}
              sub={t && t.spending_count > 0 ? `${t.spending_count} purchases · ${money(spending / t.spending_count)} average` : 'excludes income, taxes and transfers'}
            />
            {includeIncome && (
              <StatCard
                label="Income"
                dot="var(--ever-pos)"
                value={<span className="text-ever-pos">{money(t?.income ?? 0)}</span>}
                sub={t ? `${t.income_count} deposit${t.income_count === 1 ? '' : 's'} and refunds` : undefined}
              />
            )}
            <StatCard
              label="Taxes paid"
              dot="var(--ever-orange)"
              value={money(t?.taxes ?? 0)}
              sub={t ? `${t.taxes_count} payment${t.taxes_count === 1 ? '' : 's'}, not counted as spending` : undefined}
            />
            <StatCard
              label="Transactions"
              dot="var(--ever-violet)"
              value={expensesData?.pagination.total || 0}
              sub="everything listed below"
            />
          </div>
        );
      })()}

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="bg-ever-lime/15 border border-ever-line rounded-lg p-4 flex items-center gap-4">
          <span className="text-sm font-medium text-ever-ink">
            {selectedIds.size} selected
          </span>
          <div className="relative">
            <input
              type="text"
              value={bulkSearchFilter}
              onChange={e => {
                setBulkSearchFilter(e.target.value);
                setBulkHighlightedIndex(0);
                setShowBulkDropdown(true);
              }}
              onFocus={() => setShowBulkDropdown(true)}
              onKeyDown={e => {
                const filtered = allSubcategories.filter(s =>
                  s.toLowerCase().includes(bulkSearchFilter.toLowerCase())
                );
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setBulkHighlightedIndex(i => Math.min(i + 1, filtered.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setBulkHighlightedIndex(i => Math.max(i - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  if (filtered.length > 0) {
                    const idx = Math.min(bulkHighlightedIndex, filtered.length - 1);
                    bulkUpdateCategory(filtered[idx]);
                  }
                } else if (e.key === 'Escape') {
                  setShowBulkDropdown(false);
                  setBulkSearchFilter('');
                }
              }}
              placeholder="Set subcategory..."
              className="bg-ever-bg border border-ever-line text-ever-ink placeholder-ever-faint rounded px-3 py-1.5 text-sm focus:outline-none focus:border-ever-lime w-[220px]"
            />
            {showBulkDropdown && (() => {
              const filtered = allSubcategories.filter(s =>
                s.toLowerCase().includes(bulkSearchFilter.toLowerCase())
              );
              const safeIdx = Math.min(bulkHighlightedIndex, filtered.length - 1);
              return (
                <div className="absolute z-50 mt-1 w-[280px] max-h-48 overflow-y-auto bg-ever-card border border-ever-line rounded-md shadow-lg">
                  {filtered.map((opt, idx) => (
                    <div
                      key={opt}
                      className={cn(
                        'px-3 py-1.5 text-sm cursor-pointer',
                        idx === safeIdx ? 'bg-white/5 text-ever-ink' : 'text-ever-dim hover:bg-white/5',
                      )}
                      onMouseDown={() => bulkUpdateCategory(opt)}
                    >
                      <span className="font-medium">{opt}</span>
                      <span className="text-ever-faint ml-2 text-xs">{subToMain[opt]}</span>
                    </div>
                  ))}
                  {filtered.length === 0 && (
                    <div className="px-3 py-2 text-sm text-ever-faint">No matches</div>
                  )}
                </div>
              );
            })()}
          </div>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-sm text-ever-lime hover:underline"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Spending chart: follows every filter above, grouped as chosen */}
      {chartData.buckets.length > 0 && (
        <div className="bg-ever-card rounded-ever border border-ever-line">
          <div className="px-6 py-4 border-b border-ever-line flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center">
              <BarChart3 className="h-5 w-5 text-ever-lime mr-2" />
              <h2 className="text-lg font-semibold text-ever-ink">Spending by {grouping}</h2>
              {chartData.buckets.length > 1 && (
                <span className="ml-3 text-sm text-ever-dim">
                  Avg: {money(chartData.average)}/{grouping}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex gap-1" role="group" aria-label="Group the chart by">
                {GROUPINGS.map(g => (
                  <button
                    key={g.id}
                    onClick={() => setGroupChoice(g.id)}
                    aria-pressed={grouping === g.id}
                    className={cn(
                      'rounded-lg border px-3 py-1 text-xs',
                      grouping === g.id
                        ? 'border-transparent bg-ever-lime font-semibold text-ever-lime-ink'
                        : 'border-ever-line text-ever-dim hover:text-ever-ink',
                    )}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowChart(!showChart)}
                className="text-sm text-ever-dim hover:text-ever-ink"
              >
                {showChart ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          {showChart && (
            <div className="px-6 py-4">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={chartData.buckets}
                  margin={{ top: 5, right: 28, left: 10, bottom: 5 }}
                  onClick={(state) => {
                    const b = state?.activePayload?.[0]?.payload as ChartBucket | undefined;
                    if (b) setSelectedBucket(selectedBucket?.key === b.key ? null : { key: b.key, start: b.start, end: b.end, title: bucketTitle(b, grouping) });
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#313d4d" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12, fill: '#9db3a7' }}
                    tickLine={false}
                    axisLine={{ stroke: '#313d4d' }}
                    minTickGap={12}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: '#9db3a7' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v < 0 ? '-' : ''}$${Math.abs(v) >= 1000 ? `${parseFloat((Math.abs(v) / 1000).toFixed(1))}k` : Math.abs(v)}`}
                  />
                  <Tooltip
                    formatter={(value: number, _name: string, item: any) => [`${money(value)} · ${item?.payload?.count ?? 0} purchases`, 'Spent']}
                    labelFormatter={(_label, payload: any) => (payload?.[0]?.payload ? bucketTitle(payload[0].payload, grouping) : '')}
                    contentStyle={{ borderRadius: '10px', border: '1px solid #4a5a70', background: '#0f141c', color: '#ebf2ec', fontSize: '13px' }}
                    labelStyle={{ color: '#9db3a7', marginBottom: 2 }}
                    itemStyle={{ color: '#ffffff', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
                    cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  />
                  {chartData.buckets.length > 1 && (
                    <ReferenceLine
                      y={chartData.average}
                      stroke="#5f7b70"
                      strokeDasharray="4 4"
                      label={{ value: 'Avg', position: 'right', fill: '#9db3a7', fontSize: 11 }}
                    />
                  )}
                  <Bar dataKey="total" name="Spent" radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false}>
                    {chartData.buckets.map((b) => {
                      const baseColor = b.total > chartData.average * 1.25 ? '#eb8f6c' : b.total > chartData.average ? '#efb15b' : '#8b6ff0';
                      const isSelected = selectedBucket?.key === b.key;
                      return (
                        <Cell
                          key={b.key}
                          fill={baseColor}
                          opacity={selectedBucket && !isSelected ? 0.3 : 1}
                          stroke={isSelected ? '#c9f04e' : 'none'}
                          strokeWidth={isSelected ? 2 : 0}
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {chartData.buckets.length > 1 && (
                <div className="flex items-center justify-center gap-6 mt-2 text-xs text-ever-dim">
                  <span className="flex items-center"><span className="w-3 h-3 rounded-sm bg-ever-violet mr-1.5" />At or under average</span>
                  <span className="flex items-center"><span className="w-3 h-3 rounded-sm bg-ever-orange mr-1.5" />Above average</span>
                  <span className="flex items-center"><span className="w-3 h-3 rounded-sm bg-ever-neg mr-1.5" />25%+ over average</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Banner while a bar is selected */}
      {selectedBucket && (
        <div className="bg-ever-lime/15 border border-ever-line rounded-lg px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-ever-ink">
            Showing <strong>{selectedBucket.title}</strong>
            <span className="ml-2 text-ever-dim">({filteredExpenses.length} shown, {money(totalAmount)} spending)</span>
          </span>
          <button
            onClick={() => setSelectedBucket(null)}
            className="text-ever-lime hover:underline text-sm flex items-center"
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Clear
          </button>
        </div>
      )}

      {/* Expenses List */}
      <div className="bg-ever-card rounded-ever border border-ever-line">
        <div className="px-6 py-4 border-b border-ever-line">
          <h2 className="text-lg font-semibold text-ever-ink">Recent Expenses</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-ever-line">
            <thead>
              <tr>
                <th className="px-3 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={filteredExpenses.length > 0 && selectedIds.size === filteredExpenses.length}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 accent-ever-lime border-ever-line rounded"
                  />
                </th>
                {displayColumns.filter(col => col !== 'id').map((column) => (
                  <th
                    key={column}
                    onClick={() => handleColumnSort(column)}
                    className={cn(
                      'px-6 py-3 text-xs font-medium text-ever-dim uppercase tracking-wider cursor-pointer hover:text-ever-ink select-none',
                      column.toLowerCase().includes('amount') ? 'text-right' : 'text-left',
                    )}
                  >
                    <span className="inline-flex items-center gap-1">
                      {formatColumnName(column)}
                      {sortColumn === column ? (
                        <span className="text-ever-lime">{sortDirection === 'asc' ? '\u25B2' : '\u25BC'}</span>
                      ) : (
                        <span className="text-ever-faint">{'\u25BC'}</span>
                      )}
                    </span>
                  </th>
                ))}
                <th className="px-6 py-3 text-xs font-medium text-ever-dim uppercase tracking-wider text-center">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ever-line">
              {filteredExpenses.map((expense, index) => (
                <tr key={expense.id || index} className={cn(
                  'hover:bg-white/5',
                  expense.is_transfer && 'bg-white/5',
                  selectedIds.has(expense.id) && 'bg-ever-lime/15',
                )}>
                  <td className="px-3 py-4 w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(expense.id)}
                      onChange={() => toggleSelect(expense.id)}
                      className="w-4 h-4 accent-ever-lime border-ever-line rounded"
                    />
                  </td>
                  {displayColumns.filter(col => col !== 'id').map((column) => (
                    <td
                      key={column}
                      className={cn(
                        'px-6 py-4 whitespace-nowrap text-sm',
                        // Amounts: red = money out (debit), green = money in (credit/refund/income).
                        column.toLowerCase().includes('amount')
                          ? cn('text-right font-medium tabular-nums', Number((expense as any)[column]) < 0 ? 'text-ever-pos' : 'text-ever-neg')
                          : 'text-ever-ink',
                      )}
                    >
                      {/* Inline editable category cell */}
                      {(column.toLowerCase() === 'category' || column.toLowerCase() === 'subcategory') ? (() => {
                        const field = column.toLowerCase() as 'category' | 'subcategory';
                        const isEditing = editingCell?.id === expense.id && editingCell?.field === field;

                        const options = field === 'category'
                          ? Object.keys(BUDGET_CATEGORIES)
                          : expense.category && BUDGET_CATEGORIES[expense.category]
                            ? BUDGET_CATEGORIES[expense.category]
                            : Object.values(BUDGET_CATEGORIES).flat().filter((v, i, a) => a.indexOf(v) === i);

                        if (isEditing) {
                          const filtered = options.filter(opt =>
                            opt.toLowerCase().includes(searchFilter.toLowerCase())
                          );
                          const safeIndex = Math.min(highlightedIndex, filtered.length - 1);

                          return (
                            <div className="relative">
                              <input
                                autoFocus
                                type="text"
                                value={searchFilter}
                                onChange={e => {
                                  setSearchFilter(e.target.value);
                                  setHighlightedIndex(0);
                                }}
                                onKeyDown={e => {
                                  if (e.key === 'ArrowDown') {
                                    e.preventDefault();
                                    setHighlightedIndex(i => Math.min(i + 1, filtered.length - 1));
                                  } else if (e.key === 'ArrowUp') {
                                    e.preventDefault();
                                    setHighlightedIndex(i => Math.max(i - 1, 0));
                                  } else if (e.key === 'Enter') {
                                    e.preventDefault();
                                    if (filtered.length > 0) {
                                      saveInlineEdit(expense.id, field, filtered[safeIndex]);
                                      setSearchFilter('');
                                    }
                                  } else if (e.key === 'Escape') {
                                    setEditingCell(null);
                                    setSearchFilter('');
                                  }
                                }}
                                onBlur={() => {
                                  // Delay to allow click on dropdown item
                                  setTimeout(() => {
                                    setEditingCell(null);
                                    setSearchFilter('');
                                  }, 150);
                                }}
                                placeholder={`Search ${field}...`}
                                className="bg-ever-bg border border-ever-lime text-ever-ink placeholder-ever-faint rounded px-2 py-1 text-xs focus:outline-none w-[180px]"
                              />
                              <div className="absolute z-50 mt-1 w-[220px] max-h-48 overflow-y-auto bg-ever-card border border-ever-line rounded-md shadow-lg">
                                <div
                                  className="px-3 py-1.5 text-xs text-ever-faint cursor-pointer hover:bg-white/5"
                                  onMouseDown={() => {
                                    saveInlineEdit(expense.id, field, '');
                                    setSearchFilter('');
                                  }}
                                >
                                  -- None --
                                </div>
                                {filtered.map((opt, idx) => (
                                  <div
                                    key={opt}
                                    className={cn(
                                      'px-3 py-1.5 text-xs cursor-pointer',
                                      idx === safeIndex ? 'bg-white/5 text-ever-ink' : 'text-ever-dim hover:bg-white/5',
                                    )}
                                    onMouseDown={() => {
                                      saveInlineEdit(expense.id, field, opt);
                                      setSearchFilter('');
                                    }}
                                  >
                                    {opt}
                                  </div>
                                ))}
                                {filtered.length === 0 && (
                                  <div className="px-3 py-2 text-xs text-ever-faint">No matches</div>
                                )}
                              </div>
                            </div>
                          );
                        }

                        // Display mode
                        if (field === 'category' && expense.is_transfer) {
                          return (
                            <span className={cn('inline-flex px-2 py-1 text-xs font-medium rounded-full', everPill('bg-gray-100'))}>
                              <ArrowLeftRight className="h-3 w-3 mr-1 inline" />
                              Transfer
                            </span>
                          );
                        }

                        return (
                          <div
                            onClick={() => {
                              setEditingCell({ id: expense.id, field });
                              setEditingValue(expense[field] || '');
                              setSearchFilter('');
                              setHighlightedIndex(0);
                            }}
                            className="cursor-pointer min-w-[80px] min-h-[24px]"
                            title={`Click to set ${field}`}
                          >
                            {(expense as any)[column] ? (
                              field === 'category' ? (
                                <span className={cn('inline-flex px-2 py-1 text-xs font-medium rounded-full', everPill(categoryColors[(expense as any)[column]]))}>
                                  {(expense as any)[column]}
                                </span>
                              ) : (
                                <span className="text-ever-ink">{(expense as any)[column]}</span>
                              )
                            ) : (
                              <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-transparent text-ever-faint border border-dashed border-ever-line hover:border-ever-lime hover:text-ever-lime">
                                + {field}
                              </span>
                            )}
                          </div>
                        );
                      })() : column.toLowerCase() === 'merchant' && expense.is_transfer ? (
                        <div className="flex items-center gap-1 font-medium text-ever-dim">
                          <ArrowLeftRight className="h-4 w-4" />
                          {formatCellValue((expense as any)[column], column)}
                        </div>
                      ) : (
                        <div className={cn(column.toLowerCase() === 'merchant' && 'font-medium', expense.is_transfer && 'text-ever-dim')}>
                          {formatCellValue((expense as any)[column], column)}
                        </div>
                      )}
                    </td>
                  ))}
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <button
                      onClick={async () => {
                        try {
                          const response = await authedFetch(`/api/expenses/${expense.id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ is_transfer: !expense.is_transfer })
                          });
                          if (response.ok) {
                            refetch();
                          }
                        } catch (error) {
                          console.error('Error toggling transfer:', error);
                        }
                      }}
                      className={cn(
                        'px-3 py-1 rounded text-xs font-medium transition-colors border',
                        expense.is_transfer
                          ? 'bg-white/5 text-ever-dim border-ever-line hover:bg-white/10'
                          : 'bg-ever-lime/15 text-ever-lime border-ever-lime/25 hover:bg-ever-lime/25',
                      )}
                      title={expense.is_transfer ? 'Mark as Expense' : 'Mark as Transfer'}
                    >
                      {expense.is_transfer ? 'Transfer' : 'Mark Transfer'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredExpenses.length === 0 && (
          <div className="text-center py-12">
            <CreditCard className="h-12 w-12 text-ever-faint mx-auto mb-4" />
            <p className="text-ever-dim">No expenses found matching your criteria.</p>
          </div>
        )}

        {/* Pagination */}
        {expensesData?.pagination && expensesData.pagination.total > 0 && (
          <div className="px-6 py-3 border-t border-ever-line flex items-center justify-between text-sm text-ever-dim">
            <span>
              Showing {currentPage * limit + 1}–{Math.min((currentPage + 1) * limit, expensesData.pagination.total)} of {expensesData.pagination.total}
            </span>
            {expensesData.pagination.total > limit && (
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(p => p - 1)}
                  disabled={currentPage === 0}
                  className="px-3 py-1 rounded border border-ever-line text-ever-ink hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage(p => p + 1)}
                  disabled={!expensesData.pagination.hasMore}
                  className="px-3 py-1 rounded border border-ever-line text-ever-ink hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Expenses;