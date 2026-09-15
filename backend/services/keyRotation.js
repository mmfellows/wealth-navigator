// Encryption-key rotation for secrets stored in Firestore.
//
// Every encrypted field lives in one of the collections below. `audit` reports
// which configured key can read each row without writing anything; `rotate`
// re-encrypts rows that are not yet under the write key and stamps
// `encryption_key_id` so the state is visible without decrypting.

const { db } = require('./database');
const encryption = require('./encryption');

const ENCRYPTED_FIELDS = [
  { collection: 'plaid_items', fields: ['access_token'], label: (d) => d.institution_name || d.item_id || '?' },
  { collection: 'etrade_keys', fields: ['consumer_key', 'consumer_secret'], label: (d) => d.user_id || '?' },
];

async function forEachEncryptedDoc(fn) {
  for (const spec of ENCRYPTED_FIELDS) {
    const snap = await db.collection(spec.collection).get();
    for (const doc of snap.docs) {
      await fn(spec, doc);
    }
  }
}

// Read-only. One entry per encrypted field per document.
async function auditStoredSecrets() {
  const rows = [];
  await forEachEncryptedDoc(async (spec, doc) => {
    const data = doc.data();
    for (const field of spec.fields) {
      if (!data[field]) continue;
      rows.push({
        collection: spec.collection,
        label: spec.label(data),
        field,
        readable_with: encryption.readableWith(data[field]),
        encryption_key_id: data.encryption_key_id || null,
      });
    }
  });
  return {
    write_key_id: encryption.writeKeyId,
    current_key_id: encryption.currentKeyId,
    next_key_id: encryption.nextKeyId,
    rows,
  };
}

// Re-encrypts every readable row under the write key. Rows no configured key
// can read are left untouched and reported, never overwritten.
async function rotateStoredSecrets() {
  const summary = { write_key_id: encryption.writeKeyId, rotated: 0, already_current: 0, unreadable: [], errors: [] };
  await forEachEncryptedDoc(async (spec, doc) => {
    const data = doc.data();
    const update = {};
    let rotatedAny = false;
    for (const field of spec.fields) {
      if (!data[field]) continue;
      try {
        const r = encryption.reencrypt(data[field]);
        if (r.rotated) { update[field] = r.value; rotatedAny = true; }
      } catch (err) {
        summary.unreadable.push({ collection: spec.collection, label: spec.label(data), field });
        return; // never partially rewrite a doc we cannot fully read
      }
    }
    const stampMissing = data.encryption_key_id !== encryption.writeKeyId;
    if (!rotatedAny && !stampMissing) { summary.already_current++; return; }
    update.encryption_key_id = encryption.writeKeyId;
    if (rotatedAny) update.encryption_rotated_at = new Date().toISOString();
    try {
      await doc.ref.update(update);
      if (rotatedAny) summary.rotated++; else summary.already_current++;
    } catch (err) {
      summary.errors.push({ collection: spec.collection, label: spec.label(data), error: err.message });
    }
  });
  return summary;
}

module.exports = { auditStoredSecrets, rotateStoredSecrets };
