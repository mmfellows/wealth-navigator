import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { ChevronDown, ChevronRight } from 'lucide-react';

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
  bet: { id: string };
  holdings: HoldingRow[];
}

interface TickerGroup {
  key: string;
  ticker: string;
  name: string;
  quantity: number;
  current_value: number;
  cost_basis_total: number;
  current_price: number | null;
  accounts: HoldingRow[];
}

const fmtMoney = (n: number | null | undefined) => {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
};
const fmtQty = (n: number | null | undefined) => {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
};
const fmtPct = (n: number | null | undefined) => {
  if (n == null || isNaN(n)) return '—';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
};

const isCash = (h: HoldingRow) =>
  (h.type || '').toLowerCase() === 'cash' || (h.ticker || '').toUpperCase().startsWith('CUR:');

const cashCurrency = (h: HoldingRow): string => {
  const t = (h.ticker || '').toUpperCase();
  if (t.startsWith('CUR:')) return t.slice(4);
  return 'USD';
};

type SortKey = 'ticker' | 'account' | 'quantity' | 'current_price' | 'current_value' | 'cost_basis_total' | 'pnl';

const Holdings: React.FC = () => {
  const [rows, setRows] = useState<HoldingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [grouped, setGrouped] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('current_value');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get<{ buckets: Bucket[] }>('/api/portfolio/by-bet');
        const seen = new Set<string>();
        const flat: HoldingRow[] = [];
        for (const b of res.data.buckets) {
          for (const h of b.holdings) {
            if (seen.has(h.holding_id)) continue;
            seen.add(h.holding_id);
            flat.push(h);
          }
        }
        setRows(flat);
      } catch (err) {
        console.error('Failed to load holdings:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const { investments, cash } = useMemo(() => {
    const investments: HoldingRow[] = [];
    const cash: HoldingRow[] = [];
    for (const h of rows) (isCash(h) ? cash : investments).push(h);
    return { investments, cash };
  }, [rows]);

  const groups = useMemo<TickerGroup[]>(() => {
    const map = new Map<string, TickerGroup>();
    for (const h of investments) {
      const key = h.ticker ? h.ticker.toUpperCase() : `__no_ticker__${h.holding_id}`;
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          ticker: h.ticker || '',
          name: h.name,
          quantity: 0,
          current_value: 0,
          cost_basis_total: 0,
          current_price: null,
          accounts: [],
        };
        map.set(key, g);
      }
      g.quantity += h.quantity ?? 0;
      g.current_value += h.current_value ?? 0;
      g.cost_basis_total += h.cost_basis_total ?? 0;
      g.accounts.push(h);
    }
    for (const g of map.values()) {
      g.current_price = g.quantity > 0 ? g.current_value / g.quantity : null;
    }
    return Array.from(map.values());
  }, [investments]);

  const sortedFlat = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const getVal = (h: HoldingRow): string | number => {
      switch (sortKey) {
        case 'ticker': return h.ticker || '';
        case 'account': return h.institution_name || h.account_name || '';
        case 'quantity': return h.quantity ?? 0;
        case 'current_price': return h.current_price ?? 0;
        case 'current_value': return h.current_value ?? 0;
        case 'cost_basis_total': return h.cost_basis_total ?? 0;
        case 'pnl': return (h.current_value ?? 0) - (h.cost_basis_total ?? 0);
      }
    };
    return [...investments].sort((a, b) => {
      const av = getVal(a), bv = getVal(b);
      if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
  }, [investments, sortKey, sortDir]);

  const sortedGroups = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const getVal = (g: TickerGroup): string | number => {
      switch (sortKey) {
        case 'ticker': return g.ticker || '';
        case 'account': return g.accounts.length;
        case 'quantity': return g.quantity;
        case 'current_price': return g.current_price ?? 0;
        case 'current_value': return g.current_value;
        case 'cost_basis_total': return g.cost_basis_total;
        case 'pnl': return g.current_value - g.cost_basis_total;
      }
    };
    return [...groups].sort((a, b) => {
      const av = getVal(a), bv = getVal(b);
      if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
  }, [groups, sortKey, sortDir]);

  const totals = useMemo(() => {
    const sum = (arr: HoldingRow[]) => {
      let value = 0, cost = 0;
      for (const h of arr) {
        value += h.current_value ?? 0;
        cost += h.cost_basis_total ?? 0;
      }
      return { value, cost };
    };
    const inv = sum(investments);
    const cashTotal = sum(cash).value;
    const invPnl = inv.value - inv.cost;
    const invPnlPct = inv.cost > 0 ? (invPnl / inv.cost) * 100 : 0;
    return {
      invValue: inv.value,
      invCost: inv.cost,
      invPnl,
      invPnlPct,
      cashValue: cashTotal,
      grandTotal: inv.value + cashTotal,
    };
  }, [investments, cash]);

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'ticker' || key === 'account' ? 'asc' : 'desc');
    }
  };

  const arrow = (key: SortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  const toggleGroup = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const renderFlatRow = (h: HoldingRow) => {
    const pnl = (h.current_value ?? 0) - (h.cost_basis_total ?? 0);
    const pnlClass = pnl >= 0 ? 'text-green-600' : 'text-red-600';
    const pnlPct = (h.cost_basis_total ?? 0) > 0 ? (pnl / (h.cost_basis_total as number)) * 100 : null;
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
        <td className="px-5 py-3 text-right tabular-nums">{fmtQty(h.quantity)}</td>
        <td className="px-5 py-3 text-right tabular-nums">{fmtMoney(h.current_price)}</td>
        <td className="px-5 py-3 text-right tabular-nums font-medium">{fmtMoney(h.current_value)}</td>
        <td className="px-5 py-3 text-right tabular-nums text-gray-500">{fmtMoney(h.cost_basis_total)}</td>
        <td className={`px-5 py-3 text-right tabular-nums font-medium pr-5 ${pnlClass}`}>
          {fmtMoney(pnl)}
          {pnlPct != null && <div className="text-xs font-normal">{fmtPct(pnlPct)}</div>}
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Holdings</h1>
          <p className="text-gray-600 mt-1">Every position across every account.</p>
        </div>
        <label className="inline-flex items-center text-sm text-gray-700 select-none">
          <input
            type="checkbox"
            className="h-4 w-4 mr-2 rounded border-gray-300"
            checked={grouped}
            onChange={(e) => setGrouped(e.target.checked)}
          />
          Group by ticker
        </label>
      </div>

      {loading ? (
        <div className="text-gray-500">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-lg border border-dashed border-gray-300 p-12 text-center text-gray-500">
          No holdings yet.
        </div>
      ) : (
        <>
          {/* Investments */}
          {investments.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Investments</h2>
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <tr>
                      <th className="text-left px-5 py-2 cursor-pointer select-none" onClick={() => onSort('ticker')}>Ticker{arrow('ticker')}</th>
                      <th className="text-left px-5 py-2 cursor-pointer select-none" onClick={() => onSort('account')}>
                        {grouped ? 'Accounts' : 'Account'}{arrow('account')}
                      </th>
                      <th className="text-right px-5 py-2 cursor-pointer select-none" onClick={() => onSort('quantity')}>Shares{arrow('quantity')}</th>
                      <th className="text-right px-5 py-2 cursor-pointer select-none" onClick={() => onSort('current_price')}>Price{arrow('current_price')}</th>
                      <th className="text-right px-5 py-2 cursor-pointer select-none" onClick={() => onSort('current_value')}>Value{arrow('current_value')}</th>
                      <th className="text-right px-5 py-2 cursor-pointer select-none" onClick={() => onSort('cost_basis_total')}>Cost{arrow('cost_basis_total')}</th>
                      <th className="text-right px-5 py-2 pr-5 cursor-pointer select-none" onClick={() => onSort('pnl')}>P&amp;L{arrow('pnl')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouped
                      ? sortedGroups.map(g => {
                          const pnl = g.current_value - g.cost_basis_total;
                          const pnlClass = pnl >= 0 ? 'text-green-600' : 'text-red-600';
                          const pnlPct = g.cost_basis_total > 0 ? (pnl / g.cost_basis_total) * 100 : null;
                          const multi = g.accounts.length > 1;
                          const isOpen = expanded.has(g.key);
                          return (
                            <React.Fragment key={g.key}>
                              <tr
                                className={`border-t border-gray-100 ${multi ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                                onClick={() => multi && toggleGroup(g.key)}
                              >
                                <td className="px-5 py-3">
                                  <div className="flex items-center gap-1">
                                    {multi ? (
                                      isOpen ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />
                                    ) : (
                                      <span className="w-4" />
                                    )}
                                    <div>
                                      <div className="font-mono font-medium text-gray-900">{g.ticker || '—'}</div>
                                      <div className="text-xs text-gray-500">{g.name}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-5 py-3">
                                  {multi ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700 border border-gray-200">
                                      {g.accounts.length} accounts
                                    </span>
                                  ) : (
                                    <>
                                      <div className="text-gray-900">{g.accounts[0].institution_name || g.accounts[0].account_name}</div>
                                      <div className="text-xs text-gray-500">
                                        {g.accounts[0].account_name}{g.accounts[0].account_subtype && ` · ${g.accounts[0].account_subtype}`}
                                        {g.accounts[0].source === 'manual' && ' · manual'}
                                      </div>
                                    </>
                                  )}
                                </td>
                                <td className="px-5 py-3 text-right tabular-nums">{fmtQty(g.quantity)}</td>
                                <td className="px-5 py-3 text-right tabular-nums">{fmtMoney(g.current_price)}</td>
                                <td className="px-5 py-3 text-right tabular-nums font-medium">{fmtMoney(g.current_value)}</td>
                                <td className="px-5 py-3 text-right tabular-nums text-gray-500">{fmtMoney(g.cost_basis_total)}</td>
                                <td className={`px-5 py-3 text-right tabular-nums font-medium pr-5 ${pnlClass}`}>
                                  {fmtMoney(pnl)}
                                  {pnlPct != null && <div className="text-xs font-normal">{fmtPct(pnlPct)}</div>}
                                </td>
                              </tr>
                              {multi && isOpen && g.accounts.map(h => {
                                const hPnl = (h.current_value ?? 0) - (h.cost_basis_total ?? 0);
                                const hPnlClass = hPnl >= 0 ? 'text-green-600' : 'text-red-600';
                                return (
                                  <tr key={h.holding_id} className="border-t border-gray-100 bg-gray-50/50">
                                    <td className="px-5 py-2 pl-12 text-xs text-gray-500">—</td>
                                    <td className="px-5 py-2">
                                      <div className="text-gray-800 text-sm">{h.institution_name || h.account_name}</div>
                                      <div className="text-xs text-gray-500">
                                        {h.account_name}{h.account_subtype && ` · ${h.account_subtype}`}
                                        {h.source === 'manual' && ' · manual'}
                                      </div>
                                    </td>
                                    <td className="px-5 py-2 text-right tabular-nums text-sm">{fmtQty(h.quantity)}</td>
                                    <td className="px-5 py-2 text-right tabular-nums text-sm">{fmtMoney(h.current_price)}</td>
                                    <td className="px-5 py-2 text-right tabular-nums text-sm">{fmtMoney(h.current_value)}</td>
                                    <td className="px-5 py-2 text-right tabular-nums text-sm text-gray-500">{fmtMoney(h.cost_basis_total)}</td>
                                    <td className={`px-5 py-2 text-right tabular-nums text-sm pr-5 ${hPnlClass}`}>{fmtMoney(hPnl)}</td>
                                  </tr>
                                );
                              })}
                            </React.Fragment>
                          );
                        })
                      : sortedFlat.map(renderFlatRow)}
                  </tbody>
                  <tfoot className="bg-gray-50 text-sm">
                    <tr className="border-t border-gray-200">
                      <td className="px-5 py-3 font-semibold text-gray-900" colSpan={4}>Investments total</td>
                      <td className="px-5 py-3 text-right tabular-nums font-semibold text-gray-900">{fmtMoney(totals.invValue)}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-gray-700">{fmtMoney(totals.invCost)}</td>
                      <td className={`px-5 py-3 text-right tabular-nums font-semibold pr-5 ${totals.invPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {fmtMoney(totals.invPnl)}
                        <div className="text-xs font-normal">{fmtPct(totals.invPnlPct)}</div>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          )}

          {/* Cash */}
          {cash.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Cash &amp; currency</h2>
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <tr>
                      <th className="text-left px-5 py-2">Account</th>
                      <th className="text-left px-5 py-2">Currency</th>
                      <th className="text-right px-5 py-2 pr-5">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...cash]
                      .sort((a, b) => (b.current_value ?? 0) - (a.current_value ?? 0))
                      .map(h => (
                        <tr key={h.holding_id} className="border-t border-gray-100">
                          <td className="px-5 py-3">
                            <div className="text-gray-900">{h.institution_name || h.account_name}</div>
                            <div className="text-xs text-gray-500">
                              {h.account_name}{h.account_subtype && ` · ${h.account_subtype}`}
                            </div>
                          </td>
                          <td className="px-5 py-3 font-mono text-gray-700">{cashCurrency(h)}</td>
                          <td className="px-5 py-3 text-right tabular-nums font-medium pr-5">{fmtMoney(h.current_value)}</td>
                        </tr>
                      ))}
                  </tbody>
                  <tfoot className="bg-gray-50 text-sm">
                    <tr className="border-t border-gray-200">
                      <td className="px-5 py-3 font-semibold text-gray-900" colSpan={2}>Cash total</td>
                      <td className="px-5 py-3 text-right tabular-nums font-semibold text-gray-900 pr-5">{fmtMoney(totals.cashValue)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          )}

          {/* Grand total */}
          {(investments.length > 0 && cash.length > 0) && (
            <div className="bg-white rounded-lg border border-gray-200 px-5 py-4 flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Grand total</div>
              <div className="text-2xl font-bold text-gray-900 tabular-nums">{fmtMoney(totals.grandTotal)}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Holdings;
