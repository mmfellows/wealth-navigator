// WebAuthn / passkey service for wealth-navigator.
//
// Design:
//   * One Firestore collection: `passkeys` (documents = registered credentials).
//   * Per-flow challenges are stashed on the user document temporarily and
//     cleared on success. Challenges expire after 5 minutes.
//   * Configuration (RP ID, origin) is read from env vars so the same code
//     works locally and on Vercel.
//
// Required env:
//   WEBAUTHN_RP_ID       e.g. "wealth-navigator.vercel.app" in prod, "localhost" in dev
//   WEBAUTHN_ORIGIN      e.g. "https://wealth-navigator.vercel.app" in prod
//   WEBAUTHN_RP_NAME     human-friendly name; defaults to "Wealth Navigator"
//
// Reference: https://simplewebauthn.dev/docs/packages/server

const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const { db } = require('./database');

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const PASSKEYS_COLLECTION = 'passkeys';

function getRpConfig() {
  const rpID = process.env.WEBAUTHN_RP_ID
    || (process.env.NODE_ENV === 'production' ? null : 'localhost');
  const origin = process.env.WEBAUTHN_ORIGIN
    || (process.env.NODE_ENV === 'production' ? null : 'http://localhost:3000');
  if (!rpID || !origin) {
    throw new Error('WEBAUTHN_RP_ID and WEBAUTHN_ORIGIN must be set in production');
  }
  return { rpID, origin, rpName: process.env.WEBAUTHN_RP_NAME || 'Wealth Navigator' };
}

// --- Persistence helpers -----------------------------------------------------

async function listPasskeysForUser(userId) {
  const snap = await db.collection(PASSKEYS_COLLECTION)
    .where('user_id', '==', userId)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function findPasskeyByCredentialId(credentialId) {
  const snap = await db.collection(PASSKEYS_COLLECTION)
    .where('credential_id', '==', credentialId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ref: d.ref, ...d.data() };
}

async function setPendingChallenge(userId, kind, challenge) {
  // kind ∈ {'register', 'login'}
  const field = kind === 'register' ? 'pending_register' : 'pending_login';
  await db.collection('users').doc(userId).update({
    [`${field}_challenge`]: challenge,
    [`${field}_at`]: new Date().toISOString(),
  });
}

async function readAndClearPendingChallenge(userId, kind) {
  const field = kind === 'register' ? 'pending_register' : 'pending_login';
  const docRef = db.collection('users').doc(userId);
  const userDoc = await docRef.get();
  if (!userDoc.exists) return null;
  const data = userDoc.data();
  const challenge = data[`${field}_challenge`];
  const at = data[`${field}_at`];
  if (!challenge || !at) return null;
  if (Date.now() - new Date(at).getTime() > CHALLENGE_TTL_MS) {
    await docRef.update({
      [`${field}_challenge`]: null,
      [`${field}_at`]: null,
    });
    return null;
  }
  await docRef.update({
    [`${field}_challenge`]: null,
    [`${field}_at`]: null,
  });
  return challenge;
}

// --- Public API --------------------------------------------------------------

/**
 * Build the options object that the client-side passes to navigator.credentials.create().
 * Stores the challenge against the user record so we can verify the response later.
 */
async function createRegistrationOptions(user) {
  const { rpID, rpName } = getRpConfig();
  const existing = await listPasskeysForUser(user.id);
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: Buffer.from(user.id),
    userName: user.email,
    userDisplayName: user.email,
    attestationType: 'none',
    excludeCredentials: existing.map(p => ({
      id: p.credential_id,
      transports: p.transports || undefined,
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });
  await setPendingChallenge(user.id, 'register', options.challenge);
  return options;
}

/**
 * Verify the attestation response from the client and persist the credential.
 * Returns `{ verified, credentialId }`.
 */
async function verifyRegistration(user, response, deviceLabel) {
  const expectedChallenge = await readAndClearPendingChallenge(user.id, 'register');
  if (!expectedChallenge) {
    throw new Error('No pending registration challenge (or expired)');
  }
  const { rpID, origin } = getRpConfig();
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
  });
  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('Registration verification failed');
  }
  const reg = verification.registrationInfo;
  // SimpleWebAuthn v11+: registrationInfo.credential = { id, publicKey, counter }
  const credentialId = reg.credential.id;
  const publicKey = Buffer.from(reg.credential.publicKey).toString('base64url');
  const counter = reg.credential.counter || 0;

  await db.collection(PASSKEYS_COLLECTION).add({
    user_id: user.id,
    credential_id: credentialId,
    public_key: publicKey,
    counter,
    transports: response.response?.transports || [],
    device_type: reg.credentialDeviceType || null,
    backed_up: !!reg.credentialBackedUp,
    name: deviceLabel || null,
    created_at: new Date().toISOString(),
    last_used_at: new Date().toISOString(),
  });

  // Mirror a count on the user doc so /login can decide quickly whether to
  // require a passkey step without an extra query.
  await db.collection('users').doc(user.id).update({
    passkey_count: (user.passkey_count || 0) + 1,
  });

  return { verified: true, credentialId };
}

/**
 * Build options for navigator.credentials.get(). Stores challenge for later verification.
 */
async function createAuthenticationOptions(userId) {
  const { rpID } = getRpConfig();
  const passkeys = await listPasskeysForUser(userId);
  if (passkeys.length === 0) {
    throw new Error('No passkeys registered for user');
  }
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: passkeys.map(p => ({
      id: p.credential_id,
      transports: p.transports || undefined,
    })),
    userVerification: 'preferred',
  });
  await setPendingChallenge(userId, 'login', options.challenge);
  return options;
}

/**
 * Verify the assertion response. Updates the credential counter.
 * Returns true on success; throws on failure.
 */
async function verifyAuthentication(userId, response) {
  const expectedChallenge = await readAndClearPendingChallenge(userId, 'login');
  if (!expectedChallenge) {
    throw new Error('No pending login challenge (or expired)');
  }
  const credentialId = response.id;
  const passkey = await findPasskeyByCredentialId(credentialId);
  if (!passkey || passkey.user_id !== userId) {
    throw new Error('Credential not found for user');
  }
  const { rpID, origin } = getRpConfig();
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: passkey.credential_id,
      publicKey: Buffer.from(passkey.public_key, 'base64url'),
      counter: passkey.counter || 0,
    },
  });
  if (!verification.verified || !verification.authenticationInfo) {
    throw new Error('Authentication verification failed');
  }
  const newCounter = verification.authenticationInfo.newCounter;
  await passkey.ref.update({
    counter: newCounter,
    last_used_at: new Date().toISOString(),
  });
  return true;
}

async function userHasPasskey(userId) {
  // Prefer the denormalized count if present; fall back to a query.
  const userDoc = await db.collection('users').doc(userId).get();
  if (userDoc.exists && typeof userDoc.data().passkey_count === 'number') {
    return userDoc.data().passkey_count > 0;
  }
  const list = await listPasskeysForUser(userId);
  return list.length > 0;
}

module.exports = {
  createRegistrationOptions,
  verifyRegistration,
  createAuthenticationOptions,
  verifyAuthentication,
  userHasPasskey,
  listPasskeysForUser,
};
