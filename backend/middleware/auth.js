const jwt = require('jsonwebtoken');
const { db, docToObj } = require('../services/database');

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Verify user exists
    const userDoc = await db.collection('users').doc(decoded.userId).get();
    if (!userDoc.exists) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = { id: userDoc.id, ...userDoc.data() };
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Optional auth.
//
// In development: silently falls back to a demo user when no/invalid token,
//   so local development works without a login flow.
// In production: requires a valid token. Missing or invalid tokens get 401.
//   This closes the silent-demo-fallback hole that previously left every
//   data route effectively unauthenticated.
//
// See security/ACCESS_CONTROL.md for the broader auth posture.
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  const isProd = process.env.NODE_ENV === 'production';

  if (!token) {
    if (isProd) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    req.user = { id: 'demo', email: 'demo@example.com' };
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userDoc = await db.collection('users').doc(decoded.userId).get();
    if (userDoc.exists) {
      req.user = { id: userDoc.id, ...userDoc.data() };
    } else if (isProd) {
      return res.status(401).json({ error: 'Invalid token' });
    } else {
      req.user = { id: 'demo', email: 'demo@example.com' };
    }
  } catch (error) {
    if (isProd) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    req.user = { id: 'demo', email: 'demo@example.com' };
  }

  next();
};

module.exports = { authenticateToken, optionalAuth };
