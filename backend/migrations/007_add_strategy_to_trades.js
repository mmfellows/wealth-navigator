const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Add strategy column to trades table
  db.run(`ALTER TABLE trades ADD COLUMN strategy TEXT DEFAULT 'Long'`, (err) => {
    if (err) {
      // Column might already exist
      if (err.message.includes('duplicate column name')) {
        console.log('Strategy column already exists');
      } else {
        console.error('Error adding strategy column:', err);
      }
    } else {
      console.log('Strategy column added to trades table');
    }
  });

  console.log('Migration 007 completed');
});

db.close();
