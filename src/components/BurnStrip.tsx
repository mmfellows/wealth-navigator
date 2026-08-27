import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authedFetch } from '../services/authRedirect';

interface WindowStats {
  months: number;
  avg_spend: number;
  avg_income: number;
  avg_taxes: number;
  avg_net: number;
  savings_rate: number | null;
}

interface TrailingStats {
  windows: { m3: WindowStats; m6: WindowStats; m12: WindowStats };
  by_month: Array<{ month: string; spend: number; income: number; taxes: number }>;
}

const fmt = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const WINDOWS = [
  { key: 'm3' as const, label: '3 mo' },
  { key: 'm6' as const, label: '6 mo' },
  { key: 'm12' as const, label: '12 mo' },
];

// The always-visible top-level answer: what's my burn, what's my income,
// am I ahead or behind. Averages over complete months only.
export function BurnStrip() {
  const [window, setWindow] = useState<'m3' | 'm6' | 'm12'>('m3');

  const { data } = useQuery<TrailingStats>({
    queryKey: ['trailing-stats'],
    queryFn: async () => {
      const res = await authedFetch('/api/expenses/stats/trailing');
      if (!res.ok) throw new Error('Failed to fetch trailing stats');
      return res.json();
    },
  });

  const w = data?.windows?.[window];

  return (
    <div className="bg-white rounded-lg shadow-sm border p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-900">
          Monthly burn vs. income
          {w && w.months > 0 && <span className="text-gray-400 font-normal"> · avg over {w.months} complete month{w.months === 1 ? '' : 's'}</span>}
        </h2>
        <div className="flex gap-1">
          {WINDOWS.map(win => (
            <button
              key={win.key}
              onClick={() => setWindow(win.key)}
              className={`px-2 py-1 text-xs rounded font-medium ${
                window === win.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {win.label}
            </button>
          ))}
        </div>
      </div>
      {!w ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div>
            <p className="text-xs text-gray-500">Income</p>
            <p className="text-lg font-bold text-green-700">{fmt(w.avg_income)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Burn (ex-taxes)</p>
            <p className="text-lg font-bold text-gray-900">{fmt(w.avg_spend)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Taxes</p>
            <p className="text-lg font-bold text-gray-500">{fmt(w.avg_taxes)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Net / month</p>
            <p className={`text-lg font-bold ${w.avg_net >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {w.avg_net >= 0 ? '+' : ''}{fmt(w.avg_net)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Savings rate</p>
            <p className={`text-lg font-bold ${(w.savings_rate ?? 0) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {w.savings_rate === null ? '—' : `${(w.savings_rate * 100).toFixed(0)}%`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
