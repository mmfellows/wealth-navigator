import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, Zap, PencilLine, RefreshCw } from 'lucide-react';
import axios from 'axios';
import NewTradeModal, { TradeFormData } from '../components/NewTradeModal';
import { Card, Button } from '../components/ui';
import { cn } from '../lib/cn';

const API_BASE = '/api';

interface JournalEntry {
  source: 'manual' | 'plaid';
  id: string;
  date: string;
  ticker: string;
  name: string;
  type: string;
  subtype: string;
  quantity: number | null;
  price: number | null;
  amount: number | null;
  fees: number | null;
  account_name: string;
  institution_name: string;
  rationale: string;
}

interface JournalResponse {
  entries: JournalEntry[];
  manual_count: number;
  plaid_count: number;
}

type SourceFilter = 'all' | 'manual' | 'plaid';
type TypeFilter = 'all' | 'buy' | 'sell' | 'dividend' | 'fee' | 'other';

const fmt = (n: number | null | undefined) => {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
};
const fmtQty = (n: number | null | undefined) => {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
};

const TYPE_BUCKETS: Record<TypeFilter, (t: string) => boolean> = {
  all: () => true,
  buy: (t) => /buy/i.test(t),
  sell: (t) => /sell/i.test(t),
  dividend: (t) => /dividend|interest|cash/i.test(t),
  fee: (t) => /fee|tax/i.test(t),
  other: (t) => !/buy|sell|dividend|interest|cash|fee|tax/i.test(t),
};

const typeStyle = (type: string) => {
  if (/buy/i.test(type)) return 'bg-white/5 text-ever-lime';
  if (/sell/i.test(type)) return 'bg-white/5 text-ever-orange';
  if (/dividend|interest/i.test(type)) return 'bg-white/5 text-ever-pos';
  if (/fee|tax/i.test(type)) return 'bg-white/5 text-ever-neg';
  return 'bg-white/5 text-ever-dim';
};

const TradeJournal: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [days, setDays] = useState(365);
  const [syncing, setSyncing] = useState(false);

  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<JournalResponse>({
    queryKey: ['trade-journal', days],
    queryFn: async () => {
      const { data } = await axios.get<JournalResponse>(`${API_BASE}/trades/journal?days=${days}`);
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (trade: TradeFormData) => {
      const { data } = await axios.post(`${API_BASE}/trades`, trade);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trade-journal'] });
      setIsModalOpen(false);
    },
  });

  const triggerSync = async () => {
    setSyncing(true);
    try {
      await axios.post('/api/plaid/sync');
      queryClient.invalidateQueries({ queryKey: ['trade-journal'] });
    } catch (err) {
      console.error(err);
    } finally {
      setSyncing(false);
    }
  };

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.entries.filter(e => {
      if (sourceFilter !== 'all' && e.source !== sourceFilter) return false;
      if (!TYPE_BUCKETS[typeFilter](e.type || '')) return false;
      return true;
    });
  }, [data, sourceFilter, typeFilter]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-ever-lime" />
      </div>
    );
  }

  if (error) {
    return <div className="text-center py-12 text-ever-neg">Failed to load trades.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ever-ink md:text-[26px]">Trade Journal</h1>
          <p className="mt-1 text-sm text-ever-dim">
            {data?.plaid_count ?? 0} auto-imported · {data?.manual_count ?? 0} manual · {filtered.length} shown
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={triggerSync} disabled={syncing}>
            <RefreshCw className={cn('h-4 w-4', syncing && 'animate-spin')} />
            {syncing ? 'Syncing…' : 'Sync'}
          </Button>
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus className="h-4 w-4" /> Manual Entry
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10.5px] uppercase tracking-wide text-ever-dim mr-1">Source</span>
        {(['all', 'plaid', 'manual'] as const).map(s => (
          <button
            key={s}
            onClick={() => setSourceFilter(s)}
            className={cn(
              'rounded-lg px-3 py-1 text-xs font-medium capitalize transition',
              sourceFilter === s
                ? 'bg-ever-lime font-bold text-ever-lime-ink'
                : 'border border-ever-line text-ever-dim hover:text-ever-ink',
            )}
          >
            {s}
          </button>
        ))}
        <span className="font-mono text-[10.5px] uppercase tracking-wide text-ever-dim ml-4 mr-1">Type</span>
        {(['all', 'buy', 'sell', 'dividend', 'fee', 'other'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={cn(
              'rounded-lg px-3 py-1 text-xs font-medium capitalize transition',
              typeFilter === t
                ? 'bg-ever-lime font-bold text-ever-lime-ink'
                : 'border border-ever-line text-ever-dim hover:text-ever-ink',
            )}
          >
            {t}
          </button>
        ))}
        <span className="font-mono text-[10.5px] uppercase tracking-wide text-ever-dim ml-4 mr-1">Window</span>
        {[30, 90, 365, 1825].map(d => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={cn(
              'rounded-lg px-3 py-1 text-xs font-medium transition',
              days === d
                ? 'bg-ever-lime font-bold text-ever-lime-ink'
                : 'border border-ever-line text-ever-dim hover:text-ever-ink',
            )}
          >
            {d === 30 ? '30D' : d === 90 ? '90D' : d === 365 ? '1Y' : '5Y'}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card className="border-dashed p-12 text-center text-ever-dim">
          No trades match these filters.
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="min-w-full divide-y divide-ever-line">
            <thead>
              <tr className="font-mono text-[10.5px] uppercase tracking-wide text-ever-dim">
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Ticker</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-left">Account</th>
                <th className="px-4 py-3 text-center">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ever-line">
              {filtered.map(e => (
                <tr key={`${e.source}-${e.id}`} className="hover:bg-white/5">
                  <td className="px-4 py-3 text-sm text-ever-dim whitespace-nowrap">{e.date || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="font-mono font-medium text-ever-ink">{e.ticker || '—'}</div>
                    {e.name && <div className="text-xs text-ever-dim truncate max-w-xs" title={e.name}>{e.name}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('inline-block text-xs px-2 py-0.5 rounded-full font-medium capitalize', typeStyle(e.type))}>
                      {e.type || '—'}
                    </span>
                    {e.subtype && <div className="text-xs text-ever-dim mt-0.5">{e.subtype}</div>}
                  </td>
                  <td className="px-4 py-3 text-sm text-right tabular-nums text-ever-ink">{fmtQty(e.quantity)}</td>
                  <td className="px-4 py-3 text-sm text-right tabular-nums text-ever-ink">{fmt(e.price)}</td>
                  <td className="px-4 py-3 text-sm text-right tabular-nums font-medium text-ever-ink">{fmt(e.amount)}</td>
                  <td className="px-4 py-3 text-sm">
                    <div className="text-ever-ink">{e.institution_name || '—'}</div>
                    {e.account_name && <div className="text-xs text-ever-dim">{e.account_name}</div>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {e.source === 'plaid' ? (
                      <span className="inline-flex items-center text-xs text-ever-lime bg-white/5 px-2 py-0.5 rounded-full">
                        <Zap className="h-3 w-3 mr-1" /> Plaid
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-xs text-ever-dim bg-white/5 px-2 py-0.5 rounded-full">
                        <PencilLine className="h-3 w-3 mr-1" /> Manual
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <NewTradeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={(t) => createMutation.mutate(t)}
      />
    </div>
  );
};

export default TradeJournal;
