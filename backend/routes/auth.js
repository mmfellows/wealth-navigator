const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, docToObj } = require('../services/database');
const { authenticateToken } = require('../middleware/auth');
const passkeyService = require('../services/passkeyService');

const router = express.Router();

function issueJwt(user) {
  return jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// --- Registration allow-list -------------------------------------------------
// Single-tenant policy: only emails listed in REGISTRATION_ALLOWLIST may
// register an account. In production, an empty allow-list disables
// registration entirely (fail-closed). In development, all emails are allowed
// so the demo flow keeps working locally.
//
// REGISTRATION_ALLOWLIST is a comma-separated list of email addresses, e.g.
//   REGISTRATION_ALLOWLIST=matt@tangiblevalue.com
// See security/INFOSEC_POLICY.md and security/ACCESS_CONTROL.md for context.
const ALLOWED_REGISTRATION_EMAILS = (process.env.REGISTRATION_ALLOWLIST || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

function isAllowedToRegister(email) {
  if (process.env.NODE_ENV === 'production') {
    if (ALLOWED_REGISTRATION_EMAILS.length === 0) return false;
    return ALLOWED_REGISTRATION_EMAILS.includes(String(email).toLowerCase());
  }
  return true;
}

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    if (!isAllowedToRegister(email)) {
      // Generic message; do not reveal allow-list contents.
      return res.status(403).json({ error: 'Registration is not open.' });
    }

    // Check if user exists
    const existing = await db.collection('users').where('email', '==', email).limit(1).get();
    if (!existing.empty) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const userRef = await db.collection('users').add({
      email,
      password_hash: passwordHash,
      created_at: new Date().toISOString(),
    });

    // Create default settings
    await db.collection('settings').doc(userRef.id).set({
      user_id: userRef.id,
      target_low_risk: 30,
      target_growth: 60,
      target_speculative: 10,
      updated_at: new Date().toISOString(),
    });

    // Generate token
    const token = jwt.sign(
      { userId: userRef.id, email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      user: { id: userRef.id, email },
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login.
//
// Two flavors:
//   1. User has no passkey registered yet -> classic email+password issues JWT.
//   2. User has a passkey -> password verifies first, then we return WebAuthn
//      options ({ requires_passkey: true, options }). The client then calls
//      navigator.credentials.get() and POSTs the result to /passkey/login-verify
//      to receive the JWT. No JWT is ever issued without both factors.
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Find user
    const snapshot = await db.collection('users').where('email', '==', email).limit(1).get();
    if (snapshot.empty) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const userDoc = snapshot.docs[0];
    const user = { id: userDoc.id, ...userDoc.data() };

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const hasPasskey = await passkeyService.userHasPasskey(user.id);

    if (hasPasskey) {
      // Don't issue JWT yet. Generate WebAuthn options and require the
      // /passkey/login-verify call before authenticating the session.
      const options = await passkeyService.createAuthenticationOptions(user.id);
      return res.json({
        requires_passkey: true,
        email: user.email,
        options,
      });
    }

    // No passkey registered yet. Issue JWT directly so the user can log in
    // for the first time and then register a passkey from Settings. After
    // registration, subsequent logins will require the passkey step.
    const token = issueJwt(user);
    res.json({
      requires_passkey: false,
      user: { id: user.id, email: user.email },
      token,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Demo login (for development) — disabled in production unless explicitly opted in
router.post('/demo', async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_LOGIN !== 'true') {
      return res.status(404).json({ error: 'Not found' });
    }

    // Create or get demo user
    const snapshot = await db.collection('users').where('email', '==', 'demo@example.com').limit(1).get();

    let user;
    if (snapshot.empty) {
      const passwordHash = await bcrypt.hash('demo', 10);
      const userRef = await db.collection('users').add({
        email: 'demo@example.com',
        password_hash: passwordHash,
        created_at: new Date().toISOString(),
      });
      user = { id: userRef.id, email: 'demo@example.com' };

      // Create default settings
      await db.collection('settings').doc(userRef.id).set({
        user_id: userRef.id,
        target_low_risk: 30,
        target_growth: 60,
        target_speculative: 10,
        updated_at: new Date().toISOString(),
      });
    } else {
      const doc = snapshot.docs[0];
      user = { id: doc.id, email: doc.data().email };
    }

    // Generate token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      user: { id: user.id, email: user.email },
      token
    });
  } catch (error) {
    console.error('Demo login error:', error);
    res.status(500).json({ error: 'Demo login failed' });
  }
});

// --- Passkey (WebAuthn) endpoints --------------------------------------------
//
// Registration is gated behind a logged-in session: the user must already have
// a JWT (issued by /login or /register on first signup) before they can attach
// a passkey. After at least one passkey is registered, all subsequent logins
// require the passkey step (enforced inside /login).
//
// Login verification is intentionally NOT auth-gated: the password step in
// /login is what authorizes the user, and verifyAuthentication consumes the
// challenge stored on the user record by /login.

// Register: step 1 — get options for navigator.credentials.create()
router.post('/passkey/register-options', authenticateToken, async (req, res) => {
  try {
    const options = await passkeyService.createRegistrationOptions(req.user);
    res.json(options);
  } catch (error) {
    console.error('passkey register-options error:', error);
    res.status(500).json({ error: error.message || 'Failed to create registration options' });
  }
});

// Register: step 2 — verify attestation, persist credential
router.post('/passkey/register-verify', authenticateToken, async (req, res) => {
  try {
    const { response, deviceLabel } = req.body || {};
    if (!response) {
      return res.status(400).json({ error: 'response is required' });
    }
    const result = await passkeyService.verifyRegistration(req.user, response, deviceLabel);
    res.json(result);
  } catch (error) {
    console.error('passkey register-verify error:', error);
    res.status(400).json({ error: error.message || 'Registration verification failed' });
  }
});

// Login: step 2 — verify assertion, issue JWT.
// (Step 1 happens inside POST /login when the user has a passkey.)
router.post('/passkey/login-verify', async (req, res) => {
  try {
    const { email, response } = req.body || {};
    if (!email || !response) {
      return res.status(400).json({ error: 'email and response are required' });
    }
    const snapshot = await db.collection('users').where('email', '==', email).limit(1).get();
    if (snapshot.empty) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const userDoc = snapshot.docs[0];
    const user = { id: userDoc.id, ...userDoc.data() };
    await passkeyService.verifyAuthentication(user.id, response);
    const token = issueJwt(user);
    res.json({
      user: { id: user.id, email: user.email },
      token,
    });
  } catch (error) {
    console.error('passkey login-verify error:', error);
    res.status(401).json({ error: error.message || 'Passkey verification failed' });
  }
});

// List the user's registered passkeys (for the Settings UI).
router.get('/passkey/list', authenticateToken, async (req, res) => {
  try {
    const passkeys = await passkeyService.listPasskeysForUser(req.user.id);
    res.json({
      passkeys: passkeys.map(p => ({
        id: p.id,
        name: p.name,
        device_type: p.device_type,
        backed_up: p.backed_up,
        created_at: p.created_at,
        last_used_at: p.last_used_at,
      })),
    });
  } catch (error) {
    console.error('passkey list error:', error);
    res.status(500).json({ error: 'Failed to list passkeys' });
  }
});

module.exports = router;
