import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

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

type SortKey = 'ticker' | 'account' | 'quantity' | 'current_price' | 'current_value' | 'cost_basis_total' | 'pnl';

const Holdings: React.FC = () => {
  const [rows, setRows] = useState<HoldingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('current_value');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

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

  const sorted = useMemo(() => {
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
    return [...rows].sort((a, b) => {
      const av = getVal(a);
      const bv = getVal(b);
      if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
  }, [rows, sortKey, sortDir]);

  const totals = useMemo(() => {
    let value = 0;
    let cost = 0;
    for (const h of rows) {
      value += h.current_value ?? 0;
      cost += h.cost_basis_total ?? 0;
    }
    const pnl = value - cost;
    const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
    return { value, cost, pnl, pnlPct };
  }, [rows]);

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'ticker' || key === 'account' ? 'asc' : 'desc');
    }
  };

  const arrow = (key: SortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Holdings</h1>
        <p className="text-gray-600 mt-1">Every position across every account.</p>
      </div>

      {loading ? (
        <div className="text-gray-500">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-lg border border-dashed border-gray-300 p-12 text-center text-gray-500">
          No holdings yet.
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="text-left px-5 py-2 cursor-pointer select-none" onClick={() => onSort('ticker')}>Ticker{arrow('ticker')}</th>
                <th className="text-left px-5 py-2 cursor-pointer select-none" onClick={() => onSort('account')}>Account{arrow('account')}</th>
                <th className="text-right px-5 py-2 cursor-pointer select-none" onClick={() => onSort('quantity')}>Shares{arrow('quantity')}</th>
                <th className="text-right px-5 py-2 cursor-pointer select-none" onClick={() => onSort('current_price')}>Price{arrow('current_price')}</th>
                <th className="text-right px-5 py-2 cursor-pointer select-none" onClick={() => onSort('current_value')}>Value{arrow('current_value')}</th>
                <th className="text-right px-5 py-2 cursor-pointer select-none" onClick={() => onSort('cost_basis_total')}>Cost{arrow('cost_basis_total')}</th>
                <th className="text-right px-5 py-2 pr-5 cursor-pointer select-none" onClick={() => onSort('pnl')}>P&amp;L{arrow('pnl')}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(h => {
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
              })}
            </tbody>
            <tfoot className="bg-gray-50 text-sm">
              <tr className="border-t border-gray-200">
                <td className="px-5 py-3 font-semibold text-gray-900" colSpan={4}>Total</td>
                <td className="px-5 py-3 text-right tabular-nums font-semibold text-gray-900">{fmtMoney(totals.value)}</td>
                <td className="px-5 py-3 text-right tabular-nums text-gray-700">{fmtMoney(totals.cost)}</td>
                <td className={`px-5 py-3 text-right tabular-nums font-semibold pr-5 ${totals.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {fmtMoney(totals.pnl)}
                  <div className="text-xs font-normal">{fmtPct(totals.pnlPct)}</div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
};

export default Holdings;
