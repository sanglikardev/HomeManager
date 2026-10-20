import type { Slot } from '../types';

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
