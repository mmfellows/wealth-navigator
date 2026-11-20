import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plane, ChevronDown, ChevronRight, Plus, X, Trash2, Pencil } from 'lucide-react';
import { authedFetch } from '../services/authRedirect';
import { Card, Button, StatCard, toast } from '../components/ui';
import { cn } from '../lib/cn';

interface TripSummary {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  budget: number | null;
  total: number;
  count: number;
  days: number;
  per_day: number;
  by_category: Array<{ category: string; total: number }>;
}
interface YearSummary { year: string; total: number; trips: number; days: number; budget: number }
interface TripExpense {
  id: string; date: string; merchant: string; amount: number;
  category: string | null; subcategory: string | null;
  attached_by_hand?: boolean; during_trip?: boolean; removed?: boolean;
}
interface TripDetail { trip: TripSummary; expenses: TripExpense[]; candidates: TripExpense[] }

const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const local = (iso: string) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const shortDate = (iso: string) => local(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const range = (t: { start_date: string; end_date: string }) =>
  `${shortDate(t.start_date)} – ${local(t.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

const inputCls = 'rounded-lg border border-ever-line bg-ever-bg px-3 py-2 text-sm text-ever-ink placeholder-ever-faint focus:border-ever-lime focus:outline-none';

// Everything that shows trip-aware numbers.
const TRIP_QUERIES = ['trips', 'trip', 'year-plan', 'pacing-stats', 'envelopes', 'expenseStats', 'expensesForReport', 'expenses', 'pacing-txns'];

interface FormState { name: string; start_date: string; end_date: string; budget: string }
const emptyForm: FormState = { name: '', start_date: '', end_date: '', budget: '' };

const TripForm: React.FC<{
  initial?: FormState;
  submitLabel: string;
  busy: boolean;
  onSubmit: (f: FormState) => void;
  onCancel?: () => void;
}> = ({ initial = emptyForm, submitLabel, busy, onSubmit, onCancel }) => {
  const [f, setF] = useState<FormState>(initial);
  const ok = f.name.trim() !== '' && f.start_date !== '' && f.end_date !== '' && f.end_date >= f.start_date;
  return (
    <form
      className="grid grid-cols-2 gap-2 md:grid-cols-[1fr_150px_150px_130px_auto_auto]"
      onSubmit={e => { e.preventDefault(); if (ok) onSubmit(f); }}
    >
      <input className={cn(inputCls, 'col-span-2 md:col-span-1')} placeholder="Trip name, e.g. Italy" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} aria-label="Trip name" />
      <input className={inputCls} type="date" value={f.start_date} onChange={e => setF({ ...f, start_date: e.target.value })} aria-label="First day" />
      <input className={inputCls} type="date" min={f.start_date} value={f.end_date} onChange={e => setF({ ...f, end_date: e.target.value })} aria-label="Last day" />
      <input className={inputCls} type="number" min="0" step="50" inputMode="decimal" placeholder="Budget (optional)" value={f.budget} onChange={e => setF({ ...f, budget: e.target.value })} aria-label="Trip budget" />
      <Button type="submit" disabled={!ok || busy}>{busy ? 'Saving…' : submitLabel}</Button>
      {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
    </form>
  );
};

const ExpenseRow: React.FC<{ e: TripExpense; action: React.ReactNode; note?: string }> = ({ e, action, note }) => (
  <div className="flex items-center gap-3 border-t border-ever-line py-2 text-sm first:border-t-0">
    <span className="w-[52px] flex-none font-mono text-[11px] text-ever-faint">{shortDate(e.date)}</span>
    <span className="min-w-0 flex-1 truncate text-ever-ink" title={e.merchant}>
      {e.merchant}
      {note && <span className="ml-2 text-xs text-ever-faint">{note}</span>}
    </span>
    <span className="hidden truncate text-xs text-ever-dim sm:block sm:max-w-[180px]">{e.subcategory || e.category || 'Uncategorized'}</span>
    <span className="w-[72px] flex-none text-right font-semibold tabular-nums text-ever-ink">{usd(e.amount)}</span>
    {action}
  </div>
);

const TripPanel: React.FC<{ trip: TripSummary }> = ({ trip }) => {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [showCandidates, setShowCandidates] = useState(false);

  const { data, isLoading } = useQuery<TripDetail>({
    queryKey: ['trip', trip.id],
    queryFn: async () => {
      const res = await authedFetch(`/api/trips/${trip.id}`);
      if (!res.ok) throw new Error('Failed to fetch trip');
      return res.json();
    },
  });

  const refresh = () => TRIP_QUERIES.forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
  const call = async (path: string, init: RequestInit, failure: string) => {
    const res = await authedFetch(path, init);
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || failure);
    return res.json();
  };
  const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const onError = (e: Error) => toast.error(e.message);

  const attach = useMutation({
    mutationFn: (expenseId: string) => call(`/api/trips/${trip.id}/expenses`, json('POST', { expense_id: expenseId }), 'Could not add that expense.'),
    onSuccess: refresh, onError,
  });
  const detach = useMutation({
    mutationFn: (expenseId: string) => call(`/api/trips/${trip.id}/expenses/${expenseId}`, { method: 'DELETE' }, 'Could not remove that expense.'),
    onSuccess: refresh, onError,
  });
  const update = useMutation({
    mutationFn: (f: FormState) => call(`/api/trips/${trip.id}`, json('PUT', { name: f.name, start_date: f.start_date, end_date: f.end_date, budget: f.budget === '' ? null : Number(f.budget) }), 'Could not save the trip.'),
    onSuccess: () => { setEditing(false); refresh(); }, onError,
  });
  const remove = useMutation({
    mutationFn: () => call(`/api/trips/${trip.id}`, { method: 'DELETE' }, 'Could not delete the trip.'),
    onSuccess: () => { toast.success(`Deleted "${trip.name}". Its expenses are back in their everyday categories.`); refresh(); }, onError,
  });

  const iconBtn = 'flex-none rounded p-1 text-ever-faint hover:bg-white/10 hover:text-ever-ink disabled:opacity-40';
  const busy = attach.isPending || detach.isPending;
  const t = data?.trip || trip;
  const maxCat = Math.max(...t.by_category.map(c => c.total), 1);
  const during = (data?.candidates || []).filter(c => c.during_trip);
  const before = (data?.candidates || []).filter(c => !c.during_trip);

  return (
    <div className="border-t border-ever-line px-5 pb-5 pt-4">
      {editing ? (
        <div className="mb-4">
          <TripForm
            initial={{ name: trip.name, start_date: trip.start_date, end_date: trip.end_date, budget: trip.budget ? String(trip.budget) : '' }}
            submitLabel="Save"
            busy={update.isPending}
            onSubmit={f => update.mutate(f)}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <div className="mb-4 flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5" /> Edit name, dates or budget</Button>
          <Button
            variant="ghost"
            className="text-ever-neg"
            disabled={remove.isPending}
            onClick={() => { if (window.confirm(`Delete the trip "${trip.name}"? Its expenses are kept and go back to their everyday categories.`)) remove.mutate(); }}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete trip
          </Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,280px)_1fr]">
        <div>
          <h4 className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-ever-dim">Where it went</h4>
          {t.by_category.length === 0 && <p className="text-sm text-ever-faint">No spending yet.</p>}
          <div className="space-y-2.5">
            {t.by_category.map(c => (
              <div key={c.category}>
                <div className="flex justify-between gap-2 text-sm">
                  <span className="truncate text-ever-ink">{c.category}</span>
                  <span className="font-semibold tabular-nums text-ever-ink">{usd(c.total)}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-ever-track">
                  <div className="h-2 rounded-full bg-ever-teal" style={{ width: `${(c.total / maxCat) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="min-w-0">
          <h4 className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-ever-dim">
            Expenses on this trip ({data?.expenses.length ?? t.count})
          </h4>
          {isLoading ? (
            <p className="text-sm text-ever-faint">Loading…</p>
          ) : (
            <div className="max-h-80 overflow-y-auto pr-1">
              {data!.expenses.length === 0 && <p className="py-2 text-sm text-ever-faint">Nothing in this date range yet.</p>}
              {data!.expenses.map(e => (
                <ExpenseRow
                  key={e.id}
                  e={e}
                  note={e.attached_by_hand ? 'added by hand' : undefined}
                  action={
                    <button className={iconBtn} disabled={busy} onClick={() => detach.mutate(e.id)} title="Not part of this trip" aria-label={`Remove ${e.merchant} from trip`}>
                      <X className="h-4 w-4" />
                    </button>
                  }
                />
              ))}
            </div>
          )}

          {data && data.candidates.length > 0 && (
            <div className="mt-4">
              <button onClick={() => setShowCandidates(v => !v)} className="flex items-center gap-1 text-xs font-medium text-ever-lime hover:underline">
                {showCandidates ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                {data.candidates.length} other expense{data.candidates.length === 1 ? '' : 's'} that might belong here
              </button>
              {showCandidates && (
                <div className="mt-2 max-h-72 overflow-y-auto pr-1">
                  {before.length > 0 && <p className="mb-1 mt-1 text-xs text-ever-dim">Travel spending in the months before (flights, bookings)</p>}
                  {before.map(e => (
                    <ExpenseRow key={e.id} e={e} action={
                      <button className={iconBtn} disabled={busy} onClick={() => attach.mutate(e.id)} title="Add to this trip" aria-label={`Add ${e.merchant} to trip`}>
                        <Plus className="h-4 w-4 text-ever-lime" />
                      </button>
                    } />
                  ))}
                  {during.length > 0 && <p className="mb-1 mt-3 text-xs text-ever-dim">During the trip, but left out (home costs like rent and subscriptions, or removed by you)</p>}
                  {during.map(e => (
                    <ExpenseRow key={e.id} e={e} note={e.removed ? 'removed' : undefined} action={
                      <button className={iconBtn} disabled={busy} onClick={() => attach.mutate(e.id)} title="Add to this trip" aria-label={`Add ${e.merchant} to trip`}>
                        <Plus className="h-4 w-4 text-ever-lime" />
                      </button>
                    } />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const Trips: React.FC = () => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  const { data, isLoading, error } = useQuery<{ trips: TripSummary[]; by_year: YearSummary[] }>({
    queryKey: ['trips'],
    queryFn: async () => {
      const res = await authedFetch('/api/trips');
      if (!res.ok) throw new Error('Failed to fetch trips');
      return res.json();
    },
  });

  const create = useMutation({
    mutationFn: async (f: FormState) => {
      const res = await authedFetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: f.name, start_date: f.start_date, end_date: f.end_date, budget: f.budget === '' ? null : Number(f.budget) }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Could not add the trip.');
      return res.json();
    },
    onSuccess: (trip: TripSummary) => {
      toast.success(`Added "${trip.name}"`);
      setFormKey(k => k + 1);
      setOpen(trip.id);
      TRIP_QUERIES.forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const trips = data?.trips || [];
  const years = data?.by_year || [];
  const thisYear = String(new Date().getFullYear());
  const current = years.find(y => y.year === thisYear);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ever-ink md:text-[26px]">Trips</h1>
        <p className="mt-1 text-sm text-ever-dim">
          What each trip really cost. An expense keeps its own category (a restaurant is still a restaurant) and is also counted toward the trip it happened on.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label={`${thisYear} trip spending`} value={usd(current?.total || 0)} dot="var(--ever-teal)" sub={current ? `${current.trips} trip${current.trips === 1 ? '' : 's'}` : 'No trips yet'} />
        <StatCard label="Days away" value={current?.days || 0} dot="var(--ever-violet)" />
        <StatCard label="Average per day" value={current && current.days > 0 ? usd(current.total / current.days) : '—'} dot="var(--ever-lime)" />
        <StatCard label="Average per trip" value={current && current.trips > 0 ? usd(current.total / current.trips) : '—'} dot="var(--ever-orange)" />
      </div>

      <Card>
        <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-ever-ink"><Plane className="h-4 w-4 text-ever-lime" /> Add a trip</h2>
        <p className="mb-3 text-xs text-ever-dim">
          Card spending between the two dates is counted toward the trip automatically, except home costs like rent, utilities, insurance and subscriptions. You can add or remove individual expenses afterwards. Works for future trips too: give it a budget and it's in that month's plan.
        </p>
        <TripForm key={formKey} submitLabel="Add trip" busy={create.isPending} onSubmit={f => create.mutate(f)} />
      </Card>

      <div className="rounded-ever border border-ever-line bg-ever-card">
        {isLoading && <p className="p-6 text-sm text-ever-faint">Loading…</p>}
        {error ? <p className="p-6 text-sm text-ever-neg">Could not load trips. Try again.</p> : null}
        {!isLoading && !error && trips.length === 0 && (
          <p className="p-8 text-center text-sm text-ever-dim">No trips yet. Add your first one above.</p>
        )}
        {trips.map((t, i) => {
          const isOpen = open === t.id;
          const over = t.budget ? t.total > t.budget : false;
          return (
            <div key={t.id} className={cn(i > 0 && 'border-t border-ever-line')}>
              <button onClick={() => setOpen(isOpen ? null : t.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 text-left hover:bg-white/5" aria-expanded={isOpen}>
                {isOpen ? <ChevronDown className="h-4 w-4 flex-none text-ever-dim" /> : <ChevronRight className="h-4 w-4 flex-none text-ever-dim" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ever-ink">{t.name}</span>
                  <span className="block font-mono text-[11px] text-ever-dim">{range(t)} · {t.days} day{t.days === 1 ? '' : 's'} · {t.count} expense{t.count === 1 ? '' : 's'}</span>
                </span>
                <span className="text-right">
                  <span className="block text-lg font-extrabold tabular-nums text-ever-ink">{usd(t.total)}</span>
                  <span className={cn('block font-mono text-[11px]', over ? 'text-ever-neg' : 'text-ever-dim')}>
                    {t.budget ? `of ${usd(t.budget)} budget · ` : ''}{usd(t.per_day)}/day
                  </span>
                </span>
              </button>
              {isOpen && <TripPanel trip={t} />}
            </div>
          );
        })}
      </div>

      {years.length > 0 && (
        <Card>
          <h2 className="mb-3 text-lg font-semibold text-ever-ink">By year</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ever-line text-left text-xs uppercase tracking-wider text-ever-dim">
                <th className="py-2 font-medium">Year</th>
                <th className="py-2 text-right font-medium">Trips</th>
                <th className="py-2 text-right font-medium">Days</th>
                <th className="py-2 text-right font-medium">Spent</th>
                <th className="py-2 text-right font-medium">Per day</th>
              </tr>
            </thead>
            <tbody>
              {years.map(y => (
                <tr key={y.year} className="border-b border-ever-line/60 last:border-0">
                  <td className="py-2 font-medium text-ever-ink">{y.year}</td>
                  <td className="py-2 text-right tabular-nums text-ever-dim">{y.trips}</td>
                  <td className="py-2 text-right tabular-nums text-ever-dim">{y.days}</td>
                  <td className="py-2 text-right font-semibold tabular-nums text-ever-ink">{usd(y.total)}</td>
                  <td className="py-2 text-right tabular-nums text-ever-dim">{y.days > 0 ? usd(y.total / y.days) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-ever-faint">A trip counts in the year it starts. Use last year's total and per-day figure to set next year's travel budget.</p>
        </Card>
      )}
    </div>
  );
};

export default Trips;
