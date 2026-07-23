// Operator password reset.
//
// One-off script for the Operator to reset a user's password directly in
// Firestore. The app has no self-serve forgot-password flow; this is the
// fallback. Updates only the `password_hash` field, leaving passkeys and
// every other piece of user state untouched.
//
// Usage:
//   node backend/scripts/resetPassword.js <email>
//
// Prerequisites:
//   - FIREBASE_SERVICE_ACCOUNT (or GOOGLE_APPLICATION_CREDENTIALS, or
//     backend/serviceAccountKey.json) so firebase-admin can connect.
//
// Notes:
//   - Password is prompted via stdin with masked input, not taken as a CLI
//     arg, so it never lands in shell history.
//   - If the user has a passkey registered, password reset alone is not
//     enough to sign in; the passkey is still required.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const { db } = require('../services/database');

const KEY_ENTER_LF = 0x0a;
const KEY_ENTER_CR = 0x0d;
const KEY_EOF = 0x04;
const KEY_ETX = 0x03; // Ctrl+C
const KEY_BACKSPACE = 0x7f;
const KEY_BS = 0x08;

function askHidden(question) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      reject(new Error('stdin is not a TTY; run this in an interactive terminal.'));
      return;
    }
    process.stdout.write(question);
    let input = '';
    stdin.resume();
    stdin.setRawMode(true);
    const onData = (chunk) => {
      for (const byte of chunk) {
        if (byte === KEY_ENTER_LF || byte === KEY_ENTER_CR || byte === KEY_EOF) {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(input);
          return;
        }
        if (byte === KEY_ETX) {
          stdin.setRawMode(false);
          stdin.pause();
          process.stdout.write('\n');
          process.exit(130);
        }
        if (byte === KEY_BACKSPACE || byte === KEY_BS) {
          if (input.length > 0) input = input.slice(0, -1);
          continue;
        }
        if (byte >= 0x20) {
          input += String.fromCharCode(byte);
        }
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  if (!email) {
    console.error('Usage: node backend/scripts/resetPassword.js <email>');
    process.exit(1);
  }

  console.log(`Looking up user: ${email}`);
  const snap = await db.collection('users').where('email', '==', email).limit(1).get();
  if (snap.empty) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }
  const userDoc = snap.docs[0];

  const passkeySnap = await db.collection('passkeys').where('user_id', '==', userDoc.id).limit(1).get();
  if (!passkeySnap.empty) {
    console.log('Note: this user has a passkey. Sign-in will still require the passkey after reset.');
  }

  const pw1 = await askHidden('New password: ');
  if (pw1.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }
  const pw2 = await askHidden('Confirm new password: ');
  if (pw1 !== pw2) {
    console.error('Passwords do not match.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(pw1, 10);
  await userDoc.ref.update({
    password_hash: passwordHash,
    password_updated_at: new Date().toISOString(),
  });

  console.log(`\nPassword reset for ${email}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Reset failed:', err);
  process.exit(2);
});
