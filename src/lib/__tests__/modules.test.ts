import { describe, expect, it } from 'vitest';
import { moduleOn, moveCard, todayCards, todayOrder, toggled } from '../modules';

describe('modules', () => {
  it('everything is on by default', () => {
    expect(moduleOn({}, 'money')).toBe(true);
    expect(todayCards({})).toEqual(['status', 'meals', 'quick', 'todo']);
  });

  it('switches a module off', () => {
    expect(moduleOn({ disabledModules: ['money'] }, 'money')).toBe(false);
    expect(moduleOn({ disabledModules: ['money'] }, 'food')).toBe(true);
  });

  it('keeps the saved order and appends cards it does not know about', () => {
    expect(todayOrder({ todayOrder: ['todo', 'meals'] })).toEqual(['todo', 'meals', 'status', 'quick']);
    expect(todayOrder({ todayOrder: ['todo', 'todo', 'gone' as never] })).toEqual(['todo', 'status', 'meals', 'quick']);
  });

  it('hides cards without losing their place', () => {
    const s = { todayOrder: ['todo', 'meals', 'status', 'quick'] as const, todayHidden: ['meals' as const] };
    expect(todayCards({ ...s, todayOrder: [...s.todayOrder] })).toEqual(['todo', 'status', 'quick']);
  });

  it('moves a card up and down, stopping at the ends', () => {
    expect(moveCard({}, 'meals', -1)).toEqual(['meals', 'status', 'quick', 'todo']);
    expect(moveCard({}, 'status', -1)).toEqual(['status', 'meals', 'quick', 'todo']);
    expect(moveCard({}, 'todo', 1)).toEqual(['status', 'meals', 'quick', 'todo']);
  });

  it('toggles a value in a list', () => {
    expect(toggled(undefined, 'a')).toEqual(['a']);
    expect(toggled(['a', 'b'], 'a')).toEqual(['b']);
  });
});

import { setupSteps, tourSlides } from '../modules';
describe('onboarding', () => {
  it('skips kitchen questions when Kitchen is off', () => {
    expect(setupSteps({})).toEqual(['home', 'modules', 'dishes', 'pantry']);
    expect(setupSteps({ disabledModules: ['food'] })).toEqual(['home', 'modules']);
  });
  it('tour only covers tabs that are on', () => {
    const all = tourSlides({}).map((s) => s.title);
    expect(all).toContain('Kitchen');
    const some = tourSlides({ disabledModules: ['food', 'money'] }).map((s) => s.title);
    expect(some).not.toContain('Kitchen');
    expect(some).not.toContain('Money');
    expect(some[0]).toBe('Today is your home base');
    expect(some[some.length - 1]).toBe('The + button adds anything');
  });
});
