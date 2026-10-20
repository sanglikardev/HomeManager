import type { HouseholdSettings, Plan } from '../types';
import { addDays, localDate, parseLocalDate } from './dates';

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
