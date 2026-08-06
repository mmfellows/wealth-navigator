import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Loader2, TrendingUp, Building2, RefreshCw } from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
} from 'recharts';
import { useIPS } from '../hooks/usePortfolio';
import NetWorthHistoryChart, { NetWorthPoint } from '../components/charts/NetWorthHistoryChart';
import { Card, CardHeader, Label, Button, StatCard, fmtUSD } from '../components/ui';
import { cn } from '../lib/cn';

interface Snapshot {
  net_worth: number;
  assets: { cash: number; investments: number; manual_investments: number; total: number };
  liabilities: { credit: number; student: number; mortgage: number; total: number };
  allocation: Record<'Long' | 'Mid' | 'Short' | 'Core' | 'Unallocated' | 'Cash', number>;
  top_holdings?: Array<{
    ticker: string;
    name: string;
    value: number;
    pct_invested: number;
  }>;
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

type HistoryPoint = NetWorthPoint;

// Evergreen allocation palette: violet lead, lime, teal, orange, coral, sand.
const ALLOCATION_COLORS: Record<string, string> = {
  Long: '#8b6ff0',
  Core: '#c9f04e',
  Mid: '#38a790',
  Short: '#efb15b',
  Unallocated: '#eb8f6c',
  Cash: '#7f8a82',
};

const fmt = (n: number | null | undefined) => fmtUSD(n);

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

  const allocationData = useMemo(() => {
    if (!snapshot) return [];
    return Object.entries(snapshot.allocation)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }));
  }, [snapshot]);

  if (loading && !snapshot) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-ever-lime" />
        <span className="ml-3 text-ever-dim">Loading snapshot…</span>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <Card className="border-dashed p-12 text-center text-ever-dim">
        No data yet. Connect a Plaid account in{' '}
        <Link to="/investing-settings" className="text-ever-lime hover:underline">Settings</Link>.
      </Card>
    );
  }

  const invested = snapshot.assets.investments + snapshot.assets.manual_investments;
  const assetsTotal = snapshot.assets.total;
  const cashPct = assetsTotal > 0 ? (snapshot.assets.cash / assetsTotal) * 100 : 0;
  const investedPct = assetsTotal > 0 ? (invested / assetsTotal) * 100 : 0;
  const debtToAsset = assetsTotal > 0 ? (snapshot.liabilities.total / assetsTotal) * 100 : 0;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ever-ink md:text-[26px]">Dashboard</h1>
          <p className="mt-1 text-sm text-ever-dim">Your full balance sheet — assets, liabilities, and bet allocation, in one place.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 font-mono text-[11px] text-ever-dim sm:flex">
            <span className="h-2 w-2 rounded-full bg-ever-lime" aria-hidden="true" />Live
          </span>
          <Button onClick={triggerSync} disabled={syncing}>
            <RefreshCw className={cn('h-4 w-4', syncing && 'animate-spin')} />
            {syncing ? 'Syncing…' : 'Sync'}
          </Button>
        </div>
      </div>

      {/* Hero: net worth + doctrine */}
      <div className="mb-4 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-ever bg-ever-lime p-6 text-ever-lime-ink">
          <div className="flex items-start justify-between">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-[#4c5a24]">Net Worth</span>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-ever-lime-ink text-ever-lime">
              <TrendingUp className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-4 text-[clamp(2.4rem,6vw,3.4rem)] font-extrabold leading-none tracking-tight tabular-nums">
            {fmt(snapshot.net_worth)}
          </div>
          <div className="mt-3 text-[13px] font-semibold text-[#4c5a24]">
            Assets {fmt(assetsTotal)} · Liabilities {fmt(snapshot.liabilities.total)}
          </div>
        </div>

        {ips?.investment_philosophy ? (
          <Card className="flex flex-col">
            <Label>Doctrine</Label>
            <p className="mt-3 text-[19px] font-semibold leading-snug tracking-tight text-ever-ink">
              “{ips.investment_philosophy}”
            </p>
            <div className="mt-auto pt-4 font-mono text-[10.5px] tracking-wide text-ever-dim">Investment policy statement</div>
          </Card>
        ) : (
          <Card className="flex items-center justify-center text-center text-sm text-ever-dim">
            Set your investment philosophy in{' '}
            <Link to="/ips" className="ml-1 text-ever-lime hover:underline">the IPS</Link>.
          </Card>
        )}
      </div>

      {/* KPI tiles */}
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Cash" value={fmt(snapshot.assets.cash)} dot="var(--ever-lime)" sub={`${cashPct.toFixed(1)}% of assets`} />
        <StatCard label="Invested" value={fmt(invested)} dot="var(--ever-violet)" sub={`${investedPct.toFixed(0)}% of assets`} />
        <StatCard label="Liabilities" value={fmt(snapshot.liabilities.total)} dot="var(--ever-neg)" sub={`Debt-to-asset ${debtToAsset.toFixed(0)}%`} />
      </div>

      {/* Net worth over time */}
      <Card className="mb-4">
        <CardHeader
          title="Net Worth Over Time"
          right={
            <div className="flex gap-1">
              {[30, 90, 365].map(d => (
                <button
                  key={d}
                  onClick={() => setHistoryDays(d)}
                  className={cn(
                    'rounded-lg px-3 py-1 font-mono text-[10.5px] tracking-wide transition',
                    historyDays === d
                      ? 'bg-ever-lime font-bold text-ever-lime-ink'
                      : 'border border-ever-line text-ever-dim hover:text-ever-ink',
                  )}
                >
                  {d === 365 ? '1Y' : `${d}D`}
                </button>
              ))}
            </div>
          }
        />
        {history.length === 0 ? (
          <div className="py-12 text-center font-mono text-[11px] text-ever-dim">
            No history yet. The first snapshot writes after your next sync.
          </div>
        ) : (
          <NetWorthHistoryChart points={history} days={historyDays} />
        )}
      </Card>

      {/* Allocation + accounts */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Allocation by Bet" hint={`${fmtUSD(assetsTotal, { compact: true })} invested`} />
          {allocationData.length === 0 ? (
            <div className="py-8 text-center text-sm text-ever-dim">No allocated investments yet.</div>
          ) : (
            <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-2">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={allocationData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={90} paddingAngle={3} stroke="none">
                    {allocationData.map((entry, idx) => (
                      <Cell key={idx} fill={ALLOCATION_COLORS[entry.name] || '#7f8a82'} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => fmt(v)}
                    contentStyle={{ borderRadius: '10px', border: '1px solid #2c4d43', background: '#15221d', color: '#ebf2ec', fontSize: '13px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2.5">
                {allocationData.map(({ name, value }) => {
                  const pct = assetsTotal > 0 ? (value / assetsTotal) * 100 : 0;
                  return (
                    <div key={name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2.5">
                        <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: ALLOCATION_COLORS[name] }} />
                        <span className="text-ever-ink">{name}</span>
                      </div>
                      <div className="text-right tabular-nums">
                        <span className="font-semibold text-ever-ink">{fmt(value)}</span>
                        <span className="ml-2 font-mono text-[11px] text-ever-dim">{pct.toFixed(0)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title={<span className="flex items-center gap-2"><Building2 className="h-4 w-4 text-ever-lime" /> Account Balances</span>}
            right={<Link to="/account-snapshot" className="font-mono text-[10.5px] text-ever-lime hover:underline">View all</Link>}
          />
          {snapshot.accounts.length === 0 ? (
            <div className="py-8 text-center text-sm text-ever-dim">
              No accounts yet. <Link to="/investing-settings" className="text-ever-lime hover:underline">Connect one</Link> to start.
            </div>
          ) : (
            <div>
              {[...snapshot.accounts]
                .map(a => {
                  const isLiability = a.type === 'credit' || a.type === 'loan';
                  const signed = isLiability ? -Math.abs(a.balance || 0) : (a.balance || 0);
                  return { ...a, isLiability, signed };
                })
                .sort((a, b) => b.signed - a.signed)
                .slice(0, 8)
                .map(a => (
                  <div key={a.id} className="flex items-center gap-3 border-t border-ever-line py-2.5 first:border-t-0">
                    <span className={cn('h-2 w-2 flex-none rounded-full', a.isLiability ? 'bg-ever-violet' : 'bg-ever-lime')} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-ever-ink">{a.institution_name}</div>
                      <div className="truncate font-mono text-[10px] uppercase tracking-wide text-ever-dim">
                        {a.name}{a.mask && ` ···${a.mask}`} · {a.subtype || a.type}
                      </div>
                    </div>
                    <div className={cn('ml-3 text-[13px] font-bold tabular-nums', a.isLiability ? 'text-ever-neg' : 'text-ever-ink')}>
                      {fmt(a.signed)}
                    </div>
                  </div>
                ))}
              {snapshot.accounts.length > 8 && (
                <div className="mt-2 border-t border-ever-line pt-2 font-mono text-[10px] text-ever-dim">
                  +{snapshot.accounts.length - 8} more
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Top holdings */}
      {(snapshot.top_holdings?.length ?? 0) > 0 && (
        <Card>
          <CardHeader title="Top Holdings" hint="Share of invested dollars" />
          <div className="space-y-3">
            {snapshot.top_holdings!.map(h => (
              <div key={h.ticker} className="grid grid-cols-[56px_1fr_52px_92px] items-center gap-3 text-sm">
                <div className="truncate font-mono text-[12px] font-bold text-ever-ink" title={h.name}>{h.ticker}</div>
                <div className="h-2.5 overflow-hidden rounded-full bg-ever-track">
                  <div className="h-full rounded-full bg-ever-violet" style={{ width: `${Math.min(h.pct_invested, 100)}%` }} />
                </div>
                <div className="text-right font-bold tabular-nums text-ever-ink">{h.pct_invested.toFixed(1)}%</div>
                <div className="text-right tabular-nums text-ever-dim">{fmt(h.value)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

export default Dashboard;
