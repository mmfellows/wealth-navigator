const express = require('express');
const { db, docToObj } = require('../services/database');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Get IPS
router.get('/', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const snapshot = await db.collection('investment_policy_statements')
      .where('user_id', '==', userId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.json({});
    }

    res.json(docToObj(snapshot.docs[0]));
  } catch (error) {
    console.error('Error fetching IPS:', error);
    res.status(500).json({ error: 'Failed to fetch Investment Policy Statement' });
  }
});

// Create or Update IPS
router.post('/', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      investment_philosophy,
      risk_tolerance,
      time_horizon,
      investment_objectives,
      asset_allocation_strategy,
      rebalancing_strategy,
      review_frequency
    } = req.body;

    const ipsData = {
      user_id: userId,
      investment_philosophy,
      risk_tolerance,
      time_horizon,
      investment_objectives,
      asset_allocation_strategy,
      rebalancing_strategy,
      review_frequency,
      updated_at: new Date().toISOString(),
    };

    // Check if IPS already exists
    const snapshot = await db.collection('investment_policy_statements')
      .where('user_id', '==', userId)
      .limit(1)
      .get();

    if (!snapshot.empty) {
      // Update existing
      const docId = snapshot.docs[0].id;
      await db.collection('investment_policy_statements').doc(docId).update(ipsData);
      const updatedDoc = await db.collection('investment_policy_statements').doc(docId).get();
      res.json(docToObj(updatedDoc));
    } else {
      // Create new
      ipsData.created_at = new Date().toISOString();
      const ref = await db.collection('investment_policy_statements').add(ipsData);
      const newDoc = await ref.get();
      res.status(201).json(docToObj(newDoc));
    }
  } catch (error) {
    console.error('Error saving IPS:', error);
    res.status(500).json({ error: 'Failed to save Investment Policy Statement' });
  }
});

module.exports = router;
