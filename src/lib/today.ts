import type { MealLog, Slot } from '../types';

// Minutes after midnight by which each meal is usually over.
const SLOT_ENDS: Record<Slot, number> = { breakfast: 10 * 60 + 30, lunch: 15 * 60, dinner: 24 * 60 };

export interface MealPlanOfDay {
  focus: Slot | null; // the meal to decide now
  missed: Slot[]; // earlier meals nobody logged
  later: Slot[]; // meals after the focus one
}

// Which meal Today should put first, from the time of day and what is already logged.
// For a day that hasn't started (tomorrow) pass minutes = 0.
export function mealPlanOfDay(slots: Slot[], logged: Partial<Record<Slot, unknown>>, minutes: number): MealPlanOfDay {
  const open = slots.filter((s) => !logged[s]);
  const focus = open.find((s) => SLOT_ENDS[s] > minutes) ?? null;
  if (!focus) return { focus: null, missed: open, later: [] };
  const at = open.indexOf(focus);
  return { focus, missed: open.slice(0, at), later: open.slice(at + 1) };
}

const SLOT_NAME: Record<Slot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };

// One slot's meals as separate lines: "Roti x 12" when a quantity was given.
export function mealLine(m: MealLog): string {
  const qty = m.qty.trim();
  return qty ? `${m.label} - ${qty}` : m.label;
}

// The day's menu as text for the cook. Only cooked meals; null when there are none.
export function menuText(meals: MealLog[], slots: Slot[], dayWord: string): string | null {
  const blocks: string[] = [];
  for (const slot of slots) {
    const cooked = meals.filter((m) => m.slot === slot && m.kind === 'cooked');
    if (!cooked.length) continue;
    blocks.push(`${SLOT_NAME[slot]} (for ${cooked[0].servings})\n` + cooked.map((m) => `- ${mealLine(m)}`).join('\n'));
  }
  return blocks.length ? `Menu for ${dayWord}\n\n` + blocks.join('\n\n') : null;
}
