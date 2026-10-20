import type { HouseholdSettings, Item, PantryEvent, PantryReason, ShoppingEntry } from '../types';
import { daysBetween } from './dates';
import { uid } from './id';

// The four levels people pick from. Stored as a number so meals can take
// fractions off, but always shown as one of these.
export type LevelName = 'Full' | 'Half' | 'Low' | 'Out';
export const LEVELS: { name: LevelName; value: number }[] = [
  { name: 'Full', value: 1 },
  { name: 'Half', value: 0.5 },
  { name: 'Low', value: 0.2 },
  { name: 'Out', value: 0 },
];

export const LOW_AT = 0.3;
const OUT_AT = 0.08;

export function levelName(level: number): LevelName {
  if (level < OUT_AT) return 'Out';
  if (level < LOW_AT) return 'Low';
  if (level < 0.75) return 'Half';
  return 'Full';
}

// Stored level minus what daily staples have drained since it was written.
export function effectiveLevel(item: Item, now: Date = new Date()): number {
  if (!item.dailyUse) return item.level;
  const days = daysBetween(item.levelAt, now);
  return Math.max(0, item.level - item.dailyUse * days);
}

export function isPerishable(item: Item): boolean {
  return item.shelfLifeDays != null;
}

// 0 = fresh, 1 = at the end of its shelf life, >1 = probably spoiled.
export function ageRatio(item: Item, now: Date = new Date()): number {
  if (item.shelfLifeDays == null || !item.purchasedAt) return 0;
  return daysBetween(item.purchasedAt, now) / item.shelfLifeDays;
}

export function useSoon(item: Item, now: Date = new Date()): boolean {
  const r = ageRatio(item, now);
  return r >= 0.6 && r <= 1.2 && effectiveLevel(item, now) >= OUT_AT;
}

export function probablySpoiled(item: Item, now: Date = new Date()): boolean {
  return ageRatio(item, now) > 1.2 && effectiveLevel(item, now) >= OUT_AT;
}

// How sure the app is about the level, 0..1. Fades faster for things that
// change on their own (staples, perishables) than for a jar of turmeric.
export function confidence(item: Item, now: Date = new Date()): number {
  const horizon = item.dailyUse > 0 ? 6 : isPerishable(item) ? 10 : 45;
  const days = daysBetween(item.confirmedAt, now);
  if (days === Infinity) return 0;
  return Math.max(0, 1 - days / horizon);
}

// Days until the item drops to Low, from daily drain only. Infinity if it
// does not drain on its own.
export function daysUntilLow(item: Item, now: Date = new Date()): number {
  const eff = effectiveLevel(item, now);
  if (eff < LOW_AT) return 0;
  if (!item.dailyUse) return Infinity;
  return (eff - LOW_AT) / item.dailyUse;
}

export interface LevelChange {
  item: Item;
  event: PantryEvent;
}

// Writes a new level and records why. A person-supplied level (correction)
// also confirms the item and nudges the learned daily use toward reality.
export function setLevel(
  item: Item,
  to: number,
  reason: PantryReason,
  now: Date = new Date(),
  mealId: string | null = null,
): LevelChange {
  const before = effectiveLevel(item, now);
  const after = Math.min(1, Math.max(0, to));
  const iso = now.toISOString();
  const next: Item = { ...item, level: after, levelAt: iso };

  if (reason === 'correction' || reason === 'manual' || reason === 'purchase' || reason === 'spoiled') {
    next.confirmedAt = iso;
  }
  if (reason === 'purchase') next.purchasedAt = iso;

  if (reason === 'correction' && item.dailyUse > 0 && item.confirmedAt) {
    // error > 0 means more was used than the model expected.
    const days = daysBetween(item.confirmedAt, now);
    if (days >= 1.5) {
      const error = before - after;
      const adjusted = item.dailyUse + (0.35 * error) / days;
      next.dailyUse = Math.round(Math.min(0.8, Math.max(0.01, adjusted)) * 1000) / 1000;
    }
  }

  return {
    item: next,
    event: { id: uid(), itemId: item.id, reason, before, after, mealId, createdAt: iso },
  };
}

// Does this item belong on the shopping list right now?
export function needsReorder(item: Item, settings: HouseholdSettings, now: Date = new Date()): boolean {
  // Never-confirmed levels are only a guess: ask about them, don't order them.
  if (!item.confirmedAt) return false;
  const eff = effectiveLevel(item, now);
  if (eff < LOW_AT) return true;
  if (item.essential && eff < 0.45) return true;
  if (item.dailyUse > 0) {
    const horizon = item.bucket === 'quick' ? 1 : daysUntilWeeklyOrder(settings, now) + 1;
    if (daysUntilLow(item, now) <= horizon) return true;
  }
  return false;
}

export function daysUntilWeeklyOrder(settings: HouseholdSettings, now: Date = new Date()): number {
  return (settings.weeklyOrderDay - now.getDay() + 7) % 7;
}

// Brings the auto part of the shopping list in line with the pantry: adds
// what is running low, drops auto entries whose item has been restocked.
// Manual entries are never touched.
export function syncShoppingList(
  items: Item[],
  list: ShoppingEntry[],
  settings: HouseholdSettings,
  now: Date = new Date(),
  holdPerishables = false, // away or leaving soon: don't restock fresh food
): { add: ShoppingEntry[]; remove: string[] } {
  const needed = list.filter((e) => e.status === 'needed');
  const onList = new Set(needed.map((e) => e.itemId).filter(Boolean));
  const add: ShoppingEntry[] = [];
  const remove: string[] = [];

  for (const item of items) {
    if (holdPerishables && isPerishable(item)) continue;
    if (!onList.has(item.id) && needsReorder(item, settings, now)) {
      add.push({
        id: uid(),
        itemId: item.id,
        name: item.name,
        note: item.packLabel,
        bucket: item.bucket,
        status: 'needed',
        source: 'auto',
        createdAt: now.toISOString(),
        boughtAt: null,
      });
    }
  }
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const e of needed) {
    if (e.source !== 'auto' || !e.itemId) continue;
    const item = byId.get(e.itemId);
    if (!item || (!needsReorder(item, settings, now) && effectiveLevel(item, now) >= 0.6)) remove.push(e.id);
  }
  return { add, remove };
}
