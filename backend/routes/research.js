const express = require('express');
const { db } = require('../services/database');
const { optionalAuth } = require('../middleware/auth');
const aiResearch = require('../services/aiResearchService');

const router = express.Router();

// Submit research query — answered by Claude with the user's live portfolio
// (snapshot + active bets) as context. Optional `history` carries prior
// {role, content} turns so the UI can hold a conversation.
router.post('/query', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { query, history } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    if (!aiResearch.isConfigured()) {
      return res.status(503).json({
        error: 'AI research is not configured',
        detail: 'Set ANTHROPIC_API_KEY in backend/.env (get a key at https://platform.claude.com), then restart the backend.',
      });
    }

    const response = await aiResearch.answerQuery(
      userId,
      query,
      Array.isArray(history) ? history : [],
    );

    await db.collection('research_queries').add({
      user_id: userId,
      query,
      response,
      model: aiResearch.MODEL,
      created_at: new Date().toISOString(),
    });

    res.json({
      query,
      response,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error processing research query:', error);
    res.status(500).json({ error: 'Failed to process research query' });
  }
});

// Get research history
router.get('/history', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 20 } = req.query;

    const snapshot = await db.collection('research_queries')
      .where('user_id', '==', userId)
      .orderBy('created_at', 'desc')
      .limit(parseInt(limit))
      .get();

    const queries = snapshot.docs.map(doc => {
      const data = doc.data();
      return { query: data.query, response: data.response, created_at: data.created_at };
    });

    res.json(queries);
  } catch (error) {
    console.error('Error fetching research history:', error);
    res.status(500).json({ error: 'Failed to fetch research history' });
  }
});

module.exports = router;
