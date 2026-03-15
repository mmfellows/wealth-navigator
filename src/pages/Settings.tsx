import React, { useState, useEffect } from 'react';
import { Save, AlertCircle, RefreshCw, Trash2, CheckCircle, Clock, Plus, Minus, Key, Eye, EyeOff, Edit2, Tag, X, Upload, Download, RotateCcw } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import PlaidLink from '../components/PlaidLink';
import axios from 'axios';

const Settings: React.FC = () => {
  const location = useLocation();

  // Determine active section based on current route or localStorage
  const getActiveSection = () => {
    const path = location.pathname;

    // Check if we have state passed from navigation
    if (location.state && (location.state as any).fromSection) {
      const fromSection = (location.state as any).fromSection;
      localStorage.setItem('lastActiveSection', fromSection);
      return fromSection;
    }

    // If we're on a specific personal finance or investing page, use that
    if (path.startsWith('/budgets') || path.startsWith('/expenses') || path.startsWith('/accounts') || path.startsWith('/reports')) {
      localStorage.setItem('lastActiveSection', 'personal-finance');
      return 'personal-finance';
    }

    if (path.startsWith('/research') || path.startsWith('/ideas') || path.startsWith('/portfolio') || path.startsWith('/trades') || path.startsWith('/ips') || path.startsWith('/api-testing') || path === '/') {
      localStorage.setItem('lastActiveSection', 'investing');
      return 'investing';
    }

    // If we're on settings, use the last active section
    if (path === '/settings') {
      return localStorage.getItem('lastActiveSection') as 'investing' | 'personal-finance' || 'investing';
    }

    return 'investing';
  };

  const [activeSection, setActiveSection] = useState<'investing' | 'personal-finance'>(getActiveSection());

  // Update active section when route changes
  useEffect(() => {
    const newActiveSection = getActiveSection();
    setActiveSection(newActiveSection);
  }, [location.pathname, location.state]);

  const [targetAllocations, setTargetAllocations] = useState({
    lowRisk: 30,
    growth: 60,
    speculative: 10
  });

  // Simulated budget items for counting associations
  const sampleBudgetItems = [
    { id: 1, mainCategory: 'Home', secondaryCategory: 'Mortgage' },
    { id: 2, mainCategory: 'Food & Pharmacy', secondaryCategory: 'Groceries' },
    { id: 3, mainCategory: 'Vehicle', secondaryCategory: 'Vehicle Payments' },
    { id: 4, mainCategory: 'Health & Fitness', secondaryCategory: 'Health Insurance' },
    { id: 5, mainCategory: 'Discretionary Entertainment', secondaryCategory: 'Streaming Services' },
    { id: 6, mainCategory: 'Discretionary Food & Dining', secondaryCategory: 'Restaurants & Bars' },
    { id: 7, mainCategory: 'Other Transportation', secondaryCategory: 'Rideshares' },
    { id: 8, mainCategory: 'Home', secondaryCategory: 'Home Maintenance' },
    { id: 9, mainCategory: 'Discretionary Shopping', secondaryCategory: 'Clothing' },
    { id: 10, mainCategory: 'Travel & Vacation', secondaryCategory: 'Airfare' }
  ];

  // Default budget categories - version 2.0
  const defaultBudgetCategories = {
    mainCategories: [
      'Home',
      'Food & Pharmacy',
      'Vehicle',
      'Health & Fitness',
      'Productivity & Tools',
      'Other Transportation',
      'Discretionary Health',
      'Discretionary Entertainment',
      'Discretionary Shopping',
      'Travel & Vacation',
      'Discretionary Food & Dining',
      'Special Expense',
      'Other Spending'
    ],
    secondaryCategories: {
      'Home': ['Mortgage', 'Rent', 'HOA', 'Home Maintenance'],
      'Food & Pharmacy': ['Groceries', 'Pharmacy Stuff', 'Other Food & Pharm'],
      'Vehicle': ['Vehicle Payments', 'Regular Maintenance', 'Special Maintenance', 'Other Vehicle'],
      'Health & Fitness': ['Health Insurance', 'Gym Membership', 'Routine Medical / Dental', 'Special Medical / Dental', 'Other Health'],
      'Productivity & Tools': ['Productivity Software', 'Productivity Apps', 'Productivity Books', 'Education / Classes', 'Other Productivity & Tools'],
      'Other Transportation': ['Rideshares', 'Public Transit', 'Parking'],
      'Discretionary Health': ['Supplements', 'Fitness Classes', 'Health Apps', 'Elective Medical / Dental'],
      'Discretionary Entertainment': ['Movies / Rentals', 'Sports Clubs', 'Social Clubs', 'Concerts', 'Video Games', 'Books', 'Streaming Services', 'Ski Passes', 'Sporting Equipment'],
      'Discretionary Shopping': ['Clothing', 'Electronics', 'Home Goods', 'Gifts', 'Personal Care', 'Other Discretionary Shopping'],
      'Travel & Vacation': ['Airfare', 'Travel Food & Dining', 'Travel Shopping', 'Travel Other', 'Travel Entertainment'],
      'Discretionary Food & Dining': ['Restaurants & Bars', 'Alcohol', 'Coffee Shops', 'Takeout', 'Other Discretionary Food'],
      'Special Expense': ['Down Payment', 'New Vehicle', 'Other Special Expense'],
      'Other Spending': ['Charity', 'Repay via Business', '???']
    }
  };

  // Personal Finance Categories State
  const [budgetCategories, setBudgetCategories] = useState(defaultBudgetCategories);

  // Load budget categories from localStorage on mount
  useEffect(() => {
    const savedCategories = localStorage.getItem('budgetCategories');
    const categoryVersion = localStorage.getItem('budgetCategoriesVersion');
    const currentVersion = '2.0'; // Update this when categories change

    if (savedCategories && categoryVersion === currentVersion) {
      try {
        setBudgetCategories(JSON.parse(savedCategories));
      } catch (error) {
        console.error('Failed to parse saved budget categories:', error);
        // If parsing fails, use defaults and save them
        setBudgetCategories(defaultBudgetCategories);
        localStorage.setItem('budgetCategories', JSON.stringify(defaultBudgetCategories));
        localStorage.setItem('budgetCategoriesVersion', currentVersion);
      }
    } else {
      // Either no saved categories or version mismatch - use new defaults and save them
      setBudgetCategories(defaultBudgetCategories);
      localStorage.setItem('budgetCategories', JSON.stringify(defaultBudgetCategories));
      localStorage.setItem('budgetCategoriesVersion', currentVersion);
    }
  }, []);

  const [hasChanges, setHasChanges] = useState(false);
  const [editingCategory, setEditingCategory] = useState<{type: 'main' | 'secondary', mainCategory?: string, oldName?: string} | null>(null);
  const [editingValue, setEditingValue] = useState('');

  // CSV Upload state
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvProcessing, setCsvProcessing] = useState(false);
  const [csvPreview, setCsvPreview] = useState<{mainCategory: string, subCategory?: string}[] | null>(null);

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  // CSV Import state
  const [csvData, setCsvData] = useState<any[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [importProgress, setImportProgress] = useState<{
    step: 'upload' | 'preview' | 'mapping' | 'importing' | 'completed';
    isProcessing: boolean;
    categoriesFound: { main: string[], secondary: string[] };
    newCategories: { main: string[], secondary: string[] };
  }>({
    step: 'upload',
    isProcessing: false,
    categoriesFound: { main: [], secondary: [] },
    newCategories: { main: [], secondary: [] }
  });

  // Category mapping state for user decisions
  const [categoryMappings, setCategoryMappings] = useState<{
    [categoryName: string]: {
      type: 'main' | 'secondary' | 'skip';
      parentCategory?: string;
      isExisting: boolean;
    };
  }>({});

  // Backup state for categories and transactions
  const [categoryBackup, setCategoryBackup] = useState<{
    budgetCategories: typeof budgetCategories;
    timestamp: string;
  } | null>(null);

  // Transaction import state
  const [transactionBackup, setTransactionBackup] = useState<{
    transactions: any[];
    timestamp: string;
  } | null>(null);
  const [connectedAccounts, setConnectedAccounts] = useState<any[]>([]);
  const [syncHistory, setSyncHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // ETrade API Settings
  const [etradeKeys, setEtradeKeys] = useState({
    consumerKey: '',
    consumerSecret: '',
    sandboxMode: false
  });
  const [showSecret, setShowSecret] = useState(false);
  const [etradeKeysSaved, setEtradeKeysSaved] = useState(false);

  const currentAllocations = {
    lowRisk: 20.0,
    growth: 67.1,
    speculative: 12.9
  };

  const handleAllocationChange = (category: string, value: number) => {
    const clampedValue = Math.max(0, Math.min(100, value));

    setTargetAllocations(prev => {
      const newAllocations = { ...prev, [category]: clampedValue };

      // Auto-balance the other categories to maintain 100% total
      const categories = Object.keys(newAllocations).filter(key => key !== category);
      const remainingTotal = 100 - clampedValue;
      const currentOtherTotal = categories.reduce((sum, key) => sum + prev[key as keyof typeof prev], 0);

      if (currentOtherTotal > 0 && remainingTotal >= 0) {
        // Proportionally adjust other categories
        categories.forEach(key => {
          const proportion = prev[key as keyof typeof prev] / currentOtherTotal;
          newAllocations[key as keyof typeof newAllocations] = Math.round(remainingTotal * proportion);
        });

        // Handle rounding errors by adjusting the largest category
        const actualTotal = Object.values(newAllocations).reduce((sum, val) => sum + val, 0);
        if (actualTotal !== 100) {
          const largestCategory = categories.reduce((max, key) =>
            newAllocations[key as keyof typeof newAllocations] > newAllocations[max as keyof typeof newAllocations] ? key : max
          );
          newAllocations[largestCategory as keyof typeof newAllocations] += (100 - actualTotal);
        }
      } else if (remainingTotal < 0) {
        // If the new value would exceed 100%, cap it and zero out others
        newAllocations[category] = 100;
        categories.forEach(key => {
          newAllocations[key as keyof typeof newAllocations] = 0;
        });
      }

      return newAllocations;
    });
    setHasChanges(true);
  };

  const adjustAllocation = (category: string, delta: number) => {
    const currentValue = targetAllocations[category as keyof typeof targetAllocations];
    handleAllocationChange(category, currentValue + delta);
  };

  // Helper functions to count associated budget items
  const countMainCategoryUsage = (mainCategory: string) => {
    return sampleBudgetItems.filter(item => item.mainCategory === mainCategory).length;
  };

  const countSecondaryCategoryUsage = (mainCategory: string, secondaryCategory: string) => {
    return sampleBudgetItems.filter(
      item => item.mainCategory === mainCategory && item.secondaryCategory === secondaryCategory
    ).length;
  };

  // Personal Finance Category Management Functions
  const addMainCategory = (categoryName: string) => {
    if (categoryName.trim() && !budgetCategories.mainCategories.includes(categoryName.trim())) {
      setBudgetCategories(prev => ({
        ...prev,
        mainCategories: [...prev.mainCategories, categoryName.trim()],
        secondaryCategories: {
          ...prev.secondaryCategories,
          [categoryName.trim()]: []
        }
      }));
      setHasChanges(true);
    }
  };

  const removeMainCategory = (categoryName: string) => {
    const associatedCount = countMainCategoryUsage(categoryName);

    const confirmAction = () => {
      setBudgetCategories(prev => {
        const newSecondaryCategories = { ...prev.secondaryCategories };
        delete newSecondaryCategories[categoryName];

        return {
          mainCategories: prev.mainCategories.filter(cat => cat !== categoryName),
          secondaryCategories: newSecondaryCategories
        };
      });
      setHasChanges(true);
      setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: () => {} });
    };

    const message = associatedCount > 0
      ? `This will affect ${associatedCount} budget ${associatedCount === 1 ? 'item' : 'items'} that use this category.`
      : `This action cannot be undone.`;

    setConfirmModal({
      isOpen: true,
      title: `Delete "${categoryName}" Category`,
      message,
      onConfirm: confirmAction
    });
  };

  const addSecondaryCategory = (mainCategory: string, subCategoryName: string) => {
    if (subCategoryName.trim() && !budgetCategories.secondaryCategories[mainCategory]?.includes(subCategoryName.trim())) {
      setBudgetCategories(prev => ({
        ...prev,
        secondaryCategories: {
          ...prev.secondaryCategories,
          [mainCategory]: [...(prev.secondaryCategories[mainCategory] || []), subCategoryName.trim()]
        }
      }));
      setHasChanges(true);
    }
  };

  const removeSecondaryCategory = (mainCategory: string, subCategoryName: string) => {
    const associatedCount = countSecondaryCategoryUsage(mainCategory, subCategoryName);

    const confirmAction = () => {
      setBudgetCategories(prev => ({
        ...prev,
        secondaryCategories: {
          ...prev.secondaryCategories,
          [mainCategory]: prev.secondaryCategories[mainCategory]?.filter(cat => cat !== subCategoryName) || []
        }
      }));
      setHasChanges(true);
      setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: () => {} });
    };

    const message = associatedCount > 0
      ? `This will affect ${associatedCount} budget ${associatedCount === 1 ? 'item' : 'items'} that use this subcategory.`
      : `This action cannot be undone.`;

    setConfirmModal({
      isOpen: true,
      title: `Delete "${subCategoryName}" Subcategory`,
      message,
      onConfirm: confirmAction
    });
  };

  const startEditingMainCategory = (oldName: string) => {
    setEditingCategory({ type: 'main', oldName });
    setEditingValue(oldName);
  };

  const startEditingSecondaryCategory = (mainCategory: string, oldName: string) => {
    setEditingCategory({ type: 'secondary', mainCategory, oldName });
    setEditingValue(oldName);
  };

  const saveEditingMainCategory = () => {
    if (editingCategory && editingCategory.type === 'main' && editingCategory.oldName) {
      const { oldName } = editingCategory;
      const newName = editingValue.trim();

      if (newName && newName !== oldName && !budgetCategories.mainCategories.includes(newName)) {
        setBudgetCategories(prev => {
          // Update main categories list
          const newMainCategories = prev.mainCategories.map(cat =>
            cat === oldName ? newName : cat
          );

          // Update secondary categories object key
          const newSecondaryCategories = { ...prev.secondaryCategories };
          if (newSecondaryCategories[oldName]) {
            newSecondaryCategories[newName] = newSecondaryCategories[oldName];
            delete newSecondaryCategories[oldName];
          }

          return {
            mainCategories: newMainCategories,
            secondaryCategories: newSecondaryCategories
          };
        });
        setHasChanges(true);
      }

      setEditingCategory(null);
      setEditingValue('');
    }
  };

  const saveEditingSecondaryCategory = () => {
    if (editingCategory && editingCategory.type === 'secondary' && editingCategory.mainCategory && editingCategory.oldName) {
      const { mainCategory, oldName } = editingCategory;
      const newName = editingValue.trim();

      if (newName && newName !== oldName && !budgetCategories.secondaryCategories[mainCategory]?.includes(newName)) {
        setBudgetCategories(prev => ({
          ...prev,
          secondaryCategories: {
            ...prev.secondaryCategories,
            [mainCategory]: prev.secondaryCategories[mainCategory]?.map(cat =>
              cat === oldName ? newName : cat
            ) || []
          }
        }));
        setHasChanges(true);
      }

      setEditingCategory(null);
      setEditingValue('');
    }
  };

  const saveEditingCategory = () => {
    if (editingCategory?.type === 'main') {
      saveEditingMainCategory();
    } else if (editingCategory?.type === 'secondary') {
      saveEditingSecondaryCategory();
    }
  };

  const cancelEditingCategory = () => {
    setEditingCategory(null);
    setEditingValue('');
  };

  // CSV Import Functions
  const createBackup = () => {
    setCategoryBackup({
      budgetCategories: JSON.parse(JSON.stringify(budgetCategories)),
      timestamp: new Date().toISOString()
    });
  };

  const restoreFromBackup = () => {
    if (categoryBackup) {
      setBudgetCategories(categoryBackup.budgetCategories);
      setHasChanges(true);
      setCategoryBackup(null);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportProgress(prev => ({ ...prev, isProcessing: true }));

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim());

      if (lines.length === 0) {
        alert('CSV file appears to be empty');
        setImportProgress(prev => ({ ...prev, isProcessing: false }));
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      const data = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
        const row: any = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });
        return row;
      });

      setCsvHeaders(headers);
      setCsvData(data);
      setImportProgress(prev => ({
        ...prev,
        step: 'preview',
        isProcessing: false
      }));
    };

    reader.readAsText(file);
  };

  const analyzeCategories = () => {
    setImportProgress(prev => ({ ...prev, isProcessing: true }));

    // Look for category columns in CSV (common Monarch Money fields)
    const categoryFields = ['Category', 'category', 'Main Category', 'Primary Category'];
    const subcategoryFields = ['Subcategory', 'subcategory', 'Secondary Category', 'Sub Category'];

    let allFoundCategories: string[] = [];

    // Extract all unique categories from CSV data
    csvData.forEach(row => {
      // Check all potential category fields
      [...categoryFields, ...subcategoryFields].forEach(field => {
        if (row[field] && row[field].trim() && !allFoundCategories.includes(row[field].trim())) {
          allFoundCategories.push(row[field].trim());
        }
      });
    });

    // Determine which categories are new vs existing
    const newCategories: string[] = [];
    const mappings: typeof categoryMappings = {};

    allFoundCategories.forEach(category => {
      const isExistingMain = budgetCategories.mainCategories.includes(category);
      const isExistingSecondary = Object.values(budgetCategories.secondaryCategories)
        .flat()
        .includes(category);

      if (isExistingMain || isExistingSecondary) {
        // Mark existing categories
        mappings[category] = {
          type: isExistingMain ? 'main' : 'secondary',
          isExisting: true,
          parentCategory: isExistingSecondary
            ? Object.keys(budgetCategories.secondaryCategories).find(main =>
                budgetCategories.secondaryCategories[main].includes(category)
              )
            : undefined
        };
      } else {
        // New category - default to secondary with first main category as parent
        newCategories.push(category);
        mappings[category] = {
          type: 'secondary',
          parentCategory: budgetCategories.mainCategories[0] || 'Other',
          isExisting: false
        };
      }
    });

    setCategoryMappings(mappings);

    setImportProgress(prev => ({
      ...prev,
      step: 'mapping',
      isProcessing: false,
      categoriesFound: { main: allFoundCategories.filter(cat => mappings[cat]?.type === 'main'), secondary: allFoundCategories.filter(cat => mappings[cat]?.type === 'secondary') },
      newCategories: { main: newCategories.filter(cat => mappings[cat]?.type === 'main'), secondary: newCategories.filter(cat => mappings[cat]?.type === 'secondary') }
    }));
  };

  // Category mapping functions
  const updateCategoryMapping = (categoryName: string, type: 'main' | 'secondary' | 'skip', parentCategory?: string) => {
    setCategoryMappings(prev => ({
      ...prev,
      [categoryName]: {
        ...prev[categoryName],
        type,
        parentCategory: type === 'secondary' ? parentCategory : undefined
      }
    }));
  };

  // Transaction processing functions
  const processTransactionData = () => {
    const processedTransactions: any[] = [];

    csvData.forEach((row, index) => {
      // Common field mappings for Monarch Money exports
      const transaction: any = {
        id: `imported_${Date.now()}_${index}`,
        importedFrom: 'monarch',
        importedAt: new Date().toISOString()
      };

      // Map common fields with fallbacks
      const fieldMappings = {
        date: ['Date', 'date', 'Transaction Date', 'Posted Date'],
        description: ['Description', 'description', 'Merchant', 'merchant', 'Payee'],
        amount: ['Amount', 'amount', 'Transaction Amount', 'Debit', 'Credit'],
        category: ['Category', 'category', 'Main Category', 'Primary Category'],
        subcategory: ['Subcategory', 'subcategory', 'Secondary Category', 'Sub Category'],
        account: ['Account', 'account', 'Account Name', 'Bank Account'],
        merchant: ['Merchant', 'merchant', 'Vendor', 'Payee'],
        notes: ['Notes', 'notes', 'Memo', 'memo', 'Comment']
      };

      // Map each field
      Object.entries(fieldMappings).forEach(([targetField, possibleColumns]) => {
        for (const col of possibleColumns) {
          if (row[col] !== undefined && row[col] !== '') {
            transaction[targetField] = row[col];
            break;
          }
        }
      });

      // Handle amount field - ensure it's a number and handle negatives
      if (transaction.amount) {
        const amount = typeof transaction.amount === 'string'
          ? transaction.amount.replace(/[$,]/g, '')
          : transaction.amount;
        transaction.amount = Math.abs(parseFloat(amount)) || 0;
      }

      // Map any additional columns not in standard mappings
      Object.keys(row).forEach(column => {
        if (!Object.values(fieldMappings).flat().includes(column) && !transaction[column.toLowerCase()]) {
          transaction[column.toLowerCase()] = row[column];
        }
      });

      // Only add if we have essential data
      if (transaction.date && transaction.amount) {
        processedTransactions.push(transaction);
      }
    });

    return processedTransactions;
  };

  const executeImport = () => {
    // Create backup before making changes
    createBackup();
    setImportProgress(prev => ({ ...prev, isProcessing: true }));

    // Update categories based on user mappings
    const newBudgetCategories = { ...budgetCategories };

    // Process each category according to user's decisions
    Object.entries(categoryMappings).forEach(([categoryName, mapping]) => {
      if (mapping.isExisting || mapping.type === 'skip') {
        return; // Skip existing categories and categories marked to skip
      }

      if (mapping.type === 'main') {
        // Add as main category
        if (!newBudgetCategories.mainCategories.includes(categoryName)) {
          newBudgetCategories.mainCategories.push(categoryName);
          newBudgetCategories.secondaryCategories[categoryName] = [];
        }
      } else if (mapping.type === 'secondary' && mapping.parentCategory) {
        // Add as secondary category
        const parentCategory = mapping.parentCategory;

        // Ensure parent category exists
        if (!newBudgetCategories.mainCategories.includes(parentCategory)) {
          newBudgetCategories.mainCategories.push(parentCategory);
          newBudgetCategories.secondaryCategories[parentCategory] = [];
        }

        // Add to parent category if not already there
        if (!newBudgetCategories.secondaryCategories[parentCategory].includes(categoryName)) {
          newBudgetCategories.secondaryCategories[parentCategory].push(categoryName);
        }
      }
    });

    // Process and store transaction data
    const processedTransactions = processTransactionData();

    // Store transactions in localStorage for the Expenses page to access
    localStorage.setItem('importedTransactions', JSON.stringify(processedTransactions));

    // Create transaction backup
    setTransactionBackup({
      transactions: processedTransactions,
      timestamp: new Date().toISOString()
    });

    setBudgetCategories(newBudgetCategories);
    setHasChanges(true);

    setTimeout(() => {
      setImportProgress(prev => ({
        ...prev,
        step: 'completed',
        isProcessing: false
      }));
    }, 1000);
  };

  const resetImport = () => {
    setCsvData([]);
    setCsvHeaders([]);
    setCategoryMappings({});
    setImportProgress({
      step: 'upload',
      isProcessing: false,
      categoriesFound: { main: [], secondary: [] },
      newCategories: { main: [], secondary: [] }
    });
  };

  // Load connected accounts and sync history
  useEffect(() => {
    loadConnectedAccounts();
    loadSyncHistory();
    loadEtradeKeys();
  }, []);

  const loadConnectedAccounts = async () => {
    try {
      const response = await axios.get('http://localhost:3001/api/plaid/accounts');
      setConnectedAccounts(response.data.institutions);
    } catch (error) {
      console.error('Failed to load connected accounts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSyncHistory = async () => {
    try {
      const response = await axios.get('http://localhost:3001/api/plaid/sync-history?limit=10');
      setSyncHistory(response.data.logs);
    } catch (error) {
      console.error('Failed to load sync history:', error);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const response = await axios.post('http://localhost:3001/api/plaid/sync');
      alert(response.data.message);
      loadSyncHistory(); // Refresh history
      // Optionally refresh portfolio data
      window.location.reload();
    } catch (error) {
      console.error('Sync failed:', error);
      alert('Portfolio sync failed. Please try again.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRemoveAccount = async (itemId: string, institutionName: string) => {
    if (window.confirm(`Are you sure you want to remove ${institutionName}? This will delete all associated portfolio data.`)) {
      try {
        await axios.delete(`http://localhost:3001/api/plaid/accounts/${itemId}`);
        alert('Account removed successfully');
        loadConnectedAccounts();
        loadSyncHistory();
      } catch (error) {
        console.error('Failed to remove account:', error);
        alert('Failed to remove account. Please try again.');
      }
    }
  };

  const handleSave = () => {
    console.log('Saving target allocations:', targetAllocations);
    console.log('Saving budget categories:', budgetCategories);

    // Save budget categories to localStorage
    localStorage.setItem('budgetCategories', JSON.stringify(budgetCategories));

    // You can add API calls here to save to backend if needed
    // Example: await saveSettingsToAPI({ targetAllocations, budgetCategories });

    setHasChanges(false);

    // Show success message
    alert('Settings saved successfully!');
  };

  const handleEtradeKeyChange = (field: string, value: string | boolean) => {
    setEtradeKeys(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const saveEtradeKeys = async () => {
    try {
      const response = await axios.post('http://localhost:3001/api/settings/etrade-keys', etradeKeys);
      if (response.data.success) {
        setEtradeKeysSaved(true);
        setTimeout(() => setEtradeKeysSaved(false), 3000);
      }
    } catch (error) {
      console.error('Failed to save ETrade keys:', error);
      alert('Failed to save ETrade API keys. Please try again.');
    }
  };

  const loadEtradeKeys = async () => {
    try {
      const response = await axios.get('http://localhost:3001/api/settings/etrade-keys');
      if (response.data.keys) {
        setEtradeKeys({
          consumerKey: response.data.keys.consumerKey || '',
          consumerSecret: response.data.keys.consumerSecret || '',
          sandboxMode: response.data.keys.sandboxMode !== false
        });
      }
    } catch (error) {
      console.error('Failed to load ETrade keys:', error);
    }
  };

  const totalTarget = Object.values(targetAllocations).reduce((sum, val) => sum + val, 0);
  const isValidTotal = totalTarget === 100;

  const getAllocationStatus = (category: string) => {
    const current = currentAllocations[category as keyof typeof currentAllocations];
    const target = targetAllocations[category as keyof typeof targetAllocations];
    const difference = Math.abs(current - target);

    if (difference <= 2) return { status: 'on-target', color: 'text-green-600' };
    if (difference <= 5) return { status: 'close', color: 'text-yellow-600' };
    return { status: 'off-target', color: 'text-red-600' };
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {activeSection === 'investing' ? 'Investing Settings' : 'Personal Finance Settings'}
          </h1>
          <p className="text-gray-600 mt-2">
            {activeSection === 'investing'
              ? 'Configure your investment allocations, connected accounts, and API settings'
              : 'Manage your budget categories and personal finance preferences'
            }
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={!hasChanges || (activeSection === 'investing' && !isValidTotal)}
          className={`flex items-center px-4 py-2 rounded-md transition-colors ${
            hasChanges && (activeSection === 'personal-finance' || isValidTotal)
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          <Save className="h-4 w-4 mr-2" />
          {hasChanges ? 'Save Changes' : 'No Changes'}
        </button>
      </div>

      {activeSection === 'investing' && (
        <>
          <div className="bg-white rounded-lg p-6 shadow-sm border">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Target Investment Allocations</h2>
        <p className="text-gray-600 mb-6">
          Set your target percentages for each investment category. These will be used in the dashboard
          to show how your actual allocation compares to your goals.
        </p>


        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Object.entries(targetAllocations).map(([category, value]) => {
            const status = getAllocationStatus(category);
            const currentValue = currentAllocations[category as keyof typeof currentAllocations];

            return (
              <div key={category} className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium text-gray-900 capitalize">
                    {category.replace(/([A-Z])/g, ' $1').trim()}
                  </h3>
                  <span className={`text-sm font-medium ${status.color}`}>
                    {status.status === 'on-target' && '✓ On Target'}
                    {status.status === 'close' && '⚠ Close'}
                    {status.status === 'off-target' && '⚠ Off Target'}
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center space-x-4">
                    <label className="text-sm text-gray-600 w-16">Target:</label>
                    <div className="flex-1 flex items-center space-x-2">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={value}
                        onChange={(e) => handleAllocationChange(category, parseInt(e.target.value))}
                        className="flex-1"
                      />
                      <div className="flex items-center space-x-1 bg-gray-50 rounded-md p-1">
                        <button
                          onClick={() => adjustAllocation(category, -1)}
                          disabled={value <= 0}
                          className="p-1 rounded text-gray-600 hover:bg-white hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Decrease by 1%"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="text-sm font-medium text-gray-900 w-12 text-center">{value}%</span>
                        <button
                          onClick={() => adjustAllocation(category, 1)}
                          disabled={value >= 100}
                          className="p-1 rounded text-gray-600 hover:bg-white hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Increase by 1%"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-4">
                    <label className="text-sm text-gray-600 w-16">Current:</label>
                    <div className="flex-1">
                      <div className="bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 rounded-full h-2"
                          style={{ width: `${currentValue}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-sm font-medium text-gray-900 w-12">{currentValue}%</span>
                  </div>

                  <div className="text-xs text-gray-500">
                    Difference: {Math.abs(currentValue - value).toFixed(1)}%
                    {currentValue > value ? ' over' : ' under'} target
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8 p-4 bg-gray-50 rounded-md">
          <h4 className="text-sm font-medium text-gray-900 mb-2">Category Descriptions:</h4>
          <div className="text-xs text-gray-600 space-y-1">
            <p><strong>Low Risk:</strong> Conservative investments like bonds, dividend stocks, and CDs</p>
            <p><strong>Growth:</strong> Established companies with steady growth potential</p>
            <p><strong>Speculative:</strong> High-risk, high-reward investments like growth stocks and emerging sectors</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg p-6 shadow-sm border">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Connected Brokerage Accounts</h2>
          <div className="flex space-x-3">
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {isSyncing ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Sync Now
                </>
              )}
            </button>
            <PlaidLink onSuccess={loadConnectedAccounts} />
          </div>
        </div>

        <p className="text-gray-600 mb-6">
          Connect your investment platforms to automatically sync your portfolio data.
          Supports E*Trade, Schwab, Chase, Fidelity, and 12,000+ other institutions.
        </p>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            <span>Loading connected accounts...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {connectedAccounts.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-md">
                <p className="text-gray-600">No brokerage accounts connected yet.</p>
                <p className="text-sm text-gray-500 mt-2">
                  Connect your first account to start automatic portfolio syncing.
                </p>
              </div>
            ) : (
              connectedAccounts.map((account) => (
                <div key={account.item_id} className="flex items-center justify-between p-4 border border-gray-200 rounded-md">
                  <div className="flex items-center space-x-3">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <div>
                      <h3 className="text-sm font-medium text-gray-900">{account.institution_name}</h3>
                      <p className="text-xs text-gray-500">
                        Connected: {new Date(account.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveAccount(account.item_id, account.institution_name)}
                    className="px-3 py-1 rounded-md text-sm font-medium text-red-600 border border-red-300 hover:bg-red-50 flex items-center"
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {syncHistory.length > 0 && (
          <div className="mt-6 pt-6 border-t">
            <h3 className="text-lg font-medium text-gray-900 mb-3">Recent Sync Activity</h3>
            <div className="space-y-2">
              {syncHistory.slice(0, 5).map((log, index) => (
                <div key={index} className="flex items-center space-x-3 text-sm">
                  {log.status === 'completed' && <CheckCircle className="h-4 w-4 text-green-500" />}
                  {log.status === 'error' && <AlertCircle className="h-4 w-4 text-red-500" />}
                  {log.status === 'in_progress' && <Clock className="h-4 w-4 text-blue-500" />}
                  <span className="text-gray-600">{log.message}</span>
                  <span className="text-gray-400 text-xs">
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ETrade API Configuration */}
      <div className="bg-white rounded-lg p-6 shadow-sm border">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center">
            <Key className="h-5 w-5 text-blue-600 mr-2" />
            <h2 className="text-xl font-semibold text-gray-900">ETrade API Configuration</h2>
          </div>
          <button
            onClick={saveEtradeKeys}
            disabled={!etradeKeys.consumerKey || !etradeKeys.consumerSecret}
            className={`px-4 py-2 rounded-md text-sm font-medium flex items-center space-x-2 ${
              etradeKeys.consumerKey && etradeKeys.consumerSecret
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            <Save className="h-4 w-4" />
            <span>{etradeKeysSaved ? 'Saved!' : 'Save Keys'}</span>
          </button>
        </div>

        <p className="text-gray-600 mb-6">
          Configure your ETrade API credentials for advanced portfolio management and automated trading features.
          Visit the <a href="https://developer.etrade.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800">ETrade Developer Portal</a> to obtain your API keys.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Consumer Key
            </label>
            <input
              type="text"
              value={etradeKeys.consumerKey}
              onChange={(e) => handleEtradeKeyChange('consumerKey', e.target.value)}
              placeholder="Enter your ETrade consumer key"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Consumer Secret
            </label>
            <div className="relative">
              <input
                type={showSecret ? "text" : "password"}
                value={etradeKeys.consumerSecret}
                onChange={(e) => handleEtradeKeyChange('consumerSecret', e.target.value)}
                placeholder="Enter your ETrade consumer secret"
                className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
              >
                {showSecret ? (
                  <EyeOff className="h-4 w-4 text-gray-400" />
                ) : (
                  <Eye className="h-4 w-4 text-gray-400" />
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 p-3 bg-green-50 rounded-md border border-green-200">
          <div className="flex items-center">
            <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
            <span className="text-sm text-green-800 font-medium">
              Production Mode Enabled - Live trading data and real portfolio information
            </span>
          </div>
        </div>

        <div className="mt-6 p-4 bg-blue-50 rounded-md border border-blue-200">
          <h4 className="text-sm font-medium text-blue-900 mb-2">Security Note:</h4>
          <p className="text-xs text-blue-800">
            Your API keys are stored securely and encrypted. They are only used for authorized API calls to ETrade.
            You can revoke access at any time through your ETrade developer account.
          </p>
        </div>

        {(etradeKeys.consumerKey || etradeKeys.consumerSecret) && (
          <div className="mt-4 p-3 bg-green-50 rounded-md border border-green-200">
            <div className="flex items-center">
              <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
              <span className="text-sm text-green-800">
                API keys configured. Visit the API Testing page to verify your connection.
              </span>
            </div>
          </div>
        )}
          </div>
        </>
      )}

      {activeSection === 'personal-finance' && (
        <>
          {/* Monarch Money CSV Import */}
          <div className="bg-white rounded-lg p-6 shadow-sm border">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center">
                <Upload className="h-5 w-5 text-blue-600 mr-2" />
                <h2 className="text-xl font-semibold text-gray-900">Import from Monarch Money</h2>
              </div>
              {categoryBackup && (
                <button
                  onClick={restoreFromBackup}
                  className="px-4 py-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-md transition-colors flex items-center"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Restore Backup
                </button>
              )}
            </div>

            <p className="text-gray-600 mb-6">
              Upload a CSV export from Monarch Money to automatically sync your categories and expenses.
              Your current settings will be backed up before any changes are made.
            </p>

            {importProgress.step === 'upload' && (
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-lg font-medium text-gray-900 mb-2">Upload Monarch Money CSV</p>
                <p className="text-gray-600 mb-4">Drag and drop your CSV file here, or click to browse</p>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={importProgress.isProcessing}
                  />
                  <span className="bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 transition-colors inline-flex items-center">
                    {importProgress.isProcessing ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Choose File
                      </>
                    )}
                  </span>
                </label>
              </div>
            )}

            {importProgress.step === 'preview' && (
              <div className="space-y-6">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                    <span className="text-green-800 font-medium">CSV file uploaded successfully!</span>
                  </div>
                  <p className="text-green-700 text-sm mt-1">
                    Found {csvData.length} transactions with {csvHeaders.length} columns
                  </p>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-medium text-gray-900 mb-2">Column Headers Found:</h3>
                  <div className="flex flex-wrap gap-2">
                    {csvHeaders.map(header => (
                      <span key={header} className="bg-white px-3 py-1 rounded-full text-sm text-gray-700 border">
                        {header}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex space-x-4">
                  <button
                    onClick={analyzeCategories}
                    disabled={importProgress.isProcessing}
                    className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors flex items-center"
                  >
                    {importProgress.isProcessing ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Analyze Categories
                      </>
                    )}
                  </button>
                  <button
                    onClick={resetImport}
                    className="bg-gray-600 text-white px-6 py-2 rounded-md hover:bg-gray-700 transition-colors"
                  >
                    Start Over
                  </button>
                </div>
              </div>
            )}

            {importProgress.step === 'mapping' && (
              <div className="space-y-6">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-medium text-blue-900 mb-2">Category Mapping</h3>
                  <p className="text-blue-800 text-sm">
                    Found {Object.keys(categoryMappings).length} categories. Configure how each should be organized:
                  </p>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                    <h4 className="font-medium text-gray-900">Category Organization</h4>
                    <p className="text-sm text-gray-600 mt-1">
                      Choose whether each category should be a main category, secondary category, or skipped entirely.
                    </p>
                  </div>

                  <div className="divide-y divide-gray-200">
                    {Object.entries(categoryMappings).map(([categoryName, mapping]) => (
                      <div key={categoryName} className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center">
                            <span className="font-medium text-gray-900 mr-2">{categoryName}</span>
                            {mapping.isExisting && (
                              <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                                Existing
                              </span>
                            )}
                            {!mapping.isExisting && (
                              <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                                New
                              </span>
                            )}
                          </div>
                        </div>

                        {!mapping.isExisting && (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Category Type Selection */}
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Category Type
                              </label>
                              <select
                                value={mapping.type}
                                onChange={(e) => updateCategoryMapping(
                                  categoryName,
                                  e.target.value as 'main' | 'secondary' | 'skip',
                                  mapping.parentCategory
                                )}
                                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                              >
                                <option value="main">Main Category</option>
                                <option value="secondary">Secondary Category</option>
                                <option value="skip">Skip (Don't Import)</option>
                              </select>
                            </div>

                            {/* Parent Category Selection (only for secondary) */}
                            {mapping.type === 'secondary' && (
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  Parent Category
                                </label>
                                <select
                                  value={mapping.parentCategory || ''}
                                  onChange={(e) => updateCategoryMapping(
                                    categoryName,
                                    'secondary',
                                    e.target.value
                                  )}
                                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                                >
                                  {budgetCategories.mainCategories.map(mainCat => (
                                    <option key={mainCat} value={mainCat}>
                                      {mainCat}
                                    </option>
                                  ))}
                                  {/* Also include new main categories being added */}
                                  {Object.entries(categoryMappings)
                                    .filter(([, m]) => m.type === 'main' && !m.isExisting)
                                    .map(([newMainCat]) => (
                                      <option key={newMainCat} value={newMainCat}>
                                        {newMainCat} (New)
                                      </option>
                                    ))
                                  }
                                </select>
                              </div>
                            )}

                            {/* Result Preview */}
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Result
                              </label>
                              <div className="p-2 bg-gray-50 rounded border text-sm text-gray-600">
                                {mapping.type === 'main' && `Will create main category: "${categoryName}"`}
                                {mapping.type === 'secondary' && `Will add to "${mapping.parentCategory}" → "${categoryName}"`}
                                {mapping.type === 'skip' && 'Will not be imported'}
                              </div>
                            </div>
                          </div>
                        )}

                        {mapping.isExisting && (
                          <div className="text-sm text-gray-600">
                            {mapping.type === 'main'
                              ? `Already exists as a main category`
                              : `Already exists under "${mapping.parentCategory}"`
                            }
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex space-x-4">
                  <button
                    onClick={executeImport}
                    disabled={importProgress.isProcessing}
                    className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 transition-colors flex items-center"
                  >
                    {importProgress.isProcessing ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Import Categories
                      </>
                    )}
                  </button>
                  <button
                    onClick={resetImport}
                    className="bg-gray-600 text-white px-6 py-2 rounded-md hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {importProgress.step === 'completed' && (
              <div className="space-y-6">
                <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-green-900 mb-2">Import Completed!</h3>
                  <p className="text-green-700 mb-4">
                    Your categories have been successfully updated with data from Monarch Money.
                  </p>
                  {categoryBackup && (
                    <p className="text-sm text-green-600">
                      A backup was created at {new Date(categoryBackup.timestamp).toLocaleString()}.
                      You can restore your previous settings using the "Restore Backup" button above.
                    </p>
                  )}
                </div>

                <div className="flex justify-center">
                  <button
                    onClick={resetImport}
                    className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors"
                  >
                    Import Another File
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Budget Categories Management */}
          <div className="bg-white rounded-lg p-6 shadow-sm border">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center">
                <Tag className="h-5 w-5 text-blue-600 mr-2" />
                <h2 className="text-xl font-semibold text-gray-900">Budget Categories</h2>
              </div>
            </div>

            <p className="text-gray-600 mb-6">
              Manage your main categories and subcategories for budget items. These will be used
              throughout the personal finance section for organizing your expenses and budgets.
            </p>

            <div className="space-y-6">
              {budgetCategories.mainCategories.map((mainCategory) => (
                <div key={mainCategory} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    {editingCategory?.type === 'main' && editingCategory.oldName === mainCategory ? (
                      <div className="flex-1 mr-4">
                        <input
                          type="text"
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              saveEditingCategory();
                            } else if (e.key === 'Escape') {
                              cancelEditingCategory();
                            }
                          }}
                          onBlur={saveEditingCategory}
                          autoFocus
                          className="w-full text-lg font-medium bg-white border border-blue-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    ) : (
                      <h3 className="text-lg font-medium text-gray-900 flex-1">{mainCategory}</h3>
                    )}
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => startEditingMainCategory(mainCategory)}
                        className="text-blue-600 hover:text-blue-800 p-1"
                        title={`Edit ${mainCategory} category`}
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => removeMainCategory(mainCategory)}
                        className="text-red-600 hover:text-red-800 p-1"
                        title={`Remove ${mainCategory} category`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-gray-700">Secondary Categories:</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {budgetCategories.secondaryCategories[mainCategory]?.map((subCategory) => (
                        <div
                          key={subCategory}
                          className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-md"
                        >
                          {editingCategory?.type === 'secondary' &&
                           editingCategory.mainCategory === mainCategory &&
                           editingCategory.oldName === subCategory ? (
                            <div className="flex items-center flex-1">
                              <input
                                type="text"
                                value={editingValue}
                                onChange={(e) => setEditingValue(e.target.value)}
                                onKeyPress={(e) => {
                                  if (e.key === 'Enter') {
                                    saveEditingCategory();
                                  } else if (e.key === 'Escape') {
                                    cancelEditingCategory();
                                  }
                                }}
                                onBlur={saveEditingCategory}
                                autoFocus
                                className="flex-1 text-sm bg-white border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                          ) : (
                            <span className="text-sm text-gray-700 flex-1">{subCategory}</span>
                          )}
                          <div className="flex items-center ml-2 space-x-1">
                            <button
                              onClick={() => startEditingSecondaryCategory(mainCategory, subCategory)}
                              className="text-blue-500 hover:text-blue-700"
                              title="Edit category"
                            >
                              <Edit2 className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => removeSecondaryCategory(mainCategory, subCategory)}
                              className="text-red-500 hover:text-red-700"
                              title="Remove category"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center bg-blue-50 px-3 py-2 rounded-md border border-dashed border-blue-300">
                        <input
                          type="text"
                          placeholder="Add subcategory"
                          className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-500 border-none outline-none"
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              const target = e.target as HTMLInputElement;
                              addSecondaryCategory(mainCategory, target.value);
                              target.value = '';
                            }
                          }}
                        />
                        <Plus className="h-3 w-3 text-blue-600" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Add New Main Category */}
              <div className="border border-dashed border-gray-300 rounded-lg p-4">
                <div className="flex items-center justify-center">
                  <input
                    type="text"
                    placeholder="Add new main category"
                    className="flex-1 max-w-xs text-center bg-transparent text-gray-700 placeholder-gray-500 border-none outline-none"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        const target = e.target as HTMLInputElement;
                        addMainCategory(target.value);
                        target.value = '';
                      }
                    }}
                  />
                  <Plus className="h-5 w-5 text-gray-400 ml-2" />
                </div>
              </div>
            </div>
          </div>

          {/* Additional Personal Finance Settings */}
          <div className="bg-white rounded-lg p-6 shadow-sm border">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Preferences</h2>
            <p className="text-gray-600 mb-6">
              Configure your personal finance preferences and default settings.
            </p>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-gray-900">Default Currency</h3>
                  <p className="text-sm text-gray-500">Currency used for all financial calculations</p>
                </div>
                <select className="border border-gray-300 rounded-md px-3 py-2 text-sm">
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                </select>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-gray-900">Budget Period</h3>
                  <p className="text-sm text-gray-500">Default time period for budget calculations</p>
                </div>
                <select className="border border-gray-300 rounded-md px-3 py-2 text-sm">
                  <option value="monthly">Monthly</option>
                  <option value="weekly">Weekly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-gray-900">Expense Notifications</h3>
                  <p className="text-sm text-gray-500">Get notified when you exceed budget limits</p>
                </div>
                <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-blue-600 transition-colors">
                  <span className="translate-x-6 inline-block h-4 w-4 transform rounded-full bg-white transition"></span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-lg">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center">
                <AlertCircle className="h-6 w-6 text-red-500 mr-3" />
                <h3 className="text-lg font-semibold text-gray-900">{confirmModal.title}</h3>
              </div>
              <button
                onClick={() => setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: () => {} })}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-gray-600 mb-6">{confirmModal.message}</p>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: () => {} })}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors flex items-center"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;