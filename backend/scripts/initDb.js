// Firestore initialization script
// Seeds initial data into Firestore collections.
// Run with: node scripts/initDb.js

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { db } = require('../services/firestore');

async function seedBudgetCategories() {
  const categories = [
    ['Home', 'Mortgage'], ['Home', 'Rent'], ['Home', 'HOA'], ['Home', 'Home Maintenance'],
    ['Food & Pharmacy', 'Groceries'], ['Food & Pharmacy', 'Pharmacy Stuff'], ['Food & Pharmacy', 'Other Food & Pharm'],
    ['Vehicle', 'Vehicle Payments'], ['Vehicle', 'Regular Maintenance'], ['Vehicle', 'Special Maintenance'], ['Vehicle', 'Other Vehicle'],
    ['Health & Fitness', 'Health Insurance'], ['Health & Fitness', 'Gym Membership'], ['Health & Fitness', 'Routine Medical / Dental'], ['Health & Fitness', 'Special Medical / Dental'], ['Health & Fitness', 'Other Health'],
    ['Productivity & Tools', 'Productivity Software'], ['Productivity & Tools', 'Productivity Apps'], ['Productivity & Tools', 'Productivity Books'], ['Productivity & Tools', 'Education / Classes'], ['Productivity & Tools', 'Other Productivity & Tools'],
    ['Transportation', 'Rideshares'], ['Transportation', 'Public Transit'], ['Transportation', 'Parking'],
    ['Discretionary Health', 'Supplements'], ['Discretionary Health', 'Fitness Classes'], ['Discretionary Health', 'Health Apps'], ['Discretionary Health', 'Elective Medical / Dental'],
    ['Discretionary Entertainment', 'Movies / Rentals'], ['Discretionary Entertainment', 'Sports Clubs'], ['Discretionary Entertainment', 'Social Clubs'], ['Discretionary Entertainment', 'Concerts'], ['Discretionary Entertainment', 'Video Games'], ['Discretionary Entertainment', 'Books'], ['Discretionary Entertainment', 'Streaming Services'], ['Discretionary Entertainment', 'Ski Passes'], ['Discretionary Entertainment', 'Sporting Equipment'],
    ['Discretionary Shopping', 'Clothing'], ['Discretionary Shopping', 'Electronics'], ['Discretionary Shopping', 'Home Goods'], ['Discretionary Shopping', 'Gifts'], ['Discretionary Shopping', 'Personal Care'], ['Discretionary Shopping', 'Other Discretionary Shopping'],
    ['Travel & Vacation', 'Airfare'], ['Travel & Vacation', 'Travel Food & Dining'], ['Travel & Vacation', 'Travel Shopping'], ['Travel & Vacation', 'Travel Other'], ['Travel & Vacation', 'Travel Entertainment'],
    ['Discretionary Food & Dining', 'Alcohol'], ['Discretionary Food & Dining', 'Coffee Shops'], ['Discretionary Food & Dining', 'Takeout'], ['Discretionary Food & Dining', 'Other Discretionary Food'],
    ['Special Expense', 'Down Payment'], ['Special Expense', 'New Vehicle'], ['Special Expense', 'Other Special Expense'],
    ['Other Spending', 'Charity'], ['Other Spending', 'Repay via Business'], ['Other Spending', '???'],
    ['Other Spending', 'Cash'],
  ];

  // Check if already seeded
  const existing = await db.collection('budget_categories').limit(1).get();
  if (!existing.empty) {
    console.log('Budget categories already seeded, skipping...');
    return;
  }

  const batch = db.batch();
  categories.forEach(([main, sub], index) => {
    const ref = db.collection('budget_categories').doc();
    batch.set(ref, {
      main_category: main,
      sub_category: sub,
      sort_order: index,
      created_at: new Date().toISOString(),
    });
  });

  await batch.commit();
  console.log(`Seeded ${categories.length} budget categories.`);
}

async function main() {
  try {
    if (!db) {
      console.error('Firestore not initialized. Place serviceAccountKey.json in backend/ or set GOOGLE_APPLICATION_CREDENTIALS.');
      process.exit(1);
    }

    console.log('Initializing Firestore collections...');

    await seedBudgetCategories();

    console.log('Firestore initialization complete!');
    process.exit(0);
  } catch (error) {
    console.error('Initialization failed:', error);
    process.exit(1);
  }
}

main();
