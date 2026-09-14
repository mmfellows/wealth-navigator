// Planner chat — Claude as a financial-planning conversation partner.
//
// Builds on the finance chat (same tool-runner + SSE pattern, same live-data
// tools) and adds a projection layer: the model can pull a planning
// baseline (balance sheet + income/burn + net-worth trend + saved profile),
// run deterministic + Monte Carlo projections under different risk
// profiles, compare scenarios side by side, and solve for goals ("how much
// per month to hit $X by 2045", "when can I retire", "what can I spend").
//
// Scenario results are pushed to the client as `scenario` SSE events so the
// UI renders a fan chart inline with the answer. Conversations persist as
// whole threads in `planning_conversations` so the user can pick one back up.

const Anthropic = require('@anthropic-ai/sdk');
const { betaTool } = require('@anthropic-ai/sdk/helpers/beta/json-schema');
const { db } = require('./database');
const { computeSnapshot } = require('./snapshotService');
const { buildTools: buildFinanceTools, MODEL } = require('./financeChatService');
const engine = require('./projectionEngine');

const MAX_ITERATIONS = 10;
const HISTORY_TURNS = 30;
const MAX_STORED_SCENARIOS = 6;

let client = null;
function getClient() {
  if (!client && process.env.ANTHROPIC_API_KEY) client = new Anthropic();
  return client;
}
function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const fmtUsd = (n) => (n == null || isNaN(n) ? '—' : `$${Math.round(n).toLocaleString('en-US')}`);
const pct = (n, d = 1) => (n == null || isNaN(n) ? '—' : `${(n * 100).toFixed(d)}%`);

// ---------------------------------------------------------------------------
// Planning profile — facts the user tells the planner that aren't derivable
// from transactions (age, retirement target, goals). One doc per user.

const PROFILE_FIELDS = [
  'current_age', 'target_retirement_age', 'retirement_annual_spend',
  'retirement_annual_income', 'risk_tolerance', 'target_net_worth',
  'goals', 'notes',
];

async function getProfile(userId) {
  const doc = await db.collection('planning_profiles').doc(userId).get();
  return doc.exists ? doc.data() : {};
}

async function saveProfile(userId, patch) {
  const clean = {};
  for (const key of PROFILE_FIELDS) {
    if (patch[key] !== undefined) clean[key] = patch[key];
  }
  clean.updated_at = new Date().toISOString();
  await db.collection('planning_profiles').doc(userId).set(clean, { merge: true });
  return getProfile(userId);
}

// ---------------------------------------------------------------------------
// Baseline — everything a projection needs, from live data.

async function buildTrailingStats() {
  const now = new Date();
  const currentMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const start = new Date(now.getFullYear(), now.getMonth() - 12, 1);
  const startDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`;

  const snapshot = await db.collection('expenses')
    .where('date', '>=', startDate)
    .where('date', '<', currentMonthStart)
    .get();

  const monthMap = {};
  snapshot.docs.forEach(doc => {
    const e = doc.data();
    if (e.is_transfer) return;
    const month = (e.date || '').substring(0, 7);
    if (!month) return;
    const m = monthMap[month] = monthMap[month] || { month, spend: 0, income: 0, taxes: 0 };
    if (e.category === 'Income') m.income += -e.amount;
    else if (e.category === 'Taxes') m.taxes += e.amount;
    else m.spend += e.amount;
  });
  const byMonth = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month));
  const windowStats = (n) => {
    const slice = byMonth.slice(-n);
    if (slice.length === 0) return { months: 0, avg_spend: 0, avg_income: 0, avg_taxes: 0, avg_net: 0, savings_rate: null };
    const sum = (f) => slice.reduce((s, m) => s + f(m), 0);
    const avgSpend = sum(m => m.spend) / slice.length;
    const avgIncome = sum(m => m.income) / slice.length;
    const avgTaxes = sum(m => m.taxes) / slice.length;
    const avgNet = avgIncome - avgSpend - avgTaxes;
    return {
      months: slice.length,
      avg_spend: Math.round(avgSpend),
      avg_income: Math.round(avgIncome),
      avg_taxes: Math.round(avgTaxes),
      avg_net: Math.round(avgNet),
      savings_rate: avgIncome > 0 ? Math.round(1000 * avgNet / avgIncome) / 1000 : null,
    };
  };
  return {
    windows: { m3: windowStats(3), m6: windowStats(6), m12: windowStats(12) },
    by_month: byMonth.map(m => ({ month: m.month, spend: Math.round(m.spend), income: Math.round(m.income), taxes: Math.round(m.taxes) })),
  };
}

async function buildNetWorthHistory(userId, months = 24) {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  const snap = await db.collection('balance_snapshots')
    .where('user_id', '==', userId)
    .where('date', '>=', cutoffDate)
    .get();
  const rows = snap.docs.map(d => d.data()).sort((a, b) => a.date.localeCompare(b.date));
  // Last snapshot per month — balances are levels, not flows.
  const byMonth = new Map();
  for (const r of rows) byMonth.set(r.date.slice(0, 7), r);
  const points = [...byMonth.entries()].map(([month, r]) => ({
    month,
    net_worth: Math.round(r.net_worth),
    cash: Math.round(r.cash ?? 0),
    investments: Math.round(r.investments ?? 0),
    liabilities: Math.round(r.total_liabilities ?? 0),
  }));
  let change = null;
  if (points.length >= 2) {
    const first = points[0], last = points[points.length - 1];
    const spanMonths = Math.max(1, points.length - 1);
    change = {
      from_month: first.month,
      to_month: last.month,
      delta: last.net_worth - first.net_worth,
      avg_monthly_delta: Math.round((last.net_worth - first.net_worth) / spanMonths),
    };
  }
  return { points, change };
}

async function buildLiabilities(userId) {
  const snap = await db.collection('plaid_liabilities').where('user_id', '==', userId).get();
  return snap.docs.map(d => d.data()).filter(l => (l.balance || 0) > 0).map(l => ({
    kind: l.kind,
    name: l.name || l.account_name || null,
    balance: Math.round(l.balance || 0),
    apr: l.apr != null ? l.apr : null,
    min_payment: l.min_payment_amount ?? l.minimum_payment_amount ?? null,
  }));
}

async function buildBaseline(userId) {
  const [snapshot, trailing, history, liabilities, profile] = await Promise.all([
    computeSnapshot(userId),
    buildTrailingStats(),
    buildNetWorthHistory(userId),
    buildLiabilities(userId),
    getProfile(userId),
  ]);
  const totalInvestments = snapshot.assets.investments + snapshot.assets.manual_investments;
  const retirement = snapshot.allocation.Core || 0;
  const taxable = Math.max(0, totalInvestments - retirement);
  const m6 = trailing.windows.m6;
  const m3 = trailing.windows.m3;
  const monthlySavings = m6.months >= 3 ? m6.avg_net : m3.avg_net;
  return {
    as_of: snapshot.generated_at,
    net_worth: Math.round(snapshot.net_worth),
    cash: Math.round(snapshot.assets.cash),
    investments: {
      total: Math.round(totalInvestments),
      taxable: Math.round(taxable),
      retirement: Math.round(retirement),
      by_bet_type: Object.fromEntries(Object.entries(snapshot.allocation).map(([k, v]) => [k, Math.round(v)])),
    },
    liabilities: {
      total: Math.round(snapshot.liabilities.total),
      by_kind: {
        credit: Math.round(snapshot.liabilities.credit),
        student: Math.round(snapshot.liabilities.student),
        mortgage: Math.round(snapshot.liabilities.mortgage),
        other: Math.round(snapshot.liabilities.other),
      },
      accounts: liabilities,
    },
    cash_flow: {
      monthly_savings_estimate: Math.round(monthlySavings),
      windows: trailing.windows,
      by_month: trailing.by_month,
    },
    net_worth_history: history,
    top_holdings: snapshot.top_holdings.slice(0, 5),
    profile,
  };
}

function baselineToPrompt(b) {
  const w = b.cash_flow.windows;
  const lines = [
    `Balance sheet (as of ${b.as_of.slice(0, 10)}): net worth ${fmtUsd(b.net_worth)} = cash ${fmtUsd(b.cash)} + investments ${fmtUsd(b.investments.total)} (taxable ${fmtUsd(b.investments.taxable)}, retirement ${fmtUsd(b.investments.retirement)}) − liabilities ${fmtUsd(b.liabilities.total)}` +
      (b.liabilities.total > 0 ? ` (credit ${fmtUsd(b.liabilities.by_kind.credit)}, student ${fmtUsd(b.liabilities.by_kind.student)}, mortgage ${fmtUsd(b.liabilities.by_kind.mortgage)}, other ${fmtUsd(b.liabilities.by_kind.other)})` : '') + '.',
    `Cash flow, monthly averages over complete months — last 3: income ${fmtUsd(w.m3.avg_income)}, spend ${fmtUsd(w.m3.avg_spend)}, taxes ${fmtUsd(w.m3.avg_taxes)}, net ${fmtUsd(w.m3.avg_net)} (savings rate ${pct(w.m3.savings_rate)}); last 6: net ${fmtUsd(w.m6.avg_net)} (${pct(w.m6.savings_rate)}); last 12: net ${fmtUsd(w.m12.avg_net)} (${pct(w.m12.savings_rate)}). Baseline monthly savings used for projections unless overridden: ${fmtUsd(b.cash_flow.monthly_savings_estimate)}.`,
  ];
  if (b.cash_flow.monthly_savings_estimate <= 0) {
    lines.push('Note: trailing net cash flow is negative or zero, so the default projection is a drawdown. Income here may be lumpy (business income, one-off tax payments). Before leaning on a projection, say what run-rate you assumed and ask whether it matches their expectation; if they give a savings number, use it as monthly_contribution.');
  }
  if (b.net_worth_history.change) {
    const c = b.net_worth_history.change;
    lines.push(`Net worth trend: ${c.delta >= 0 ? '+' : ''}${fmtUsd(c.delta)} from ${c.from_month} to ${c.to_month} (≈${fmtUsd(c.avg_monthly_delta)}/month, includes market moves).`);
  }
  if (b.top_holdings.length) {
    lines.push(`Largest positions: ${b.top_holdings.map(h => `${h.ticker} ${fmtUsd(h.value)} (${h.pct_invested.toFixed(0)}% of invested)`).join(', ')}.`);
  }
  const p = b.profile || {};
  const profileBits = [];
  if (p.current_age) profileBits.push(`age ${p.current_age}`);
  if (p.target_retirement_age) profileBits.push(`wants to retire at ${p.target_retirement_age}`);
  if (p.retirement_annual_spend) profileBits.push(`retirement spend target ${fmtUsd(p.retirement_annual_spend)}/yr (today's dollars)`);
  if (p.retirement_annual_income) profileBits.push(`expected retirement income ${fmtUsd(p.retirement_annual_income)}/yr`);
  if (p.risk_tolerance) profileBits.push(`risk tolerance: ${p.risk_tolerance}`);
  if (p.target_net_worth) profileBits.push(`target net worth ${fmtUsd(p.target_net_worth)}`);
  if (Array.isArray(p.goals) && p.goals.length) profileBits.push(`goals: ${p.goals.map(g => `${g.name} ${fmtUsd(g.amount)}${g.year ? ` in ${g.year}` : ''}`).join('; ')}`);
  if (p.notes) profileBits.push(`notes: ${p.notes}`);
  lines.push(profileBits.length
    ? `Saved planning profile: ${profileBits.join('; ')}.`
    : 'No planning profile saved yet (age, retirement age, retirement spend, goals are unknown — ask when they matter, then offer to save them).');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Prompt

const SYSTEM_PROMPT = `You are the financial planner inside Wealth Navigator, an app used by a single person who tracks their spending, net worth and a self-directed investment portfolio in it. Your job is to be a thoughtful planning partner: help them think about where their money could be in 5, 10, 30 years, what different levels of risk and saving do to that picture, when work becomes optional, and what trade-offs they're actually facing. It should feel like a conversation with a sharp advisor who has their numbers open, not a form.

You have two kinds of tools. Live-data tools (transactions, category stats, budgets, balance sheet snapshot, bets, recurring costs, planning baseline) read their real finances. Planning tools (run_projection, compare_scenarios, solve_for_goal) run the projection engine: a monthly simulation with a deterministic expected path plus a 1,000-path Monte Carlo fan. Always use the engine for any forward-looking number — never estimate compounding in your head. Start scenarios from the live baseline (starting balances and monthly savings) unless the user gives different inputs, and say which inputs you used.

Ways of working:
- Lead with the answer, then the reasoning. Numbers in a short table when comparing scenarios; otherwise prose.
- When a projection runs, the user sees a chart of it next to your reply. Refer to the chart and call out the few numbers that matter (median outcome, the downside case, probability of the goal) rather than listing every year.
- Risk profiles are conservative (~4.5%/yr, low volatility), moderate (~6.5%, 60/40), aggressive (~8.5%, all-equity), cash (~3.5%). These are long-run planning assumptions, not predictions; state them once and let the user override. Show real (inflation-adjusted) numbers when the horizon is long, because that's what purchasing power looks like.
- If a key input is missing (age, retirement age, spending in retirement, a goal amount or date), run something reasonable with a stated assumption first, then ask. Don't stack up questions. When the user tells you a durable fact about themselves, offer to save it to their planning profile and use save_planning_profile once they agree, so future conversations start from it.
- Be honest about uncertainty: the fan shows the spread, and a 10th-percentile outcome is a real possibility, not a footnote. Point out when a plan is fragile (money runs out in the bad cases, or it relies on a high return).
- You are not a licensed financial or tax adviser; say so briefly once if they ask what they should do, then still give a clear point of view. You have no live market data.

Current baseline (refreshed each turn):
`;

// ---------------------------------------------------------------------------
// Tools

function summariseForPrompt(result) {
  // What the model reads back — summary plus a sparse yearly table so it
  // can talk about milestones without the full 70-row payload.
  const step = result.yearly.length > 16 ? 5 : result.yearly.length > 8 ? 2 : 1;
  const rows = result.yearly.filter((r, i) => i % step === 0 || i === result.yearly.length - 1)
    .map(r => ({ year: r.year, ...(r.age ? { age: r.age } : {}), expected: r.expected, p10: r.p10, p50: r.p50, p90: r.p90, real_p50: r.real_p50, ...(r.debt ? { debt: r.debt } : {}) }));
  return { scenario: result.scenario, summary: result.summary, yearly_sample: rows };
}

const SCENARIO_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Short label shown on the chart, e.g. "Aggressive, retire at 55"' },
    starting_cash: { type: 'number', description: 'Defaults to the live cash balance' },
    starting_investments: { type: 'number', description: 'Defaults to live total investments (taxable + retirement)' },
    monthly_contribution: { type: 'number', description: 'Net monthly savings invested, before any debt payment below. Defaults to the baseline monthly savings estimate. Negative means drawing down.' },
    contribution_growth: { type: 'number', description: 'Annual growth in the contribution (raises), default 0.03' },
    cash_reserve_target: { type: 'number', description: 'Cash kept aside (grows with inflation); new savings top this up first. Defaults to current cash.' },
    risk_profile: { type: 'string', enum: ['conservative', 'moderate', 'aggressive', 'cash'] },
    expected_return: { type: 'number', description: 'Override: nominal annual return as a decimal (0.07). Use with volatility for a custom profile.' },
    volatility: { type: 'number', description: 'Override: annual standard deviation as a decimal (0.15)' },
    years: { type: 'number', description: 'Horizon in years (1–70), default 30' },
    inflation: { type: 'number', description: 'Annual inflation, default 0.03' },
    target_net_worth: { type: 'number', description: 'If set, the result includes the probability of reaching it and when' },
    current_age: { type: 'number', description: 'Adds an age column to the output' },
    debt: {
      type: 'object',
      description: 'A single aggregate liability paid down from the contribution',
      properties: {
        balance: { type: 'number' },
        apr: { type: 'number', description: 'Annual rate as a decimal' },
        monthly_payment: { type: 'number' },
        redirect_payment_when_paid_off: { type: 'boolean', description: 'Default true: once paid off the payment becomes savings' },
      },
      additionalProperties: false,
    },
    retirement: {
      type: 'object',
      description: 'Adds a decumulation phase: contributions stop, spending is withdrawn from the portfolio',
      properties: {
        starts_in_years: { type: 'number' },
        annual_spend: { type: 'number', description: "Today's dollars; grows with inflation by default" },
        annual_income: { type: 'number', description: "Social security / pension / part-time, today's dollars" },
        spend_grows_with_inflation: { type: 'boolean' },
        risk_profile: { type: 'string', enum: ['conservative', 'moderate', 'aggressive', 'cash'], description: 'Optional de-risked profile after retirement' },
      },
      additionalProperties: false,
    },
    events: {
      type: 'array',
      description: 'One-off cash events. Positive = inflow (bonus, sale), negative = outflow (house down payment, wedding).',
      items: {
        type: 'object',
        properties: { year: { type: 'number' }, amount: { type: 'number' }, label: { type: 'string' } },
        required: ['year', 'amount'],
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
};

function buildPlanningTools(userId, baseline, onEvent) {
  const withBaselineDefaults = (s = {}) => ({
    starting_cash: baseline.cash,
    starting_investments: baseline.investments.total,
    monthly_contribution: baseline.cash_flow.monthly_savings_estimate,
    ...(baseline.profile?.current_age ? { current_age: baseline.profile.current_age } : {}),
    ...s,
  });

  const emitScenarios = (results) => {
    onEvent({
      type: 'scenario',
      scenarios: results.map(r => ({ name: r.scenario.name, scenario: r.scenario, summary: r.summary, yearly: r.yearly })),
    });
  };

  const getBaseline = betaTool({
    name: 'get_planning_baseline',
    description: 'Full planning baseline as structured data: balance sheet split (cash / taxable / retirement / liabilities with APRs), trailing 3/6/12-month income, spend, taxes and net savings, monthly net-worth history for two years, top holdings, and the saved planning profile. Use when you need exact inputs beyond the summary in your context.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => JSON.stringify(baseline),
  });

  const runProjection = betaTool({
    name: 'run_projection',
    description: 'Project net worth forward under one scenario. Returns the expected (deterministic) path, Monte Carlo percentiles (p10/p25/p50/p75/p90) per year, real (inflation-adjusted) values, and a summary: final outcomes, probability of hitting target_net_worth, and — with a retirement block — the probability the money lasts and when it runs out in the bad cases. Unspecified balances and monthly savings default to the live baseline. The user sees a fan chart of the result.',
    inputSchema: SCENARIO_SCHEMA,
    run: async (input) => {
      const result = engine.runProjection(withBaselineDefaults(input));
      emitScenarios([result]);
      return JSON.stringify(summariseForPrompt(result));
    },
  });

  const compareScenarios = betaTool({
    name: 'compare_scenarios',
    description: 'Run 2–5 scenarios with the same engine and return them side by side (e.g. conservative vs moderate vs aggressive, or save $3k vs $5k per month, or retire at 55 vs 60). Each scenario accepts the same fields as run_projection; give each a distinct name. The user sees the median paths overlaid on one chart.',
    inputSchema: {
      type: 'object',
      properties: {
        scenarios: { type: 'array', minItems: 2, maxItems: 5, items: SCENARIO_SCHEMA },
      },
      required: ['scenarios'],
      additionalProperties: false,
    },
    run: async (input) => {
      const results = input.scenarios.map((s, i) => engine.runProjection(withBaselineDefaults({ name: s.name || `Scenario ${i + 1}`, ...s })));
      emitScenarios(results);
      return JSON.stringify(results.map(summariseForPrompt));
    },
  });

  const solveForGoal = betaTool({
    name: 'solve_for_goal',
    description: 'Solve a planning question instead of guessing inputs. mode "monthly_contribution": how much to save per month to reach target_net_worth in `years`. mode "years_to_target": how long until the expected path reaches target_net_worth at the given savings. mode "sustainable_spend": the largest inflation-adjusted annual spend a portfolio supports over `years` with at least success_target % of Monte Carlo paths surviving (a personalised safe-withdrawal rate). Scenario fields set the balances, savings and risk profile; defaults come from the baseline.',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['monthly_contribution', 'years_to_target', 'sustainable_spend'] },
        scenario: SCENARIO_SCHEMA,
        success_target: { type: 'number', description: 'For sustainable_spend: required survival probability in percent, default 85' },
        annual_income: { type: 'number', description: 'For sustainable_spend: other retirement income per year' },
      },
      required: ['mode'],
      additionalProperties: false,
    },
    run: async (input) => {
      const sc = withBaselineDefaults(input.scenario || {});
      if (input.mode === 'monthly_contribution') return JSON.stringify(engine.solveMonthlyContribution(sc));
      if (input.mode === 'years_to_target') return JSON.stringify(engine.solveYearsToTarget(sc));
      return JSON.stringify(engine.solveSustainableSpend({ ...sc, success_target: input.success_target, annual_income: input.annual_income }));
    },
  });

  const getProfileTool = betaTool({
    name: 'get_planning_profile',
    description: 'The saved planning profile: current_age, target_retirement_age, retirement_annual_spend, retirement_annual_income, risk_tolerance, target_net_worth, goals[], notes.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => JSON.stringify(await getProfile(userId)),
  });

  const saveProfileTool = betaTool({
    name: 'save_planning_profile',
    description: 'Save durable facts the user has confirmed to their planning profile (merge; only send fields that changed). Ask before saving unless the user clearly asked you to remember something.',
    inputSchema: {
      type: 'object',
      properties: {
        current_age: { type: 'number' },
        target_retirement_age: { type: 'number' },
        retirement_annual_spend: { type: 'number', description: "Today's dollars per year" },
        retirement_annual_income: { type: 'number', description: 'Expected pension / social security / other income per year in retirement' },
        risk_tolerance: { type: 'string', enum: ['conservative', 'moderate', 'aggressive'] },
        target_net_worth: { type: 'number' },
        goals: {
          type: 'array',
          items: {
            type: 'object',
            properties: { name: { type: 'string' }, amount: { type: 'number' }, year: { type: 'number' } },
            required: ['name', 'amount'],
            additionalProperties: false,
          },
        },
        notes: { type: 'string', description: 'Free-text context worth remembering (job situation, expected windfalls, constraints)' },
      },
      additionalProperties: false,
    },
    run: async (input) => {
      const profile = await saveProfile(userId, input);
      onEvent({ type: 'profile', profile });
      return JSON.stringify({ saved: true, profile });
    },
  });

  return [
    getBaseline, runProjection, compareScenarios, solveForGoal, getProfileTool, saveProfileTool,
    ...buildFinanceTools(userId),
  ];
}

// ---------------------------------------------------------------------------
// Conversations

function conversationTitle(query) {
  const t = query.replace(/\s+/g, ' ').trim();
  return t.length > 70 ? `${t.slice(0, 67)}…` : t;
}

// Sorted in memory rather than with orderBy so no composite index is
// needed — one user has tens of conversations, not thousands.
async function listConversations(userId, limit = 30) {
  const snap = await db.collection('planning_conversations')
    .where('user_id', '==', userId)
    .get();
  return snap.docs
    .map(d => {
      const c = d.data();
      return { id: d.id, title: c.title, updated_at: c.updated_at, turns: (c.messages || []).length };
    })
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
    .slice(0, limit);
}

async function getConversation(userId, id) {
  const doc = await db.collection('planning_conversations').doc(id).get();
  if (!doc.exists || doc.data().user_id !== userId) return null;
  return { id: doc.id, ...doc.data() };
}

async function deleteConversation(userId, id) {
  const existing = await getConversation(userId, id);
  if (!existing) return false;
  await db.collection('planning_conversations').doc(id).delete();
  return true;
}

// Keep stored chart payloads bounded: a handful of scenarios per turn, and
// only the fields the chart reads.
function trimScenariosForStorage(scenarios) {
  return scenarios.slice(0, MAX_STORED_SCENARIOS).map(s => ({
    name: s.name,
    scenario: s.scenario,
    summary: s.summary,
    yearly: s.yearly.map(r => ({
      year: r.year, calendar_year: r.calendar_year, ...(r.age ? { age: r.age } : {}),
      expected: r.expected, p10: r.p10, p25: r.p25, p50: r.p50, p75: r.p75, p90: r.p90, real_p50: r.real_p50,
    })),
  }));
}

// ---------------------------------------------------------------------------
// One streamed turn. onEvent receives:
//   {type:'conversation', id, title}   — first event; the thread this turn belongs to
//   {type:'text', text}                — token delta
//   {type:'tool', name}                — a tool call started
//   {type:'scenario', scenarios:[...]} — projection results to chart
//   {type:'profile', profile}          — planning profile was saved
// Returns { response, conversation_id, scenarios }.
async function answerQueryStream(userId, query, conversationId, onEvent = () => {}) {
  const anthropic = getClient();

  let conversation = conversationId ? await getConversation(userId, conversationId) : null;
  const now = new Date().toISOString();
  if (!conversation) {
    const ref = await db.collection('planning_conversations').add({
      user_id: userId,
      title: conversationTitle(query),
      messages: [],
      created_at: now,
      updated_at: now,
    });
    conversation = { id: ref.id, title: conversationTitle(query), messages: [] };
  }
  onEvent({ type: 'conversation', id: conversation.id, title: conversation.title });

  const baseline = await buildBaseline(userId);

  const history = (conversation.messages || [])
    .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-HISTORY_TURNS)
    .map(m => ({ role: m.role, content: m.content }));
  const messages = [...history, { role: 'user', content: query }];

  const turnScenarios = [];
  const captureEvent = (event) => {
    if (event.type === 'scenario') turnScenarios.push(...event.scenarios);
    onEvent(event);
  };

  const runner = anthropic.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: baselineToPrompt(baseline) },
    ],
    tools: buildPlanningTools(userId, baseline, captureEvent),
    messages,
    stream: true,
    max_iterations: MAX_ITERATIONS,
  });

  const parts = [];
  for await (const stream of runner) {
    let sawText = false;
    for await (const event of stream) {
      if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
        onEvent({ type: 'tool', name: event.content_block.name });
      }
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
        if (!sawText && parts.length > 0) onEvent({ type: 'text', text: '\n\n' });
        if (!sawText) parts.push('');
        sawText = true;
        parts[parts.length - 1] += event.delta.text;
        onEvent({ type: 'text', text: event.delta.text });
      }
    }
    const message = await stream.finalMessage();
    if (message.stop_reason === 'refusal') {
      const note = 'The model declined to answer this request.';
      onEvent({ type: 'text', text: note });
      parts.push(note);
      break;
    }
  }

  const response = parts.join('\n\n').trim();
  const storedScenarios = trimScenariosForStorage(turnScenarios);

  try {
    await db.collection('planning_conversations').doc(conversation.id).update({
      messages: [
        ...(conversation.messages || []),
        { role: 'user', content: query, created_at: now },
        {
          role: 'assistant', content: response, created_at: new Date().toISOString(),
          ...(storedScenarios.length ? { scenarios: storedScenarios } : {}),
        },
      ],
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Failed to persist planning turn:', err);
  }

  return { response, conversation_id: conversation.id, scenarios: turnScenarios };
}

module.exports = {
  isConfigured,
  answerQueryStream,
  buildBaseline,
  baselineToPrompt,
  buildPlanningTools,
  getProfile,
  saveProfile,
  listConversations,
  getConversation,
  deleteConversation,
  RISK_PROFILES: engine.RISK_PROFILES,
  MODEL,
};
