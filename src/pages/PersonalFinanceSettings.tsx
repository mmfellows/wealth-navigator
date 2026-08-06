import React, { useState, useEffect, useCallback } from 'react';
import { authedFetch } from '../services/authRedirect';
import { Link } from 'react-router-dom';
import { Trash2, Plus, Edit2, Tag, X, ChevronDown, ChevronRight, Upload, Download, GripVertical, Link as LinkIcon, RefreshCw, Loader2, Unlink } from 'lucide-react';
import { usePlaidLink } from 'react-plaid-link';
import { CONSENT_TEXT, logPlaidLinkConsent } from '../lib/consent';
import { Card, Button, toast } from '../components/ui';
import { cn } from '../lib/cn';
import { everPill } from '../lib/categoryColors';

interface SubCategory {
  id: number;
  name: string;
  sortOrder: number;
}

interface CategoriesData {
  categories: Record<string, SubCategory[]>;
  mainCategoryOrder: string[];
}

const API_BASE = '/api/settings';

const PersonalFinanceSettings: React.FC = () => {
  const [categories, setCategories] = useState<Record<string, SubCategory[]>>({});
  const [mainCategoryOrder, setMainCategoryOrder] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editing state
  const [editingMain, setEditingMain] = useState<{ oldName: string } | null>(null);
  const [editingSub, setEditingSub] = useState<{ id: number; mainCategory: string } | null>(null);
  const [editingValue, setEditingValue] = useState('');

  // Adding state
  const [addingMainCategory, setAddingMainCategory] = useState(false);
  const [newMainName, setNewMainName] = useState('');
  const [addingSubTo, setAddingSubTo] = useState<string | null>(null);
  const [newSubName, setNewSubName] = useState('');

  // Collapsed state
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  // Confirm delete modal
  const [confirmDelete, setConfirmDelete] = useState<{
    type: 'main' | 'sub';
    mainCategory: string;
    subId?: number;
    subName?: string;
  } | null>(null);

  // CSV upload
  const [csvPreview, setCsvPreview] = useState<{ mainCategory: string; subCategory: string }[] | null>(null);

  // Drag and drop
  const [dragItem, setDragItem] = useState<{ id: number; name: string; fromCategory: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const handleDrop = async (targetMainCategory: string) => {
    if (!dragItem || dragItem.fromCategory === targetMainCategory) {
      setDragItem(null);
      setDropTarget(null);
      return;
    }
    try {
      const res = await authedFetch(`${API_BASE}/categories/${dragItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mainCategory: targetMainCategory }),
      });
      if (!res.ok) throw new Error('Failed to move subcategory');
      await fetchCategories();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDragItem(null);
      setDropTarget(null);
    }
  };

  // Category colors
  const [categoryColors, setCategoryColors] = useState<Record<string, string>>({});
  const [editingColor, setEditingColor] = useState<string | null>(null);

  // Plaid state
  const [plaidAccounts, setPlaidAccounts] = useState<any[]>([]);
  const [plaidLinkToken, setPlaidLinkToken] = useState<string | null>(null);
  const [plaidLoading, setPlaidLoading] = useState(false);
  const [plaidError, setPlaidError] = useState<string | null>(null);
  // Consent acknowledgement gate for Plaid Link (Q10).
  // The Connect button is disabled until the user checks the acknowledgement
  // box; on click we POST /api/plaid/consent before opening Plaid Link.
  const [plaidConsentAcknowledged, setPlaidConsentAcknowledged] = useState(false);
  const [plaidSyncStatus, setPlaidSyncStatus] = useState<string | null>(null);
  const [syncLogs, setSyncLogs] = useState<any[]>([]);
  const [syncStartDate, setSyncStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [syncEndDate, setSyncEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  const fetchPlaidAccounts = async () => {
    try {
      const res = await authedFetch('/api/plaid/accounts');
      if (res.ok) {
        const data = await res.json();
        setPlaidAccounts(data.institutions || []);
      }
    } catch (err) {
      console.error('Failed to fetch Plaid accounts:', err);
    }
  };

  const fetchSyncLogs = async () => {
    try {
      const res = await authedFetch('/api/plaid/sync-history?limit=10');
      if (res.ok) {
        const data = await res.json();
        setSyncLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Failed to fetch sync logs:', err);
    }
  };

  const createPlaidLinkToken = useCallback(async () => {
    try {
      const res = await authedFetch('/api/plaid/create-link-token', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setPlaidLinkToken(data.link_token);
      } else {
        const data = await res.json();
        setPlaidError(data.error || 'Failed to initialize Plaid');
      }
    } catch (err) {
      setPlaidError('Failed to connect to server');
    }
  }, []);

  const logLinkEvent = useCallback((eventName: string, metadata: any) => {
    authedFetch('/api/plaid/link-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_name: eventName, metadata }),
    }).catch(() => {}); // fire-and-forget
  }, []);

  const { open: openPlaid, ready: plaidReady } = usePlaidLink({
    token: plaidLinkToken,
    onSuccess: async (publicToken, metadata) => {
      logLinkEvent('HANDOFF', metadata);
      setPlaidLoading(true);
      try {
        const res = await authedFetch('/api/plaid/exchange-public-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ public_token: publicToken }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to exchange token');
        }
        await fetchPlaidAccounts();
        await fetchSyncLogs();
      } catch (err: any) {
        setPlaidError(err.message);
      } finally {
        setPlaidLoading(false);
      }
    },
    onExit: (err, metadata) => {
      logLinkEvent('EXIT', { ...metadata, error_type: err?.error_type, error_code: err?.error_code, error_message: err?.display_message });
      if (err) setPlaidError(err.display_message || 'Connection cancelled');
    },
    onEvent: (eventName, metadata) => {
      logLinkEvent(eventName, metadata);
    },
  });

  const handleSyncTransactions = async () => {
    setPlaidLoading(true);
    setPlaidSyncStatus('Syncing transactions...');
    setPlaidError(null);
    try {
      const res = await authedFetch('/api/plaid/sync-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: syncStartDate, endDate: syncEndDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');

      const totalAdded = data.results.reduce((s: number, r: any) => s + (r.added || 0), 0);
      const totalSkipped = data.results.reduce((s: number, r: any) => s + (r.skipped || 0), 0);
      setPlaidSyncStatus(`Sync complete: ${totalAdded} new transactions added, ${totalSkipped} duplicates skipped`);
      await fetchSyncLogs();
    } catch (err: any) {
      setPlaidError(err.message);
      setPlaidSyncStatus(null);
    } finally {
      setPlaidLoading(false);
    }
  };

  const handleRemovePlaidAccount = async (itemId: string) => {
    if (!confirm('Remove this connected account? This will not delete imported transactions.')) return;
    try {
      const res = await authedFetch(`/api/plaid/accounts/${itemId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to remove account');
      await fetchPlaidAccounts();
      await fetchSyncLogs();
    } catch (err: any) {
      setPlaidError(err.message);
    }
  };

  const COLOR_OPTIONS = [
    { label: 'Blue', value: 'bg-blue-100 text-blue-800' },
    { label: 'Green', value: 'bg-green-100 text-green-800' },
    { label: 'Yellow', value: 'bg-yellow-100 text-yellow-800' },
    { label: 'Red', value: 'bg-red-100 text-red-800' },
    { label: 'Indigo', value: 'bg-indigo-100 text-indigo-800' },
    { label: 'Amber', value: 'bg-amber-100 text-amber-800' },
    { label: 'Rose', value: 'bg-rose-100 text-rose-800' },
    { label: 'Purple', value: 'bg-purple-100 text-purple-800' },
    { label: 'Pink', value: 'bg-pink-100 text-pink-800' },
    { label: 'Cyan', value: 'bg-cyan-100 text-cyan-800' },
    { label: 'Lime', value: 'bg-lime-100 text-lime-800' },
    { label: 'Orange', value: 'bg-orange-100 text-orange-800' },
    { label: 'Slate', value: 'bg-slate-100 text-slate-800' },
    { label: 'Teal', value: 'bg-teal-100 text-teal-800' },
    { label: 'Emerald', value: 'bg-emerald-100 text-emerald-800' },
    { label: 'Violet', value: 'bg-violet-100 text-violet-800' },
    { label: 'Fuchsia', value: 'bg-fuchsia-100 text-fuchsia-800' },
    { label: 'Sky', value: 'bg-sky-100 text-sky-800' },
  ];

  const fetchCategoryColors = async () => {
    try {
      const res = await authedFetch(`${API_BASE}/category-colors`);
      if (res.ok) {
        const data = await res.json();
        setCategoryColors(data.colors);
      }
    } catch (err) {
      console.error('Failed to fetch category colors:', err);
    }
  };

  const handleColorChange = async (category: string, color: string) => {
    try {
      await authedFetch(`${API_BASE}/category-colors/${encodeURIComponent(category)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ color }),
      });
      setCategoryColors(prev => ({ ...prev, [category]: color }));
      setEditingColor(null);
    } catch (err) {
      console.error('Failed to update color:', err);
    }
  };

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const res = await authedFetch(`${API_BASE}/categories`);
      if (!res.ok) throw new Error('Failed to fetch categories');
      const data: CategoriesData = await res.json();
      setCategories(data.categories);
      setMainCategoryOrder(data.mainCategoryOrder);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
    fetchCategoryColors();
    fetchPlaidAccounts();
    fetchSyncLogs();
    createPlaidLinkToken();
  }, []);

  const toggleCategory = (cat: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  // --- CRUD Operations ---

  const handleAddMainCategory = async () => {
    const name = newMainName.trim();
    if (!name) return;
    try {
      // Add a placeholder subcategory to create the main category
      const res = await authedFetch(`${API_BASE}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mainCategory: name, subCategory: 'General' }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add category');
      }
      setAddingMainCategory(false);
      setNewMainName('');
      await fetchCategories();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleAddSubCategory = async (mainCategory: string) => {
    const name = newSubName.trim();
    if (!name) return;
    try {
      const res = await authedFetch(`${API_BASE}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mainCategory, subCategory: name }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add subcategory');
      }
      setAddingSubTo(null);
      setNewSubName('');
      await fetchCategories();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleRenameMainCategory = async () => {
    if (!editingMain) return;
    const newName = editingValue.trim();
    if (!newName || newName === editingMain.oldName) {
      setEditingMain(null);
      setEditingValue('');
      return;
    }
    try {
      const res = await authedFetch(`${API_BASE}/categories/rename-main`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldName: editingMain.oldName, newName }),
      });
      if (!res.ok) throw new Error('Failed to rename category');
      setEditingMain(null);
      setEditingValue('');
      await fetchCategories();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleRenameSubCategory = async () => {
    if (!editingSub) return;
    const newName = editingValue.trim();
    if (!newName) {
      setEditingSub(null);
      setEditingValue('');
      return;
    }
    try {
      const res = await authedFetch(`${API_BASE}/categories/${editingSub.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subCategory: newName }),
      });
      if (!res.ok) throw new Error('Failed to rename subcategory');
      setEditingSub(null);
      setEditingValue('');
      await fetchCategories();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeleteMainCategory = async (mainCategory: string) => {
    try {
      const res = await authedFetch(`${API_BASE}/categories/main/${encodeURIComponent(mainCategory)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete category');
      setConfirmDelete(null);
      await fetchCategories();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeleteSubCategory = async (id: number) => {
    try {
      const res = await authedFetch(`${API_BASE}/categories/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete subcategory');
      setConfirmDelete(null);
      await fetchCategories();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // --- CSV Export ---
  const handleExportCsv = () => {
    const rows = [['Main Category', 'Sub Category']];
    for (const main of mainCategoryOrder) {
      for (const sub of categories[main] || []) {
        rows.push([main, sub.name]);
      }
    }
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'budget_categories.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- CSV Import ---
  const handleCsvUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) {
        toast.error('CSV file appears empty or has no data rows');
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      const mainIdx = headers.findIndex(h => /main|primary|category/i.test(h));
      const subIdx = headers.findIndex(h => /sub|secondary/i.test(h));

      if (mainIdx === -1) {
        toast.error('Could not find a Main Category column in the CSV');
        return;
      }

      const parsed = lines.slice(1).map(line => {
        const vals = line.split(',').map(v => v.trim().replace(/"/g, ''));
        return {
          mainCategory: vals[mainIdx] || '',
          subCategory: subIdx >= 0 ? vals[subIdx] || '' : '',
        };
      }).filter(r => r.mainCategory);

      setCsvPreview(parsed);
    };
    reader.readAsText(file);
    // Reset file input
    event.target.value = '';
  };

  const handleImportCsv = async () => {
    if (!csvPreview) return;

    try {
      // Add each category/subcategory pair
      let added = 0;
      let skipped = 0;
      for (const row of csvPreview) {
        const subCategory = row.subCategory || 'General';
        const res = await authedFetch(`${API_BASE}/categories`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mainCategory: row.mainCategory, subCategory }),
        });
        if (res.status === 409) {
          skipped++;
        } else if (res.ok) {
          added++;
        }
      }
      toast.success(`Import complete: ${added} added, ${skipped} already existed`);
      setCsvPreview(null);
      await fetchCategories();
    } catch (err: any) {
      toast.error('Import failed: ' + err.message);
    }
  };

  const totalSubcategories = Object.values(categories).reduce((sum, subs) => sum + subs.length, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-ever-lime" />
        <span className="ml-3 text-ever-dim">Loading categories…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-extrabold tracking-tight text-ever-ink md:text-[26px]">Personal Finance Settings</h1>
      </div>

      {error && (
        <div className="rounded-ever border border-ever-line bg-white/5 px-4 py-3 text-sm text-ever-neg">
          {error}
        </div>
      )}

      {/* Category Management */}
      <Card className="p-0">
        <div className="px-6 py-4 border-b border-ever-line">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Tag className="h-5 w-5 text-ever-lime mr-2" />
              <h2 className="text-lg font-semibold text-ever-ink">Budget Categories</h2>
              <span className="ml-3 text-sm text-ever-dim">
                {mainCategoryOrder.length} categories, {totalSubcategories} subcategories
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <label className="cursor-pointer inline-flex items-center rounded-[11px] border border-ever-line px-3 py-1.5 text-sm text-ever-ink hover:bg-white/5">
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                Import CSV
                <input type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" />
              </label>
              <Button variant="ghost" onClick={handleExportCsv} className="px-3 py-1.5">
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Export CSV
              </Button>
              <Button onClick={() => { setAddingMainCategory(true); setNewMainName(''); }} className="px-3 py-1.5">
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add Category
              </Button>
            </div>
          </div>
        </div>

        {/* CSV Preview */}
        {csvPreview && (
          <div className="px-6 py-4 bg-white/5 border-b border-ever-line">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-ever-ink">CSV Preview ({csvPreview.length} rows)</h3>
              <div className="flex space-x-2">
                <Button variant="ghost" onClick={() => setCsvPreview(null)} className="px-3 py-1.5">
                  Cancel
                </Button>
                <Button onClick={handleImportCsv} className="px-3 py-1.5">
                  Import All
                </Button>
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-ever-dim">
                    <th className="pr-4 py-1">Main Category</th>
                    <th className="pr-4 py-1">Sub Category</th>
                  </tr>
                </thead>
                <tbody>
                  {csvPreview.slice(0, 20).map((row, i) => (
                    <tr key={i} className="text-ever-ink">
                      <td className="pr-4 py-0.5">{row.mainCategory}</td>
                      <td className="pr-4 py-0.5">{row.subCategory || '—'}</td>
                    </tr>
                  ))}
                  {csvPreview.length > 20 && (
                    <tr><td colSpan={2} className="text-ever-dim py-1">...and {csvPreview.length - 20} more</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Add Main Category Input */}
        {addingMainCategory && (
          <div className="px-6 py-3 bg-white/5 border-b border-ever-line flex items-center space-x-2">
            <input
              type="text"
              value={newMainName}
              onChange={e => setNewMainName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddMainCategory(); if (e.key === 'Escape') setAddingMainCategory(false); }}
              placeholder="New category name..."
              className="flex-1 bg-ever-bg border border-ever-line text-ever-ink placeholder-ever-faint rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-ever-lime"
              autoFocus
            />
            <Button onClick={handleAddMainCategory} className="px-3 py-1.5">
              Add
            </Button>
            <button onClick={() => setAddingMainCategory(false)} className="px-3 py-1.5 text-sm font-medium text-ever-dim hover:text-ever-ink">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Category List */}
        <div className="divide-y divide-ever-line">
          {mainCategoryOrder.map(mainCat => {
            const subs = categories[mainCat] || [];
            const isCollapsed = collapsedCategories.has(mainCat);
            const isEditingThis = editingMain?.oldName === mainCat;

            return (
              <div key={mainCat}>
                {/* Main category header */}
                <div
                  className={cn(
                    'px-6 py-3 bg-white/5 flex items-center justify-between hover:bg-white/10 group transition-colors',
                    dropTarget === mainCat && 'ring-2 ring-inset ring-ever-lime',
                  )}
                  onDragOver={e => { e.preventDefault(); setDropTarget(mainCat); }}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={e => { e.preventDefault(); handleDrop(mainCat); }}
                >
                  <div className="flex items-center flex-1">
                    <button onClick={() => toggleCategory(mainCat)} className="mr-2">
                      {isCollapsed
                        ? <ChevronRight className="h-4 w-4 text-ever-faint" />
                        : <ChevronDown className="h-4 w-4 text-ever-faint" />}
                    </button>

                    {isEditingThis ? (
                      <input
                        type="text"
                        value={editingValue}
                        onChange={e => setEditingValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleRenameMainCategory(); if (e.key === 'Escape') { setEditingMain(null); setEditingValue(''); } }}
                        onBlur={handleRenameMainCategory}
                        className="bg-ever-bg border border-ever-line text-ever-ink rounded px-2 py-1 text-sm focus:outline-none focus:border-ever-lime"
                        autoFocus
                      />
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingColor(editingColor === mainCat ? null : mainCat); }}
                        className={cn('inline-flex px-2 py-1 text-xs font-medium rounded-full transition-transform hover:scale-105', everPill(categoryColors[mainCat]))}
                        title="Change color"
                      >
                        {mainCat}
                      </button>
                    )}

                    <span className="ml-2 text-xs text-ever-faint">{subs.length} subcategories</span>
                  </div>

                  <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => { setEditingMain({ oldName: mainCat }); setEditingValue(mainCat); }}
                      className="p-1 text-ever-faint hover:text-ever-lime"
                      title="Rename category"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => { setAddingSubTo(mainCat); setNewSubName(''); }}
                      className="p-1 text-ever-faint hover:text-ever-pos"
                      title="Add subcategory"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setConfirmDelete({ type: 'main', mainCategory: mainCat })}
                      className="p-1 text-ever-faint hover:text-ever-neg"
                      title="Delete category"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Color Picker */}
                {editingColor === mainCat && (
                  <div className="px-6 py-3 bg-white/5 border-b border-ever-line">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-ever-dim">Choose color for {mainCat}</span>
                      <button onClick={() => setEditingColor(null)} className="text-ever-dim hover:text-ever-ink">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {COLOR_OPTIONS.map(opt => {
                        const isSelected = categoryColors[mainCat] === opt.value;
                        return (
                          <button
                            key={opt.value}
                            onClick={() => handleColorChange(mainCat, opt.value)}
                            className={cn(
                              'inline-flex px-2.5 py-1 text-xs font-medium rounded-full transition-all',
                              everPill(opt.value),
                              isSelected ? 'ring-2 ring-offset-1 ring-offset-ever-card ring-ever-lime scale-110' : 'hover:scale-105',
                            )}
                            title={opt.label}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Subcategories */}
                {!isCollapsed && (
                  <div
                    onDragOver={e => { e.preventDefault(); setDropTarget(mainCat); }}
                    onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null); }}
                    onDrop={e => { e.preventDefault(); handleDrop(mainCat); }}
                  >
                    {/* Add subcategory input */}
                    {addingSubTo === mainCat && (
                      <div className="px-6 py-2 pl-14 bg-white/5 flex items-center space-x-2">
                        <input
                          type="text"
                          value={newSubName}
                          onChange={e => setNewSubName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleAddSubCategory(mainCat); if (e.key === 'Escape') setAddingSubTo(null); }}
                          placeholder="New subcategory name..."
                          className="flex-1 bg-ever-bg border border-ever-line text-ever-ink placeholder-ever-faint rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-ever-lime"
                          autoFocus
                        />
                        <Button onClick={() => handleAddSubCategory(mainCat)} className="px-3 py-1.5">
                          Add
                        </Button>
                        <button onClick={() => setAddingSubTo(null)} className="text-ever-dim hover:text-ever-ink">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )}

                    {subs.map(sub => {
                      const isEditingSub = editingSub?.id === sub.id;
                      const isDragging = dragItem?.id === sub.id;
                      return (
                        <div
                          key={sub.id}
                          draggable
                          onDragStart={() => setDragItem({ id: sub.id, name: sub.name, fromCategory: mainCat })}
                          onDragEnd={() => { setDragItem(null); setDropTarget(null); }}
                          className={cn(
                            'px-6 py-2 pl-10 flex items-center justify-between hover:bg-white/5 group cursor-grab active:cursor-grabbing',
                            isDragging && 'opacity-40',
                          )}
                        >
                          <div className="flex items-center">
                            <GripVertical className="h-3.5 w-3.5 text-ever-faint mr-2 flex-shrink-0" />
                          {isEditingSub ? (
                            <input
                              type="text"
                              value={editingValue}
                              onChange={e => setEditingValue(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') handleRenameSubCategory(); if (e.key === 'Escape') { setEditingSub(null); setEditingValue(''); } }}
                              onBlur={handleRenameSubCategory}
                              className="bg-ever-bg border border-ever-line text-ever-ink rounded px-2 py-1 text-sm focus:outline-none focus:border-ever-lime"
                              autoFocus
                            />
                          ) : (
                            <span className="text-sm text-ever-ink">{sub.name}</span>
                          )}
                          </div>
                          <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => { setEditingSub({ id: sub.id, mainCategory: mainCat }); setEditingValue(sub.name); }}
                              className="p-1 text-ever-faint hover:text-ever-lime"
                              title="Rename"
                            >
                              <Edit2 className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => setConfirmDelete({ type: 'sub', mainCategory: mainCat, subId: sub.id, subName: sub.name })}
                              className="p-1 text-ever-faint hover:text-ever-neg"
                              title="Delete"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {subs.length === 0 && (
                      <div className="px-6 py-2 pl-14 text-sm text-ever-faint italic">No subcategories</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {mainCategoryOrder.length === 0 && !loading && (
            <div className="px-6 py-12 text-center text-ever-dim">
              <Tag className="h-8 w-8 mx-auto mb-3 text-ever-faint" />
              <p>No categories yet. Add your first category or import from CSV.</p>
            </div>
          )}
        </div>
      </Card>

      {/* Plaid Bank Connection */}
      <Card className="p-0">
        <div className="px-6 py-4 border-b border-ever-line">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <LinkIcon className="h-5 w-5 text-ever-lime mr-2" />
              <h2 className="text-lg font-semibold text-ever-ink">Connected Accounts</h2>
              <span className="ml-3 text-sm text-ever-dim">
                {plaidAccounts.length} connected
              </span>
            </div>
            <Button
              onClick={async () => {
                if (!plaidConsentAcknowledged) return;
                setPlaidError(null);
                try {
                  await logPlaidLinkConsent();
                  openPlaid();
                } catch (err) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const message = (err as any)?.response?.data?.error || (err as any)?.message || 'Failed to log consent';
                  setPlaidError(`Consent log failed: ${message}. Connection aborted.`);
                }
              }}
              disabled={!plaidReady || plaidLoading || !plaidConsentAcknowledged}
              className="px-3 py-1.5"
              title={plaidConsentAcknowledged ? undefined : 'Read and acknowledge the consent statement below first'}
            >
              {plaidLoading ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Connecting...</>
              ) : (
                <><Plus className="h-3.5 w-3.5 mr-1.5" />Connect Bank Account</>
              )}
            </Button>
          </div>
        </div>

        {/* Consent gate (Q10): user must read + acknowledge before the
            Connect button is enabled. Click logs an audit row server-side
            via /api/plaid/consent before Plaid Link opens. */}
        <div className="px-6 py-4 bg-white/5 border-b border-ever-line text-sm text-ever-dim">
          <p className="mb-3">{CONSENT_TEXT}</p>
          <label className="flex items-start gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={plaidConsentAcknowledged}
              onChange={(e) => setPlaidConsentAcknowledged(e.target.checked)}
              className="mt-1 accent-ever-lime"
            />
            <span>
              I have read and agree to the{' '}
              <Link to="/privacy" className="text-ever-lime hover:underline" target="_blank" rel="noopener noreferrer">
                Privacy Policy
              </Link>
              .
            </span>
          </label>
        </div>

        {plaidError && (
          <div className="px-6 py-3 bg-white/5 border-b border-ever-line text-sm text-ever-neg">
            {plaidError}
            <button onClick={() => setPlaidError(null)} className="ml-2 text-ever-neg hover:text-ever-ink">
              <X className="h-3.5 w-3.5 inline" />
            </button>
          </div>
        )}

        {plaidSyncStatus && (
          <div className="px-6 py-3 bg-white/5 border-b border-ever-line text-sm text-ever-pos">
            {plaidSyncStatus}
          </div>
        )}

        <div className="divide-y divide-ever-line">
          {plaidAccounts.map(account => (
            <div key={account.item_id} className="px-6 py-3 flex items-center justify-between hover:bg-white/5 group">
              <div>
                <span className="text-sm font-medium text-ever-ink">{account.institution_name}</span>
                <span className="ml-2 text-xs text-ever-faint">
                  Connected {new Date(account.created_at).toLocaleDateString()}
                </span>
              </div>
              <button
                onClick={() => handleRemovePlaidAccount(account.item_id)}
                className="p-1 text-ever-faint hover:text-ever-neg opacity-0 group-hover:opacity-100 transition-opacity"
                title="Disconnect"
              >
                <Unlink className="h-4 w-4" />
              </button>
            </div>
          ))}

          {plaidAccounts.length === 0 && (
            <div className="px-6 py-8 text-center text-ever-dim">
              <LinkIcon className="h-8 w-8 mx-auto mb-3 text-ever-faint" />
              <p className="text-sm">No bank accounts connected yet.</p>
              <p className="text-xs text-ever-faint mt-1">Connect your Chase or other bank account to automatically import transactions.</p>
            </div>
          )}
        </div>

        {/* Sync Controls */}
        {plaidAccounts.length > 0 && (
          <div className="px-6 py-4 border-t border-ever-line bg-white/5">
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2 text-sm">
                <label className="text-ever-dim">From</label>
                <input
                  type="date"
                  value={syncStartDate}
                  onChange={e => setSyncStartDate(e.target.value)}
                  className="bg-ever-bg border border-ever-line text-ever-ink rounded px-2 py-1 text-sm focus:outline-none focus:border-ever-lime"
                />
                <label className="text-ever-dim">To</label>
                <input
                  type="date"
                  value={syncEndDate}
                  onChange={e => setSyncEndDate(e.target.value)}
                  className="bg-ever-bg border border-ever-line text-ever-ink rounded px-2 py-1 text-sm focus:outline-none focus:border-ever-lime"
                />
              </div>
              <Button
                onClick={handleSyncTransactions}
                disabled={plaidLoading}
                className="px-3 py-1.5"
              >
                {plaidLoading ? (
                  <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Syncing...</>
                ) : (
                  <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Sync Transactions</>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Recent Sync Activity */}
        {syncLogs.length > 0 && (
          <div className="px-6 py-4 border-t border-ever-line">
            <h3 className="text-xs font-semibold text-ever-dim uppercase tracking-wide mb-2">Recent Activity</h3>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {syncLogs.map((log, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <div className="flex items-center">
                    <span className={cn('w-1.5 h-1.5 rounded-full mr-2',
                      log.status === 'completed' || log.status === 'success' ? 'bg-ever-pos' :
                      log.status === 'error' ? 'bg-ever-neg' : 'bg-ever-orange'
                    )} />
                    <span className="text-ever-ink">{log.message}</span>
                  </div>
                  <span className="text-ever-faint ml-4 flex-shrink-0">
                    {new Date(log.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Confirm Delete Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-ever-card border border-ever-line rounded-ever text-ever-ink w-full max-w-md mx-4">
            <div className="px-6 py-4 border-b border-ever-line">
              <h3 className="text-lg font-semibold text-ever-ink">
                Delete {confirmDelete.type === 'main' ? 'Category' : 'Subcategory'}
              </h3>
            </div>
            <div className="px-6 py-4">
              {confirmDelete.type === 'main' ? (
                <p className="text-sm text-ever-dim">
                  Are you sure you want to delete <strong>{confirmDelete.mainCategory}</strong> and all its subcategories? This cannot be undone.
                </p>
              ) : (
                <p className="text-sm text-ever-dim">
                  Are you sure you want to delete <strong>{confirmDelete.subName}</strong> from {confirmDelete.mainCategory}? This cannot be undone.
                </p>
              )}
            </div>
            <div className="flex justify-end space-x-3 px-6 py-4 border-t border-ever-line bg-white/5 rounded-b-ever">
              <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
                Cancel
              </Button>
              <button
                onClick={() => {
                  if (confirmDelete.type === 'main') {
                    handleDeleteMainCategory(confirmDelete.mainCategory);
                  } else if (confirmDelete.subId) {
                    handleDeleteSubCategory(confirmDelete.subId);
                  }
                }}
                className="inline-flex items-center justify-center rounded-[11px] bg-ever-neg px-4 py-2 text-sm font-semibold text-ever-bg transition hover:brightness-95"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PersonalFinanceSettings;
