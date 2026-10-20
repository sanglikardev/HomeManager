import type { Category, Item } from '../types';

export type ShopTab = 'buy' | 'kitchen' | 'washroom' | 'sink';

export const SHELF_TABS: { value: Exclude<ShopTab, 'buy'>; label: string; categories: Category[] | 'rest' }[] = [
  { value: 'washroom', label: 'Washroom', categories: ['Bathroom & Personal care'] },
  { value: 'sink', label: 'Sink & cleaning', categories: ['Household'] },
  { value: 'kitchen', label: 'Kitchen', categories: 'rest' },
];

export function tabOf(category: Category): Exclude<ShopTab, 'buy'> {
  return SHELF_TABS.find((t) => Array.isArray(t.categories) && t.categories.includes(category))?.value ?? 'kitchen';
}

// Items on one shelf tab, grouped by category in the given category order.
export function shelfGroups(items: Item[], tab: Exclude<ShopTab, 'buy'>, order: Category[]): { category: Category; items: Item[] }[] {
  return order
    .map((category) => ({ category, items: items.filter((i) => i.category === category && tabOf(category) === tab).sort((a, b) => a.name.localeCompare(b.name)) }))
    .filter((g) => g.items.length);
}
