const { PlaidApi, Configuration, PlaidEnvironments } = require('plaid');
const { db } = require('./database');
const { encrypt, decrypt } = require('./encryption');

// Structured Plaid logger - captures key identifiers for troubleshooting
function logPlaid(level, action, details = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    service: 'plaid',
    action,
    ...(details.item_id && { item_id: details.item_id }),
    ...(details.request_id && { request_id: details.request_id }),
    ...(details.account_id && { account_id: details.account_id }),
    ...(details.link_session_id && { link_session_id: details.link_session_id }),
    ...(details.institution_id && { institution_id: details.institution_id }),
    ...(details.error_code && { error_code: details.error_code }),
    ...(details.error_type && { error_type: details.error_type }),
    ...(details.message && { message: details.message }),
  };
  if (level === 'error') {
    console.error('[Plaid]', JSON.stringify(entry));
  } else {
    console.log('[Plaid]', JSON.stringify(entry));
  }
}

// Extract identifiers from Plaid error responses
function extractErrorDetails(error) {
  const data = error.response?.data || {};
  return {
    request_id: data.request_id || null,
    error_code: data.error_code || null,
    error_type: data.error_type || null,
    message: data.error_message || error.message,
  };
}

class PlaidService {
  constructor() {
    const envMap = {
      production: PlaidEnvironments.production,
      development: PlaidEnvironments.development,
      sandbox: PlaidEnvironments.sandbox,
    };

    const configuration = new Configuration({
      basePath: envMap[process.env.PLAID_ENV] || PlaidEnvironments.sandbox,
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
          'PLAID-SECRET': process.env.PLAID_SECRET,
        },
      },
    });

    this.client = new PlaidApi(configuration);
  }

  // Create a link token for connecting accounts
  async createLinkToken(userId) {
    try {
      const request = {
        user: { client_user_id: userId.toString() },
        client_name: 'Wealth Navigator',
        products: ['transactions'],
        country_codes: ['US'],
        language: 'en',
        redirect_uri: process.env.PLAID_REDIRECT_URI || 'http://localhost:3000/oauth-callback',
        webhook: process.env.PLAID_WEBHOOK_URL || undefined,
      };

      if (process.env.PLAID_USER_PHONE) {
        request.user.phone_number = process.env.PLAID_USER_PHONE;
      }

      const response = await this.client.linkTokenCreate(request);
      logPlaid('info', 'link_token_create', {
        request_id: response.data.request_id,
        message: `Link token created for user ${userId}`,
      });
      return response.data.link_token;
    } catch (error) {
      logPlaid('error', 'link_token_create', extractErrorDetails(error));
      throw new Error(`Failed to create link token: ${error.response?.data?.error_message || error.message}`);
    }
  }

  // Exchange public token for access token and store in Firestore
  async exchangePublicToken(publicToken, userId) {
    try {
      const response = await this.client.itemPublicTokenExchange({
        public_token: publicToken,
      });

      const accessToken = response.data.access_token;
      const itemId = response.data.item_id;

      logPlaid('info', 'public_token_exchange', {
        item_id: itemId,
        request_id: response.data.request_id,
        message: 'Token exchanged successfully',
      });

      // Get institution info
      const itemResponse = await this.client.itemGet({ access_token: accessToken });
      logPlaid('info', 'item_get', {
        item_id: itemId,
        request_id: itemResponse.data.request_id,
        institution_id: itemResponse.data.item.institution_id,
      });

      const institutionResponse = await this.client.institutionsGetById({
        institution_id: itemResponse.data.item.institution_id,
        country_codes: ['US'],
      });

      const institutionName = institutionResponse.data.institution?.name || 'Unknown';

      logPlaid('info', 'institution_get', {
        item_id: itemId,
        request_id: institutionResponse.data.request_id,
        institution_id: itemResponse.data.item.institution_id,
        message: `Institution: ${institutionName}`,
      });

      // Check if this exact item already exists
      const existing = await db.collection('plaid_items')
        .where('user_id', '==', userId)
        .where('item_id', '==', itemId)
        .limit(1)
        .get();

      // Check if user already has an item from this institution
      const duplicateInstitution = await db.collection('plaid_items')
        .where('user_id', '==', userId)
        .where('institution_id', '==', itemResponse.data.item.institution_id)
        .limit(1)
        .get();

      if (!duplicateInstitution.empty && existing.empty) {
        logPlaid('info', 'duplicate_item_detected', {
          item_id: itemId,
          institution_id: itemResponse.data.item.institution_id,
          message: `Duplicate connection to ${institutionName} removed`,
        });
        // Remove the new duplicate item from Plaid
        try {
          await this.client.itemRemove({ access_token: accessToken });
        } catch (err) {
          logPlaid('error', 'duplicate_item_remove', { item_id: itemId, ...extractErrorDetails(err) });
        }
        throw new Error(`You already have a connection to ${institutionName}. Please remove it first if you want to reconnect.`);
      }

      const data = {
        user_id: userId,
        item_id: itemId,
        institution_id: itemResponse.data.item.institution_id,
        access_token: encrypt(accessToken),
        institution_name: institutionName,
        products: ['transactions'],
        updated_at: new Date().toISOString(),
      };

      if (existing.empty) {
        data.created_at = new Date().toISOString();
        await db.collection('plaid_items').add(data);
      } else {
        await existing.docs[0].ref.update(data);
      }

      return { accessToken, itemId, institutionName };
    } catch (error) {
      if (!error.message.includes('already have a connection')) {
        logPlaid('error', 'public_token_exchange', extractErrorDetails(error));
      }
      throw error;
    }
  }

  // Get connected institutions for a user
  async getConnectedInstitutions(userId) {
    const snapshot = await db.collection('plaid_items')
      .where('user_id', '==', userId)
      .get();

    return snapshot.docs.map(doc => {
      const d = doc.data();
      return {
        id: doc.id,
        item_id: d.item_id,
        institution_name: d.institution_name,
        products: d.products || [],
        created_at: d.created_at,
      };
    });
  }

  // Sync transactions from Plaid into the expenses collection
  async syncTransactions(userId, startDate, endDate) {
    const itemsSnapshot = await db.collection('plaid_items')
      .where('user_id', '==', userId)
      .get();

    if (itemsSnapshot.empty) {
      throw new Error('No connected accounts found');
    }

    const results = [];

    for (const itemDoc of itemsSnapshot.docs) {
      const item = itemDoc.data();
      const accessToken = decrypt(item.access_token);

      try {
        // Fetch transactions from Plaid
        let allTransactions = [];
        let hasMore = true;
        let offset = 0;

        while (hasMore) {
          const response = await this.client.transactionsGet({
            access_token: accessToken,
            start_date: startDate,
            end_date: endDate,
            options: { count: 500, offset },
          });

          logPlaid('info', 'transactions_get', {
            item_id: item.item_id,
            request_id: response.data.request_id,
            institution_id: item.institution_id,
            message: `Fetched ${response.data.transactions.length} transactions (offset ${offset}, total ${response.data.total_transactions})`,
          });

          allTransactions = allTransactions.concat(response.data.transactions);
          hasMore = allTransactions.length < response.data.total_transactions;
          offset = allTransactions.length;
        }

        // Get existing expenses to avoid duplicates
        const existingSnapshot = await db.collection('expenses')
          .where('plaid_item_id', '==', item.item_id)
          .get();

        const existingKeys = new Set(
          existingSnapshot.docs.map(doc => {
            const d = doc.data();
            return `${d.date}|${d.plaid_transaction_id}`;
          })
        );

        // Batch write new transactions
        let added = 0;
        let skipped = 0;
        const batchOps = [];

        for (const txn of allTransactions) {
          // Skip pending transactions
          if (txn.pending) { skipped++; continue; }

          const txnKey = `${txn.date}|${txn.transaction_id}`;
          if (existingKeys.has(txnKey)) { skipped++; continue; }

          // Plaid amounts: positive = debit (money spent), negative = credit (income/refund)
          const amount = Math.abs(txn.amount);
          const isIncome = txn.amount < 0;

          batchOps.push({
            date: txn.date,
            merchant: txn.merchant_name || txn.name || 'Unknown',
            description: txn.name || '',
            amount,
            category: isIncome ? 'Income' : '',
            subcategory: '',
            account: item.institution_name,
            statement: `Plaid - ${item.institution_name}`,
            is_transfer: false,
            plaid_transaction_id: txn.transaction_id,
            plaid_item_id: item.item_id,
            plaid_category: txn.personal_finance_category?.primary || '',
            plaid_subcategory: txn.personal_finance_category?.detailed || '',
            created_at: new Date().toISOString(),
          });

          added++;
        }

        // Write in batches of 500
        for (let i = 0; i < batchOps.length; i += 500) {
          const batch = db.batch();
          const chunk = batchOps.slice(i, i + 500);
          for (const op of chunk) {
            batch.set(db.collection('expenses').doc(), op);
          }
          await batch.commit();
        }

        logPlaid('info', 'transactions_sync', {
          item_id: item.item_id,
          institution_id: item.institution_id,
          message: `Synced ${item.institution_name}: ${added} added, ${skipped} skipped`,
        });

        results.push({
          institution: item.institution_name,
          total_fetched: allTransactions.length,
          added,
          skipped,
          success: true,
        });
      } catch (error) {
        logPlaid('error', 'transactions_sync', {
          item_id: item.item_id,
          institution_id: item.institution_id,
          ...extractErrorDetails(error),
        });
        results.push({
          institution: item.institution_name,
          success: false,
          error: error.response?.data?.error_message || error.message,
        });
      }
    }

    return results;
  }

  // Remove a connected account
  async removeItem(userId, itemId) {
    const snapshot = await db.collection('plaid_items')
      .where('user_id', '==', userId)
      .where('item_id', '==', itemId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      throw new Error('Account not found');
    }

    const item = snapshot.docs[0].data();

    try {
      const accessToken = decrypt(item.access_token);
      const response = await this.client.itemRemove({ access_token: accessToken });
      logPlaid('info', 'item_remove', {
        item_id: itemId,
        request_id: response.data.request_id,
        institution_id: item.institution_id,
        message: `Removed ${item.institution_name}`,
      });
    } catch (err) {
      logPlaid('error', 'item_remove', { item_id: itemId, ...extractErrorDetails(err) });
    }

    // Delete the plaid_items doc
    await snapshot.docs[0].ref.delete();

    return true;
  }

  // Get investment holdings (kept for investment sync)
  async getInvestmentHoldings(accessToken) {
    const response = await this.client.investmentsHoldingsGet({
      access_token: accessToken,
    });

    logPlaid('info', 'investments_holdings_get', {
      request_id: response.data.request_id,
      message: `Fetched ${response.data.holdings.length} holdings`,
    });

    return {
      accounts: response.data.accounts,
      holdings: response.data.holdings,
      securities: response.data.securities,
    };
  }
}

module.exports = new PlaidService();
