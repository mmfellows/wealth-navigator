import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ListChecks, ChevronDown, ChevronRight, Check, Plane, ArrowUpRight } from 'lucide-react';
import { authedFetch } from '../services/authRedirect';
import { Card, toast } from './ui';
import { cn } from '../lib/cn';

interface SubRow { category: string; subcategory: string; budget_monthly: number; actual_monthly: number; suggested_monthly: number }
interface LowRow extends SubRow {
  fix: { kind: 'raise'; item_id: string; item_name: string; frequency: string; new_monthly: number }
    | { kind: 'add'; item_name: string; new_monthly: number };
}
interface IdleRow extends SubRow {
  lines: string[];
  filed_elsewhere: Array<{ merchant: string; category: string; subcategory: string; total: number }>;
}
interface Gaps {
  year: number;
  window: { months_used: number };
  travel: { planned_year: number; actual_year: number; gap_year: number; trips_planned: number } | null;
  unbudgeted: SubRow[];
  low: LowRow[];
  idle: IdleRow[];
  recurring: Array<{ merchant: string; category: string; subcategory: string; monthly: number; months_seen: number }>;
  yearly: Array<{ merchant: string; category: string; subcategory: string; amount: number; due_month: string; due_label: string; already_planned: boolean }>;
  lumpy: Array<{ subcategory: string; total: number }>;
  count: number;
}

const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;

const Section: React.FC<{ title: string; count: number; why: string; children: React.ReactNode }> = ({ title, count, why, children }) => {
  // Collapsed to start: the headings and counts are the summary.
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <div className="border-t border-ever-line first:border-t-0">
      <button onClick={() => setOpen(v => !v)} className="flex w-full items-center gap-2 py-3 text-left" aria-expanded={open}>
        {open ? <ChevronDown className="h-4 w-4 flex-none text-ever-dim" /> : <ChevronRight className="h-4 w-4 flex-none text-ever-dim" />}
        <span className="text-sm font-semibold text-ever-ink">{title}</span>
        <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[10.5px] text-ever-dim">{count}</span>
      </button>
      {open && (
        <div className="pb-3 pl-6">
          <p className="mb-2 text-xs text-ever-dim">{why}</p>
          {children}
        </div>
      )}
    </div>
  );
};

const Row: React.FC<{ main: React.ReactNode; detail?: React.ReactNode; action?: React.ReactNode }> = ({ main, detail, action }) => (
  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-ever-line/60 py-2 text-sm first:border-t-0">
    <div className="min-w-0 flex-1">
      <div className="text-ever-ink">{main}</div>
      {detail && <div className="text-xs text-ever-dim">{detail}</div>}
    </div>
    {action}
  </div>
);

// "What this plan may be missing": the plan checked against the last 12
// months of real spending, with a one-click fix where the fix is mechanical.
export function PlanGaps({ year }: { year: number }) {
  const queryClient = useQueryClient();
  const thisYear = new Date().getFullYear();
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useQuery<Gaps>({
    queryKey: ['plan-gaps', year],
    queryFn: async () => {
      const res = await authedFetch(`/api/budget-plans/${year}/gaps`);
      if (!res.ok) throw new Error('Failed to check the plan');
      return res.json();
    },
  });

  const act = async (key: string, label: string, path: string, method: string, body: unknown) => {
    setBusy(key);
    try {
      const res = await authedFetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'That change did not save.');
      setDone(d => new Set(d).add(key));
      toast.success(label);
      ['year-plan', 'plan-gaps', 'envelopes', 'budgetItems', 'planned-costs'].forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  // New lines join the year being planned.
  const yearFields = year !== thisYear ? { plan_year: year, startDate: `${year}-01-01` } : {};
  const addLine = (key: string, name: string, category: string, subcategory: string, monthly: number) =>
    act(key, `Added "${name}" at ${usd(monthly)} a month`, '/api/budgets', 'POST', {
      itemName: name, mainCategory: category, secondaryCategory: subcategory, frequency: 'monthly', amount: monthly, endDate: null, ...yearFields,
    });

  const Btn: React.FC<{ k: string; onClick: () => void; children: React.ReactNode }> = ({ k, onClick, children }) => (
    done.has(k) ? (
      <span className="flex items-center gap-1 whitespace-nowrap text-xs text-ever-pos"><Check className="h-3.5 w-3.5" /> Done</span>
    ) : (
      <button
        onClick={onClick}
        disabled={busy !== null}
        className="whitespace-nowrap rounded-md border border-ever-line px-2.5 py-1 text-xs font-medium text-ever-lime hover:bg-white/5 disabled:opacity-50"
      >
        {busy === k ? 'Saving…' : children}
      </button>
    )
  );

  const expensesLink = (search: string) => `/expenses?search=${encodeURIComponent(search)}&year=${thisYear}`;

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-ever-ink">
          <ListChecks className="h-4 w-4 text-ever-lime" /> What this plan may be missing
        </h2>
        {data && <span className="font-mono text-[10.5px] text-ever-dim">{data.count === 0 ? 'Nothing found' : `${data.count} to look at`}</span>}
      </div>
      <p className="mt-0.5 text-xs text-ever-dim">
        The {year} plan checked against what you actually spent{data ? ` over the last ${data.window.months_used} months` : ''}. Nothing here changes until you click.
      </p>

      {isLoading && <p className="mt-3 text-sm text-ever-faint">Checking the plan against your transactions…</p>}
      {error ? <p className="mt-3 text-sm text-ever-neg">Could not check the plan. Try reloading.</p> : null}
      {data && data.count === 0 && (
        <p className="mt-3 flex items-center gap-2 text-sm text-ever-pos"><Check className="h-4 w-4" /> Every kind of spending from the last year has a place in this plan.</p>
      )}

      {data && data.count > 0 && (
        <div className="mt-3">
          {data.travel && (
            <div className="mb-1 flex flex-wrap items-center justify-between gap-3 rounded-md border border-ever-orange/30 bg-ever-orange/10 p-3 text-sm">
              <span className="flex items-start gap-2 text-ever-ink">
                <Plane className="mt-0.5 h-4 w-4 flex-none text-ever-orange" />
                <span>
                  <strong>Travel:</strong> the plan has {usd(data.travel.planned_year)} for the year ({data.travel.trips_planned} trip{data.travel.trips_planned === 1 ? '' : 's'}); you spent about {usd(data.travel.actual_year)} on trips and travel in the last year.
                  That leaves roughly {usd(data.travel.gap_year)} unplanned.
                </span>
              </span>
              <Link to="/trips" className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-ever-line px-2.5 py-1 text-xs font-medium text-ever-lime hover:bg-white/5">
                Add {year} trips <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}

          <Section title="Spending with no budget line" count={data.unbudgeted.length} why="You spend here regularly, but nothing in the plan covers it.">
            {data.unbudgeted.map(s => {
              const k = `unb:${s.category}:${s.subcategory}`;
              return (
                <Row key={k}
                  main={<>{s.subcategory} <span className="text-xs text-ever-faint">{s.category}</span></>}
                  detail={`Averaging ${usd(s.actual_monthly)} a month`}
                  action={<Btn k={k} onClick={() => addLine(k, s.subcategory, s.category, s.subcategory, s.suggested_monthly)}>Add at {usd(s.suggested_monthly)}/mo</Btn>}
                />
              );
            })}
          </Section>

          <Section title="Budgeted below what you spend" count={data.low.length} why="Raise the line to match, or leave it if you intend to spend less next year.">
            {data.low.map(s => {
              const k = `low:${s.category}:${s.subcategory}`;
              const fix = s.fix;
              return (
                <Row key={k}
                  main={<>{s.subcategory} <span className="text-xs text-ever-faint">{s.category}</span></>}
                  detail={`Budget ${usd(s.budget_monthly)} a month, averaging ${usd(s.actual_monthly)}`}
                  action={fix.kind === 'raise' ? (
                    <Btn k={k} onClick={() => act(k, `"${fix.item_name}" raised to ${usd(fix.new_monthly)} a month`, `/api/budgets/${fix.item_id}`, 'PUT', {
                      amount: fix.frequency === 'annual' ? fix.new_monthly * 12 : fix.new_monthly, monthlyExpectedSpend: fix.new_monthly,
                    })}>Raise "{fix.item_name}" to {usd(fix.new_monthly)}/mo</Btn>
                  ) : (
                    <Btn k={k} onClick={() => addLine(k, fix.item_name, s.category, s.subcategory, fix.new_monthly)}>Add "{fix.item_name}" at {usd(fix.new_monthly)}/mo</Btn>
                  )}
                />
              );
            })}
          </Section>

          <Section title="Regular charges with no line of their own" count={data.recurring.length} why="These show up most months and sit inside the categories above. Giving one its own line makes it visible; skip any that the raised line already covers.">
            {data.recurring.map(r => {
              const k = `rec:${r.merchant}`;
              return (
                <Row key={k}
                  main={<>{r.merchant} <span className="text-xs text-ever-faint">{r.subcategory}</span></>}
                  detail={`About ${usd(r.monthly)} a month, charged in ${r.months_seen} recent months`}
                  action={<Btn k={k} onClick={() => addLine(k, r.merchant, r.category, r.subcategory, r.monthly)}>Add a line at {usd(r.monthly)}/mo</Btn>}
                />
              );
            })}
          </Section>

          <Section title="Once-or-twice-a-year charges" count={data.yearly.filter(y => !y.already_planned).length} why="Charged in only one or two months last year: fees, memberships, registrations, check-ups. Add the ones that will recur as a special expense in the month they fall due.">
            {data.yearly.map(y => {
              const k = `yr:${y.merchant}:${y.due_month}`;
              return (
                <Row key={k}
                  main={<>{y.merchant} <span className="text-xs text-ever-faint">{y.subcategory}</span></>}
                  detail={`${usd(y.amount)}, expected again in ${y.due_label}`}
                  action={y.already_planned ? (
                    <span className="flex items-center gap-1 whitespace-nowrap text-xs text-ever-pos"><Check className="h-3.5 w-3.5" /> Planned</span>
                  ) : (
                    <Btn k={k} onClick={() => act(k, `${y.merchant} added to ${y.due_label}`, '/api/planned-costs', 'POST', {
                      name: y.merchant, amount: y.amount, month: y.due_month, category: y.category,
                    })}>Plan {usd(y.amount)} for {y.due_label.split(' ')[0]}</Btn>
                  )}
                />
              );
            })}
          </Section>

          <Section title="Budget lines with no spending behind them" count={data.idle.length} why="No transaction was filed under these subcategories all year. Either the cost has stopped, or it is being filed under a different subcategory, so it counts against some other line. Recategorize the merchant once on the Expenses page and the app remembers it.">
            {data.idle.map(s => (
              <Row key={`idle:${s.category}:${s.subcategory}`}
                main={<>{s.subcategory} <span className="text-xs text-ever-faint">{s.category}</span></>}
                detail={<>
                  {usd(s.budget_monthly)} a month across {s.lines.join(', ')}
                  {s.filed_elsewhere.length > 0 && <> · likely filed as {s.filed_elsewhere.map(m => `${m.merchant} (${m.subcategory})`).join(', ')}</>}
                </>}
                action={
                  <Link to={expensesLink(s.filed_elsewhere[0]?.merchant || s.lines[0] || s.subcategory)} className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-ever-line px-2.5 py-1 text-xs font-medium text-ever-lime hover:bg-white/5">
                    Find in Expenses <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                }
              />
            ))}
          </Section>

          {data.lumpy.length > 0 && (
            <p className={cn('border-t border-ever-line pt-3 text-xs text-ever-dim')}>
              Also worth leaving room for: one-off purchases of $50 or more outside trips came to{' '}
              {data.lumpy.slice(0, 3).map(l => `${usd(l.total)} in ${l.subcategory}`).join(', ')} over the last year. They won't repeat exactly, but something like them will.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
