const db = require('../services/database');

async function up() {
  // Mark existing "Credit Card Payment" transactions as transfers
  const result = await db.run(`
    UPDATE expenses
    SET is_transfer = 1
    WHERE (
      LOWER(merchant) LIKE '%credit card payment%' OR
      LOWER(statement) LIKE '%credit card payment%' OR
      LOWER(merchant) LIKE '%transfer%' OR
      LOWER(statement) LIKE '%transfer%'
    )
    AND (is_transfer IS NULL OR is_transfer = 0)
  `);

  console.log(`✅ Marked ${result.changes} existing transactions as transfers`);
}

async function down() {
  // Revert the changes - unmark these as transfers
  await db.run(`
    UPDATE expenses
    SET is_transfer = 0
    WHERE (
      LOWER(merchant) LIKE '%credit card payment%' OR
      LOWER(statement) LIKE '%credit card payment%' OR
      LOWER(merchant) LIKE '%transfer%' OR
      LOWER(statement) LIKE '%transfer%'
    )
  `);

  console.log('⚠️  Reverted transfer marking');
}

module.exports = { up, down };
