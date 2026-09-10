import React from 'react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'ghost';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const variants: Record<Variant, string> = {
  primary: 'bg-ever-lime text-ever-lime-ink font-semibold hover:brightness-95',
  ghost: 'border border-ever-line text-ever-ink hover:bg-white/5',
};

/** Evergreen button. Primary = lime; ghost = hairline outline. */
export const Button: React.FC<ButtonProps> = ({ variant = 'primary', className, children, ...props }) => (
  <button
    className={cn(
      'inline-flex items-center justify-center gap-2 rounded-[11px] px-4 py-2 text-sm transition disabled:opacity-50 disabled:pointer-events-none',
      variants[variant],
      className,
    )}
    {...props}
  >
    {children}
  </button>
);
