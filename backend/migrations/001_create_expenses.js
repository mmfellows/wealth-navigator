const db = require('../services/database');

async function up() {
  const sql = `
    CREATE TABLE IF NOT EXISTS expenses (
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

  // Create indexes for better query performance
  await db.run('CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);');
  await db.run('CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);');
  await db.run('CREATE INDEX IF NOT EXISTS idx_expenses_amount ON expenses(amount);');

  console.log('✅ Expenses table created successfully');
}

async function down() {
  await db.run('DROP TABLE IF EXISTS expenses;');
  console.log('✅ Expenses table dropped successfully');
}

module.exports = { up, down };