// AI transaction categorization — batch-categorizes uncategorized expenses
// against the user's own category taxonomy via the Anthropic API.
//
// Precedence (enforced here and at sync): manual > merchant rule >
// Plaid rule > AI. This service only ever touches rows with no category.
// Confident results are applied directly (categorization_source: 'ai');
// uncertain ones get needs_review + a concrete question and suggestions
// for the review queue.
//
// Requires ANTHROPIC_API_KEY; without it isConfigured() is false and the
// route returns 503 with setup instructions (same contract as research).

const Anthropic = require('@anthropic-ai/sdk');
const { db, docToObj } = require('./database');
const { loadMerchantRules, lookupMerchantRule, normalizeMerchant } = require('./merchantRules');

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5';
const CONFIDENCE_THRESHOLD = 0.8;
const BATCH_SIZE = 40;

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

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          category: { type: 'string' },
          subcategory: { type: 'string' },
          confidence: { type: 'number' },
          question: { type: 'string' },
          suggestions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                category: { type: 'string' },
                subcategory: { type: 'string' },
              },
              required: ['category', 'subcategory'],
              additionalProperties: false,
            },
          },
        },
        required: ['id', 'category', 'subcategory', 'confidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['results'],
  additionalProperties: false,
};

// The user's live taxonomy as "Main > Sub" lines, plus a validation map.
async function loadTaxonomy() {
  const snapshot = await db.collection('budget_categories').get();
  const byMain = new Map();
  snapshot.docs.forEach(doc => {
    const d = doc.data();
    if (!d.main_category || !d.sub_category) return;
    if (!byMain.has(d.main_category)) byMain.set(d.main_category, new Set());
    byMain.get(d.main_category).add(d.sub_category);
  });
  return byMain;
}

// Recent categorized rows as few-shot examples, deduped by merchant so one
// frequent merchant doesn't crowd out the rest. Prefers explicit user
// decisions but falls back to any categorized row (historic data predates
// the categorization_source field).
async function loadExamples(limit = 60) {
  const snapshot = await db.collection('expenses')
    .orderBy('date', 'desc')
    .limit(600)
    .get();

  const seen = new Set();
  const examples = [];
  const rows = snapshot.docs.map(d => d.data())
    .filter(e => e.category && e.category !== 'Income' && e.category !== 'Taxes'
      && e.category !== 'Credit Card Payment' && !e.is_transfer && e.merchant);
  // User decisions first, then anything categorized.
  rows.sort((a, b) => {
    const ua = a.categorization_source === 'manual' || a.categorization_source === 'merchant_rule' ? 0 : 1;
    const ub = b.categorization_source === 'manual' || b.categorization_source === 'merchant_rule' ? 0 : 1;
    return ua - ub;
  });
  for (const e of rows) {
    const key = normalizeMerchant(e.merchant);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    examples.push(`"${e.merchant}" ($${Math.abs(e.amount).toFixed(0)}) → ${e.category} > ${e.subcategory || ''}`);
    if (examples.length >= limit) break;
  }
  return examples;
}

function buildSystemPrompt(taxonomy, examples) {
  const taxonomyLines = [];
  for (const [main, subs] of taxonomy.entries()) {
    for (const sub of subs) taxonomyLines.push(`${main} > ${sub}`);
  }

  return `You categorize personal credit-card and bank transactions for a single user into their custom budget taxonomy.

Valid categories (format "Main > Sub" — you must use these exact names):
${taxonomyLines.join('\n')}

How the user has categorized similar merchants before:
${examples.length ? examples.join('\n') : '(no examples yet)'}

For each transaction, return its id, your best category and subcategory from the taxonomy, and a confidence from 0 to 1:
- Confidence >= ${CONFIDENCE_THRESHOLD} means you are sure enough to apply it without asking. Only use this when the merchant clearly maps to one category.
- Below ${CONFIDENCE_THRESHOLD}, also return a short, specific "question" the user can answer in one tap (mention the merchant and what's ambiguous), and 2-3 "suggestions" (category/subcategory pairs from the taxonomy, most likely first, and the first suggestion must match your best-guess category/subcategory).
- Cryptic processor strings (e.g. "TST* ..." is a Toast restaurant terminal, "SQ *" is Square) often identify the merchant type — use that.
- Never invent categories that are not in the taxonomy. Do not use Income, Taxes, or transfer categories — those are handled elsewhere; these rows are all presumed spending.`;
}

function formatTransaction(e) {
  return {
    id: e.id,
    date: e.date,
    merchant: e.merchant || '',
    description: e.description || '',
    amount: e.amount,
    account: e.account || '',
    plaid_category: e.plaid_category || '',
    plaid_subcategory: e.plaid_subcategory || '',
  };
}

// Fetch rows eligible for the AI pass: no category, not a transfer.
// Category can be '' (sync) or null (manual clear) — two equality queries.
async function fetchUncategorized(month) {
  const [emptySnap, nullSnap] = await Promise.all([
    db.collection('expenses').where('category', '==', '').get(),
    db.collection('expenses').where('category', '==', null).get(),
  ]);
  const rows = [...emptySnap.docs, ...nullSnap.docs].map(docToObj)
    .filter(e => !e.is_transfer && !e.review_acknowledged && !e.needs_review);
  if (month) return rows.filter(e => (e.date || '').startsWith(month));
  return rows;
}

// Main entry. Applies merchant rules first (free), then batches the rest
// through the model. Returns counts for the UI.
// options: { month: 'YYYY-MM' } to scope to one month (used by the close flow).
async function categorizeUncategorized(userId, options = {}) {
  const uncategorized = await fetchUncategorized(options.month);
  const counts = {
    total: uncategorized.length,
    merchant_rule_applied: 0,
    ai_applied: 0,
    needs_review: 0,
    unprocessed: 0,
  };
  if (uncategorized.length === 0) return counts;

  const now = () => new Date().toISOString();

  // 1. Merchant rules — no API call needed.
  const rules = await loadMerchantRules();
  const remaining = [];
  {
    const batch = [];
    for (const e of uncategorized) {
      const rule = lookupMerchantRule(rules, e.merchant || e.description);
      if (rule) {
        batch.push({
          id: e.id,
          data: {
            category: rule.category,
            subcategory: rule.subcategory || null,
            categorization_source: 'merchant_rule',
            needs_review: false,
            ai_question: null,
            ai_suggestions: null,
            updated_at: now(),
          },
        });
        counts.merchant_rule_applied++;
      } else {
        remaining.push(e);
      }
    }
    await applyUpdates(batch);
  }

  if (remaining.length === 0 || !isConfigured()) {
    counts.unprocessed = remaining.length;
    return counts;
  }

  // 2. AI pass over the rest.
  const [taxonomy, examples] = await Promise.all([loadTaxonomy(), loadExamples()]);
  if (taxonomy.size === 0) {
    counts.unprocessed = remaining.length;
    return counts;
  }
  const system = buildSystemPrompt(taxonomy, examples);
  const anthropic = getClient();

  for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
    const chunk = remaining.slice(i, i + BATCH_SIZE);
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      system,
      messages: [{
        role: 'user',
        content: `Categorize these transactions:\n${JSON.stringify(chunk.map(formatTransaction), null, 1)}`,
      }],
    });

    if (response.stop_reason === 'refusal') {
      counts.unprocessed += chunk.length;
      continue;
    }

    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      counts.unprocessed += chunk.length;
      continue;
    }

    const byId = new Map(chunk.map(e => [String(e.id), e]));
    const updates = [];
    for (const r of parsed.results || []) {
      const expense = byId.get(String(r.id));
      if (!expense) continue;
      byId.delete(String(r.id));

      const validSubs = taxonomy.get(r.category);
      const valid = validSubs && validSubs.has(r.subcategory);
      const validSuggestions = (r.suggestions || [])
        .filter(s => taxonomy.get(s.category)?.has(s.subcategory))
        .slice(0, 3);

      if (valid && r.confidence >= CONFIDENCE_THRESHOLD) {
        updates.push({
          id: expense.id,
          data: {
            category: r.category,
            subcategory: r.subcategory,
            categorization_source: 'ai',
            ai_confidence: r.confidence,
            needs_review: false,
            ai_question: null,
            ai_suggestions: null,
            updated_at: now(),
          },
        });
        counts.ai_applied++;
      } else {
        updates.push({
          id: expense.id,
          data: {
            needs_review: true,
            ai_confidence: r.confidence ?? null,
            ai_question: r.question || `How should "${expense.merchant}" be categorized?`,
            ai_suggestions: valid && !validSuggestions.some(s => s.category === r.category && s.subcategory === r.subcategory)
              ? [{ category: r.category, subcategory: r.subcategory }, ...validSuggestions].slice(0, 3)
              : validSuggestions,
            updated_at: now(),
          },
        });
        counts.needs_review++;
      }
    }
    // Rows the model didn't return still need eyes — queue them.
    for (const expense of byId.values()) {
      updates.push({
        id: expense.id,
        data: {
          needs_review: true,
          ai_question: `How should "${expense.merchant}" be categorized?`,
          ai_suggestions: null,
          updated_at: now(),
        },
      });
      counts.needs_review++;
    }
    await applyUpdates(updates);
  }

  return counts;
}

async function applyUpdates(updates) {
  for (let i = 0; i < updates.length; i += 500) {
    const batch = db.batch();
    for (const u of updates.slice(i, i + 500)) {
      batch.update(db.collection('expenses').doc(String(u.id)), u.data);
    }
    await batch.commit();
  }
}

module.exports = { isConfigured, categorizeUncategorized, MODEL, CONFIDENCE_THRESHOLD };
