import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Loader2, Plus, CheckCircle2, XCircle, Trash2, ArrowUpCircle } from 'lucide-react';
import {
  OptionTrade, OptionStrategy, CloseMethod,
  computeMetrics, realizedPnl, fmtUsd, fmtPctFrac,
} from '../lib/options';
import { Card, CardHeader, Button, StatCard, toast } from '../components/ui';

const inputCls = 'w-full px-3 py-2 rounded-lg bg-ever-bg border border-ever-line text-ever-ink placeholder-ever-faint focus:outline-none focus:border-ever-lime';

interface Coverage {
  shares_by_ticker: Record<string, number>;
  committed_shares: Record<string, number>;
  brokerage_cash: number;
  pledged_cash: number;
}

const STRATEGY_LABEL: Record<OptionStrategy, string> = {
  covered_call: 'Covered Call',
  cash_secured_put: 'Cash-Secured Put',
};

const Options: React.FC = () => {
  const [trades, setTrades] = useState<OptionTrade[]>([]);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Planner form
  const [strategy, setStrategy] = useState<OptionStrategy>('covered_call');
  const [underlying, setUnderlying] = useState('');
  const [contracts, setContracts] = useState('1');
  const [strike, setStrike] = useState('');
  const [premium, setPremium] = useState('');
  const [expiration, setExpiration] = useState('');
  const [notes, setNotes] = useState('');
  const [underlyingPrice, setUnderlyingPrice] = useState<number | null>(null);

  // Close dialog state
  const [closing, setClosing] = useState<OptionTrade | null>(null);
  const [closeMethod, setCloseMethod] = useState<CloseMethod>('expired');
  const [closePrice, setClosePrice] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [tradesRes, covRes] = await Promise.all([
        axios.get<{ trades: OptionTrade[] }>('/api/options'),
        axios.get<Coverage>('/api/options/coverage'),
      ]);
      setTrades(tradesRes.data.trades || []);
      setCoverage(covRes.data);
    } catch (err) {
      console.error('Failed to load options:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Best-effort live price for the planner ticker
  useEffect(() => {
    const t = underlying.trim().toUpperCase();
    if (!t) { setUnderlyingPrice(null); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await axios.get(`/api/stocks/${t}/price`);
        setUnderlyingPrice(res.data.price ?? null);
      } catch {
        setUnderlyingPrice(null);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [underlying]);

  const plan = useMemo(() => {
    const s = Number(strike), p = Number(premium), c = parseInt(contracts, 10);
    if (!(s > 0) || !(p >= 0) || !(c >= 1) || !expiration) return null;
    return computeMetrics({
      strategy, contracts: c, strike: s, premium: p, expiration,
      underlying_price: underlyingPrice,
    });
  }, [strategy, contracts, strike, premium, expiration, underlyingPrice]);

  const planCoverage = useMemo(() => {
    if (!plan || !coverage) return null;
    const t = underlying.trim().toUpperCase();
    if (strategy === 'covered_call') {
      const held = coverage.shares_by_ticker[t] || 0;
      const committed = coverage.committed_shares[t] || 0;
      const free = held - committed;
      return {
        ok: free >= plan.sharesRequired,
        label: `${plan.sharesRequired} shares needed · you hold ${Math.floor(held)}${committed ? ` (${committed} already covering other calls)` : ''}`,
      };
    }
    const freeCash = coverage.brokerage_cash - coverage.pledged_cash;
    return {
      ok: freeCash >= plan.collateral,
      label: `${fmtUsd(plan.collateral)} collateral needed · ${fmtUsd(freeCash)} brokerage cash free${coverage.pledged_cash ? ` (${fmtUsd(coverage.pledged_cash)} pledged to other puts)` : ''}`,
    };
  }, [plan, coverage, strategy, underlying]);

  const saveTrade = async (status: 'planned' | 'open') => {
    if (!plan || saving) return;
    setSaving(true);
    try {
      await axios.post('/api/options', {
        strategy,
        underlying: underlying.trim().toUpperCase(),
        contracts: parseInt(contracts, 10),
        strike: Number(strike),
        premium: Number(premium),
        expiration,
        notes,
        status,
      });
      setUnderlying(''); setStrike(''); setPremium(''); setNotes('');
      await load();
    } catch (err) {
      console.error('Failed to save trade:', err);
      toast.error('Failed to save trade.');
    } finally {
      setSaving(false);
    }
  };

  const promote = async (t: OptionTrade) => {
    await axios.put(`/api/options/${t.id}`, { status: 'open' });
    await load();
  };

  const remove = async (t: OptionTrade) => {
    if (!window.confirm(`Delete ${STRATEGY_LABEL[t.strategy]} on ${t.underlying}?`)) return;
    await axios.delete(`/api/options/${t.id}`);
    await load();
  };

  const submitClose = async () => {
    if (!closing) return;
    try {
      await axios.post(`/api/options/${closing.id}/close`, {
        method: closeMethod,
        close_price: closeMethod === 'bought_back' ? Number(closePrice) : undefined,
      });
      setClosing(null);
      setClosePrice('');
      await load();
    } catch (err) {
      console.error('Failed to close trade:', err);
      toast.error('Failed to close trade.');
    }
  };

  const active = trades.filter(t => t.status !== 'closed');
  const closed = trades.filter(t => t.status === 'closed');
  const premiumCollected = closed.reduce((s, t) => s + (realizedPnl(t) ?? 0), 0);
  const openPremiumAtRisk = active.filter(t => t.status === 'open')
    .reduce((s, t) => s + t.premium * 100 * t.contracts, 0);

  const renderActiveRow = (t: OptionTrade) => {
    const m = computeMetrics(t);
    const itm = t.underlying_price != null && (
      t.strategy === 'covered_call' ? t.underlying_price > t.strike : t.underlying_price < t.strike
    );
    return (
      <tr key={t.id} className="border-t border-ever-line hover:bg-white/5">
        <td className="px-4 py-3">
          <div className="font-mono font-medium text-ever-ink">{t.underlying}</div>
          <div className="text-xs text-ever-dim">{STRATEGY_LABEL[t.strategy]}</div>
        </td>
        <td className="px-4 py-3">
          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs bg-white/5 ${t.status === 'open' ? 'text-ever-pos' : 'text-ever-dim'}`}>
            {t.status}
          </span>
        </td>
        <td className="px-4 py-3 text-right tabular-nums">{fmtUsd(t.strike, 2)}</td>
        <td className="px-4 py-3 text-right tabular-nums">
          {t.underlying_price != null ? (
            <span className={itm ? 'text-ever-orange font-medium' : ''}>{fmtUsd(t.underlying_price, 2)}{itm && ' ITM'}</span>
          ) : '—'}
        </td>
        <td className="px-4 py-3 text-right tabular-nums">{t.expiration}<div className="text-xs text-ever-dim">{m.daysToExpiration}d</div></td>
        <td className="px-4 py-3 text-right tabular-nums">{t.contracts}</td>
        <td className="px-4 py-3 text-right tabular-nums font-medium">{fmtUsd(m.premiumTotal)}</td>
        <td className="px-4 py-3 text-right tabular-nums">{fmtUsd(m.breakeven, 2)}</td>
        <td className="px-4 py-3 text-right tabular-nums">{m.annualizedReturn != null ? fmtPctFrac(m.annualizedReturn) : '—'}</td>
        <td className="px-4 py-3 text-right">
          <div className="flex justify-end gap-2">
            {t.status === 'planned' && (
              <button onClick={() => promote(t)} title="Mark as opened" className="text-ever-pos hover:opacity-80">
                <ArrowUpCircle className="h-4 w-4" />
              </button>
            )}
            {t.status === 'open' && (
              <button onClick={() => { setClosing(t); setCloseMethod('expired'); }} className="text-ever-lime hover:underline text-xs font-medium">
                Close
              </button>
            )}
            <button onClick={() => remove(t)} title="Delete" className="text-ever-faint hover:text-ever-neg">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ever-ink md:text-[26px]">Options</h1>
        <p className="mt-1 text-sm text-ever-dim">Plan and track covered calls and cash-secured puts.</p>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="Premium collected (closed)"
          dot={premiumCollected >= 0 ? 'var(--ever-pos)' : 'var(--ever-neg)'}
          value={<span className={premiumCollected >= 0 ? 'text-ever-pos' : 'text-ever-neg'}>{fmtUsd(premiumCollected)}</span>}
        />
        <StatCard label="Open premium" dot="var(--ever-violet)" value={fmtUsd(openPremiumAtRisk)} />
        <StatCard
          label="Active positions"
          value={<>{active.filter(t => t.status === 'open').length}<span className="text-base font-normal text-ever-dim"> open · {active.filter(t => t.status === 'planned').length} planned</span></>}
        />
      </div>

      {/* Planner */}
      <Card>
        <CardHeader title="Trade Planner" />
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div className="col-span-2">
            <label className="block text-xs text-ever-dim mb-1">Strategy</label>
            <select
              value={strategy}
              onChange={e => setStrategy(e.target.value as OptionStrategy)}
              className={inputCls}
            >
              <option value="covered_call">Covered Call (sell call vs shares)</option>
              <option value="cash_secured_put">Cash-Secured Put (sell put vs cash)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-ever-dim mb-1">Ticker</label>
            <input value={underlying} onChange={e => setUnderlying(e.target.value.toUpperCase())} placeholder="AAPL"
              className={`${inputCls} font-mono`} />
            {underlyingPrice != null && <div className="text-xs text-ever-dim mt-1">now {fmtUsd(underlyingPrice, 2)}</div>}
          </div>
          <div>
            <label className="block text-xs text-ever-dim mb-1">Contracts</label>
            <input type="number" min="1" value={contracts} onChange={e => setContracts(e.target.value)}
              className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-ever-dim mb-1">Strike</label>
            <input type="number" step="0.5" value={strike} onChange={e => setStrike(e.target.value)} placeholder="100"
              className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-ever-dim mb-1">Premium / share</label>
            <input type="number" step="0.01" value={premium} onChange={e => setPremium(e.target.value)} placeholder="2.50"
              className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-ever-dim mb-1">Expiration</label>
            <input type="date" value={expiration} onChange={e => setExpiration(e.target.value)}
              className={inputCls} />
          </div>
          <div className="col-span-2 md:col-span-4">
            <label className="block text-xs text-ever-dim mb-1">Notes / rationale</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Why this trade?"
              className={inputCls} />
          </div>
        </div>

        {plan && (
          <div className="mt-5 grid grid-cols-2 md:grid-cols-5 gap-4 bg-white/5 rounded-lg p-4">
            <div>
              <div className="text-xs text-ever-dim">Premium income</div>
              <div className="font-semibold text-ever-ink tabular-nums">{fmtUsd(plan.premiumTotal)}</div>
            </div>
            <div>
              <div className="text-xs text-ever-dim">{strategy === 'cash_secured_put' ? 'Cash collateral' : 'Shares required'}</div>
              <div className="font-semibold text-ever-ink tabular-nums">
                {strategy === 'cash_secured_put' ? fmtUsd(plan.collateral) : plan.sharesRequired.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-xs text-ever-dim">Breakeven</div>
              <div className="font-semibold text-ever-ink tabular-nums">{fmtUsd(plan.breakeven, 2)}</div>
            </div>
            <div>
              <div className="text-xs text-ever-dim">Return on collateral</div>
              <div className="font-semibold text-ever-ink tabular-nums">{fmtPctFrac(plan.returnOnCollateral)}</div>
            </div>
            <div>
              <div className="text-xs text-ever-dim">Annualized ({plan.daysToExpiration}d)</div>
              <div className="font-semibold text-ever-ink tabular-nums">{plan.annualizedReturn != null ? fmtPctFrac(plan.annualizedReturn) : '—'}</div>
            </div>
            {strategy === 'covered_call' && plan.effectiveSalePrice != null && (
              <div>
                <div className="text-xs text-ever-dim">If assigned, sell at</div>
                <div className="font-semibold text-ever-ink tabular-nums">{fmtUsd(plan.effectiveSalePrice, 2)}</div>
              </div>
            )}
            {strategy === 'cash_secured_put' && plan.discountToCurrentPct != null && (
              <div>
                <div className="text-xs text-ever-dim">Breakeven vs current</div>
                <div className="font-semibold text-ever-ink tabular-nums">{plan.discountToCurrentPct.toFixed(1)}% below</div>
              </div>
            )}
            {planCoverage && (
              <div className="col-span-2 md:col-span-5 flex items-center gap-2 text-sm border-t border-ever-line pt-3 mt-1">
                {planCoverage.ok
                  ? <CheckCircle2 className="h-4 w-4 text-ever-pos flex-shrink-0" />
                  : <XCircle className="h-4 w-4 text-ever-neg flex-shrink-0" />}
                <span className={planCoverage.ok ? 'text-ever-pos' : 'text-ever-neg'}>{planCoverage.label}</span>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex gap-3">
          <Button
            variant="ghost"
            onClick={() => saveTrade('planned')}
            disabled={!plan || !underlying.trim() || saving}
          >
            <Plus className="h-4 w-4" /> Save as planned
          </Button>
          <Button
            onClick={() => saveTrade('open')}
            disabled={!plan || !underlying.trim() || saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Record open trade
          </Button>
        </div>
      </Card>

      {/* Active positions */}
      <div className="rounded-ever border border-ever-line bg-ever-card overflow-hidden">
        <div className="px-6 py-4 border-b border-ever-line">
          <h2 className="text-lg font-semibold text-ever-ink">Open & Planned</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-ever-dim"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Loading…</div>
        ) : active.length === 0 ? (
          <div className="p-8 text-center text-ever-dim">No option positions yet — plan one above.</div>
        ) : (
          <table className="w-full text-sm text-ever-ink">
            <thead className="bg-white/5 text-ever-dim text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2">Position</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-right px-4 py-2">Strike</th>
                <th className="text-right px-4 py-2">Underlying</th>
                <th className="text-right px-4 py-2">Expiry</th>
                <th className="text-right px-4 py-2">Qty</th>
                <th className="text-right px-4 py-2">Premium</th>
                <th className="text-right px-4 py-2">Breakeven</th>
                <th className="text-right px-4 py-2">Ann. return</th>
                <th className="text-right px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>{active.map(renderActiveRow)}</tbody>
          </table>
        )}
      </div>

      {/* Closed */}
      {closed.length > 0 && (
        <div className="rounded-ever border border-ever-line bg-ever-card overflow-hidden">
          <div className="px-6 py-4 border-b border-ever-line">
            <h2 className="text-lg font-semibold text-ever-ink">Closed</h2>
          </div>
          <table className="w-full text-sm text-ever-ink">
            <thead className="bg-white/5 text-ever-dim text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2">Position</th>
                <th className="text-right px-4 py-2">Strike</th>
                <th className="text-right px-4 py-2">Expiry</th>
                <th className="text-right px-4 py-2">Qty</th>
                <th className="text-left px-4 py-2">Outcome</th>
                <th className="text-right px-4 py-2">Realized P&L</th>
              </tr>
            </thead>
            <tbody>
              {closed.map(t => {
                const pnl = realizedPnl(t);
                return (
                  <tr key={t.id} className="border-t border-ever-line hover:bg-white/5">
                    <td className="px-4 py-3">
                      <div className="font-mono font-medium text-ever-ink">{t.underlying}</div>
                      <div className="text-xs text-ever-dim">{STRATEGY_LABEL[t.strategy]}</div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtUsd(t.strike, 2)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{t.expiration}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{t.contracts}</td>
                    <td className="px-4 py-3">
                      <span className="capitalize">{(t.close_method || '').replace('_', ' ')}</span>
                      <span className="text-xs text-ever-dim"> · {t.close_date}</span>
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums font-medium ${pnl != null && pnl >= 0 ? 'text-ever-pos' : 'text-ever-neg'}`}>
                      {fmtUsd(pnl)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Close dialog */}
      {closing && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setClosing(null)}>
          <div className="bg-ever-card border border-ever-line rounded-ever text-ever-ink p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-ever-ink mb-1">
              Close {STRATEGY_LABEL[closing.strategy]} — {closing.underlying} {fmtUsd(closing.strike, 2)}
            </h3>
            <p className="text-sm text-ever-dim mb-4">{closing.contracts} contract{closing.contracts > 1 ? 's' : ''} · exp {closing.expiration}</p>
            <div className="space-y-3">
              {(['expired', 'assigned', 'bought_back'] as CloseMethod[]).map(m => (
                <label key={m} className="flex items-start gap-3 p-3 border border-ever-line rounded-lg cursor-pointer hover:bg-white/5">
                  <input type="radio" checked={closeMethod === m} onChange={() => setCloseMethod(m)} className="mt-1 accent-ever-lime" />
                  <div>
                    <div className="font-medium text-ever-ink capitalize">{m.replace('_', ' ')}</div>
                    <div className="text-xs text-ever-dim">
                      {m === 'expired' && 'Expired worthless — you keep the full premium.'}
                      {m === 'assigned' && (closing.strategy === 'covered_call'
                        ? 'Shares called away at the strike; premium kept.'
                        : 'Shares put to you at the strike; premium kept.')}
                      {m === 'bought_back' && 'You paid to close early.'}
                    </div>
                  </div>
                </label>
              ))}
              {closeMethod === 'bought_back' && (
                <div>
                  <label className="block text-xs text-ever-dim mb-1">Buyback price per share</label>
                  <input type="number" step="0.01" value={closePrice} onChange={e => setClosePrice(e.target.value)}
                    className={inputCls} placeholder="0.50" />
                </div>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setClosing(null)} className="px-4 py-2 text-ever-dim hover:text-ever-ink">Cancel</button>
              <Button
                onClick={submitClose}
                disabled={closeMethod === 'bought_back' && !(Number(closePrice) >= 0 && closePrice !== '')}
              >
                Close trade
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Options;
