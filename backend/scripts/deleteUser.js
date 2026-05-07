// Account deletion script.
//
// Run by the Operator to fulfill a deletion request submitted under the
// procedure described in security/DATA_RETENTION.md. Wipes a user account
// and every Firestore document scoped to that user, after first revoking
// all of the user's Plaid items so the upstream access tokens are
// invalidated.
//
// Usage:
//   node backend/scripts/deleteUser.js <email>
//
// Prerequisites:
//   - FIREBASE_SERVICE_ACCOUNT (or GOOGLE_APPLICATION_CREDENTIALS) must be
//     set in the environment so firebase-admin can connect.
//   - PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV must be set so item-removal
//     calls reach the right Plaid environment.
//
// Safety:
//   - The script prints a confirmation prompt and waits for "DELETE" to be
//     typed before doing any deletes.
//   - Plaid item-removal failures (e.g., already-revoked) are logged but do
//     not stop the local Firestore cleanup, since the local data must still
//     be removed regardless.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const readline = require('readline');
const { db } = require('../services/database');
const plaidService = require('../services/plaidService');

// All Firestore collections that store rows scoped to a single user via a
// `user_id` field. Keep this list in sync with security/DATA_RETENTION.md §4.
const USER_SCOPED_COLLECTIONS = [
  'plaid_items',
  'plaid_accounts',
  'plaid_transactions',
  'plaid_holdings',
  'plaid_liabilities',
  'sync_logs',
  'expenses',
  'trades',
  'investment_ideas',
  'bets',
  'balance_snapshots',
  'budgets',
  'passkeys',
  'consents',
];

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a); }));
}

async function deleteCollectionRowsForUser(collection, userId) {
  const snap = await db.collection(collection).where('user_id', '==', userId).get();
  let removed = 0;
  for (const doc of snap.docs) {
    await doc.ref.delete();
    removed++;
  }
  return removed;
}

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: node backend/scripts/deleteUser.js <email>');
    process.exit(1);
  }

  console.log(`Looking up user: ${email}`);
  const usersSnap = await db.collection('users').where('email', '==', email).limit(1).get();
  if (usersSnap.empty) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }
  const userDoc = usersSnap.docs[0];
  const userId = userDoc.id;

  // Pre-flight: count what will be removed.
  console.log(`\nUser ID: ${userId}`);
  console.log('\nWill delete from these collections:');
  for (const collection of USER_SCOPED_COLLECTIONS) {
    const snap = await db.collection(collection).where('user_id', '==', userId).get();
    console.log(`  ${collection}: ${snap.size} rows`);
  }
  console.log(`  settings/${userId}: 1 doc (if exists)`);
  console.log(`  users/${userId}: 1 doc`);

  const confirm = await ask('\nType DELETE to proceed (anything else aborts): ');
  if (confirm.trim() !== 'DELETE') {
    console.log('Aborted.');
    process.exit(0);
  }

  // Step 1: Revoke Plaid items so upstream tokens are invalidated.
  console.log('\nRevoking Plaid items...');
  const itemsSnap = await db.collection('plaid_items').where('user_id', '==', userId).get();
  for (const itemDoc of itemsSnap.docs) {
    const itemId = itemDoc.data().item_id;
    try {
      await plaidService.removeItem(userId, itemId);
      console.log(`  ✓ Revoked Plaid item ${itemId}`);
    } catch (err) {
      console.warn(`  ! Could not revoke ${itemId}: ${err.message} (continuing)`);
    }
  }

  // Step 2: Wipe user-scoped collections.
  console.log('\nDeleting user-scoped collection rows...');
  for (const collection of USER_SCOPED_COLLECTIONS) {
    const removed = await deleteCollectionRowsForUser(collection, userId);
    console.log(`  ✓ ${collection}: ${removed} rows removed`);
  }

  // Step 3: Delete settings doc keyed by userId (not user_id field).
  try {
    await db.collection('settings').doc(userId).delete();
    console.log(`  ✓ settings/${userId} deleted`);
  } catch (err) {
    console.warn(`  ! Could not delete settings/${userId}: ${err.message}`);
  }

  // Step 4: Delete the user document itself.
  await userDoc.ref.delete();
  console.log(`  ✓ users/${userId} deleted`);

  console.log(`\n✓ User ${email} fully deleted.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Deletion failed:', err);
  process.exit(2);
});
