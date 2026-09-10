import React from 'react';
import { cn } from '../../lib/cn';
import { Card, Label } from './Card';

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  /** Small footnote under the value (e.g. "5.3% of assets" or a delta). */
  sub?: React.ReactNode;
  /** Color of the leading dot; use a token like 'var(--ever-lime)'. */
  dot?: string;
  className?: string;
}

/** Compact KPI tile: dot + label, big grotesk number, muted sub-line. */
export const StatCard: React.FC<StatCardProps> = ({ label, value, sub, dot = 'var(--ever-lime)', className }) => (
  <Card className={cn('p-5', className)}>
    <div className="flex items-center gap-2.5">
      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: dot }} aria-hidden="true" />
      <Label>{label}</Label>
    </div>
    <div className="mt-2.5 font-grotesk text-[27px] font-extrabold tracking-tight tabular-nums text-ever-ink">
      {value}
    </div>
    {sub != null && (
      <div className="mt-2 flex items-center gap-1.5 font-mono text-[10.5px] tracking-wide text-ever-dim">
        {sub}
      </div>
    )}
  </Card>
);
