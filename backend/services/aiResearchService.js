// AI research assistant — answers stock-research questions with the user's
// actual portfolio as context, via the Anthropic API.
//
// Requires ANTHROPIC_API_KEY in backend/.env. Without it, isConfigured()
// returns false and the route returns a 503 with setup instructions instead
// of falling back to canned text.

const Anthropic = require('@anthropic-ai/sdk');
const { db } = require('./database');
const { computeSnapshot } = require('./snapshotService');

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';

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

// Compact plain-text summary of the user's balance sheet, exposure, and
// active bets. Kept short on purpose — it's prompt context, not a report.
async function buildPortfolioContext(userId) {
  const [snapshot, betsSnap] = await Promise.all([
    computeSnapshot(userId),
    db.collection('bets').where('user_id', '==', userId).get(),
  ]);

  const lines = [];
  lines.push(`Net worth: ${fmtUsd(snapshot.net_worth)} (cash ${fmtUsd(snapshot.assets.cash)}, invested ${fmtUsd(snapshot.assets.investments + snapshot.assets.manual_investments)}, liabilities ${fmtUsd(snapshot.liabilities.total)})`);

  const alloc = Object.entries(snapshot.allocation)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k} ${fmtUsd(v)}`)
    .join(', ');
  if (alloc) lines.push(`Allocation by bet type: ${alloc}`);

  if (snapshot.top_holdings?.length) {
    lines.push('Top holdings (% of invested):');
    for (const h of snapshot.top_holdings) {
      lines.push(`  ${h.ticker}: ${fmtUsd(h.value)} (${h.pct_invested.toFixed(1)}%)`);
    }
  }

  const bets = betsSnap.docs
    .map(d => d.data())
    .filter(b => b.status !== 'closed' && !b.is_synthetic);
  if (bets.length) {
    lines.push('Active bets (thesis-driven positions):');
    for (const b of bets) {
      const tickers = (b.tickers || []).join(', ');
      const thesis = b.thesis ? ` — thesis: ${String(b.thesis).slice(0, 200)}` : '';
      lines.push(`  ${b.name} [${b.type}] (${tickers})${thesis}`);
    }
  }

  return lines.join('\n');
}

const SYSTEM_PROMPT = `You are the research assistant inside Wealth Navigator, a personal investing app used by a single self-directed investor. You help with equity research, thesis development, portfolio exposure questions, and journaling entries and exits.

You are given the user's current portfolio below. Use it to make answers concrete — reference their actual positions, concentrations, and bets when relevant, and flag when a question touches something they already own.

Guidelines:
- Be direct and analytical. The user is an experienced self-directed investor; skip beginner boilerplate.
- When discussing a specific ticker, cover what actually matters: business model, competitive position, key risks, valuation context.
- Your market knowledge has a training cutoff and you have no live market data — say so when recency matters, and never invent current prices or recent events.
- You are not a licensed financial advisor and this is research assistance, not personalized investment advice; note this briefly when a question asks what the user should do (once, not as a recurring banner).

The user's current portfolio:
`;

// Answer a research query. `history` is an optional array of prior
// {role: 'user'|'assistant', content: string} turns for follow-ups.
async function answerQuery(userId, query, history = []) {
  const anthropic = getClient();
  const context = await buildPortfolioContext(userId);

  const messages = [
    ...history
      .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-20),
    { role: 'user', content: query },
  ];

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    thinking: { type: 'adaptive' },
    system: SYSTEM_PROMPT + context,
    messages,
  });

  if (response.stop_reason === 'refusal') {
    return 'The model declined to answer this request.';
  }

  return response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n');
}

module.exports = { isConfigured, answerQuery, buildPortfolioContext, MODEL };
