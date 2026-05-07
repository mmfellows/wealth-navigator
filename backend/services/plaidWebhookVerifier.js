// Plaid webhook signature verification.
//
// Plaid signs every outbound webhook with a JWT placed in the
// `Plaid-Verification` request header. The JWT:
//   * is signed ES256 by a key whose `kid` is in the JWT header
//   * has a `request_body_sha256` claim matching SHA-256(raw request body)
//   * has an `iat` claim (issued-at, unix seconds)
//
// The public key is fetched via `client.webhookVerificationKeyGet({ key_id })`.
// Keys are stable so we cache them by `kid` for the life of the process.
//
// Reference: https://plaid.com/docs/api/webhooks/webhook-verification/

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { PlaidApi, Configuration, PlaidEnvironments } = require('plaid');

// Maximum allowed age (in seconds) for a webhook JWT. Plaid's docs recommend
// 5 minutes; we err on the strict side to limit replay window.
const MAX_AGE_SECONDS = 5 * 60;

// In-memory cache: kid -> { keyObject, expired_at }
const KEY_CACHE = new Map();

let plaidClient = null;
function getPlaidClient() {
  if (plaidClient) return plaidClient;
  const env = process.env.PLAID_ENV || 'sandbox';
  if (!PlaidEnvironments[env]) {
    throw new Error(`Unknown PLAID_ENV: ${env}`);
  }
  if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) {
    throw new Error('PLAID_CLIENT_ID and PLAID_SECRET must be set to verify webhooks');
  }
  const config = new Configuration({
    basePath: PlaidEnvironments[env],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
        'PLAID-SECRET': process.env.PLAID_SECRET,
      },
    },
  });
  plaidClient = new PlaidApi(config);
  return plaidClient;
}

async function getVerificationKey(kid) {
  const cached = KEY_CACHE.get(kid);
  if (cached) {
    if (cached.expired_at && new Date(cached.expired_at) <= new Date()) {
      KEY_CACHE.delete(kid);
    } else {
      return cached.keyObject;
    }
  }
  const client = getPlaidClient();
  const response = await client.webhookVerificationKeyGet({ key_id: kid });
  const jwk = response.data && response.data.key;
  if (!jwk) {
    throw new Error(`webhookVerificationKeyGet returned no key for kid=${kid}`);
  }
  // Convert JWK → KeyObject for use with jsonwebtoken.verify.
  // Node 16+ supports format: 'jwk' on createPublicKey.
  const keyObject = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  KEY_CACHE.set(kid, { keyObject, expired_at: jwk.expired_at || null });
  return keyObject;
}

/**
 * Verify a Plaid webhook request.
 *
 * @param {string} jwtHeader        Value of the `Plaid-Verification` header.
 * @param {Buffer|string} rawBody   The raw request body, as received off the wire.
 * @returns {Promise<true>}         Resolves on success; throws on any failure.
 */
async function verifyPlaidWebhook(jwtHeader, rawBody) {
  if (!jwtHeader || typeof jwtHeader !== 'string') {
    throw new Error('Missing Plaid-Verification header');
  }
  if (rawBody == null) {
    throw new Error('Missing raw request body');
  }

  const decoded = jwt.decode(jwtHeader, { complete: true });
  if (!decoded || !decoded.header) {
    throw new Error('Invalid JWT (could not decode header)');
  }
  if (decoded.header.alg !== 'ES256') {
    throw new Error(`Unsupported JWT alg: ${decoded.header.alg}`);
  }
  const kid = decoded.header.kid;
  if (!kid) {
    throw new Error('JWT header missing kid');
  }

  const key = await getVerificationKey(kid);

  let claims;
  try {
    claims = jwt.verify(jwtHeader, key, { algorithms: ['ES256'] });
  } catch (err) {
    throw new Error(`JWT signature verification failed: ${err.message}`);
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.iat !== 'number') {
    throw new Error('JWT missing iat claim');
  }
  if (now - claims.iat > MAX_AGE_SECONDS) {
    throw new Error(`JWT too old (age=${now - claims.iat}s, max=${MAX_AGE_SECONDS}s)`);
  }

  if (typeof claims.request_body_sha256 !== 'string') {
    throw new Error('JWT missing request_body_sha256 claim');
  }
  const expected = Buffer.from(claims.request_body_sha256, 'hex');
  const bodyBuf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
  const actual = crypto.createHash('sha256').update(bodyBuf).digest();
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    throw new Error('Body hash mismatch (request_body_sha256)');
  }

  return true;
}

module.exports = { verifyPlaidWebhook };
