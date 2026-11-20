// Emailed spending reports.
//
//   digest     twice a month (8th and 22nd): month-to-date pacing, the
//              transactions since the last digest to glance over, anything
//              still uncategorized, and a prompt to add planned costs.
//   monthly    on the 2nd: last month's spend vs budget.
//   quarterly  on the 3rd of Jan/Apr/Jul/Oct: last quarter vs budget.
//   annual     on Jan 4th: last year vs budget.
//
// Everything is computed from the same sources the app uses (expenses +
// budget envelopes), so the numbers in the email match the dashboard.
// Dates are handled as 'YYYY-MM-DD' strings and UTC calendar days; the cron
// fires mid-day UTC so the calendar day is the same across US time zones.

const { db, docToObj } = require('./database');
const { loadEnvelopeSources, computeEnvelopes } = require('./budgetEnvelopes');
const { detectRecurringCosts } = require('./recurringCosts');
const { makeTripResolver, effectiveCategory } = require('./trips');

const DIGEST_DAYS = [8, 22];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const pad = n => String(n).padStart(2, '0');
const ym = (y, m) => `${y}-${pad(m)}`; // m is 1-12
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const addMonths = (y, m, delta) => {
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return [d.getUTCFullYear(), d.getUTCMonth() + 1];
};
const monthLabel = key => `${MONTH_NAMES[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
const shortDate = iso => `${MONTH_NAMES[Number(iso.slice(5, 7)) - 1].slice(0, 3)} ${Number(iso.slice(8, 10))}`;

function appUrl() {
  return (process.env.APP_URL || process.env.WEBAUTHN_ORIGIN || 'https://wealth-navigator-chi.vercel.app').replace(/\/$/, '');
}

// ---------- data ----------

const isSpend = e =>
  !e.is_transfer && !e.is_credit_card_payment &&
  e.category !== 'Income' && e.category !== 'Taxes' && e.category !== 'Credit Card Payment';

async function loadExpenses(startDate, endDate) {
  const snap = await db.collection('expenses')
    .where('date', '>=', startDate)
    .where('date', '<=', endDate)
    .get();
  return snap.docs.map(docToObj).filter(e => !e.is_transfer && e.date);
}

// Count trip spending under "Trips & Travel" (as the envelopes do), keeping
// the real category and the trip name alongside for display.
function withTrips(expenses, trips) {
  const tripOf = makeTripResolver(trips);
  return expenses.map(e => {
    const trip = tripOf(e);
    return { ...e, raw_category: e.category, trip_name: trip ? trip.name : null, category: effectiveCategory(e, tripOf) };
  });
}

function summarize(expenses) {
  const out = { spend: 0, income: 0, taxes: 0, byCategory: {}, byMonth: {}, byMerchant: {} };
  expenses.forEach(e => {
    const month = e.date.slice(0, 7);
    const m = (out.byMonth[month] = out.byMonth[month] || { spend: 0, income: 0, taxes: 0 });
    if (e.category === 'Income') { out.income += -e.amount; m.income += -e.amount; return; }
    if (e.category === 'Taxes') { out.taxes += e.amount; m.taxes += e.amount; return; }
    if (!isSpend(e)) return;
    const amount = e.amount || 0;
    const cat = e.category || 'Uncategorized';
    out.spend += amount;
    m.spend += amount;
    out.byCategory[cat] = (out.byCategory[cat] || 0) + amount;
    const merchant = e.merchant || e.description || 'Unknown';
    const mm = (out.byMerchant[merchant] = out.byMerchant[merchant] || { merchant, total: 0, count: 0 });
    mm.total += amount;
    mm.count += 1;
  });
  return out;
}

// Same thresholds as the Pacing page (src/components/CategoryPacing.tsx).
function paceStatus(ratio, elapsed) {
  if (ratio >= 1) return 'blown';
  if (ratio > elapsed + 0.1) return 'hot';
  if (ratio < elapsed - 0.15) return 'under';
  return 'on';
}

function categoryRows(actualByCat, budgetByCat) {
  const names = new Set([...Object.keys(actualByCat), ...Object.keys(budgetByCat)]);
  return [...names].map(name => ({
    name,
    actual: actualByCat[name] || 0,
    budget: budgetByCat[name] ?? null,
  }));
}

function sumEnvelopes(sources, months) {
  const byCategory = {};
  const byMonth = {};
  let total = 0;
  months.forEach(month => {
    const env = computeEnvelopes(sources, month);
    byMonth[month] = env.total;
    total += env.total;
    Object.entries(env.byCategory).forEach(([cat, v]) => {
      byCategory[cat] = (byCategory[cat] || 0) + v.total;
    });
  });
  return { total, byCategory, byMonth };
}

async function reviewQueueCount() {
  const [reviewSnap, emptySnap, nullSnap] = await Promise.all([
    db.collection('expenses').where('needs_review', '==', true).get(),
    db.collection('expenses').where('category', '==', '').get(),
    db.collection('expenses').where('category', '==', null).get(),
  ]);
  const ids = new Set();
  [...reviewSnap.docs, ...emptySnap.docs, ...nullSnap.docs].forEach(doc => {
    const e = doc.data();
    if (e.is_transfer || (e.review_acknowledged && !e.needs_review)) return;
    ids.add(doc.id);
  });
  return ids.size;
}

// ---------- digest ----------

async function buildDigestData(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const day = now.getUTCDate();
  const month = ym(y, m);
  const daysInMonth = daysIn(y, m);
  const elapsed = day / daysInMonth;
  const today = `${month}-${pad(day)}`;

  // Transactions since the previous digest date (the most recent 8th/22nd
  // strictly before today).
  let since;
  if (day > 22) since = `${month}-22`;
  else if (day > 8) since = `${month}-08`;
  else { const [py, pm] = addMonths(y, m, -1); since = `${ym(py, pm)}-22`; }

  const loadStart = since < `${month}-01` ? since : `${month}-01`;
  const [rawExpenses, sources, toCategorize, recurring] = await Promise.all([
    loadExpenses(loadStart, today),
    loadEnvelopeSources(),
    reviewQueueCount(),
    detectRecurringCosts().catch(() => []),
  ]);

  const expenses = withTrips(rawExpenses, sources.trips);
  const mtd = summarize(expenses.filter(e => e.date >= `${month}-01`));
  const env = computeEnvelopes(sources, month);
  const budgetByCat = Object.fromEntries(Object.entries(env.byCategory).map(([k, v]) => [k, v.total]));
  const categories = categoryRows(mtd.byCategory, budgetByCat)
    .map(r => {
      const ratio = r.budget && r.budget > 0 ? r.actual / r.budget : null;
      return { ...r, ratio, status: ratio === null ? null : paceStatus(ratio, elapsed) };
    })
    .sort((a, b) => {
      if ((a.ratio === null) !== (b.ratio === null)) return a.ratio === null ? 1 : -1;
      if (a.ratio === null) return b.actual - a.actual;
      return b.ratio - a.ratio;
    });

  const transactions = expenses
    .filter(e => e.date >= since)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.amount - a.amount))
    .map(e => ({
      date: e.date,
      merchant: e.merchant || e.description || 'Unknown',
      amount: e.amount,
      category: e.raw_category || null,
      subcategory: e.subcategory || null,
      trip: e.trip_name,
      flagged: !e.raw_category || !!e.needs_review,
    }));

  const [ny, nm] = addMonths(y, m, 1);
  const planned = sources.planned
    .filter(p => p.month >= month)
    .sort((a, b) => a.month.localeCompare(b.month) || b.amount - a.amount);

  return {
    month, day, daysInMonth, elapsed, since, today,
    spend: mtd.spend,
    budget: env.total,
    proRated: env.total * elapsed,
    categories,
    transactions,
    toCategorize,
    newRecurring: recurring.filter(r => r.is_new),
    planned,
    nextMonth: ym(ny, nm),
  };
}

// ---------- period lookbacks ----------

function periodFor(type, now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const monthsFrom = (sy, sm, n) => Array.from({ length: n }, (_, i) => ym(...addMonths(sy, sm, i)));

  if (type === 'monthly') {
    const [py, pm] = addMonths(y, m, -1);
    return {
      type, key: ym(py, pm), label: monthLabel(ym(py, pm)), noun: 'month',
      months: [ym(py, pm)], priorMonths: [ym(...addMonths(py, pm, -1))],
      priorLabel: monthLabel(ym(...addMonths(py, pm, -1))),
      link: `/close`, linkText: 'Close the month',
    };
  }
  if (type === 'quarterly') {
    const thisQStart = Math.floor((m - 1) / 3) * 3 + 1;
    const [qy, qm] = addMonths(y, thisQStart, -3);
    const [ppy, ppm] = addMonths(qy, qm, -3);
    const q = Math.floor((qm - 1) / 3) + 1;
    const pq = Math.floor((ppm - 1) / 3) + 1;
    return {
      type, key: `${qy}-Q${q}`, label: `Q${q} ${qy}`, noun: 'quarter',
      months: monthsFrom(qy, qm, 3), priorMonths: monthsFrom(ppy, ppm, 3),
      priorLabel: `Q${pq} ${ppy}`,
      link: `/quarterly`, linkText: 'Do the quarterly review',
    };
  }
  if (type === 'annual') {
    return {
      type, key: String(y - 1), label: String(y - 1), noun: 'year',
      months: monthsFrom(y - 1, 1, 12), priorMonths: monthsFrom(y - 2, 1, 12),
      priorLabel: String(y - 2),
      link: `/reports`, linkText: 'Open the dashboard',
    };
  }
  throw new Error(`Unknown report type: ${type}`);
}

const monthEnd = key => `${key}-${pad(daysIn(Number(key.slice(0, 4)), Number(key.slice(5, 7))))}`;

async function buildPeriodData(type, now = new Date()) {
  const period = periodFor(type, now);
  const start = `${period.months[0]}-01`;
  const end = monthEnd(period.months[period.months.length - 1]);
  const priorStart = `${period.priorMonths[0]}-01`;

  const [rawAll, sources] = await Promise.all([loadExpenses(priorStart, end), loadEnvelopeSources()]);
  const all = withTrips(rawAll, sources.trips);
  const current = all.filter(e => e.date >= start);
  const cur = summarize(current);
  const prior = summarize(all.filter(e => e.date < start));
  // If transaction history starts part-way through the period, only budget
  // the months that have data — otherwise an empty month reads as "under".
  const covered = period.months.filter(key => cur.byMonth[key]);
  const partial = covered.length > 0 && covered.length < period.months.length;
  const budget = sumEnvelopes(sources, partial ? covered : period.months);

  const categories = categoryRows(cur.byCategory, budget.byCategory)
    .map(r => ({ ...r, prior: prior.byCategory[r.name] || 0 }))
    .sort((a, b) => b.actual - a.actual);

  const net = cur.income - cur.spend - cur.taxes;
  return {
    period,
    coverage: partial ? { covered: covered.length, of: period.months.length, first: covered[0] } : null,
    spend: cur.spend, income: cur.income, taxes: cur.taxes, net,
    savingsRate: cur.income > 0 ? net / cur.income : null,
    budget: budget.total,
    priorSpend: prior.spend,
    categories,
    months: period.months.map(key => ({
      month: key,
      spend: cur.byMonth[key]?.spend || 0,
      income: cur.byMonth[key]?.income || 0,
      budget: budget.byMonth[key] || 0,
    })),
    topMerchants: Object.values(cur.byMerchant).sort((a, b) => b.total - a.total).slice(0, 10),
    largest: current.filter(isSpend).sort((a, b) => b.amount - a.amount).slice(0, 10).map(e => ({
      date: e.date, merchant: e.merchant || e.description || 'Unknown', amount: e.amount,
      category: e.category || 'Uncategorized',
    })),
    planned: sources.planned.filter(p => period.months.includes(p.month)),
  };
}

// ---------- HTML ----------

const C = {
  bg: '#eef2ee', card: '#ffffff', ink: '#16221d', dim: '#5f7068', line: '#dfe6e0',
  head: '#20423a', lime: '#c9f04e', pos: '#2f8a4e', neg: '#c2553a', orange: '#b97a1a', teal: '#38a790', track: '#e6ece7',
};
const STATUS = {
  under: { color: C.pos, label: 'under pace' },
  on: { color: C.teal, label: 'on pace' },
  hot: { color: C.orange, label: 'running hot' },
  blown: { color: C.neg, label: 'over budget' },
};

const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const usd = n => (n < 0 ? '−' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US');
const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US');
const pct = n => `${Math.round(n * 100)}%`;

const section = (title, body) => `
  <tr><td style="padding:22px 28px 0;">
    <div style="font:700 15px/1.3 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${C.ink};margin-bottom:10px;">${esc(title)}</div>
    ${body}
  </td></tr>`;

const stat = (label, value, color = C.ink, sub = '') => `
  <td valign="top" style="padding:0 8px 0 0;">
    <div style="font:600 10px/1.2 Menlo,Consolas,monospace;letter-spacing:.1em;text-transform:uppercase;color:${C.dim};">${esc(label)}</div>
    <div style="font:800 22px/1.25 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${color};">${value}</div>
    ${sub ? `<div style="font:12px/1.3 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${C.dim};">${sub}</div>` : ''}
  </td>`;

const stats = cells => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cells.join('')}</tr></table>`;

// Horizontal bar: fill = share of budget spent (capped at 100%).
const bar = (ratio, color) => {
  const w = Math.max(0, Math.min(Math.round(ratio * 100), 100));
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:5px;overflow:hidden;background:${C.track};"><tr>
    ${w > 0 ? `<td width="${w}%" height="9" style="background:${color};font-size:0;line-height:0;">&nbsp;</td>` : ''}
    ${w < 100 ? `<td height="9" style="font-size:0;line-height:0;">&nbsp;</td>` : ''}
  </tr></table>`;
};

const th = (t, align = 'left') => `<th align="${align}" style="padding:6px 6px;border-bottom:1px solid ${C.line};font:600 10px/1.2 Menlo,Consolas,monospace;letter-spacing:.08em;text-transform:uppercase;color:${C.dim};">${esc(t)}</th>`;
const td = (html, align = 'left', style = '') => `<td align="${align}" style="padding:7px 6px;border-bottom:1px solid ${C.line};font:13px/1.35 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${C.ink};${style}">${html}</td>`;
const table = (head, rows) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>${head.join('')}</tr>${rows.join('')}</table>`;
const p = (html, color = C.dim) => `<p style="margin:0 0 8px;font:13px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${color};">${html}</p>`;
const button = (href, text) => `<a href="${esc(href)}" style="display:inline-block;margin:4px 8px 4px 0;padding:10px 16px;border-radius:9px;background:${C.head};color:${C.lime};font:700 13px/1 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;text-decoration:none;">${esc(text)}</a>`;

function shell(eyebrow, title, rows) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};"><tr><td align="center" style="padding:20px 10px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:${C.card};border-radius:14px;overflow:hidden;">
  <tr><td style="background:${C.head};padding:22px 28px;">
    <div style="font:600 10px/1.2 Menlo,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;color:${C.lime};">${esc(eyebrow)}</div>
    <div style="font:800 22px/1.3 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#ebf2ec;margin-top:4px;">${esc(title)}</div>
  </td></tr>
  ${rows.join('')}
  <tr><td style="padding:24px 28px 26px;">
    <div style="border-top:1px solid ${C.line};padding-top:14px;font:11px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${C.dim};">
      Sent by Wealth Navigator. Spend excludes transfers, income, taxes and credit card payments. Spending on trips counts under Trips &amp; Travel, not the everyday categories.
    </div>
  </td></tr>
</table></td></tr></table></body></html>`;
}

function plannedTable(planned) {
  return table(
    [th('Planned cost'), th('Month'), th('Category'), th('Amount', 'right')],
    planned.map(c => `<tr>${td(esc(c.name))}${td(esc(monthLabel(c.month)))}${td(esc(c.category || ''), 'left', `color:${C.dim};`)}${td(usd(c.amount), 'right', 'font-weight:600;')}</tr>`),
  );
}

function renderDigest(d) {
  const url = appUrl();
  const paceDiff = d.spend - d.proRated;
  const left = d.budget - d.spend;
  const hasBudget = d.budget > 0;
  const hot = d.categories.filter(c => c.status === 'hot' || c.status === 'blown');
  const rows = [];

  rows.push(section(`How ${MONTH_NAMES[Number(d.month.slice(5, 7)) - 1]} is pacing`, `
    ${stats([
      stat('Spent so far', usd(d.spend)),
      stat('Month budget', hasBudget ? usd(d.budget) : '—', C.dim),
      stat('vs. pace', hasBudget ? signed(paceDiff) : '—', !hasBudget ? C.dim : paceDiff > 0 ? C.neg : C.pos,
        hasBudget ? `${paceDiff > 0 ? 'over' : 'under'} where day ${d.day} should be` : ''),
      stat(left >= 0 ? 'Left to spend' : 'Over budget', hasBudget ? usd(Math.abs(left)) : '—', left >= 0 ? C.ink : C.neg),
    ])}
    ${hasBudget ? `<div style="margin-top:12px;">${bar(d.spend / d.budget, d.spend >= d.budget ? C.neg : paceDiff > 0 ? C.orange : C.pos)}</div>
    <div style="margin-top:5px;font:12px/1.3 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${C.dim};">${pct(d.spend / d.budget)} of budget spent · ${pct(d.elapsed)} of the month gone</div>` : ''}
  `));

  rows.push(section('Categories, hottest first', d.categories.length === 0 ? p('No spending or budgets yet this month.') : `
    ${hot.length ? p(`<strong style="color:${C.neg};">${hot.map(c => esc(c.name)).join(', ')}</strong> ${hot.length === 1 ? 'is' : 'are'} ahead of the calendar — the place to look if you want to cut back.`) : p('Nothing is running ahead of the calendar.', C.pos)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${d.categories.map(c => {
      const s = c.status ? STATUS[c.status] : null;
      return `<tr><td style="padding:7px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="font:600 13px/1.3 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${C.ink};">${esc(c.name)}</td>
          <td align="right" style="font:13px/1.3 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${C.ink};"><strong>${usd(c.actual)}</strong> <span style="color:${C.dim};">/ ${c.budget !== null ? usd(c.budget) : 'no budget'}</span></td>
        </tr></table>
        ${s ? `<div style="margin-top:4px;">${bar(c.ratio, s.color)}</div><div style="margin-top:3px;font:12px/1.3 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${s.color};">${pct(c.ratio)} spent · ${s.label}</div>` : ''}
      </td></tr>`;
    }).join('')}</table>
  `));

  // The prompt: planned costs.
  rows.push(section('Anything coming up?', `
    ${p(`Think through the rest of ${monthLabel(d.month)} and ${monthLabel(d.nextMonth)}: travel, gifts, repairs, annual renewals, events. Adding a cost before it lands puts it in that month's budget, so pacing stays honest.`, C.ink)}
    ${d.planned.length ? plannedTable(d.planned) : p('You have no planned costs on file.')}
    <div style="margin-top:10px;">${button(`${url}/reports#planned`, 'Add a planned cost')}</div>
  `));

  const cleanup = [];
  if (d.toCategorize > 0) cleanup.push(p(`<strong style="color:${C.orange};">${d.toCategorize} transaction${d.toCategorize === 1 ? '' : 's'}</strong> still need a category.`, C.ink));
  d.newRecurring.forEach(r => cleanup.push(p(`<strong>${esc(r.merchant)}</strong> looks like a new recurring cost (~${usd(r.median_amount)} per charge, since ${shortDate(r.first_date)}).`, C.ink)));
  if (cleanup.length) {
    rows.push(section('Clean-up', `${cleanup.join('')}<div style="margin-top:6px;">${button(`${url}/review`, 'Open the review queue')}</div>`));
  }

  const MAX = 60;
  const shown = d.transactions.slice(0, MAX);
  rows.push(section(`Transactions since ${shortDate(d.since)} (${d.transactions.length})`, d.transactions.length === 0 ? p('No new transactions.') : `
    ${p('Glance down the category column. Anything in orange is uncategorized or flagged for review.')}
    ${table(
      [th('Date'), th('Merchant'), th('Category'), th('Amount', 'right')],
      shown.map(t => {
        const cat = (t.category ? `${esc(t.category)}${t.subcategory ? ` › ${esc(t.subcategory)}` : ''}` : 'Uncategorized')
          + (t.trip ? ` <span style="color:${C.teal};">· ${esc(t.trip)}</span>` : '');
        const income = t.category === 'Income';
        return `<tr>${td(shortDate(t.date), 'left', `color:${C.dim};white-space:nowrap;`)}${td(esc(t.merchant))}${td(cat, 'left', `color:${t.flagged ? C.orange : C.dim};${t.flagged ? 'font-weight:600;' : ''}`)}${td(income ? `+${usd(Math.abs(t.amount))}` : usd(t.amount), 'right', `font-weight:600;white-space:nowrap;${income ? `color:${C.pos};` : ''}`)}</tr>`;
      }),
    )}
    ${d.transactions.length > MAX ? p(`+${d.transactions.length - MAX} more in the app.`) : ''}
    <div style="margin-top:10px;">${button(`${url}/reports`, 'Open the dashboard')}${button(`${url}/expenses`, 'All transactions')}</div>
  `));

  const subject = hasBudget
    ? `${monthLabel(d.month)} check-in: ${usd(d.spend)} spent, ${usd(Math.abs(paceDiff))} ${paceDiff > 0 ? 'over' : 'under'} pace`
    : `${monthLabel(d.month)} check-in: ${usd(d.spend)} spent so far`;
  return { subject, html: shell(`Spending check-in · day ${d.day} of ${d.daysInMonth}`, monthLabel(d.month), rows) };
}

function renderPeriod(d) {
  const url = appUrl();
  const { period } = d;
  const hasBudget = d.budget > 0;
  const variance = d.spend - d.budget;
  const vsPrior = d.spend - d.priorSpend;
  const rows = [];

  rows.push(section(`Spend vs budget`, `
    ${d.coverage ? p(`Transaction history only covers ${d.coverage.covered} of this ${period.noun}'s ${d.coverage.of} months (from ${monthLabel(d.coverage.first)}), so the budget below counts just those months.`, C.orange) : ''}
    ${stats([
      stat('Spent', usd(d.spend)),
      stat('Budgeted', hasBudget ? usd(d.budget) : '—', C.dim),
      stat(variance > 0 ? 'Over budget' : 'Under budget', hasBudget ? usd(Math.abs(variance)) : '—', !hasBudget ? C.dim : variance > 0 ? C.neg : C.pos,
        hasBudget ? `${pct(d.spend / d.budget)} of budget` : ''),
      stat(`vs ${period.priorLabel}`, d.priorSpend > 0 ? signed(vsPrior) : '—', vsPrior > 0 ? C.neg : C.pos,
        d.priorSpend > 0 ? `was ${usd(d.priorSpend)}` : ''),
    ])}
    ${hasBudget ? `<div style="margin-top:12px;">${bar(d.spend / d.budget, variance > 0 ? C.neg : C.pos)}</div>` : ''}
  `));

  rows.push(section('Income, taxes and what was left', stats([
    stat('Income', usd(d.income), C.pos),
    stat('Taxes', usd(d.taxes), C.dim),
    stat('Net', signed(d.net), d.net >= 0 ? C.pos : C.neg),
    stat('Savings rate', d.savingsRate === null ? '—' : pct(d.savingsRate), (d.savingsRate ?? 0) >= 0 ? C.pos : C.neg),
  ])));

  rows.push(section('By category', d.categories.length === 0 ? p('No spending recorded.') : table(
    [th('Category'), th('Spent', 'right'), th('Budget', 'right'), th('Over / under', 'right'), th(period.priorLabel, 'right')],
    d.categories.map(c => {
      const v = c.budget !== null ? c.actual - c.budget : null;
      return `<tr>${td(esc(c.name), 'left', 'font-weight:600;')}${td(usd(c.actual), 'right')}${td(c.budget !== null ? usd(c.budget) : '—', 'right', `color:${C.dim};`)}${td(v === null ? '—' : signed(v), 'right', `font-weight:600;color:${v === null ? C.dim : v > 0 ? C.neg : C.pos};`)}${td(usd(c.prior), 'right', `color:${C.dim};`)}</tr>`;
    }),
  )));

  if (d.months.length > 1) {
    rows.push(section('Month by month', table(
      [th('Month'), th('Spent', 'right'), th('Budget', 'right'), th('Over / under', 'right'), th('Income', 'right')],
      [...d.months].reverse().map(mo => {
        const v = mo.spend - mo.budget;
        return `<tr>${td(esc(monthLabel(mo.month)))}${td(usd(mo.spend), 'right')}${td(usd(mo.budget), 'right', `color:${C.dim};`)}${td(mo.budget > 0 ? signed(v) : '—', 'right', `font-weight:600;color:${v > 0 ? C.neg : C.pos};`)}${td(usd(mo.income), 'right', `color:${C.dim};`)}</tr>`;
      }),
    )));
  }

  if (d.topMerchants.length) {
    rows.push(section('Where it went: top merchants', table(
      [th('Merchant'), th('Charges', 'right'), th('Total', 'right')],
      d.topMerchants.map(mr => `<tr>${td(esc(mr.merchant))}${td(String(mr.count), 'right', `color:${C.dim};`)}${td(usd(mr.total), 'right', 'font-weight:600;')}</tr>`),
    )));
  }

  if (d.largest.length) {
    rows.push(section('Largest single transactions', table(
      [th('Date'), th('Merchant'), th('Category'), th('Amount', 'right')],
      d.largest.map(t => `<tr>${td(shortDate(t.date), 'left', `color:${C.dim};white-space:nowrap;`)}${td(esc(t.merchant))}${td(esc(t.category), 'left', `color:${C.dim};`)}${td(usd(t.amount), 'right', 'font-weight:600;')}</tr>`),
    )));
  }

  if (d.planned.length) {
    rows.push(section('Planned costs that were in this budget', plannedTable(d.planned)));
  }

  rows.push(section('Next step', `
    ${p(`Look at the categories that ran over, decide whether the budget or the behaviour should change, and add any planned costs for the ${period.noun} ahead.`, C.ink)}
    ${button(`${url}${period.link}`, period.linkText)}${button(`${url}/reports#planned`, 'Add a planned cost')}
  `));

  const verdict = hasBudget ? `, ${usd(Math.abs(variance))} ${variance > 0 ? 'over' : 'under'} budget` : '';
  return {
    subject: `${period.label} lookback: ${usd(d.spend)} spent${verdict}`,
    html: shell(`${period.type} lookback`, period.label, rows),
  };
}

// ---------- public API ----------

const TYPES = ['digest', 'monthly', 'quarterly', 'annual'];

// Which reports are due on this calendar day.
function dueReports(now = new Date()) {
  const day = now.getUTCDate();
  const m = now.getUTCMonth() + 1;
  const due = [];
  if (DIGEST_DAYS.includes(day)) due.push('digest');
  if (day === 2) due.push('monthly');
  if (day === 3 && [1, 4, 7, 10].includes(m)) due.push('quarterly');
  if (day === 4 && m === 1) due.push('annual');
  return due;
}

// → { type, key, subject, html }. `key` identifies the period, so a report
// is only ever emailed once per period (see sendReport).
async function buildReport(type, now = new Date()) {
  if (type === 'digest') {
    const data = await buildDigestData(now);
    return { type, key: data.today, ...renderDigest(data) };
  }
  const data = await buildPeriodData(type, now);
  return { type, key: data.period.key, ...renderPeriod(data) };
}

async function recipient() {
  if (process.env.REPORT_EMAIL_TO) return process.env.REPORT_EMAIL_TO;
  // Single-tenant app: fall back to the (only) registered user's email.
  const snap = await db.collection('users').limit(2).get();
  const emails = snap.docs.map(d => d.data().email).filter(Boolean);
  return emails.length === 1 ? emails[0] : null;
}

async function deliver({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not configured');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.REPORT_EMAIL_FROM || 'Wealth Navigator <onboarding@resend.dev>',
      to: [to],
      subject,
      html,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend ${res.status}: ${body.message || body.name || 'send failed'}`);
  return body.id;
}

// Build and email one report. Scheduled sends are recorded in report_sends
// and skipped if that period's report already went out; `force` (manual
// "send me one now") bypasses and doesn't record.
async function sendReport(type, { now = new Date(), force = false } = {}) {
  if (!TYPES.includes(type)) throw new Error(`Unknown report type: ${type}`);
  const report = await buildReport(type, now);
  const ref = db.collection('report_sends').doc(`${type}_${report.key}`);
  if (!force && (await ref.get()).exists) {
    return { type, key: report.key, skipped: 'already sent' };
  }
  const to = await recipient();
  if (!to) throw new Error('No recipient: set REPORT_EMAIL_TO');
  const id = await deliver({ to, subject: report.subject, html: report.html });
  if (!force) {
    await ref.set({ type, key: report.key, subject: report.subject, email_id: id || null, sent_at: new Date().toISOString() });
  }
  return { type, key: report.key, sent: true, subject: report.subject };
}

module.exports = { TYPES, dueReports, buildReport, sendReport };
