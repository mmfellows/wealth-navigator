import React, { useMemo } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

export interface NetWorthPoint {
  date: string;
  net_worth: number;
  total_assets: number;
  total_liabilities: number;
  cash: number;
  investments: number;
}

// Evergreen palette. Violet (invested) + lime (cash) stacked, with a bright
// lime net-worth line riding on top — the "violet bars, lime caps" motif from
// the design system, applied to real time-series data.
const COLORS = {
  investments: '#8b6ff0',
  cash: '#c9f04e',
  netWorth: '#ebf2ec',
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

// Balances are levels, not flows: bucketing keeps the LAST snapshot in each
// week/month rather than summing. Daily bars are unreadable past ~6 weeks.
function bucketPoints(points: NetWorthPoint[], days: number): NetWorthPoint[] {
  if (days <= 30) return points;
  const keyOf = (date: string) => {
    if (days <= 90) {
      const d = new Date(date + 'T00:00:00');
      const monday = new Date(d);
      monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      return monday.toISOString().slice(0, 10);
    }
    return date.slice(0, 7);
  };
  const buckets = new Map<string, NetWorthPoint>();
  for (const p of points) buckets.set(keyOf(p.date), p); // points arrive date-sorted
  return [...buckets.values()];
}

interface Props {
  points: NetWorthPoint[];
  days: number;
}

const NetWorthHistoryChart: React.FC<Props> = ({ points, days }) => {
  const data = useMemo(() => bucketPoints(points, days), [points, days]);

  return (
    <div>
      <ResponsiveContainer width="100%" height={250}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2c4d43" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9db3a7' }} stroke="#2c4d43" />
          <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 11, fill: '#9db3a7' }} stroke="#2c4d43" width={70} />
          <Tooltip
            formatter={(v: number, name: string) => [fmt(v), name]}
            labelStyle={{ color: '#ebf2ec' }}
            contentStyle={{ borderRadius: '10px', border: '1px solid #2c4d43', background: '#15221d', color: '#ebf2ec', fontSize: '13px' }}
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          />
          <Bar dataKey="investments" name="Investments" stackId="assets" fill={COLORS.investments} maxBarSize={40} isAnimationActive={false} />
          <Bar dataKey="cash" name="Cash" stackId="assets" fill={COLORS.cash} maxBarSize={40} radius={[5, 5, 0, 0]} isAnimationActive={false} />
          <Line type="monotone" dataKey="net_worth" name="Net Worth" stroke={COLORS.netWorth} strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-4 mt-2 font-mono text-[11px] text-ever-dim">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: COLORS.investments }} /> Invested</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: COLORS.cash }} /> Cash</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-0.5" style={{ backgroundColor: COLORS.netWorth }} /> Net Worth</span>
      </div>
    </div>
  );
};

export default NetWorthHistoryChart;
