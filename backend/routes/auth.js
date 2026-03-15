const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, docToObj } = require('../services/database');

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
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

// Login
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
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Demo login (for development)
router.post('/demo', async (req, res) => {
  try {
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

module.exports = router;
