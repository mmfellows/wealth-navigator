const express = require('express');
const { db, docToObj } = require('../services/database');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

const BET_TYPES = ['Long', 'Mid', 'Short', 'Core'];
const BET_STATUSES = ['planned', 'active', 'closed'];
const ACTIVE_STATUSES = ['planned', 'active'];

// Normalize a ticker for collision checks: uppercase, trimmed, blanks dropped.
const normalizeTickers = (tickers) =>
  Array.isArray(tickers)
    ? Array.from(new Set(tickers.map(t => String(t || '').trim().toUpperCase()).filter(Boolean)))
    : [];

// Throws if any ticker on the candidate bet collides with an active/planned bet
// owned by the same user. Excludes the candidate's own id when updating.
async function assertNoTickerCollision(userId, tickers, excludeBetId) {
  if (!tickers || tickers.length === 0) return;

  const snapshot = await db.collection('bets')
    .where('user_id', '==', userId)
    .where('status', 'in', ACTIVE_STATUSES)
    .get();

  const candidateSet = new Set(tickers);

  for (const doc of snapshot.docs) {
    if (doc.id === excludeBetId) continue;
    const other = doc.data();
    if (other.type === 'Core') continue; // Core matches by account subtype, not ticker

    const overlap = (other.tickers || []).filter(t => candidateSet.has(t));
    if (overlap.length > 0) {
      const err = new Error(
        `Ticker${overlap.length > 1 ? 's' : ''} ${overlap.join(', ')} already in active bet "${other.name}". ` +
        `Close that bet first or remove the ticker.`
      );
      err.statusCode = 409;
      throw err;
    }
  }
}

// Ensure the user has the synthetic Core bet that auto-buckets retirement
// holdings. Idempotent — safe to call on every GET.
async function ensureSyntheticCoreBet(userId) {
  const existing = await db.collection('bets')
    .where('user_id', '==', userId)
    .where('type', '==', 'Core')
    .where('is_synthetic', '==', true)
    .limit(1)
    .get();

  if (!existing.empty) return docToObj(existing.docs[0]);

  const now = new Date().toISOString();
  const data = {
    user_id: userId,
    name: 'Core / Long-term',
    type: 'Core',
    tickers: [],
    buy_date: null,
    target_sell_date: null,
    actual_sell_date: null,
    thesis: 'Auto-bucket for retirement and tax-advantaged accounts (401k, IRA, Roth, 403b, 529, HSA).',
    status: 'active',
    is_synthetic: true,
    created_at: now,
    updated_at: now,
  };
  const ref = await db.collection('bets').add(data);
  return { id: ref.id, ...data };
}

function validateBetInput(body, { isUpdate = false } = {}) {
  const errors = [];
  const out = {};

  if (!isUpdate || body.name !== undefined) {
    const name = (body.name || '').toString().trim();
    if (!name) errors.push('name is required');
    out.name = name;
  }

  if (!isUpdate || body.type !== undefined) {
    if (!BET_TYPES.includes(body.type)) errors.push(`type must be one of ${BET_TYPES.join(', ')}`);
    out.type = body.type;
  }

  if (!isUpdate || body.status !== undefined) {
    const status = body.status || 'active';
    if (!BET_STATUSES.includes(status)) errors.push(`status must be one of ${BET_STATUSES.join(', ')}`);
    out.status = status;
  }

  if (!isUpdate || body.tickers !== undefined) {
    out.tickers = normalizeTickers(body.tickers);
  }

  // Non-Core bets must have at least one ticker (unless they're closed)
  if (out.type && out.type !== 'Core' && out.status !== 'closed' && out.tickers && out.tickers.length === 0) {
    errors.push('non-Core bets need at least one ticker');
  }

  if (body.buy_date !== undefined) out.buy_date = body.buy_date || null;
  if (body.target_sell_date !== undefined) out.target_sell_date = body.target_sell_date || null;
  if (body.actual_sell_date !== undefined) out.actual_sell_date = body.actual_sell_date || null;
  if (body.thesis !== undefined) out.thesis = (body.thesis || '').toString();

  return { errors, data: out };
}

// List bets. ?status=active|planned|closed filters.
router.get('/', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    await ensureSyntheticCoreBet(userId);

    let query = db.collection('bets').where('user_id', '==', userId);
    if (req.query.status && BET_STATUSES.includes(req.query.status)) {
      query = query.where('status', '==', req.query.status);
    }
    const snapshot = await query.get();

    const bets = snapshot.docs.map(docToObj).sort((a, b) => {
      // synthetic Core last, then by created_at desc
      if (a.is_synthetic && !b.is_synthetic) return 1;
      if (!a.is_synthetic && b.is_synthetic) return -1;
      return (b.created_at || '').localeCompare(a.created_at || '');
    });

    res.json(bets);
  } catch (error) {
    console.error('Error listing bets:', error);
    res.status(500).json({ error: 'Failed to list bets' });
  }
});

// Create bet
router.post('/', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { errors, data } = validateBetInput(req.body, { isUpdate: false });
    if (errors.length > 0) return res.status(400).json({ error: errors.join('; ') });

    if (data.type !== 'Core') {
      await assertNoTickerCollision(userId, data.tickers);
    }

    const now = new Date().toISOString();
    const doc = {
      user_id: userId,
      name: data.name,
      type: data.type,
      tickers: data.tickers || [],
      buy_date: data.buy_date || null,
      target_sell_date: data.target_sell_date || null,
      actual_sell_date: data.actual_sell_date || null,
      thesis: data.thesis || '',
      status: data.status || 'active',
      is_synthetic: false,
      created_at: now,
      updated_at: now,
    };
    const ref = await db.collection('bets').add(doc);
    res.status(201).json({ id: ref.id, ...doc });
  } catch (error) {
    if (error.statusCode === 409) return res.status(409).json({ error: error.message });
    console.error('Error creating bet:', error);
    res.status(500).json({ error: 'Failed to create bet' });
  }
});

// Update bet
router.put('/:id', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const docRef = db.collection('bets').doc(req.params.id);
    const snap = await docRef.get();
    if (!snap.exists || snap.data().user_id !== userId) {
      return res.status(404).json({ error: 'Bet not found' });
    }

    // Synthetic Core is read-only beyond thesis text
    if (snap.data().is_synthetic) {
      const allowed = {};
      if (req.body.thesis !== undefined) allowed.thesis = req.body.thesis;
      if (req.body.name !== undefined) allowed.name = req.body.name;
      if (Object.keys(allowed).length === 0) {
        return res.status(400).json({ error: 'Synthetic Core bet only accepts name/thesis edits' });
      }
      allowed.updated_at = new Date().toISOString();
      await docRef.update(allowed);
      const updated = await docRef.get();
      return res.json(docToObj(updated));
    }

    const { errors, data } = validateBetInput(req.body, { isUpdate: true });
    if (errors.length > 0) return res.status(400).json({ error: errors.join('; ') });

    if (data.tickers !== undefined && (data.type || snap.data().type) !== 'Core') {
      const status = data.status || snap.data().status;
      if (ACTIVE_STATUSES.includes(status)) {
        await assertNoTickerCollision(userId, data.tickers, req.params.id);
      }
    }

    data.updated_at = new Date().toISOString();
    await docRef.update(data);
    const updated = await docRef.get();
    res.json(docToObj(updated));
  } catch (error) {
    if (error.statusCode === 409) return res.status(409).json({ error: error.message });
    console.error('Error updating bet:', error);
    res.status(500).json({ error: 'Failed to update bet' });
  }
});

// Close a bet — sets status=closed and stamps actual_sell_date if not provided.
router.post('/:id/close', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const docRef = db.collection('bets').doc(req.params.id);
    const snap = await docRef.get();
    if (!snap.exists || snap.data().user_id !== userId) {
      return res.status(404).json({ error: 'Bet not found' });
    }
    if (snap.data().is_synthetic) {
      return res.status(400).json({ error: 'Cannot close the synthetic Core bet' });
    }

    const today = new Date().toISOString().slice(0, 10);
    await docRef.update({
      status: 'closed',
      actual_sell_date: req.body?.actual_sell_date || today,
      updated_at: new Date().toISOString(),
    });
    const updated = await docRef.get();
    res.json(docToObj(updated));
  } catch (error) {
    console.error('Error closing bet:', error);
    res.status(500).json({ error: 'Failed to close bet' });
  }
});

// Delete bet (use sparingly — closed bets are usually preferable for the audit trail)
router.delete('/:id', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const docRef = db.collection('bets').doc(req.params.id);
    const snap = await docRef.get();
    if (!snap.exists || snap.data().user_id !== userId) {
      return res.status(404).json({ error: 'Bet not found' });
    }
    if (snap.data().is_synthetic) {
      return res.status(400).json({ error: 'Cannot delete the synthetic Core bet' });
    }
    await docRef.delete();
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting bet:', error);
    res.status(500).json({ error: 'Failed to delete bet' });
  }
});

module.exports = router;
module.exports.ensureSyntheticCoreBet = ensureSyntheticCoreBet;
