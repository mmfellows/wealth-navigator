// Shared math for covered calls and cash-secured puts. Premium and prices
// are per share; a contract covers 100 shares.

export type OptionStrategy = 'covered_call' | 'cash_secured_put';
export type OptionStatus = 'planned' | 'open' | 'closed';
export type CloseMethod = 'expired' | 'assigned' | 'bought_back';

export interface OptionTrade {
  id: string;
  underlying: string;
  strategy: OptionStrategy;
  contracts: number;
  strike: number;
  premium: number;
  expiration: string;
  status: OptionStatus;
  open_date: string | null;
  close_date: string | null;
  close_method: CloseMethod | null;
  close_price: number | null;
  notes: string;
  underlying_price?: number | null;
}

export interface OptionMetrics {
  premiumTotal: number;
  collateral: number;          // cash to secure (CSP) or share value at strike (CC reference)
  sharesRequired: number;      // CC only (0 for CSP)
  breakeven: number;           // per share
  returnOnCollateral: number;  // premium / collateral, as fraction
  annualizedReturn: number | null; // fraction, null if expired/no DTE
  daysToExpiration: number;
  effectiveSalePrice?: number; // CC: strike + premium if assigned
  downsideProtectionPct?: number; // CC: premium / current price
  discountToCurrentPct?: number;  // CSP: breakeven vs current price
}

const DAY_MS = 86_400_000;

export function daysToExpiration(expiration: string, from: Date = new Date()): number {
  const exp = new Date(expiration + 'T16:00:00');
  return Math.max(0, Math.ceil((exp.getTime() - from.getTime()) / DAY_MS));
}

export function computeMetrics(t: {
  strategy: OptionStrategy;
  contracts: number;
  strike: number;
  premium: number;
  expiration: string;
  underlying_price?: number | null;
}): OptionMetrics {
  const shares = t.contracts * 100;
  const premiumTotal = t.premium * shares;
  const dte = daysToExpiration(t.expiration);
  const price = t.underlying_price ?? null;

  if (t.strategy === 'cash_secured_put') {
    const collateral = t.strike * shares;
    const breakeven = t.strike - t.premium;
    const roc = collateral > 0 ? premiumTotal / collateral : 0;
    return {
      premiumTotal,
      collateral,
      sharesRequired: 0,
      breakeven,
      returnOnCollateral: roc,
      annualizedReturn: dte > 0 ? roc * (365 / dte) : null,
      daysToExpiration: dte,
      discountToCurrentPct: price ? ((price - breakeven) / price) * 100 : undefined,
    };
  }

  // covered call: collateral is the 100 shares per contract you already hold
  const collateral = (price ?? t.strike) * shares;
  const roc = collateral > 0 ? premiumTotal / collateral : 0;
  return {
    premiumTotal,
    collateral,
    sharesRequired: shares,
    breakeven: (price ?? t.strike) - t.premium,
    returnOnCollateral: roc,
    annualizedReturn: dte > 0 ? roc * (365 / dte) : null,
    daysToExpiration: dte,
    effectiveSalePrice: t.strike + t.premium,
    downsideProtectionPct: price ? (t.premium / price) * 100 : undefined,
  };
}

// Realized P&L for a closed trade, in dollars.
export function realizedPnl(t: OptionTrade): number | null {
  if (t.status !== 'closed') return null;
  const shares = t.contracts * 100;
  const premiumTotal = t.premium * shares;
  if (t.close_method === 'bought_back') {
    return premiumTotal - (t.close_price ?? 0) * shares;
  }
  // expired or assigned: full premium kept (assignment also moves shares/cash,
  // which shows up in the brokerage account, not here)
  return premiumTotal;
}

export const fmtUsd = (n: number | null | undefined, digits = 0) => {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: digits, minimumFractionDigits: digits });
};

export const fmtPctFrac = (f: number | null | undefined) => {
  if (f == null || isNaN(f)) return '—';
  return `${(f * 100).toFixed(1)}%`;
};
