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

// Log Link events for conversion tracking
router.post('/link-event', optionalAuth, async (req, res) => {
  try {
    const { event_name, metadata } = req.body;
    const userId = req.user?.id || 'anonymous';

    await db.collection('sync_logs').add({
      user_id: userId,
      sync_type: 'link_event',
      status: event_name,
      message: `${event_name}${metadata?.institution_name ? ` - ${metadata.institution_name}` : ''}`,
      metadata: {
        event_name,
        link_session_id: metadata?.link_session_id || null,
        institution_id: metadata?.institution_id || null,
        institution_name: metadata?.institution_name || null,
        error_type: metadata?.error_type || null,
        error_code: metadata?.error_code || null,
        error_message: metadata?.error_message || null,
        exit_status: metadata?.exit_status || null,
        view_name: metadata?.view_name || null,
      },
      created_at: new Date().toISOString(),
    });

    res.json({ logged: true });
  } catch (error) {
    console.error('Error logging link event:', error);
    res.status(500).json({ error: 'Failed to log event' });
  }
});

// Webhook receiver
router.post('/webhook', async (req, res) => {
  const { webhook_type, webhook_code, item_id } = req.body;
  console.log(`Plaid webhook received: ${webhook_type} / ${webhook_code} for item ${item_id}`);

  try {
    await db.collection('sync_logs').add({
      sync_type: 'webhook',
      status: 'received',
      message: `${webhook_type}: ${webhook_code}`,
      item_id: item_id || null,
      webhook_body: req.body,
      created_at: new Date().toISOString(),
    });

    // Handle specific webhook types
    if (webhook_type === 'ITEM' && webhook_code === 'NEW_ACCOUNTS_AVAILABLE') {
      console.log(`New accounts available for item ${item_id}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Sandbox-only: fire test webhook for a connected item
router.post('/sandbox/fire-webhook', optionalAuth, async (req, res) => {
  if (process.env.PLAID_ENV !== 'sandbox') {
    return res.status(403).json({ error: 'Only available in sandbox mode' });
  }

  try {
    const userId = req.user.id;
    const { webhook_code } = req.body;

    // Get the most recent plaid item for this user
    const snapshot = await db.collection('plaid_items')
      .where('user_id', '==', userId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({ error: 'No connected accounts. Connect one through Plaid Link first.' });
    }

    const item = snapshot.docs[0].data();
    const { decrypt } = require('../services/encryption');
    const accessToken = decrypt(item.access_token);

    const { PlaidApi, Configuration, PlaidEnvironments } = require('plaid');
    const config = new Configuration({
      basePath: PlaidEnvironments.sandbox,
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
          'PLAID-SECRET': process.env.PLAID_SECRET,
        },
      },
    });
    const client = new PlaidApi(config);

    const response = await client.sandboxItemFireWebhook({
      access_token: accessToken,
      webhook_type: 'ITEM',
      webhook_code: webhook_code || 'NEW_ACCOUNTS_AVAILABLE',
    });

    res.json({ success: true, webhook_fired: response.data.webhook_fired });
  } catch (error) {
    console.error('Error firing sandbox webhook:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data?.error_message || error.message });
  }
});

module.exports = router;
