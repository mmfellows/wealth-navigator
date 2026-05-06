import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, Zap, PencilLine, RefreshCw } from 'lucide-react';
import axios from 'axios';
import NewTradeModal, { TradeFormData } from '../components/NewTradeModal';

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
  if (/buy/i.test(type)) return 'bg-blue-100 text-blue-800';
  if (/sell/i.test(type)) return 'bg-amber-100 text-amber-800';
  if (/dividend|interest/i.test(type)) return 'bg-emerald-100 text-emerald-800';
  if (/fee|tax/i.test(type)) return 'bg-rose-100 text-rose-800';
  return 'bg-gray-100 text-gray-700';
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
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error) {
    return <div className="text-center py-12 text-red-600">Failed to load trades.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Trade Journal</h1>
          <p className="text-gray-600 mt-1">
            {data?.plaid_count ?? 0} auto-imported · {data?.manual_count ?? 0} manual · {filtered.length} shown
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={triggerSync}
            disabled={syncing}
            className="inline-flex items-center px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing…' : 'Sync'}
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 mr-2" /> Manual Entry
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-gray-500 mr-1">Source</span>
        {(['all', 'plaid', 'manual'] as const).map(s => (
          <button
            key={s}
            onClick={() => setSourceFilter(s)}
            className={`px-3 py-1 rounded-md text-xs font-medium capitalize ${
              sourceFilter === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {s}
          </button>
        ))}
        <span className="text-xs uppercase tracking-wide text-gray-500 ml-4 mr-1">Type</span>
        {(['all', 'buy', 'sell', 'dividend', 'fee', 'other'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`px-3 py-1 rounded-md text-xs font-medium capitalize ${
              typeFilter === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t}
          </button>
        ))}
        <span className="text-xs uppercase tracking-wide text-gray-500 ml-4 mr-1">Window</span>
        {[30, 90, 365, 1825].map(d => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-3 py-1 rounded-md text-xs font-medium ${
              days === d ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {d === 30 ? '30D' : d === 90 ? '90D' : d === 365 ? '1Y' : '5Y'}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-lg border border-dashed border-gray-300 p-12 text-center text-gray-500">
          No trades match these filters.
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr className="text-xs text-gray-500 uppercase tracking-wide">
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
            <tbody className="divide-y divide-gray-100">
              {filtered.map(e => (
                <tr key={`${e.source}-${e.id}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{e.date || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="font-mono font-medium text-gray-900">{e.ticker || '—'}</div>
                    {e.name && <div className="text-xs text-gray-500 truncate max-w-xs" title={e.name}>{e.name}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium capitalize ${typeStyle(e.type)}`}>
                      {e.type || '—'}
                    </span>
                    {e.subtype && <div className="text-xs text-gray-500 mt-0.5">{e.subtype}</div>}
                  </td>
                  <td className="px-4 py-3 text-sm text-right tabular-nums">{fmtQty(e.quantity)}</td>
                  <td className="px-4 py-3 text-sm text-right tabular-nums">{fmt(e.price)}</td>
                  <td className="px-4 py-3 text-sm text-right tabular-nums font-medium">{fmt(e.amount)}</td>
                  <td className="px-4 py-3 text-sm">
                    <div className="text-gray-900">{e.institution_name || '—'}</div>
                    {e.account_name && <div className="text-xs text-gray-500">{e.account_name}</div>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {e.source === 'plaid' ? (
                      <span className="inline-flex items-center text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                        <Zap className="h-3 w-3 mr-1" /> Plaid
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-xs text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full">
                        <PencilLine className="h-3 w-3 mr-1" /> Manual
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
