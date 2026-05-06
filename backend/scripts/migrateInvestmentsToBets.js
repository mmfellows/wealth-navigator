// One-time inspection / report script for the Phase 2 bets rollout.
//
// What this does:
//   - Lists every manual investments row and where it will land under the new
//     bet system (Core for retirement, Unallocated for everything else).
//   - Lists every Plaid holding and its predicted bucket.
//   - Does NOT mutate any data — bucketing is computed at query time by
//     /api/portfolio/by-bet, so no migration is necessary. This script just
//     gives you a human-readable view of the new world.
//
// Run with:  node backend/scripts/migrateInvestmentsToBets.js [user_id]

const { db } = require('../services/database');

const RETIREMENT_SUBTYPES = new Set([
  '401k', '401a', '403b', 'ira', 'roth', 'roth 401k',
  'sep ira', 'simple ira', 'sarsep', 'tsp', 'thrift savings plan',
  '529', 'hsa', 'pension', 'retirement',
]);

async function main() {
  const userIdArg = process.argv[2];

  // Find every user with either manual investments or Plaid holdings
  const userIds = new Set();
  if (userIdArg) {
    userIds.add(userIdArg);
  } else {
    const [inv, h] = await Promise.all([
      db.collection('investments').get(),
      db.collection('plaid_holdings').get(),
    ]);
    inv.docs.forEach(d => userIds.add(d.data().user_id));
    h.docs.forEach(d => userIds.add(d.data().user_id));
  }

  for (const userId of userIds) {
    console.log(`\n=== user_id: ${userId} ===`);

    const [bets, manual, holdings, securities, accounts] = await Promise.all([
      db.collection('bets').where('user_id', '==', userId).get(),
      db.collection('investments').where('user_id', '==', userId).get(),
      db.collection('plaid_holdings').where('user_id', '==', userId).get(),
      db.collection('plaid_securities').where('user_id', '==', userId).get(),
      db.collection('plaid_accounts').where('user_id', '==', userId).get(),
    ]);

    const tickerToBet = new Map();
    let coreBet = null;
    for (const d of bets.docs) {
      const b = d.data();
      if (b.is_synthetic && b.type === 'Core') { coreBet = { id: d.id, ...b }; continue; }
      if (b.status === 'closed') continue;
      for (const t of b.tickers || []) tickerToBet.set(t, { id: d.id, ...b });
    }

    const securitiesById = new Map(securities.docs.map(d => [d.data().security_id, d.data()]));
    const accountsById = new Map(accounts.docs.map(d => [d.data().account_id, d.data()]));

    const bucketOf = (ticker, subtype, isRetirementCategory) => {
      if (isRetirementCategory || RETIREMENT_SUBTYPES.has((subtype || '').toLowerCase())) {
        return coreBet ? `Core (${coreBet.name})` : 'Core (will be auto-created)';
      }
      const t = (ticker || '').toUpperCase();
      if (t && tickerToBet.has(t)) return `Bet: ${tickerToBet.get(t).name}`;
      return 'Unallocated';
    };

    console.log(`\n  Manual investments: ${manual.size}`);
    for (const d of manual.docs) {
      const inv = d.data();
      const target = bucketOf(inv.ticker, null, inv.category === 'retirement');
      console.log(`    ${inv.ticker?.padEnd(8)} ${String(inv.shares).padStart(8)} sh  @${inv.purchase_price}  [${inv.category || '-'}]  →  ${target}`);
    }

    console.log(`\n  Plaid holdings: ${holdings.size}`);
    for (const d of holdings.docs) {
      const h = d.data();
      const sec = securitiesById.get(h.security_id);
      const acct = accountsById.get(h.account_id);
      const ticker = sec?.ticker_symbol || '?';
      const target = bucketOf(ticker, acct?.subtype, false);
      console.log(`    ${ticker.padEnd(8)} ${String(h.quantity).padStart(8)} sh  @${h.institution_price}  [${acct?.subtype || '-'} / ${acct?.name || '-'}]  →  ${target}`);
    }
  }

  console.log('\nDone. No data was modified.');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
