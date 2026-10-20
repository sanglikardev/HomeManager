import { describe, expect, it } from 'vitest';
import { SEED_DISHES } from '../../data/seedDishes';
import { parseIngredients, seedDishes, seedItems } from '../../data/seed';
import { DEFAULT_SETTINGS, type HouseholdSettings, type Item, type MealLog } from '../../types';
import { effectiveLevel, levelName, needsReorder, setLevel, syncShoppingList } from '../pantry';
import { pickQuestions } from '../questions';
import { suggest } from '../suggest';

const NOW = new Date('2026-10-20T08:00:00');
const settings: HouseholdSettings = { ...DEFAULT_SETTINGS, diet: 'nonveg', setupDone: true };

function stocked(level = 1): Item[] {
  return seedItems(NOW).map((i) => ({ ...i, level, confirmedAt: NOW.toISOString(), purchasedAt: NOW.toISOString() }));
}

describe('seed data', () => {
  it('every dish ingredient names a real item', () => {
    const items = seedItems(NOW);
    for (const d of SEED_DISHES) {
      const { unknown } = parseIngredients(d.ingredients, items);
      expect(unknown, d.name).toEqual([]);
    }
  });
  it('dish names are unique', () => {
    expect(new Set(SEED_DISHES.map((d) => d.name)).size).toBe(SEED_DISHES.length);
  });
});

describe('pantry', () => {
  it('daily staples drain over time', () => {
    const milk = stocked().find((i) => i.name === 'Milk')!;
    expect(effectiveLevel(milk, new Date('2026-10-21T08:00:00'))).toBeCloseTo(0.6, 2);
  });
  it('a correction teaches the daily use rate', () => {
    const milk = { ...stocked().find((i) => i.name === 'Milk')! };
    const later = new Date('2026-10-22T08:00:00'); // model expects 0.2 left
    const { item } = setLevel(milk, 0, 'correction', later);
    expect(item.dailyUse).toBeGreaterThan(milk.dailyUse);
  });
  it('low items go on the shopping list and restocked ones come off', () => {
    const items = stocked();
    const onion = items.find((i) => i.name === 'Onion')!;
    onion.level = 0.1;
    const { add } = syncShoppingList(items, [], settings, NOW);
    expect(add.map((a) => a.name)).toContain('Onion');
    onion.level = 1;
    const { remove } = syncShoppingList(items, add, settings, NOW);
    expect(remove).toContain(add.find((a) => a.name === 'Onion')!.id);
  });
  it('levels map to names', () => {
    expect(levelName(1)).toBe('Full');
    expect(levelName(0.5)).toBe('Half');
    expect(levelName(0.2)).toBe('Low');
    expect(levelName(0)).toBe('Out');
    expect(needsReorder({ ...stocked()[0], level: 0.2 }, settings, NOW)).toBe(true);
  });
});

describe('suggestions', () => {
  it('prefers dishes that can be made and skips what was just eaten', () => {
    const items = stocked();
    const dishes = seedDishes(items, new Set(SEED_DISHES.map((d) => d.name)));
    const paneer = items.find((i) => i.name === 'Paneer')!;
    paneer.level = 0;
    const meals: MealLog[] = [];
    const first = suggest({ dishes, items, meals, settings, date: '2026-10-20', slot: 'lunch', now: NOW, count: 10 });
    expect(first.length).toBe(10);
    expect(first.every((s) => s.missing.length === 0)).toBe(true);
    const top = first[0].dish;
    meals.push({ id: 'm', date: '2026-10-19', slot: 'dinner', kind: 'cooked', dishId: top.id, label: top.name, servings: 3, createdAt: NOW.toISOString() });
    const next = suggest({ dishes, items, meals, settings, date: '2026-10-20', slot: 'lunch', now: NOW });
    expect(next.map((s) => s.dish.id)).not.toContain(top.id);
  });
  it('respects a veg diet', () => {
    const items = stocked();
    const dishes = seedDishes(items, new Set(SEED_DISHES.map((d) => d.name)));
    const out = suggest({ dishes, items, meals: [], settings: { ...settings, diet: 'veg' }, date: '2026-10-20', slot: 'dinner', now: NOW, count: 50 });
    expect(out.some((s) => s.dish.tags.some((t) => ['egg', 'chicken', 'fish', 'mutton'].includes(t)))).toBe(false);
  });
  it('pushes ingredients that are about to spoil', () => {
    const items = stocked();
    const spinach = items.find((i) => i.name === 'Spinach')!;
    spinach.purchasedAt = new Date('2026-10-18T08:00:00').toISOString();
    const dishes = seedDishes(items, new Set(SEED_DISHES.map((d) => d.name)));
    const out = suggest({ dishes, items, meals: [], settings, date: '2026-10-20', slot: 'lunch', now: NOW });
    expect(out[0].usesSoon.map((i) => i.name)).toContain('Spinach');
  });
});

describe('questions', () => {
  it('asks about unconfirmed relevant items, at most three a day', () => {
    const items = seedItems(NOW);
    const qs = pickQuestions(items, new Set(items.slice(0, 10).map((i) => i.id)), NOW);
    expect(qs.length).toBe(3);
    const answered = items.map((i, n) => (n < 3 ? { ...i, askedAt: NOW.toISOString() } : i));
    expect(pickQuestions(answered, new Set(), NOW).length).toBe(0);
  });
});
