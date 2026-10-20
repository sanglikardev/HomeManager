import { describe, expect, it } from 'vitest';
import { mealPlanOfDay } from '../today';
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
