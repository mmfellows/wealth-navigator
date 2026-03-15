const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin
// Option 1: Use service account key file (set GOOGLE_APPLICATION_CREDENTIALS env var)
// Option 2: Place serviceAccountKey.json in backend/
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  || path.join(__dirname, '..', 'serviceAccountKey.json');

let initialized = false;

try {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  initialized = true;
} catch (err) {
  // Fallback: try default credentials (for Cloud Run, GCE, etc.)
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
    initialized = true;
  } catch (err2) {
    console.error('Firebase initialization failed. Set GOOGLE_APPLICATION_CREDENTIALS or place serviceAccountKey.json in backend/');
    console.error(err2.message);
  }
}

const db = initialized ? admin.firestore() : null;

module.exports = { admin, db };
