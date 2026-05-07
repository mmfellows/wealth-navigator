const express = require('express');
const plaidService = require('../services/plaidService');
const { optionalAuth } = require('../middleware/auth');
const { db } = require('../services/database');
const { writeBalanceSnapshot } = require('../services/snapshotService');
const { verifyPlaidWebhook } = require('../services/plaidWebhookVerifier');

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

// Record a Plaid Link consent event. The frontend calls this immediately
// before opening Plaid Link, after the user has acknowledged the consent
// statement. See security/CONSENT.md for the full schema.
const crypto = require('crypto');
router.post('/consent', optionalAuth, async (req, res) => {
  try {
    const { privacy_policy_version, consent_text, app_version } = req.body || {};
    if (!privacy_policy_version || !consent_text) {
      return res.status(400).json({ error: 'privacy_policy_version and consent_text are required' });
    }
    const consentTextSha256 = crypto
      .createHash('sha256')
      .update(String(consent_text))
      .digest('hex');
    await db.collection('consents').add({
      user_id: req.user.id,
      type: 'plaid_link_initiated',
      privacy_policy_version: String(privacy_policy_version),
      consent_text_sha256: consentTextSha256,
      consented_at: new Date().toISOString(),
      user_agent: req.headers['user-agent'] || null,
      app_version: app_version || null,
    });
    res.json({ logged: true });
  } catch (error) {
    console.error('Error logging consent:', error);
    res.status(500).json({ error: 'Failed to log consent' });
  }
});

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

// Get connected accounts: institutions (one per Plaid item) and a flat list of
// every individual account (checking, brokerage, credit card, etc.).
router.get('/accounts', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const [institutions, accounts] = await Promise.all([
      plaidService.getConnectedInstitutions(userId),
      plaidService.getAccountsForUser(userId),
    ]);
    res.json({ institutions, accounts });
  } catch (error) {
    console.error('Error getting connected accounts:', error);
    res.status(500).json({ error: 'Failed to get connected accounts' });
  }
});

// Liabilities: credit cards, student loans, mortgages with APR / due date /
// balance / min payment. Joined with account name + institution so the UI
// doesn't need a second lookup.
router.get('/liabilities', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const liabilities = await plaidService.getLiabilitiesForUser(userId);
    res.json({ liabilities });
  } catch (error) {
    console.error('Error getting liabilities:', error);
    res.status(500).json({ error: 'Failed to get liabilities' });
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

// Sync everything we can for the current user: balances, transactions,
// (later) holdings + liabilities. This is what PlaidLink and InvestingSettings
// already POST to after a successful link.
router.post('/sync', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { daysBack } = req.body || {};
    const range = plaidService.defaultTransactionDateRange(daysBack || 30);

    await addSyncLog(userId, 'sync', 'in_progress', `Syncing all streams (last ${daysBack || 30} days)`);

    const results = await plaidService.syncUser(userId, {
      transactions: range,
    });

    const totals = results.reduce((acc, r) => {
      acc.transactions += r.streams?.transactions?.added || 0;
      acc.accounts += r.streams?.accounts?.count || 0;
      acc.holdings += r.streams?.holdings?.holdings || 0;
      acc.investment_txns += r.streams?.investment_transactions?.added || 0;
      acc.liabilities += r.streams?.liabilities?.total || 0;
      return acc;
    }, { transactions: 0, accounts: 0, holdings: 0, investment_txns: 0, liabilities: 0 });

    await addSyncLog(userId, 'sync', 'completed',
      `${results.length} institutions: ${totals.accounts} accounts, ${totals.transactions} txns, ${totals.holdings} holdings, ${totals.investment_txns} inv txns, ${totals.liabilities} liabilities`);

    // Freeze a balance_snapshots row immediately after a manual sync so the
    // dashboard's "today" point on the net-worth chart reflects fresh data.
    try { await writeBalanceSnapshot(userId); } catch (err) {
      console.error('Snapshot write after manual sync failed:', err.message);
    }

    res.json({
      success: true,
      message: `Synced ${results.length} institution${results.length === 1 ? '' : 's'} — ${totals.transactions} new transactions, ${totals.holdings} holdings, ${totals.liabilities} liabilities`,
      results,
      totals,
    });
  } catch (error) {
    console.error('Error in /sync:', error);
    await addSyncLog(req.user.id, 'sync', 'error', error.message).catch(() => {});
    res.status(500).json({ error: error.message || 'Failed to sync' });
  }
});

// Create a link token in update mode for an existing item.
// Used to add investments/liabilities consent to an item that originally
// only had transactions, or to repair an item in ITEM_LOGIN_REQUIRED state.
router.post('/create-update-token', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { item_id } = req.body || {};
    if (!item_id) return res.status(400).json({ error: 'item_id is required' });

    const linkToken = await plaidService.createUpdateLinkToken(userId, item_id);
    res.json({ link_token: linkToken });
  } catch (error) {
    console.error('Error creating update link token:', error);
    res.status(500).json({ error: error.message || 'Failed to create update link token' });
  }
});

// After a Plaid Link update-mode success, no public token is issued — the
// existing access token already has the new product consent. Frontend calls
// this to (1) refresh stored products and (2) trigger a sync of the now-
// available data.
router.post('/refresh-item-products', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { item_id } = req.body || {};
    if (!item_id) return res.status(400).json({ error: 'item_id is required' });

    const products = await plaidService.refreshItemProducts(userId, item_id);
    await addSyncLog(userId, 'reconnect', 'success',
      `Refreshed products for item ${item_id}: ${products.join(', ')}`);

    res.json({ success: true, products });
  } catch (error) {
    console.error('Error refreshing item products:', error);
    res.status(500).json({ error: error.message || 'Failed to refresh item products' });
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

// Retroactively fix transfers, credit card payments, and credit amounts on existing expenses
router.post('/fix-transfers', optionalAuth, async (req, res) => {
  try {
    const snapshot = await db.collection('expenses').get();
    let updated = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const plaidPrimary = data.plaid_category || '';
      const plaidDetailed = data.plaid_subcategory || '';
      const txnName = (data.description || data.merchant || '').toUpperCase();

      const isTransfer = plaidPrimary === 'TRANSFER_IN' || plaidPrimary === 'TRANSFER_OUT'
        || plaidDetailed.includes('CREDIT_CARD_PAYMENT')
        || plaidDetailed.includes('TRANSFER')
        || /\b(PAYMENT|AUTOPAY|THANK YOU)\b/.test(txnName);
      const isCreditCardPayment = plaidDetailed.includes('CREDIT_CARD_PAYMENT')
        || /\b(PAYMENT\s*THANK YOU|AUTOPAY|AUTOMATIC PAYMENT)\b/.test(txnName);

      const update = {};
      let needsUpdate = false;

      if (isTransfer !== !!data.is_transfer) {
        update.is_transfer = isTransfer;
        needsUpdate = true;
      }
      if (isCreditCardPayment !== !!data.is_credit_card_payment) {
        update.is_credit_card_payment = isCreditCardPayment;
        if (isCreditCardPayment && !data.category) update.category = 'Credit Card Payment';
        needsUpdate = true;
      }

      // Fix credits: if category is Income or plaid says it's income/refund, amount should be negative
      const isCredit = data.category === 'Income'
        || plaidPrimary === 'INCOME'
        || plaidDetailed.includes('REFUND')
        || plaidPrimary === 'TRANSFER_IN'
        || isCreditCardPayment;
      if (isCredit && data.amount > 0) {
        update.amount = -Math.abs(data.amount);
        needsUpdate = true;
      }

      if (needsUpdate) {
        await doc.ref.update(update);
        updated++;
      }
    }

    res.json({ success: true, total: snapshot.size, updated });
  } catch (error) {
    console.error('Error fixing transfers:', error);
    res.status(500).json({ error: error.message });
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

// Webhook receiver.
// Verifies Plaid's ES256 signature (Plaid-Verification header) against the
// raw request body before doing any work. Unverified requests are rejected
// with 401 so they never reach the data layer. See:
// security/ACCESS_CONTROL.md and backend/services/plaidWebhookVerifier.js.
router.post('/webhook', async (req, res) => {
  const jwtHeader = req.get('Plaid-Verification');
  try {
    await verifyPlaidWebhook(jwtHeader, req.rawBody);
  } catch (verifyErr) {
    console.warn(`Plaid webhook signature verification failed: ${verifyErr.message}`);
    try {
      await db.collection('sync_logs').add({
        sync_type: 'webhook',
        status: 'rejected_unverified',
        message: verifyErr.message,
        item_id: (req.body && req.body.item_id) || null,
        created_at: new Date().toISOString(),
      });
    } catch {}
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { webhook_type, webhook_code, item_id, removed_transactions } = req.body;
  console.log(`Plaid webhook verified: ${webhook_type} / ${webhook_code} for item ${item_id}`);

  // Acknowledge fast — Plaid retries if we don't respond within ~10s. Do the work after.
  res.json({ received: true });

  try {
    await db.collection('sync_logs').add({
      sync_type: 'webhook',
      status: 'received',
      message: `${webhook_type}: ${webhook_code}`,
      item_id: item_id || null,
      webhook_body: req.body,
      created_at: new Date().toISOString(),
    });

    if (!item_id) return;
    const userId = await plaidService.getUserIdByItemId(item_id);
    if (!userId) {
      console.warn(`Webhook for unknown item ${item_id} — skipping sync`);
      return;
    }

    const itemSnap = await db.collection('plaid_items')
      .where('item_id', '==', item_id)
      .limit(1)
      .get();
    const item = itemSnap.empty ? null : itemSnap.docs[0].data();

    // Pick the per-product date range based on webhook semantics.
    // HISTORICAL_UPDATE → full backfill (~2y). DEFAULT/INITIAL → incremental (30d).
    const txnDaysBack =
      webhook_code === 'HISTORICAL_UPDATE' ? 730 :
      ['INITIAL_UPDATE', 'DEFAULT_UPDATE', 'SYNC_UPDATES_AVAILABLE'].includes(webhook_code) ? 30 :
      null;

    if (webhook_type === 'TRANSACTIONS' && txnDaysBack) {
      const range = plaidService.defaultTransactionDateRange(txnDaysBack);
      await addSyncLog(userId, 'webhook_sync', 'in_progress', `${webhook_code}: syncing ${range.startDate}..${range.endDate}`);
      const results = await plaidService.syncTransactions(userId, range.startDate, range.endDate);
      const totalAdded = results.reduce((s, r) => s + (r.added || 0), 0);
      await addSyncLog(userId, 'webhook_sync', 'completed', `${webhook_code}: ${totalAdded} new transactions`);
    } else if (webhook_type === 'TRANSACTIONS' && webhook_code === 'TRANSACTIONS_REMOVED' && Array.isArray(removed_transactions)) {
      const removed = await plaidService.removeTransactionsByPlaidIds(item_id, removed_transactions);
      await addSyncLog(userId, 'webhook_sync', 'completed', `TRANSACTIONS_REMOVED: removed ${removed}`);
    } else if (webhook_type === 'HOLDINGS' && webhook_code === 'DEFAULT_UPDATE' && item) {
      // Plaid sends this when holdings have changed (new buys/sells reflected
      // in positions). Refresh holdings + balances; investment transactions
      // come via their own webhook below.
      await addSyncLog(userId, 'webhook_sync', 'in_progress', `HOLDINGS:${webhook_code}`);
      const result = await plaidService.syncItem(item, {
        transactions: false,
        investmentTransactions: false,
      });
      const h = result.streams?.holdings;
      await addSyncLog(userId, 'webhook_sync', 'completed',
        `HOLDINGS: ${h?.holdings ?? 0} positions, ${h?.removed ?? 0} closed`);
    } else if (webhook_type === 'INVESTMENTS_TRANSACTIONS' && item &&
               ['DEFAULT_UPDATE', 'HISTORICAL_UPDATE'].includes(webhook_code)) {
      const invDays = webhook_code === 'HISTORICAL_UPDATE' ? 730 : 90;
      const range = plaidService.defaultTransactionDateRange(invDays);
      await addSyncLog(userId, 'webhook_sync', 'in_progress', `INVESTMENTS_TRANSACTIONS:${webhook_code}`);
      const result = await plaidService.syncItem(item, {
        transactions: false,
        holdings: false,
        investmentTransactions: range,
        liabilities: false,
      });
      const it = result.streams?.investment_transactions;
      await addSyncLog(userId, 'webhook_sync', 'completed',
        `INVESTMENTS_TRANSACTIONS: ${it?.added ?? 0} rows`);
    } else if (webhook_type === 'LIABILITIES' && webhook_code === 'DEFAULT_UPDATE' && item) {
      await addSyncLog(userId, 'webhook_sync', 'in_progress', `LIABILITIES:${webhook_code}`);
      const result = await plaidService.syncItem(item, {
        transactions: false,
        holdings: false,
        investmentTransactions: false,
      });
      const l = result.streams?.liabilities;
      await addSyncLog(userId, 'webhook_sync', 'completed',
        `LIABILITIES: ${l?.total ?? 0} liabilities, ${l?.removed ?? 0} closed`);
    }
  } catch (error) {
    console.error('Error processing webhook:', error);
    try {
      await db.collection('sync_logs').add({
        sync_type: 'webhook',
        status: 'error',
        message: error.message,
        item_id: item_id || null,
        created_at: new Date().toISOString(),
      });
    } catch {}
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
