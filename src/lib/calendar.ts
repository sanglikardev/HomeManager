import type { HouseholdSettings, Plan, UpkeepTask, WeekMark } from '../types';
import { addDays, dateDiff, localDate, parseLocalDate } from './dates';

// Weeks of a month, Monday first. Days outside the month are null.
export function monthGrid(year: number, month: number): (string | null)[][] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= count; d++) cells.push(localDate(new Date(year, month, d)));
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// Plans, trips and calendar entries that cover a date, timed ones first.
export function entriesOn(plans: Plan[], date: string): Plan[] {
  return plans
    .filter((p) => p.startDate <= date && date <= p.endDate)
    .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99') || a.title.localeCompare(b.title));
}

export function entryCountsByDay(plans: Plan[], year: number, month: number): Map<string, number> {
  const out = new Map<string, number>();
  const last = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= last; d++) {
    const date = localDate(new Date(year, month, d));
    const n = entriesOn(plans, date).length;
    if (n) out.set(date, n);
  }
  return out;
}

// Monday of the week containing the date.
export function weekStart(date: string): string {
  return addDays(date, -((parseLocalDate(date).getDay() + 6) % 7));
}

// The chore set for a date, from the seven-day routine (index 0 = Sunday).
export function choreFor(settings: Pick<HouseholdSettings, 'weeklyChores'>, date: string): string {
  return settings.weeklyChores?.[parseLocalDate(date).getDay()]?.trim() ?? '';
}

export function weekChores(settings: Pick<HouseholdSettings, 'weeklyChores'>, date: string): { date: string; chore: string }[] {
  const start = weekStart(date);
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i);
    return { date: d, chore: choreFor(settings, d) };
  });
}

export interface RoutineItem {
  key: string; // `c:<weekday>` for a routine chore, `u:<task id>` for an upkeep task
  origDate: string; // the day it is scheduled on before any move
  date: string; // the day it shows on
  label: string;
  done: boolean;
  moved: boolean;
  taskId?: string;
}

export const markKey = (key: string, origDate: string) => `${key}@${origDate}`;

// Everything to do in the week from Monday `start`: the weekly chores plus
// recurring upkeep tasks set for a weekday, with done / moved marks applied.
export function routineWeek(
  settings: Pick<HouseholdSettings, 'weeklyChores' | 'weekState'>,
  upkeep: UpkeepTask[],
  start: string,
): RoutineItem[][] {
  const days: RoutineItem[][] = Array.from({ length: 7 }, () => []);
  for (let i = 0; i < 7; i++) {
    const orig = addDays(start, i);
    const dow = parseLocalDate(orig).getDay();
    const raw: { key: string; label: string; taskId?: string }[] = [];
    const chore = choreFor(settings, orig);
    if (chore) raw.push({ key: `c:${dow}`, label: chore });
    for (const t of upkeep) if (t.kind === 'recurring' && t.weekdays?.includes(dow)) raw.push({ key: `u:${t.id}`, label: t.name, taskId: t.id });
    for (const r of raw) {
      const mark = settings.weekState?.[markKey(r.key, orig)];
      const to = mark?.to && dateDiff(start, mark.to) >= 0 && dateDiff(start, mark.to) < 7 ? mark.to : orig;
      days[dateDiff(start, to)].push({ ...r, origDate: orig, date: to, done: !!mark?.done, moved: to !== orig });
    }
  }
  return days;
}

// Updates one item's mark; an empty mark is dropped, and marks over 8 weeks old are pruned.
export function withMark(state: Record<string, WeekMark> | undefined, key: string, origDate: string, patch: Partial<WeekMark>, today: string): Record<string, WeekMark> {
  const cutoff = addDays(today, -56);
  const out: Record<string, WeekMark> = {};
  for (const [k, v] of Object.entries(state ?? {})) if (k.slice(k.indexOf('@') + 1) >= cutoff) out[k] = v;
  const k = markKey(key, origDate);
  const next: WeekMark = { ...out[k], ...patch };
  if (!next.done) delete next.done;
  if (!next.to || next.to === origDate) delete next.to;
  if (next.done || next.to) out[k] = next;
  else delete out[k];
  return out;
}
