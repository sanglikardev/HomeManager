import type { HouseholdSettings } from '../types';

// Tabs a home can switch off. Today and Settings are always there.
export type ModuleId = 'food' | 'home' | 'plans' | 'money' | 'todos';
export const MODULES: { id: ModuleId; label: string; hint: string }[] = [
  { id: 'food', label: 'Kitchen', hint: 'Shopping list, pantry, dishes' },
  { id: 'home', label: 'Home', hint: 'Upkeep, routine, help, documents' },
  { id: 'plans', label: 'Plans', hint: 'Plans, trips and the calendar' },
  { id: 'money', label: 'Money', hint: 'Expenses, bills and budget' },
  { id: 'todos', label: 'To-do', hint: 'Tasks with due dates, shown in the Plans calendar' },
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

// Steps of the first-time setup. The kitchen questions only make sense when Kitchen is on.
export type SetupStep = 'home' | 'modules' | 'dishes' | 'pantry';
export function setupSteps(settings: Pick<HouseholdSettings, 'disabledModules'>): SetupStep[] {
  return moduleOn(settings, 'food') ? ['home', 'modules', 'dishes', 'pantry'] : ['home', 'modules'];
}

// The welcome tour: one slide per idea, only for the tabs this home uses.
export interface TourSlide {
  title: string;
  text: string;
}
export function tourSlides(settings: Layout): TourSlide[] {
  const slides: TourSlide[] = [
    { title: 'Today is your home base', text: 'One screen with what needs you right now: bills due, what to cook next, and your to-do list. Open it each morning.' },
  ];
  if (moduleOn(settings, 'food')) slides.push({ title: 'Kitchen', text: 'Keep a shopping list you can send on WhatsApp, track what is in your pantry, and get meal ideas from the dishes you cook.' });
  if (moduleOn(settings, 'home')) slides.push({ title: 'Home', text: 'Upkeep reminders, a weekly routine, household help with salary and days off, and documents like warranties and IDs.' });
  if (moduleOn(settings, 'money')) slides.push({ title: 'Money', text: 'See what you spent this month, set a budget, and never miss a recurring bill.' });
  if (moduleOn(settings, 'plans') || moduleOn(settings, 'todos')) slides.push({ title: 'Plans and to-dos', text: 'Plans, trips and tasks with due dates all show up on one calendar.' });
  slides.push({ title: 'The + button adds anything', text: 'Tap + at the bottom right to add an expense, shopping item, task, plan or document. Settings (the gear on Today) lets you change tabs any time, and you can replay this tour there.' });
  return slides;
}
