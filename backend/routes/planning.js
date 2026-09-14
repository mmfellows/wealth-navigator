// Planner routes. POST /query streams a planning-chat turn as Server-Sent
// Events (text deltas, tool activity, scenario chart payloads); the rest
// manage persisted conversations, the planning baseline and the profile.

const express = require('express');
const planning = require('../services/planningChatService');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

router.use(optionalAuth);

router.post('/query', async (req, res) => {
  const { query, conversation_id: conversationId } = req.body || {};

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'query is required' });
  }
  if (!planning.isConfigured()) {
    return res.status(503).json({
      error: 'AI planning is not configured.',
      detail: 'Set ANTHROPIC_API_KEY in backend/.env to enable the planner.',
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
    const result = await planning.answerQueryStream(
      req.user.id,
      query,
      typeof conversationId === 'string' ? conversationId : null,
      send,
    );
    send({ type: 'done', response: result.response, conversation_id: result.conversation_id });
  } catch (error) {
    console.error('Planning chat error:', error);
    send({ type: 'error', message: 'The request failed. Please try again.' });
  } finally {
    res.end();
  }
});

router.get('/conversations', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    res.json(await planning.listConversations(req.user.id, limit));
  } catch (error) {
    console.error('Error listing planning conversations:', error);
    res.status(500).json({ error: 'Failed to list conversations' });
  }
});

router.get('/conversations/:id', async (req, res) => {
  try {
    const conversation = await planning.getConversation(req.user.id, req.params.id);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    res.json(conversation);
  } catch (error) {
    console.error('Error loading planning conversation:', error);
    res.status(500).json({ error: 'Failed to load conversation' });
  }
});

router.delete('/conversations/:id', async (req, res) => {
  try {
    const removed = await planning.deleteConversation(req.user.id, req.params.id);
    if (!removed) return res.status(404).json({ error: 'Conversation not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting planning conversation:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

router.get('/baseline', async (req, res) => {
  try {
    res.json(await planning.buildBaseline(req.user.id));
  } catch (error) {
    console.error('Error building planning baseline:', error);
    res.status(500).json({ error: 'Failed to build planning baseline' });
  }
});

router.get('/profile', async (req, res) => {
  try {
    res.json(await planning.getProfile(req.user.id));
  } catch (error) {
    console.error('Error loading planning profile:', error);
    res.status(500).json({ error: 'Failed to load planning profile' });
  }
});

router.put('/profile', async (req, res) => {
  try {
    res.json(await planning.saveProfile(req.user.id, req.body || {}));
  } catch (error) {
    console.error('Error saving planning profile:', error);
    res.status(500).json({ error: 'Failed to save planning profile' });
  }
});

router.get('/risk-profiles', (_req, res) => {
  res.json(planning.RISK_PROFILES);
});

module.exports = router;
