const express = require('express');
const router = express.Router();
const { db, docToObj } = require('../services/database');

// Get all carrots with optional filtering
router.get('/', async (req, res) => {
  try {
    const {
      is_purchased,
      is_goal_completed,
      priority,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;

    let query = db.collection('carrots');

    if (is_purchased !== undefined) {
      query = query.where('is_purchased', '==', is_purchased === 'true');
    }

    if (is_goal_completed !== undefined) {
      query = query.where('is_goal_completed', '==', is_goal_completed === 'true');
    }

    if (priority) {
      query = query.where('priority', '==', priority);
    }

    const allowedSortColumns = ['created_at', 'item_name', 'priority', 'estimated_cost'];
    const col = allowedSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const dir = sortOrder.toUpperCase() === 'ASC' ? 'asc' : 'desc';
    query = query.orderBy(col, dir);

    const snapshot = await query.get();
    const carrots = snapshot.docs.map(docToObj);

    res.json({ carrots });
  } catch (error) {
    console.error('Error fetching carrots:', error);
    res.status(500).json({ error: 'Failed to fetch carrots' });
  }
});

// Get carrot by ID
router.get('/:id', async (req, res) => {
  try {
    const doc = await db.collection('carrots').doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Carrot not found' });
    }
    res.json(docToObj(doc));
  } catch (error) {
    console.error('Error fetching carrot:', error);
    res.status(500).json({ error: 'Failed to fetch carrot' });
  }
});

// Create new carrot
router.post('/', async (req, res) => {
  try {
    const {
      item_name,
      goal_description,
      estimated_cost,
      priority = 'medium',
      notes
    } = req.body;

    if (!item_name || !goal_description) {
      return res.status(400).json({
        error: 'Missing required fields: item_name and goal_description are required'
      });
    }

    if (priority && !['low', 'medium', 'high'].includes(priority)) {
      return res.status(400).json({
        error: 'Priority must be one of: low, medium, high'
      });
    }

    const data = {
      item_name,
      goal_description,
      estimated_cost: estimated_cost || null,
      priority,
      notes: notes || null,
      is_purchased: false,
      is_goal_completed: false,
      purchased_date: null,
      goal_completed_date: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const ref = await db.collection('carrots').add(data);

    res.status(201).json({
      id: ref.id,
      message: 'Carrot created successfully'
    });
  } catch (error) {
    console.error('Error creating carrot:', error);
    res.status(500).json({ error: 'Failed to create carrot' });
  }
});

// Update carrot
router.put('/:id', async (req, res) => {
  try {
    const {
      item_name,
      goal_description,
      estimated_cost,
      is_purchased,
      is_goal_completed,
      priority,
      notes
    } = req.body;

    const doc = await db.collection('carrots').doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Carrot not found' });
    }

    if (priority && !['low', 'medium', 'high'].includes(priority)) {
      return res.status(400).json({
        error: 'Priority must be one of: low, medium, high'
      });
    }

    const updateData = { updated_at: new Date().toISOString() };

    if (item_name !== undefined) updateData.item_name = item_name;
    if (goal_description !== undefined) updateData.goal_description = goal_description;
    if (estimated_cost !== undefined) updateData.estimated_cost = estimated_cost;
    if (priority !== undefined) updateData.priority = priority;
    if (notes !== undefined) updateData.notes = notes;

    if (is_purchased !== undefined) {
      updateData.is_purchased = !!is_purchased;
      if (is_purchased) {
        updateData.purchased_date = new Date().toISOString();
      }
    }

    if (is_goal_completed !== undefined) {
      updateData.is_goal_completed = !!is_goal_completed;
      if (is_goal_completed) {
        updateData.goal_completed_date = new Date().toISOString();
      }
    }

    await db.collection('carrots').doc(req.params.id).update(updateData);

    res.json({ message: 'Carrot updated successfully' });
  } catch (error) {
    console.error('Error updating carrot:', error);
    res.status(500).json({ error: 'Failed to update carrot' });
  }
});

// Delete carrot
router.delete('/:id', async (req, res) => {
  try {
    const doc = await db.collection('carrots').doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Carrot not found' });
    }

    await db.collection('carrots').doc(req.params.id).delete();
    res.json({ message: 'Carrot deleted successfully' });
  } catch (error) {
    console.error('Error deleting carrot:', error);
    res.status(500).json({ error: 'Failed to delete carrot' });
  }
});

// Get statistics
router.get('/stats/summary', async (req, res) => {
  try {
    const snapshot = await db.collection('carrots').get();
    const carrots = snapshot.docs.map(doc => doc.data());

    const stats = {
      total: carrots.length,
      purchased_count: carrots.filter(c => c.is_purchased).length,
      goals_completed: carrots.filter(c => c.is_goal_completed).length,
      ready_to_buy: carrots.filter(c => c.is_goal_completed && !c.is_purchased).length,
      total_estimated_cost: carrots.reduce((sum, c) => sum + (c.estimated_cost || 0), 0),
    };

    res.json(stats);
  } catch (error) {
    console.error('Error fetching carrot stats:', error);
    res.status(500).json({ error: 'Failed to fetch carrot statistics' });
  }
});

module.exports = router;
