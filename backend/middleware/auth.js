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
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// Optional auth.
//
// A missing token only falls back to the demo user when ALLOW_DEMO_USER=true
// is set explicitly (never in production). An invalid or expired token is
// always a 401 — falling back to demo there made an expired session render a
// convincing-but-empty dashboard instead of prompting re-login.
//
// See security/ACCESS_CONTROL.md for the broader auth posture.
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  const isProd = process.env.NODE_ENV === 'production';
  const allowDemo = !isProd && process.env.ALLOW_DEMO_USER === 'true';

  if (!token) {
    if (allowDemo) {
      req.user = { id: 'demo', email: 'demo@example.com' };
      return next();
    }
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userDoc = await db.collection('users').doc(decoded.userId).get();
    if (!userDoc.exists) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    req.user = { id: userDoc.id, ...userDoc.data() };
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  next();
};

module.exports = { authenticateToken, optionalAuth };
