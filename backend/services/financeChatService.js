// Personal-finance chat — Claude with live access to the user's whole
// financial picture (spending, budgets, accounts, and the investing side),
// via the SDK tool runner so the model can drill into data on demand
// instead of receiving everything up front.
//
// Streaming: answerQueryStream emits events through a callback so the
// route can forward them as SSE. Requires ANTHROPIC_API_KEY (same 503
// contract as the research service).

const Anthropic = require('@anthropic-ai/sdk');
const { betaTool } = require('@anthropic-ai/sdk/helpers/beta/json-schema');
const { db, docToObj } = require('./database');
const { computeSnapshot } = require('./snapshotService');
const { buildPortfolioContext } = require('./aiResearchService');
const { getCategoryEnvelopes } = require('./budgetEnvelopes');

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5';
const MAX_ITERATIONS = 8;

let client = null;
function getClient() {
  if (!client && process.env.ANTHROPIC_API_KEY) {
    client = new Anthropic();
  }
  return client;
}

function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const fmtUsd = (n) => `$${Math.round(n).toLocaleString('en-US')}`;

// Compact burn summary over the last complete months (mirrors
// /api/expenses/stats/trailing but inlined for prompt context).
async function buildBurnContext() {
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
    const m = monthMap[month] = monthMap[month] || { spend: 0, income: 0, taxes: 0 };
    if (e.category === 'Income') m.income += -e.amount;
    else if (e.category === 'Taxes') m.taxes += e.amount;
    else m.spend += e.amount;
  });

  const months = Object.keys(monthMap).sort();
  const last3 = months.slice(-3).map(k => monthMap[k]);
  if (last3.length === 0) return 'No spending history yet.';
  const avg = (f) => last3.reduce((s, m) => s + f(m), 0) / last3.length;
  const lines = [
    `Trailing 3-month monthly averages: burn ${fmtUsd(avg(m => m.spend))} (ex-taxes), income ${fmtUsd(avg(m => m.income))}, taxes ${fmtUsd(avg(m => m.taxes))}, net ${fmtUsd(avg(m => m.income) - avg(m => m.spend) - avg(m => m.taxes))}.`,
  ];
  const envelopes = await getCategoryEnvelopes();
  if (envelopes.total > 0) {
    lines.push(`Monthly budget across categories: ${fmtUsd(envelopes.total)} (${Object.entries(envelopes.byCategory).map(([k, v]) => `${k} ${fmtUsd(v.total)}`).join(', ')}).`);
  }
  return lines.join('\n');
}

const SYSTEM_PROMPT = `You are the personal-finance assistant inside Wealth Navigator, an app used by a single user who manages both their spending and a self-directed investment portfolio in it. You help with questions like where to cut costs, whether spending is sustainable against income, planning discretionary budgets, and how personal-finance decisions interact with the investing side.

You have tools to query the user's actual transactions, category statistics, budgets, balance-sheet snapshot, and investment bets. Use them — ground every answer in their real numbers rather than generalities, and say what you looked at. Amounts are stored with spending positive and income negative in raw transactions; the tools already normalize income to positive in summaries.

Guidelines:
- Be direct and analytical; skip beginner boilerplate.
- For tax questions, give directional guidance and flag that filings and specifics belong with a tax professional. You are not a licensed financial or tax advisor; note this briefly when asked what the user should do (once, not as a recurring banner).
- Your knowledge has a training cutoff and you have no live market data — say so when recency matters.

Context on the user's current finances:
`;

// Build the per-request tool set, closed over the authed user.
function buildTools(userId) {
  const queryTransactions = betaTool({
    name: 'query_transactions',
    description: 'Search the user\'s transactions. Returns up to `limit` (default 50, max 100) matching rows, newest first, plus the total match count and summed amount. Transfers are excluded unless include_transfers is true.',
    inputSchema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Case-insensitive substring match on merchant/description' },
        category: { type: 'string' },
        subcategory: { type: 'string' },
        startDate: { type: 'string', description: 'YYYY-MM-DD inclusive' },
        endDate: { type: 'string', description: 'YYYY-MM-DD inclusive' },
        include_transfers: { type: 'boolean' },
        limit: { type: 'number' },
      },
      additionalProperties: false,
    },
    run: async (input) => {
      let query = db.collection('expenses');
      if (input.startDate) query = query.where('date', '>=', input.startDate);
      if (input.endDate) query = query.where('date', '<=', input.endDate);
      if (input.category) query = query.where('category', '==', input.category);
      if (input.subcategory) query = query.where('subcategory', '==', input.subcategory);
      const snapshot = await query.get();
      let rows = snapshot.docs.map(docToObj);
      if (!input.include_transfers) rows = rows.filter(e => !e.is_transfer);
      if (input.search) {
        const term = input.search.toLowerCase();
        rows = rows.filter(e =>
          (e.merchant && e.merchant.toLowerCase().includes(term)) ||
          (e.description && e.description.toLowerCase().includes(term)));
      }
      rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
      const limit = Math.min(input.limit || 50, 100);
      return JSON.stringify({
        total_matches: rows.length,
        total_amount: rows.reduce((s, e) => s + (e.amount || 0), 0),
        transactions: rows.slice(0, limit).map(e => ({
          date: e.date, merchant: e.merchant, amount: e.amount,
          category: e.category, subcategory: e.subcategory, account: e.account,
        })),
      });
    },
  });

  const getCategoryStats = betaTool({
    name: 'get_category_stats',
    description: 'Spending/income/taxes totals for a date range, broken down by category and by month. Income is returned positive. Transfers excluded.',
    inputSchema: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: 'YYYY-MM-DD inclusive' },
        endDate: { type: 'string', description: 'YYYY-MM-DD inclusive' },
      },
      required: ['startDate', 'endDate'],
      additionalProperties: false,
    },
    run: async (input) => {
      const snapshot = await db.collection('expenses')
        .where('date', '>=', input.startDate)
        .where('date', '<=', input.endDate)
        .get();
      const rows = snapshot.docs.map(d => d.data()).filter(e => !e.is_transfer);
      const byCategory = {};
      const byMonth = {};
      let income = 0, taxes = 0, spend = 0;
      rows.forEach(e => {
        const month = (e.date || '').substring(0, 7);
        const m = byMonth[month] = byMonth[month] || { spend: 0, income: 0, taxes: 0 };
        if (e.category === 'Income') { income += -e.amount; m.income += -e.amount; return; }
        if (e.category === 'Taxes') { taxes += e.amount; m.taxes += e.amount; return; }
        spend += e.amount; m.spend += e.amount;
        const key = `${e.category || 'Uncategorized'} > ${e.subcategory || ''}`;
        byCategory[key] = (byCategory[key] || 0) + e.amount;
      });
      return JSON.stringify({ spend, income, taxes, by_category: byCategory, by_month: byMonth });
    },
  });

  const getBudgets = betaTool({
    name: 'get_budgets',
    description: 'The user\'s budget line items (name, category, monthly expected spend, status) and the derived monthly envelope per category.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => {
      const [snapshot, envelopes] = await Promise.all([
        db.collection('budget_items').get(),
        getCategoryEnvelopes(),
      ]);
      const items = snapshot.docs.map(d => d.data())
        .filter(i => i.status === 'active' || !i.status)
        .map(i => ({
          item: i.itemName, category: i.mainCategory, subcategory: i.secondaryCategory,
          frequency: i.frequency, amount: i.amount, monthly: i.monthlyExpectedSpend,
        }));
      return JSON.stringify({ items, envelopes });
    },
  });

  const getSnapshot = betaTool({
    name: 'get_snapshot',
    description: 'Current balance sheet: cash, investments, liabilities (credit/student/mortgage), net worth, allocation by bet type, top holdings.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => JSON.stringify(await computeSnapshot(userId)),
  });

  const getBets = betaTool({
    name: 'get_bets',
    description: 'The user\'s investment bets (thesis-driven positions): name, type, tickers, status, thesis.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => {
      const snapshot = await db.collection('bets').where('user_id', '==', userId).get();
      return JSON.stringify(snapshot.docs.map(d => {
        const b = d.data();
        return { name: b.name, type: b.type, tickers: b.tickers, status: b.status, thesis: b.thesis };
      }));
    },
  });

  return [queryTransactions, getCategoryStats, getBudgets, getSnapshot, getBets];
}

// Run one chat turn with streaming. onEvent receives:
//   {type:'text', text}   — a token delta to append
//   {type:'tool', name}   — the model started a tool call
// Returns the full response text. Throws on API errors.
async function answerQueryStream(userId, query, history = [], onEvent = () => {}) {
  const anthropic = getClient();
  const [portfolio, burn] = await Promise.all([
    buildPortfolioContext(userId),
    buildBurnContext(),
  ]);

  const messages = [
    ...history
      .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-20),
    { role: 'user', content: query },
  ];

  const runner = anthropic.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system: SYSTEM_PROMPT + burn + '\n\n' + portfolio,
    tools: buildTools(userId),
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
        // Separate iterations with a break so pre-tool narration doesn't
        // run into the final answer.
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

  // Persist the turn (query + final response) for history.
  try {
    await db.collection('finance_chats').add({
      user_id: userId,
      query,
      response,
      model: MODEL,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Failed to persist finance chat turn:', err);
  }

  return response;
}

async function getHistory(userId, limit = 20) {
  const snapshot = await db.collection('finance_chats')
    .where('user_id', '==', userId)
    .orderBy('created_at', 'desc')
    .limit(limit)
    .get();
  return snapshot.docs.map(d => {
    const data = d.data();
    return { query: data.query, response: data.response, created_at: data.created_at };
  });
}

module.exports = { isConfigured, answerQueryStream, getHistory, MODEL };
