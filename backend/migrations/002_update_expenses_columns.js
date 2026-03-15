const db = require('../services/database');

async function up() {
  // Add the new STATEMENT column
  await db.run('ALTER TABLE expenses ADD COLUMN statement TEXT;');

  // Remove the old columns that are no longer needed
  // SQLite doesn't support DROP COLUMN, so we need to recreate the table

  // Create new table with correct structure
  const sql = `
    CREATE TABLE expenses_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      merchant TEXT,
      amount REAL NOT NULL,
      statement TEXT,
      category TEXT,
      subcategory TEXT,
      imported_from TEXT,
      imported_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await db.run(sql);

  // Copy data from old table to new table, mapping old columns to new structure
  await db.run(`
    INSERT INTO expenses_new (
      id, date, merchant, amount, statement, category, subcategory,
      imported_from, imported_at, created_at, updated_at
    )
    SELECT
      id,
      date,
      merchant,
      amount,
      notes as statement,  -- Map notes to statement
      category,
      subcategory,
      imported_from,
      imported_at,
      created_at,
      updated_at
    FROM expenses;
  `);

  // Drop old table and rename new one
  await db.run('DROP TABLE expenses;');
  await db.run('ALTER TABLE expenses_new RENAME TO expenses;');

  // Recreate indexes for better query performance
  await db.run('CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);');
  await db.run('CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);');
  await db.run('CREATE INDEX IF NOT EXISTS idx_expenses_amount ON expenses(amount);');
  await db.run('CREATE INDEX IF NOT EXISTS idx_expenses_merchant ON expenses(merchant);');

  console.log('✅ Expenses table updated with new column structure');
}

async function down() {
  // Revert to original structure if needed
  const sql = `
    CREATE TABLE expenses_old (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT,
      subcategory TEXT,
      merchant TEXT,
      account TEXT,
      notes TEXT,
      imported_from TEXT,
      imported_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await db.run(sql);

  // Copy data back
  await db.run(`
    INSERT INTO expenses_old (
      id, date, description, amount, category, subcategory, merchant,
      account, notes, imported_from, imported_at, created_at, updated_at
    )
    SELECT
      id,
      date,
      merchant as description,  -- Map merchant back to description
      amount,
      category,
      subcategory,
      merchant,
      NULL as account,
      statement as notes,  -- Map statement back to notes
      imported_from,
      imported_at,
      created_at,
      updated_at
    FROM expenses;
  `);

  await db.run('DROP TABLE expenses;');
  await db.run('ALTER TABLE expenses_old RENAME TO expenses;');

  console.log('✅ Expenses table reverted to original structure');
}

module.exports = { up, down };