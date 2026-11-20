// Trips: named date ranges that expenses belong to, independent of their
// category. See services/trips.js for how membership is resolved.

const express = require('express');
const { db, docToObj } = require('../services/database');
const { optionalAuth } = require('../middleware/auth');
const {
  NO_TRIP, TRAVEL_SUBCATEGORY, loadTrips, makeTripResolver, isSpendRow, tripDays,
} = require('../services/trips');

const router = express.Router();

router.use(optionalAuth);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validate(body, { partial = false } = {}) {
  const out = {};
  if (!partial || 'name' in body) {
    if (!body.name || !String(body.name).trim()) return { error: 'name is required' };
    out.name = String(body.name).trim();
  }
  for (const f of ['start_date', 'end_date']) {
    if (!partial || f in body) {
      if (!DATE_RE.test(body[f] || '')) return { error: `${f} must be YYYY-MM-DD` };
      out[f] = body[f];
    }
  }
  if ('budget' in body) {
    const b = body.budget === null || body.budget === '' ? null : Number(body.budget);
    if (b !== null && (!Number.isFinite(b) || b < 0)) return { error: 'budget must be a positive number' };
    out.budget = b;
  }
  if ('notes' in body) out.notes = body.notes || null;
  return { data: out };
}

const slim = e => ({
  id: e.id, date: e.date, merchant: e.merchant || e.description || 'Unknown', amount: e.amount,
  category: e.category || null, subcategory: e.subcategory || null,
});

async function loadAllExpenses() {
  const snap = await db.collection('expenses').get();
  return snap.docs.map(docToObj).filter(e => e.date && isSpendRow(e));
}

function summarize(trip, members) {
  const total = members.reduce((s, e) => s + (e.amount || 0), 0);
  const days = tripDays(trip);
  const byCat = {};
  members.forEach(e => {
    const key = e.subcategory || e.category || 'Uncategorized';
    byCat[key] = (byCat[key] || 0) + (e.amount || 0);
  });
  return {
    total,
    count: members.length,
    days,
    per_day: days > 0 ? total / days : 0,
    by_category: Object.entries(byCat).map(([category, amount]) => ({ category, total: amount })).sort((a, b) => b.total - a.total),
  };
}

// All trips with their totals, plus a per-year roll-up for planning.
router.get('/', async (req, res) => {
  try {
    const [trips, expenses] = await Promise.all([loadTrips(), loadAllExpenses()]);
    const tripOf = makeTripResolver(trips);
    const members = {};
    expenses.forEach(e => {
      const t = tripOf(e);
      if (t) (members[t.id] = members[t.id] || []).push(e);
    });
    const out = trips.map(t => ({ ...t, ...summarize(t, members[t.id] || []) }));
    const byYear = {};
    out.forEach(t => {
      const y = String(t.start_date).slice(0, 4);
      const yr = (byYear[y] = byYear[y] || { year: y, total: 0, trips: 0, days: 0, budget: 0 });
      yr.total += t.total;
      yr.trips += 1;
      yr.days += t.days;
      yr.budget += Number(t.budget) || 0;
    });
    res.json({
      trips: out.sort((a, b) => String(b.start_date).localeCompare(String(a.start_date))),
      by_year: Object.values(byYear).sort((a, b) => b.year.localeCompare(a.year)),
    });
  } catch (error) {
    console.error('Error fetching trips:', error);
    res.status(500).json({ error: 'Failed to fetch trips' });
  }
});

// One trip: its expenses, and nearby expenses that might belong to it.
router.get('/:id', async (req, res) => {
  try {
    const [trips, expenses] = await Promise.all([loadTrips(), loadAllExpenses()]);
    const trip = trips.find(t => t.id === req.params.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    const tripOf = makeTripResolver(trips);

    const members = expenses.filter(e => tripOf(e)?.id === trip.id)
      .sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);

    // Candidates: not on any trip, and either dated during this trip (left
    // out by default or removed by hand) or travel-type spending in the
    // months before it (bookings).
    const shift = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
    const from = shift(trip.start_date, -180);
    const candidates = expenses.filter(e => {
      if (tripOf(e)) return false;
      const inRange = e.date >= trip.start_date && e.date <= trip.end_date;
      const travelish = e.subcategory === TRAVEL_SUBCATEGORY || /TRAVEL/.test(e.plaid_category || '');
      return inRange || (travelish && e.date >= from && e.date < trip.start_date);
    }).sort((a, b) => b.date.localeCompare(a.date));

    res.json({
      trip: { ...trip, ...summarize(trip, members) },
      expenses: members.map(e => ({ ...slim(e), attached_by_hand: e.trip_id === trip.id })),
      candidates: candidates.map(e => ({
        ...slim(e),
        during_trip: e.date >= trip.start_date && e.date <= trip.end_date,
        removed: e.trip_id === NO_TRIP,
      })),
    });
  } catch (error) {
    console.error('Error fetching trip:', error);
    res.status(500).json({ error: 'Failed to fetch trip' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { error, data } = validate(req.body);
    if (error) return res.status(400).json({ error });
    if (data.end_date < data.start_date) return res.status(400).json({ error: 'end_date is before start_date' });
    const doc = { budget: null, notes: null, ...data, user_id: req.user?.id || null, created_at: new Date().toISOString() };
    const ref = await db.collection('trips').add(doc);
    res.status(201).json({ id: ref.id, ...doc });
  } catch (error) {
    console.error('Error creating trip:', error);
    res.status(500).json({ error: 'Failed to create trip' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const ref = db.collection('trips').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Trip not found' });
    const { error, data } = validate(req.body, { partial: true });
    if (error) return res.status(400).json({ error });
    const merged = { ...doc.data(), ...data };
    if (merged.end_date < merged.start_date) return res.status(400).json({ error: 'end_date is before start_date' });
    await ref.update({ ...data, updated_at: new Date().toISOString() });
    res.json({ id: doc.id, ...merged });
  } catch (error) {
    console.error('Error updating trip:', error);
    res.status(500).json({ error: 'Failed to update trip' });
  }
});

// Deleting a trip releases its expenses; nothing about the expenses
// themselves changes apart from clearing hand-made attachments to it.
router.delete('/:id', async (req, res) => {
  try {
    const ref = db.collection('trips').doc(req.params.id);
    if (!(await ref.get()).exists) return res.status(404).json({ error: 'Trip not found' });
    const attached = await db.collection('expenses').where('trip_id', '==', req.params.id).get();
    const batch = db.batch();
    attached.docs.forEach(d => batch.update(d.ref, { trip_id: null }));
    batch.delete(ref);
    await batch.commit();
    res.json({ message: 'Trip deleted', released: attached.size });
  } catch (error) {
    console.error('Error deleting trip:', error);
    res.status(500).json({ error: 'Failed to delete trip' });
  }
});

// Attach an expense to this trip by hand.
router.post('/:id/expenses', async (req, res) => {
  try {
    const { expense_id } = req.body;
    if (!expense_id) return res.status(400).json({ error: 'expense_id is required' });
    const [trip, expense] = await Promise.all([
      db.collection('trips').doc(req.params.id).get(),
      db.collection('expenses').doc(expense_id).get(),
    ]);
    if (!trip.exists) return res.status(404).json({ error: 'Trip not found' });
    if (!expense.exists) return res.status(404).json({ error: 'Expense not found' });
    await expense.ref.update({ trip_id: req.params.id, updated_at: new Date().toISOString() });
    res.json({ message: 'Added to trip' });
  } catch (error) {
    console.error('Error attaching expense:', error);
    res.status(500).json({ error: 'Failed to add expense to trip' });
  }
});

// Take an expense off this trip (it won't be re-added by the date range).
router.delete('/:id/expenses/:expenseId', async (req, res) => {
  try {
    const expense = await db.collection('expenses').doc(req.params.expenseId).get();
    if (!expense.exists) return res.status(404).json({ error: 'Expense not found' });
    await expense.ref.update({ trip_id: NO_TRIP, updated_at: new Date().toISOString() });
    res.json({ message: 'Removed from trip' });
  } catch (error) {
    console.error('Error detaching expense:', error);
    res.status(500).json({ error: 'Failed to remove expense from trip' });
  }
});

module.exports = router;
