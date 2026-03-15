const { PlaidApi, Configuration, PlaidEnvironments } = require('plaid');
const { db } = require('./database');
const { encrypt, decrypt } = require('./encryption');

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
      };

      if (process.env.PLAID_USER_PHONE) {
        request.user.phone_number = process.env.PLAID_USER_PHONE;
      }

      const response = await this.client.linkTokenCreate(request);
      return response.data.link_token;
    } catch (error) {
      console.error('Error creating link token:', error.response?.data || error.message);
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

      // Get institution info
      const itemResponse = await this.client.itemGet({ access_token: accessToken });
      const institutionResponse = await this.client.institutionsGetById({
        institution_id: itemResponse.data.item.institution_id,
        country_codes: ['US'],
      });

      const institutionName = institutionResponse.data.institution?.name || 'Unknown';

      // Check if this item already exists
      const existing = await db.collection('plaid_items')
        .where('user_id', '==', userId)
        .where('item_id', '==', itemId)
        .limit(1)
        .get();

      const data = {
        user_id: userId,
        item_id: itemId,
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
      console.error('Error exchanging public token:', error.response?.data || error.message);
      throw new Error('Failed to exchange public token');
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

        results.push({
          institution: item.institution_name,
          total_fetched: allTransactions.length,
          added,
          skipped,
          success: true,
        });
      } catch (error) {
        console.error(`Error syncing transactions for ${item.institution_name}:`, error.response?.data || error.message);
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
      await this.client.itemRemove({ access_token: accessToken });
    } catch (err) {
      console.error('Error removing item from Plaid (continuing with local cleanup):', err.message);
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

    return {
      accounts: response.data.accounts,
      holdings: response.data.holdings,
      securities: response.data.securities,
    };
  }
}

module.exports = new PlaidService();
