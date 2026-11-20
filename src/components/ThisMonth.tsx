import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Inbox, Repeat, Sparkles, CircleDollarSign, X, Check } from 'lucide-react';
import { authedFetch } from '../services/authRedirect';
import { fetchBudgetCategories } from '../constants/budgetCategories';
import { CategoryPacing, paceStatus, PaceStatus } from './CategoryPacing';
import { PlannedCosts } from './PlannedCosts';
import { Card, CardHeader, Label, toast } from './ui';
import { cn } from '../lib/cn';

const fmt = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// "2026-11-20" → "Nov 20", parsed as a local date (new Date('YYYY-MM-DD') is UTC).
const shortDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

interface Txn {
  id: string;
  date: string;
  merchant: string | null;
  description?: string | null;
  amount: number;
  category: string | null;
  subcategory: string | null;
  account?: string | null;
  needs_review?: boolean;
  trip?: { id: string; name: string } | null;
}

interface RadarData {
  new_merchants: Array<{ id: string; date: string; merchant: string; amount: number; category: string | null }>;
  new_recurring: Array<{ merchant: string; median_amount: number; first_date: string }>;
}

const RECENT_COUNT = 20;
const SEP = '::';

// The top of the dashboard: how the in-progress month is going, what needs
// cleaning up, and the latest transactions — always the current month,
// independent of the period picker further down the page.
export function ThisMonth() {
  const queryClient = useQueryClient();
  const now = new Date();
  const month = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${pad(daysInMonth)}`;
  const day = now.getDate();
  const elapsed = day / daysInMonth;
  const daysLeft = daysInMonth - day + 1; // including today

  const { data: stats } = useQuery({
    queryKey: ['pacing-stats', month],
    queryFn: async () => {
      const res = await authedFetch(`/api/expenses/stats/summary?startDate=${monthStart}&endDate=${monthEnd}`);
      if (!res.ok) throw new Error('Failed to fetch stats');
      return res.json();
    },
  });

  const { data: envelopes } = useQuery({
    queryKey: ['envelopes', month],
    queryFn: async () => {
      const res = await authedFetch(`/api/budgets/envelopes?month=${month}`);
      if (!res.ok) throw new Error('Failed to fetch envelopes');
      return res.json();
    },
  });

  const { data: queueData } = useQuery<{ queue: Txn[]; total: number }>({
    queryKey: ['review-queue'],
    queryFn: async () => {
      const res = await authedFetch('/api/expenses/review-queue');
      if (!res.ok) throw new Error('Failed to fetch review queue');
      return res.json();
    },
  });

  const { data: radar } = useQuery<RadarData>({
    queryKey: ['radar'],
    queryFn: async () => {
      const res = await authedFetch('/api/expenses/radar');
      if (!res.ok) throw new Error('Failed to fetch radar');
      return res.json();
    },
  });

  // Latest transactions. Bounded to the last 60 days so the server doesn't
  // scan the whole collection just to return 20 rows.
  const recentStart = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 60));
  const { data: recentData, isLoading: recentLoading } = useQuery<{ expenses: Txn[] }>({
    queryKey: ['expenses', 'recent', recentStart],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: recentStart, limit: String(RECENT_COUNT), sortBy: 'date', sortOrder: 'DESC',
      });
      const res = await authedFetch(`/api/expenses?${params}`);
      if (!res.ok) throw new Error('Failed to fetch recent transactions');
      return res.json();
    },
  });

  const { data: categories = {} } = useQuery({
    queryKey: ['budget-categories'],
    queryFn: fetchBudgetCategories,
  });

  const refreshAll = () => {
    ['expenses', 'pacing-stats', 'review-queue', 'review-queue-count', 'expenseStats', 'expensesForReport', 'expenseTimeseries', 'pacing-txns']
      .forEach(key => queryClient.invalidateQueries({ queryKey: [key] }));
  };

  const recategorize = useMutation({
    mutationFn: async ({ id, category, subcategory }: { id: string; category: string; subcategory: string }) => {
      const res = await authedFetch(`/api/expenses/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, subcategory }),
      });
      if (!res.ok) throw new Error('Failed to update category');
      return res.json();
    },
    onSuccess: (_d, v) => {
      toast.success(`Categorized as ${v.category} › ${v.subcategory}`);
      refreshAll();
    },
    onError: () => toast.error('Could not update the category. Try again.'),
  });

  const ackNewMerchant = useMutation({
    mutationFn: async (id: string) => {
      const res = await authedFetch(`/api/expenses/${id}/ack-new-merchant`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to acknowledge');
      return res.json();
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['radar'] }),
  });

  const totalSpend: number = stats?.totals?.total_amount || 0;
  const totalBudget: number = envelopes?.total || 0;
  const proRated = totalBudget * elapsed;
  const paceDiff = totalSpend - proRated;
  const left = totalBudget - totalSpend;

  // Category rows, hottest first: sorted by how far spend is ahead of the
  // calendar. Unbudgeted categories sink to the bottom.
  const rows = useMemo(() => {
    const actualByCat: Record<string, number> = {};
    (stats?.by_category || []).forEach((c: any) => { actualByCat[c.category] = c.total; });
    const names = new Set<string>([
      ...Object.keys(actualByCat),
      ...Object.keys(envelopes?.byCategory || {}),
    ]);
    names.delete('Credit Card Payment');
    return [...names]
      .map(name => {
        const actual = actualByCat[name] || 0;
        const budget: number | null = envelopes?.byCategory?.[name]?.total ?? null;
        const ratio = budget && budget > 0 ? actual / budget : null;
        const status: PaceStatus | null = ratio !== null ? paceStatus(ratio, elapsed) : null;
        return { name, actual, budget, ratio, status };
      })
      .sort((a, b) => {
        if ((a.ratio === null) !== (b.ratio === null)) return a.ratio === null ? 1 : -1;
        if (a.ratio === null || b.ratio === null) return b.actual - a.actual;
        return b.ratio - a.ratio;
      });
  }, [stats, envelopes, elapsed]);

  const hotCount = rows.filter(r => r.status === 'hot' || r.status === 'blown').length;
  const coldCount = rows.filter(r => r.status === 'under').length;
  const unbudgeted = rows.filter(r => r.budget === null && r.actual > 0);

  const queue = queueData?.queue || [];
  const queueTotal = queueData?.total || 0;
  const newRecurring = radar?.new_recurring || [];
  const newMerchants = radar?.new_merchants || [];
  const unaccountedCount = newRecurring.length + newMerchants.length + unbudgeted.length;

  // Category picker options: "Main › Sub" pairs from settings.
  const options = useMemo(
    () => Object.entries(categories).flatMap(([main, subs]) => subs.map(sub => ({ main, sub }))),
    [categories],
  );

  const recent = recentData?.expenses || [];

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold tracking-tight text-ever-ink">
          {now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </h2>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ever-dim">
          Day {day} of {daysInMonth}
        </span>
      </div>

      {/* 1. Month spend vs budget */}
      <Card>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <Label>Spent so far</Label>
            <div className="mt-1.5 text-[27px] font-extrabold tracking-tight tabular-nums text-ever-ink">{fmt(totalSpend)}</div>
          </div>
          <div>
            <Label>Month budget</Label>
            <div className="mt-1.5 text-[27px] font-extrabold tracking-tight tabular-nums text-ever-dim">
              {totalBudget > 0 ? fmt(totalBudget) : '—'}
            </div>
          </div>
          <div>
            <Label>vs. pace</Label>
            <div className={cn('mt-1.5 text-[27px] font-extrabold tracking-tight tabular-nums', totalBudget <= 0 ? 'text-ever-dim' : paceDiff > 0 ? 'text-ever-neg' : 'text-ever-pos')}>
              {totalBudget > 0 ? `${paceDiff > 0 ? '+' : '−'}${fmt(Math.abs(paceDiff))}` : '—'}
            </div>
            {totalBudget > 0 && (
              <div className="mt-0.5 text-xs text-ever-dim">
                {paceDiff > 0 ? 'over' : 'under'} where day {day} should be ({fmt(proRated)})
              </div>
            )}
          </div>
          <div>
            <Label>{left >= 0 ? 'Left to spend' : 'Over budget'}</Label>
            <div className={cn('mt-1.5 text-[27px] font-extrabold tracking-tight tabular-nums', totalBudget <= 0 ? 'text-ever-dim' : left >= 0 ? 'text-ever-ink' : 'text-ever-neg')}>
              {totalBudget > 0 ? fmt(Math.abs(left)) : '—'}
            </div>
            {totalBudget > 0 && left > 0 && (
              <div className="mt-0.5 text-xs text-ever-dim">
                {fmt(left / daysLeft)}/day for {daysLeft} more day{daysLeft === 1 ? '' : 's'}
              </div>
            )}
          </div>
        </div>
        {totalBudget > 0 ? (
          <div className="mt-5">
            <div className="relative h-3.5 overflow-hidden rounded-full bg-ever-track">
              <div
                className={cn('absolute inset-y-0 left-0 rounded-full', totalSpend >= totalBudget ? 'bg-ever-neg' : paceDiff > 0 ? 'bg-ever-orange' : 'bg-ever-pos')}
                style={{ width: `${Math.min((totalSpend / totalBudget) * 100, 100)}%` }}
              />
              <div className="absolute inset-y-0 w-0.5 bg-ever-ink" style={{ left: `${elapsed * 100}%` }} title={`Today — day ${day}`} />
            </div>
            <div className="mt-1.5 flex justify-between text-xs text-ever-faint">
              <span>{Math.round((totalSpend / totalBudget) * 100)}% of budget spent</span>
              <span>{Math.round(elapsed * 100)}% of month gone (marker)</span>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-ever-dim">
            No budget set for this month. <Link to="/budgets" className="text-ever-lime hover:underline">Add budget items</Link> to see pacing.
          </p>
        )}
      </Card>

      {/* 2. Category pacing */}
      <Card>
        <CardHeader
          title="Spending by category this month"
          hint={rows.length > 0 ? `${hotCount} running hot · ${coldCount} under pace` : undefined}
        />
        <p className="-mt-2 mb-3 text-xs text-ever-dim">
          Hottest first. The bar is spend against the month's budget; the marker is today. Tap a category for its transactions.
        </p>
        <div className="grid gap-2 md:grid-cols-2">
          {rows.map(row => (
            <CategoryPacing
              key={row.name}
              category={row.name}
              actual={row.actual}
              budget={row.budget}
              elapsed={elapsed}
              monthStart={monthStart}
              monthEnd={monthEnd}
            />
          ))}
        </div>
        {rows.length === 0 && (
          <p className="py-6 text-center text-sm text-ever-faint">No spending or budgets yet this month.</p>
        )}
      </Card>

      {/* 3. Clean-up: what to categorize, what isn't accounted for */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={<span className="flex items-center gap-2"><Inbox className="h-4 w-4 text-ever-orange" /> To categorize</span>}
            right={queueTotal > 0 ? (
              <Link to="/review" className="flex items-center font-mono text-[10.5px] text-ever-lime hover:underline">
                Review all {queueTotal} <ChevronRight className="h-3 w-3" />
              </Link>
            ) : undefined}
          />
          {!queueData ? (
            <p className="text-sm text-ever-faint">Loading…</p>
          ) : queueTotal === 0 ? (
            <p className="flex items-center gap-2 text-sm text-ever-pos"><Check className="h-4 w-4" /> Everything is categorized.</p>
          ) : (
            <div>
              {queue.slice(0, 6).map(e => (
                <div key={e.id} className="flex items-center justify-between gap-3 border-t border-ever-line py-2 text-sm first:border-t-0">
                  <span className="min-w-0 truncate text-ever-ink">
                    <span className="mr-2 font-mono text-[11px] text-ever-faint">{shortDate(e.date)}</span>
                    {e.merchant || e.description || 'Unknown'}
                  </span>
                  <span className="whitespace-nowrap font-semibold tabular-nums">{fmt(e.amount)}</span>
                </div>
              ))}
              {queueTotal > 6 && (
                <p className="border-t border-ever-line pt-2 font-mono text-[10.5px] text-ever-dim">+{queueTotal - 6} more</p>
              )}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-ever-lime" /> Not accounted for</span>}
            hint={unaccountedCount > 0 ? `${unaccountedCount} to look at` : undefined}
          />
          {!radar ? (
            <p className="text-sm text-ever-faint">Loading…</p>
          ) : unaccountedCount === 0 ? (
            <p className="flex items-center gap-2 text-sm text-ever-pos"><Check className="h-4 w-4" /> No new or unbudgeted costs.</p>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {newRecurring.map(r => (
                <div key={r.merchant} className="flex items-start gap-2 rounded-md border border-ever-neg/30 bg-ever-neg/10 p-2.5 text-sm text-ever-neg">
                  <Repeat className="mt-0.5 h-4 w-4 shrink-0" />
                  <span><span className="font-medium">{r.merchant}</span> looks like a new recurring cost (~{fmt(r.median_amount)} per charge, since {shortDate(r.first_date)}).</span>
                </div>
              ))}
              {unbudgeted.map(r => (
                <div key={r.name} className="flex items-start gap-2 rounded-md border border-ever-orange/30 bg-ever-orange/10 p-2.5 text-sm text-ever-orange">
                  <CircleDollarSign className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <span className="font-medium">{r.name}</span> has {fmt(r.actual)} of spend this month and no budget.{' '}
                    <Link to="/budgets" className="underline">Add one</Link>
                  </span>
                </div>
              ))}
              {newMerchants.map(m => (
                <div key={m.id} className="flex items-center gap-2 border-t border-ever-line pt-2 text-sm first:border-t-0 first:pt-0">
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-ever-ink">{m.merchant} <span className="text-ever-faint">· first time seen</span></span>
                    <span className="text-xs text-ever-faint">{shortDate(m.date)} · {m.category || 'Uncategorized'}</span>
                  </div>
                  <span className="whitespace-nowrap font-semibold tabular-nums">{fmt(m.amount)}</span>
                  <button
                    onClick={() => ackNewMerchant.mutate(m.id)}
                    className="p-1 text-ever-faint hover:text-ever-ink"
                    title="Got it — remove from this list"
                    aria-label={`Dismiss ${m.merchant}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* 4. Planned costs: known one-offs, folded into the month's budget */}
      <PlannedCosts />

      {/* 5. Latest transactions, with the category editable in place */}
      <Card>
        <CardHeader
          title={`Last ${RECENT_COUNT} transactions`}
          right={
            <Link to="/expenses" className="flex items-center font-mono text-[10.5px] text-ever-lime hover:underline">
              All transactions <ChevronRight className="h-3 w-3" />
            </Link>
          }
        />
        <p className="-mt-2 mb-3 text-xs text-ever-dim">
          Glance down the category column. Change one here and the merchant is remembered for next time.
        </p>
        {recentLoading ? (
          <p className="text-sm text-ever-faint">Loading…</p>
        ) : recent.length === 0 ? (
          <p className="py-4 text-center text-sm text-ever-faint">No transactions in the last 60 days.</p>
        ) : (
          <div>
            {recent.map(e => {
              const current = e.category ? `${e.category}${SEP}${e.subcategory || ''}` : '';
              const known = options.some(o => `${o.main}${SEP}${o.sub}` === current);
              const isIncome = e.category === 'Income';
              const uncategorized = !e.category;
              return (
                <div
                  key={e.id}
                  className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 border-t border-ever-line py-2 text-sm first:border-t-0 sm:grid-cols-[52px_1fr_230px_90px]"
                >
                  <span className="hidden font-mono text-[11px] text-ever-faint sm:block">{shortDate(e.date)}</span>
                  <span className="min-w-0 truncate text-ever-ink" title={e.merchant || e.description || ''}>
                    <span className="mr-2 font-mono text-[11px] text-ever-faint sm:hidden">{shortDate(e.date)}</span>
                    {e.merchant || e.description || 'Unknown'}
                    {e.trip && (
                      <Link to="/trips" className="ml-2 rounded-full border border-ever-teal/40 px-1.5 py-0.5 text-[10px] font-medium text-ever-teal hover:bg-white/5" title={`Counted toward the trip "${e.trip.name}"`}>
                        {e.trip.name}
                      </Link>
                    )}
                  </span>
                  <span className={cn('text-right font-semibold tabular-nums sm:order-last', isIncome ? 'text-ever-pos' : 'text-ever-ink')}>
                    {isIncome ? `+${fmt(Math.abs(e.amount))}` : fmt(e.amount)}
                  </span>
                  <select
                    value={current}
                    disabled={recategorize.isPending}
                    onChange={ev => {
                      const [category, subcategory] = ev.target.value.split(SEP);
                      if (category) recategorize.mutate({ id: e.id, category, subcategory: subcategory || '' });
                    }}
                    aria-label={`Category for ${e.merchant || 'transaction'}`}
                    className={cn(
                      'col-span-2 w-full truncate rounded-lg border bg-ever-bg px-2 py-1.5 text-xs focus:border-ever-lime focus:outline-none sm:col-span-1',
                      uncategorized || e.needs_review
                        ? 'border-ever-orange/60 text-ever-orange'
                        : 'border-ever-line text-ever-dim',
                    )}
                  >
                    {uncategorized && <option value="">Uncategorized — pick one</option>}
                    {!uncategorized && !known && (
                      <option value={current}>{e.category}{e.subcategory ? ` › ${e.subcategory}` : ''}</option>
                    )}
                    {Object.entries(categories).map(([main, subs]) => (
                      <optgroup key={main} label={main}>
                        {subs.map(sub => (
                          <option key={sub} value={`${main}${SEP}${sub}`}>{main} › {sub}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </section>
  );
}
