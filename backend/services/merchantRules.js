// Merchant rules: learned merchant → category mappings.
//
// A rule is created whenever the user categorizes a merchant (answering a
// review question or editing directly), and consulted at sync time so the
// same merchant is never asked about twice. Precedence lives with callers:
// manual > merchant rule > Plaid rule > AI.
//
// Doc id = normalized merchant key, so upserts are idempotent per merchant.

const { db } = require('./database');

// Payment-processor / wallet prefixes that hide the real merchant.
const PROCESSOR_PREFIXES = /^(APLPAY\s+|APPLE\s*PAY\s+|GOOGLE\s*PAY\s+|TST\*?\s*|SQ\s*\*\s*|SP\s+|PAYPAL\s*\*\s*|PP\*\s*|VENMO\s*\*?\s*|CASH\s*APP\s*\*?\s*|CKE\*?\s*|DD\s+DOORDASH\s+)/;

// Normalize a raw merchant/description string into a stable key:
// uppercase, processor prefixes stripped, store/reference numbers dropped,
// punctuation collapsed. "AplPay TST BRDWY 447" and "TST* BRDWY #447"
// both become "BRDWY".
function normalizeMerchant(name) {
  if (!name) return '';
  let key = String(name).toUpperCase().replace(/\s+/g, ' ').trim();
  // Strip processor prefixes repeatedly (e.g. "APLPAY TST* ...").
  let prev;
  do {
    prev = key;
    key = key.replace(PROCESSOR_PREFIXES, '');
  } while (key !== prev);
  key = key
    .replace(/[#*]/g, ' ')          // reference markers
    .replace(/\b\d{3,}\b/g, ' ')    // store numbers, phone fragments, refs
    .replace(/\b(?=[A-Z0-9]*\d[A-Z0-9]*\d)[A-Z0-9]+\b/g, ' ') // mixed refs (RT4Y67), but keep 7ELEVEN
    .replace(/[^A-Z0-9&' ]/g, ' ')  // stray punctuation
    .replace(/\s+/g, ' ')
    .trim();
  return key;
}

// Firestore doc ids can't contain '/'; keep ids bounded.
function ruleDocId(normalizedKey) {
  return normalizedKey.replace(/\//g, '_').slice(0, 500);
}

// Load all rules as a Map of normalized key → { category, subcategory }.
async function loadMerchantRules() {
  const snapshot = await db.collection('merchant_rules').get();
  const rules = new Map();
  snapshot.docs.forEach(doc => {
    const d = doc.data();
    if (d.merchant_key) rules.set(d.merchant_key, d);
  });
  return rules;
}

function lookupMerchantRule(rules, merchantName) {
  const key = normalizeMerchant(merchantName);
  if (!key) return null;
  return rules.get(key) || null;
}

async function upsertMerchantRule({ merchant, category, subcategory, userId, source }) {
  const key = normalizeMerchant(merchant);
  if (!key || !category) return null;
  const now = new Date().toISOString();
  const ref = db.collection('merchant_rules').doc(ruleDocId(key));
  const existing = await ref.get();
  await ref.set({
    merchant_key: key,
    sample_merchant: merchant,
    category,
    subcategory: subcategory || null,
    user_id: userId || null,
    source: source || 'manual',
    created_at: existing.exists ? existing.data().created_at : now,
    updated_at: now,
  });
  return key;
}

async function deleteMerchantRule(merchantKey) {
  await db.collection('merchant_rules').doc(ruleDocId(merchantKey)).delete();
}

module.exports = {
  normalizeMerchant,
  loadMerchantRules,
  lookupMerchantRule,
  upsertMerchantRule,
  deleteMerchantRule,
};
