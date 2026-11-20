import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ComposedChart, BarChart, LineChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { CalendarDays, Lock, Plane, Plus, Trash2, ChevronDown, ChevronRight, ArrowUpRight } from 'lucide-react';
import { authedFetch } from '../services/authRedirect';
import { PlannedCosts } from '../components/PlannedCosts';
import { Card, Button, StatCard, toast } from '../components/ui';
import { cn } from '../lib/cn';

interface PlanMonth {
  month: string;
  budget_total: number;
  budget_by_category: Record<string, number>;
  income_planned: number | null;
  special: Array<{ name: string; amount: number }>;
  trips: Array<{ name: string; budget_share: number }>;
  actual_spend: number | null;
  actual_income: number | null;
  actual_complete: boolean;
  last_year_spend: number | null;
  last_year_income: number | null;
}
interface IncomeLine { name: string; amount: number; frequency: 'monthly' | 'once'; month: string | null }
interface PlanView {
  year: number;
  status: 'draft' | 'not_started' | 'live' | 'past';
  has_own_lines: boolean;
  months: PlanMonth[];
  categories: Array<{ name: string; total: number }>;
  totals: {
    budget: number; income_planned: number | null; savings_planned: number | null;
    last_year_spend: number; last_year_months: number;
    actual_spend: number; actual_income: number; actual_months: number; budget_to_date: number;
  };
  income_lines: IncomeLine[];
  lines_by_category: Array<{ category: string; monthly: number; lines: number }>;
  line_count: number;
  trips: Array<{ id: string; name: string; start_date: string; end_date: string; budget: number | null }>;
  special_total: number;
  original: {
    at: string; note: string | null;
    totals: { budget: number; income_planned: number | null; savings_planned: number | null };
    months: Array<{ month: string; budget_total: number; income_planned: number | null }>;
  } | null;
}

// Category colors are fixed per category (never by rank) and were checked for
// colorblind separation and contrast against the dark card surface.
const CATEGORY_COLORS: Record<string, string> = {
  'Home': '#8b6ff0',
  'Fixed Costs': '#38a790',
  'Discretionary': '#d47355',
  'Other Spending': '#4a98cf',
  'Special Expense': '#c2872c',
  'Trips & Travel': '#cc6aa0',
};
const STACK_ORDER = Object.keys(CATEGORY_COLORS);
const OTHER = 'Other';
const OTHER_COLOR = '#7f8a82';
const SURFACE = '#1b2330';
const INK = '#ebf2ec';
const DIM = '#9db3a7';
const GRID = '#313d4d';
const SERIES = { plan: '#8b6ff0', lastYear: '#c2872c', actual: '#38a790' };

const usd = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString()}`;
const axisUsd = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n) >= 1000 ? `${Math.round(Math.abs(n) / 1000)}k` : Math.abs(n)}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const mon = (key: string) => MONTHS[Number(key.slice(5, 7)) - 1];
const inputCls = 'rounded-lg border border-ever-line bg-ever-bg px-3 py-2 text-sm text-ever-ink placeholder-ever-faint focus:border-ever-lime focus:outline-none';

const Swatch: React.FC<{ color: string; line?: boolean }> = ({ color, line }) => (
  <span
    className={cn('inline-block flex-none', line ? 'h-0.5 w-4' : 'h-2.5 w-2.5 rounded-[3px]')}
    style={{ background: color }}
    aria-hidden="true"
  />
);

const Legend: React.FC<{ items: Array<{ name: string; color: string; line?: boolean }> }> = ({ items }) => (
  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
    {items.map(i => (
      <span key={i.name} className="flex items-center gap-1.5 text-xs text-ever-dim">
        <Swatch color={i.color} line={i.line} />{i.name}
      </span>
    ))}
  </div>
);

// One tooltip for all three charts: month heading, the series values in ink
// (color only on the swatch), then whatever makes the month unusual.
const ChartTooltip: React.FC<any> = ({ active, payload, label, rows }) => {
  if (!active || !payload?.length) return null;
  const row: PlanMonth | undefined = rows?.find((r: PlanMonth) => mon(r.month) === label);
  const items = payload.filter((p: any) => p.value !== null && p.value !== undefined && p.value !== 0);
  return (
    <div className="max-w-[260px] rounded-[10px] border border-[#4a5a70] bg-[#0f141c] px-3 py-2.5 text-[13px] shadow-xl">
      <div className="mb-1.5 font-semibold text-white">{label}</div>
      {items.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-[#c5d2ca]"><Swatch color={p.color || p.stroke} />{p.name}</span>
          <span className="font-semibold tabular-nums text-white">{usd(p.value)}</span>
        </div>
      ))}
      {row && (row.trips.length > 0 || row.special.length > 0) && (
        <div className="mt-1.5 border-t border-[#313d4d] pt-1.5 text-xs text-[#c5d2ca]">
          {row.trips.map(t => <div key={t.name}>Trip: {t.name}{t.budget_share > 0 ? ` (${usd(t.budget_share)})` : ''}</div>)}
          {row.special.map(s => <div key={s.name}>Special: {s.name} ({usd(s.amount)})</div>)}
        </div>
      )}
    </div>
  );
};

const axisProps = {
  tick: { fontSize: 12, fill: DIM },
  tickLine: false,
} as const;

const IncomeEditor: React.FC<{ year: number; initial: IncomeLine[]; onSaved: () => void }> = ({ year, initial, onSaved }) => {
  const [lines, setLines] = useState<IncomeLine[]>(initial);
  const [dirty, setDirty] = useState(false);
  const change = (next: IncomeLine[]) => { setLines(next); setDirty(true); };
  const patch = (i: number, p: Partial<IncomeLine>) => change(lines.map((l, idx) => (idx === i ? { ...l, ...p } : l)));

  const save = useMutation({
    mutationFn: async () => {
      const res = await authedFetch(`/api/budget-plans/${year}/income`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ income_lines: lines.map(l => ({ ...l, amount: Number(l.amount) || 0 })) }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Could not save planned income.');
      return res.json();
    },
    onSuccess: () => { setDirty(false); toast.success('Planned income saved'); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const total = lines.reduce((s, l) => s + (Number(l.amount) || 0) * (l.frequency === 'monthly' ? 12 : 1), 0);

  return (
    <Card>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold text-ever-ink">Planned income</h2>
        <span className="font-mono text-[10.5px] text-ever-dim">{usd(total)} for the year</span>
      </div>
      <p className="mb-3 text-xs text-ever-dim">What you expect to come in. Use "Every month" for regular pay and "One time" for a bonus or a lump you expect in a particular month.</p>
      {lines.length === 0 && <p className="mb-3 text-sm text-ever-faint">No planned income yet. Without it the charts can't show planned savings.</p>}
      <div className="space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 md:grid-cols-[1fr_130px_140px_130px_auto]">
            <input className={cn(inputCls, 'col-span-2 md:col-span-1')} value={l.name} onChange={e => patch(i, { name: e.target.value })} placeholder="Name, e.g. Salary" aria-label="Income name" />
            <input className={inputCls} type="number" min="0" step="50" inputMode="decimal" value={l.amount === 0 ? '' : l.amount} onChange={e => patch(i, { amount: Number(e.target.value) })} placeholder="Amount" aria-label="Amount" />
            <select className={inputCls} value={l.frequency} onChange={e => patch(i, { frequency: e.target.value as IncomeLine['frequency'], month: e.target.value === 'once' ? (l.month || `${year}-01`) : null })} aria-label="How often">
              <option value="monthly">Every month</option>
              <option value="once">One time</option>
            </select>
            {l.frequency === 'once' ? (
              <select className={inputCls} value={l.month || `${year}-01`} onChange={e => patch(i, { month: e.target.value })} aria-label="Month">
                {MONTHS.map((m, idx) => <option key={m} value={`${year}-${String(idx + 1).padStart(2, '0')}`}>{m} {year}</option>)}
              </select>
            ) : <span className="hidden md:block" />}
            <button onClick={() => change(lines.filter((_, idx) => idx !== i))} className="justify-self-start rounded p-2 text-ever-faint hover:bg-white/10 hover:text-ever-neg" aria-label={`Remove ${l.name || 'income line'}`} title="Remove">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="ghost" onClick={() => change([...lines, { name: '', amount: 0, frequency: 'monthly', month: null }])}><Plus className="h-4 w-4" /> Add income</Button>
        {dirty && <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save planned income'}</Button>}
      </div>
    </Card>
  );
};

const AnnualPlan: React.FC = () => {
  const queryClient = useQueryClient();
  const thisYear = new Date().getFullYear();
  const [searchParams, setSearchParams] = useSearchParams();
  const year = Number(searchParams.get('year')) || thisYear;
  const [showTable, setShowTable] = useState(false);

  const { data: plan, isLoading, error } = useQuery<PlanView>({
    queryKey: ['year-plan', year],
    queryFn: async () => {
      const res = await authedFetch(`/api/budget-plans/${year}`);
      if (!res.ok) throw new Error('Failed to load plan');
      return res.json();
    },
  });

  const refresh = () => ['year-plan', 'envelopes', 'budgetItems'].forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));

  const start = useMutation({
    mutationFn: async () => {
      const res = await authedFetch(`/api/budget-plans/${year}/start`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Could not start the plan.');
      return res.json();
    },
    onSuccess: (r: { copied: number }) => { toast.success(`${year} plan started with ${r.copied} budget lines copied from this year`); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const discard = useMutation({
    mutationFn: async () => {
      const res = await authedFetch(`/api/budget-plans/${year}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Could not discard the plan.');
      return res.json();
    },
    onSuccess: () => { toast.success(`${year} draft discarded`); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Categories drawn in a fixed order; anything unexpected folds into "Other".
  const { stackKeys, glance, compare, savings, hasIncome } = useMemo(() => {
    const rows = plan?.months || [];
    const present = new Set(rows.flatMap(r => Object.keys(r.budget_by_category)));
    const known = STACK_ORDER.filter(c => present.has(c));
    const extra = [...present].some(c => !(c in CATEGORY_COLORS));
    const keys = extra ? [...known, OTHER] : known;
    const incomeOn = rows.some(r => r.income_planned !== null);

    const glanceRows = rows.map(r => {
      const out: Record<string, number | string | null> = { label: mon(r.month), Income: r.income_planned };
      known.forEach(c => { out[c] = r.budget_by_category[c] || 0; });
      if (extra) out[OTHER] = Object.entries(r.budget_by_category).filter(([c]) => !(c in CATEGORY_COLORS)).reduce((s, [, v]) => s + v, 0);
      return out;
    });
    const compareRows = rows.map(r => ({
      label: mon(r.month),
      'Last year': r.last_year_spend,
      Plan: r.budget_total,
      Actual: r.actual_spend,
    }));
    let cumPlan = 0;
    let cumActual = 0;
    const savingsRows = rows.map(r => {
      cumPlan += (r.income_planned || 0) - r.budget_total;
      const hasActual = r.actual_spend !== null && r.actual_complete;
      if (hasActual) cumActual += (r.actual_income || 0) - (r.actual_spend || 0);
      return { label: mon(r.month), Planned: incomeOn ? Math.round(cumPlan) : null, Actual: hasActual ? Math.round(cumActual) : null };
    });
    return { stackKeys: keys, glance: glanceRows, compare: compareRows, savings: savingsRows, hasIncome: incomeOn };
  }, [plan]);

  const colorOf = (c: string) => CATEGORY_COLORS[c] || OTHER_COLOR;
  const setYear = (y: number) => setSearchParams(y === thisYear ? {} : { year: String(y) });

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-ever-ink md:text-[26px]">
          <CalendarDays className="h-6 w-6 text-ever-lime" /> Year plan
        </h1>
        <p className="mt-1 text-sm text-ever-dim">What you expect a year to look like: monthly budgets, trips, special expenses and income.</p>
      </div>
      <div className="flex gap-1">
        {[thisYear - 1, thisYear, thisYear + 1].map(y => (
          <button
            key={y}
            onClick={() => setYear(y)}
            className={cn(
              'rounded-lg px-4 py-2 text-sm transition',
              year === y ? 'bg-ever-lime font-semibold text-ever-lime-ink' : 'border border-ever-line text-ever-dim hover:text-ever-ink',
            )}
          >
            {y}
          </button>
        ))}
      </div>
    </div>
  );

  if (isLoading) return <div className="space-y-6">{header}<p className="text-sm text-ever-faint">Loading the {year} plan…</p></div>;
  if (error || !plan) return <div className="space-y-6">{header}<p className="text-sm text-ever-neg">Could not load the {year} plan. Try again.</p></div>;

  const t = plan.totals;
  const draft = plan.status === 'draft';
  const live = plan.status === 'live';
  const budgetHref = year === thisYear ? '/budgets' : `/budgets?year=${year}`;
  const busyMonths = plan.months.filter(m => m.trips.length > 0 || m.special.length > 0);
  const travelLine = plan.lines_by_category.length > 0 && plan.trips.some(tr => tr.budget);

  if (plan.status === 'not_started') {
    return (
      <div className="space-y-6">
        {header}
        <Card className="py-10 text-center">
          <h2 className="text-xl font-bold text-ever-ink">What do you expect {year} to look like?</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-ever-dim">
            Starting the {year} plan copies this year's {plan.line_count} budget lines as a first draft and fills in planned income from your recent average.
            You then adjust the lines, add trips and special expenses, and see the whole year here. Nothing about {thisYear} changes.
          </p>
          <Button className="mt-5" onClick={() => start.mutate()} disabled={start.isPending}>
            {start.isPending ? 'Starting…' : `Start the ${year} plan`}
          </Button>
        </Card>
        <Card>
          <h2 className="mb-1 text-lg font-semibold text-ever-ink">If nothing changed</h2>
          <p className="mb-3 text-xs text-ever-dim">Until you start a plan, {year} inherits this year's budget, plus any trips and special expenses already dated in {year}.</p>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <StatCard label={`${year} spending`} value={usd(t.budget)} dot="var(--ever-violet)" />
            <StatCard label={`Trips in ${year}`} value={plan.trips.length} dot="var(--ever-teal)" />
            <StatCard label="Special expenses" value={usd(plan.special_total)} dot="var(--ever-orange)" />
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      {/* Status */}
      <div className={cn('flex flex-wrap items-center justify-between gap-3 rounded-ever border p-4 text-sm', draft ? 'border-ever-violet/40 bg-ever-violet/10' : 'border-ever-line bg-ever-card')}>
        <span className="text-ever-ink">
          {draft && <><strong>Draft.</strong> This is your plan for {year}. It becomes the live budget on January 1, {year}, and a copy is saved then as the record of what you expected.</>}
          {live && <><strong>Live.</strong> These are the budgets pacing and the reports use this year.</>}
          {plan.status === 'past' && <><strong>Past year.</strong> Shown with the budget that applied then.</>}
        </span>
        <span className="flex gap-2">
          <Link to={budgetHref} className="inline-flex items-center gap-1.5 rounded-[11px] bg-ever-lime px-4 py-2 text-sm font-semibold text-ever-lime-ink hover:brightness-95">
            Edit {year} budget lines <ArrowUpRight className="h-4 w-4" />
          </Link>
          {draft && (
            <Button variant="ghost" className="text-ever-neg" disabled={discard.isPending} onClick={() => { if (window.confirm(`Discard the ${year} draft? Its budget lines and planned income are deleted. Trips and special expenses are kept.`)) discard.mutate(); }}>
              Discard draft
            </Button>
          )}
        </span>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Planned spending" value={usd(t.budget)} dot="var(--ever-violet)" sub={`${usd(t.budget / 12)} a month on average`} />
        <StatCard label="Planned income" value={t.income_planned === null ? '—' : usd(t.income_planned)} dot="var(--ever-pos)" sub={t.income_planned === null ? 'Add it below' : undefined} />
        <StatCard
          label="Planned savings"
          value={t.savings_planned === null ? '—' : <span className={t.savings_planned >= 0 ? 'text-ever-pos' : 'text-ever-neg'}>{usd(t.savings_planned)}</span>}
          dot="var(--ever-lime)"
          sub={t.savings_planned !== null && t.income_planned ? `${Math.round((t.savings_planned / t.income_planned) * 100)}% of income` : undefined}
        />
        <StatCard
          label={`${year - 1} actual spending`}
          value={t.last_year_months > 0 ? usd(t.last_year_spend) : '—'}
          dot="var(--ever-orange)"
          sub={t.last_year_months > 0 && t.last_year_months < 12 ? `${t.last_year_months} months of data` : undefined}
        />
      </div>

      {/* Original plan vs now vs actual */}
      {plan.original && (
        <Card>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-ever-ink"><Lock className="h-4 w-4 text-ever-lime" /> The plan as you first set it</h2>
          <p className="mt-0.5 text-xs text-ever-dim">
            Saved {new Date(plan.original.at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} and never changed by later budget edits.
            {plan.original.note ? ` ${plan.original.note}` : ''}
          </p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ever-dim">Original plan</div>
              <div className="mt-1 text-xl font-extrabold tabular-nums text-ever-ink">{usd(plan.original.totals.budget)}</div>
            </div>
            <div>
              <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ever-dim">Budget now</div>
              <div className="mt-1 text-xl font-extrabold tabular-nums text-ever-ink">{usd(t.budget)}</div>
              <div className="text-xs text-ever-dim">
                {Math.abs(t.budget - plan.original.totals.budget) < 1 ? 'unchanged' : `${usd(Math.abs(t.budget - plan.original.totals.budget))} ${t.budget > plan.original.totals.budget ? 'higher' : 'lower'} than first planned`}
              </div>
            </div>
            <div>
              <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ever-dim">Spent so far ({t.actual_months} mo)</div>
              <div className="mt-1 text-xl font-extrabold tabular-nums text-ever-ink">{usd(t.actual_spend)}</div>
              <div className={cn('text-xs', t.actual_spend > t.budget_to_date ? 'text-ever-neg' : 'text-ever-pos')}>
                {usd(Math.abs(t.actual_spend - t.budget_to_date))} {t.actual_spend > t.budget_to_date ? 'over' : 'under'} budget for those months
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Chart 1: the year at a glance */}
      <Card>
        <h2 className="text-lg font-semibold text-ever-ink">{year} at a glance</h2>
        <p className="mt-0.5 text-xs text-ever-dim">
          Planned spending each month by category{hasIncome ? ', with planned income as the line. A bar above the line is a month that spends more than it brings in.' : '. Add planned income below to see it against spending.'}
        </p>
        <div className="mt-4">
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={glance} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID} />
              <XAxis dataKey="label" {...axisProps} axisLine={{ stroke: GRID }} />
              <YAxis {...axisProps} axisLine={false} tickFormatter={axisUsd} width={52} />
              <Tooltip content={<ChartTooltip rows={plan.months} />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
              {stackKeys.map((c, i) => (
                <Bar key={c} dataKey={c} name={c} stackId="spend" fill={colorOf(c)} stroke={SURFACE} strokeWidth={2} maxBarSize={44}
                  radius={i === stackKeys.length - 1 ? [4, 4, 0, 0] : undefined} isAnimationActive={false} />
              ))}
              {hasIncome && <Line dataKey="Income" name="Planned income" type="monotone" stroke={INK} strokeWidth={2} dot={{ r: 3, fill: INK, stroke: SURFACE, strokeWidth: 2 }} isAnimationActive={false} />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <Legend items={[...stackKeys.map(c => ({ name: c, color: colorOf(c) })), ...(hasIncome ? [{ name: 'Planned income', color: INK, line: true }] : [])]} />

        {busyMonths.length > 0 && (
          <div className="mt-4 border-t border-ever-line pt-3">
            <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-ever-dim">Why some months are taller</div>
            <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {busyMonths.map(m => (
                <div key={m.month} className="flex gap-2 text-sm">
                  <span className="w-9 flex-none font-mono text-[11px] leading-5 text-ever-faint">{mon(m.month)}</span>
                  <span className="text-ever-ink">
                    {[...m.trips.map(tr => `${tr.name}${tr.budget_share > 0 ? ` (${usd(tr.budget_share)})` : ''}`), ...m.special.map(s => `${s.name} (${usd(s.amount)})`)].join(' · ')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Chart 2: plan vs last year vs actual */}
      <Card>
        <h2 className="text-lg font-semibold text-ever-ink">Plan against {year - 1}{t.actual_months > 0 ? ' and what has happened so far' : ''}</h2>
        <p className="mt-0.5 text-xs text-ever-dim">Each month's planned spending beside what you spent in the same month of {year - 1}{t.actual_months > 0 ? `, and this year's actual where the month has started` : ''}.</p>
        <div className="mt-4">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={compare} margin={{ top: 8, right: 12, left: 4, bottom: 0 }} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID} />
              <XAxis dataKey="label" {...axisProps} axisLine={{ stroke: GRID }} />
              <YAxis {...axisProps} axisLine={false} tickFormatter={axisUsd} width={52} />
              <Tooltip content={<ChartTooltip rows={plan.months} />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
              <Bar dataKey="Last year" name={`${year - 1} actual`} fill={SERIES.lastYear} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
              <Bar dataKey="Plan" name={`${year} plan`} fill={SERIES.plan} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
              {t.actual_months > 0 && <Bar dataKey="Actual" name={`${year} actual`} fill={SERIES.actual} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <Legend items={[
          { name: `${year - 1} actual`, color: SERIES.lastYear },
          { name: `${year} plan`, color: SERIES.plan },
          ...(t.actual_months > 0 ? [{ name: `${year} actual`, color: SERIES.actual }] : []),
        ]} />
      </Card>

      {/* Chart 3: savings building up */}
      {hasIncome && (
        <Card>
          <h2 className="text-lg font-semibold text-ever-ink">Savings over the year</h2>
          <p className="mt-0.5 text-xs text-ever-dim">Planned income minus planned spending, added up month by month. It ends at the year's planned savings{t.actual_months > 1 ? '; the second line is what has actually happened in completed months' : ''}. Taxes are not included.</p>
          <div className="mt-4">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={savings} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID} />
                <XAxis dataKey="label" {...axisProps} axisLine={{ stroke: GRID }} />
                <YAxis {...axisProps} axisLine={false} tickFormatter={axisUsd} width={52} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: DIM, strokeWidth: 1 }} />
                <ReferenceLine y={0} stroke={DIM} />
                <Line dataKey="Planned" name="Planned savings so far" type="monotone" stroke={SERIES.plan} strokeWidth={2} dot={{ r: 3, fill: SERIES.plan, stroke: SURFACE, strokeWidth: 2 }} isAnimationActive={false} />
                <Line dataKey="Actual" name="Actual savings so far" type="monotone" stroke={SERIES.actual} strokeWidth={2} dot={{ r: 3, fill: SERIES.actual, stroke: SURFACE, strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <Legend items={[{ name: 'Planned', color: SERIES.plan, line: true }, ...(t.actual_months > 1 ? [{ name: 'Actual', color: SERIES.actual, line: true }] : [])]} />
        </Card>
      )}

      {/* The numbers behind the charts */}
      <div className="rounded-ever border border-ever-line bg-ever-card">
        <button onClick={() => setShowTable(v => !v)} className="flex w-full items-center gap-2 px-5 py-4 text-left text-sm font-semibold text-ever-ink hover:bg-white/5" aria-expanded={showTable}>
          {showTable ? <ChevronDown className="h-4 w-4 text-ever-dim" /> : <ChevronRight className="h-4 w-4 text-ever-dim" />}
          Month-by-month numbers
        </button>
        {showTable && (
          <div className="overflow-x-auto border-t border-ever-line">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-ever-dim">
                  <th className="px-5 py-2 font-medium">Month</th>
                  <th className="px-4 py-2 text-right font-medium">Planned spending</th>
                  <th className="px-4 py-2 text-right font-medium">Planned income</th>
                  <th className="px-4 py-2 text-right font-medium">Planned net</th>
                  <th className="px-4 py-2 text-right font-medium">{year - 1} actual</th>
                  <th className="px-4 py-2 text-right font-medium">{year} actual</th>
                </tr>
              </thead>
              <tbody>
                {plan.months.map(m => {
                  const net = m.income_planned === null ? null : m.income_planned - m.budget_total;
                  return (
                    <tr key={m.month} className="border-t border-ever-line/60">
                      <td className="px-5 py-2 text-ever-ink">{mon(m.month)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-ever-ink">{usd(m.budget_total)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-ever-dim">{m.income_planned === null ? '—' : usd(m.income_planned)}</td>
                      <td className={cn('px-4 py-2 text-right font-semibold tabular-nums', net === null ? 'text-ever-faint' : net >= 0 ? 'text-ever-pos' : 'text-ever-neg')}>{net === null ? '—' : usd(net)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-ever-dim">{m.last_year_spend === null ? '—' : usd(m.last_year_spend)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-ever-dim">{m.actual_spend === null ? '—' : `${usd(m.actual_spend)}${m.actual_complete ? '' : ' so far'}`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* The four ingredients */}
      {plan.status !== 'past' && <IncomeEditor key={`${year}-${plan.income_lines.length}`} year={year} initial={plan.income_lines} onSaved={refresh} />}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold text-ever-ink">Monthly budgets</h2>
            <Link to={budgetHref} className="font-mono text-[10.5px] text-ever-lime hover:underline">Edit {plan.line_count} lines</Link>
          </div>
          {plan.lines_by_category.map(c => (
            <div key={c.category} className="flex items-center justify-between gap-3 border-t border-ever-line py-2 text-sm first:border-t-0">
              <span className="flex items-center gap-2 text-ever-ink"><Swatch color={colorOf(c.category)} />{c.category}<span className="text-xs text-ever-faint">{c.lines} line{c.lines === 1 ? '' : 's'}</span></span>
              <span className="font-semibold tabular-nums text-ever-ink">{usd(c.monthly)}<span className="text-xs font-normal text-ever-dim"> /mo</span></span>
            </div>
          ))}
        </Card>

        <Card>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-ever-ink"><Plane className="h-4 w-4 text-ever-lime" /> Trips in {year}</h2>
            <Link to="/trips" className="font-mono text-[10.5px] text-ever-lime hover:underline">Add or edit trips</Link>
          </div>
          {plan.trips.length === 0 && <p className="text-sm text-ever-faint">No trips dated in {year} yet. Add one on the Trips page with a budget and it appears in the chart above.</p>}
          {plan.trips.map(tr => (
            <div key={tr.id} className="flex items-center justify-between gap-3 border-t border-ever-line py-2 text-sm first:border-t-0">
              <span className="min-w-0">
                <span className="block truncate text-ever-ink">{tr.name}</span>
                <span className="font-mono text-[11px] text-ever-dim">{mon(tr.start_date)} {Number(tr.start_date.slice(8))} – {mon(tr.end_date)} {Number(tr.end_date.slice(8))}</span>
              </span>
              <span className="whitespace-nowrap font-semibold tabular-nums text-ever-ink">{tr.budget ? usd(tr.budget) : <span className="text-xs font-normal text-ever-faint">no budget set</span>}</span>
            </div>
          ))}
          {travelLine && (
            <p className="mt-3 text-xs text-ever-dim">In a month with a budgeted trip, the trip's budget replaces your monthly travel line. If every trip has its own budget, set the travel line to what you'd spend on travel outside those trips.</p>
          )}
        </Card>
      </div>

      {plan.status !== 'past' && <PlannedCosts />}
    </div>
  );
};

export default AnnualPlan;
