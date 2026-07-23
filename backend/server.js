const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
// Always load backend/.env regardless of cwd. On Vercel, env vars come from the
// platform and this file simply doesn't exist (dotenv silently no-ops).
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());

// CORS: in production, allow same-origin (Vercel serves frontend + API on the same domain)
// plus any explicit origins from CORS_ORIGINS (comma-separated). In dev, allow Vite at :3000.
const prodOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? (prodOrigins.length ? prodOrigins : true)
    : ['http://localhost:3000'],
  credentials: true,
}));

app.use(morgan('combined'));
// Increase body size limit to handle large CSV imports (50MB).
// `verify` stashes the raw request body on req.rawBody so signed-webhook
// handlers (e.g. Plaid) can compute a SHA-256 of the exact bytes that were
// signed. Without this, JSON.stringify(req.body) would not match because of
// key ordering and whitespace differences.
app.use(express.json({
  limit: '50mb',
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Rate limiting - increased for development
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000 // limit each IP to 1000 requests per windowMs (increased for dev)
});
app.use(limiter);


// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/portfolio', require('./routes/portfolio'));
app.use('/api/investments', require('./routes/investments'));
app.use('/api/trades', require('./routes/trades'));
app.use('/api/ideas', require('./routes/ideas'));
app.use('/api/stocks', require('./routes/stocks'));
app.use('/api/research', require('./routes/research'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/plaid', require('./routes/plaid'));
app.use('/api/ips', require('./routes/ips'));
app.use('/api/etrade', require('./routes/etrade'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/carrots', require('./routes/carrots'));
app.use('/api/budgets', require('./routes/budgets'));
app.use('/api/bets', require('./routes/bets'));
app.use('/api/options', require('./routes/options'));
app.use('/api/snapshot', require('./routes/snapshot'));
app.use('/api/internal', require('./routes/internal'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Something went wrong!'
      : err.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Only start an HTTP listener and the scheduler when running directly (local dev).
// On Vercel the file is required as a module by api/index.js; the platform handles HTTP,
// and Vercel Cron triggers the scheduled sync via /api/internal/sync-all.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV}`);
    console.log(`🔗 Frontend URL: http://localhost:3000`);

    const intervalHours = Number(process.env.PLAID_SYNC_INTERVAL_HOURS ?? 6);
    if (intervalHours > 0 && process.env.PLAID_CLIENT_ID && process.env.PLAID_CLIENT_ID !== 'demo_client_id') {
      const plaidService = require('./services/plaidService');
      const { writeAllBalanceSnapshots } = require('./services/snapshotService');
      const runScheduledSync = async () => {
        try {
          const { users, results } = await plaidService.syncAllUsers(30);
          const ok = results.filter(r => r.success).length;
          console.log(`[Plaid scheduler] Synced ${ok}/${users} users`);
          const snap = await writeAllBalanceSnapshots();
          console.log(`[Plaid scheduler] Wrote ${snap.users} balance snapshots`);
        } catch (err) {
          console.error('[Plaid scheduler] failed:', err.message);
        }
      };
      setInterval(runScheduledSync, intervalHours * 60 * 60 * 1000);
      console.log(`⏰ Plaid scheduled sync every ${intervalHours}h`);
    }
  });
}

module.exports = app;
