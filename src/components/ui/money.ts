/** Currency + number formatting shared across the Evergreen UI. */

export function fmtUSD(n: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (n == null || isNaN(n)) return '—';
  if (opts.compact) {
    if (Math.abs(n) >= 1_000_000) return `${n < 0 ? '−' : ''}$${(Math.abs(n) / 1_000_000).toFixed(2)}M`;
    if (Math.abs(n) >= 1_000) return `${n < 0 ? '−' : ''}$${(Math.abs(n) / 1_000).toFixed(0)}k`;
  }
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n == null || isNaN(n)) return '—';
  return `${n.toFixed(digits)}%`;
}
