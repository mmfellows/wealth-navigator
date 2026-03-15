const express = require('express');
const { db, docToObj } = require('../services/database');
const { optionalAuth } = require('../middleware/auth');
const { encrypt, decrypt } = require('../services/encryption');

const router = express.Router();


// Get user settings
router.get('/', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const doc = await db.collection('settings').doc(userId).get();

    if (!doc.exists) {
      // Create default settings
      const defaults = {
        user_id: userId,
        target_low_risk: 30,
        target_growth: 60,
        target_speculative: 10,
        updated_at: new Date().toISOString(),
      };
      await db.collection('settings').doc(userId).set(defaults);

      return res.json({
        targetAllocations: {
          lowRisk: defaults.target_low_risk,
          growth: defaults.target_growth,
          speculative: defaults.target_speculative
        }
      });
    }

    const settings = doc.data();
    res.json({
      targetAllocations: {
        lowRisk: settings.target_low_risk,
        growth: settings.target_growth,
        speculative: settings.target_speculative
      }
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update user settings
router.put('/', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { targetAllocations } = req.body;

    if (!targetAllocations) {
      return res.status(400).json({ error: 'Target allocations are required' });
    }

    const { lowRisk, growth, speculative } = targetAllocations;

    if (typeof lowRisk !== 'number' || typeof growth !== 'number' || typeof speculative !== 'number') {
      return res.status(400).json({ error: 'All allocation percentages must be numbers' });
    }

    if (lowRisk < 0 || growth < 0 || speculative < 0) {
      return res.status(400).json({ error: 'Allocation percentages cannot be negative' });
    }

    if (lowRisk + growth + speculative !== 100) {
      return res.status(400).json({ error: 'Allocation percentages must sum to 100' });
    }

    await db.collection('settings').doc(userId).set({
      user_id: userId,
      target_low_risk: lowRisk,
      target_growth: growth,
      target_speculative: speculative,
      updated_at: new Date().toISOString(),
    }, { merge: true });

    res.json({
      targetAllocations: { lowRisk, growth, speculative }
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Get platform connections (mock for demo)
router.get('/platforms', optionalAuth, async (req, res) => {
  try {
    res.json([
      {
        name: 'E*Trade',
        status: 'connected',
        lastSync: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      },
      {
        name: 'Charles Schwab',
        status: 'connected',
        lastSync: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()
      },
      {
        name: 'Chase Investment',
        status: 'disconnected',
        lastSync: null
      }
    ]);
  } catch (error) {
    console.error('Error fetching platform status:', error);
    res.status(500).json({ error: 'Failed to fetch platform status' });
  }
});

// Connect/disconnect platform (mock for demo)
router.post('/platforms/:platform/:action', optionalAuth, async (req, res) => {
  try {
    const { platform, action } = req.params;

    if (!['connect', 'disconnect'].includes(action)) {
      return res.status(400).json({ error: 'Action must be connect or disconnect' });
    }

    res.json({
      platform,
      status: action === 'connect' ? 'connected' : 'disconnected',
      message: `Successfully ${action}ed ${platform}`
    });
  } catch (error) {
    console.error('Error updating platform connection:', error);
    res.status(500).json({ error: 'Failed to update platform connection' });
  }
});

// Save ETrade API keys
router.post('/etrade-keys', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { consumerKey, consumerSecret, sandboxMode } = req.body;

    if (!consumerKey || !consumerSecret) {
      return res.status(400).json({
        success: false,
        message: 'Consumer key and secret are required'
      });
    }

    const encryptedKey = encrypt(consumerKey);
    const encryptedSecret = encrypt(consumerSecret);

    await db.collection('etrade_keys').doc(userId).set({
      user_id: userId,
      consumer_key: encryptedKey,
      consumer_secret: encryptedSecret,
      sandbox_mode: !!sandboxMode,
      updated_at: new Date().toISOString(),
    }, { merge: true });

    res.json({
      success: true,
      message: 'ETrade API keys saved successfully'
    });
  } catch (error) {
    console.error('Error saving ETrade keys:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save ETrade API keys',
      error: error.message
    });
  }
});

// Get ETrade API keys
router.get('/etrade-keys', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const doc = await db.collection('etrade_keys').doc(userId).get();

    if (!doc.exists) {
      return res.json({ success: true, keys: null });
    }

    const keys = doc.data();
    res.json({
      success: true,
      keys: {
        consumerKey: decrypt(keys.consumer_key),
        consumerSecret: decrypt(keys.consumer_secret),
        sandboxMode: keys.sandbox_mode
      }
    });
  } catch (error) {
    console.error('Error loading ETrade keys:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load ETrade API keys',
      error: error.message
    });
  }
});

// Delete ETrade API keys
router.delete('/etrade-keys', optionalAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    await db.collection('etrade_keys').doc(userId).delete();

    res.json({
      success: true,
      message: 'ETrade API keys deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting ETrade keys:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete ETrade API keys',
      error: error.message
    });
  }
});

// =====================
// Budget Category Order
// =====================

// Get saved budget category display order
router.get('/budget-category-order', async (req, res) => {
  try {
    const doc = await db.collection('settings').doc('budget_category_order').get();
    res.json({ order: doc.exists ? doc.data().order : [] });
  } catch (error) {
    console.error('Error fetching budget category order:', error);
    res.status(500).json({ error: 'Failed to fetch budget category order' });
  }
});

// Save budget category display order
router.put('/budget-category-order', async (req, res) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order)) {
      return res.status(400).json({ error: 'order must be an array' });
    }
    await db.collection('settings').doc('budget_category_order').set({ order, updated_at: new Date().toISOString() });
    res.json({ order });
  } catch (error) {
    console.error('Error saving budget category order:', error);
    res.status(500).json({ error: 'Failed to save budget category order' });
  }
});

// =====================
// Budget Categories CRUD
// =====================

// Get all categories (grouped by main category)
router.get('/categories', async (req, res) => {
  try {
    const snapshot = await db.collection('budget_categories')
      .orderBy('sort_order')
      .get();

    const grouped = {};
    const mainOrder = [];

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (!grouped[data.main_category]) {
        grouped[data.main_category] = [];
        mainOrder.push(data.main_category);
      }
      grouped[data.main_category].push({
        id: doc.id,
        name: data.sub_category,
        sortOrder: data.sort_order,
      });
    });

    res.json({ categories: grouped, mainCategoryOrder: mainOrder, raw: snapshot.docs.map(docToObj) });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Add a subcategory to a main category
router.post('/categories', async (req, res) => {
  try {
    const { mainCategory, subCategory } = req.body;
    if (!mainCategory || !subCategory) {
      return res.status(400).json({ error: 'mainCategory and subCategory are required' });
    }

    // Check for duplicate
    const existing = await db.collection('budget_categories')
      .where('main_category', '==', mainCategory)
      .where('sub_category', '==', subCategory)
      .limit(1)
      .get();

    if (!existing.empty) {
      return res.status(409).json({ error: 'This category/subcategory combination already exists' });
    }

    // Get max sort order
    const allDocs = await db.collection('budget_categories')
      .orderBy('sort_order', 'desc')
      .limit(1)
      .get();
    const maxSort = allDocs.empty ? -1 : (allDocs.docs[0].data().sort_order || 0);

    await db.collection('budget_categories').add({
      main_category: mainCategory,
      sub_category: subCategory,
      sort_order: maxSort + 1,
      created_at: new Date().toISOString(),
    });

    res.status(201).json({ message: 'Category added' });
  } catch (error) {
    console.error('Error adding category:', error);
    res.status(500).json({ error: 'Failed to add category' });
  }
});

// Rename a main category
router.put('/categories/rename-main', async (req, res) => {
  try {
    const { oldName, newName } = req.body;
    if (!oldName || !newName) {
      return res.status(400).json({ error: 'oldName and newName are required' });
    }

    // Update budget_categories
    const snapshot = await db.collection('budget_categories')
      .where('main_category', '==', oldName)
      .get();

    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.update(doc.ref, { main_category: newName });
    });

    // Cascade to budget_items
    const itemsSnapshot = await db.collection('budget_items')
      .where('mainCategory', '==', oldName)
      .get();
    itemsSnapshot.docs.forEach(doc => {
      batch.update(doc.ref, { mainCategory: newName });
    });

    await batch.commit();

    res.json({ message: 'Main category renamed' });
  } catch (error) {
    console.error('Error renaming main category:', error);
    res.status(500).json({ error: 'Failed to rename main category' });
  }
});

// Update a subcategory
router.put('/categories/:id', async (req, res) => {
  try {
    const { subCategory, mainCategory } = req.body;
    const updateData = {};

    if (subCategory !== undefined) updateData.sub_category = subCategory;
    if (mainCategory !== undefined) updateData.main_category = mainCategory;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    // Get the old values before updating
    const catDoc = await db.collection('budget_categories').doc(req.params.id).get();
    if (!catDoc.exists) {
      return res.status(404).json({ error: 'Category not found' });
    }
    const oldData = catDoc.data();

    await db.collection('budget_categories').doc(req.params.id).update(updateData);

    // Cascade subcategory rename to budget_items
    if (subCategory !== undefined && oldData.sub_category !== subCategory) {
      const oldSub = oldData.sub_category;
      const itemsSnapshot = await db.collection('budget_items')
        .where('mainCategory', '==', oldData.main_category)
        .where('secondaryCategory', '==', oldSub)
        .get();

      const batch = db.batch();
      itemsSnapshot.docs.forEach(doc => {
        const item = doc.data();
        const updates = { secondaryCategory: subCategory };
        // Rename the General item to match new subcategory name
        const nameLower = (item.itemName || '').toLowerCase();
        if (nameLower === `${oldSub.toLowerCase()} general` || nameLower === `${oldSub.toLowerCase()} (general)`) {
          updates.itemName = `${subCategory} General`;
        }
        batch.update(doc.ref, updates);
      });
      await batch.commit();
    }

    // Cascade main category change to budget_items
    if (mainCategory !== undefined && oldData.main_category !== mainCategory) {
      const itemsSnapshot = await db.collection('budget_items')
        .where('mainCategory', '==', oldData.main_category)
        .where('secondaryCategory', '==', oldData.sub_category)
        .get();

      const batch = db.batch();
      itemsSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, { mainCategory: mainCategory });
      });
      await batch.commit();
    }

    res.json({ message: 'Category updated' });
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// Delete a subcategory
router.delete('/categories/:id', async (req, res) => {
  try {
    await db.collection('budget_categories').doc(req.params.id).delete();
    res.json({ message: 'Category deleted' });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// Delete an entire main category and all its subcategories
router.delete('/categories/main/:name', async (req, res) => {
  try {
    const snapshot = await db.collection('budget_categories')
      .where('main_category', '==', req.params.name)
      .get();

    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    res.json({ message: 'Main category deleted' });
  } catch (error) {
    console.error('Error deleting main category:', error);
    res.status(500).json({ error: 'Failed to delete main category' });
  }
});

// =====================
// Category Colors
// =====================

// Get all category colors
router.get('/category-colors', async (req, res) => {
  try {
    const snapshot = await db.collection('category_colors').get();
    const colors = {};
    snapshot.docs.forEach(doc => {
      colors[doc.id] = doc.data().color;
    });
    res.json({ colors });
  } catch (error) {
    console.error('Error fetching category colors:', error);
    res.status(500).json({ error: 'Failed to fetch category colors' });
  }
});

// Set a category color
router.put('/category-colors/:category', async (req, res) => {
  try {
    const { color } = req.body;
    if (!color) {
      return res.status(400).json({ error: 'color is required' });
    }
    await db.collection('category_colors').doc(req.params.category).set({ color });
    res.json({ message: 'Color updated' });
  } catch (error) {
    console.error('Error updating category color:', error);
    res.status(500).json({ error: 'Failed to update category color' });
  }
});

module.exports = router;
