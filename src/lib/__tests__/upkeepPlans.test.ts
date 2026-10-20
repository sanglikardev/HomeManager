import { describe, expect, it } from 'vitest';
import type { Plan, UpkeepTask } from '../../types';
import { activeTrip, buildChecklist, dueTasks, holdPerishables } from '../plans';
import { markDone, nextDue, sortByUrgency, upkeepStatus } from '../upkeep';

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
