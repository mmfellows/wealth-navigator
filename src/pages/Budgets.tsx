import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { authedFetch } from '../services/authRedirect';
import { Link, useSearchParams } from 'react-router-dom';
import { PlusCircle, Edit2, Trash2, Target, X, Archive, RotateCcw, ChevronDown, ChevronRight, History, GripVertical, MoreHorizontal, AlertTriangle, ArrowDownCircle, Scale } from 'lucide-react';
import { fetchBudgetCategories, fetchCategoryColors, DEFAULT_CATEGORY_COLOR } from '../constants/budgetCategories';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, Button, StatCard, toast } from '../components/ui';
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

// Budget-vs-actuals comparison from /api/budgets/recommendations.
type RecStatus = 'over' | 'under' | 'ok' | 'unbudgeted';
interface ItemRec {
  basis: 'merchant' | 'shared';
  merchants: string[];
  budget_monthly: number;
  actual_monthly: number;
  suggested_monthly: number;
  status: RecStatus;
  group_size: number;
}
interface SubRec {
  category: string;
  subcategory: string;
  budget_monthly: number;
  actual_monthly: number;
  recent_monthly: number;
  months_with_spend: number;
  suggested_monthly: number;
  status: RecStatus;
  line_count: number;
}
interface Recommendations {
  window: { requested_months: number; months_used: number; start: string; end: string };
  totals: { budget_monthly: number; actual_monthly: number; suggested_monthly: number };
  subcategories: SubRec[];
  items: Record<string, ItemRec>;
}

const usd0 = (n: number) => `$${Math.round(n).toLocaleString()}`;
const monthName = (key: string) =>
  new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

// Row actions behind a "…" button that only appears while the row is hovered
// (or focused, or on touch screens where there is no hover). The menu is
// position:fixed so the table's scroll container can't clip it.
interface RowAction { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }
const RowMenu: React.FC<{ actions: RowAction[]; label: string }> = ({ actions, label }) => {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setPos(null), []);

  useEffect(() => {
    if (!pos) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { close(); btn.current?.focus(); } };
    window.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [pos, close]);

  return (
    <>
      <button
        ref={btn}
        onMouseDown={e => e.stopPropagation()}
        onClick={e => {
          e.stopPropagation();
          if (pos) return close();
          const r = e.currentTarget.getBoundingClientRect();
          const menuHeight = actions.length * 36 + 8;
          const top = r.bottom + menuHeight + 8 > window.innerHeight ? r.top - menuHeight - 4 : r.bottom + 4;
          setPos({ top, right: window.innerWidth - r.right });
        }}
        aria-haspopup="menu"
        aria-expanded={!!pos}
        aria-label={label}
        className={cn(
          'rounded-md p-1 text-ever-dim transition hover:bg-white/10 hover:text-ever-ink focus:opacity-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-ever-lime',
          'opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100',
          pos && 'opacity-100 bg-white/10 text-ever-ink',
        )}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {pos && (
        <div
          role="menu"
          onMouseDown={e => e.stopPropagation()}
          className="fixed z-50 min-w-[150px] rounded-lg border border-ever-line bg-ever-card py-1 text-left shadow-xl"
          style={{ top: pos.top, right: pos.right }}
        >
          {actions.map(a => (
            <button
              key={a.label}
              role="menuitem"
              onClick={() => { close(); a.onClick(); }}
              className={cn(
                'flex h-9 w-full items-center gap-2.5 px-3 text-sm hover:bg-white/5',
                a.danger ? 'text-ever-neg' : 'text-ever-ink',
              )}
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
};

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

// `embedded` is the Year Plan page's "Budget lines" tab: same table and
// tools, without this page's own title and year banner.
const Budgets: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const [BUDGET_CATEGORIES, setBudgetCategories] = useState<Record<string, string[]>>({});
  const [categoryColors, setCategoryColors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchBudgetCategories().then(setBudgetCategories).catch(console.error);
    fetchCategoryColors().then(setCategoryColors).catch(console.error);
  }, []);

  // Which plan year's lines are on screen (?year=2027 for a draft of next year).
  const thisYear = new Date().getFullYear();
  const [searchParams] = useSearchParams();
  const viewYear = Number(searchParams.get('year')) || thisYear;
  const isOtherYear = viewYear !== thisYear;
  const [loaded, setLoaded] = useState(false);

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
    setLoaded(false);
    // Another year shows only that year's own lines (never the lines it
    // would inherit, which belong to the live budget).
    authedFetch(isOtherYear ? `/api/budgets?year=${viewYear}&strict=1` : '/api/budgets')
      .then(r => r.json())
      .then(async (items: any[]) => {
        setLoaded(true);
        if (items.length > 0 || isOtherYear) {
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
  }, [viewYear, isOtherYear]);

  // Budget vs actual spending (last 6 or 12 complete months).
  const [recs, setRecs] = useState<Recommendations | null>(null);
  const [recMonths, setRecMonths] = useState<6 | 12>(12);
  const [expandedRec, setExpandedRec] = useState<string | null>(null);
  const [showAllRecs, setShowAllRecs] = useState(false);

  const loadRecs = useCallback(() => {
    authedFetch(`/api/budgets/recommendations?months=${recMonths}&year=${viewYear}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('Failed to load recommendations'))))
      .then(setRecs)
      .catch(console.error);
  }, [recMonths, viewYear]);
  useEffect(() => { loadRecs(); }, [loadRecs]);

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

      // Editing a draft for a future year is planning, not a price change:
      // no history entry, and the line still starts on January 1.
      if (priceChanged && !isOtherYear) {
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
        startDate: priceChanged && !isOtherYear ? today : form.startDate,
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
          body: JSON.stringify({
            ...form, amount, endDate: form.endDate || null,
            ...(isOtherYear ? { plan_year: viewYear, startDate: `${viewYear}-01-01` } : {}),
          }),
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

  // Apply a suggested monthly figure to a line (keeps the old price in history).
  const applySuggestion = async (item: BudgetItem, monthly: number) => {
    const today = new Date().toISOString().split('T')[0];
    const amount = item.frequency === 'annual' ? monthly * 12 : monthly;
    try {
      const res = await authedFetch(`/api/budgets/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          monthlyExpectedSpend: monthly,
          startDate: today,
          priceHistory: [...item.priceHistory, {
            amount: item.amount, frequency: item.frequency, effectiveDate: item.startDate, endDate: today,
          }],
        }),
      });
      if (!res.ok) throw new Error('update failed');
      const updated = await res.json();
      setBudgetItems(items => items.map(i => i.id === item.id ? { ...i, ...updated } : i));
      setExpandedRec(null);
      toast.success(`${item.itemName} budget set to ${usd0(monthly)}/mo`);
      loadRecs();
    } catch (err) {
      console.error('Failed to apply suggestion:', err);
      toast.error('Could not update that budget line.');
    }
  };

  // Create a line for a subcategory that has spending but no budget.
  const addSuggested = async (sub: SubRec) => {
    try {
      const res = await authedFetch('/api/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemName: sub.subcategory, mainCategory: sub.category, secondaryCategory: sub.subcategory,
          frequency: 'monthly', amount: sub.suggested_monthly, endDate: null,
          ...(isOtherYear ? { plan_year: viewYear, startDate: `${viewYear}-01-01` } : {}),
        }),
      });
      if (!res.ok) throw new Error('create failed');
      const created = await res.json();
      setBudgetItems(items => [...items, mapItem(created)]);
      toast.success(`Added ${sub.subcategory} at ${usd0(sub.suggested_monthly)}/mo`);
      loadRecs();
    } catch (err) {
      console.error('Failed to add suggested line:', err);
      toast.error('Could not add that budget line.');
    }
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

  // Lookups for the actuals column.
  const subRecByKey = useMemo(() => {
    const map: Record<string, SubRec> = {};
    (recs?.subcategories || []).forEach(sr => { map[`${sr.category}::${sr.subcategory}`] = sr; });
    return map;
  }, [recs]);
  const actualByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    (recs?.subcategories || []).forEach(sr => { map[sr.category] = (map[sr.category] || 0) + sr.actual_monthly; });
    return map;
  }, [recs]);
  // Subcategories worth a decision, biggest gap first (already sorted by the API).
  const flaggedSubs = useMemo(
    () => (recs?.subcategories || []).filter(sr => sr.status !== 'ok'),
    [recs],
  );

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
    // 'YYYY-MM-DD' parsed as a local date; new Date(string) would read it as
    // UTC and show the previous day in US time zones.
    const [y, m, d] = dateString.slice(0, 10).split('-').map(Number);
    return (y && m && d ? new Date(y, m - 1, d) : new Date(dateString)).toLocaleDateString();
  };

  const getCategoryColor = (category: string) => {
    return categoryColors[category] || DEFAULT_CATEGORY_COLOR;
  };

  const renderItemRow = (item: BudgetItem, isArchived: boolean) => (
    <React.Fragment key={item.id}>
      <tr className={`group hover:bg-white/5 ${isArchived ? 'opacity-60' : ''}`}>
        <td className="px-4 py-3 whitespace-nowrap pl-20">
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
        <td className="px-4 py-3 whitespace-nowrap">
          <span className={cn(
            'inline-flex px-2 py-1 text-xs font-medium rounded-full',
            everPill(item.frequency === 'monthly' ? 'bg-green-100' : 'bg-orange-100')
          )}>
            {item.frequency}
          </span>
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium text-ever-ink tabular-nums">
          ${item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-semibold text-ever-lime tabular-nums">
          ${item.monthlyExpectedSpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-right text-sm tabular-nums">
          {(() => {
            const rec = isArchived ? undefined : recs?.items[item.id];
            if (!rec) return <span className="text-ever-faint">—</span>;
            const shared = rec.basis === 'shared' && rec.group_size > 1;
            const off = rec.status === 'over' || rec.status === 'under';
            const summary = `Averaging ${usd0(rec.actual_monthly)}/mo vs ${usd0(rec.budget_monthly)} budgeted${shared ? ` across ${rec.group_size} lines` : ''}`;
            return (
              <span className="inline-flex items-center justify-end gap-1.5">
                <span className={cn(rec.status === 'over' ? 'text-ever-orange' : 'text-ever-dim')} title={summary}>
                  {usd0(rec.actual_monthly)}{shared && <span className="ml-1 text-[10px] text-ever-faint">shared</span>}
                </span>
                {off ? (
                  <button
                    onClick={() => setExpandedRec(expandedRec === item.id ? null : item.id)}
                    className={cn('rounded p-0.5 hover:bg-white/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-ever-lime', rec.status === 'over' ? 'text-ever-orange' : 'text-ever-teal')}
                    title={`${summary}. Click for options.`}
                    aria-label={`${item.itemName}: ${rec.status === 'over' ? 'spending above budget' : 'budget above spending'}. Show options.`}
                    aria-expanded={expandedRec === item.id}
                  >
                    {rec.status === 'over' ? <AlertTriangle className="h-4 w-4" /> : <ArrowDownCircle className="h-4 w-4" />}
                  </button>
                ) : (
                  <span className="inline-block w-5" aria-hidden="true" />
                )}
              </span>
            );
          })()}
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-sm text-ever-dim">
          {formatDate(item.startDate)} — {formatDate(item.endDate)}
        </td>
        <td className="w-10 px-2 py-3 whitespace-nowrap text-right text-sm font-medium">
          <div className="flex items-center justify-end">
            <RowMenu
              label={`Actions for ${item.itemName}`}
              actions={isArchived ? [
                { label: 'Restore', icon: <RotateCcw className="h-4 w-4 text-ever-pos" />, onClick: () => handleRestore(item.id) },
                { label: 'Delete', icon: <Trash2 className="h-4 w-4" />, onClick: () => handleDelete(item.id), danger: true },
              ] : [
                { label: 'Edit', icon: <Edit2 className="h-4 w-4 text-ever-lime" />, onClick: () => openEdit(item) },
                { label: 'Archive', icon: <Archive className="h-4 w-4 text-ever-orange" />, onClick: () => handleArchive(item.id) },
                { label: 'Delete', icon: <Trash2 className="h-4 w-4" />, onClick: () => handleDelete(item.id), danger: true },
              ]}
            />
          </div>
        </td>
      </tr>
      {!isArchived && expandedRec === item.id && recs?.items[item.id] && (() => {
        const rec = recs.items[item.id];
        const shared = rec.basis === 'shared' && rec.group_size > 1;
        const over = rec.status === 'over';
        const gap = Math.abs(rec.actual_monthly - rec.budget_monthly);
        return (
          <tr>
            <td colSpan={7} className="bg-white/5 px-4 py-3 pl-20">
              <p className="text-sm text-ever-ink">
                {shared
                  ? <>The {rec.group_size} lines in <strong>{item.secondaryCategory}</strong> without a matching merchant are budgeted at {usd0(rec.budget_monthly)}/mo together; actual spending there has averaged <strong>{usd0(rec.actual_monthly)}/mo</strong></>
                  : <>Budgeted at {usd0(rec.budget_monthly)}/mo; actual spending has averaged <strong>{usd0(rec.actual_monthly)}/mo</strong>{rec.merchants.length > 0 && <> ({rec.merchants.slice(0, 3).join(', ')})</>}</>}
                {' '}over the last {recs.window.months_used} months — <span className={over ? 'text-ever-orange' : 'text-ever-teal'}>{usd0(gap)}/mo {over ? 'over' : 'under'}</span>.
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <Button onClick={() => applySuggestion(item, rec.suggested_monthly)}>
                  {over ? 'Raise' : 'Lower'} this line to {usd0(rec.suggested_monthly)}/mo
                </Button>
                <Button variant="ghost" onClick={() => setExpandedRec(null)}>
                  {over ? 'Keep the budget — I\'ll cut back' : 'Keep the budget as is'}
                </Button>
                {shared && <span className="text-xs text-ever-faint">Raising or lowering this one line makes the group match actuals.</span>}
              </div>
            </td>
          </tr>
        );
      })()}
      {expandedHistory === item.id && item.priceHistory.length > 0 && (
        <tr>
          <td colSpan={7} className="px-4 py-3 bg-white/5 pl-20">
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
      <div className="flex justify-between items-center gap-3">
        {embedded
          ? <p className="text-sm text-ever-dim">Every budget line for {viewYear}. The "Actual / mo" column is what you've really been spending; the icon beside it opens the choice to update a line or keep it.</p>
          : <h1 className="text-2xl font-extrabold tracking-tight text-ever-ink md:text-[26px]">{isOtherYear ? `${viewYear} budget` : 'Budgets'}</h1>}
        <Button onClick={openAdd} className="flex-none whitespace-nowrap">
          <PlusCircle className="h-4 w-4" />
          Add Budget Item
        </Button>
      </div>

      {embedded ? null : isOtherYear ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-ever border border-ever-violet/40 bg-ever-violet/10 p-4 text-sm text-ever-ink">
          <span>
            {loaded && budgetItems.length === 0
              ? <>There is no {viewYear} plan yet. Start it from the Year Plan page and this year's lines are copied here as a first draft.</>
              : <>You're editing the <strong>{viewYear}</strong> plan. Changes here don't touch this year's budget. The "Actual / mo" column shows what you've really been spending, to set each line against.</>}
          </span>
          <span className="flex gap-3">
            <Link to={`/year-plan?year=${viewYear}&tab=budget`} className="font-semibold text-ever-lime hover:underline">Open in the {viewYear} plan</Link>
            <Link to="/budgets" className="text-ever-dim hover:text-ever-ink hover:underline">Back to {thisYear}</Link>
          </span>
        </div>
      ) : (
        <div className="text-sm text-ever-dim">
          This is the live {thisYear} budget.{' '}
          <Link to={`/year-plan?year=${thisYear + 1}`} className="text-ever-lime hover:underline">Plan {thisYear + 1}</Link>
        </div>
      )}

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

      {/* Budget vs actual spending: where the plan and reality disagree */}
      <Card>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-ever-ink">
              <Scale className="h-4 w-4 text-ever-lime" /> Budget vs. what you actually spend
            </h2>
            <p className="mt-0.5 text-xs text-ever-dim">
              {recs
                ? `Monthly averages from ${monthName(recs.window.start)} to ${monthName(recs.window.end)} (${recs.window.months_used} complete month${recs.window.months_used === 1 ? '' : 's'}${recs.window.months_used < recs.window.requested_months ? ' — all the history there is' : ''}). Use it to set next year's budget: update a line to match, or keep it as the target to spend down to.`
                : 'Loading your spending history…'}
            </p>
          </div>
          <div className="flex gap-1">
            {([6, 12] as const).map(n => (
              <button
                key={n}
                onClick={() => setRecMonths(n)}
                className={cn(
                  'rounded-lg px-3 py-1 font-mono text-[10.5px] tracking-wide transition',
                  recMonths === n ? 'bg-ever-lime font-bold text-ever-lime-ink' : 'border border-ever-line text-ever-dim hover:text-ever-ink',
                )}
              >
                {n} MO
              </button>
            ))}
          </div>
        </div>

        {recs && (
          <>
            <div className="mb-4 grid grid-cols-3 gap-4">
              <div>
                <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ever-dim">Budgeted / mo</div>
                <div className="mt-1 text-xl font-extrabold tabular-nums text-ever-ink">{usd0(recs.totals.budget_monthly)}</div>
              </div>
              <div>
                <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ever-dim">Actual avg / mo</div>
                <div className="mt-1 text-xl font-extrabold tabular-nums text-ever-ink">{usd0(recs.totals.actual_monthly)}</div>
              </div>
              <div>
                <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ever-dim">Gap</div>
                {(() => {
                  const gap = recs.totals.actual_monthly - recs.totals.budget_monthly;
                  return (
                    <div className={cn('mt-1 text-xl font-extrabold tabular-nums', gap > 0 ? 'text-ever-orange' : 'text-ever-pos')}>
                      {usd0(Math.abs(gap))} <span className="text-xs font-semibold">{gap > 0 ? 'over budget' : 'under budget'}</span>
                    </div>
                  );
                })()}
              </div>
            </div>

            {flaggedSubs.length === 0 ? (
              <p className="text-sm text-ever-pos">Every budgeted subcategory is within 10% of what you actually spend.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-ever-line text-left text-xs uppercase tracking-wider text-ever-dim">
                      <th className="py-2 pr-4 font-medium">Subcategory</th>
                      <th className="px-4 py-2 text-right font-medium">Budget</th>
                      <th className="px-4 py-2 text-right font-medium">Actual avg</th>
                      <th className="px-4 py-2 text-right font-medium">Last 3 mo</th>
                      <th className="px-4 py-2 text-right font-medium">Suggested</th>
                      <th className="py-2 pl-4 font-medium">What it means</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(showAllRecs ? flaggedSubs : flaggedSubs.slice(0, 8)).map(sr => {
                      const gap = sr.actual_monthly - sr.budget_monthly;
                      return (
                        <tr key={`${sr.category}::${sr.subcategory}`} className="border-b border-ever-line/60 last:border-0">
                          <td className="py-2 pr-4">
                            <span className="flex items-center gap-2">
                              {sr.status === 'under'
                                ? <ArrowDownCircle className="h-4 w-4 flex-none text-ever-teal" />
                                : <AlertTriangle className="h-4 w-4 flex-none text-ever-orange" />}
                              <span>
                                <span className="font-medium text-ever-ink">{sr.subcategory}</span>
                                <span className="ml-2 text-xs text-ever-faint">{sr.category}</span>
                              </span>
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-ever-dim">{sr.line_count > 0 ? usd0(sr.budget_monthly) : '—'}</td>
                          <td className="px-4 py-2 text-right font-semibold tabular-nums text-ever-ink">{usd0(sr.actual_monthly)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-ever-dim">{usd0(sr.recent_monthly)}</td>
                          <td className="px-4 py-2 text-right font-semibold tabular-nums text-ever-lime">{usd0(sr.suggested_monthly)}</td>
                          <td className="py-2 pl-4 text-xs text-ever-dim">
                            {sr.status === 'unbudgeted' ? (
                              <span className="flex items-center gap-2">
                                Spending with no budget line.
                                <button onClick={() => addSuggested(sr)} className="whitespace-nowrap rounded-md border border-ever-line px-2 py-1 font-medium text-ever-lime hover:bg-white/5">
                                  Add at {usd0(sr.suggested_monthly)}
                                </button>
                              </span>
                            ) : sr.status === 'over' ? (
                              <>Spending {usd0(gap)}/mo more than planned. Raise the budget or cut back.</>
                            ) : (
                              <>{usd0(-gap)}/mo of budget you don't use. Room to lower it.</>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {flaggedSubs.length > 8 && (
                  <button onClick={() => setShowAllRecs(v => !v)} className="mt-2 text-xs font-medium text-ever-lime hover:underline">
                    {showAllRecs ? 'Show fewer' : `Show all ${flaggedSubs.length}`}
                  </button>
                )}
                <p className="mt-3 text-xs text-ever-faint">
                  To act on a row, find its lines in the table below: the <AlertTriangle className="inline h-3.5 w-3.5 text-ever-orange" /> / <ArrowDownCircle className="inline h-3.5 w-3.5 text-ever-teal" /> icon next to a line opens the update-or-keep choice.
                </p>
              </div>
            )}
          </>
        )}
      </Card>

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
                <th className="px-4 py-3 text-left text-xs font-medium text-ever-dim uppercase tracking-wider">Item</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-ever-dim uppercase tracking-wider">Frequency</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-ever-dim uppercase tracking-wider">Amount</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-ever-dim uppercase tracking-wider">Monthly Expected</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-ever-dim uppercase tracking-wider" title="Average actual spend per month over the comparison window">Actual / mo</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-ever-dim uppercase tracking-wider">Dates</th>
                <th className="w-10 px-2 py-3"><span className="sr-only">Actions</span></th>
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
                            <td className="px-4 py-3">
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
                            <td className="px-4 py-3"></td>
                            <td className="px-4 py-3"></td>
                            <td className="px-4 py-3 text-right text-sm font-bold text-ever-ink tabular-nums">
                              ${totalMonthly.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums">
                              {(() => {
                                const actual = actualByCategory[category];
                                if (actual === undefined) return <span className="text-ever-faint">—</span>;
                                return <span className={actual > totalMonthly * 1.1 + 10 ? 'text-ever-orange' : 'text-ever-dim'}>{usd0(actual)}</span>;
                              })()}
                            </td>
                            <td className="px-4 py-3 text-left text-xs text-ever-dim">
                              {percentage.toFixed(1)}% of budget
                            </td>
                            <td className="px-4 py-3"></td>
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
                                          <td className="px-4 py-1.5 pl-14" colSpan={3}>
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
                                          <td className="px-4 py-1.5 text-right text-xs font-medium text-ever-dim tabular-nums">
                                            ${subTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                          </td>
                                          <td className="px-4 py-1.5 text-right text-xs font-medium tabular-nums">
                                            {(() => {
                                              const sr = subRecByKey[subKey];
                                              if (!sr) return <span className="text-ever-faint">—</span>;
                                              return (
                                                <span
                                                  className={sr.status === 'over' ? 'text-ever-orange' : sr.status === 'under' ? 'text-ever-teal' : 'text-ever-dim'}
                                                  title={`Averaging ${usd0(sr.actual_monthly)}/mo vs ${usd0(sr.budget_monthly)} budgeted (last 3 months: ${usd0(sr.recent_monthly)}/mo)`}
                                                >
                                                  {usd0(sr.actual_monthly)}
                                                </span>
                                              );
                                            })()}
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
                <td className="px-6 py-4 text-right text-sm font-bold text-ever-dim tabular-nums">{recs ? usd0(recs.totals.actual_monthly) : '—'}</td>
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
                    <th className="px-4 py-3 text-left text-xs font-medium text-ever-dim uppercase tracking-wider">Item</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-ever-dim uppercase tracking-wider">Frequency</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-ever-dim uppercase tracking-wider">Amount</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-ever-dim uppercase tracking-wider">Monthly Expected</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-ever-dim uppercase tracking-wider" title="Average actual spend per month over the comparison window">Actual / mo</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-ever-dim uppercase tracking-wider">Dates</th>
                    <th className="w-10 px-2 py-3"><span className="sr-only">Actions</span></th>
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
