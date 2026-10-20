import type { UpkeepTask } from '../types';
import { addDays, dateDiff } from './dates';

export type UpkeepStatus = 'overdue' | 'soon' | 'ok' | 'unknown';

// When it is next due: last done + interval, or the renewal date.
export function nextDue(task: UpkeepTask): string | null {
  if (task.kind === 'renewal') return task.dueDate;
  if (!task.lastDone || !task.intervalDays) return null;
  return addDays(task.lastDone, task.intervalDays);
}

export function daysLeft(task: UpkeepTask, today: string): number | null {
  const due = nextDue(task);
  return due ? dateDiff(today, due) : null;
}

export function upkeepStatus(task: UpkeepTask, today: string): UpkeepStatus {
  const left = daysLeft(task, today);
  if (left == null) return 'unknown';
  if (left < 0) return 'overdue';
  if (left <= task.remindDays) return 'soon';
  return 'ok';
}

export function dueLabel(task: UpkeepTask, today: string): string {
  const left = daysLeft(task, today);
  if (left == null) return task.kind === 'renewal' ? 'Add the expiry date' : 'Not done yet';
  const verb = task.kind === 'renewal' ? 'Expires' : 'Due';
  if (left < 0) return `${task.kind === 'renewal' ? 'Expired' : 'Overdue by'} ${-left} day${left === -1 ? '' : 's'}${task.kind === 'renewal' ? ' ago' : ''}`;
  if (left === 0) return `${verb} today`;
  if (left === 1) return `${verb} tomorrow`;
  if (left < 60) return `${verb} in ${left} days`;
  return `${verb} in ${Math.round(left / 30)} months`;
}

// Marks it done (recurring) or renewed until newDue (renewal).
export function markDone(task: UpkeepTask, today: string, newDue?: string): UpkeepTask {
  const history = [today, ...task.history.filter((d) => d !== today)].slice(0, 24);
  if (task.kind === 'renewal') {
    return { ...task, lastDone: today, dueDate: newDue ?? addDays(task.dueDate && task.dueDate > today ? task.dueDate : today, 365), history };
  }
  return { ...task, lastDone: today, history };
}

const ORDER: Record<UpkeepStatus, number> = { overdue: 0, soon: 1, unknown: 2, ok: 3 };

export function sortByUrgency(tasks: UpkeepTask[], today: string): UpkeepTask[] {
  return [...tasks].sort(
    (a, b) =>
      ORDER[upkeepStatus(a, today)] - ORDER[upkeepStatus(b, today)] ||
      (daysLeft(a, today) ?? 9999) - (daysLeft(b, today) ?? 9999) ||
      a.name.localeCompare(b.name),
  );
}

// Undoes markDone for a recurring task: drops that date from the history.
export function unmarkDone(task: UpkeepTask, date: string): UpkeepTask {
  const history = task.history.filter((d) => d !== date);
  return { ...task, history, lastDone: history[0] ?? null };
}

// The user's own priority list: ordered tasks first, then the rest with the most frequent on top.
export function sortByPriority(tasks: UpkeepTask[]): UpkeepTask[] {
  return [...tasks].sort(
    (a, b) =>
      (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity) ||
      (a.intervalDays ?? Infinity) - (b.intervalDays ?? Infinity) ||
      a.name.localeCompare(b.name),
  );
}

// Moves one task to position toIndex of the shown list and returns the tasks whose
// sortOrder changed. Tasks hidden by a filter keep their slots in the full order.
export function moveTask(ordered: UpkeepTask[], shown: UpkeepTask[], id: string, toIndex: number): UpkeepTask[] {
  const ids = shown.map((t) => t.id);
  const from = ids.indexOf(id);
  if (from < 0) return [];
  ids.splice(toIndex, 0, ...ids.splice(from, 1));
  const shownSet = new Set(ids);
  const byId = new Map(ordered.map((t) => [t.id, t]));
  let k = 0;
  const full = ordered.map((t) => (shownSet.has(t.id) ? byId.get(ids[k++])! : t));
  return full.map((t, i) => ({ ...t, sortOrder: i })).filter((t) => byId.get(t.id)!.sortOrder !== t.sortOrder);
}
