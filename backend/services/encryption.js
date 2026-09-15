const crypto = require('crypto');

// Secrets at rest (Plaid access tokens, E*TRADE consumer keys) are encrypted
// with AES-256-CBC. Two keys can be configured:
//
//   ENCRYPTION_KEY       the current key. Required in production.
//   ENCRYPTION_KEY_NEXT  optional. Set during a rotation: new writes use it,
//                        and reads fall back to it when the current key fails.
//
// Rotation procedure (works even though Vercel never reveals a stored key):
//   1. Set ENCRYPTION_KEY_NEXT to the new key and deploy.
//   2. POST /api/internal/rotate-encryption-key (cron secret). Every stored
//      secret is re-encrypted under the new key. Check with
//      GET /api/internal/encryption-key-status.
//   3. Set ENCRYPTION_KEY to the new key, remove ENCRYPTION_KEY_NEXT, deploy.
//
// Without a stable key every cold start would generate a fresh one and stored
// tokens would become unrecoverable, so production refuses to boot without
// ENCRYPTION_KEY. Development uses a deterministic fallback key; it is public
// (this file is), so never point a dev process at the production database.

function keyFromEnv(name) {
  const hex = process.env[name];
  if (!hex) return null;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(`${name} must be a 32-byte hex string (64 hex characters)`);
  }
  return { buffer: Buffer.from(hex, 'hex'), id: keyIdOf(hex) };
}

// Short public fingerprint of a key, safe to store beside ciphertext so we can
// tell which key a row is under without decrypting it.
function keyIdOf(hex) {
  return crypto.createHash('sha256').update(hex.toLowerCase()).digest('hex').slice(0, 8);
}

let CURRENT = keyFromEnv('ENCRYPTION_KEY');
const NEXT = keyFromEnv('ENCRYPTION_KEY_NEXT');

if (!CURRENT) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ENCRYPTION_KEY must be set in production (32-byte hex string)');
  }
  const devHex = crypto.createHash('sha256').update('wealth-navigator-dev-key').digest('hex');
  CURRENT = { buffer: Buffer.from(devHex, 'hex'), id: keyIdOf(devHex) };
}

// New ciphertext always uses the incoming key when one is configured, so
// nothing written during a rotation window is left behind on the old key.
const WRITE_KEY = NEXT || CURRENT;
// Read order: the key we write with first, then the other one.
const READ_KEYS = NEXT ? [NEXT, CURRENT] : [CURRENT];

const IV_LENGTH = 16;

function encryptWith(key, text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', key.buffer, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptWith(key, text) {
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift(), 'hex');
  const encryptedText = textParts.join(':');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key.buffer, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

const encrypt = (text) => encryptWith(WRITE_KEY, text);

// Returns { plaintext, keyId } or throws the last decryption error.
function decryptAny(text) {
  let lastErr;
  for (const key of READ_KEYS) {
    try {
      return { plaintext: decryptWith(key, text), keyId: key.id };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

const decrypt = (text) => decryptAny(text).plaintext;

// Re-encrypt `text` under the write key if it is under any other key.
// Returns { value, keyId, rotated }. Throws if no configured key can read it.
function reencrypt(text) {
  const { plaintext, keyId } = decryptAny(text);
  if (keyId === WRITE_KEY.id) return { value: text, keyId, rotated: false };
  return { value: encryptWith(WRITE_KEY, plaintext), keyId: WRITE_KEY.id, rotated: true };
}

// Which configured key can read `text`: 'write', 'other', or 'none'.
function readableWith(text) {
  try {
    const { keyId } = decryptAny(text);
    return keyId === WRITE_KEY.id ? 'write' : 'other';
  } catch {
    return 'none';
  }
}

module.exports = {
  encrypt,
  decrypt,
  reencrypt,
  readableWith,
  keyIdOf,
  writeKeyId: WRITE_KEY.id,
  currentKeyId: CURRENT.id,
  nextKeyId: NEXT ? NEXT.id : null,
};
