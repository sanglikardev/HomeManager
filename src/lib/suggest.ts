import type { Dish, DishTag, HouseholdSettings, Item, MealLog, Slot } from '../types';
import { NONVEG_TAGS } from '../types';
import { addDays, dateDiff, hash, parseLocalDate } from './dates';
import { effectiveLevel, useSoon } from './pantry';

export interface Suggestion {
  dish: Dish;
  score: number;
  missing: Item[];
  usesSoon: Item[];
  reasons: string[];
}

// Tags that make two meals feel "the same" if eaten back to back.
const MAIN_TAGS: DishTag[] = ['dal', 'paneer', 'egg', 'chicken', 'fish', 'mutton', 'south-indian', 'chinese', 'continental'];

export function allowedByDiet(dish: Dish, settings: HouseholdSettings, date: string): boolean {
  const vegOnlyToday = settings.vegOnlyDays.includes(parseLocalDate(date).getDay());
  const hasEgg = dish.tags.includes('egg');
  const hasMeat = dish.tags.some((t) => NONVEG_TAGS.includes(t));
  if (settings.diet === 'veg' || vegOnlyToday) return !hasEgg && !hasMeat;
  if (settings.diet === 'egg') return !hasMeat;
  return true;
}

// Ingredient counts as available if there is clearly enough for one meal.
export function hasEnough(item: Item | undefined, use: number, now: Date): boolean {
  if (!item) return false;
  return effectiveLevel(item, now) >= Math.max(0.08, use * 0.6);
}

export function lastCooked(dishId: string, meals: MealLog[]): string | null {
  let last: string | null = null;
  for (const m of meals) {
    if (m.dishId === dishId && m.kind === 'cooked' && (!last || m.date > last)) last = m.date;
  }
  return last;
}

export function suggest(opts: {
  dishes: Dish[];
  items: Item[];
  meals: MealLog[];
  settings: HouseholdSettings;
  date: string;
  slot: Slot;
  now?: Date;
  count?: number;
  exclude?: Set<string>; // dishes already offered for another meal today
}): Suggestion[] {
  const { dishes, items, meals, settings, date, slot } = opts;
  const now = opts.now ?? new Date();
  const byId = new Map(items.map((i) => [i.id, i]));
  const weekend = [0, 6].includes(parseLocalDate(date).getDay());

  // What was eaten recently, for variety.
  const yesterday = addDays(date, -1);
  const recent = meals.filter((m) => m.date === date || m.date === yesterday);
  const recentTags = new Set<DishTag>();
  for (const m of recent) {
    const d = m.dishId ? dishes.find((x) => x.id === m.dishId) : undefined;
    d?.tags.filter((t) => MAIN_TAGS.includes(t)).forEach((t) => recentTags.add(t));
  }
  const eatenToday = new Set(meals.filter((m) => m.date === date && m.dishId).map((m) => m.dishId));

  const out: Suggestion[] = [];
  for (const dish of dishes) {
    if (!dish.active || !dish.slots.includes(slot) || eatenToday.has(dish.id) || opts.exclude?.has(dish.id)) continue;
    if (!allowedByDiet(dish, settings, date)) continue;

    const scored: { pts: number; why?: string }[] = [];
    const required = dish.ingredients.filter((i) => !i.optional);
    const short = required.filter((i) => !hasEnough(byId.get(i.itemId), i.use, now));
    const missing = short.map((i) => byId.get(i.itemId)).filter((i): i is Item => !!i);
    const missingCount = short.length;
    const avail = required.length ? 1 - missingCount / required.length : 1;
    scored.push({ pts: 50 * avail - 12 * missingCount - (missingCount >= 2 ? 20 : 0), why: missingCount === 0 ? 'Everything is at home' : undefined });

    const last = lastCooked(dish.id, meals);
    const since = last ? dateDiff(last, date) : Infinity;
    if (since <= 1) scored.push({ pts: -60 });
    else if (since <= 3) scored.push({ pts: -30 });
    else if (since <= 6) scored.push({ pts: -10 });
    else if (since >= 14 && since !== Infinity) scored.push({ pts: 8, why: `Not had in ${since} days` });
    else if (since === Infinity) scored.push({ pts: 4 });

    const clash = dish.tags.filter((t) => recentTags.has(t));
    if (clash.length) scored.push({ pts: -12 * clash.length });
    else if (recent.length) scored.push({ pts: 4, why: 'A change from recent meals' });

    const soon = dish.ingredients.map((i) => byId.get(i.itemId)).filter((i): i is Item => !!i && useSoon(i, now));
    if (soon.length) {
      scored.push({ pts: 14 * Math.min(2, soon.length), why: `Uses up the ${soon.slice(0, 2).map((i) => i.name.toLowerCase()).join(' and ')}` });
    }

    if (slot === 'breakfast' && !weekend && dish.cookMinutes > 30) scored.push({ pts: -15 });
    if (!weekend && dish.cookMinutes <= 25) scored.push({ pts: 3, why: slot !== 'dinner' ? 'Quick to make' : undefined });
    if (weekend && dish.tags.includes('special')) scored.push({ pts: 10, why: 'Weekend special' });
    if (slot === 'dinner' && dish.tags.includes('light')) scored.push({ pts: 3 });
    if (dish.favorite) scored.push({ pts: 6, why: 'A family favourite' });
    scored.push({ pts: hash(`${date}|${slot}|${dish.id}`) * 8 });

    const score = scored.reduce((s, x) => s + x.pts, 0);
    const reasons = scored
      .filter((x) => x.why)
      .sort((a, b) => b.pts - a.pts)
      .map((x) => x.why!)
      .slice(0, 3);
    if (missing.length) reasons.push(`Needs ${missing.map((i) => i.name.toLowerCase()).join(', ')}`);
    out.push({ dish, score, missing, usesSoon: soon, reasons });
  }

  return out.sort((a, b) => b.score - a.score).slice(0, opts.count ?? 3);
}
