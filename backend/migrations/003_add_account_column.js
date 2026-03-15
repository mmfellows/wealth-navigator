const db = require('../services/database');

async function up() {
  // Add the ACCOUNT column to the expenses table
  await db.run('ALTER TABLE expenses ADD COLUMN account TEXT;');

  // Create index for account for better query performance
  await db.run('CREATE INDEX IF NOT EXISTS idx_expenses_account ON expenses(account);');

  console.log('✅ Account column added to expenses table');
}

async function down() {
  // SQLite doesn't support DROP COLUMN, so we need to recreate the table without account
  const sql = `
    CREATE TABLE expenses_temp (
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

  // Copy data from old table to new table, excluding account column
  await db.run(`
    INSERT INTO expenses_temp (
      id, date, merchant, amount, statement, category, subcategory,
      imported_from, imported_at, created_at, updated_at
    )
    SELECT
      id, date, merchant, amount, statement, category, subcategory,
      imported_from, imported_at, created_at, updated_at
    FROM expenses;
  `);

  // Drop old table and rename new one
  await db.run('DROP TABLE expenses;');
  await db.run('ALTER TABLE expenses_temp RENAME TO expenses;');

  // Recreate indexes
  await db.run('CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);');
  await db.run('CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);');
  await db.run('CREATE INDEX IF NOT EXISTS idx_expenses_amount ON expenses(amount);');
  await db.run('CREATE INDEX IF NOT EXISTS idx_expenses_merchant ON expenses(merchant);');

  console.log('✅ Account column removed from expenses table');
}

module.exports = { up, down };