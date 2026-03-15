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

// Optional auth - for demo purposes, creates a demo user if no token
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    // Create/use demo user for testing
    req.user = { id: 'demo', email: 'demo@example.com' };
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userDoc = await db.collection('users').doc(decoded.userId).get();
    if (userDoc.exists) {
      req.user = { id: userDoc.id, ...userDoc.data() };
    } else {
      req.user = { id: 'demo', email: 'demo@example.com' };
    }
  } catch (error) {
    req.user = { id: 'demo', email: 'demo@example.com' };
  }

  next();
};

module.exports = { authenticateToken, optionalAuth };
