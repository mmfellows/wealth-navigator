// Financial projection engine — pure math, no I/O.
//
// Powers the Planner chat: Claude describes a scenario (starting balances,
// monthly savings, a risk profile or explicit return/volatility, horizon,
// optional retirement phase, one-off events) and this module turns it into
// a deterministic path plus a Monte Carlo fan (p10/p25/p50/p75/p90) and a
// probability of hitting a target. Everything runs monthly so contributions,
// withdrawals and debt paydown compound correctly.
//
// Returns are nominal unless noted; `real_*` fields deflate by `inflation`.
// The PRNG is seeded so the same scenario always gives the same numbers —
// important when the user asks "run that again with X changed".

const RISK_PROFILES = {
  conservative: {
    label: 'Conservative',
    expected_return: 0.045,
    volatility: 0.06,
    description: 'Mostly bonds/cash with some equities (~30/70). Long-run nominal ~4.5%/yr, ~6% annual volatility.',
  },
  moderate: {
    label: 'Moderate',
    expected_return: 0.065,
    volatility: 0.11,
    description: 'Balanced 60/40 stocks/bonds. Long-run nominal ~6.5%/yr, ~11% annual volatility.',
  },
  aggressive: {
    label: 'Aggressive',
    expected_return: 0.085,
    volatility: 0.16,
    description: 'All-equity, diversified. Long-run nominal ~8.5%/yr, ~16% annual volatility.',
  },
  cash: {
    label: 'Cash / T-bills',
    expected_return: 0.035,
    volatility: 0.005,
    description: 'High-yield savings or T-bills. ~3.5%/yr nominal, near-zero volatility.',
  },
};

const DEFAULTS = {
  years: 30,
  inflation: 0.03,
  contribution_growth: 0.03, // raises the monthly contribution each year
  simulations: 1000,
  seed: 42,
  cash_yield: 0.035,
};

// mulberry32 — small seeded PRNG, plenty for planning-grade Monte Carlo.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box–Muller standard normal from a uniform source.
function makeNormal(rand) {
  let spare = null;
  return function () {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u, v, s;
    do {
      u = rand() * 2 - 1;
      v = rand() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const mul = Math.sqrt(-2 * Math.log(s) / s);
    spare = v * mul;
    return u * mul;
  };
}

function percentile(sortedArr, p) {
  if (sortedArr.length === 0) return 0;
  const idx = (sortedArr.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedArr[lo];
  return sortedArr[lo] + (sortedArr[hi] - sortedArr[lo]) * (idx - lo);
}

function resolveReturnAssumptions(scenario) {
  const profileKey = (scenario.risk_profile || '').toLowerCase();
  const profile = RISK_PROFILES[profileKey];
  const expected = scenario.expected_return != null ? scenario.expected_return : profile ? profile.expected_return : RISK_PROFILES.moderate.expected_return;
  const vol = scenario.volatility != null ? scenario.volatility : profile ? profile.volatility : RISK_PROFILES.moderate.volatility;
  return {
    risk_profile: profile ? profileKey : (scenario.expected_return != null ? 'custom' : 'moderate'),
    expected_return: expected,
    volatility: vol,
  };
}

// Normalise the user-facing scenario into the internal shape. Every field is
// optional; the Planner tools fill starting balances from the live snapshot.
function normaliseScenario(input = {}) {
  const s = { ...DEFAULTS, ...input };
  const ret = resolveReturnAssumptions(s);
  const years = Math.max(1, Math.min(70, Math.round(s.years)));
  const debt = s.debt ? {
    balance: Math.max(0, s.debt.balance || 0),
    apr: s.debt.apr != null ? s.debt.apr : 0.07,
    monthly_payment: Math.max(0, s.debt.monthly_payment || 0),
    redirect_payment_when_paid_off: s.debt.redirect_payment_when_paid_off !== false,
  } : null;
  const retirement = s.retirement ? {
    starts_in_years: Math.max(0, Math.min(years, s.retirement.starts_in_years != null ? s.retirement.starts_in_years : years)),
    annual_spend: Math.max(0, s.retirement.annual_spend || 0),
    spend_grows_with_inflation: s.retirement.spend_grows_with_inflation !== false,
    annual_income: Math.max(0, s.retirement.annual_income || 0), // social security, pension, part-time
    retirement_risk_profile: s.retirement.risk_profile || null,
  } : null;
  const events = Array.isArray(s.events) ? s.events
    .filter(e => e && typeof e.year === 'number' && typeof e.amount === 'number')
    .map(e => ({ year: Math.max(0, Math.round(e.year)), amount: e.amount, label: e.label || '' })) : [];

  return {
    name: s.name || 'Scenario',
    starting_cash: Math.max(0, s.starting_cash || 0),
    starting_investments: Math.max(0, s.starting_investments || 0),
    monthly_contribution: s.monthly_contribution || 0, // can be negative (drawdown)
    contribution_growth: s.contribution_growth,
    cash_reserve_target: Math.max(0, s.cash_reserve_target != null ? s.cash_reserve_target : s.starting_cash || 0),
    cash_yield: s.cash_yield,
    years,
    inflation: s.inflation,
    simulations: Math.max(100, Math.min(5000, Math.round(s.simulations))),
    seed: s.seed,
    target_net_worth: s.target_net_worth || null,
    current_age: s.current_age || null,
    debt,
    retirement,
    events,
    ...ret,
  };
}

// Simulate one path. `drawReturn(monthIdx)` returns a monthly gross return
// multiplier for investments; for the deterministic path it's constant.
// Returns yearly rows.
function simulatePath(sc, drawReturn) {
  let cash = sc.starting_cash;
  let invested = sc.starting_investments;
  let debt = sc.debt ? sc.debt.balance : 0;
  let contribution = sc.monthly_contribution;
  let cumulativeContrib = 0;
  const retStartMonth = sc.retirement ? Math.round(sc.retirement.starts_in_years * 12) : Infinity;
  const spendMonthly0 = sc.retirement ? sc.retirement.annual_spend / 12 : 0;
  const incomeMonthly0 = sc.retirement ? sc.retirement.annual_income / 12 : 0;
  const cashYieldM = Math.pow(1 + sc.cash_yield, 1 / 12) - 1;
  const inflM = Math.pow(1 + sc.inflation, 1 / 12) - 1;
  let inflIndex = 1;
  let ranOut = false;
  let ranOutYear = null;
  let debtPaidOffYear = sc.debt && sc.debt.balance > 0 ? null : 0;
  const eventsByMonth = new Map();
  for (const e of sc.events) {
    const m = e.year * 12;
    eventsByMonth.set(m, (eventsByMonth.get(m) || 0) + e.amount);
  }

  const rows = [{
    year: 0, cash, invested, debt, net_worth: cash + invested - debt,
    contributions_cumulative: 0, inflation_index: 1,
  }];

  const totalMonths = sc.years * 12;
  for (let m = 1; m <= totalMonths; m++) {
    inflIndex *= 1 + inflM;
    const inRetirement = m > retStartMonth;

    // Growth
    invested *= drawReturn(m, inRetirement);
    cash *= 1 + cashYieldM;

    // Debt accrues interest, then the payment comes out of cash flow.
    let freeCashFlow = 0;
    if (inRetirement) {
      const spend = spendMonthly0 * (sc.retirement.spend_grows_with_inflation ? inflIndex : 1);
      const income = incomeMonthly0 * inflIndex;
      freeCashFlow = income - spend;
    } else {
      freeCashFlow = contribution;
    }
    if (debt > 0 && sc.debt) {
      debt *= 1 + sc.debt.apr / 12;
      const pay = Math.min(debt, sc.debt.monthly_payment);
      debt -= pay;
      freeCashFlow -= pay;
      if (debt <= 0.005) {
        debt = 0;
        if (debtPaidOffYear == null) debtPaidOffYear = m / 12;
        // From here on the old payment becomes savings unless disabled.
        // The payment stops next month. By default it flows into savings;
        // if the user says it'll be spent instead, shrink the contribution.
        if (!sc.debt.redirect_payment_when_paid_off) contribution -= sc.debt.monthly_payment;
      }
    }

    // One-off events (positive = inflow like a bonus/inheritance, negative = outflow like a house down payment)
    const ev = eventsByMonth.get(m);
    if (ev) freeCashFlow += ev;

    // Route cash flow: top up the cash reserve first, invest the rest;
    // shortfalls come out of cash, then investments.
    if (freeCashFlow >= 0) {
      const reserveGap = Math.max(0, sc.cash_reserve_target * inflIndex - cash);
      const toCash = Math.min(freeCashFlow, reserveGap);
      cash += toCash;
      invested += freeCashFlow - toCash;
      if (!inRetirement) cumulativeContrib += freeCashFlow;
    } else {
      let need = -freeCashFlow;
      const fromCash = Math.min(cash, need);
      cash -= fromCash; need -= fromCash;
      invested -= need;
      if (invested < 0) {
        invested = 0;
        if (!ranOut) { ranOut = true; ranOutYear = m / 12; }
      }
    }

    // Annual step-ups
    if (m % 12 === 0) {
      contribution *= 1 + sc.contribution_growth;
      rows.push({
        year: m / 12, cash, invested, debt,
        net_worth: cash + invested - debt,
        contributions_cumulative: cumulativeContrib,
        inflation_index: inflIndex,
      });
    }
  }

  return { rows, ranOut, ranOutYear, debtPaidOffYear };
}

function runProjection(input = {}) {
  const sc = normaliseScenario(input);
  const monthlyMu = Math.log(1 + sc.expected_return) / 12;
  const monthlySigma = sc.volatility / Math.sqrt(12);
  const retProfile = sc.retirement && sc.retirement.retirement_risk_profile
    ? RISK_PROFILES[sc.retirement.retirement_risk_profile.toLowerCase()] : null;
  const retMu = retProfile ? Math.log(1 + retProfile.expected_return) / 12 : monthlyMu;
  const retSigma = retProfile ? retProfile.volatility / Math.sqrt(12) : monthlySigma;

  // Deterministic: constant expected return.
  const det = simulatePath(sc, (m, inRet) => Math.exp(inRet ? retMu : monthlyMu));

  // Monte Carlo: lognormal monthly returns.
  const rand = mulberry32(sc.seed);
  const normal = makeNormal(rand);
  const n = sc.simulations;
  const yearsCount = sc.years + 1;
  const nwByYear = Array.from({ length: yearsCount }, () => new Array(n));
  let successCount = 0; // hit target (if any) by horizon
  let survivedCount = 0; // never ran out
  let targetHitYears = [];
  let ranOutYears = [];
  for (let i = 0; i < n; i++) {
    const path = simulatePath(sc, (m, inRet) => {
      const mu = inRet ? retMu : monthlyMu;
      const sg = inRet ? retSigma : monthlySigma;
      return Math.exp(mu - (sg * sg) / 2 + sg * normal());
    });
    let hitYear = null;
    for (let y = 0; y < yearsCount; y++) {
      const nw = path.rows[y].net_worth;
      nwByYear[y][i] = nw;
      if (sc.target_net_worth && hitYear == null && nw >= sc.target_net_worth) hitYear = y;
    }
    if (hitYear != null) { successCount++; targetHitYears.push(hitYear); }
    if (!path.ranOut) survivedCount++; else ranOutYears.push(path.ranOutYear);
  }

  const yearly = det.rows.map((row, y) => {
    const sorted = nwByYear[y].slice().sort((a, b) => a - b);
    const p10 = percentile(sorted, 0.1), p25 = percentile(sorted, 0.25), p50 = percentile(sorted, 0.5);
    const p75 = percentile(sorted, 0.75), p90 = percentile(sorted, 0.9);
    const age = sc.current_age ? sc.current_age + y : undefined;
    return {
      year: y,
      calendar_year: new Date().getFullYear() + y,
      ...(age != null ? { age } : {}),
      expected: Math.round(row.net_worth),
      cash: Math.round(row.cash),
      invested: Math.round(row.invested),
      debt: Math.round(row.debt),
      contributions_cumulative: Math.round(row.contributions_cumulative),
      p10: Math.round(p10), p25: Math.round(p25), p50: Math.round(p50), p75: Math.round(p75), p90: Math.round(p90),
      real_expected: Math.round(row.net_worth / row.inflation_index),
      real_p50: Math.round(p50 / row.inflation_index),
    };
  });

  const last = yearly[yearly.length - 1];
  const summary = {
    horizon_years: sc.years,
    final_expected: last.expected,
    final_p10: last.p10,
    final_p50: last.p50,
    final_p90: last.p90,
    final_real_p50: last.real_p50,
    total_contributions: last.contributions_cumulative,
    growth_share_of_final: last.expected > 0
      ? Math.round(100 * (1 - (sc.starting_cash + sc.starting_investments + last.contributions_cumulative) / last.expected))
      : 0,
    ...(sc.target_net_worth ? {
      target_net_worth: sc.target_net_worth,
      probability_of_reaching_target: Math.round(1000 * successCount / n) / 10,
      expected_year_target_reached: (() => {
        const y = det.rows.findIndex(r => r.net_worth >= sc.target_net_worth);
        return y >= 0 ? y : null;
      })(),
      median_year_target_reached: targetHitYears.length ? percentile(targetHitYears.sort((a, b) => a - b), 0.5) : null,
    } : {}),
    ...(sc.retirement ? {
      retirement_starts_in_years: sc.retirement.starts_in_years,
      net_worth_at_retirement_expected: yearly[Math.round(sc.retirement.starts_in_years)]?.expected ?? null,
      net_worth_at_retirement_p10: yearly[Math.round(sc.retirement.starts_in_years)]?.p10 ?? null,
    } : {}),
    // Run-out odds matter for any scenario that draws down — a retirement
    // phase, a negative contribution, or big outflow events.
    ...(sc.retirement || sc.monthly_contribution < 0 || survivedCount < n ? {
      probability_money_lasts: Math.round(1000 * survivedCount / n) / 10,
      expected_path_runs_out: det.ranOut,
      expected_path_runs_out_year: det.ranOutYear != null ? Math.round(det.ranOutYear * 10) / 10 : null,
      median_run_out_year: ranOutYears.length ? Math.round(percentile(ranOutYears.sort((a, b) => a - b), 0.5) * 10) / 10 : null,
    } : {}),
    ...(sc.debt && sc.debt.balance > 0 ? {
      debt_paid_off_in_years: det.debtPaidOffYear != null ? Math.round(det.debtPaidOffYear * 10) / 10 : null,
    } : {}),
  };

  return {
    scenario: {
      name: sc.name,
      starting_cash: sc.starting_cash,
      starting_investments: sc.starting_investments,
      monthly_contribution: sc.monthly_contribution,
      contribution_growth: sc.contribution_growth,
      cash_reserve_target: sc.cash_reserve_target,
      risk_profile: sc.risk_profile,
      expected_return: sc.expected_return,
      volatility: sc.volatility,
      years: sc.years,
      inflation: sc.inflation,
      target_net_worth: sc.target_net_worth,
      current_age: sc.current_age,
      debt: sc.debt,
      retirement: sc.retirement,
      events: sc.events,
      simulations: sc.simulations,
    },
    summary,
    yearly,
  };
}

// How much per month (today's dollars, growing with contribution_growth) is
// needed to reach `target_net_worth` in `years` on the expected path?
// Bisection on the deterministic projection.
function solveMonthlyContribution(input = {}) {
  const base = { ...input };
  const target = base.target_net_worth;
  if (!target) throw new Error('target_net_worth is required');
  const finalExpected = (contrib) => runProjection({ ...base, monthly_contribution: contrib, simulations: 100 }).summary.final_expected;
  let lo = -50000, hi = 200000;
  if (finalExpected(lo) >= target) return { monthly_contribution: lo, note: 'Target is reached even with heavy withdrawals.' };
  if (finalExpected(hi) < target) return { monthly_contribution: null, note: 'Target unreachable within the horizon even at $200k/month.' };
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (finalExpected(mid) >= target) hi = mid; else lo = mid;
  }
  const result = runProjection({ ...base, monthly_contribution: hi });
  return {
    monthly_contribution: Math.round(hi),
    probability_of_reaching_target: result.summary.probability_of_reaching_target,
    final_expected: result.summary.final_expected,
  };
}

// Years until the expected path first reaches the target (null if never
// within 70 years). Also reports the p10/p90 timing from Monte Carlo.
function solveYearsToTarget(input = {}) {
  const target = input.target_net_worth;
  if (!target) throw new Error('target_net_worth is required');
  const result = runProjection({ ...input, years: Math.max(input.years || 0, 40), target_net_worth: target });
  return {
    expected_years: result.summary.expected_year_target_reached,
    median_years: result.summary.median_year_target_reached,
    probability_within_horizon: result.summary.probability_of_reaching_target,
    horizon_years: result.scenario.years,
  };
}

// Sustainable annual spend from a portfolio: the largest inflation-adjusted
// annual withdrawal that keeps `probability_money_lasts` >= success_target.
function solveSustainableSpend(input = {}) {
  const successTarget = input.success_target != null ? input.success_target : 85;
  const years = input.years || 30;
  const probFor = (spend) => runProjection({
    ...input,
    years,
    monthly_contribution: 0,
    retirement: { starts_in_years: 0, annual_spend: spend, annual_income: input.annual_income || 0, spend_grows_with_inflation: true },
  }).summary.probability_money_lasts;
  const nw = (input.starting_cash || 0) + (input.starting_investments || 0);
  let lo = 0, hi = Math.max(1000, nw * 0.2);
  if (probFor(hi) >= successTarget) return { annual_spend: Math.round(hi), probability_money_lasts: probFor(hi), note: 'Even 20%/yr survives; portfolio income dominates.' };
  for (let i = 0; i < 25; i++) {
    const mid = (lo + hi) / 2;
    if (probFor(mid) >= successTarget) lo = mid; else hi = mid;
  }
  return {
    annual_spend: Math.round(lo),
    withdrawal_rate_pct: nw > 0 ? Math.round(1000 * lo / nw) / 10 : null,
    probability_money_lasts: probFor(lo),
    success_target: successTarget,
    years,
  };
}

module.exports = {
  RISK_PROFILES,
  DEFAULTS,
  normaliseScenario,
  runProjection,
  solveMonthlyContribution,
  solveYearsToTarget,
  solveSustainableSpend,
};
