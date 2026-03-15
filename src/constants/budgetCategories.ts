// Fetch budget categories from the settings API.
// Returns { mainCategory: subcategory[] } map.
export async function fetchBudgetCategories(): Promise<Record<string, string[]>> {
  const response = await fetch('http://localhost:3001/api/settings/categories');
  if (!response.ok) throw new Error('Failed to fetch categories');
  const data = await response.json();

  // Convert from API format to simple Record
  const result: Record<string, string[]> = {};
  for (const [main, subs] of Object.entries(data.categories)) {
    result[main] = (subs as any[]).map(s => s.name);
  }
  return result;
}

// Fetch category colors from the settings API.
// Returns { mainCategory: tailwindColorClass } map.
export async function fetchCategoryColors(): Promise<Record<string, string>> {
  const response = await fetch('http://localhost:3001/api/settings/category-colors');
  if (!response.ok) throw new Error('Failed to fetch category colors');
  const data = await response.json();
  return data.colors;
}

// Default fallback color
export const DEFAULT_CATEGORY_COLOR = 'bg-gray-100 text-gray-800';
