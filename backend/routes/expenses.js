const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db, docToObj } = require('../services/database');
const { detectAndParse, extractPdfText } = require('../services/chasePdfParser');

// Configure multer for PDF uploads
const upload = multer({
  dest: path.join(__dirname, '..', 'uploads'),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

// Helper: check for duplicate expense
async function isDuplicate(date, merchant, amount, accountOrStatement, field = 'account') {
  let query = db.collection('expenses')
    .where('date', '==', date)
    .where('merchant', '==', merchant || null)
    .where('amount', '==', amount);

  if (field === 'account') {
    query = query.where('account', '==', accountOrStatement || null);
  } else {
    query = query.where('statement', '==', accountOrStatement || null);
  }

  const snapshot = await query.limit(1).get();
  return !snapshot.empty;
}

// Bulk create expenses (for CSV imports)
router.post('/bulk', async (req, res) => {
  try {
    const { expenses } = req.body;

    if (!Array.isArray(expenses) || expenses.length === 0) {
      return res.status(400).json({ error: 'Expenses array is required' });
    }

    let successCount = 0;
    let errorCount = 0;
    let duplicateCount = 0;
    const errors = [];

    for (let i = 0; i < expenses.length; i++) {
      const expense = expenses[i];

      try {
        if (!expense.date || expense.amount === undefined) {
          throw new Error('Missing required fields: date, amount');
        }

        if (typeof expense.amount !== 'number' || expense.amount < 0) {
          throw new Error('Amount must be a positive number');
        }

        // Check for duplicates
        const dup = await isDuplicate(expense.date, expense.merchant, expense.amount, expense.statement, 'statement');

        if (dup) {
          duplicateCount++;
          continue;
        }

        await db.collection('expenses').add({
          date: expense.date,
          merchant: expense.merchant || null,
          amount: expense.amount,
          statement: expense.statement || null,
          category: expense.category || null,
          subcategory: expense.subcategory || null,
          account: expense.account || null,
          is_transfer: !!expense.is_transfer,
          imported_from: expense.imported_from || 'csv_import',
          imported_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        successCount++;
      } catch (error) {
        errorCount++;
        errors.push({ index: i, expense, error: error.message });
      }
    }

    res.json({
      message: 'Bulk import completed',
      successCount,
      errorCount,
      duplicateCount,
      errors: errors.slice(0, 10)
    });
  } catch (error) {
    console.error('Error in bulk expense creation:', error);
    res.status(500).json({ error: 'Failed to bulk create expenses' });
  }
});

// Upload and parse Chase PDF statements
router.post('/upload-pdf', upload.array('files', 20), async (req, res) => {
  const uploadedFiles = req.files || [];
  const results = [];

  try {
    for (const file of uploadedFiles) {
      try {
        const text = extractPdfText(file.path);
        const { type, transactions } = detectAndParse(text, file.originalname);

        let successCount = 0;
        let duplicateCount = 0;
        let errorCount = 0;

        for (const tx of transactions) {
          try {
            const dup = await isDuplicate(tx.date, tx.merchant, tx.amount, tx.account);
            if (dup) {
              duplicateCount++;
              continue;
            }

            await db.collection('expenses').add({
              date: tx.date,
              merchant: tx.merchant,
              amount: tx.amount,
              statement: tx.statement,
              category: tx.category || null,
              subcategory: tx.subcategory || null,
              account: tx.account,
              is_transfer: !!tx.is_transfer,
              imported_from: tx.imported_from,
              imported_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
            successCount++;
          } catch (err) {
            errorCount++;
          }
        }

        results.push({
          filename: file.originalname,
          type,
          totalParsed: transactions.length,
          successCount,
          duplicateCount,
          errorCount,
        });
      } catch (err) {
        results.push({
          filename: file.originalname,
          error: err.message,
          totalParsed: 0,
          successCount: 0,
          duplicateCount: 0,
          errorCount: 0,
        });
      } finally {
        try { fs.unlinkSync(file.path); } catch {}
      }
    }

    const totalSuccess = results.reduce((s, r) => s + r.successCount, 0);
    const totalDuplicates = results.reduce((s, r) => s + r.duplicateCount, 0);

    res.json({
      message: `Processed ${uploadedFiles.length} file(s)`,
      totalImported: totalSuccess,
      totalDuplicates,
      files: results,
    });
  } catch (error) {
    console.error('Error processing PDF upload:', error);
    res.status(500).json({ error: 'Failed to process PDF files' });
  }
});

// Preview parsed transactions from Chase PDF (without importing)
router.post('/preview-pdf', upload.array('files', 20), async (req, res) => {
  const uploadedFiles = req.files || [];
  const allTransactions = [];

  try {
    for (const file of uploadedFiles) {
      try {
        const text = extractPdfText(file.path);
        const { type, transactions } = detectAndParse(text, file.originalname);

        for (const tx of transactions) {
          const dup = await isDuplicate(tx.date, tx.merchant, tx.amount, tx.account);

          allTransactions.push({
            ...tx,
            source_file: file.originalname,
            source_type: type,
            is_duplicate: dup,
          });
        }
      } catch (err) {
        allTransactions.push({
          source_file: file.originalname,
          error: err.message,
        });
      } finally {
        try { fs.unlinkSync(file.path); } catch {}
      }
    }

    res.json({
      transactions: allTransactions,
      total: allTransactions.length,
      duplicates: allTransactions.filter(t => t.is_duplicate).length,
      newTransactions: allTransactions.filter(t => !t.is_duplicate && !t.error).length,
    });
  } catch (error) {
    console.error('Error previewing PDF:', error);
    res.status(500).json({ error: 'Failed to preview PDF files' });
  }
});

// Get all unique categories and subcategories for filters
router.get('/filters', async (req, res) => {
  try {
    const snapshot = await db.collection('expenses').get();

    const categories = new Set();
    const subcategories = new Set();
    const accounts = new Set();

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.category) categories.add(data.category);
      if (data.subcategory) subcategories.add(data.subcategory);
      if (data.account) accounts.add(data.account);
    });

    res.json({
      categories: [...categories].sort(),
      subcategories: [...subcategories].sort(),
      accounts: [...accounts].sort()
    });
  } catch (error) {
    console.error('Error fetching filters:', error);
    res.status(500).json({ error: 'Failed to fetch filter options' });
  }
});

// Get expense summary/statistics
router.get('/stats/summary', async (req, res) => {
  try {
    const { startDate, endDate, category } = req.query;

    let query = db.collection('expenses');

    if (startDate) query = query.where('date', '>=', startDate);
    if (endDate) query = query.where('date', '<=', endDate);
    if (category) query = query.where('category', '==', category);

    const snapshot = await query.get();
    const allItems = snapshot.docs.map(doc => doc.data()).filter(e => !e.is_transfer);

    // Separate income from expenses
    const incomeItems = allItems.filter(e => e.category === 'Income');
    const expenses = allItems.filter(e => e.category !== 'Income');

    // Calculate stats (expenses only)
    const amounts = expenses.map(e => e.amount);
    const totalStats = {
      total_count: amounts.length,
      total_amount: amounts.reduce((s, a) => s + a, 0),
      average_amount: amounts.length > 0 ? amounts.reduce((s, a) => s + a, 0) / amounts.length : 0,
      min_amount: amounts.length > 0 ? Math.min(...amounts) : 0,
      max_amount: amounts.length > 0 ? Math.max(...amounts) : 0,
    };

    // Income stats
    const incomeAmounts = incomeItems.map(e => e.amount);
    const incomeStats = {
      total_count: incomeAmounts.length,
      total_amount: incomeAmounts.reduce((s, a) => s + a, 0),
    };

    // By category (expenses only)
    const categoryMap = {};
    expenses.forEach(e => {
      if (e.category) {
        if (!categoryMap[e.category]) categoryMap[e.category] = { count: 0, total: 0 };
        categoryMap[e.category].count++;
        categoryMap[e.category].total += e.amount;
      }
    });
    const categoryStats = Object.entries(categoryMap)
      .map(([category, data]) => ({
        category,
        count: data.count,
        total: data.total,
        average: data.total / data.count,
      }))
      .sort((a, b) => b.total - a.total);

    // By month (separate income and expenses)
    const monthMap = {};
    allItems.forEach(e => {
      const month = e.date ? e.date.substring(0, 7) : 'unknown';
      if (!monthMap[month]) monthMap[month] = { count: 0, total: 0, income: 0, expenses: 0 };
      monthMap[month].count++;
      monthMap[month].total += e.amount;
      if (e.category === 'Income') {
        monthMap[month].income += e.amount;
      } else {
        monthMap[month].expenses += e.amount;
      }
    });
    const monthlyStats = Object.entries(monthMap)
      .map(([month, data]) => ({ month, count: data.count, total: data.total, income: data.income, expenses: data.expenses }))
      .sort((a, b) => b.month.localeCompare(a.month))
      .slice(0, 12);

    // Income by subcategory
    const incomeBySubcat = {};
    incomeItems.forEach(e => {
      const sub = e.subcategory || 'Other Income';
      if (!incomeBySubcat[sub]) incomeBySubcat[sub] = { count: 0, total: 0 };
      incomeBySubcat[sub].count++;
      incomeBySubcat[sub].total += e.amount;
    });

    res.json({
      totals: totalStats,
      income: incomeStats,
      income_by_subcategory: Object.entries(incomeBySubcat)
        .map(([subcategory, data]) => ({ subcategory, count: data.count, total: data.total }))
        .sort((a, b) => b.total - a.total),
      by_category: categoryStats,
      by_month: monthlyStats
    });
  } catch (error) {
    console.error('Error fetching expense stats:', error);
    res.status(500).json({ error: 'Failed to fetch expense statistics' });
  }
});

// Get all expenses with optional filtering
router.get('/', async (req, res) => {
  try {
    const {
      search,
      category,
      subcategory,
      account,
      startDate,
      endDate,
      includeTransfers = 'false',
      limit = 1000,
      offset = 0,
      sortBy = 'date',
      sortOrder = 'DESC'
    } = req.query;

    // Build Firestore query
    // Note: Firestore has limited compound query support, so we do some filtering in memory
    let query = db.collection('expenses');

    // Apply range filters that Firestore handles well
    if (startDate) query = query.where('date', '>=', startDate);
    if (endDate) query = query.where('date', '<=', endDate);

    // These equality filters can be combined with range on 'date'
    if (category) query = query.where('category', '==', category);
    if (subcategory) query = query.where('subcategory', '==', subcategory);
    if (account) query = query.where('account', '==', account);

    const snapshot = await query.get();

    // In-memory filtering for things Firestore can't handle in a single query
    let expenses = snapshot.docs.map(docToObj);

    // Exclude transfers
    if (includeTransfers === 'false') {
      expenses = expenses.filter(e => !e.is_transfer);
    }

    // Search filter (in memory)
    if (search) {
      const term = search.toLowerCase();
      expenses = expenses.filter(e =>
        (e.merchant && e.merchant.toLowerCase().includes(term)) ||
        (e.statement && e.statement.toLowerCase().includes(term)) ||
        (e.category && e.category.toLowerCase().includes(term))
      );
    }

    // Sort
    const allowedSortColumns = ['date', 'amount', 'category', 'created_at'];
    const col = allowedSortColumns.includes(sortBy) ? sortBy : 'date';
    const asc = sortOrder.toUpperCase() === 'ASC';

    expenses.sort((a, b) => {
      const va = a[col] ?? '';
      const vb = b[col] ?? '';
      if (typeof va === 'number' && typeof vb === 'number') {
        return asc ? va - vb : vb - va;
      }
      return asc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });

    const total = expenses.length;
    const totalAmount = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    // Paginate
    const parsedLimit = parseInt(limit);
    const parsedOffset = parseInt(offset);
    const paginatedExpenses = expenses.slice(parsedOffset, parsedOffset + parsedLimit);

    res.json({
      expenses: paginatedExpenses,
      totalAmount,
      pagination: {
        total,
        limit: parsedLimit,
        offset: parsedOffset,
        hasMore: total > parsedOffset + parsedLimit
      }
    });
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

// Get expense by ID
router.get('/:id', async (req, res) => {
  try {
    const doc = await db.collection('expenses').doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    res.json(docToObj(doc));
  } catch (error) {
    console.error('Error fetching expense:', error);
    res.status(500).json({ error: 'Failed to fetch expense' });
  }
});

// Create new expense
router.post('/', async (req, res) => {
  try {
    const {
      date,
      merchant,
      amount,
      statement,
      category,
      subcategory,
      account,
      imported_from
    } = req.body;

    if (!date || amount === undefined) {
      return res.status(400).json({
        error: 'Missing required fields: date and amount are required'
      });
    }

    if (typeof amount !== 'number' || amount < 0) {
      return res.status(400).json({
        error: 'Amount must be a positive number'
      });
    }

    const data = {
      date,
      merchant: merchant || null,
      amount,
      statement: statement || null,
      category: category || null,
      subcategory: subcategory || null,
      account: account || null,
      is_transfer: false,
      imported_from: imported_from || null,
      imported_at: imported_from ? new Date().toISOString() : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const ref = await db.collection('expenses').add(data);

    res.status(201).json({
      id: ref.id,
      message: 'Expense created successfully'
    });
  } catch (error) {
    console.error('Error creating expense:', error);
    res.status(500).json({ error: 'Failed to create expense' });
  }
});

// Bulk update expenses (category/subcategory)
router.put('/bulk-update', async (req, res) => {
  try {
    const { ids, updates } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids must be a non-empty array' });
    }
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'updates object is required' });
    }

    const allowedFields = ['category', 'subcategory', 'is_transfer'];
    const updateData = { updated_at: new Date().toISOString() };
    for (const field of allowedFields) {
      if (field in updates) {
        updateData[field] = updates[field] ?? null;
      }
    }

    if (Object.keys(updateData).length <= 1) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    // Firestore batches limited to 500 ops
    const chunks = [];
    for (let i = 0; i < ids.length; i += 500) {
      chunks.push(ids.slice(i, i + 500));
    }

    let updated = 0;
    for (const chunk of chunks) {
      const batch = db.batch();
      for (const id of chunk) {
        batch.update(db.collection('expenses').doc(String(id)), updateData);
      }
      await batch.commit();
      updated += chunk.length;
    }

    res.json({ message: `Updated ${updated} expenses`, updated });
  } catch (error) {
    console.error('Error bulk updating expenses:', error);
    res.status(500).json({ error: 'Failed to bulk update expenses' });
  }
});

// Update expense
router.put('/:id', async (req, res) => {
  try {
    const {
      date,
      merchant,
      amount,
      statement,
      category,
      subcategory,
      account,
      is_transfer
    } = req.body;

    const doc = await db.collection('expenses').doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    if (amount !== undefined && (typeof amount !== 'number' || amount < 0)) {
      return res.status(400).json({
        error: 'Amount must be a positive number'
      });
    }

    const updateData = { updated_at: new Date().toISOString() };

    if ('date' in req.body) updateData.date = date;
    if ('merchant' in req.body) updateData.merchant = merchant ?? null;
    if ('amount' in req.body) updateData.amount = amount;
    if ('statement' in req.body) updateData.statement = statement ?? null;
    if ('category' in req.body) updateData.category = category ?? null;
    if ('subcategory' in req.body) updateData.subcategory = subcategory ?? null;
    if ('account' in req.body) updateData.account = account ?? null;
    if ('is_transfer' in req.body) updateData.is_transfer = !!is_transfer;

    if (Object.keys(updateData).length <= 1) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    await db.collection('expenses').doc(req.params.id).update(updateData);

    res.json({ message: 'Expense updated successfully' });
  } catch (error) {
    console.error('Error updating expense:', error);
    res.status(500).json({ error: 'Failed to update expense' });
  }
});

// Delete expense
router.delete('/:id', async (req, res) => {
  try {
    const doc = await db.collection('expenses').doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    await db.collection('expenses').doc(req.params.id).delete();
    res.json({ message: 'Expense deleted successfully' });
  } catch (error) {
    console.error('Error deleting expense:', error);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

module.exports = router;
