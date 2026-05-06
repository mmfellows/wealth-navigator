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

  // Create a link token for connecting accounts.
  // products: 'transactions' is required (filters out institutions that don't support it).
  // optional_products: investments + liabilities are enabled when the institution supports them
  // — banks without brokerage/loan capability still connect successfully for transactions.
  async createLinkToken(userId) {
    try {
      const request = {
        user: { client_user_id: userId.toString() },
        client_name: 'Wealth Navigator',
        products: ['transactions'],
        optional_products: ['investments', 'liabilities'],
        country_codes: ['US'],
        language: 'en',
        redirect_uri: process.env.PLAID_REDIRECT_URI || undefined,
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

  // Create an update-mode link token for an existing item.
  // Used to (1) repair items that hit ITEM_LOGIN_REQUIRED and (2) add new product
  // consent (investments/liabilities) to items that were originally linked with
  // transactions only.
  async createUpdateLinkToken(userId, itemId) {
    const snapshot = await db.collection('plaid_items')
      .where('user_id', '==', userId)
      .where('item_id', '==', itemId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      throw new Error('Account not found');
    }

    const accessToken = decrypt(snapshot.docs[0].data().access_token);

    try {
      const response = await this.client.linkTokenCreate({
        user: { client_user_id: userId.toString() },
        client_name: 'Wealth Navigator',
        country_codes: ['US'],
        language: 'en',
        access_token: accessToken,
        additional_consented_products: ['investments', 'liabilities'],
        redirect_uri: process.env.PLAID_REDIRECT_URI || undefined,
        webhook: process.env.PLAID_WEBHOOK_URL || undefined,
      });
      logPlaid('info', 'update_link_token_create', {
        item_id: itemId,
        request_id: response.data.request_id,
      });
      return response.data.link_token;
    } catch (error) {
      logPlaid('error', 'update_link_token_create', { item_id: itemId, ...extractErrorDetails(error) });
      throw new Error(`Failed to create update link token: ${error.response?.data?.error_message || error.message}`);
    }
  }

  // Exchange public token for access token and store in Firestore.
  // Persists the products actually granted by the institution so the sync
  // orchestrator knows whether to attempt holdings/liabilities pulls.
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

      // Get institution + product info.
      // billed_products = enabled now. consented_products = user pre-consented (may be added later).
      const itemResponse = await this.client.itemGet({ access_token: accessToken });
      const grantedProducts = this.extractGrantedProducts(itemResponse.data.item);
      logPlaid('info', 'item_get', {
        item_id: itemId,
        request_id: itemResponse.data.request_id,
        institution_id: itemResponse.data.item.institution_id,
        message: `Granted products: ${grantedProducts.join(', ')}`,
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

      // Check if this exact item already exists (update mode reuses item_id)
      const existing = await db.collection('plaid_items')
        .where('user_id', '==', userId)
        .where('item_id', '==', itemId)
        .limit(1)
        .get();

      // Check if user already has an item from this institution (only for new connections)
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
        products: grantedProducts,
        updated_at: new Date().toISOString(),
      };

      if (existing.empty) {
        data.created_at = new Date().toISOString();
        await db.collection('plaid_items').add(data);
      } else {
        await existing.docs[0].ref.update(data);
      }

      // Populate plaid_accounts immediately so the UI can show balances without
      // waiting for the next sync cycle.
      try {
        await this.syncAccounts({ user_id: userId, item_id: itemId, institution_name: institutionName }, accessToken);
      } catch (err) {
        logPlaid('error', 'initial_account_sync', { item_id: itemId, ...extractErrorDetails(err) });
      }

      return { accessToken, itemId, institutionName, products: grantedProducts };
    } catch (error) {
      if (!error.message.includes('already have a connection')) {
        logPlaid('error', 'public_token_exchange', extractErrorDetails(error));
      }
      throw error;
    }
  }

  // Pull granted products from an itemGet response. billed_products is the
  // authoritative list of what's currently enabled on the item.
  extractGrantedProducts(item) {
    const billed = item?.billed_products || [];
    const products = item?.products || [];
    return Array.from(new Set([...billed, ...products]));
  }

  // Re-read billed_products from Plaid and update the stored products list.
  // Called after a Plaid Link update-mode success — at that point no public
  // token is exchanged, but the user may have granted additional products
  // (e.g. investments) that we now need to record.
  async refreshItemProducts(userId, itemId) {
    const snapshot = await db.collection('plaid_items')
      .where('user_id', '==', userId)
      .where('item_id', '==', itemId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      throw new Error('Account not found');
    }

    const item = snapshot.docs[0].data();
    const accessToken = decrypt(item.access_token);
    const itemResponse = await this.client.itemGet({ access_token: accessToken });
    const grantedProducts = this.extractGrantedProducts(itemResponse.data.item);

    await snapshot.docs[0].ref.update({
      products: grantedProducts,
      updated_at: new Date().toISOString(),
    });

    logPlaid('info', 'refresh_item_products', {
      item_id: itemId,
      message: `Products now: ${grantedProducts.join(', ')}`,
    });

    return grantedProducts;
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

  // Pull current account list + balances for one item into the plaid_accounts
  // collection. Used by exchange (initial population), syncItem (every sync),
  // and the webhook handler (keeps balances fresh).
  async syncAccounts(item, accessToken) {
    const token = accessToken || decrypt(item.access_token);

    const response = await this.client.accountsBalanceGet({ access_token: token });
    logPlaid('info', 'accounts_balance_get', {
      item_id: item.item_id,
      request_id: response.data.request_id,
      message: `Fetched ${response.data.accounts.length} accounts`,
    });

    const now = new Date().toISOString();
    const seenAccountIds = new Set();
    const batch = db.batch();

    for (const acct of response.data.accounts) {
      seenAccountIds.add(acct.account_id);

      // One Firestore doc per (user, item, account). We address by composite id
      // so writes are idempotent across sync cycles.
      const docId = `${item.user_id}_${acct.account_id}`;
      const ref = db.collection('plaid_accounts').doc(docId);

      batch.set(ref, {
        user_id: item.user_id,
        item_id: item.item_id,
        account_id: acct.account_id,
        institution_name: item.institution_name,
        name: acct.name || '',
        official_name: acct.official_name || '',
        mask: acct.mask || '',
        type: acct.type || '',
        subtype: acct.subtype || '',
        balance_current: acct.balances?.current ?? null,
        balance_available: acct.balances?.available ?? null,
        balance_limit: acct.balances?.limit ?? null,
        iso_currency_code: acct.balances?.iso_currency_code || acct.balances?.unofficial_currency_code || 'USD',
        updated_at: now,
      }, { merge: true });
    }

    await batch.commit();

    return {
      account_ids: Array.from(seenAccountIds),
      count: seenAccountIds.size,
    };
  }

  // Sync transactions for a single item between two dates. Extracted from the
  // old syncTransactions loop so the orchestrator can fan out cleanly.
  async syncTransactionsForItem(item, accessToken, startDate, endDate) {
    const token = accessToken || decrypt(item.access_token);

    let allTransactions = [];
    let hasMore = true;
    let offset = 0;

    while (hasMore) {
      const response = await this.client.transactionsGet({
        access_token: token,
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

    const existingSnapshot = await db.collection('expenses')
      .where('plaid_item_id', '==', item.item_id)
      .get();

    const existingKeys = new Set(
      existingSnapshot.docs.map(doc => {
        const d = doc.data();
        return `${d.date}|${d.plaid_transaction_id}`;
      })
    );

    let added = 0;
    let skipped = 0;
    const batchOps = [];

    for (const txn of allTransactions) {
      if (txn.pending) { skipped++; continue; }

      const txnKey = `${txn.date}|${txn.transaction_id}`;
      if (existingKeys.has(txnKey)) { skipped++; continue; }

      const amount = txn.amount;
      const isIncome = txn.amount < 0;

      const plaidPrimary = txn.personal_finance_category?.primary || '';
      const plaidDetailed = txn.personal_finance_category?.detailed || '';
      const txnName = (txn.name || '').toUpperCase();
      const isTransfer = plaidPrimary === 'TRANSFER_IN' || plaidPrimary === 'TRANSFER_OUT'
        || plaidDetailed.includes('CREDIT_CARD_PAYMENT')
        || plaidDetailed.includes('TRANSFER')
        || /\b(PAYMENT|AUTOPAY|THANK YOU)\b/.test(txnName);
      const isCreditCardPayment = plaidDetailed.includes('CREDIT_CARD_PAYMENT')
        || /\b(PAYMENT\s*THANK YOU|AUTOPAY|AUTOMATIC PAYMENT)\b/.test(txnName);

      batchOps.push({
        date: txn.date,
        merchant: txn.merchant_name || txn.name || 'Unknown',
        description: txn.name || '',
        amount,
        category: isIncome ? 'Income' : isCreditCardPayment ? 'Credit Card Payment' : '',
        subcategory: '',
        account: item.institution_name,
        statement: `Plaid - ${item.institution_name}`,
        is_transfer: isTransfer,
        is_credit_card_payment: isCreditCardPayment,
        plaid_transaction_id: txn.transaction_id,
        plaid_account_id: txn.account_id || null,
        plaid_item_id: item.item_id,
        plaid_category: plaidPrimary,
        plaid_subcategory: plaidDetailed,
        created_at: new Date().toISOString(),
      });

      added++;
    }

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

    return {
      total_fetched: allTransactions.length,
      added,
      skipped,
    };
  }

  // Pull current investment holdings + security metadata for one item.
  // Holdings = your positions (qty/cost basis/current price). Securities =
  // ticker metadata (name, type, latest close price). Both are upserted
  // idempotently so a re-run just refreshes prices/quantities.
  async syncHoldings(item, accessToken) {
    const token = accessToken || decrypt(item.access_token);

    const response = await this.client.investmentsHoldingsGet({ access_token: token });
    logPlaid('info', 'investments_holdings_get', {
      item_id: item.item_id,
      request_id: response.data.request_id,
      message: `Fetched ${response.data.holdings.length} holdings, ${response.data.securities.length} securities`,
    });

    const now = new Date().toISOString();

    // Securities are deduped by Plaid security_id. Doc id = ${user_id}_${security_id}
    // so each user has their own copy (Firestore queries are scoped by user_id).
    const securityBatch = db.batch();
    for (const sec of response.data.securities) {
      const ref = db.collection('plaid_securities').doc(`${item.user_id}_${sec.security_id}`);
      securityBatch.set(ref, {
        user_id: item.user_id,
        security_id: sec.security_id,
        ticker_symbol: sec.ticker_symbol || '',
        cusip: sec.cusip || null,
        isin: sec.isin || null,
        name: sec.name || '',
        type: sec.type || '',
        close_price: sec.close_price ?? null,
        close_price_as_of: sec.close_price_as_of || null,
        iso_currency_code: sec.iso_currency_code || sec.unofficial_currency_code || 'USD',
        is_cash_equivalent: sec.is_cash_equivalent || false,
        updated_at: now,
      }, { merge: true });
    }
    await securityBatch.commit();

    // Holdings keyed by (account, security). Re-syncing replaces the row.
    // We also need to delete stale holdings (positions sold since last sync)
    // — read existing rows for this item, diff against the fresh set, delete the rest.
    const existingSnapshot = await db.collection('plaid_holdings')
      .where('user_id', '==', item.user_id)
      .where('item_id', '==', item.item_id)
      .get();

    const freshIds = new Set();
    const holdingBatch = db.batch();
    for (const h of response.data.holdings) {
      const docId = `${item.user_id}_${h.account_id}_${h.security_id}`;
      freshIds.add(docId);
      const ref = db.collection('plaid_holdings').doc(docId);
      holdingBatch.set(ref, {
        user_id: item.user_id,
        item_id: item.item_id,
        account_id: h.account_id,
        security_id: h.security_id,
        quantity: h.quantity ?? 0,
        cost_basis: h.cost_basis ?? null,
        institution_price: h.institution_price ?? null,
        institution_price_as_of: h.institution_price_as_of || null,
        institution_value: h.institution_value ?? null,
        iso_currency_code: h.iso_currency_code || h.unofficial_currency_code || 'USD',
        updated_at: now,
      }, { merge: true });
    }

    let removed = 0;
    for (const doc of existingSnapshot.docs) {
      if (!freshIds.has(doc.id)) {
        holdingBatch.delete(doc.ref);
        removed++;
      }
    }
    await holdingBatch.commit();

    return {
      holdings: freshIds.size,
      securities: response.data.securities.length,
      removed,
    };
  }

  // Pull buy/sell/dividend/fee history for the date range. Used both on
  // demand sync and via the INVESTMENTS_TRANSACTIONS webhook.
  async syncInvestmentTransactions(item, accessToken, startDate, endDate) {
    const token = accessToken || decrypt(item.access_token);

    let allTransactions = [];
    let allSecurities = [];
    let hasMore = true;
    let offset = 0;

    while (hasMore) {
      const response = await this.client.investmentsTransactionsGet({
        access_token: token,
        start_date: startDate,
        end_date: endDate,
        options: { count: 500, offset },
      });

      logPlaid('info', 'investments_transactions_get', {
        item_id: item.item_id,
        request_id: response.data.request_id,
        message: `Fetched ${response.data.investment_transactions.length} (offset ${offset}, total ${response.data.total_investment_transactions})`,
      });

      allTransactions = allTransactions.concat(response.data.investment_transactions);
      allSecurities = allSecurities.concat(response.data.securities || []);
      hasMore = allTransactions.length < response.data.total_investment_transactions;
      offset = allTransactions.length;
    }

    const now = new Date().toISOString();

    // Upsert any securities returned in this call too — keeps ticker/name
    // metadata fresh for transactions referencing securities not in the
    // current holdings snapshot (e.g. fully-sold positions).
    if (allSecurities.length > 0) {
      const secBatch = db.batch();
      for (const sec of allSecurities) {
        const ref = db.collection('plaid_securities').doc(`${item.user_id}_${sec.security_id}`);
        secBatch.set(ref, {
          user_id: item.user_id,
          security_id: sec.security_id,
          ticker_symbol: sec.ticker_symbol || '',
          name: sec.name || '',
          type: sec.type || '',
          close_price: sec.close_price ?? null,
          updated_at: now,
        }, { merge: true });
      }
      await secBatch.commit();
    }

    // Idempotent upsert keyed on Plaid's investment_transaction_id (globally unique).
    let added = 0;
    let updated = 0;
    for (let i = 0; i < allTransactions.length; i += 500) {
      const chunk = allTransactions.slice(i, i + 500);
      const batch = db.batch();
      for (const txn of chunk) {
        const ref = db.collection('plaid_investment_transactions')
          .doc(`${item.user_id}_${txn.investment_transaction_id}`);
        batch.set(ref, {
          user_id: item.user_id,
          item_id: item.item_id,
          account_id: txn.account_id,
          security_id: txn.security_id || null,
          investment_transaction_id: txn.investment_transaction_id,
          type: txn.type || '',
          subtype: txn.subtype || '',
          date: txn.date,
          quantity: txn.quantity ?? null,
          price: txn.price ?? null,
          amount: txn.amount ?? null,
          fees: txn.fees ?? null,
          name: txn.name || '',
          iso_currency_code: txn.iso_currency_code || txn.unofficial_currency_code || 'USD',
          updated_at: now,
        }, { merge: true });
        added++;
      }
      await batch.commit();
    }

    return {
      total_fetched: allTransactions.length,
      added,
      updated,
    };
  }

  // Pull credit-card / student-loan / mortgage detail for one item.
  // Plaid groups responses by liability kind; we normalize them into a single
  // plaid_liabilities collection with a `kind` discriminator and a `raw` blob
  // for less-common fields. Stale rows (account closed since last sync) are
  // pruned at the end so the AccountSnapshot doesn't show ghost liabilities.
  async syncLiabilities(item, accessToken) {
    const token = accessToken || decrypt(item.access_token);

    const response = await this.client.liabilitiesGet({ access_token: token });
    const { credit = [], student = [], mortgage = [] } = response.data.liabilities || {};

    logPlaid('info', 'liabilities_get', {
      item_id: item.item_id,
      request_id: response.data.request_id,
      message: `Fetched ${credit.length} credit, ${student.length} student, ${mortgage.length} mortgage`,
    });

    // Account list is also returned — grab balance_current for each liability
    // so we can store the outstanding balance directly on the row.
    const balanceByAccount = new Map(
      (response.data.accounts || []).map(a => [a.account_id, a.balances?.current ?? null])
    );

    const now = new Date().toISOString();
    const freshIds = new Set();
    const batch = db.batch();

    const writeRow = (kind, accountId, fields, raw) => {
      const docId = `${item.user_id}_${accountId}`;
      freshIds.add(docId);
      const ref = db.collection('plaid_liabilities').doc(docId);
      batch.set(ref, {
        user_id: item.user_id,
        item_id: item.item_id,
        account_id: accountId,
        kind,
        balance: balanceByAccount.get(accountId) ?? null,
        ...fields,
        raw,
        updated_at: now,
      }, { merge: true });
    };

    for (const c of credit) {
      // Credit cards return an array of APRs (purchase, balance transfer, cash advance).
      // Use the highest as the headline rate for now — UI can show all from `raw`.
      const aprs = c.aprs || [];
      const headlineApr = aprs.length > 0
        ? Math.max(...aprs.map(a => a.apr_percentage || 0))
        : null;

      writeRow('credit', c.account_id, {
        apr: headlineApr,
        min_payment_amount: c.minimum_payment_amount ?? null,
        next_payment_due_date: c.next_payment_due_date || null,
        last_payment_amount: c.last_payment_amount ?? null,
        last_payment_date: c.last_payment_date || null,
        last_statement_balance: c.last_statement_balance ?? null,
        last_statement_issue_date: c.last_statement_issue_date || null,
        origination_date: null,
        maturity_date: null,
        is_overdue: c.is_overdue || false,
      }, c);
    }

    for (const s of student) {
      writeRow('student', s.account_id, {
        apr: s.interest_rate_percentage ?? null,
        min_payment_amount: s.minimum_payment_amount ?? null,
        next_payment_due_date: s.next_payment_due_date || null,
        last_payment_amount: s.last_payment_amount ?? null,
        last_payment_date: s.last_payment_date || null,
        last_statement_balance: s.last_statement_balance ?? null,
        last_statement_issue_date: s.last_statement_issue_date || null,
        origination_date: s.origination_date || null,
        maturity_date: s.expected_payoff_date || null,
        is_overdue: s.is_overdue || false,
        loan_name: s.loan_name || null,
        outstanding_interest: s.outstanding_interest_amount ?? null,
        ytd_interest_paid: s.ytd_interest_paid ?? null,
        ytd_principal_paid: s.ytd_principal_paid ?? null,
      }, s);
    }

    for (const m of mortgage) {
      writeRow('mortgage', m.account_id, {
        apr: m.interest_rate?.percentage ?? null,
        min_payment_amount: m.next_monthly_payment ?? null,
        next_payment_due_date: m.next_payment_due_date || null,
        last_payment_amount: m.last_payment_amount ?? null,
        last_payment_date: m.last_payment_date || null,
        last_statement_balance: null,
        last_statement_issue_date: null,
        origination_date: m.origination_date || null,
        maturity_date: m.maturity_date || null,
        is_overdue: !!m.past_due_amount,
        origination_principal: m.origination_principal_amount ?? null,
        loan_term: m.loan_term || null,
        loan_type: m.loan_type_description || null,
        ytd_interest_paid: m.ytd_interest_paid ?? null,
        ytd_principal_paid: m.ytd_principal_paid ?? null,
      }, m);
    }

    // Prune stale rows (e.g. card closed since last sync).
    const existing = await db.collection('plaid_liabilities')
      .where('user_id', '==', item.user_id)
      .where('item_id', '==', item.item_id)
      .get();

    let removed = 0;
    for (const doc of existing.docs) {
      if (!freshIds.has(doc.id)) {
        batch.delete(doc.ref);
        removed++;
      }
    }

    await batch.commit();

    return {
      credit: credit.length,
      student: student.length,
      mortgage: mortgage.length,
      total: freshIds.size,
      removed,
    };
  }

  // Orchestrator: sync everything we know how to sync for one item.
  // options:
  //   accounts: bool (default true) — refresh balances
  //   transactions: { startDate, endDate } | false — false to skip
  //   holdings: bool (default true if products has 'investments')
  //   investmentTransactions: { startDate, endDate } | false
  //   liabilities: bool (default true if products has 'liabilities')
  // Returns a per-stream result so callers (route handler / webhook / cron)
  // can summarize what happened.
  async syncItem(item, options = {}) {
    const accessToken = decrypt(item.access_token);
    const products = item.products || [];
    const hasInvestments = products.includes('investments');
    const hasLiabilities = products.includes('liabilities');
    const result = {
      item_id: item.item_id,
      institution: item.institution_name,
      streams: {},
    };

    if (options.accounts !== false) {
      try {
        result.streams.accounts = await this.syncAccounts(item, accessToken);
      } catch (error) {
        logPlaid('error', 'accounts_sync', {
          item_id: item.item_id,
          ...extractErrorDetails(error),
        });
        result.streams.accounts = { success: false, error: error.message };
      }
    }

    if (options.transactions !== false && products.includes('transactions')) {
      const { startDate, endDate } = options.transactions || this.defaultTransactionDateRange();
      try {
        result.streams.transactions = await this.syncTransactionsForItem(item, accessToken, startDate, endDate);
      } catch (error) {
        logPlaid('error', 'transactions_sync', {
          item_id: item.item_id,
          ...extractErrorDetails(error),
        });
        result.streams.transactions = { success: false, error: error.message };
      }
    }

    if (hasInvestments && options.holdings !== false) {
      try {
        result.streams.holdings = await this.syncHoldings(item, accessToken);
      } catch (error) {
        logPlaid('error', 'holdings_sync', {
          item_id: item.item_id,
          ...extractErrorDetails(error),
        });
        result.streams.holdings = { success: false, error: error.message };
      }
    }

    if (hasInvestments && options.investmentTransactions !== false) {
      const { startDate, endDate } = options.investmentTransactions || this.defaultTransactionDateRange(90);
      try {
        result.streams.investment_transactions = await this.syncInvestmentTransactions(item, accessToken, startDate, endDate);
      } catch (error) {
        logPlaid('error', 'investment_transactions_sync', {
          item_id: item.item_id,
          ...extractErrorDetails(error),
        });
        result.streams.investment_transactions = { success: false, error: error.message };
      }
    }

    if (hasLiabilities && options.liabilities !== false) {
      try {
        result.streams.liabilities = await this.syncLiabilities(item, accessToken);
      } catch (error) {
        logPlaid('error', 'liabilities_sync', {
          item_id: item.item_id,
          ...extractErrorDetails(error),
        });
        result.streams.liabilities = { success: false, error: error.message };
      }
    }

    return result;
  }

  // Default to last 30 days for date-range pulls when caller doesn't specify.
  defaultTransactionDateRange(daysBack = 30) {
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - daysBack);
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: today.toISOString().slice(0, 10),
    };
  }

  // Sync every item for a user via the orchestrator.
  async syncUser(userId, options = {}) {
    const itemsSnapshot = await db.collection('plaid_items')
      .where('user_id', '==', userId)
      .get();

    if (itemsSnapshot.empty) {
      throw new Error('No connected accounts found');
    }

    const results = [];
    for (const itemDoc of itemsSnapshot.docs) {
      results.push(await this.syncItem(itemDoc.data(), options));
    }
    return results;
  }

  // Backward-compat wrapper so the existing /sync-transactions route, webhook
  // handler, and any callers that already depend on this shape keep working.
  // Returns the legacy { institution, added, skipped, success } shape.
  async syncTransactions(userId, startDate, endDate) {
    const itemResults = await this.syncUser(userId, {
      transactions: { startDate, endDate },
    });

    return itemResults.map(r => {
      const t = r.streams.transactions;
      if (!t || t.success === false) {
        return { institution: r.institution, success: false, error: t?.error || 'Unknown error' };
      }
      return {
        institution: r.institution,
        total_fetched: t.total_fetched,
        added: t.added,
        skipped: t.skipped,
        success: true,
      };
    });
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

    // Clean up everything keyed off this item so we don't leave orphans.
    const collections = ['plaid_accounts', 'plaid_holdings', 'plaid_investment_transactions', 'plaid_liabilities'];
    for (const col of collections) {
      const snap = await db.collection(col)
        .where('user_id', '==', userId)
        .where('item_id', '==', itemId)
        .get();
      if (snap.empty) continue;
      const batch = db.batch();
      snap.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }

    return true;
  }

  // Flat liability list joined with account details (institution / mask / name).
  async getLiabilitiesForUser(userId) {
    const [liabSnap, acctSnap] = await Promise.all([
      db.collection('plaid_liabilities').where('user_id', '==', userId).get(),
      db.collection('plaid_accounts').where('user_id', '==', userId).get(),
    ]);

    const accountByAccountId = new Map(acctSnap.docs.map(d => [d.data().account_id, d.data()]));

    return liabSnap.docs.map(doc => {
      const l = doc.data();
      const a = accountByAccountId.get(l.account_id) || {};
      return {
        id: doc.id,
        kind: l.kind,
        account_id: l.account_id,
        institution_name: a.institution_name || '',
        account_name: a.name || a.official_name || '',
        account_subtype: a.subtype || '',
        mask: a.mask || '',
        balance: l.balance,
        apr: l.apr,
        min_payment_amount: l.min_payment_amount,
        next_payment_due_date: l.next_payment_due_date,
        last_payment_amount: l.last_payment_amount,
        last_payment_date: l.last_payment_date,
        last_statement_balance: l.last_statement_balance,
        last_statement_issue_date: l.last_statement_issue_date,
        origination_date: l.origination_date,
        maturity_date: l.maturity_date,
        is_overdue: l.is_overdue,
        loan_name: l.loan_name || null,
        loan_type: l.loan_type || null,
        ytd_interest_paid: l.ytd_interest_paid ?? null,
        ytd_principal_paid: l.ytd_principal_paid ?? null,
        updated_at: l.updated_at,
      };
    });
  }

  // Flat per-account list for AccountSnapshot and the dashboard.
  async getAccountsForUser(userId) {
    const snapshot = await db.collection('plaid_accounts')
      .where('user_id', '==', userId)
      .get();
    return snapshot.docs.map(doc => {
      const d = doc.data();
      return {
        id: doc.id,
        item_id: d.item_id,
        account_id: d.account_id,
        institution_name: d.institution_name,
        name: d.name,
        official_name: d.official_name,
        mask: d.mask,
        type: d.type,
        subtype: d.subtype,
        balance_current: d.balance_current,
        balance_available: d.balance_available,
        balance_limit: d.balance_limit,
        iso_currency_code: d.iso_currency_code,
        updated_at: d.updated_at,
      };
    });
  }

  // Look up the user_id that owns a given Plaid item_id
  async getUserIdByItemId(itemId) {
    const snapshot = await db.collection('plaid_items')
      .where('item_id', '==', itemId)
      .limit(1)
      .get();
    if (snapshot.empty) return null;
    return snapshot.docs[0].data().user_id;
  }

  // Delete expense rows for a list of Plaid transaction ids (used by TRANSACTIONS_REMOVED webhook)
  async removeTransactionsByPlaidIds(itemId, plaidTransactionIds) {
    if (!Array.isArray(plaidTransactionIds) || plaidTransactionIds.length === 0) return 0;

    let removed = 0;
    // Firestore `in` queries cap at 30 ids
    for (let i = 0; i < plaidTransactionIds.length; i += 30) {
      const chunk = plaidTransactionIds.slice(i, i + 30);
      const snapshot = await db.collection('expenses')
        .where('plaid_item_id', '==', itemId)
        .where('plaid_transaction_id', 'in', chunk)
        .get();

      if (snapshot.empty) continue;
      const batch = db.batch();
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      removed += snapshot.size;
    }

    logPlaid('info', 'transactions_removed', {
      item_id: itemId,
      message: `Removed ${removed} expenses for ${plaidTransactionIds.length} Plaid txn ids`,
    });
    return removed;
  }

  // Iterate every connected user and run the full sync orchestrator.
  // Used by the scheduled fallback in server.js so we catch up on anything a
  // missed webhook left behind: balances, transactions, holdings, investment
  // transactions (and later: liabilities).
  async syncAllUsers(daysBack = 30) {
    const itemsSnapshot = await db.collection('plaid_items').get();
    if (itemsSnapshot.empty) return { users: 0, results: [] };

    const userIds = new Set();
    itemsSnapshot.docs.forEach(doc => userIds.add(doc.data().user_id));

    const range = this.defaultTransactionDateRange(daysBack);

    const results = [];
    for (const userId of userIds) {
      try {
        const r = await this.syncUser(userId, { transactions: range });
        results.push({ user_id: userId, success: true, items: r });
      } catch (error) {
        logPlaid('error', 'scheduled_sync_user', { message: `user ${userId}: ${error.message}` });
        results.push({ user_id: userId, success: false, error: error.message });
      }
    }
    return { users: userIds.size, results };
  }
}

module.exports = new PlaidService();
