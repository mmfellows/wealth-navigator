/**
 * Presentation helper for the Evergreen dark theme.
 *
 * Category / status / account-type colors are stored across the app as LIGHT
 * Tailwind class strings ("bg-blue-100 text-blue-800") — some come from the
 * settings API (`fetchCategoryColors`), some from per-page maps. Those read
 * wrong on the dark theme. This module maps any such string to dark-appropriate
 * pill / dot classes WITHOUT changing what's stored (the API contract and the
 * settings picker payloads are unchanged — only how a color renders).
 *
 * Tailwind's JIT only emits a class whose full literal string appears in source,
 * so every dark class below is written out literally (never built dynamically).
 * The hue set covers the 18 picker options in PersonalFinanceSettings plus every
 * hue used by the fixed per-page maps, with `gray` as the neutral default.
 */

const HUE_PILL: Record<string, string> = {
  blue:    'bg-blue-500/15 text-blue-300 border border-blue-500/25',
  sky:     'bg-sky-500/15 text-sky-300 border border-sky-500/25',
  cyan:    'bg-cyan-500/15 text-cyan-300 border border-cyan-500/25',
  teal:    'bg-teal-500/15 text-teal-300 border border-teal-500/25',
  emerald: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25',
  green:   'bg-green-500/15 text-green-300 border border-green-500/25',
  lime:    'bg-lime-500/15 text-lime-300 border border-lime-500/25',
  yellow:  'bg-yellow-500/15 text-yellow-200 border border-yellow-500/25',
  amber:   'bg-amber-500/15 text-amber-200 border border-amber-500/25',
  orange:  'bg-orange-500/15 text-orange-300 border border-orange-500/25',
  red:     'bg-red-500/15 text-red-300 border border-red-500/25',
  rose:    'bg-rose-500/15 text-rose-300 border border-rose-500/25',
  pink:    'bg-pink-500/15 text-pink-300 border border-pink-500/25',
  fuchsia: 'bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/25',
  purple:  'bg-purple-500/15 text-purple-300 border border-purple-500/25',
  violet:  'bg-violet-500/15 text-violet-300 border border-violet-500/25',
  indigo:  'bg-indigo-500/15 text-indigo-300 border border-indigo-500/25',
  slate:   'bg-slate-500/15 text-slate-300 border border-slate-500/25',
  gray:    'bg-white/5 text-ever-dim border border-ever-line',
};

const HUE_DOT: Record<string, string> = {
  blue: 'bg-blue-400', sky: 'bg-sky-400', cyan: 'bg-cyan-400', teal: 'bg-teal-400',
  emerald: 'bg-emerald-400', green: 'bg-green-400', lime: 'bg-lime-400', yellow: 'bg-yellow-400',
  amber: 'bg-amber-400', orange: 'bg-orange-400', red: 'bg-red-400', rose: 'bg-rose-400',
  pink: 'bg-pink-400', fuchsia: 'bg-fuchsia-400', purple: 'bg-purple-400', violet: 'bg-violet-400',
  indigo: 'bg-indigo-400', slate: 'bg-slate-400', gray: 'bg-ever-faint',
};

/** Extract a known hue from a stored Tailwind color string, else 'gray'. */
export function hueOf(value?: string | null): string {
  const m = value?.match(/bg-([a-z]+)-\d{2,3}/);
  return m && HUE_PILL[m[1]] ? m[1] : 'gray';
}

/** Dark pill/badge classes (bg + text + hairline border) for a stored color string. */
export function everPill(value?: string | null): string {
  return HUE_PILL[hueOf(value)];
}

/** Dark dot/swatch background class for a stored color string. */
export function everDot(value?: string | null): string {
  return HUE_DOT[hueOf(value)];
}
