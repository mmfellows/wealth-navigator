const db = require('../services/database');

async function up() {
  // Add is_transfer column to expenses table
  await db.run(`
    ALTER TABLE expenses ADD COLUMN is_transfer BOOLEAN DEFAULT 0
  `);

  // Create index for better query performance
  await db.run('CREATE INDEX IF NOT EXISTS idx_expenses_is_transfer ON expenses(is_transfer);');

  console.log('✅ Added is_transfer column to expenses table');
}

async function down() {
  // SQLite doesn't support DROP COLUMN directly, would need to recreate table
  console.log('⚠️  Rollback not fully supported for column additions in SQLite');
}

module.exports = { up, down };
