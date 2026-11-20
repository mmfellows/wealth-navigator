// Apply a reviewed de-duplication plan to the `expenses` collection.
//
//   node backend/scripts/applyDedupePlan.js <plan.json>                      # dry run (default): prints what would happen
//   node backend/scripts/applyDedupePlan.js <plan.json> --apply              # delete the duplicate copies
//   node backend/scripts/applyDedupePlan.js <plan.json> --apply --categories=pdf
//
// For every pair in the plan it deletes `delete.id` and keeps `keep.id`.
//   --categories=plaid (default)  the kept row keeps its own category
//   --categories=pdf              the kept row takes the deleted row's category/subcategory
//                                 where they differ (written directly, so no merchant rules are created)
//   --except-pdf-subcategory=X    with --categories=pdf: don't carry over a category whose
//                                 subcategory is X (the kept row keeps its own instead)
//   --skip=<id,id,...>            leave these pairs alone (either id of the pair)
//   --backup-dir=<path>           where to write the backup (default backend/backups)
//
// Safety: a pair is skipped if either document is missing or its date/amount
// no longer match the plan. Before any write, the full contents of every
// document to be deleted or changed are saved to backend/backups/, from which
// they can be restored by id.

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { db } = require('../services/database');

const args = process.argv.slice(2);
const planPath = args.find(a => !a.startsWith('--'));
const apply = args.includes('--apply');
const categories = (args.find(a => a.startsWith('--categories=')) || '--categories=plaid').split('=')[1];
const exceptSub = (args.find(a => a.startsWith('--except-pdf-subcategory=')) || '').split('=').slice(1).join('=') || null;
const backupDirArg = (args.find(a => a.startsWith('--backup-dir=')) || '').split('=').slice(1).join('=') || null;
const skip = new Set(((args.find(a => a.startsWith('--skip=')) || '=').split('=')[1] || '').split(',').filter(Boolean));

if (!planPath || !['plaid', 'pdf'].includes(categories)) {
  console.error('Usage: node applyDedupePlan.js <plan.json> [--apply] [--categories=plaid|pdf] [--skip=id,id]');
  process.exit(1);
}

const cents = n => Math.round(Number(n) * 100);

(async () => {
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  const todo = [];
  const skipped = [];

  for (const pair of plan.pairs) {
    if (skip.has(pair.delete.id) || skip.has(pair.keep.id)) { skipped.push({ pair, why: 'skipped by --skip' }); continue; }
    const [del, keep] = await Promise.all([
      db.collection('expenses').doc(pair.delete.id).get(),
      db.collection('expenses').doc(pair.keep.id).get(),
    ]);
    if (!del.exists || !keep.exists) { skipped.push({ pair, why: 'a document no longer exists' }); continue; }
    const d = del.data();
    const k = keep.data();
    if (d.date !== pair.delete.date || cents(d.amount) !== cents(pair.delete.amount)
      || k.date !== pair.keep.date || cents(k.amount) !== cents(pair.keep.amount)) {
      skipped.push({ pair, why: 'date or amount changed since the plan was made' });
      continue;
    }
    const recat = categories === 'pdf'
      && d.category
      && !(exceptSub && d.subcategory === exceptSub)
      && ((d.category || null) !== (k.category || null) || (d.subcategory || null) !== (k.subcategory || null));
    todo.push({ pair, del: { id: del.id, ...d }, keep: { id: keep.id, ...k }, recat });
  }

  const total = todo.reduce((t, x) => t + (x.del.amount || 0), 0);
  console.log(`${apply ? 'APPLYING' : 'DRY RUN'} — ${todo.length} duplicate copies to delete ($${total.toFixed(2)}), `
    + `${todo.filter(x => x.recat).length} kept rows to recategorize, ${skipped.length} pairs skipped.`);
  skipped.forEach(s => console.log(`  skipped ${s.pair.delete.date} ${s.pair.delete.merchant} $${s.pair.delete.amount}: ${s.why}`));

  if (!apply) {
    console.log('Nothing was changed. Re-run with --apply to make these changes.');
    process.exit(0);
  }

  const backupDir = backupDirArg || path.join(__dirname, '..', 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `dedupe-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(backupPath, JSON.stringify({
    plan: path.basename(planPath),
    categories,
    deleted: todo.map(x => x.del),
    recategorized_before: todo.filter(x => x.recat).map(x => x.keep),
  }, null, 1));
  console.log(`Backup written: ${backupPath}`);

  for (let i = 0; i < todo.length; i += 200) {
    const batch = db.batch();
    todo.slice(i, i + 200).forEach(x => {
      batch.delete(db.collection('expenses').doc(x.del.id));
      if (x.recat) {
        batch.update(db.collection('expenses').doc(x.keep.id), {
          category: x.del.category,
          subcategory: x.del.subcategory || null,
          categorization_source: 'manual',
          needs_review: false,
          updated_at: new Date().toISOString(),
        });
      }
    });
    await batch.commit();
  }
  console.log(`Done: deleted ${todo.length}, recategorized ${todo.filter(x => x.recat).length}.`);
  process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });
