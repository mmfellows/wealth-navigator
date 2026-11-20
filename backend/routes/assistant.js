// The always-available assistant (see services/assistantService.js).
// POST /query streams the answer as Server-Sent Events.

const express = require('express');
const assistant = require('../services/assistantService');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

router.use(optionalAuth);

router.post('/query', async (req, res) => {
  const { query, history, page } = req.body || {};

  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: 'query is required' });
  }
  if (query.length > 8000) {
    return res.status(400).json({ error: 'That message is too long. Shorten it and try again.' });
  }
  if (!assistant.isConfigured()) {
    return res.status(503).json({ error: 'The assistant is not configured.', detail: 'Set ANTHROPIC_API_KEY to enable it.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);

  try {
    const result = await assistant.answerStream(
      req.user.id,
      query.trim(),
      Array.isArray(history) ? history : [],
      typeof page === 'string' ? page.slice(0, 80) : null,
      send,
    );
    send({ type: 'done', response: result.response, sources: result.sources });
  } catch (error) {
    console.error('Assistant error:', error);
    send({ type: 'error', message: 'That request failed. Please try again.' });
  } finally {
    res.end();
  }
});

module.exports = router;
