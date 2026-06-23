import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import {
  Loader2, Eye, EyeOff, RefreshCw, TrendingUp, TrendingDown,
  Landmark, LineChart, CreditCard, Wallet, ChevronRight,
} from 'lucide-react';

// Mobile-first "check my net worth" page. Standalone (no desktop sidebar) and
// reuses the same /api/snapshot data the Dashboard uses, so the numbers agree.

interface Account {
  id: string;
  institution_name: string;
  name: string;
  mask: string;
  type: string;
  subtype: string;
  balance: number | null;
}

interface Snapshot {
  net_worth: number;
  assets: { cash: number; investments: number; manual_investments: number; total: number };
  liabilities: { credit: number; student: number; mortgage: number; total: number };
  accounts: Account[];
  generated_at: string;
}

interface HistoryPoint {
  date: string;
  net_worth: number;
}

const fmt = (n: number | null | undefined) => {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
};

// Plaid account `type` → how we present it. Credit/loan are money owed.
const LIABILITY_TYPES = new Set(['credit', 'loan']);

const typeMeta = (type: string): { label: string; icon: typeof Landmark } => {
  switch (type) {
    case 'depository': return { label: 'Bank', icon: Landmark };
    case 'investment': return { label: 'Brokerage', icon: LineChart };
    case 'credit': return { label: 'Credit', icon: CreditCard };
    case 'loan': return { label: 'Loan', icon: CreditCard };
    default: return { label: type || 'Account', icon: Wallet };
  }
};

interface Institution {
  name: string;
  subtotal: number;
  accounts: Account[];
}

const MobileNetWorth: React.FC = () => {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(false);
  const [hidden, setHidden] = useState(() => localStorage.getItem('networth_hidden') === 'true');

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const [snap, hist] = await Promise.all([
        axios.get<Snapshot>('/api/snapshot'),
        axios.get<{ points: HistoryPoint[] }>('/api/snapshot/history?days=30'),
      ]);
      setSnapshot(snap.data);
      setHistory(hist.data.points);
    } catch (err) {
      console.error('Failed to load snapshot:', err);
      setError(true);
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
      alert('Sync failed. Check your connections in Settings.');
    } finally {
      setSyncing(false);
    }
  };

  const toggleHidden = () => {
    setHidden(prev => {
      localStorage.setItem('networth_hidden', String(!prev));
      return !prev;
    });
  };

  // 30-day net-worth delta, same idea as the Dashboard.
  const delta = useMemo(() => {
    if (!snapshot || history.length < 2) return null;
    const first = history[0];
    const change = snapshot.net_worth - first.net_worth;
    const pct = first.net_worth !== 0 ? (change / Math.abs(first.net_worth)) * 100 : 0;
    return { amount: change, pct };
  }, [snapshot, history]);

  // Group accounts by institution; liabilities count against the subtotal.
  const institutions = useMemo<Institution[]>(() => {
    if (!snapshot) return [];
    const byName = new Map<string, Institution>();
    for (const a of snapshot.accounts) {
      const name = a.institution_name || 'Other';
      if (!byName.has(name)) byName.set(name, { name, subtotal: 0, accounts: [] });
      const group = byName.get(name)!;
      group.accounts.push(a);
      const bal = a.balance || 0;
      group.subtotal += LIABILITY_TYPES.has(a.type) ? -bal : bal;
    }
    for (const g of byName.values()) {
      g.accounts.sort((x, y) => (y.balance || 0) - (x.balance || 0));
    }
    return [...byName.values()].sort((x, y) => y.subtotal - x.subtotal);
  }, [snapshot]);

  const mask = (n: number | null | undefined) => (hidden ? '••••••' : fmt(n));

  if (loading && !snapshot) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Loading…</span>
      </div>
    );
  }

  if (error && !snapshot) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6 text-center">
        <p className="text-gray-700 mb-4">Couldn’t load your net worth.</p>
        <button onClick={load} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium">
          Try again
        </button>
      </div>
    );
  }

  if (!snapshot) return null;

  const invested = snapshot.assets.investments + snapshot.assets.manual_investments;
  const DeltaIcon = (delta?.amount ?? 0) >= 0 ? TrendingUp : TrendingDown;
  const deltaColor = (delta?.amount ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300';
  const updated = new Date(snapshot.generated_at).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });

  return (
    <div className="min-h-screen bg-gray-50 pb-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      {/* Hero */}
      <header className="bg-gradient-to-br from-blue-700 to-teal-700 text-white px-5 pt-6 pb-8 rounded-b-3xl shadow-lg">
        <div className="flex items-center justify-between mb-6">
          <span className="text-sm font-medium tracking-wide text-blue-100">Net Worth</span>
          <div className="flex items-center gap-1">
            <button
              onClick={toggleHidden}
              aria-label={hidden ? 'Show balances' : 'Hide balances'}
              className="p-2 rounded-full hover:bg-white/10 active:bg-white/20"
            >
              {hidden ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
            <button
              onClick={triggerSync}
              disabled={syncing}
              aria-label="Sync"
              className="p-2 rounded-full hover:bg-white/10 active:bg-white/20 disabled:opacity-50"
            >
              <RefreshCw className={`h-5 w-5 ${syncing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <p className="text-5xl font-bold tracking-tight tabular-nums">{mask(snapshot.net_worth)}</p>

        {delta && !hidden && (
          <div className={`flex items-center gap-1 mt-3 text-sm ${deltaColor}`}>
            <DeltaIcon className="h-4 w-4" />
            <span className="font-semibold tabular-nums">{fmt(delta.amount)}</span>
            <span className="tabular-nums">({delta.pct.toFixed(1)}%)</span>
            <span className="text-blue-100/80 ml-1">past 30 days</span>
          </div>
        )}

        {/* Breakdown chips */}
        <div className="grid grid-cols-3 gap-3 mt-6">
          <div className="bg-white/10 rounded-xl px-3 py-2.5 backdrop-blur-sm">
            <p className="text-xs text-blue-100">Cash</p>
            <p className="text-base font-semibold tabular-nums">{mask(snapshot.assets.cash)}</p>
          </div>
          <div className="bg-white/10 rounded-xl px-3 py-2.5 backdrop-blur-sm">
            <p className="text-xs text-blue-100">Invested</p>
            <p className="text-base font-semibold tabular-nums">{mask(invested)}</p>
          </div>
          <div className="bg-white/10 rounded-xl px-3 py-2.5 backdrop-blur-sm">
            <p className="text-xs text-blue-100">Owed</p>
            <p className="text-base font-semibold tabular-nums">{mask(snapshot.liabilities.total)}</p>
          </div>
        </div>
      </header>

      {/* Accounts by institution */}
      <main className="px-4 mt-5 space-y-4">
        {institutions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
            No accounts yet. Connect a bank or brokerage in Settings.
          </div>
        ) : (
          institutions.map(inst => (
            <section key={inst.name} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900 truncate">{inst.name}</h2>
                <span className="font-semibold text-gray-900 tabular-nums ml-3">{mask(inst.subtotal)}</span>
              </div>
              <ul className="divide-y divide-gray-50">
                {inst.accounts.map(a => {
                  const meta = typeMeta(a.type);
                  const Icon = meta.icon;
                  const isLiability = LIABILITY_TYPES.has(a.type);
                  return (
                    <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                      <div className={`p-2 rounded-lg ${isLiability ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{a.name}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {meta.label}{a.mask && ` ···${a.mask}`}
                        </p>
                      </div>
                      <span className={`text-sm font-semibold tabular-nums ${isLiability ? 'text-rose-600' : 'text-gray-900'}`}>
                        {hidden ? '••••' : `${isLiability ? '−' : ''}${fmt(a.balance)}`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}

        <div className="flex items-center justify-between pt-1 px-1">
          <span className="text-xs text-gray-400">Updated {updated}</span>
          <Link to="/" className="text-xs text-blue-600 font-medium flex items-center">
            Full dashboard <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      </main>
    </div>
  );
};

export default MobileNetWorth;
