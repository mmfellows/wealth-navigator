import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authedFetch } from '../services/authRedirect';
import { BurnStrip } from '../components/BurnStrip';
import { Inbox, ChevronDown, ChevronRight, Radar, Repeat, X } from 'lucide-react';

const fmt = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function ymLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

type PaceStatus = 'under' | 'on' | 'hot' | 'blown';

function paceStatus(ratio: number, elapsed: number): PaceStatus {
  if (ratio >= 1) return 'blown';
  if (ratio > elapsed + 0.1) return 'hot';
  if (ratio < elapsed - 0.15) return 'under';
  return 'on';
}

const STATUS_STYLES: Record<PaceStatus, { bar: string; text: string; label: string }> = {
  under: { bar: 'bg-green-500', text: 'text-green-700', label: 'under pace' },
  on: { bar: 'bg-blue-500', text: 'text-blue-700', label: 'on pace' },
  hot: { bar: 'bg-amber-500', text: 'text-amber-700', label: 'running hot' },
  blown: { bar: 'bg-red-500', text: 'text-red-600', label: 'over budget' },
};

// One category pacing row: MTD actual vs monthly envelope, with the
// elapsed-time marker so "running hot" is visible at a glance. Tap to see
// the category's transactions.
function CategoryPacing({
  category,
  actual,
  budget,
  elapsed,
  monthStart,
  monthEnd,
}: {
  category: string;
  actual: number;
  budget: number | null;
  elapsed: number;
  monthStart: string;
  monthEnd: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const { data: txData } = useQuery({
    queryKey: ['pacing-txns', category, monthStart],
    enabled: expanded,
    queryFn: async () => {
      const params = new URLSearchParams({
        category, startDate: monthStart, endDate: monthEnd, limit: '200',
      });
      const res = await authedFetch(`/api/expenses?${params}`);
      if (!res.ok) throw new Error('Failed to fetch transactions');
      return res.json();
    },
  });

  const ratio = budget && budget > 0 ? actual / budget : null;
  const status = ratio !== null ? paceStatus(ratio, elapsed) : null;
  const style = status ? STATUS_STYLES[status] : null;

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      <button onClick={() => setExpanded(e => !e)} className="w-full p-3 text-left">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="font-medium text-gray-900 flex items-center gap-1">
            {expanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
            {category}
          </span>
          <span className="text-sm whitespace-nowrap">
            <span className="font-semibold">{fmt(actual)}</span>
            <span className="text-gray-400"> / {budget !== null ? fmt(budget) : '—'}</span>
          </span>
        </div>
        {ratio !== null ? (
          <>
            <div className="relative h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`absolute inset-y-0 left-0 rounded-full ${style!.bar}`}
                style={{ width: `${Math.min(ratio * 100, 100)}%` }}
              />
              {/* elapsed-time marker */}
              <div className="absolute inset-y-0 w-0.5 bg-gray-500/70" style={{ left: `${elapsed * 100}%` }} />
            </div>
            <div className={`text-xs mt-1 ${style!.text}`}>
              {Math.round(ratio * 100)}% spent · {style!.label}
            </div>
          </>
        ) : (
          <div className="text-xs text-gray-400">No budget set</div>
        )}
      </button>
      {expanded && (
        <div className="border-t px-3 py-2 text-sm max-h-64 overflow-y-auto">
          {!txData ? (
            <p className="text-gray-400 py-1">Loading…</p>
          ) : txData.expenses.length === 0 ? (
            <p className="text-gray-400 py-1">No transactions this month.</p>
          ) : (
            txData.expenses.map((e: any) => (
              <div key={e.id} className="flex justify-between gap-2 py-1 border-b last:border-0 border-gray-50">
                <span className="truncate text-gray-700">{e.date.substring(5)} · {e.merchant}</span>
                <span className="whitespace-nowrap font-medium">{fmt(e.amount)}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

interface RadarData {
  new_merchants: Array<{ id: string; date: string; merchant: string; amount: number; category: string | null; account: string | null }>;
  recurring: Array<{ merchant: string; merchant_key: string; median_amount: number; monthly_cost: number; is_new: boolean; first_date: string }>;
  new_recurring: Array<{ merchant: string; median_amount: number; first_date: string }>;
}

const Pacing: React.FC = () => {
  const now = new Date();
  const month = ymLocal(now);
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-31`;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const elapsed = now.getDate() / daysInMonth;
  const weekQuarter = Math.min(Math.floor(elapsed * 4), 3);

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

  const { data: queueData } = useQuery({
    queryKey: ['review-queue-count'],
    queryFn: async () => {
      const res = await authedFetch('/api/expenses/review-queue');
      if (!res.ok) throw new Error('Failed to fetch review queue');
      return res.json();
    },
  });

  const queryClient = useQueryClient();
  const { data: radar } = useQuery<RadarData>({
    queryKey: ['radar'],
    queryFn: async () => {
      const res = await authedFetch('/api/expenses/radar');
      if (!res.ok) throw new Error('Failed to fetch radar');
      return res.json();
    },
  });

  const ackNewMerchant = useMutation({
    mutationFn: async (id: string) => {
      const res = await authedFetch(`/api/expenses/${id}/ack-new-merchant`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to acknowledge');
      return res.json();
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['radar'] });
      const prev = queryClient.getQueryData<RadarData>(['radar']);
      if (prev) {
        queryClient.setQueryData(['radar'], {
          ...prev,
          new_merchants: prev.new_merchants.filter(m => m.id !== id),
        });
      }
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['radar'], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['radar'] }),
  });

  const totalSpend = stats?.totals?.total_amount || 0;
  const totalBudget = envelopes?.total || 0;
  const proRated = totalBudget * elapsed;

  // Categories: union of actuals and envelopes; Discretionary first (that's
  // where week-to-week action is possible), then by envelope size.
  const rows = useMemo(() => {
    const actualByCat: Record<string, number> = {};
    (stats?.by_category || []).forEach((c: any) => { actualByCat[c.category] = c.total; });
    const names = new Set<string>([
      ...Object.keys(actualByCat),
      ...Object.keys(envelopes?.byCategory || {}),
    ]);
    names.delete('Credit Card Payment');
    return [...names]
      .map(name => ({
        name,
        actual: actualByCat[name] || 0,
        budget: envelopes?.byCategory?.[name]?.total ?? null,
      }))
      .sort((a, b) => {
        if ((a.name === 'Discretionary') !== (b.name === 'Discretionary')) {
          return a.name === 'Discretionary' ? -1 : 1;
        }
        return (b.budget ?? b.actual) - (a.budget ?? a.actual);
      });
  }, [stats, envelopes]);

  const reviewCount = queueData?.total || 0;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pacing</h1>
        <p className="text-sm text-gray-500">
          {now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} · day {now.getDate()} of {daysInMonth} · week {weekQuarter + 1} of 4
        </p>
      </div>

      {/* Month progress: 4 week-quarters with total spend vs pro-rated budget */}
      <div className="bg-white rounded-lg shadow-sm border p-4">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-sm text-gray-500">Month spend</span>
          <span className="text-sm">
            <span className="font-bold text-gray-900">{fmt(totalSpend)}</span>
            {totalBudget > 0 && (
              <span className="text-gray-400"> / {fmt(totalBudget)} budgeted</span>
            )}
          </span>
        </div>
        <div className="flex gap-1">
          {[0, 1, 2, 3].map(q => {
            const qStart = q / 4;
            const qFill = Math.max(0, Math.min((elapsed - qStart) * 4, 1));
            return (
              <div key={q} className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-gray-400" style={{ width: `${qFill * 100}%` }} />
              </div>
            );
          })}
        </div>
        {totalBudget > 0 && (
          <p className={`text-xs mt-2 ${totalSpend <= proRated ? 'text-green-700' : 'text-red-600'}`}>
            {totalSpend <= proRated
              ? `${fmt(proRated - totalSpend)} under pace for day ${now.getDate()}`
              : `${fmt(totalSpend - proRated)} over pace for day ${now.getDate()}`}
          </p>
        )}
      </div>

      {/* Radar */}
      {reviewCount > 0 && (
        <Link
          to="/review"
          className="flex items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800"
        >
          <span className="flex items-center gap-2">
            <Inbox className="h-4 w-4" />
            {reviewCount} transaction{reviewCount === 1 ? '' : 's'} to tag
          </span>
          <ChevronRight className="h-4 w-4" />
        </Link>
      )}

      {radar && (radar.new_recurring.length > 0 || radar.new_merchants.length > 0) && (
        <div className="bg-white rounded-lg shadow-sm border p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Radar className="h-4 w-4 text-blue-600" /> New on the radar
          </h2>
          {radar.new_recurring.map(r => (
            <div key={r.merchant} className="flex items-center gap-2 text-sm bg-red-50 border border-red-200 rounded-md p-2.5 text-red-800">
              <Repeat className="h-4 w-4 shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="font-medium">{r.merchant}</span> looks like a new recurring cost
                (~{fmt(r.median_amount)}/charge, since {r.first_date}).
              </span>
            </div>
          ))}
          {radar.new_merchants.map(m => (
            <div key={m.id} className="flex items-center gap-2 text-sm border-b last:border-0 border-gray-50 pb-2 last:pb-0">
              <div className="flex-1 min-w-0">
                <span className="block truncate text-gray-800">
                  {m.merchant} <span className="text-gray-400">· first time seen</span>
                </span>
                <span className="text-xs text-gray-400">{m.date} · {m.category || 'Uncategorized'}</span>
              </div>
              <span className="font-medium whitespace-nowrap">{fmt(m.amount)}</span>
              <button
                onClick={() => ackNewMerchant.mutate(m.id)}
                className="p-1 text-gray-300 hover:text-gray-600"
                title="Got it — remove from radar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <BurnStrip />

      <div className="space-y-2">
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
        {rows.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-6">No spending or budgets yet this month.</p>
        )}
      </div>
    </div>
  );
};

export default Pacing;
