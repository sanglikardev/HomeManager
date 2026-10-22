import { describe, expect, it } from 'vitest';
import { mealPlanOfDay, menuText } from '../today';
import type { Slot } from '../../types';

const ALL: Slot[] = ['breakfast', 'lunch', 'dinner'];

describe('mealPlanOfDay', () => {
  it('puts breakfast first in the morning', () => {
    expect(mealPlanOfDay(ALL, {}, 8 * 60)).toEqual({ focus: 'breakfast', missed: [], later: ['lunch', 'dinner'] });
  });
  it('moves to lunch after 10:30 and lists breakfast as missed', () => {
    expect(mealPlanOfDay(ALL, {}, 11 * 60)).toEqual({ focus: 'lunch', missed: ['breakfast'], later: ['dinner'] });
  });
  it('skips logged meals', () => {
    expect(mealPlanOfDay(ALL, { breakfast: 1, lunch: 1 }, 9 * 60)).toEqual({ focus: 'dinner', missed: [], later: [] });
  });
  it('has no focus when everything is logged', () => {
    expect(mealPlanOfDay(ALL, { breakfast: 1, lunch: 1, dinner: 1 }, 20 * 60).focus).toBeNull();
  });
  it('respects the household slots', () => {
    expect(mealPlanOfDay(['lunch', 'dinner'], {}, 7 * 60)).toEqual({ focus: 'lunch', missed: [], later: ['dinner'] });
  });
});

describe('menuText', () => {
  const m = (slot: Slot, label: string, qty = '', kind: 'cooked' | 'out' = 'cooked') =>
    ({ id: label, date: '2026-10-22', slot, kind, dishId: null, label, servings: 4, qty, createdAt: '' }) as const;
  it('lists several dishes per meal with quantities', () => {
    const text = menuText([m('dinner', 'Rajma chawal'), m('dinner', 'Roti', '12'), m('lunch', 'Dal')], ALL, 'today');
    expect(text).toBe('Menu for today\n\nLunch (for 4)\n- Dal\n\nDinner (for 4)\n- Rajma chawal\n- Roti - 12');
  });
  it('ignores meals that are not cooked and returns null when empty', () => {
    expect(menuText([m('dinner', 'Pizza', '', 'out')], ALL, 'today')).toBeNull();
  });
});
