const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://your-domain.com']
    : ['http://localhost:3000'],
  credentials: true
}));
app.use(morgan('combined'));
// Increase body size limit to handle large CSV imports (50MB)
app.use(express.json({ limit: '50mb' }));
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

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
  console.log(`🔗 Frontend URL: http://localhost:3000`);
});