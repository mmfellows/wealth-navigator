// The always-available assistant: a side-research chat reachable from every
// page. Unlike the Finance Chat page (which answers questions about the
// user's data), this one is for open-ended questions — "help me budget a ski
// trip to Austria" — so it has web search as well as the user's own numbers,
// and can put the result into the app (a trip with a budget, a special
// expense) when the user asks it to.
//
// Streaming: answerStream emits events through a callback so the route can
// forward them as SSE. Requires ANTHROPIC_API_KEY.

const Anthropic = require('@anthropic-ai/sdk');
const { betaTool } = require('@anthropic-ai/sdk/helpers/beta/json-schema');
const { db } = require('./database');
const financeChat = require('./financeChatService');
const { loadTrips, makeTripResolver, isSpendRow, tripDays } = require('./trips');
const { buildPlanView } = require('./budgetPlans');

const MODEL = process.env.ASSISTANT_MODEL || 'claude-opus-5-5';
const MAX_ITERATIONS = 10;
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

let client = null;
function getClient() {
  if (!client && process.env.ANTHROPIC_API_KEY) client = new Anthropic();
  return client;
}

const usd = n => `$${Math.round(n).toLocaleString('en-US')}`;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

function systemPrompt(today, page) {
  return `You are the assistant built into Wealth Navigator, a personal finance and investing app used by one person. You are opened from a button that is present on every page, for side research and quick questions: budgeting a trip, comparing options, working out what something will cost, sanity-checking a plan, or anything else they want to think through.

You have three kinds of tools:
- Web search, for anything that depends on current, real-world information: prices, fares, lift tickets, exchange rates, dates, availability, reviews. Use it whenever the answer depends on facts you cannot know from the user's data, and say where a figure came from. Prices you find are a snapshot; give ranges and name the season or dates they apply to.
- The user's own data: transactions, category statistics, budgets, recurring costs, the balance sheet, investment bets, their past trips with what each really cost, and their plan for a given year. Use it to make answers personal. For a trip budget, look at what their past trips cost per day and how that split across food, lodging, activities and transport, then say how the new trip compares.
- Two tools that change the app: creating a trip (name, dates, budget) and adding a special one-off expense to a month. Use these only when the user explicitly asks you to add or save something. Never create something as a side effect of answering a question. After creating, say exactly what you added and where they will see it (trips appear on the Trips page and in that year's Year Plan; special expenses appear in the Year Plan under planned costs).

How to answer:
- Lead with the answer or the number, then the breakdown. For a budget, give a table of line items with a low and a likely figure, a total, and the assumptions that drive it most.
- Keep it proportionate. This is a side panel, not a report: a few short paragraphs or one compact table, unless they ask for depth.
- State assumptions you had to make (party size, dates, comfort level) and ask at most one question if the answer would change materially; otherwise pick a sensible default and say so.
- When a budget is settled, offer once to add it to the app as a trip or special expense.
- You are not a licensed financial or tax advisor. For tax or legal specifics, give directional guidance and say it belongs with a professional (once, not as a recurring banner).

Today is ${today}.${page ? ` The user currently has the "${page}" page open.` : ''}`;
}

function buildExtraTools(userId) {
  const getTrips = betaTool({
    name: 'get_trips',
    description: 'The user\'s trips, past and planned: name, dates, number of days, budget if set, what was actually spent, spend per day, and the breakdown by spending category. Use it to ground a new trip budget in what their travel really costs.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => {
      const [trips, snap] = await Promise.all([loadTrips(), db.collection('expenses').get()]);
      const tripOf = makeTripResolver(trips);
      const members = {};
      snap.docs.forEach(d => {
        const e = d.data();
        if (!e.date || !isSpendRow(e)) return;
        const t = tripOf(e);
        if (t) (members[t.id] = members[t.id] || []).push(e);
      });
      return JSON.stringify(trips.map(t => {
        const rows = members[t.id] || [];
        const total = rows.reduce((s, e) => s + (e.amount || 0), 0);
        const byCat = {};
        rows.forEach(e => { const k = e.subcategory || e.category || 'Uncategorized'; byCat[k] = (byCat[k] || 0) + (e.amount || 0); });
        const days = tripDays(t);
        return {
          name: t.name, start_date: t.start_date, end_date: t.end_date, days,
          budget: t.budget || null,
          spent: Math.round(total), spent_per_day: days ? Math.round(total / days) : 0,
          by_category: Object.fromEntries(Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round(v)])),
          note: 'Spent covers card charges during the trip dates; flights and lodging booked in advance are mostly not included.',
        };
      }));
    },
  });

  const getYearPlan = betaTool({
    name: 'get_year_plan',
    description: 'The user\'s plan for a calendar year: planned spending by month and category, planned income, planned savings, trips and special expenses in that year, and actual spending so far. Use it to see whether a new cost fits.',
    inputSchema: {
      type: 'object',
      properties: { year: { type: 'integer', description: 'Four-digit year, e.g. 2027' } },
      required: ['year'],
      additionalProperties: false,
    },
    run: async ({ year }) => {
      const v = await buildPlanView(Number(year));
      return JSON.stringify({
        year: v.year, status: v.status, totals: v.totals,
        budget_by_category_year: v.categories,
        months: v.months.map(m => ({
          month: m.month, planned_spending: m.budget_total, planned_income: m.income_planned,
          trips: m.trips, special: m.special, actual_spending: m.actual_spend,
        })),
        trips: v.trips,
      });
    },
  });

  const createTrip = betaTool({
    name: 'create_trip',
    description: 'Create a trip in the app with a name, date range and (optionally) a total budget in dollars. Only call this when the user has explicitly asked you to add or save the trip. The budget should include everything the user expects to pay, flights and lodging included.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Short trip name, e.g. "Ski trip, St. Anton"' },
        start_date: { type: 'string', description: 'First day, YYYY-MM-DD' },
        end_date: { type: 'string', description: 'Last day, YYYY-MM-DD' },
        budget: { type: 'number', description: 'Total trip budget in dollars' },
        notes: { type: 'string', description: 'One or two lines on what the budget assumes' },
      },
      required: ['name', 'start_date', 'end_date'],
      additionalProperties: false,
    },
    run: async ({ name, start_date, end_date, budget, notes }) => {
      if (!name || !String(name).trim()) return 'Not created: a name is required.';
      if (!DATE_RE.test(start_date || '') || !DATE_RE.test(end_date || '')) return 'Not created: dates must be YYYY-MM-DD.';
      if (end_date < start_date) return 'Not created: the end date is before the start date.';
      const b = budget === undefined || budget === null ? null : Number(budget);
      if (b !== null && (!Number.isFinite(b) || b < 0)) return 'Not created: the budget must be a positive number.';
      const doc = {
        name: String(name).trim(), start_date, end_date, budget: b, notes: notes ? String(notes).slice(0, 500) : null,
        user_id: userId, created_by: 'assistant', created_at: new Date().toISOString(),
      };
      const ref = await db.collection('trips').add(doc);
      return JSON.stringify({ created: true, id: ref.id, name: doc.name, start_date, end_date, budget: b });
    },
  });

  const addSpecialExpense = betaTool({
    name: 'add_special_expense',
    description: 'Add a one-off planned cost to a specific month of the user\'s plan (for example a deposit, a registration fee, new equipment). Only call this when the user has explicitly asked you to add or save it.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        amount: { type: 'number', description: 'Dollars' },
        month: { type: 'string', description: 'YYYY-MM, the month the cost lands' },
        category: { type: 'string', description: 'Budget category; defaults to "Special Expense"' },
      },
      required: ['name', 'amount', 'month'],
      additionalProperties: false,
    },
    run: async ({ name, amount, month, category }) => {
      const value = Number(amount);
      if (!name || !String(name).trim()) return 'Not added: a name is required.';
      if (!Number.isFinite(value) || value <= 0) return 'Not added: the amount must be a positive number.';
      if (!MONTH_RE.test(month || '')) return 'Not added: month must be YYYY-MM.';
      const doc = {
        name: String(name).trim(), amount: value, month, category: category || 'Special Expense',
        subcategory: null, note: null, user_id: userId, created_by: 'assistant', created_at: new Date().toISOString(),
      };
      const ref = await db.collection('planned_costs').add(doc);
      return JSON.stringify({ added: true, id: ref.id, name: doc.name, amount: usd(value), month });
    },
  });

  return [getTrips, getYearPlan, createTrip, addSpecialExpense];
}

// Run one turn. onEvent receives:
//   {type:'text', text}     a token delta to append
//   {type:'tool', name}     the model started using a tool (incl. web_search)
//   {type:'changed', what}  the turn created something in the app
// Returns { response, sources }.
async function answerStream(userId, query, history = [], page = null, onEvent = () => {}) {
  const anthropic = getClient();
  const now = new Date();
  const today = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const messages = [
    ...history
      .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-16),
    { role: 'user', content: query },
  ];

  const base = {
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system: systemPrompt(today, page),
    tools: [
      ...financeChat.buildTools(userId),
      ...buildExtraTools(userId),
      { type: 'web_search_20260209', name: 'web_search', max_uses: 6 },
    ],
    messages,
    stream: true,
    max_iterations: MAX_ITERATIONS,
  };

  const parts = [];
  const sources = new Map();
  let emitted = false;

  const run = async (params) => {
    const runner = anthropic.beta.messages.toolRunner(params);
    for await (const stream of runner) {
      let sawText = false;
      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          const block = event.content_block || {};
          if (block.type === 'tool_use' || block.type === 'server_tool_use') {
            emitted = true;
            onEvent({ type: 'tool', name: block.name });
          }
        }
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
          if (!sawText && parts.length > 0) onEvent({ type: 'text', text: '\n\n' });
          if (!sawText) parts.push('');
          sawText = true;
          emitted = true;
          parts[parts.length - 1] += event.delta.text;
          onEvent({ type: 'text', text: event.delta.text });
        }
      }
      const message = await stream.finalMessage();
      for (const block of message.content) {
        // Sources the answer actually cites.
        if (block.type === 'text' && Array.isArray(block.citations)) {
          block.citations.forEach(c => { if (c.url && !sources.has(c.url)) sources.set(c.url, c.title || c.url); });
        }
        if (block.type === 'tool_use' && (block.name === 'create_trip' || block.name === 'add_special_expense')) {
          onEvent({ type: 'changed', what: block.name === 'create_trip' ? 'trip' : 'special_expense' });
        }
      }
      if (message.stop_reason === 'refusal') {
        const note = 'I can\'t help with that request.';
        onEvent({ type: 'text', text: note });
        parts.push(note);
        break;
      }
      if (message.stop_reason === 'pause_turn') {
        const note = '\n\n_The research step ran long and stopped here. Ask me to continue and I\'ll pick it up._';
        onEvent({ type: 'text', text: note });
        parts.push(note);
        break;
      }
      if (message.stop_reason === 'max_tokens') {
        const note = '\n\n_That answer was cut off at the length limit. Ask me to continue._';
        onEvent({ type: 'text', text: note });
        parts.push(note);
      }
    }
  };

  try {
    // If the model declines on a safety classifier, the API retries the turn
    // on a fallback model in the same call.
    await run({ ...base, betas: [FALLBACK_BETA], fallbacks: [{ model: 'claude-opus-4-8' }] });
  } catch (err) {
    // The fallback option is a beta; if the API rejects the request shape
    // before anything was produced, run the plain request instead.
    if (err instanceof Anthropic.BadRequestError && !emitted) {
      console.error('Assistant: request with fallbacks was rejected, retrying without:', err.message);
      await run(base);
    } else {
      throw err;
    }
  }

  return {
    response: parts.join('\n\n').trim(),
    sources: [...sources.entries()].slice(0, 8).map(([url, title]) => ({ url, title })),
  };
}

module.exports = { isConfigured: financeChat.isConfigured, answerStream, MODEL };
