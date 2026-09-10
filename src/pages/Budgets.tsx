import React, { useState, useEffect, useMemo } from 'react';
import { authedFetch } from '../services/authRedirect';
import { PlusCircle, Edit2, Trash2, Target, X, Archive, RotateCcw, ChevronDown, ChevronRight, History, GripVertical } from 'lucide-react';
import { fetchBudgetCategories, fetchCategoryColors, DEFAULT_CATEGORY_COLOR } from '../constants/budgetCategories';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, Button, StatCard } from '../components/ui';
import { cn } from '../lib/cn';
import { everPill, everDot } from '../lib/categoryColors';

// Price history entry
interface PriceChange {
  amount: number;
  frequency: 'monthly' | 'annual';
  effectiveDate: string;
  endDate: string;
}

// Budget item interface
interface BudgetItem {
  id: string;
  itemName: string;
  mainCategory: string;
  secondaryCategory: string;
  frequency: 'monthly' | 'annual';
  amount: number;
  startDate: string;
  endDate: string | null;
  monthlyExpectedSpend: number;
  status: 'active' | 'archived';
  archivedDate: string | null;
  priceHistory: PriceChange[];
}

const SEED_ITEMS = [
  { itemName: 'Rent General', mainCategory: 'Home', secondaryCategory: 'Rent', frequency: 'monthly' as const, amount: 3265.00, startDate: '2025-01-01' },
  { itemName: 'Home Maintenance General', mainCategory: 'Home', secondaryCategory: 'Home Maintenance', frequency: 'monthly' as const, amount: 0, startDate: '2025-01-01' },
  { itemName: 'Electricity', mainCategory: 'Home', secondaryCategory: 'Home Maintenance', frequency: 'monthly' as const, amount: 110.00, startDate: '2025-01-01' },
  { itemName: 'Water', mainCategory: 'Home', secondaryCategory: 'Home Maintenance', frequency: 'monthly' as const, amount: 70.00, startDate: '2025-01-01' },
  { itemName: 'Internet', mainCategory: 'Home', secondaryCategory: 'Home Maintenance', frequency: 'monthly' as const, amount: 80.00, startDate: '2025-01-01' },
  { itemName: 'Cleaners', mainCategory: 'Home', secondaryCategory: 'Home Maintenance', frequency: 'monthly' as const, amount: 100.00, startDate: '2025-01-01' },
  { itemName: 'Groceries General', mainCategory: 'Food & Pharmacy', secondaryCategory: 'Groceries', frequency: 'monthly' as const, amount: 400.00, startDate: '2025-01-01' },
  { itemName: 'Other Vehicle General', mainCategory: 'Vehicle', secondaryCategory: 'Other Vehicle', frequency: 'monthly' as const, amount: 0, startDate: '2025-01-01' },
  { itemName: 'Insurance Car & Home', mainCategory: 'Vehicle', secondaryCategory: 'Other Vehicle', frequency: 'monthly' as const, amount: 104.00, startDate: '2025-01-01' },
  { itemName: 'Health Insurance General', mainCategory: 'Health & Fitness', secondaryCategory: 'Health Insurance', frequency: 'monthly' as const, amount: 0, startDate: '2025-01-01' },
  { itemName: 'Insurance Health', mainCategory: 'Health & Fitness', secondaryCategory: 'Health Insurance', frequency: 'monthly' as const, amount: 450.00, startDate: '2025-01-01' },
  { itemName: 'Gym Membership General', mainCategory: 'Health & Fitness', secondaryCategory: 'Gym Membership', frequency: 'monthly' as const, amount: 0, startDate: '2025-01-01' },
  { itemName: 'BASC', mainCategory: 'Health & Fitness', secondaryCategory: 'Gym Membership', frequency: 'monthly' as const, amount: 73.00, startDate: '2025-01-01' },
  { itemName: 'Other Discretionary Food General', mainCategory: 'Discretionary Food & Dining', secondaryCategory: 'Other Discretionary Food', frequency: 'monthly' as const, amount: 0, startDate: '2025-01-01' },
  { itemName: 'Restaurants & Bars', mainCategory: 'Discretionary Food & Dining', secondaryCategory: 'Other Discretionary Food', frequency: 'monthly' as const, amount: 900.00, startDate: '2025-01-01' },
  { itemName: 'Coffee Shops General', mainCategory: 'Discretionary Food & Dining', secondaryCategory: 'Coffee Shops', frequency: 'monthly' as const, amount: 120.00, startDate: '2025-01-01' },
  { itemName: 'Travel Other General', mainCategory: 'Travel & Vacation', secondaryCategory: 'Travel Other', frequency: 'monthly' as const, amount: 1000.00, startDate: '2025-01-01' },
  { itemName: 'Movies / Rentals General', mainCategory: 'Discretionary Entertainment', secondaryCategory: 'Movies / Rentals', frequency: 'monthly' as const, amount: 0, startDate: '2025-01-01' },
  { itemName: 'Entertainment & Recreation', mainCategory: 'Discretionary Entertainment', secondaryCategory: 'Movies / Rentals', frequency: 'monthly' as const, amount: 400.00, startDate: '2025-01-01' },
  { itemName: 'Ski Passes General', mainCategory: 'Discretionary Entertainment', secondaryCategory: 'Ski Passes', frequency: 'monthly' as const, amount: 0, startDate: '2025-01-01' },
  { itemName: 'Ikon Pass', mainCategory: 'Discretionary Entertainment', secondaryCategory: 'Ski Passes', frequency: 'annual' as const, amount: 1200.00, startDate: '2025-01-01' },
  { itemName: 'Streaming Services General', mainCategory: 'Discretionary Entertainment', secondaryCategory: 'Streaming Services', frequency: 'monthly' as const, amount: 0, startDate: '2025-01-01' },
  { itemName: 'Spotify', mainCategory: 'Discretionary Entertainment', secondaryCategory: 'Streaming Services', frequency: 'monthly' as const, amount: 11.99, startDate: '2025-01-01' },
  { itemName: 'SoundCloud', mainCategory: 'Discretionary Entertainment', secondaryCategory: 'Streaming Services', frequency: 'monthly' as const, amount: 13.99, startDate: '2025-01-01' },
  { itemName: 'Video Games General', mainCategory: 'Discretionary Entertainment', secondaryCategory: 'Video Games', frequency: 'monthly' as const, amount: 0, startDate: '2025-01-01' },
  { itemName: 'NYT Games', mainCategory: 'Discretionary Entertainment', secondaryCategory: 'Video Games', frequency: 'annual' as const, amount: 71.88, startDate: '2025-01-01' },
  { itemName: 'Other Discretionary Shopping General', mainCategory: 'Discretionary Shopping', secondaryCategory: 'Other Discretionary Shopping', frequency: 'monthly' as const, amount: 250.00, startDate: '2025-01-01' },
  { itemName: 'Personal Care General', mainCategory: 'Discretionary Shopping', secondaryCategory: 'Personal Care', frequency: 'monthly' as const, amount: 0, startDate: '2025-01-01' },
  { itemName: 'Haircuts', mainCategory: 'Discretionary Shopping', secondaryCategory: 'Personal Care', frequency: 'monthly' as const, amount: 80.00, startDate: '2025-01-01' },
  { itemName: '??? General', mainCategory: 'Other Spending', secondaryCategory: '???', frequency: 'monthly' as const, amount: 0, startDate: '2025-01-01' },
  { itemName: 'Cash', mainCategory: 'Other Spending', secondaryCategory: '???', frequency: 'monthly' as const, amount: 200.00, startDate: '2025-01-01' },
  { itemName: 'Other', mainCategory: 'Other Spending', secondaryCategory: '???', frequency: 'monthly' as const, amount: 400.00, startDate: '2025-01-01' },
  { itemName: 'Chase Annual Fee', mainCategory: 'Other Spending', secondaryCategory: '???', frequency: 'annual' as const, amount: 100.00, startDate: '2025-01-01' },
  { itemName: 'Rideshares General', mainCategory: 'Transportation', secondaryCategory: 'Rideshares', frequency: 'monthly' as const, amount: 140.00, startDate: '2025-01-01' },
  { itemName: 'Elective Medical / Dental General', mainCategory: 'Discretionary Health', secondaryCategory: 'Elective Medical / Dental', frequency: 'monthly' as const, amount: 0, startDate: '2025-01-01' },
  { itemName: 'The Now Massage', mainCategory: 'Discretionary Health', secondaryCategory: 'Elective Medical / Dental', frequency: 'monthly' as const, amount: 50.00, startDate: '2025-01-01' },
  { itemName: 'Health Apps General', mainCategory: 'Discretionary Health', secondaryCategory: 'Health Apps', frequency: 'monthly' as const, amount: 0, startDate: '2025-01-01' },
  { itemName: 'Strava', mainCategory: 'Discretionary Health', secondaryCategory: 'Health Apps', frequency: 'monthly' as const, amount: 6.67, startDate: '2025-01-01' },
  { itemName: 'AllTrails', mainCategory: 'Discretionary Health', secondaryCategory: 'Health Apps', frequency: 'annual' as const, amount: 35.99, startDate: '2025-01-01' },
  { itemName: 'Insight Timer', mainCategory: 'Discretionary Health', secondaryCategory: 'Health Apps', frequency: 'annual' as const, amount: 19.99, startDate: '2025-01-01' },
  { itemName: 'Education / Classes General', mainCategory: 'Productivity & Tools', secondaryCategory: 'Education / Classes', frequency: 'monthly' as const, amount: 0, startDate: '2025-01-01' },
  { itemName: 'MOS Investing Group', mainCategory: 'Productivity & Tools', secondaryCategory: 'Education / Classes', frequency: 'annual' as const, amount: 1500.00, startDate: '2025-01-01' },
  { itemName: 'Productivity Software General', mainCategory: 'Productivity & Tools', secondaryCategory: 'Productivity Software', frequency: 'monthly' as const, amount: 0, startDate: '2025-01-01' },
  { itemName: 'Seeking Alpha', mainCategory: 'Productivity & Tools', secondaryCategory: 'Productivity Software', frequency: 'annual' as const, amount: 504.00, startDate: '2025-01-01' },
  { itemName: 'Trading View', mainCategory: 'Productivity & Tools', secondaryCategory: 'Productivity Software', frequency: 'monthly' as const, amount: 18.08, startDate: '2025-01-01' },
  { itemName: 'Lux Algo', mainCategory: 'Productivity & Tools', secondaryCategory: 'Productivity Software', frequency: 'monthly' as const, amount: 18.08, startDate: '2025-01-01' },
  { itemName: 'Productivity Apps General', mainCategory: 'Productivity & Tools', secondaryCategory: 'Productivity Apps', frequency: 'monthly' as const, amount: 0, startDate: '2025-01-01' },
  { itemName: 'Bear Notes', mainCategory: 'Productivity & Tools', secondaryCategory: 'Productivity Apps', frequency: 'monthly' as const, amount: 1.49, startDate: '2025-01-01' },
].map(item => ({
  ...item,
  endDate: null,
  monthlyExpectedSpend: item.frequency === 'annual' ? item.amount / 12 : item.amount,
  status: 'active' as const,
  archivedDate: null,
  priceHistory: [] as PriceChange[],
}));

// Sortable category group wrapper — uses a <tbody> so it's valid inside <table>
const SortableCategoryGroup: React.FC<{
  id: string;
  children: (listeners: Record<string, Function> | undefined) => React.ReactNode;
}> = ({ id, children }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tbody ref={setNodeRef} style={style} {...attributes} className="divide-y divide-ever-line">
      {children(listeners)}
    </tbody>
  );
};

const Budgets: React.FC = () => {
  const [BUDGET_CATEGORIES, setBudgetCategories] = useState<Record<string, string[]>>({});
  const [categoryColors, setCategoryColors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchBudgetCategories().then(setBudgetCategories).catch(console.error);
    fetchCategoryColors().then(setCategoryColors).catch(console.error);
  }, []);

  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([]);

  const mapItem = (i: any): BudgetItem => ({
    id: i.id,
    itemName: i.itemName,
    mainCategory: i.mainCategory,
    secondaryCategory: i.secondaryCategory,
    frequency: i.frequency,
    amount: i.amount,
    startDate: i.startDate,
    endDate: i.endDate || null,
    monthlyExpectedSpend: i.monthlyExpectedSpend,
    status: i.status || 'active',
    archivedDate: i.archivedDate || null,
    priceHistory: i.priceHistory || [],
  });

  useEffect(() => {
    authedFetch('/api/budgets')
      .then(r => r.json())
      .then(async (items: any[]) => {
        if (items.length > 0) {
          setBudgetItems(items.map(mapItem));
        } else {
          authedFetch('/api/budgets/seed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: SEED_ITEMS }),
          })
            .then(r => r.ok ? authedFetch('/api/budgets') : Promise.reject('Seed failed'))
            .then(r => typeof r === 'object' && 'json' in r ? r.json() : [])
            .then((seeded: any[]) => setBudgetItems(seeded.map(mapItem)))
            .catch(console.error);
        }
      })
      .catch(console.error);
  }, []);

  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<BudgetItem | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [collapsedSubcategories, setCollapsedSubcategories] = useState<Set<string>>(new Set());
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);

  useEffect(() => {
    authedFetch('/api/settings/budget-category-order')
      .then(r => r.json())
      .then(data => { if (data.order?.length) setCategoryOrder(data.order); })
      .catch(console.error);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const toggleCategory = (category: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const toggleSubcategory = (key: string) => {
    setCollapsedSubcategories(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const defaultForm = {
    itemName: '',
    mainCategory: Object.keys(BUDGET_CATEGORIES)[0] || '',
    secondaryCategory: (BUDGET_CATEGORIES[Object.keys(BUDGET_CATEGORIES)[0]] || [])[0] || '',
    frequency: 'monthly' as 'monthly' | 'annual',
    amount: 0,
    startDate: new Date().toISOString().split('T')[0],
    endDate: '' as string,
  };
  const [form, setForm] = useState(defaultForm);

  const openAdd = () => {
    setEditingItem(null);
    setForm(defaultForm);
    setShowModal(true);
  };

  const openEdit = (item: BudgetItem) => {
    setEditingItem(item);
    setForm({
      itemName: item.itemName,
      mainCategory: item.mainCategory,
      secondaryCategory: item.secondaryCategory,
      frequency: item.frequency,
      amount: item.amount,
      startDate: item.startDate,
      endDate: item.endDate || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    const amount = Number(form.amount);
    const monthlyExpectedSpend = form.frequency === 'annual' ? amount / 12 : amount;
    const today = new Date().toISOString().split('T')[0];

    if (editingItem) {
      const priceChanged = amount !== editingItem.amount || form.frequency !== editingItem.frequency;
      const updatedHistory = [...editingItem.priceHistory];

      if (priceChanged) {
        updatedHistory.push({
          amount: editingItem.amount,
          frequency: editingItem.frequency,
          effectiveDate: editingItem.startDate,
          endDate: today,
        });
      }

      const updateData = {
        ...form,
        amount,
        endDate: form.endDate || null,
        monthlyExpectedSpend,
        startDate: priceChanged ? today : form.startDate,
        priceHistory: updatedHistory,
      };

      try {
        const res = await authedFetch(`/api/budgets/${editingItem.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData),
        });
        if (res.ok) {
          const updated = await res.json();
          setBudgetItems(items =>
            items.map(i => i.id === editingItem.id ? { ...i, ...updated } : i)
          );
        }
      } catch (err) { console.error('Failed to update budget item:', err); }
    } else {
      try {
        const res = await authedFetch('/api/budgets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, amount, endDate: form.endDate || null }),
        });
        if (res.ok) {
          const newItem = await res.json();
          setBudgetItems(items => [...items, {
            ...newItem,
            priceHistory: newItem.priceHistory || [],
          }]);
        }
      } catch (err) { console.error('Failed to create budget item:', err); }
    }
    setShowModal(false);
  };

  const handleArchive = async (id: string) => {
    const today = new Date().toISOString().split('T')[0];
    try {
      await authedFetch(`/api/budgets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived', archivedDate: today, endDate: today }),
      });
      setBudgetItems(items =>
        items.map(i => i.id === id ? { ...i, status: 'archived', archivedDate: today, endDate: today } : i)
      );
    } catch (err) { console.error('Failed to archive:', err); }
  };

  const handleRestore = async (id: string) => {
    try {
      await authedFetch(`/api/budgets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active', archivedDate: null, endDate: null }),
      });
      setBudgetItems(items =>
        items.map(i => i.id === id ? { ...i, status: 'active', archivedDate: null, endDate: null } : i)
      );
    } catch (err) { console.error('Failed to restore:', err); }
  };

  const handleDelete = async (id: string) => {
    try {
      await authedFetch(`/api/budgets/${id}`, { method: 'DELETE' });
      setBudgetItems(items => items.filter(i => i.id !== id));
    } catch (err) { console.error('Failed to delete:', err); }
  };

  const activeItems = budgetItems.filter(i => i.status === 'active');
  const archivedItems = budgetItems.filter(i => i.status === 'archived');

  const totalMonthlyBudget = activeItems.reduce((sum, item) => sum + item.monthlyExpectedSpend, 0);
  const mainCategories = [...new Set(activeItems.map(item => item.mainCategory))];

  // Group active items by main category, sorted by custom order or monthly spend descending
  const sortedGroups = useMemo(() => {
    const groups = mainCategories.map(category => ({
      category,
      items: activeItems.filter(i => i.mainCategory === category),
      totalMonthly: activeItems.filter(i => i.mainCategory === category).reduce((s, i) => s + i.monthlyExpectedSpend, 0),
    }));

    if (categoryOrder.length > 0) {
      const ordered: typeof groups = [];
      for (const cat of categoryOrder) {
        const group = groups.find(g => g.category === cat);
        if (group) ordered.push(group);
      }
      for (const group of groups) {
        if (!categoryOrder.includes(group.category)) ordered.push(group);
      }
      return ordered;
    }

    return groups.sort((a, b) => b.totalMonthly - a.totalMonthly);
  }, [mainCategories, activeItems, categoryOrder]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const currentOrder = sortedGroups.map(g => g.category);
      const oldIndex = currentOrder.indexOf(active.id as string);
      const newIndex = currentOrder.indexOf(over.id as string);
      const newOrder = arrayMove(currentOrder, oldIndex, newIndex);
      setCategoryOrder(newOrder);
      authedFetch('/api/settings/budget-category-order', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: newOrder }),
      }).catch(console.error);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Indefinite';
    return new Date(dateString).toLocaleDateString();
  };

  const getCategoryColor = (category: string) => {
    return categoryColors[category] || DEFAULT_CATEGORY_COLOR;
  };

  const renderItemRow = (item: BudgetItem, isArchived: boolean) => (
    <React.Fragment key={item.id}>
      <tr className={`hover:bg-white/5 ${isArchived ? 'opacity-60' : ''}`}>
        <td className="px-6 py-3 whitespace-nowrap pl-20">
          <div className="flex items-center">
            <div className="text-sm font-medium text-ever-ink">{item.itemName}</div>
            {item.priceHistory.length > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); setExpandedHistory(expandedHistory === item.id ? null : item.id); }}
                className="ml-2 text-ever-faint hover:text-ever-lime"
                title="View price history"
              >
                <History className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </td>
        <td className="px-6 py-3 whitespace-nowrap">
          <span className={cn(
            'inline-flex px-2 py-1 text-xs font-medium rounded-full',
            everPill(item.frequency === 'monthly' ? 'bg-green-100' : 'bg-orange-100')
          )}>
            {item.frequency}
          </span>
        </td>
        <td className="px-6 py-3 whitespace-nowrap text-right text-sm font-medium text-ever-ink tabular-nums">
          ${item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </td>
        <td className="px-6 py-3 whitespace-nowrap text-right text-sm font-semibold text-ever-lime tabular-nums">
          ${item.monthlyExpectedSpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </td>
        <td className="px-6 py-3 whitespace-nowrap text-sm text-ever-dim">
          {formatDate(item.startDate)} — {formatDate(item.endDate)}
        </td>
        <td className="px-6 py-3 whitespace-nowrap text-right text-sm font-medium">
          <div className="flex items-center justify-end space-x-2">
            {isArchived ? (
              <>
                <button onClick={() => handleRestore(item.id)} className="text-ever-pos hover:text-ever-ink" title="Restore">
                  <RotateCcw className="h-4 w-4" />
                </button>
                <button onClick={() => handleDelete(item.id)} className="text-ever-neg hover:text-ever-ink" title="Delete permanently">
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <button onClick={() => openEdit(item)} className="text-ever-lime hover:text-ever-ink" title="Edit">
                  <Edit2 className="h-4 w-4" />
                </button>
                <button onClick={() => handleArchive(item.id)} className="text-ever-orange hover:text-ever-ink" title="Archive">
                  <Archive className="h-4 w-4" />
                </button>
                <button onClick={() => handleDelete(item.id)} className="text-ever-neg hover:text-ever-ink" title="Delete permanently">
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
      {expandedHistory === item.id && item.priceHistory.length > 0 && (
        <tr>
          <td colSpan={6} className="px-6 py-3 bg-white/5 pl-20">
            <div className="text-xs text-ever-dim font-medium mb-2">Price History</div>
            <div className="space-y-1">
              {item.priceHistory.map((entry, idx) => (
                <div key={idx} className="flex items-center text-sm text-ever-dim">
                  <span className="w-24 tabular-nums">${entry.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  <span className="w-20 text-xs text-ever-faint">{entry.frequency}</span>
                  <span className="text-xs">
                    {formatDate(entry.effectiveDate)} — {formatDate(entry.endDate)}
                  </span>
                </div>
              ))}
              <div className="flex items-center text-sm text-ever-lime font-medium">
                <span className="w-24 tabular-nums">${item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span className="w-20 text-xs text-ever-lime/70">{item.frequency}</span>
                <span className="text-xs">
                  {formatDate(item.startDate)} — Current
                </span>
              </div>
            </div>
          </td>
        </tr>
      )}
    </React.Fragment>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-extrabold tracking-tight text-ever-ink md:text-[26px]">Budgets</h1>
        <Button onClick={openAdd}>
          <PlusCircle className="h-4 w-4" />
          Add Budget Item
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard
          label="Total Monthly Budget"
          value={`$${totalMonthlyBudget.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          dot="var(--ever-lime)"
        />
        <StatCard
          label="Active Items"
          value={activeItems.length}
          dot="var(--ever-pos)"
        />
        <StatCard
          label="Categories"
          value={mainCategories.length}
          dot="var(--ever-violet)"
        />
        <StatCard
          label="Archived Items"
          value={archivedItems.length}
          dot="var(--ever-orange)"
        />
      </div>

      {/* Active Budget Items Table - Grouped by Category */}
      <div className="bg-ever-card rounded-ever border border-ever-line">
        <div className="px-6 py-4 border-b border-ever-line flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ever-ink">Active Budget Items</h2>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => { setCollapsedCategories(new Set()); setCollapsedSubcategories(new Set()); }}
              className="text-xs text-ever-lime hover:underline font-medium"
            >
              Expand All
            </button>
            <span className="text-ever-faint">|</span>
            <button
              onClick={() => {
                setCollapsedCategories(new Set(mainCategories));
                const allSubKeys = activeItems.map(i => `${i.mainCategory}::${i.secondaryCategory}`);
                setCollapsedSubcategories(new Set(allSubKeys));
              }}
              className="text-xs text-ever-lime hover:underline font-medium"
            >
              Collapse All
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-ever-line">
            <thead className="bg-white/5">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-ever-dim uppercase tracking-wider">Item</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-ever-dim uppercase tracking-wider">Frequency</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-ever-dim uppercase tracking-wider">Amount</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-ever-dim uppercase tracking-wider">Monthly Expected</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-ever-dim uppercase tracking-wider">Dates</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-ever-dim uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={sortedGroups.map(g => g.category)} strategy={verticalListSortingStrategy}>
                {sortedGroups.map(({ category, items, totalMonthly }) => {
                  const isCollapsed = collapsedCategories.has(category);
                  const percentage = totalMonthlyBudget > 0 ? (totalMonthly / totalMonthlyBudget) * 100 : 0;
                  return (
                    <SortableCategoryGroup key={category} id={category}>
                      {(listeners) => (
                        <>
                          {/* Category header row */}
                          <tr
                            className="bg-white/5 cursor-pointer hover:bg-white/10"
                            onClick={() => toggleCategory(category)}
                          >
                            <td className="px-6 py-3">
                              <div className="flex items-center">
                                <button
                                  {...listeners}
                                  className="cursor-grab active:cursor-grabbing mr-2 text-ever-faint hover:text-ever-dim"
                                  onClick={e => e.stopPropagation()}
                                >
                                  <GripVertical className="h-4 w-4" />
                                </button>
                                {isCollapsed
                                  ? <ChevronRight className="h-4 w-4 mr-2 text-ever-dim" />
                                  : <ChevronDown className="h-4 w-4 mr-2 text-ever-dim" />
                                }
                                <span className={cn('inline-flex px-2 py-1 text-xs font-medium rounded-full mr-2', everPill(getCategoryColor(category)))}>
                                  {category}
                                </span>
                                <span className="text-xs text-ever-dim">
                                  {items.length} item{items.length !== 1 ? 's' : ''}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-3"></td>
                            <td className="px-6 py-3"></td>
                            <td className="px-6 py-3 text-right text-sm font-bold text-ever-ink tabular-nums">
                              ${totalMonthly.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-6 py-3 text-left text-xs text-ever-dim">
                              {percentage.toFixed(1)}% of budget
                            </td>
                            <td className="px-6 py-3"></td>
                          </tr>
                          {/* Item rows grouped by subcategory */}
                          {!isCollapsed && (() => {
                            const subcategories = [...new Set(items.map(i => i.secondaryCategory))]
                              .map(sub => ({
                                sub,
                                total: items.filter(i => i.secondaryCategory === sub).reduce((s, i) => s + i.monthlyExpectedSpend, 0),
                              }))
                              .sort((a, b) => b.total - a.total)
                              .map(s => s.sub);
                            return subcategories.map(sub => {
                              const subItems = items.filter(i => i.secondaryCategory === sub);
                              const subTotal = subItems.reduce((s, i) => s + i.monthlyExpectedSpend, 0);
                              return (
                                <React.Fragment key={sub}>
                                  {(() => {
                                    const subKey = `${category}::${sub}`;
                                    const isSubCollapsed = collapsedSubcategories.has(subKey);
                                    return (
                                      <>
                                        <tr
                                          className="bg-white/[0.03] cursor-pointer hover:bg-white/5"
                                          onClick={() => toggleSubcategory(subKey)}
                                        >
                                          <td className="px-6 py-1.5 pl-14" colSpan={3}>
                                            <div className="flex items-center">
                                              {isSubCollapsed
                                                ? <ChevronRight className="h-3 w-3 mr-1.5 text-ever-faint" />
                                                : <ChevronDown className="h-3 w-3 mr-1.5 text-ever-faint" />
                                              }
                                              <span className="text-xs font-medium text-ever-dim">{sub}</span>
                                              <span className="text-xs text-ever-faint ml-2">
                                                {subItems.length} item{subItems.length !== 1 ? 's' : ''}
                                              </span>
                                            </div>
                                          </td>
                                          <td className="px-6 py-1.5 text-right text-xs font-medium text-ever-dim tabular-nums">
                                            ${subTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                          </td>
                                          <td colSpan={2}></td>
                                        </tr>
                                        {!isSubCollapsed && [...subItems].sort((a, b) => {
                                          return b.monthlyExpectedSpend - a.monthlyExpectedSpend;
                                        }).map(item => renderItemRow(item, false))}
                                      </>
                                    );
                                  })()}
                                </React.Fragment>
                              );
                            });
                          })()}
                        </>
                      )}
                    </SortableCategoryGroup>
                  );
                })}
              </SortableContext>
            </DndContext>
            <tfoot className="bg-white/5">
              <tr>
                <td colSpan={3} className="px-6 py-4 text-sm font-bold text-ever-ink">Total Monthly Budget</td>
                <td className="px-6 py-4 text-right text-sm font-bold text-ever-lime tabular-nums">${totalMonthlyBudget.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {activeItems.length === 0 && (
          <div className="text-center py-12">
            <Target className="h-12 w-12 text-ever-faint mx-auto mb-4" />
            <p className="text-ever-dim">No active budget items.</p>
            <p className="text-sm text-ever-faint mt-2">Add your first budget item to get started.</p>
          </div>
        )}
      </div>

      {/* Archived Items */}
      {archivedItems.length > 0 && (
        <div className="bg-ever-card rounded-ever border border-ever-line">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="w-full px-6 py-4 border-b border-ever-line flex items-center justify-between hover:bg-white/5"
          >
            <div className="flex items-center">
              {showArchived ? <ChevronDown className="h-4 w-4 mr-2 text-ever-dim" /> : <ChevronRight className="h-4 w-4 mr-2 text-ever-dim" />}
              <h2 className="text-lg font-semibold text-ever-ink">Archived Items</h2>
              <span className="ml-2 text-sm text-ever-dim">({archivedItems.length})</span>
            </div>
          </button>

          {showArchived && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-ever-line">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-ever-dim uppercase tracking-wider">Item</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-ever-dim uppercase tracking-wider">Frequency</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-ever-dim uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-ever-dim uppercase tracking-wider">Monthly Expected</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-ever-dim uppercase tracking-wider">Dates</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-ever-dim uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ever-line">
                  {archivedItems.map(item => renderItemRow(item, true))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Category Summary */}
      <Card>
        <h3 className="text-lg font-semibold text-ever-ink mb-4">Budget by Category</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {mainCategories.map((category) => {
            const categoryTotal = activeItems
              .filter(item => item.mainCategory === category)
              .reduce((sum, item) => sum + item.monthlyExpectedSpend, 0);

            const percentage = totalMonthlyBudget > 0 ? (categoryTotal / totalMonthlyBudget) * 100 : 0;

            return (
              <div key={category} className="flex items-center justify-between p-3 border border-ever-line rounded-lg">
                <div className="flex items-center">
                  <div className={cn('w-3 h-3 rounded-full mr-3', everDot(getCategoryColor(category)))}></div>
                  <span className="text-sm font-medium text-ever-ink">{category}</span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-ever-ink tabular-nums">${categoryTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  <div className="text-xs text-ever-dim">{percentage.toFixed(1)}%</div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-ever-card border border-ever-line rounded-ever text-ever-ink w-full max-w-lg mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-ever-line">
              <h3 className="text-lg font-semibold text-ever-ink">
                {editingItem ? 'Edit Budget Item' : 'Add Budget Item'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-ever-dim hover:text-ever-ink">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">
              {editingItem && Number(form.amount) !== editingItem.amount && (
                <div className="bg-white/5 border border-ever-line rounded-md px-4 py-3 text-sm text-ever-dim">
                  <History className="h-4 w-4 inline mr-1.5 -mt-0.5 text-ever-lime" />
                  Price change detected. The previous price (${editingItem.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/{editingItem.frequency}) will be saved to price history.
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-ever-dim mb-1">Item Name</label>
                <input
                  type="text"
                  value={form.itemName}
                  onChange={e => setForm({ ...form, itemName: e.target.value })}
                  className="w-full bg-ever-bg border border-ever-line text-ever-ink placeholder-ever-faint rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ever-lime"
                  placeholder="e.g. Netflix Subscription"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-ever-dim mb-1">Main Category</label>
                  <select
                    value={form.mainCategory}
                    onChange={e => {
                      const main = e.target.value;
                      setForm({ ...form, mainCategory: main, secondaryCategory: BUDGET_CATEGORIES[main][0] });
                    }}
                    className="w-full bg-ever-bg border border-ever-line text-ever-ink rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ever-lime"
                  >
                    {Object.keys(BUDGET_CATEGORIES).map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ever-dim mb-1">Secondary Category</label>
                  <select
                    value={form.secondaryCategory}
                    onChange={e => setForm({ ...form, secondaryCategory: e.target.value })}
                    className="w-full bg-ever-bg border border-ever-line text-ever-ink rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ever-lime"
                  >
                    {(BUDGET_CATEGORIES[form.mainCategory] || []).map(sub => (
                      <option key={sub} value={sub}>{sub}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-ever-dim mb-1">Frequency</label>
                  <select
                    value={form.frequency}
                    onChange={e => setForm({ ...form, frequency: e.target.value as 'monthly' | 'annual' })}
                    className="w-full bg-ever-bg border border-ever-line text-ever-ink rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ever-lime"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="annual">Annual</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ever-dim mb-1">Amount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.amount || ''}
                    onChange={e => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-ever-bg border border-ever-line text-ever-ink placeholder-ever-faint rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ever-lime"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-ever-dim mb-1">Start Date</label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={e => setForm({ ...form, startDate: e.target.value })}
                    className="w-full bg-ever-bg border border-ever-line text-ever-ink rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ever-lime"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ever-dim mb-1">End Date (optional)</label>
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={e => setForm({ ...form, endDate: e.target.value })}
                    className="w-full bg-ever-bg border border-ever-line text-ever-ink rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ever-lime"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-3 px-6 py-4 border-t border-ever-line bg-white/5 rounded-b-ever">
              <Button variant="ghost" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={!form.itemName}
              >
                {editingItem ? 'Save Changes' : 'Add Item'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Budgets;
