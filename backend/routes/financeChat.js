// Personal-finance chat routes. POST /query streams the answer as
// Server-Sent Events (works on Vercel's Node runtime); GET /history
// returns persisted turns.

const express = require('express');
const financeChat = require('../services/financeChatService');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

router.use(optionalAuth);

router.post('/query', async (req, res) => {
  const { query, history } = req.body || {};

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'query is required' });
  }
  if (!financeChat.isConfigured()) {
    return res.status(503).json({
      error: 'AI chat is not configured.',
      detail: 'Set ANTHROPIC_API_KEY in backend/.env to enable the finance chat.',
    });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    const response = await financeChat.answerQueryStream(
      req.user.id,
      query,
      Array.isArray(history) ? history : [],
      send,
    );
    send({ type: 'done', response });
  } catch (error) {
    console.error('Finance chat error:', error);
    send({ type: 'error', message: 'The request failed. Please try again.' });
  } finally {
    res.end();
  }
});

router.get('/history', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const history = await financeChat.getHistory(req.user.id, limit);
    res.json(history);
  } catch (error) {
    console.error('Error fetching finance chat history:', error);
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

module.exports = router;
