import React from 'react';
import { cn } from '../../lib/cn';

/** Base surface for the Evergreen system: flat dark card, hairline border. */
export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, children, ...props }) => (
  <div
    className={cn('rounded-ever border border-ever-line bg-ever-card p-5', className)}
    {...props}
  >
    {children}
  </div>
);

interface CardHeaderProps {
  title: React.ReactNode;
  hint?: React.ReactNode;
  right?: React.ReactNode;
}

/** Card title row with an optional muted hint on the right (or custom `right`). */
export const CardHeader: React.FC<CardHeaderProps> = ({ title, hint, right }) => (
  <div className="mb-4 flex items-center justify-between gap-3">
    <h3 className="text-[15px] font-semibold tracking-tight text-ever-ink">{title}</h3>
    {right ?? (hint != null && (
      <span className="font-mono text-[10.5px] tracking-wide text-ever-dim">{hint}</span>
    ))}
  </div>
);

/** Uppercase mono micro-label used above values and in card eyebrows. */
export const Label: React.FC<React.HTMLAttributes<HTMLSpanElement>> = ({ className, children, ...props }) => (
  <span
    className={cn('font-mono text-[10.5px] uppercase tracking-[0.14em] text-ever-dim', className)}
    {...props}
  >
    {children}
  </span>
);
