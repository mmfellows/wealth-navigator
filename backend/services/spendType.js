// Classify an expense into a spend type: Discretionary / Non-Discretionary /
// Travel. There is no explicit flag in the data — the dimension is encoded in
// category names, which exist in two schemes:
//   1. The coarse Plaid-mapper scheme (categoryMapper.js): main category
//      "Discretionary" with subcategories like "Travel & Vacation".
//   2. The budget_categories taxonomy (Personal Finance Categories.csv):
//      main categories prefixed "Discretionary *", and "Travel & Vacation"
//      as its own main category.
// Plaid's PFC primary ("TRAVEL") is kept as a fallback for uncategorized rows.

const SPEND_TYPES = ['Non-Discretionary', 'Travel', 'Discretionary'];

function classifySpendType(expense) {
  const cat = (expense.category || '').trim();
  const sub = (expense.subcategory || '').trim();
  if (
    cat === 'Travel & Vacation' ||
    sub === 'Travel & Vacation' ||
    (!cat && expense.plaid_category === 'TRAVEL')
  ) {
    return 'Travel';
  }
  if (cat === 'Discretionary' || cat.startsWith('Discretionary ')) {
    return 'Discretionary';
  }
  return 'Non-Discretionary';
}

module.exports = { classifySpendType, SPEND_TYPES };
