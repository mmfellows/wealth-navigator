// Vercel serverless entrypoint. Loads the Express app from backend/server.js
// and lets Vercel's runtime handle the HTTP layer.
require('dotenv').config();
const app = require('../backend/server');
module.exports = app;
