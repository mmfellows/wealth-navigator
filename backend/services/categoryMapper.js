// Map Plaid personal-finance categories onto the app's budget scheme
// (Discretionary / Fixed Costs / Home / Other Spending + subcategories).
//
// Used in two places: transaction sync (new rows) and the one-time
// retroactive categorization script. Manual categorization always wins —
// callers must only apply this to rows with an empty category.
//
// Detailed-category rules are checked first, then primary-category
// fallbacks. Anything unmapped returns null and stays uncategorized.

const DETAILED_RULES = {
  FOOD_AND_DRINK_GROCERIES: ['Fixed Costs', 'Groceries'],
  TRANSPORTATION_TAXIS_AND_RIDE_SHARES: ['Fixed Costs', 'Rideshares'],
  PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS: ['Fixed Costs', 'Gym'],
  GENERAL_SERVICES_INSURANCE: ['Fixed Costs', 'Health Insurance'],
  RENT_AND_UTILITIES_RENT: ['Home', 'Housing'],
  ENTERTAINMENT_MUSIC_AND_AUDIO: ['Discretionary', 'Apps & Subscriptions'],
  ENTERTAINMENT_TV_AND_MOVIES: ['Discretionary', 'Apps & Subscriptions'],
  GOVERNMENT_AND_NON_PROFIT_DONATIONS: ['Discretionary', 'Charity'],
};

const PRIMARY_RULES = {
  FOOD_AND_DRINK: ['Discretionary', 'Food & Dining'],
  GENERAL_MERCHANDISE: ['Discretionary', 'Shopping'],
  ENTERTAINMENT: ['Discretionary', 'Entertainment'],
  TRAVEL: ['Discretionary', 'Travel & Vacation'],
  RENT_AND_UTILITIES: ['Home', 'Utilities'],
  HOME_IMPROVEMENT: ['Home', 'Housing'],
  PERSONAL_CARE: ['Discretionary', 'Shopping'],
  MEDICAL: ['Other Spending', 'Miscellaneous'],
  GENERAL_SERVICES: ['Other Spending', 'Miscellaneous'],
  GOVERNMENT_AND_NON_PROFIT: ['Other Spending', 'Miscellaneous'],
  TRANSPORTATION: ['Other Spending', 'Miscellaneous'],
  BANK_FEES: ['Other Spending', 'Miscellaneous'],
  OTHER: ['Other Spending', 'Miscellaneous'],
};

function mapPlaidCategory(primary, detailed) {
  const rule = DETAILED_RULES[detailed || ''] || PRIMARY_RULES[primary || ''];
  if (!rule) return null;
  return { category: rule[0], subcategory: rule[1] };
}

module.exports = { mapPlaidCategory };
