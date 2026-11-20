import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { authedFetch } from '../services/authRedirect';

const fmt = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export type PaceStatus = 'under' | 'on' | 'hot' | 'blown';

export function paceStatus(ratio: number, elapsed: number): PaceStatus {
  if (ratio >= 1) return 'blown';
  if (ratio > elapsed + 0.1) return 'hot';
  if (ratio < elapsed - 0.15) return 'under';
  return 'on';
}

export const STATUS_STYLES: Record<PaceStatus, { bar: string; text: string; label: string }> = {
  under: { bar: 'bg-ever-pos', text: 'text-ever-pos', label: 'under pace' },
  on: { bar: 'bg-ever-teal', text: 'text-ever-lime', label: 'on pace' },
  hot: { bar: 'bg-ever-orange', text: 'text-ever-orange', label: 'running hot' },
  blown: { bar: 'bg-ever-neg', text: 'text-ever-neg', label: 'over budget' },
};

// One category pacing row: MTD actual vs monthly envelope, with the
// elapsed-time marker so "running hot" is visible at a glance. Tap to see
// the category's transactions.
export function CategoryPacing({
  category,
  actual,
  budget,
  elapsed,
  monthStart,
  monthEnd,
}: {
  category: string;
  actual: number;
  budget: number | null;
  elapsed: number;
  monthStart: string;
  monthEnd: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const { data: txData } = useQuery({
    queryKey: ['pacing-txns', category, monthStart],
    enabled: expanded,
    queryFn: async () => {
      const params = new URLSearchParams({
        category, startDate: monthStart, endDate: monthEnd, limit: '200', tripMode: 'separate',
      });
      const res = await authedFetch(`/api/expenses?${params}`);
      if (!res.ok) throw new Error('Failed to fetch transactions');
      return res.json();
    },
  });

  const ratio = budget && budget > 0 ? actual / budget : null;
  const status = ratio !== null ? paceStatus(ratio, elapsed) : null;
  const style = status ? STATUS_STYLES[status] : null;

  return (
    <div className="bg-ever-card rounded-ever border border-ever-line">
      <button onClick={() => setExpanded(e => !e)} className="w-full p-3 text-left">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="font-medium text-ever-ink flex items-center gap-1">
            {expanded ? <ChevronDown className="h-4 w-4 text-ever-faint" /> : <ChevronRight className="h-4 w-4 text-ever-faint" />}
            {category}
          </span>
          <span className="text-sm whitespace-nowrap">
            <span className="font-semibold">{fmt(actual)}</span>
            <span className="text-ever-faint"> / {budget !== null ? fmt(budget) : '—'}</span>
          </span>
        </div>
        {ratio !== null ? (
          <>
            <div className="relative h-2.5 bg-ever-track rounded-full overflow-hidden">
              <div
                className={`absolute inset-y-0 left-0 rounded-full ${style!.bar}`}
                style={{ width: `${Math.min(ratio * 100, 100)}%` }}
              />
              {/* elapsed-time marker */}
              <div className="absolute inset-y-0 w-0.5 bg-ever-ink/60" style={{ left: `${elapsed * 100}%` }} />
            </div>
            <div className={`text-xs mt-1 ${style!.text}`}>
              {Math.round(ratio * 100)}% spent · {style!.label}
            </div>
          </>
        ) : (
          <div className="text-xs text-ever-faint">No budget set</div>
        )}
      </button>
      {expanded && (
        <div className="border-t border-ever-line px-3 py-2 text-sm max-h-64 overflow-y-auto">
          {!txData ? (
            <p className="text-ever-faint py-1">Loading…</p>
          ) : txData.expenses.length === 0 ? (
            <p className="text-ever-faint py-1">No transactions this month.</p>
          ) : (
            txData.expenses.map((e: any) => (
              <div key={e.id} className="flex justify-between gap-2 py-1 border-b last:border-0 border-ever-line/50">
                <span className="truncate text-ever-dim">{e.date.substring(5)} · {e.merchant}</span>
                <span className="whitespace-nowrap font-medium">{fmt(e.amount)}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
