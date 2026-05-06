const crypto = require('crypto');

// Generate a consistent encryption key - if no env var is set, create a predictable one
// This ensures the same key is used across all services in the same session
let ENCRYPTION_KEY;

if (process.env.ENCRYPTION_KEY) {
  ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
} else if (process.env.NODE_ENV === 'production') {
  // Without a stable ENCRYPTION_KEY, every cold start would generate a new key,
  // making previously-stored Plaid access tokens unrecoverable. Refuse to boot.
  throw new Error('ENCRYPTION_KEY must be set in production (32-byte hex string)');
} else {
  // Deterministic dev key — same value across restarts so encrypted tokens survive.
  ENCRYPTION_KEY = crypto.createHash('sha256').update('wealth-navigator-dev-key').digest();
}

const IV_LENGTH = 16;

const encrypt = (text) => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
};

const decrypt = (text) => {
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift(), 'hex');
  const encryptedText = textParts.join(':');
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

module.exports = {
  encrypt,
  decrypt
};