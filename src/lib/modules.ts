import type { HouseholdSettings } from '../types';

// Tabs a home can switch off. Today and Settings are always there.
export type ModuleId = 'food' | 'home' | 'plans' | 'money';
export const MODULES: { id: ModuleId; label: string; hint: string }[] = [
  { id: 'food', label: 'Kitchen', hint: 'Shopping list, pantry, dishes' },
  { id: 'home', label: 'Home', hint: 'Upkeep, routine, help, documents' },
  { id: 'plans', label: 'Plans', hint: 'Plans, trips and the calendar' },
  { id: 'money', label: 'Money', hint: 'Expenses, bills and budget' },
];

// Blocks on the Today screen, in their default order.
export type CardId = 'status' | 'meals' | 'quick' | 'todo';
export const TODAY_CARDS: { id: CardId; label: string; hint: string }[] = [
  { id: 'status', label: 'Status chips', hint: 'Bills due, budget, to buy, help off, next plan' },
  { id: 'meals', label: 'Meals', hint: 'What to cook next' },
  { id: 'quick', label: 'Quick check', hint: 'One pantry question at a time' },
  { id: 'todo', label: 'To do', hint: 'Routine, bills, upkeep, documents, plan tasks' },
];

type Layout = Pick<HouseholdSettings, 'disabledModules' | 'todayOrder' | 'todayHidden'>;

export function moduleOn(settings: Layout, id: ModuleId): boolean {
  return !settings.disabledModules?.includes(id);
}

// Every card exactly once: the saved order first, anything new after it in default order.
export function todayOrder(settings: Layout): CardId[] {
  const all = TODAY_CARDS.map((c) => c.id);
  const saved = (settings.todayOrder ?? []).filter((id, i, a) => all.includes(id) && a.indexOf(id) === i);
  return [...saved, ...all.filter((id) => !saved.includes(id))];
}

export function todayCards(settings: Layout): CardId[] {
  return todayOrder(settings).filter((id) => !settings.todayHidden?.includes(id));
}

export function moveCard(settings: Layout, id: CardId, by: -1 | 1): CardId[] {
  const order = todayOrder(settings);
  const from = order.indexOf(id);
  const to = from + by;
  if (from < 0 || to < 0 || to >= order.length) return order;
  [order[from], order[to]] = [order[to], order[from]];
  return order;
}

export function toggled<T>(list: T[] | undefined, value: T): T[] {
  const l = list ?? [];
  return l.includes(value) ? l.filter((v) => v !== value) : [...l, value];
}
