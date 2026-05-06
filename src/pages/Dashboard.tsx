import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Loader2, Quote, TrendingUp, TrendingDown, Wallet, Banknote, Building2, AlertCircle, RefreshCw } from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { useIPS } from '../hooks/usePortfolio';

interface Snapshot {
  net_worth: number;
  assets: { cash: number; investments: number; manual_investments: number; total: number };
  liabilities: { credit: number; student: number; mortgage: number; total: number };
  allocation: Record<'Long' | 'Mid' | 'Short' | 'Core' | 'Unallocated' | 'Cash', number>;
  accounts: Array<{
    id: string;
    institution_name: string;
    name: string;
    mask: string;
    type: string;
    subtype: string;
    balance: number | null;
  }>;
  generated_at: string;
}

interface HistoryPoint {
  date: string;
  net_worth: number;
  total_assets: number;
  total_liabilities: number;
}

const ALLOCATION_COLORS: Record<string, string> = {
  Long: '#2563eb',
  Mid: '#10b981',
  Short: '#f59e0b',
  Core: '#6b7280',
  Unallocated: '#f43f5e',
  Cash: '#94a3b8',
};

const fmt = (n: number | null | undefined) => {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
};

const fmtCompact = (n: number | null | undefined) => {
  if (n == null || isNaN(n)) return '—';
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
};

const Dashboard: React.FC = () => {
  const { data: ips } = useIPS();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [historyDays, setHistoryDays] = useState(90);

  const load = async (days = historyDays) => {
    setLoading(true);
    try {
      const [snap, hist] = await Promise.all([
        axios.get<Snapshot>('/api/snapshot'),
        axios.get<{ points: HistoryPoint[] }>(`/api/snapshot/history?days=${days}`),
      ]);
      setSnapshot(snap.data);
      setHistory(hist.data.points);
    } catch (err) {
      console.error('Failed to load snapshot:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(historyDays); }, [historyDays]);

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

  // Net-worth delta vs the earliest point in the visible window
  const delta = useMemo(() => {
    if (!snapshot || history.length < 2) return null;
    const first = history[0];
    const change = snapshot.net_worth - first.net_worth;
    const pct = first.net_worth !== 0 ? (change / Math.abs(first.net_worth)) * 100 : 0;
    return { amount: change, pct };
  }, [snapshot, history]);

  const allocationData = useMemo(() => {
    if (!snapshot) return [];
    return Object.entries(snapshot.allocation)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }));
  }, [snapshot]);

  if (loading && !snapshot) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Loading snapshot…</span>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="bg-white rounded-lg border border-dashed border-gray-300 p-12 text-center">
        <p className="text-gray-700">No data yet. Connect a Plaid account in <Link to="/investing-settings" className="text-blue-600 hover:underline">Settings</Link>.</p>
      </div>
    );
  }

  const deltaColor = (delta?.amount ?? 0) >= 0 ? 'text-green-600' : 'text-red-600';
  const DeltaIcon = (delta?.amount ?? 0) >= 0 ? TrendingUp : TrendingDown;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">Your full balance sheet — assets, liabilities, and bet allocation, in one place.</p>
        </div>
        <button
          onClick={triggerSync}
          disabled={syncing}
          className="inline-flex items-center px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing…' : 'Sync'}
        </button>
      </div>

      {ips?.investment_philosophy && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-5 border border-blue-200">
          <div className="flex items-start gap-3">
            <Quote className="h-6 w-6 text-blue-500 flex-shrink-0 mt-0.5" />
            <blockquote className="text-base text-gray-800 italic leading-relaxed">"{ips.investment_philosophy}"</blockquote>
          </div>
        </div>
      )}

      {/* Top tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-5 shadow-sm border">
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="h-4 w-4 text-blue-600" />
            <span className="text-xs uppercase tracking-wide text-gray-500">Net Worth</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{fmt(snapshot.net_worth)}</p>
          {delta && (
            <div className={`flex items-center gap-1 mt-1 text-sm ${deltaColor}`}>
              <DeltaIcon className="h-3 w-3" />
              <span className="font-medium">{fmt(delta.amount)} ({delta.pct.toFixed(1)}%)</span>
              <span className="text-gray-400 text-xs ml-1">over {historyDays}d</span>
            </div>
          )}
        </div>
        <div className="bg-white rounded-lg p-5 shadow-sm border">
          <div className="flex items-center gap-2 mb-1">
            <Banknote className="h-4 w-4 text-emerald-600" />
            <span className="text-xs uppercase tracking-wide text-gray-500">Cash</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{fmt(snapshot.assets.cash)}</p>
        </div>
        <div className="bg-white rounded-lg p-5 shadow-sm border">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-green-600" />
            <span className="text-xs uppercase tracking-wide text-gray-500">Invested</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{fmt(snapshot.assets.investments + snapshot.assets.manual_investments)}</p>
          {snapshot.assets.manual_investments > 0 && (
            <p className="text-xs text-gray-500 mt-1">incl. {fmt(snapshot.assets.manual_investments)} off-platform</p>
          )}
        </div>
        <div className="bg-white rounded-lg p-5 shadow-sm border">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="h-4 w-4 text-rose-600" />
            <span className="text-xs uppercase tracking-wide text-gray-500">Liabilities</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{fmt(snapshot.liabilities.total)}</p>
          {snapshot.liabilities.total > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              {snapshot.liabilities.credit > 0 && `${fmt(snapshot.liabilities.credit)} cards`}
              {snapshot.liabilities.mortgage > 0 && ` · ${fmt(snapshot.liabilities.mortgage)} mortgage`}
            </p>
          )}
        </div>
      </div>

      {/* Net worth over time */}
      <div className="bg-white rounded-lg p-6 shadow-sm border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Net Worth Over Time</h2>
          <div className="flex gap-1">
            {[30, 90, 365].map(d => (
              <button
                key={d}
                onClick={() => setHistoryDays(d)}
                className={`px-3 py-1 rounded-md text-xs font-medium ${
                  historyDays === d ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {d === 365 ? '1Y' : `${d}D`}
              </button>
            ))}
          </div>
        </div>
        {history.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-500">
            No history yet. The first snapshot writes after your next sync — come back tomorrow to see your line start.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={history}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#9ca3af" />
              <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 11 }} stroke="#9ca3af" width={70} />
              <Tooltip formatter={(v: number) => fmt(v)} labelStyle={{ color: '#374151' }} />
              <Line type="monotone" dataKey="net_worth" stroke="#2563eb" strokeWidth={2} dot={false} name="Net Worth" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Allocation by bet type + accounts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg p-6 shadow-sm border">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Allocation by Bet</h2>
          {allocationData.length === 0 ? (
            <div className="text-sm text-gray-500 py-8 text-center">No allocated investments yet.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={allocationData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {allocationData.map((entry, idx) => (
                      <Cell key={idx} fill={ALLOCATION_COLORS[entry.name] || '#cbd5e1'} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmt(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {allocationData.map(({ name, value }) => {
                  const pct = snapshot.assets.total > 0 ? (value / snapshot.assets.total) * 100 : 0;
                  return (
                    <div key={name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ALLOCATION_COLORS[name] }} />
                        <span className="text-gray-700">{name}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-medium text-gray-900">{fmt(value)}</span>
                        <span className="text-gray-500 ml-2 text-xs">{pct.toFixed(0)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg p-6 shadow-sm border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-600" /> Account Balances
            </h2>
            <Link to="/account-snapshot" className="text-sm text-blue-600 hover:underline">View all</Link>
          </div>
          {snapshot.accounts.length === 0 ? (
            <div className="text-sm text-gray-500 py-8 text-center">
              No accounts yet. <Link to="/investing-settings" className="text-blue-600 hover:underline">Connect one</Link> to start.
            </div>
          ) : (
            <div className="space-y-2">
              {[...snapshot.accounts]
                .sort((a, b) => (b.balance || 0) - (a.balance || 0))
                .slice(0, 8)
                .map(a => (
                  <div key={a.id} className="flex items-center justify-between text-sm py-1">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate">{a.institution_name}</div>
                      <div className="text-xs text-gray-500 truncate">
                        {a.name}{a.mask && ` ···${a.mask}`} · <span className="capitalize">{a.subtype || a.type}</span>
                      </div>
                    </div>
                    <div className="font-medium text-gray-900 tabular-nums ml-3">{fmt(a.balance)}</div>
                  </div>
                ))}
              {snapshot.accounts.length > 8 && (
                <div className="text-xs text-gray-500 pt-2 border-t mt-2">
                  +{snapshot.accounts.length - 8} more
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
