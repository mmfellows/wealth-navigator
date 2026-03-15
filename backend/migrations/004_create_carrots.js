const db = require('../services/database');

async function up() {
  const sql = `
    CREATE TABLE IF NOT EXISTS carrots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_name TEXT NOT NULL,
      goal_description TEXT NOT NULL,
      estimated_cost REAL,
      is_purchased BOOLEAN DEFAULT 0,
      is_goal_completed BOOLEAN DEFAULT 0,
      priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high')),
      purchased_date TEXT,
      goal_completed_date TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await db.run(sql);

  // Create indexes for better query performance
  await db.run('CREATE INDEX IF NOT EXISTS idx_carrots_is_purchased ON carrots(is_purchased);');
  await db.run('CREATE INDEX IF NOT EXISTS idx_carrots_is_goal_completed ON carrots(is_goal_completed);');
  await db.run('CREATE INDEX IF NOT EXISTS idx_carrots_priority ON carrots(priority);');

  console.log('✅ Carrots table created successfully');
}

async function down() {
  await db.run('DROP TABLE IF EXISTS carrots;');
  console.log('✅ Carrots table dropped successfully');
}

module.exports = { up, down };
