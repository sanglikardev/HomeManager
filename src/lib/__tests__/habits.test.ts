import { describe, expect, it } from 'vitest';
import type { Habit, HabitLog } from '../../types';
import { addDays } from '../dates';
import {
  dayAmount,
  doneRate,
  dueOn,
  habitsOn,
  moveHabit,
  nextSortOrder,
  orderHabits,
  habitSummary,
  newHabit,
  notedLogs,
  progressLabel,
  recentDays,
  scheduleLabel,
  streak,
  streakLabel,
  tapLog,
  weekDoneDays,
  weekStart,
} from '../habits';

const today = '2026-11-25'; // a Wednesday
const now = new Date('2026-11-25T09:00:00');
const h = (patch: Partial<Habit> = {}): Habit => newHabit(patch.id ?? 'h', new Date('2026-10-01T00:00:00'), { name: 'X', ...patch });
let n = 0;
const log = (habitId: string, date: string, amount = 1, note = ''): HabitLog => ({ id: `l${n++}`, habitId, date, amount, note, createdAt: `${date}T10:00:00Z` });

describe('habits', () => {
  it('starts weeks on Monday', () => {
    expect(weekStart(today)).toBe('2026-11-23');
    expect(weekStart('2026-11-23')).toBe('2026-11-23');
    expect(weekStart('2026-11-29')).toBe('2026-11-23'); // Sunday
  });

  it('adds up a day for count habits', () => {
    const water = h({ id: 'w', kind: 'count', target: 8, unit: 'glasses' });
    const logs = [log('w', today, 2), log('w', today, 1), log('w', '2026-11-24', 8), log('x', today, 5)];
    expect(dayAmount(logs, 'w', today)).toBe(3);
    expect(progressLabel(water, 3)).toBe('3 / 8 glasses');
    expect(progressLabel(h(), 1)).toBe('Done');
    expect(progressLabel(h(), 0)).toBe('Not yet');
  });

  it('knows which habits are due on a day', () => {
    const daily = h({ id: 'd' });
    const mwf = h({ id: 'm', schedule: 'days', days: [1, 3, 5] });
    const tth = h({ id: 't', schedule: 'days', days: [2, 4] });
    const archived = h({ id: 'a', archived: true });
    expect([daily, mwf, tth, archived].filter((x) => dueOn(x, [], today)).map((x) => x.id)).toEqual(['d', 'm']);
  });

  it('keeps a weekly habit on Today until the week goal is met', () => {
    const gym = h({ id: 'g', schedule: 'weekly', perWeek: 2 });
    expect(dueOn(gym, [log('g', '2026-11-23')], today)).toBe(true);
    const met = [log('g', '2026-11-23'), log('g', '2026-11-24')];
    expect(weekDoneDays(gym, met, today)).toBe(2);
    expect(dueOn(gym, met, today)).toBe(false);
    // Done today and that met the goal: still shown, ticked.
    expect(dueOn(gym, [log('g', '2026-11-23'), log('g', today)], today)).toBe(true);
  });

  it('lists today in the saved order and does not move ticked ones', () => {
    const a = h({ id: 'a', createdAt: '2026-10-01' });
    const b = h({ id: 'b', createdAt: '2026-10-02' });
    expect(habitsOn([b, a], [log('a', today)], today).map((x) => [x.habit.id, x.done])).toEqual([
      ['a', true],
      ['b', false],
    ]);
    const c = h({ id: 'c', createdAt: '2026-10-03', sortOrder: -1 });
    expect(habitsOn([a, b, c], [], today).map((x) => x.habit.id)).toEqual(['c', 'a', 'b']);
  });

  it('moves a habit by dragging, keeping hidden ones in place', () => {
    const list = ['a', 'b', 'c', 'd'].map((id, i) => h({ id, createdAt: `2026-10-0${i + 1}` }));
    const apply = (changed: Habit[], base = list) => orderHabits(base.map((x) => changed.find((c) => c.id === x.id) ?? x)).map((x) => x.id);
    expect(apply(moveHabit(list, ['a', 'b', 'c', 'd'], 'd', 0))).toEqual(['d', 'a', 'b', 'c']);
    expect(apply(moveHabit(list, ['a', 'b', 'c', 'd'], 'a', 2))).toEqual(['b', 'c', 'a', 'd']);
    // Only a, c and d are shown today: b keeps its slot.
    expect(apply(moveHabit(list, ['a', 'c', 'd'], 'd', 0))).toEqual(['d', 'b', 'a', 'c']);
    expect(moveHabit(list, ['a', 'b'], 'a', 0).map((x) => x.sortOrder)).toEqual([1, 2, 3]); // a is 0 already
    expect(nextSortOrder(list)).toBe(1);
    expect(nextSortOrder([])).toBe(0);
  });

  it('counts a daily streak, without breaking it before today is done', () => {
    const d = h({ id: 'd' });
    const logs = [log('d', '2026-11-22'), log('d', '2026-11-23'), log('d', '2026-11-24')];
    expect(streak(d, logs, today)).toEqual({ count: 3, unit: 'day' });
    expect(streak(d, [...logs, log('d', today)], today).count).toBe(4);
    expect(streak(d, [log('d', '2026-11-22')], today).count).toBe(0);
    expect(streakLabel({ count: 1, unit: 'day' })).toBe('1 day');
    expect(streakLabel({ count: 3, unit: 'week' })).toBe('3 weeks');
  });

  it('skips days off the schedule in a streak', () => {
    const mwf = h({ id: 'm', schedule: 'days', days: [1, 3, 5] });
    // Fri 20, Mon 23 done; Wed 25 (today) not yet.
    expect(streak(mwf, [log('m', '2026-11-20'), log('m', '2026-11-23')], today).count).toBe(2);
  });

  it('counts a count habit only when the target is reached', () => {
    const w = h({ id: 'w', kind: 'count', target: 8 });
    expect(streak(w, [log('w', '2026-11-24', 5)], today).count).toBe(0);
    expect(streak(w, [log('w', '2026-11-24', 5), log('w', '2026-11-24', 3)], today).count).toBe(1);
  });

  it('counts weekly streaks in weeks', () => {
    const g = h({ id: 'g', schedule: 'weekly', perWeek: 2 });
    const logs = [log('g', '2026-11-10'), log('g', '2026-11-12'), log('g', '2026-11-17'), log('g', '2026-11-21')];
    expect(streak(g, logs, today)).toEqual({ count: 2, unit: 'week' });
    expect(streak(g, [...logs, log('g', '2026-11-23'), log('g', '2026-11-24')], today).count).toBe(3);
  });

  it('describes the schedule', () => {
    expect(scheduleLabel({ schedule: 'daily', days: [], perWeek: 3 })).toBe('Every day');
    expect(scheduleLabel({ schedule: 'days', days: [5, 1, 3], perWeek: 3 })).toBe('Mon, Wed, Fri');
    expect(scheduleLabel({ schedule: 'days', days: [1, 2, 3, 4, 5], perWeek: 3 })).toBe('Weekdays');
    expect(scheduleLabel({ schedule: 'days', days: [0, 6], perWeek: 3 })).toBe('Weekends');
    expect(scheduleLabel({ schedule: 'weekly', days: [], perWeek: 1 })).toBe('1 time a week');
    expect(habitSummary(h({ kind: 'count', target: 8, unit: 'glasses', reminderHours: [13, 10] }))).toBe('8 glasses a day · Every day · reminder 10 am, 1 pm');
  });

  it('makes a log for one tap', () => {
    expect(tapLog(h({ id: 'c' }), today, 'x', now)).toMatchObject({ habitId: 'c', date: today, amount: 1 });
    expect(tapLog(h({ id: 'r', kind: 'count', target: 10, step: 5 }), today, 'y', now).amount).toBe(5);
  });

  it('builds the history and done rate', () => {
    const d = h({ id: 'd', createdAt: addDays(today, -10) });
    const logs = [log('d', addDays(today, -1)), log('d', addDays(today, -2)), log('d', addDays(today, -40))];
    const days = recentDays(d, logs, today, 5);
    expect(days.map((x) => x.done)).toEqual([false, false, true, true, false]);
    expect(doneRate(d, logs, today)).toBeCloseTo(2 / 10);
    expect(doneRate(h({ createdAt: `${today}T08:00:00Z` }), [], today)).toBeNull();
  });

  it('lists notes newest first', () => {
    const logs = [log('w', '2026-11-20', 1, 'Squat 80 kg x 5'), log('w', '2026-11-22', 1, ''), log('w', '2026-11-24', 1, 'Bench PR 60 kg')];
    expect(notedLogs(logs, 'w').map((l) => l.note)).toEqual(['Bench PR 60 kg', 'Squat 80 kg x 5']);
  });
});
