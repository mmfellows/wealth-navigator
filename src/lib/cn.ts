/**
 * Minimal className joiner. Filters out falsy values so conditional classes
 * read cleanly: cn('base', active && 'is-active', className). No dependency on
 * clsx/tailwind-merge — the design system doesn't rely on class de-duplication.
 */
export type ClassValue = string | number | false | null | undefined;

export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(' ');
}
