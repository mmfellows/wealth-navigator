import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authedFetch } from '../services/authRedirect';
import { fetchBudgetCategories } from '../constants/budgetCategories';
import { ReviewCard, QueueItem } from '../components/ReviewCard';
import {
  RefreshCw, Sparkles, Inbox, AlertTriangle, Flag, CheckCircle2, Lock, Unlock, ChevronRight,
} from 'lucide-react';

const fmt = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

// Local-time YYYY-MM (toISOString is UTC and can shift the month).
function ym(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Previous month as YYYY-MM — the month you normally close.
function previousMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return ym(d);
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

const STEPS = ['Sync', 'Categorize', 'Review', 'Anomalies', 'Close'];

interface Anomalies {
  new_merchants: QueueItem[];
  large_transactions: (QueueItem & { category?: string })[];
  duplicate_suspects: QueueItem[][];
}

const MonthlyClose: React.FC = () => {
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(previousMonth());
  const [step, setStep] = useState(0);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [categorizeResult, setCategorizeResult] = useState<string | null>(null);

  const monthStart = `${month}-01`;
  const monthEnd = `${month}-31`;

  // Month options: the last 12 completed months.
  const monthOptions = useMemo(() => {
    const options: string[] = [];
    const d = new Date();
    d.setDate(1);
    for (let i = 1; i <= 12; i++) {
      d.setMonth(d.getMonth() - 1);
      options.push(ym(d));
    }
    return options;
  }, []);

  const { data: closeState } = useQuery({
    queryKey: ['month-close', month],
    queryFn: async () => {
      const res = await authedFetch(`/api/month-closes/${month}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch close state');
      return res.json();
    },
  });

  const { data: plaidData } = useQuery({
    queryKey: ['plaid-accounts'],
    queryFn: async () => {
      const res = await authedFetch('/api/plaid/accounts');
      if (!res.ok) throw new Error('Failed to fetch accounts');
      return res.json();
    },
  });

  const { data: syncHistory } = useQuery({
    queryKey: ['sync-history'],
    queryFn: async () => {
      const res = await authedFetch('/api/plaid/sync-history?limit=1');
      if (!res.ok) return null;
      return res.json();
    },
  });

  const { data: queueData, isFetching: queueFetching } = useQuery({
    queryKey: ['review-queue', month],
    queryFn: async () => {
      const res = await authedFetch(`/api/expenses/review-queue?month=${month}`);
      if (!res.ok) throw new Error('Failed to fetch review queue');
      return res.json() as Promise<{ queue: QueueItem[]; total: number }>;
    },
  });

  const { data: categories = {} } = useQuery({
    queryKey: ['budget-categories'],
    queryFn: fetchBudgetCategories,
  });

  const { data: anomalies } = useQuery<Anomalies>({
    queryKey: ['anomalies', month],
    enabled: step >= 3,
    queryFn: async () => {
      const res = await authedFetch(`/api/expenses/anomalies?month=${month}`);
      if (!res.ok) throw new Error('Failed to fetch anomalies');
      return res.json();
    },
  });

  const { data: monthStats } = useQuery({
    queryKey: ['month-stats', month],
    enabled: step >= 4,
    queryFn: async () => {
      const res = await authedFetch(`/api/expenses/stats/summary?startDate=${monthStart}&endDate=${monthEnd}`);
      if (!res.ok) throw new Error('Failed to fetch stats');
      return res.json();
    },
  });

  const { data: trailingStats } = useQuery({
    queryKey: ['trailing-stats', month],
    enabled: step >= 4,
    queryFn: async () => {
      const [y, m] = month.split('-').map(Number);
      const start = new Date(Date.UTC(y, m - 1 - 3, 1)).toISOString().substring(0, 10);
      const end = new Date(Date.UTC(y, m - 1, 0)).toISOString().substring(0, 10);
      const res = await authedFetch(`/api/expenses/stats/summary?startDate=${start}&endDate=${end}`);
      if (!res.ok) throw new Error('Failed to fetch trailing stats');
      return res.json();
    },
  });

  const { data: envelopes } = useQuery({
    queryKey: ['envelopes', month],
    enabled: step >= 4,
    queryFn: async () => {
      const res = await authedFetch(`/api/budgets/envelopes?month=${month}`);
      if (!res.ok) throw new Error('Failed to fetch envelopes');
      return res.json();
    },
  });

  const sync = useMutation({
    mutationFn: async () => {
      const today = new Date().toISOString().substring(0, 10);
      const res = await authedFetch('/api/plaid/sync-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: monthStart, endDate: today }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'Sync failed');
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      const results = data.results || data;
      const parts = (Array.isArray(results) ? results : []).map(
        (r: any) => `${r.institution}: ${r.success ? `${r.added} new` : `failed (${r.error})`}`,
      );
      setSyncResult(parts.join(' · ') || 'Sync complete');
      queryClient.invalidateQueries({ queryKey: ['review-queue', month] });
    },
    onError: (err: Error) => setSyncResult(err.message),
  });

  const categorize = useMutation({
    mutationFn: async () => {
      const res = await authedFetch('/api/expenses/categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'Categorization failed');
      }
      return res.json();
    },
    onSuccess: (counts: any) => {
      setCategorizeResult(
        `${counts.ai_applied} auto-categorized, ${counts.merchant_rule_applied} matched saved rules, ${counts.needs_review} need your input.`,
      );
      queryClient.invalidateQueries({ queryKey: ['review-queue', month] });
    },
    onError: (err: Error) => setCategorizeResult(err.message),
  });

  const resolve = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      const res = await authedFetch(`/api/expenses/${id}/resolve-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to resolve');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['review-queue', month] }),
  });

  const closeMonth = useMutation({
    mutationFn: async () => {
      const res = await authedFetch('/api/month-closes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, stats: monthStats || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'Failed to close month');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['month-close', month] });
      queryClient.invalidateQueries({ queryKey: ['month-closes'] });
    },
  });

  const reopen = useMutation({
    mutationFn: async () => {
      const res = await authedFetch(`/api/month-closes/${month}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to reopen');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['month-close', month] }),
  });

  const queue = queueData?.queue || [];
  const institutions = plaidData?.institutions || [];
  const lastSync = syncHistory?.logs?.[0]?.created_at || syncHistory?.[0]?.created_at || null;

  // Month summary derived numbers
  const income = monthStats?.income?.total_amount || 0;
  const spend = monthStats?.totals?.total_amount || 0;
  const taxes = monthStats?.taxes?.total_amount || 0;
  const trailingAvg = trailingStats ? (trailingStats.totals?.total_amount || 0) / 3 : null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ever-ink">Monthly Close</h1>
          <p className="text-sm text-ever-dim">Close the books like a business — every transaction categorized and acknowledged.</p>
        </div>
        <select
          value={month}
          onChange={e => { setMonth(e.target.value); setStep(0); setSyncResult(null); setCategorizeResult(null); }}
          className="bg-ever-bg border border-ever-line rounded-md text-ever-ink placeholder-ever-faint px-3 py-2"
        >
          {monthOptions.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </div>

      {closeState && (
        <div className="bg-ever-pos/10 border border-ever-pos/30 rounded-lg p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-ever-pos">
            <Lock className="h-5 w-5" />
            <span>{monthLabel(month)} was closed on {String(closeState.closed_at).substring(0, 10)}.</span>
          </div>
          <button
            onClick={() => reopen.mutate()}
            className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-md border border-ever-pos/40 text-ever-pos hover:bg-ever-pos/20"
          >
            <Unlock className="h-4 w-4" /> Reopen
          </button>
        </div>
      )}

      {/* Stepper */}
      <div className="flex items-center gap-1 overflow-x-auto">
        {STEPS.map((label, i) => (
          <React.Fragment key={label}>
            {i > 0 && <ChevronRight className="h-4 w-4 text-ever-faint shrink-0" />}
            <button
              onClick={() => i <= step && setStep(i)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap ${
                i === step ? 'bg-ever-lime text-ever-lime-ink'
                : i < step ? 'bg-ever-lime/10 text-ever-lime'
                : 'bg-ever-track text-ever-faint'
              }`}
            >
              {i + 1}. {label}
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* Step 1: Sync */}
      {step === 0 && (
        <div className="bg-ever-card rounded-ever border border-ever-line p-5 space-y-4">
          <h2 className="font-semibold text-ever-ink flex items-center gap-2"><RefreshCw className="h-5 w-5" /> Pull the latest transactions</h2>
          <div className="text-sm text-ever-dim">
            {institutions.length === 0
              ? 'No connected institutions.'
              : `${institutions.length} connected institution${institutions.length === 1 ? '' : 's'}: ${institutions.map((i: any) => i.institution_name).join(', ')}.`}
            {lastSync && <span className="block text-ever-faint mt-1">Last sync: {String(lastSync).replace('T', ' ').substring(0, 16)}</span>}
          </div>
          {syncResult && <div className="text-sm bg-white/5 rounded-md p-3">{syncResult}</div>}
          <div className="flex gap-2">
            <button
              onClick={() => sync.mutate()}
              disabled={sync.isLoading || institutions.length === 0}
              className="px-4 py-2 rounded-md bg-ever-lime text-ever-lime-ink font-medium disabled:opacity-40"
            >
              {sync.isLoading ? 'Syncing…' : 'Sync now'}
            </button>
            <button onClick={() => setStep(1)} className="px-4 py-2 rounded-md border border-ever-line text-ever-dim">
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Categorize */}
      {step === 1 && (
        <div className="bg-ever-card rounded-ever border border-ever-line p-5 space-y-4">
          <h2 className="font-semibold text-ever-ink flex items-center gap-2"><Sparkles className="h-5 w-5" /> Auto-categorize {monthLabel(month)}</h2>
          <p className="text-sm text-ever-dim">Runs saved merchant rules first, then AI for anything left. Uncertain transactions go to the review step with a question attached.</p>
          {categorizeResult && <div className="text-sm bg-white/5 rounded-md p-3">{categorizeResult}</div>}
          <div className="flex gap-2">
            <button
              onClick={() => categorize.mutate()}
              disabled={categorize.isLoading}
              className="px-4 py-2 rounded-md bg-ever-lime text-ever-lime-ink font-medium disabled:opacity-40"
            >
              {categorize.isLoading ? 'Categorizing…' : 'Run auto-categorization'}
            </button>
            <button onClick={() => setStep(2)} className="px-4 py-2 rounded-md border border-ever-line text-ever-dim">
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Review */}
      {step === 2 && (
        <div className="space-y-3">
          <div className="bg-ever-card rounded-ever border border-ever-line p-5">
            <h2 className="font-semibold text-ever-ink flex items-center gap-2"><Inbox className="h-5 w-5" /> Answer the open questions</h2>
            <p className="text-sm text-ever-dim mt-1">
              {queue.length === 0
                ? `Nothing left to review for ${monthLabel(month)}.`
                : `${queue.length} transaction${queue.length === 1 ? '' : 's'} need your input. Skip is an explicit "leave uncategorized".`}
            </p>
            {queue.length === 0 && (
              <button onClick={() => setStep(3)} className="mt-3 px-4 py-2 rounded-md bg-ever-lime text-ever-lime-ink font-medium">
                Continue
              </button>
            )}
          </div>
          {queue.map(item => (
            <ReviewCard
              key={item.id}
              item={item}
              categories={categories}
              onResolve={(id, body) => resolve.mutate({ id, body })}
            />
          ))}
          {queue.length > 0 && !queueFetching && (
            <p className="text-xs text-ever-faint text-center">Resolve every card to continue.</p>
          )}
        </div>
      )}

      {/* Step 4: Anomalies */}
      {step === 3 && (
        <div className="bg-ever-card rounded-ever border border-ever-line p-5 space-y-4">
          <h2 className="font-semibold text-ever-ink flex items-center gap-2"><Flag className="h-5 w-5" /> Anything unusual?</h2>
          {!anomalies ? (
            <p className="text-sm text-ever-dim">Checking…</p>
          ) : (
            <>
              <div>
                <h3 className="text-sm font-medium text-ever-dim mb-1">New merchants (first appearance in 6 months)</h3>
                {anomalies.new_merchants.length === 0 ? (
                  <p className="text-sm text-ever-faint">None.</p>
                ) : (
                  <ul className="text-sm divide-y divide-ever-line">
                    {anomalies.new_merchants.map(e => (
                      <li key={e.id} className="py-1.5 flex justify-between gap-2">
                        <span className="truncate">{e.date} · {e.merchant}</span>
                        <span className="font-medium whitespace-nowrap">{fmt(e.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="text-sm font-medium text-ever-dim mb-1">Unusually large vs. category history</h3>
                {anomalies.large_transactions.length === 0 ? (
                  <p className="text-sm text-ever-faint">None.</p>
                ) : (
                  <ul className="text-sm divide-y divide-ever-line">
                    {anomalies.large_transactions.map(e => (
                      <li key={e.id} className="py-1.5 flex justify-between gap-2">
                        <span className="truncate">{e.date} · {e.merchant} <span className="text-ever-faint">({(e as any).category})</span></span>
                        <span className="font-medium text-ever-orange whitespace-nowrap">{fmt(e.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="text-sm font-medium text-ever-dim mb-1">Possible duplicates</h3>
                {anomalies.duplicate_suspects.length === 0 ? (
                  <p className="text-sm text-ever-faint">None.</p>
                ) : (
                  anomalies.duplicate_suspects.map((group, i) => (
                    <div key={i} className="text-sm bg-ever-orange/10 rounded-md p-2 mb-2">
                      {group.map(e => (
                        <div key={e.id} className="flex justify-between gap-2">
                          <span className="truncate">{e.date} · {e.merchant} <span className="text-ever-faint">({e.account})</span></span>
                          <span className="font-medium whitespace-nowrap">{fmt(e.amount)}</span>
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
              <button onClick={() => setStep(4)} className="px-4 py-2 rounded-md bg-ever-lime text-ever-lime-ink font-medium">
                Looks right — continue
              </button>
            </>
          )}
        </div>
      )}

      {/* Step 5: Summary & close */}
      {step === 4 && (
        <div className="bg-ever-card rounded-ever border border-ever-line p-5 space-y-4">
          <h2 className="font-semibold text-ever-ink flex items-center gap-2"><CheckCircle2 className="h-5 w-5" /> {monthLabel(month)} summary</h2>
          {!monthStats ? (
            <p className="text-sm text-ever-dim">Loading…</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-ever-dim">Income</p>
                  <p className="text-lg font-bold text-ever-pos">{fmt(income)}</p>
                </div>
                <div>
                  <p className="text-xs text-ever-dim">Spend (ex-taxes)</p>
                  <p className="text-lg font-bold text-ever-ink">{fmt(spend)}</p>
                </div>
                <div>
                  <p className="text-xs text-ever-dim">Taxes</p>
                  <p className="text-lg font-bold text-ever-dim">{fmt(taxes)}</p>
                </div>
                <div>
                  <p className="text-xs text-ever-dim">Net (ex-taxes)</p>
                  <p className={`text-lg font-bold ${income - spend >= 0 ? 'text-ever-pos' : 'text-ever-neg'}`}>{fmt(income - spend)}</p>
                </div>
              </div>
              {trailingAvg !== null && trailingAvg > 0 && (
                <p className="text-sm text-ever-dim">
                  Spend vs. trailing 3-month average ({fmt(trailingAvg)}):{' '}
                  <span className={spend <= trailingAvg ? 'text-ever-pos font-medium' : 'text-ever-neg font-medium'}>
                    {spend <= trailingAvg ? '−' : '+'}{fmt(Math.abs(spend - trailingAvg))}
                  </span>
                </p>
              )}

              {/* Category vs envelope */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-ever-dim border-b border-ever-line">
                      <th className="py-1.5 pr-2">Category</th>
                      <th className="py-1.5 pr-2 text-right">Actual</th>
                      <th className="py-1.5 pr-2 text-right">Budget</th>
                      <th className="py-1.5 text-right">Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(monthStats.by_category || []).map((c: any) => {
                      const budget = envelopes?.byCategory?.[c.category]?.total ?? null;
                      const delta = budget !== null ? c.total - budget : null;
                      return (
                        <tr key={c.category} className="border-b border-ever-line/60 last:border-0">
                          <td className="py-1.5 pr-2">{c.category}</td>
                          <td className="py-1.5 pr-2 text-right">{fmt(c.total)}</td>
                          <td className="py-1.5 pr-2 text-right text-ever-dim">{budget !== null ? fmt(budget) : '—'}</td>
                          <td className={`py-1.5 text-right font-medium ${delta === null ? 'text-ever-faint' : delta > 0 ? 'text-ever-neg' : 'text-ever-pos'}`}>
                            {delta !== null ? `${delta > 0 ? '+' : ''}${fmt(delta)}` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {queue.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-ever-orange bg-ever-orange/10 rounded-md p-3">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {queue.length} transaction{queue.length === 1 ? '' : 's'} still unresolved — go back to Review before closing.
                </div>
              )}
              {closeMonth.isError && (
                <div className="text-sm text-ever-neg">{(closeMonth.error as Error).message}</div>
              )}
              <button
                onClick={() => closeMonth.mutate()}
                disabled={closeMonth.isLoading || queue.length > 0 || Boolean(closeState)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-md bg-ever-pos text-ever-lime-ink font-medium disabled:opacity-40"
              >
                <Lock className="h-4 w-4" />
                {closeState ? 'Month closed' : closeMonth.isLoading ? 'Closing…' : `Close ${monthLabel(month)}`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default MonthlyClose;
