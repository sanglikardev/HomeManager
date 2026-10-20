import { describe, expect, it } from 'vitest';
import type { Plan, UpkeepTask } from '../../types';
import { choreFor, entriesOn, entryCountsByDay, monthGrid, routineOn, routineWeek, weekChores, weekStart, withMark } from '../calendar';
import { activeTrip, buildChecklist, dueTasks, holdPerishables } from '../plans';
import { guessLastDone, markDone, moveTask, nextDue, sortByPriority, unmarkDone, sortByUrgency, upkeepStatus } from '../upkeep';

const task = (p: Partial<UpkeepTask>): UpkeepTask => ({
  id: 'x', name: 'Task', category: 'home', kind: 'recurring', intervalDays: 30, lastDone: null, dueDate: null, remindDays: 7, details: {}, history: [], notes: '', ...p,
});

describe('upkeep', () => {
  it('works out status from last done + interval', () => {
    const t = task({ lastDone: '2026-09-01' });
    expect(nextDue(t)).toBe('2026-10-01');
    expect(upkeepStatus(t, '2026-10-20')).toBe('overdue');
    expect(upkeepStatus(t, '2026-09-26')).toBe('soon');
    expect(upkeepStatus(t, '2026-09-10')).toBe('ok');
    expect(upkeepStatus(task({}), '2026-09-10')).toBe('unknown');
  });
  it('renewal moves the expiry a year on from the old expiry', () => {
    const t = task({ kind: 'renewal', dueDate: '2026-11-01' });
    const r = markDone(t, '2026-10-20');
    expect(r.dueDate).toBe('2027-11-01');
    expect(r.history[0]).toBe('2026-10-20');
  });
  it('sorts overdue first', () => {
    const a = task({ id: 'a', name: 'A', lastDone: '2026-10-15' });
    const b = task({ id: 'b', name: 'B', lastDone: '2026-08-01' });
    expect(sortByUrgency([a, b], '2026-10-20').map((t) => t.id)).toEqual(['b', 'a']);
  });
});

describe('priority order', () => {
  const a = task({ id: 'a', name: 'AC', intervalDays: 180 });
  const b = task({ id: 'b', name: 'Laundry', intervalDays: 3 });
  const c = task({ id: 'c', name: 'Plants', intervalDays: 1 });
  it('puts the most frequent first until the user orders them', () => {
    expect(sortByPriority([a, b, c]).map((t) => t.id)).toEqual(['c', 'b', 'a']);
  });
  it('keeps the saved order, with unordered tasks after', () => {
    expect(sortByPriority([a, { ...b, sortOrder: 1 }, { ...c, sortOrder: 0 }]).map((t) => t.id)).toEqual(['c', 'b', 'a']);
    expect(sortByPriority([{ ...a, sortOrder: 0 }, b, c]).map((t) => t.id)).toEqual(['a', 'c', 'b']);
  });
  it('moves a task and renumbers, leaving hidden tasks in place', () => {
    const ordered = sortByPriority([a, b, c]);
    const moved = moveTask(ordered, ordered, 'a', 0);
    expect(sortByPriority(moved.length ? [...moved, ...ordered.filter((t) => !moved.some((m) => m.id === t.id))] : ordered).map((t) => t.id)).toEqual(['a', 'c', 'b']);
    const d = task({ id: 'd', name: 'Car', category: 'vehicle', intervalDays: 2 });
    const full = [c, d, b, a];
    const shown = [c, b, a];
    const res = moveTask(full, shown, 'a', 0);
    const final = sortByPriority(full.map((t) => res.find((r) => r.id === t.id) ?? t));
    expect(final.map((t) => t.id)).toEqual(['a', 'd', 'c', 'b']);
  });
});

const trip: Plan = { id: 'p', title: 'Thailand', kind: 'trip', destination: 'Thailand', international: true, startDate: '2026-11-02', endDate: '2026-11-06', checklist: [], notes: '', createdAt: '' };

describe('plans', () => {
  it('builds a trip checklist with no dates in the past', () => {
    const list = buildChecklist(trip, '2026-10-20');
    expect(list.length).toBeGreaterThan(8);
    expect(list.every((t) => !t.due || t.due >= '2026-10-20')).toBe(true);
    expect(list.some((t) => /visa/i.test(t.text))).toBe(true);
  });
  it('knows when we are away and holds perishables', () => {
    expect(activeTrip([trip], '2026-11-03')?.id).toBe('p');
    expect(activeTrip([trip], '2026-11-07')).toBeUndefined();
    expect(holdPerishables([trip], new Date(2026, 9, 31))).toBe(true);
    expect(holdPerishables([trip], new Date(2026, 9, 20))).toBe(false);
  });
  it('lists open tasks due this week', () => {
    const p = { ...trip, checklist: buildChecklist(trip, '2026-10-20') };
    const due = dueTasks([p], '2026-10-20', 7);
    expect(due.length).toBeGreaterThan(0);
    expect(due.every((d) => d.task.due! <= '2026-10-27')).toBe(true);
  });
});

describe('calendar', () => {
  const entry = (p: Partial<Plan>): Plan => ({ ...trip, kind: 'event', startDate: '2026-10-20', endDate: '2026-10-20', ...p });
  it('lays a month out Monday first', () => {
    const weeks = monthGrid(2026, 9); // October 2026 starts on a Thursday
    expect(weeks[0].slice(0, 4)).toEqual([null, null, null, '2026-10-01']);
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });
  it('finds entries on a date, timed ones first, trips across their range', () => {
    const plans = [entry({ id: 'b', title: 'B', time: '19:00' }), entry({ id: 'a', title: 'A', time: '09:00' }), entry({ id: 't', kind: 'trip', startDate: '2026-10-19', endDate: '2026-10-21' }), entry({ id: 'x', startDate: '2026-10-22', endDate: '2026-10-22' })];
    expect(entriesOn(plans, '2026-10-20').map((p) => p.id)).toEqual(['a', 'b', 't']);
    expect(entryCountsByDay(plans, 2026, 9).get('2026-10-21')).toBe(1);
  });
  it('repeats the weekly routine and starts weeks on Monday', () => {
    const settings = { weeklyChores: ['Rest', 'Clean house', 'Clean house', 'Wash bedsheets', '', 'Water plants', ''] };
    expect(weekStart('2026-10-20')).toBe('2026-10-19'); // Tuesday -> Monday
    expect(choreFor(settings, '2026-10-20')).toBe('Clean house');
    const week = weekChores(settings, '2026-10-25'); // Sunday belongs to the week starting Mon 19th
    expect(week[0].date).toBe('2026-10-19');
    expect(week[6]).toEqual({ date: '2026-10-25', chore: 'Rest' });
    expect(choreFor({}, '2026-10-20')).toBe('');
  });
});

describe('weekly routine with upkeep', () => {
  const sweep = task({ id: 'sw', name: 'Sweep the house', weekdays: [1, 4] });
  const settings = { weeklyChores: ['', 'Clean house', '', '', '', '', ''] };
  it('puts weekday upkeep tasks next to the chores', () => {
    const week = routineWeek(settings, [sweep, task({ id: 'x', weekdays: [2], kind: 'renewal' })], '2026-10-19');
    expect(week[0].map((i) => i.label)).toEqual(['Clean house', 'Sweep the house']); // Monday
    expect(week[3].map((i) => i.label)).toEqual(['Sweep the house']); // Thursday
    expect(week[1]).toEqual([]); // renewals never show
  });
  it('moves and ticks off one occurrence only', () => {
    let state = withMark(undefined, 'u:sw', '2026-10-19', { to: '2026-10-21' }, '2026-10-20');
    state = withMark(state, 'u:sw', '2026-10-22', { done: true }, '2026-10-20');
    const week = routineWeek({ ...settings, weekState: state }, [sweep], '2026-10-19');
    expect(week[0].map((i) => i.label)).toEqual(['Clean house']);
    expect(week[2][0]).toMatchObject({ label: 'Sweep the house', moved: true, origDate: '2026-10-19' });
    expect(week[3][0].done).toBe(true);
    expect(routineWeek({ ...settings, weekState: state }, [sweep], '2026-10-26')[0].some((i) => i.moved || i.done)).toBe(false);
  });
  it('lists one day of the routine', () => {
    const state = withMark(undefined, 'c:1', '2026-10-19', { done: true }, '2026-10-20');
    const items = routineOn({ ...settings, weekState: state }, [sweep], '2026-10-19');
    expect(items.map((i) => [i.label, i.done])).toEqual([['Clean house', true], ['Sweep the house', false]]);
    expect(routineOn(settings, [sweep], '2026-10-20')).toEqual([]);
  });
  it('drops marks that are reset or very old', () => {
    let state = withMark(undefined, 'c:1', '2026-10-19', { done: true }, '2026-10-20');
    state = withMark(state, 'c:1', '2026-10-19', { done: false }, '2026-10-20');
    expect(state).toEqual({});
    const old = withMark({ 'c:1@2026-01-05': { done: true } }, 'c:2', '2026-10-20', { done: true }, '2026-10-20');
    expect(Object.keys(old)).toEqual(['c:2@2026-10-20']);
  });
  it('unmarking an upkeep task restores its previous last-done date', () => {
    const t = markDone(markDone(task({}), '2026-10-15'), '2026-10-19');
    const u = unmarkDone(t, '2026-10-19');
    expect(u.lastDone).toBe('2026-10-15');
  });
});

describe('guessLastDone', () => {
  const base = { id: 'x', name: 'AC filter', category: 'home', kind: 'recurring', intervalDays: 30, lastDone: null, dueDate: null, remindDays: 3, details: {}, history: [], notes: '' } as const;
  it('maps answers to rough dates', () => {
    expect(guessLastDone({ ...base, history: [] }, 'week', '2026-10-20').lastDone).toBe('2026-10-17');
    expect(guessLastDone({ ...base, history: [] }, 'months', '2026-10-20').lastDone).toBe('2026-08-06');
  });
  it('makes "not sure" due today', () => {
    const t = guessLastDone({ ...base, history: [] }, 'unsure', '2026-10-20');
    expect(upkeepStatus(t, '2026-10-20')).toBe('soon');
  });
});
