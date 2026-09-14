import React, { useMemo, useState } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { fmtUSD } from '../ui';

export interface ProjectionYear {
  year: number;
  calendar_year?: number;
  age?: number;
  expected: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  real_p50?: number;
}

export interface ProjectionSummary {
  horizon_years: number;
  final_expected: number;
  final_p10: number;
  final_p50: number;
  final_p90: number;
  final_real_p50?: number;
  total_contributions?: number;
  target_net_worth?: number;
  probability_of_reaching_target?: number;
  expected_year_target_reached?: number | null;
  retirement_starts_in_years?: number;
  probability_money_lasts?: number;
  median_run_out_year?: number | null;
  debt_paid_off_in_years?: number | null;
}

export interface ProjectionScenario {
  name: string;
  scenario: {
    risk_profile?: string;
    expected_return?: number;
    volatility?: number;
    monthly_contribution?: number;
    years?: number;
    target_net_worth?: number | null;
    retirement?: { starts_in_years: number } | null;
  };
  summary: ProjectionSummary;
  yearly: ProjectionYear[];
}

// Evergreen palette: lime for the headline path, violet/teal/orange for
// comparison overlays, a translucent lime fan for the Monte Carlo spread.
const SERIES_COLORS = ['#c9f04e', '#8b6ff0', '#38a790', '#efb15b', '#eb8f6c'];
const INK = '#ebf2ec';
const DIM = '#9db3a7';
const LINE = '#2c4d43';

const fmtCompact = (n: number | null | undefined) => fmtUSD(n, { compact: true });

const PROFILE_LABEL: Record<string, string> = {
  conservative: 'Conservative', moderate: 'Moderate', aggressive: 'Aggressive', cash: 'Cash', custom: 'Custom',
};

function describeScenario(s: ProjectionScenario['scenario']) {
  const bits: string[] = [];
  const profile = PROFILE_LABEL[s.risk_profile || ''] || s.risk_profile;
  if (profile && s.expected_return != null) bits.push(`${profile} · ${(s.expected_return * 100).toFixed(1)}%/yr`);
  if (s.monthly_contribution != null) bits.push(`${fmtUSD(s.monthly_contribution)}/mo`);
  if (s.retirement) bits.push(`retire in ${s.retirement.starts_in_years}y`);
  return bits.join(' · ');
}

interface Props {
  scenarios: ProjectionScenario[];
}

const ProjectionChart: React.FC<Props> = ({ scenarios }) => {
  const [real, setReal] = useState(false);
  const single = scenarios.length === 1;
  const primary = scenarios[0];
  const useAge = scenarios.every(s => s.yearly[0]?.age != null);

  // One row per year; each scenario contributes its own keys so the
  // overlay chart can draw them from a single data array.
  const data = useMemo(() => {
    const maxYears = Math.max(...scenarios.map(s => s.yearly.length));
    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < maxYears; i++) {
      const base = primary.yearly[Math.min(i, primary.yearly.length - 1)];
      const row: Record<string, unknown> = {
        year: i,
        x: useAge ? base.age : (base.calendar_year ?? new Date().getFullYear() + i),
      };
      scenarios.forEach((s, idx) => {
        const y = s.yearly[i];
        if (!y) return;
        row[`p50_${idx}`] = real && y.real_p50 != null ? y.real_p50 : y.p50;
        if (idx === 0 && !real) {
          row.expected = y.expected;
          row.band = [y.p10, y.p90];
          row.inner = [y.p25, y.p75];
        }
      });
      rows.push(row);
    }
    return rows;
  }, [scenarios, primary, real, useAge]);

  const target = primary.summary.target_net_worth ?? primary.scenario.target_net_worth ?? null;
  const retireIn = primary.scenario.retirement?.starts_in_years ?? primary.summary.retirement_starts_in_years;
  const retireX = retireIn != null ? (data[Math.min(Math.round(retireIn), data.length - 1)]?.x as number | undefined) : undefined;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[13px] font-semibold text-ever-ink">
            {single ? primary.name : `${scenarios.length} scenarios`}
          </div>
          <div className="font-mono text-[10.5px] tracking-wide text-ever-dim">
            {single ? describeScenario(primary.scenario) : 'Median paths'}
            {single && ' · fan = 10th–90th percentile of 1,000 simulations'}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setReal(r => !r)}
          className={`font-mono text-[10.5px] uppercase tracking-[0.14em] rounded-pill border px-2.5 py-1 transition ${real ? 'border-ever-lime text-ever-lime' : 'border-ever-line text-ever-dim hover:text-ever-ink'}`}
          title="Toggle inflation-adjusted (today's dollars) view"
        >
          {real ? "Today's $" : 'Nominal $'}
        </button>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={LINE} vertical={false} />
          <XAxis dataKey="x" tick={{ fontSize: 11, fill: DIM }} stroke={LINE} tickFormatter={(v: number) => (useAge ? `${v}` : String(v))} />
          <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 11, fill: DIM }} stroke={LINE} width={64} />
          <Tooltip
            labelFormatter={(v: number) => (useAge ? `Age ${v}` : String(v))}
            formatter={(v: number | number[], name: string) => {
              if (Array.isArray(v)) return [`${fmtCompact(v[0])} – ${fmtCompact(v[1])}`, name];
              return [fmtUSD(v), name];
            }}
            labelStyle={{ color: INK }}
            contentStyle={{ borderRadius: '10px', border: `1px solid ${LINE}`, background: '#15221d', color: INK, fontSize: '13px' }}
            cursor={{ stroke: DIM, strokeDasharray: '3 3' }}
          />
          {single && !real && (
            <>
              <Area type="monotone" dataKey="band" name="10th–90th pct" stroke="none" fill={SERIES_COLORS[0]} fillOpacity={0.12} isAnimationActive={false} />
              <Area type="monotone" dataKey="inner" name="25th–75th pct" stroke="none" fill={SERIES_COLORS[0]} fillOpacity={0.18} isAnimationActive={false} />
              <Line type="monotone" dataKey="expected" name="Expected" stroke={INK} strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
            </>
          )}
          {scenarios.map((s, idx) => (
            <Line
              key={s.name + idx}
              type="monotone"
              dataKey={`p50_${idx}`}
              name={single ? (real ? "Median (today's $)" : 'Median') : s.name}
              stroke={SERIES_COLORS[idx % SERIES_COLORS.length]}
              strokeWidth={2.25}
              dot={false}
              isAnimationActive={false}
            />
          ))}
          {target != null && !real && (
            <ReferenceLine y={target} stroke={DIM} strokeDasharray="2 4" label={{ value: `Target ${fmtCompact(target)}`, fill: DIM, fontSize: 10.5, position: 'insideTopLeft' }} />
          )}
          {retireX != null && (
            <ReferenceLine x={retireX} stroke={DIM} strokeDasharray="2 4" label={{ value: 'Retire', fill: DIM, fontSize: 10.5, position: 'insideTopRight' }} />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {single ? (
        <SummaryChips summary={primary.summary} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] font-mono">
            <thead>
              <tr className="text-ever-dim text-left">
                <th className="py-1 pr-3 font-normal">Scenario</th>
                <th className="py-1 pr-3 font-normal text-right">Downside (p10)</th>
                <th className="py-1 pr-3 font-normal text-right">Median</th>
                <th className="py-1 pr-3 font-normal text-right">Upside (p90)</th>
                {scenarios.some(s => s.summary.probability_of_reaching_target != null) && <th className="py-1 font-normal text-right">Hit target</th>}
                {scenarios.some(s => s.summary.probability_money_lasts != null) && <th className="py-1 font-normal text-right">Money lasts</th>}
              </tr>
            </thead>
            <tbody>
              {scenarios.map((s, idx) => (
                <tr key={s.name + idx} className="border-t border-ever-line text-ever-ink">
                  <td className="py-1.5 pr-3 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: SERIES_COLORS[idx % SERIES_COLORS.length] }} />
                    <span className="truncate">{s.name}</span>
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{fmtCompact(s.summary.final_p10)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{fmtCompact(s.summary.final_p50)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{fmtCompact(s.summary.final_p90)}</td>
                  {scenarios.some(x => x.summary.probability_of_reaching_target != null) && (
                    <td className="py-1.5 text-right tabular-nums">{s.summary.probability_of_reaching_target != null ? `${s.summary.probability_of_reaching_target}%` : '—'}</td>
                  )}
                  {scenarios.some(x => x.summary.probability_money_lasts != null) && (
                    <td className="py-1.5 text-right tabular-nums">{s.summary.probability_money_lasts != null ? `${s.summary.probability_money_lasts}%` : '—'}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const Chip: React.FC<{ label: string; value: React.ReactNode; tone?: 'pos' | 'neg' | 'default' }> = ({ label, value, tone = 'default' }) => (
  <div className="rounded-[11px] border border-ever-line bg-white/[0.03] px-3 py-2 min-w-[7.5rem]">
    <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ever-dim">{label}</div>
    <div className={`mt-0.5 font-grotesk text-[15px] font-bold tabular-nums ${tone === 'pos' ? 'text-ever-pos' : tone === 'neg' ? 'text-ever-neg' : 'text-ever-ink'}`}>{value}</div>
  </div>
);

const SummaryChips: React.FC<{ summary: ProjectionSummary }> = ({ summary: s }) => {
  const toneFor = (p?: number) => (p == null ? 'default' : p >= 80 ? 'pos' : p < 50 ? 'neg' : 'default');
  return (
    <div className="flex flex-wrap gap-2">
      <Chip label={`Median in ${s.horizon_years}y`} value={fmtCompact(s.final_p50)} />
      <Chip label="Downside · Upside" value={`${fmtCompact(s.final_p10)} · ${fmtCompact(s.final_p90)}`} />
      {s.final_real_p50 != null && <Chip label="Median, today's $" value={fmtCompact(s.final_real_p50)} />}
      {s.probability_of_reaching_target != null && (
        <Chip label="Reach target" value={`${s.probability_of_reaching_target}%`} tone={toneFor(s.probability_of_reaching_target)} />
      )}
      {s.probability_money_lasts != null && (
        <Chip label="Money lasts" value={`${s.probability_money_lasts}%`} tone={toneFor(s.probability_money_lasts)} />
      )}
      {s.debt_paid_off_in_years != null && <Chip label="Debt-free in" value={`${s.debt_paid_off_in_years}y`} />}
    </div>
  );
};

export default ProjectionChart;
