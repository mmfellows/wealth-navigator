// Quarterly review: per-category deep-dive analysis, keep/cut/grow
// decisions that write through to budget_items (so weekly pacing reflects
// the new plan immediately), and a persisted quarter_reviews record.

const express = require('express');
const { db, docToObj } = require('../services/database');
const { optionalAuth } = require('../middleware/auth');
const { normalizeMerchant } = require('../services/merchantRules');
const { getCategoryEnvelopes } = require('../services/budgetEnvelopes');

const router = express.Router();

router.use(optionalAuth);

const QUARTER_RE = /^\d{4}-Q[1-4]$/;

// 'YYYY-Qn' → { startDate, endDate } (inclusive YYYY-MM-DD)
function quarterRange(quarter) {
  const [y, qs] = quarter.split('-Q');
  const year = Number(y);
  const q = Number(qs);
  const startMonth = (q - 1) * 3; // 0-based
  const start = `${year}-${String(startMonth + 1).padStart(2, '0')}-01`;
  const endDay = new Date(year, startMonth + 3, 0).getDate();
  const end = `${year}-${String(startMonth + 3).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
  return { startDate: start, endDate: end };
}

function priorQuarter(quarter, back = 1) {
  const [y, qs] = quarter.split('-Q');
  let year = Number(y);
  let q = Number(qs) - back;
  while (q < 1) { q += 4; year -= 1; }
  return `${year}-Q${q}`;
}

function reviewDocId(userId, quarter) {
  return `${userId}_${quarter}`;
}

// Per-category analysis: this quarter vs the prior three, top merchants,
// subcategory breakdown, and the quarterly budget (envelope × 3).
router.get('/analysis', async (req, res) => {
  try {
    const { quarter } = req.query;
    if (!quarter || !QUARTER_RE.test(quarter)) {
      return res.status(400).json({ error: 'quarter (YYYY-Qn) is required' });
    }

    const quarters = [3, 2, 1, 0].map(b => priorQuarter(quarter, b)); // oldest → current
    const { startDate } = quarterRange(quarters[0]);
    const { endDate } = quarterRange(quarter);

    const [snapshot, envelopes] = await Promise.all([
      db.collection('expenses').where('date', '>=', startDate).where('date', '<=', endDate).get(),
      getCategoryEnvelopes(),
    ]);

    const ranges = quarters.map(q => ({ q, ...quarterRange(q) }));
    const quarterOf = (date) => {
      const r = ranges.find(r => date >= r.startDate && date <= r.endDate);
      return r ? r.q : null;
    };

    const categories = {};
    snapshot.docs.forEach(doc => {
      const e = doc.data();
      if (e.is_transfer || e.category === 'Income' || e.category === 'Taxes'
        || e.category === 'Credit Card Payment' || !e.category) return;
      const q = quarterOf(e.date);
      if (!q) return;
      const c = categories[e.category] = categories[e.category] || {
        spend_by_quarter: Object.fromEntries(quarters.map(x => [x, 0])),
        by_subcategory: {},
        merchants: new Map(),
      };
      c.spend_by_quarter[q] += e.amount;
      if (q === quarter) {
        const sub = e.subcategory || 'Uncategorized';
        c.by_subcategory[sub] = (c.by_subcategory[sub] || 0) + e.amount;
        const mk = normalizeMerchant(e.merchant || e.description) || '(unknown)';
        const m = c.merchants.get(mk) || { merchant: e.merchant || '(unknown)', total: 0, count: 0 };
        m.total += e.amount;
        m.count += 1;
        c.merchants.set(mk, m);
      }
    });

    const result = Object.entries(categories).map(([name, c]) => ({
      category: name,
      spend_by_quarter: quarters.map(q => ({ quarter: q, total: c.spend_by_quarter[q] })),
      current_quarter_spend: c.spend_by_quarter[quarter],
      by_subcategory: Object.entries(c.by_subcategory)
        .map(([sub, total]) => ({ subcategory: sub, total }))
        .sort((a, b) => b.total - a.total),
      top_merchants: [...c.merchants.values()].sort((a, b) => b.total - a.total).slice(0, 5),
      monthly_budget: envelopes.byCategory[name]?.total ?? null,
      quarterly_budget: envelopes.byCategory[name] ? envelopes.byCategory[name].total * 3 : null,
    }));

    // Budgeted categories with zero spend still deserve a look (dead budget?).
    for (const [name, env] of Object.entries(envelopes.byCategory)) {
      if (!categories[name]) {
        result.push({
          category: name,
          spend_by_quarter: quarters.map(q => ({ quarter: q, total: 0 })),
          current_quarter_spend: 0,
          by_subcategory: [],
          top_merchants: [],
          monthly_budget: env.total,
          quarterly_budget: env.total * 3,
        });
      }
    }

    result.sort((a, b) => {
      if ((a.category === 'Discretionary') !== (b.category === 'Discretionary')) {
        return a.category === 'Discretionary' ? -1 : 1;
      }
      return b.current_quarter_spend - a.current_quarter_spend;
    });

    res.json({ quarter, quarters, categories: result });
  } catch (error) {
    console.error('Error computing quarter analysis:', error);
    res.status(500).json({ error: 'Failed to compute quarter analysis' });
  }
});

// Apply one category decision to budget_items: scale active items so the
// category's monthly envelope hits target_monthly. A category with no
// items gets a single catch-all item. Records price history on each item.
async function applyDecisionToBudget(decision) {
  const { category, target_monthly } = decision;
  if (typeof target_monthly !== 'number' || target_monthly < 0) return null;

  const snapshot = await db.collection('budget_items').get();
  const items = snapshot.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(i => i.mainCategory === category && (i.status === 'active' || !i.status));

  const now = new Date().toISOString();
  const currentMonthly = items.reduce((s, i) => s + (Number(i.monthlyExpectedSpend) || 0), 0);

  if (items.length === 0) {
    if (target_monthly > 0) {
      await db.collection('budget_items').add({
        itemName: `${category} Plan`,
        mainCategory: category,
        secondaryCategory: 'General',
        frequency: 'monthly',
        amount: target_monthly,
        monthlyExpectedSpend: target_monthly,
        startDate: now.substring(0, 10),
        endDate: null,
        status: 'active',
        archivedDate: null,
        priceHistory: [],
        created_at: now,
        updated_at: now,
      });
    }
    return { previous_monthly: 0, new_monthly: target_monthly };
  }

  if (currentMonthly <= 0) return { previous_monthly: 0, new_monthly: currentMonthly };
  const factor = target_monthly / currentMonthly;
  if (Math.abs(factor - 1) < 0.001) return { previous_monthly: currentMonthly, new_monthly: currentMonthly };

  const batch = db.batch();
  for (const item of items) {
    const newAmount = Number((item.amount * factor).toFixed(2));
    const newMonthly = item.frequency === 'annual' ? newAmount / 12 : newAmount;
    batch.update(db.collection('budget_items').doc(item.id), {
      amount: newAmount,
      monthlyExpectedSpend: newMonthly,
      priceHistory: [
        ...(item.priceHistory || []),
        { date: now.substring(0, 10), previousAmount: item.amount, newAmount, reason: 'quarterly_review' },
      ],
      updated_at: now,
    });
  }
  await batch.commit();
  return { previous_monthly: currentMonthly, new_monthly: target_monthly };
}

// Complete (or update) a quarterly review.
// Body: { quarter, decisions: [{category, decision: keep|cut|grow,
//         target_monthly?, note?}], notes? }
router.post('/', async (req, res) => {
  try {
    const { quarter, decisions, notes } = req.body || {};
    if (!quarter || !QUARTER_RE.test(quarter)) {
      return res.status(400).json({ error: 'quarter (YYYY-Qn) is required' });
    }
    if (!Array.isArray(decisions)) {
      return res.status(400).json({ error: 'decisions array is required' });
    }

    const applied = [];
    for (const d of decisions) {
      if (!d.category || !['keep', 'cut', 'grow'].includes(d.decision)) continue;
      let budgetChange = null;
      if (d.decision !== 'keep' && typeof d.target_monthly === 'number') {
        budgetChange = await applyDecisionToBudget(d);
      }
      applied.push({
        category: d.category,
        decision: d.decision,
        target_monthly: d.target_monthly ?? null,
        note: d.note || null,
        budget_change: budgetChange,
      });
    }

    const data = {
      user_id: req.user.id,
      quarter,
      decisions: applied,
      notes: notes || null,
      completed_at: new Date().toISOString(),
    };
    await db.collection('quarter_reviews').doc(reviewDocId(req.user.id, quarter)).set(data);
    res.status(201).json(data);
  } catch (error) {
    console.error('Error saving quarterly review:', error);
    res.status(500).json({ error: 'Failed to save quarterly review' });
  }
});

router.get('/', async (req, res) => {
  try {
    const snapshot = await db.collection('quarter_reviews')
      .where('user_id', '==', req.user.id)
      .get();
    res.json(snapshot.docs.map(docToObj).sort((a, b) => b.quarter.localeCompare(a.quarter)));
  } catch (error) {
    console.error('Error listing quarterly reviews:', error);
    res.status(500).json({ error: 'Failed to list quarterly reviews' });
  }
});

router.get('/:quarter', async (req, res) => {
  try {
    const { quarter } = req.params;
    if (!QUARTER_RE.test(quarter)) {
      return res.status(400).json({ error: 'quarter must be YYYY-Qn' });
    }
    const doc = await db.collection('quarter_reviews').doc(reviewDocId(req.user.id, quarter)).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'No review for this quarter' });
    }
    res.json(docToObj(doc));
  } catch (error) {
    console.error('Error fetching quarterly review:', error);
    res.status(500).json({ error: 'Failed to fetch quarterly review' });
  }
});

module.exports = router;
