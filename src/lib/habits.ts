import type { Habit, HabitLog } from '../types';
import { addDays, parseLocalDate, WEEKDAYS_SHORT } from './dates';

// Weeks start on Monday (same as the reminder SQL in migration 0022).
export function weekStart(date: string): string {
  const dow = parseLocalDate(date).getDay();
  return addDays(date, -((dow + 6) % 7));
}

export function dayAmount(logs: HabitLog[], habitId: string, date: string): number {
  let sum = 0;
  for (const l of logs) if (l.habitId === habitId && l.date === date) sum += l.amount;
  return sum;
}

export function doneOn(h: Habit, logs: HabitLog[], date: string): boolean {
  return dayAmount(logs, h.id, date) >= h.target;
}

// Days this week (up to and including `date`) on which the habit was done.
export function weekDoneDays(h: Habit, logs: HabitLog[], date: string, exclude?: string): number {
  const from = weekStart(date);
  let n = 0;
  for (let d = from; d <= date; d = addDays(d, 1)) if (d !== exclude && doneOn(h, logs, d)) n++;
  return n;
}

// Whether a day counts for the habit at all (for streaks and the history grid).
export function scheduledOn(h: Habit, date: string): boolean {
  return h.schedule !== 'days' || h.days.includes(parseLocalDate(date).getDay());
}

// Belongs on Today: scheduled for the day, or for "N times a week" not met yet (or done today).
export function dueOn(h: Habit, logs: HabitLog[], date: string): boolean {
  if (h.archived) return false;
  if (h.schedule === 'weekly') return weekDoneDays(h, logs, date, date) < h.perWeek || doneOn(h, logs, date);
  return scheduledOn(h, date);
}

export interface HabitToday {
  habit: Habit;
  amount: number;
  done: boolean;
}

// Today's habits, not done first, in the order they were made.
export function habitsOn(habits: Habit[], logs: HabitLog[], date: string): HabitToday[] {
  return habits
    .filter((h) => dueOn(h, logs, date))
    .map((h) => {
      const amount = dayAmount(logs, h.id, date);
      return { habit: h, amount, done: amount >= h.target };
    })
    .sort((a, b) => Number(a.done) - Number(b.done) || a.habit.createdAt.localeCompare(b.habit.createdAt));
}

export interface Streak {
  count: number;
  unit: 'day' | 'week';
}

// Days (or weeks, for "N times a week") in a row. Today not done yet does not break it.
export function streak(h: Habit, logs: HabitLog[], today: string): Streak {
  if (h.schedule === 'weekly') {
    let w = weekStart(today);
    if (weekDoneDays(h, logs, today) < h.perWeek) w = addDays(w, -7);
    let count = 0;
    for (let i = 0; i < 60; i++, w = addDays(w, -7)) {
      if (weekDoneDays(h, logs, addDays(w, 6)) < h.perWeek) break;
      count++;
    }
    return { count, unit: 'week' };
  }
  let d = doneOn(h, logs, today) ? today : addDays(today, -1);
  let count = 0;
  for (let i = 0; i < 400; i++, d = addDays(d, -1)) {
    if (!scheduledOn(h, d)) continue;
    if (!doneOn(h, logs, d)) break;
    count++;
  }
  return { count, unit: 'day' };
}

export function streakLabel(s: Streak): string {
  return `${s.count} ${s.unit}${s.count === 1 ? '' : 's'}`;
}

export function num(n: number): string {
  return String(Math.round(n * 100) / 100);
}

export function progressLabel(h: Habit, amount: number): string {
  if (h.kind === 'check') return amount >= h.target ? 'Done' : 'Not yet';
  return `${num(amount)} / ${num(h.target)}${h.unit ? ` ${h.unit}` : ''}`;
}

export function scheduleLabel(h: Pick<Habit, 'schedule' | 'days' | 'perWeek'>): string {
  if (h.schedule === 'weekly') return h.perWeek >= 7 ? 'Every day' : `${h.perWeek} time${h.perWeek === 1 ? '' : 's'} a week`;
  if (h.schedule === 'days') {
    const days = [...h.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    if (days.length === 7) return 'Every day';
    if (!days.length) return 'No days picked';
    if (days.join() === '1,2,3,4,5') return 'Weekdays';
    if (days.join() === '6,0') return 'Weekends';
    return days.map((d) => WEEKDAYS_SHORT[d]).join(', ');
  }
  return 'Every day';
}

export function hourLabel(h: number): string {
  const suffix = h < 12 ? 'am' : 'pm';
  const n = h % 12 === 0 ? 12 : h % 12;
  return `${n} ${suffix}`;
}

export function habitSummary(h: Habit): string {
  const parts = [scheduleLabel(h)];
  if (h.kind === 'count') parts.unshift(`${num(h.target)}${h.unit ? ` ${h.unit}` : ''} a day`);
  if (h.reminderHours.length) parts.push(`reminder ${[...h.reminderHours].sort((a, b) => a - b).map(hourLabel).join(', ')}`);
  return parts.join(' · ');
}

// The last `n` days, oldest first, for the history grid.
export function recentDays(h: Habit, logs: HabitLog[], today: string, n: number): { date: string; amount: number; done: boolean; scheduled: boolean }[] {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const amount = dayAmount(logs, h.id, date);
    out.push({ date, amount, done: amount >= h.target, scheduled: scheduledOn(h, date) });
  }
  return out;
}

// Done days in the last 30 (or since the habit started, if newer), as a share of the days it was due.
export function doneRate(h: Habit, logs: HabitLog[], today: string, days = 30): number | null {
  const start = h.createdAt.slice(0, 10);
  const all = recentDays(h, logs, today, days).filter((d) => d.date >= start && d.date < today);
  if (h.schedule === 'weekly') {
    if (!all.length) return null;
    const goal = (all.length / 7) * h.perWeek;
    return Math.min(1, all.filter((d) => d.done).length / goal);
  }
  const due = all.filter((d) => d.scheduled);
  if (!due.length) return null;
  return due.filter((d) => d.done).length / due.length;
}

// One quick tap: a tick for a check habit (the whole target), `step` for a count.
export function tapLog(h: Habit, date: string, id: string, now: Date, note = ''): HabitLog {
  return { id, habitId: h.id, date, amount: h.kind === 'check' ? h.target : h.step || 1, note, createdAt: now.toISOString() };
}

// Logs with a note, newest first: workout details, PRs, pages read...
export function notedLogs(logs: HabitLog[], habitId: string): HabitLog[] {
  return logs.filter((l) => l.habitId === habitId && l.note.trim()).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

export function newHabit(id: string, now: Date, patch: Partial<Habit> = {}): Habit {
  return {
    id,
    name: '',
    emoji: '',
    kind: 'check',
    target: 1,
    unit: '',
    step: 1,
    schedule: 'daily',
    days: [1, 2, 3, 4, 5],
    perWeek: 3,
    reminderHours: [],
    archived: false,
    notes: '',
    createdAt: now.toISOString(),
    ...patch,
  };
}

// Starting points when adding a habit. Everything can be changed after picking one.
export const HABIT_IDEAS: (Partial<Habit> & { name: string; emoji: string })[] = [
  { name: 'Drink water', emoji: '💧', kind: 'count', target: 8, unit: 'glasses', step: 1, reminderHours: [10, 13, 16, 19] },
  { name: 'Read', emoji: '📖', kind: 'count', target: 10, unit: 'pages', step: 5, reminderHours: [21] },
  { name: 'Work out', emoji: '💪', kind: 'check', schedule: 'weekly', perWeek: 4, reminderHours: [7] },
  { name: 'Walk', emoji: '🚶', kind: 'count', target: 30, unit: 'minutes', step: 10 },
  { name: 'Meditate', emoji: '🧘', kind: 'count', target: 10, unit: 'minutes', step: 5 },
  { name: 'No sugar', emoji: '🍬', kind: 'check' },
  { name: 'Sleep by 11', emoji: '😴', kind: 'check', reminderHours: [22] },
  { name: 'Take vitamins', emoji: '💊', kind: 'check', reminderHours: [9] },
];
