const express = require('express');
const plaidService = require('../services/plaidService');
const { optionalAuth } = require('../middleware/auth');
const { db } = require('../services/database');

const router = express.Router();

// Helper to add sync log
async function addSyncLog(userId, syncType, status, message) {
  await db.collection('sync_logs').add({
    user_id: userId,
    sync_type: syncType,
    status,
    message,
    created_at: new Date().toISOString(),
  });
}

// Create link token for Plaid Link
router.post('/create-link-token', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    if (!process.env.PLAID_CLIENT_ID || process.env.PLAID_CLIENT_ID === 'demo_client_id') {
      return res.status(400).json({
        error: 'Plaid integration requires API credentials.',
        demo_mode: true,
      });
    }

    const linkToken = await plaidService.createLinkToken(userId);
    res.json({ link_token: linkToken });
  } catch (error) {
    console.error('Error creating link token:', error);
    res.status(500).json({ error: error.message || 'Failed to create link token.' });
  }
});

// Exchange public token for access token
router.post('/exchange-public-token', optionalAuth, async (req, res) => {
  try {
    const { public_token } = req.body;
    const userId = req.user.id;

    if (!public_token) {
      return res.status(400).json({ error: 'Public token is required' });
    }

    const { itemId, institutionName } = await plaidService.exchangePublicToken(public_token, userId);
    await addSyncLog(userId, 'connection', 'success', `Connected ${institutionName}`);

    res.json({
      success: true,
      item_id: itemId,
      message: `Connected to ${institutionName} successfully`,
    });
  } catch (error) {
    console.error('Error exchanging public token:', error);
    await addSyncLog(req.user.id, 'connection', 'error', error.message);
    res.status(500).json({ error: 'Failed to connect account' });
  }
});

// Get connected accounts
router.get('/accounts', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const institutions = await plaidService.getConnectedInstitutions(userId);
    res.json({ institutions });
  } catch (error) {
    console.error('Error getting connected accounts:', error);
    res.status(500).json({ error: 'Failed to get connected accounts' });
  }
});

// Sync transactions from connected accounts
router.post('/sync-transactions', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required (YYYY-MM-DD)' });
    }

    await addSyncLog(userId, 'transaction_sync', 'in_progress', `Syncing transactions ${startDate} to ${endDate}`);

    const results = await plaidService.syncTransactions(userId, startDate, endDate);

    const successCount = results.filter(r => r.success).length;
    const totalAdded = results.reduce((s, r) => s + (r.added || 0), 0);

    await addSyncLog(userId, 'transaction_sync', 'completed',
      `Synced ${successCount}/${results.length} accounts, ${totalAdded} new transactions`);

    res.json({ success: true, results });
  } catch (error) {
    console.error('Error syncing transactions:', error);
    await addSyncLog(req.user.id, 'transaction_sync', 'error', error.message);
    res.status(500).json({ error: error.message || 'Failed to sync transactions' });
  }
});

// Remove connected account
router.delete('/accounts/:itemId', optionalAuth, async (req, res) => {
  try {
    const { itemId } = req.params;
    const userId = req.user.id;

    await plaidService.removeItem(userId, itemId);
    await addSyncLog(userId, 'disconnection', 'success', `Removed account ${itemId}`);

    res.json({ success: true, message: 'Account removed successfully' });
  } catch (error) {
    console.error('Error removing account:', error);
    res.status(500).json({ error: 'Failed to remove account' });
  }
});

// Get sync history
router.get('/sync-history', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 20 } = req.query;

    const snapshot = await db.collection('sync_logs')
      .where('user_id', '==', userId)
      .orderBy('created_at', 'desc')
      .limit(parseInt(limit))
      .get();

    const logs = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        sync_type: data.sync_type,
        status: data.status,
        message: data.message,
        created_at: data.created_at,
      };
    });

    res.json({ logs });
  } catch (error) {
    console.error('Error getting sync history:', error);
    res.status(500).json({ error: 'Failed to get sync history' });
  }
});

module.exports = router;
