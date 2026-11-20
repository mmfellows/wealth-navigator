import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authedFetch } from '../services/authRedirect';
import { BurnStrip } from '../components/BurnStrip';
import { CategoryPacing } from '../components/CategoryPacing';
import { Inbox, ChevronRight, Radar, Repeat, X } from 'lucide-react';

const fmt = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function ymLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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
        <h1 className="text-2xl font-bold text-ever-ink">Pacing</h1>
        <p className="text-sm text-ever-dim">
          {now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} · day {now.getDate()} of {daysInMonth} · week {weekQuarter + 1} of 4
        </p>
      </div>

      {/* Month progress: 4 week-quarters with total spend vs pro-rated budget */}
      <div className="bg-ever-card rounded-ever border border-ever-line p-4">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-sm text-ever-dim">Month spend</span>
          <span className="text-sm">
            <span className="font-bold text-ever-ink">{fmt(totalSpend)}</span>
            {totalBudget > 0 && (
              <span className="text-ever-faint"> / {fmt(totalBudget)} budgeted</span>
            )}
          </span>
        </div>
        <div className="flex gap-1">
          {[0, 1, 2, 3].map(q => {
            const qStart = q / 4;
            const qFill = Math.max(0, Math.min((elapsed - qStart) * 4, 1));
            return (
              <div key={q} className="flex-1 h-2.5 bg-ever-track rounded-full overflow-hidden">
                <div className="h-full bg-ever-dim" style={{ width: `${qFill * 100}%` }} />
              </div>
            );
          })}
        </div>
        {totalBudget > 0 && (
          <p className={`text-xs mt-2 ${totalSpend <= proRated ? 'text-ever-pos' : 'text-ever-neg'}`}>
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
          className="flex items-center justify-between gap-2 bg-ever-orange/10 border border-ever-orange/30 rounded-lg p-3 text-sm text-ever-orange"
        >
          <span className="flex items-center gap-2">
            <Inbox className="h-4 w-4" />
            {reviewCount} transaction{reviewCount === 1 ? '' : 's'} to tag
          </span>
          <ChevronRight className="h-4 w-4" />
        </Link>
      )}

      {radar && (radar.new_recurring.length > 0 || radar.new_merchants.length > 0) && (
        <div className="bg-ever-card rounded-ever border border-ever-line p-4 space-y-3">
          <h2 className="text-sm font-semibold text-ever-ink flex items-center gap-2">
            <Radar className="h-4 w-4 text-ever-lime" /> New on the radar
          </h2>
          {radar.new_recurring.map(r => (
            <div key={r.merchant} className="flex items-center gap-2 text-sm bg-ever-neg/10 border border-ever-neg/30 rounded-md p-2.5 text-ever-neg">
              <Repeat className="h-4 w-4 shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="font-medium">{r.merchant}</span> looks like a new recurring cost
                (~{fmt(r.median_amount)}/charge, since {r.first_date}).
              </span>
            </div>
          ))}
          {radar.new_merchants.map(m => (
            <div key={m.id} className="flex items-center gap-2 text-sm border-b last:border-0 border-ever-line/50 pb-2 last:pb-0">
              <div className="flex-1 min-w-0">
                <span className="block truncate text-ever-ink">
                  {m.merchant} <span className="text-ever-faint">· first time seen</span>
                </span>
                <span className="text-xs text-ever-faint">{m.date} · {m.category || 'Uncategorized'}</span>
              </div>
              <span className="font-medium whitespace-nowrap">{fmt(m.amount)}</span>
              <button
                onClick={() => ackNewMerchant.mutate(m.id)}
                className="p-1 text-ever-faint hover:text-ever-ink"
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
          <p className="text-sm text-ever-faint text-center py-6">No spending or budgets yet this month.</p>
        )}
      </div>
    </div>
  );
};

export default Pacing;
