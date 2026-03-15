// Firestore-backed database service
// Drop-in replacement for the old SQLite database module.
// Collections mirror the old table names.

const { db } = require('./firestore');
const { FieldValue } = require('firebase-admin/firestore');

if (!db) {
  throw new Error('Firestore not initialized. Check your Firebase credentials.');
}

// Helper: convert Firestore doc to a plain object with `id` field
function docToObj(doc) {
  if (!doc.exists) return null;
  const data = doc.data();
  // Convert Firestore Timestamps to ISO strings
  for (const [key, val] of Object.entries(data)) {
    if (val && typeof val.toDate === 'function') {
      data[key] = val.toDate().toISOString();
    }
  }
  return { id: doc.id, ...data };
}

module.exports = { db, FieldValue, docToObj };
