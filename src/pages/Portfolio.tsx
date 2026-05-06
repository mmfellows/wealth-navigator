import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { TrendingUp, TrendingDown, ChevronDown, ChevronRight, Plus, RefreshCw, Target } from 'lucide-react';

type BetType = 'Long' | 'Mid' | 'Short' | 'Core' | 'Unallocated';

interface HoldingRow {
  source: 'plaid' | 'manual';
  holding_id: string;
  ticker: string;
  name: string;
  type: string;
  quantity: number;
  cost_basis_per_share: number | null;
  cost_basis_total: number | null;
  current_price: number | null;
  current_value: number | null;
  account_name: string;
  account_subtype: string;
  institution_name: string;
  is_retirement: boolean;
}

interface Bucket {
  bet: {
    id: string;
    name: string;
    type: BetType;
    tickers: string[];
    buy_date: string | null;
    target_sell_date: string | null;
    thesis: string;
    status: string;
    is_synthetic: boolean;
  };
  holdings: HoldingRow[];
  cost_basis: number;
  current_value: number;
  pnl: number;
  pnl_pct: number;
}

interface Totals {
  cost_basis: number;
  current_value: number;
  pnl: number;
  pnl_pct: number;
}

const TYPE_COLORS: Record<BetType, string> = {
  Long: 'bg-blue-50 text-blue-700 border-blue-200',
  Mid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Short: 'bg-amber-50 text-amber-700 border-amber-200',
  Core: 'bg-gray-50 text-gray-700 border-gray-200',
  Unallocated: 'bg-rose-50 text-rose-700 border-rose-200',
};

const fmtMoney = (n: number | null | undefined) => {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
};
const fmtMoneyPrecise = (n: number | null | undefined) => {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
};
const fmtPct = (n: number | null | undefined) => {
  if (n == null || isNaN(n)) return '—';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
};

const Portfolio: React.FC = () => {
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get<{ buckets: Bucket[]; totals: Totals }>('/api/portfolio/by-bet');
      setBuckets(res.data.buckets);
      setTotals(res.data.totals);
      // expand non-Core, non-empty buckets by default
      const auto = new Set<string>();
      for (const b of res.data.buckets) {
        if (b.bet.type !== 'Core' && b.holdings.length > 0) auto.add(b.bet.id);
      }
      setExpanded(auto);
    } catch (err) {
      console.error('Failed to load portfolio:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const triggerSync = async () => {
    setSyncing(true);
    try {
      await axios.post('/api/plaid/sync');
      await load();
    } catch (err) {
      console.error('Sync failed:', err);
      alert('Sync failed. Check Plaid connections in Settings.');
    } finally {
      setSyncing(false);
    }
  };

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const summaryColor = (totals?.pnl ?? 0) >= 0 ? 'text-green-600' : 'text-red-600';

  // Group buckets in display order: user bets first (Long/Mid/Short), then Core, then Unallocated
  const ordered = useMemo(() => {
    const order: Record<string, number> = { Long: 0, Mid: 1, Short: 2, Core: 3, Unallocated: 4 };
    return [...buckets].sort((a, b) => (order[a.bet.type] ?? 9) - (order[b.bet.type] ?? 9));
  }, [buckets]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Portfolio</h1>
          <p className="text-gray-600 mt-1">Holdings grouped by bet — your investment thesis layered on real positions.</p>
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
          <Link
            to="/bets"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            <Target className="h-4 w-4 mr-2" /> Manage Bets
          </Link>
        </div>
      </div>

      {/* Top-line totals */}
      {totals && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Current Value</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{fmtMoney(totals.current_value)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Cost Basis</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{fmtMoney(totals.cost_basis)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">P&amp;L</div>
            <div className={`text-2xl font-bold mt-1 ${summaryColor}`}>{fmtMoney(totals.pnl)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Return</div>
            <div className={`text-2xl font-bold mt-1 ${summaryColor}`}>{fmtPct(totals.pnl_pct)}</div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-gray-500">Loading…</div>
      ) : ordered.length === 0 ? (
        <div className="bg-white rounded-lg border border-dashed border-gray-300 p-12 text-center">
          <p className="text-gray-700 font-medium">No holdings yet.</p>
          <p className="text-gray-500 mt-2 text-sm">
            Connect a brokerage in <Link to="/investing-settings" className="text-blue-600 hover:underline">Settings</Link>,
            then come back to see your positions grouped by bet.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {ordered.map(bucket => {
            const isOpen = expanded.has(bucket.bet.id);
            const pnlColor = bucket.pnl >= 0 ? 'text-green-600' : 'text-red-600';
            const PnlIcon = bucket.pnl >= 0 ? TrendingUp : TrendingDown;

            return (
              <div key={bucket.bet.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <button
                  onClick={() => toggle(bucket.bet.id)}
                  className="w-full flex items-center justify-between p-5 hover:bg-gray-50 text-left"
                >
                  <div className="flex items-center gap-3 flex-1">
                    {isOpen ? <ChevronDown className="h-5 w-5 text-gray-400" /> : <ChevronRight className="h-5 w-5 text-gray-400" />}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold text-gray-900">{bucket.bet.name}</h2>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${TYPE_COLORS[bucket.bet.type]}`}>
                          {bucket.bet.type}
                        </span>
                        {bucket.bet.is_synthetic && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                            Auto
                          </span>
                        )}
                      </div>
                      {bucket.bet.tickers.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {bucket.bet.tickers.map(t => (
                            <span key={t} className="text-xs font-mono text-gray-500">{t}</span>
                          ))}
                        </div>
                      )}
                      <div className="text-xs text-gray-500 mt-1">
                        {bucket.holdings.length} {bucket.holdings.length === 1 ? 'holding' : 'holdings'}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-6 text-right">
                    <div>
                      <div className="text-xs text-gray-500">Value</div>
                      <div className="font-semibold text-gray-900">{fmtMoney(bucket.current_value)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Cost</div>
                      <div className="font-semibold text-gray-700">{fmtMoney(bucket.cost_basis)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">P&amp;L</div>
                      <div className={`font-semibold flex items-center justify-end ${pnlColor}`}>
                        <PnlIcon className="h-3 w-3 mr-1" />
                        {fmtMoney(bucket.pnl)} ({fmtPct(bucket.pnl_pct)})
                      </div>
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100">
                    {bucket.holdings.length === 0 ? (
                      <div className="p-6 text-center text-sm text-gray-500">
                        No positions yet. {bucket.bet.status === 'planned' && 'This is a planned bet — buy in to start tracking.'}
                      </div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                          <tr>
                            <th className="text-left px-5 py-2">Ticker</th>
                            <th className="text-left px-5 py-2">Account</th>
                            <th className="text-right px-5 py-2">Qty</th>
                            <th className="text-right px-5 py-2">Price</th>
                            <th className="text-right px-5 py-2">Value</th>
                            <th className="text-right px-5 py-2">Cost</th>
                            <th className="text-right px-5 py-2 pr-5">P&amp;L</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bucket.holdings.map(h => {
                            const pnl = (h.current_value ?? 0) - (h.cost_basis_total ?? 0);
                            const pnlClass = pnl >= 0 ? 'text-green-600' : 'text-red-600';
                            return (
                              <tr key={h.holding_id} className="border-t border-gray-100">
                                <td className="px-5 py-3">
                                  <div className="font-mono font-medium text-gray-900">{h.ticker || '—'}</div>
                                  <div className="text-xs text-gray-500">{h.name}</div>
                                </td>
                                <td className="px-5 py-3">
                                  <div className="text-gray-900">{h.institution_name || h.account_name}</div>
                                  <div className="text-xs text-gray-500">
                                    {h.account_name}{h.account_subtype && ` · ${h.account_subtype}`}
                                    {h.source === 'manual' && ' · manual'}
                                  </div>
                                </td>
                                <td className="px-5 py-3 text-right tabular-nums">{h.quantity?.toLocaleString() ?? '—'}</td>
                                <td className="px-5 py-3 text-right tabular-nums">{fmtMoneyPrecise(h.current_price)}</td>
                                <td className="px-5 py-3 text-right tabular-nums font-medium">{fmtMoneyPrecise(h.current_value)}</td>
                                <td className="px-5 py-3 text-right tabular-nums text-gray-500">{fmtMoneyPrecise(h.cost_basis_total)}</td>
                                <td className={`px-5 py-3 text-right tabular-nums font-medium pr-5 ${pnlClass}`}>
                                  {fmtMoneyPrecise(pnl)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}

                    {bucket.bet.type === 'Unallocated' && bucket.holdings.length > 0 && (
                      <div className="px-5 py-3 bg-rose-50 border-t border-rose-100 text-sm text-rose-800 flex items-center justify-between">
                        <span>These holdings aren't part of any bet yet.</span>
                        <Link to="/bets" className="font-medium hover:underline inline-flex items-center">
                          <Plus className="h-3 w-3 mr-1" /> Create a bet
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Portfolio;
