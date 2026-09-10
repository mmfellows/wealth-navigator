import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

export interface SpendingPoint {
  month: string; // YYYY-MM
  total: number;
  segments: Record<string, number>;
}

// Evergreen categorical palette (reads on the dark ground). Spend-type identities
// and stacking order validated for CVD-safe adjacency.
const SPEND_TYPE_COLORS: Record<string, string> = {
  'Non-Discretionary': '#8b6ff0',
  'Travel': '#efb15b',
  'Discretionary': '#38a790',
};
const SPEND_TYPE_STACK_ORDER = ['Non-Discretionary', 'Travel', 'Discretionary'];

// Category view segments by subcategory, so names are open-ended: colors are
// assigned by descending yearly total from this fixed 12-color sequence, never
// cycled — the server caps segments at 12 and folds the tail into "Other".
const CATEGORY_PALETTE = [
  '#8b6ff0', '#c9f04e', '#38a790', '#efb15b', '#eb8f6c', '#6bb6e8',
  '#b892f5', '#e3b34a', '#e88ab0', '#a6b878', '#7c86e0', '#48c4bf',
];
const OTHER_COLOR = '#7f8a82';

const fmt = (n: number) => '$' + n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtAxis = (n: number) => (Math.abs(n) >= 1000 ? `$${(n / 1000).toFixed(0)}k` : `$${n}`);
const monthLabel = (m: string) =>
  new Date(m + '-01T00:00:00').toLocaleString('default', { month: 'short' });

interface Props {
  points: SpendingPoint[];
  segments: string[]; // largest total first, possibly ending in "Other"
  segmentBy: 'category' | 'spend_type';
}

const SpendingOverTimeChart: React.FC<Props> = ({ points, segments, segmentBy }) => {
  const { data, orderedSegments, colorOf } = useMemo(() => {
    // Trim trailing empty months (future months of the selected year).
    let end = points.length;
    while (end > 0 && points[end - 1].total === 0) end--;
    const trimmed = points.slice(0, end);

    let ordered: string[];
    const colors: Record<string, string> = {};
    if (segmentBy === 'spend_type') {
      ordered = [
        ...SPEND_TYPE_STACK_ORDER.filter(s => segments.includes(s)),
        ...segments.filter(s => !(s in SPEND_TYPE_COLORS)),
      ];
      for (const s of ordered) colors[s] = SPEND_TYPE_COLORS[s] || OTHER_COLOR;
    } else {
      // Server order = descending total, "Other" last. Largest at the bottom
      // of the stack; palette assigned by that same rank.
      ordered = segments;
      let idx = 0;
      for (const s of ordered) {
        colors[s] = s === 'Other' ? OTHER_COLOR : CATEGORY_PALETTE[Math.min(idx++, CATEGORY_PALETTE.length - 1)];
      }
    }

    const rows = trimmed.map(p => ({
      month: p.month,
      label: monthLabel(p.month),
      total: p.total,
      ...p.segments,
    }));
    return { data: rows, orderedSegments: ordered, colorOf: colors };
  }, [points, segments, segmentBy]);

  if (data.length === 0) {
    return <p className="text-ever-faint text-center py-8">No spending data for this period</p>;
  }

  return (
    <div>
      {/* key forces a remount when the segmentation changes — recharts does
          not reliably swap stacked Bar children in place */}
      <ResponsiveContainer width="100%" height={280} key={segmentBy}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#313d4d" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#9db3a7' }} stroke="#313d4d" />
          <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 11, fill: '#9db3a7' }} stroke="#313d4d" width={55} />
          <Tooltip
            formatter={(v: number, name: string) => [fmt(v), name]}
            labelFormatter={(_, payload) => {
              const row = payload?.[0]?.payload;
              if (!row) return '';
              return `${new Date(row.month + '-01T00:00:00').toLocaleString('default', { month: 'long', year: 'numeric' })} — ${fmt(row.total)}`;
            }}
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            contentStyle={{ borderRadius: '10px', border: '1px solid #313d4d', background: '#1b2330', color: '#ebf2ec', fontSize: '13px' }}
          />
          {orderedSegments.map((seg, i) => (
            <Bar
              key={seg}
              dataKey={seg}
              name={seg}
              stackId="spend"
              fill={colorOf[seg]}
              maxBarSize={40}
              isAnimationActive={false}
              radius={i === orderedSegments.length - 1 ? [4, 4, 0, 0] : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-ever-dim">
        {orderedSegments.map(seg => (
          <span key={seg} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: colorOf[seg] }} /> {seg}
          </span>
        ))}
      </div>
    </div>
  );
};

export default SpendingOverTimeChart;
