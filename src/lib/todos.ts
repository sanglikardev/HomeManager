import type { Todo } from '../types';
import { dateDiff, friendlyDate } from './dates';

export type TodoStatus = 'overdue' | 'today' | 'soon' | 'later' | 'none';

export function todoStatus(t: Todo, today: string): TodoStatus {
  if (!t.dueDate) return 'none';
  if (t.dueDate < today) return 'overdue';
  if (t.dueDate === today) return 'today';
  return dateDiff(today, t.dueDate) <= 7 ? 'soon' : 'later';
}

// Open to-dos, most urgent first; undated ones last.
export function openTodos(todos: Todo[]): Todo[] {
  return todos
    .filter((t) => !t.done)
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.createdAt.localeCompare(b.createdAt));
}

// Open to-dos that belong on Today: overdue, or due within `days`.
export function todosForToday(todos: Todo[], today: string, days = 7): Todo[] {
  return openTodos(todos).filter((t) => t.dueDate && dateDiff(today, t.dueDate) <= days);
}

export function todosOn(todos: Todo[], date: string): Todo[] {
  return todos.filter((t) => t.dueDate === date).sort((a, b) => Number(a.done) - Number(b.done) || a.title.localeCompare(b.title));
}

export function todoDueLabel(t: Todo, today: string): string {
  if (!t.dueDate) return 'No date';
  if (t.dueDate < today) {
    const n = dateDiff(t.dueDate, today);
    return n === 1 ? 'Overdue by 1 day' : `Overdue by ${n} days`;
  }
  return friendlyDate(t.dueDate, today);
}

export function setTodoDone(t: Todo, done: boolean, today: string): Todo {
  return { ...t, done, doneOn: done ? today : null };
}
