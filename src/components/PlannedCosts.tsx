import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Trash2 } from 'lucide-react';
import { authedFetch } from '../services/authRedirect';
import { fetchBudgetCategories } from '../constants/budgetCategories';
import { Card, CardHeader, Button, toast } from './ui';

interface PlannedCost {
  id: string;
  name: string;
  amount: number;
  month: string; // YYYY-MM
  category: string;
  subcategory: string | null;
}

const fmt = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const monthLabel = (key: string) =>
  new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1)
    .toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

const inputCls = 'rounded-lg border border-ever-line bg-ever-bg px-3 py-2 text-sm text-ever-ink placeholder-ever-faint focus:border-ever-lime focus:outline-none';

// One-off costs you know are coming. Each lands in its month's budget, so
// pacing doesn't read a known expense as overspending. The emailed digest
// links here (#planned) to prompt for new ones.
export function PlannedCosts() {
  const queryClient = useQueryClient();
  const ref = useRef<HTMLDivElement>(null);
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [month, setMonth] = useState(thisMonth);
  const [category, setCategory] = useState('Special Expense');

  useEffect(() => {
    if (window.location.hash === '#planned') ref.current?.scrollIntoView({ block: 'center' });
  }, []);

  const { data } = useQuery<{ planned_costs: PlannedCost[] }>({
    queryKey: ['planned-costs', thisMonth],
    queryFn: async () => {
      const res = await authedFetch(`/api/planned-costs?from=${thisMonth}`);
      if (!res.ok) throw new Error('Failed to fetch planned costs');
      return res.json();
    },
  });

  const { data: categories = {} } = useQuery({
    queryKey: ['budget-categories'],
    queryFn: fetchBudgetCategories,
  });
  const mains = Object.keys(categories).filter(c => c !== 'Income' && c !== 'Taxes');
  const categoryOptions = mains.includes(category) ? mains : [category, ...mains];

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['planned-costs'] });
    queryClient.invalidateQueries({ queryKey: ['envelopes'] });
    queryClient.invalidateQueries({ queryKey: ['year-plan'] });
  };

  const add = useMutation({
    mutationFn: async () => {
      const res = await authedFetch('/api/planned-costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, amount: Number(amount), month, category }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Failed to add planned cost');
      return res.json();
    },
    onSuccess: () => {
      toast.success(`Added to ${monthLabel(month)}'s budget`);
      setName('');
      setAmount('');
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await authedFetch(`/api/planned-costs/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to remove planned cost');
      return res.json();
    },
    onSuccess: refresh,
    onError: () => toast.error('Could not remove that planned cost.'),
  });

  const costs = data?.planned_costs || [];
  const total = costs.reduce((s, c) => s + c.amount, 0);
  const canAdd = name.trim() !== '' && Number(amount) > 0 && /^\d{4}-\d{2}$/.test(month);

  return (
    <div id="planned" ref={ref} className="scroll-mt-6">
    <Card>
      <CardHeader
        title={<span className="flex items-center gap-2"><CalendarPlus className="h-4 w-4 text-ever-lime" /> Planned costs</span>}
        hint={costs.length > 0 ? `${fmt(total)} coming up` : undefined}
      />
      <p className="-mt-2 mb-3 text-xs text-ever-dim">
        Anything coming up — travel, gifts, repairs, renewals? Add it and it's counted in that month's budget.
      </p>

      {costs.length > 0 && (
        <div className="mb-3">
          {costs.map(c => (
            <div key={c.id} className="group flex items-center gap-3 border-t border-ever-line py-2 text-sm first:border-t-0">
              <span className="w-[72px] flex-none font-mono text-[11px] text-ever-faint">{monthLabel(c.month)}</span>
              <span className="min-w-0 flex-1 truncate text-ever-ink">{c.name}</span>
              <span className="hidden text-xs text-ever-dim sm:block">{c.category}</span>
              <span className="whitespace-nowrap font-semibold tabular-nums text-ever-ink">{fmt(c.amount)}</span>
              <button
                onClick={() => remove.mutate(c.id)}
                className="p-1 text-ever-faint opacity-0 transition hover:text-ever-neg focus:opacity-100 group-hover:opacity-100"
                aria-label={`Remove ${c.name}`}
                title="Remove"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <form
        className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_110px_150px_170px_auto]"
        onSubmit={e => { e.preventDefault(); if (canAdd) add.mutate(); }}
      >
        <input className={`${inputCls} col-span-2 sm:col-span-1`} placeholder="What is it? e.g. Flights to Boston" value={name} onChange={e => setName(e.target.value)} aria-label="Planned cost name" />
        <input className={inputCls} type="number" min="0" step="1" inputMode="decimal" placeholder="Amount" value={amount} onChange={e => setAmount(e.target.value)} aria-label="Amount" />
        <input className={inputCls} type="month" min={thisMonth} value={month} onChange={e => setMonth(e.target.value)} aria-label="Month" />
        <select className={inputCls} value={category} onChange={e => setCategory(e.target.value)} aria-label="Category">
          {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <Button type="submit" disabled={!canAdd || add.isPending}>{add.isPending ? 'Adding…' : 'Add'}</Button>
      </form>
    </Card>
    </div>
  );
}
