const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin. Resolution order:
// 1. FIREBASE_SERVICE_ACCOUNT — JSON-stringified service account (Vercel / production).
// 2. GOOGLE_APPLICATION_CREDENTIALS — file path env var.
// 3. backend/serviceAccountKey.json — local dev fallback.
// 4. applicationDefault() — for Cloud Run, GCE, etc.
let initialized = false;

if (!admin.apps.length) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      initialized = true;
    } catch (err) {
      console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT env var:', err.message);
    }
  }

  if (!initialized) {
    const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
      || path.join(__dirname, '..', 'serviceAccountKey.json');
    try {
      const serviceAccount = require(serviceAccountPath);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      initialized = true;
    } catch (err) {
      try {
        admin.initializeApp({ credential: admin.credential.applicationDefault() });
        initialized = true;
      } catch (err2) {
        console.error('Firebase initialization failed. Set FIREBASE_SERVICE_ACCOUNT, GOOGLE_APPLICATION_CREDENTIALS, or place serviceAccountKey.json in backend/');
        console.error(err2.message);
      }
    }
  }
} else {
  initialized = true;
}

const db = initialized ? admin.firestore() : null;

module.exports = { admin, db };
