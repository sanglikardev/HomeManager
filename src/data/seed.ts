import type { Dish, DishIngredient, Item } from '../types';
import { uid } from '../lib/id';
import { SEED_DISHES } from './seedDishes';
import { SEED_ITEMS, type SeedItem } from './seedItems';

export function seedItems(now: Date = new Date()): Item[] {
  const iso = now.toISOString();
  return SEED_ITEMS.map((s) => newItem(s, iso, 0.5));
}

export function newItem(s: SeedItem, iso: string, level: number): Item {
  return {
    id: uid(),
    name: s.name,
    category: s.category,
    packLabel: s.packLabel,
    bucket: s.bucket,
    essential: !!s.essential,
    shelfLifeDays: s.shelfLifeDays ?? null,
    dailyUse: s.dailyUse ?? 0,
    // Unknown until the pantry walk: treated as "probably some", unconfirmed.
    level,
    levelAt: iso,
    confirmedAt: null,
    purchasedAt: null,
    askedAt: null,
  };
}

export function parseIngredients(spec: string, items: Item[]): { ingredients: DishIngredient[]; unknown: string[] } {
  const byName = new Map(items.map((i) => [i.name.toLowerCase(), i]));
  const ingredients: DishIngredient[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();
  // Names can contain spaces, so split on the "name:number" pattern.
  for (const m of spec.matchAll(/([a-z][a-z ]*?)(\?)?:([\d.]+)/gi)) {
    const name = m[1].trim().toLowerCase();
    const item = byName.get(name);
    if (!item) {
      unknown.push(name);
      continue;
    }
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    ingredients.push({ itemId: item.id, use: Number(m[3]), ...(m[2] ? { optional: true } : {}) });
  }
  return { ingredients, unknown };
}

export function seedDishes(items: Item[], chosen: Set<string>): Dish[] {
  return SEED_DISHES.map((s) => ({
    id: uid(),
    name: s.name,
    slots: s.slots,
    tags: s.tags,
    cookMinutes: s.cookMinutes,
    ingredients: parseIngredients(s.ingredients, items).ingredients,
    active: chosen.has(s.name),
    favorite: false,
  }));
}
