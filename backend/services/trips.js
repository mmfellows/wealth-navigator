// Trips: a layer on top of categories.
//
// A category says what kind of thing an expense is (a restaurant stays Food &
// Dining); a trip says what it was part of. A trip is a name + date range.
// Which trip an expense belongs to is resolved at read time:
//   1. expense.trip_id = '<trip id>'  → attached by hand (e.g. flights booked
//      months earlier)
//   2. expense.trip_id = 'none'       → removed from its trip by hand
//   3. otherwise, the trip whose dates contain the expense date — unless it's
//      a cost that would have happened at home anyway (rent, utilities,
//      insurance, subscriptions, gym memberships, transfers, income, taxes).
// Nothing is written to an expense unless the user overrides the default, so
// transactions synced later during a trip are picked up automatically.
//
// For budgets and pacing, trip spending — plus anything categorized as
// Travel & Vacation that isn't on a trip yet — is reported under its own
// bucket (TRIPS_CATEGORY) instead of the everyday categories, so two weeks
// away don't read as blowing the dining budget.

const { db, docToObj } = require('./database');

const TRIPS_CATEGORY = 'Trips & Travel';
const TRAVEL_SUBCATEGORY = 'Travel & Vacation';
const NO_TRIP = 'none';

// Costs that recur at home whether or not you're away.
const HOME_CATEGORIES = new Set(['Home']);
const HOME_SUBCATEGORIES = new Set(['Housing', 'Utilities', 'Health Insurance', 'Insurance', 'Apps & Subscriptions', 'Gym']);

const isSpendRow = e =>
  !e.is_transfer && !e.is_credit_card_payment &&
  e.category !== 'Income' && e.category !== 'Taxes' && e.category !== 'Credit Card Payment';

const autoEligible = e =>
  isSpendRow(e) && !HOME_CATEGORIES.has(e.category) && !HOME_SUBCATEGORIES.has(e.subcategory);

async function loadTrips() {
  const snap = await db.collection('trips').get();
  return snap.docs.map(docToObj).sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));
}

// → fn(expense) → trip | null
function makeTripResolver(trips) {
  const byId = Object.fromEntries(trips.map(t => [t.id, t]));
  return e => {
    if (e.trip_id === NO_TRIP) return null;
    if (e.trip_id) return byId[e.trip_id] || null;
    if (!e.date || !autoEligible(e)) return null;
    return trips.find(t => e.date >= t.start_date && e.date <= t.end_date) || null;
  };
}

async function getTripResolver() {
  return makeTripResolver(await loadTrips());
}

// The category an expense counts under for budgets and pacing.
function effectiveCategory(e, tripOf) {
  if (!isSpendRow(e)) return e.category;
  return tripOf(e) || e.subcategory === TRAVEL_SUBCATEGORY ? TRIPS_CATEGORY : e.category;
}

// A budget line belongs to the trips bucket if it's the travel line.
const isTravelBudgetItem = item =>
  item.mainCategory === TRIPS_CATEGORY || item.secondaryCategory === TRAVEL_SUBCATEGORY;

const DAY = 86400000;
const toUTC = iso => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const tripDays = t => Math.round((toUTC(t.end_date) - toUTC(t.start_date)) / DAY) + 1;

// The share of a trip's budget that falls in a month ('YYYY-MM'), by days.
function tripBudgetInMonth(trip, month) {
  const budget = Number(trip.budget) || 0;
  if (!budget || !trip.start_date || !trip.end_date) return 0;
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const monthStart = Date.UTC(y, m - 1, 1);
  const monthEnd = Date.UTC(y, m, 0);
  const from = Math.max(toUTC(trip.start_date), monthStart);
  const to = Math.min(toUTC(trip.end_date), monthEnd);
  if (to < from) return 0;
  return budget * ((to - from) / DAY + 1) / tripDays(trip);
}

module.exports = {
  TRIPS_CATEGORY, TRAVEL_SUBCATEGORY, NO_TRIP,
  loadTrips, makeTripResolver, getTripResolver,
  effectiveCategory, isSpendRow, autoEligible, isTravelBudgetItem,
  tripDays, tripBudgetInMonth,
};
