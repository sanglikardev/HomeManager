import { describe, expect, it } from 'vitest';
import type { Todo } from '../../types';
import { openTodos, setTodoDone, todoDueLabel, todosForToday, todosOn, todoStatus } from '../todos';

const t = (id: string, dueDate: string | null, done = false): Todo => ({ id, title: id, dueDate, done, doneOn: done ? '2026-10-20' : null, notes: '', createdAt: `2026-10-0${id.length}` });
const today = '2026-10-22';

describe('todos', () => {
  it('classifies by due date', () => {
    expect(todoStatus(t('a', '2026-10-21'), today)).toBe('overdue');
    expect(todoStatus(t('a', today), today)).toBe('today');
    expect(todoStatus(t('a', '2026-10-25'), today)).toBe('soon');
    expect(todoStatus(t('a', '2026-12-01'), today)).toBe('later');
    expect(todoStatus(t('a', null), today)).toBe('none');
  });

  it('lists open ones by date, undated last, and skips done', () => {
    const list = openTodos([t('x', null), t('b', '2026-10-30'), t('a', '2026-10-23'), t('d', '2026-10-01', true)]);
    expect(list.map((x) => x.id)).toEqual(['a', 'b', 'x']);
  });

  it('puts overdue and the next week on Today, not later or undated', () => {
    const list = todosForToday([t('o', '2026-10-10'), t('s', '2026-10-29'), t('l', '2026-11-05'), t('n', null), t('d', today, true)], today);
    expect(list.map((x) => x.id)).toEqual(['o', 's']);
  });

  it('finds the to-dos on a calendar day, open first', () => {
    const list = todosOn([t('zz', today, true), t('b', today), t('c', '2026-10-23')], today);
    expect(list.map((x) => x.id)).toEqual(['b', 'zz']);
  });

  it('labels due dates', () => {
    expect(todoDueLabel(t('a', null), today)).toBe('No date');
    expect(todoDueLabel(t('a', '2026-10-21'), today)).toBe('Overdue by 1 day');
    expect(todoDueLabel(t('a', '2026-10-12'), today)).toBe('Overdue by 10 days');
  });

  it('marks done and undone', () => {
    const done = setTodoDone(t('a', today), true, today);
    expect(done).toMatchObject({ done: true, doneOn: today });
    expect(setTodoDone(done, false, today)).toMatchObject({ done: false, doneOn: null });
  });
});

describe('calendar', () => {
  it('counts open to-dos on their due day', async () => {
    const { entryCountsByDay } = await import('../calendar');
    const counts = entryCountsByDay([], 2026, 9, [t('a', '2026-10-22'), t('b', '2026-10-22'), t('c', '2026-10-23', true)]);
    expect(counts.get('2026-10-22')).toBe(2);
    expect(counts.has('2026-10-23')).toBe(false);
  });
});
