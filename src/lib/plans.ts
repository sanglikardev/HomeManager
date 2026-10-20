import type { Plan, PlanTask } from '../types';
import { addDays, dateDiff, localDate } from './dates';
import { uid } from './id';

interface TaskTemplate {
  text: string;
  daysBefore: number; // due this many days before the start (negative = after)
  when?: 'international' | 'domestic';
}

const TRIP_TASKS: TaskTemplate[] = [
  { text: 'Check passports are valid for 6+ months after return', daysBefore: 60, when: 'international' },
  { text: 'Apply for visa (or check visa on arrival rules)', daysBefore: 45, when: 'international' },
  { text: 'Book flights or trains', daysBefore: 45 },
  { text: 'Book hotels', daysBefore: 30 },
  { text: 'Buy travel insurance', daysBefore: 14, when: 'international' },
  { text: 'Plan local transport and must-see places', daysBefore: 10 },
  { text: 'Get forex card or currency, tell bank about travel', daysBefore: 7, when: 'international' },
  { text: 'International roaming or local SIM / eSIM', daysBefore: 5, when: 'international' },
  { text: 'Trip shopping: clothes, toiletries, medicines', daysBefore: 7 },
  { text: 'Download tickets, hotel bookings and ID copies to phone', daysBefore: 3 },
  { text: 'Use up fresh food; HomeManager pauses restocking it', daysBefore: 3 },
  { text: 'Pack bags', daysBefore: 2 },
  { text: 'Pause milk, newspaper and other daily deliveries', daysBefore: 1 },
  { text: 'Lock windows, switch off geyser and gas, water the plants', daysBefore: 0 },
  { text: 'Order fresh groceries for the return', daysBefore: -1 },
];

const EVENT_TASKS: TaskTemplate[] = [
  { text: 'Buy a gift or outfit', daysBefore: 5 },
  { text: 'Confirm timings and travel', daysBefore: 1 },
];

// Fresh checklist for a new plan, with due dates counted back from the start.
export function buildChecklist(plan: Pick<Plan, 'kind' | 'international' | 'startDate' | 'endDate'>, today = localDate()): PlanTask[] {
  const source = plan.kind === 'trip' ? TRIP_TASKS : plan.kind === 'event' ? EVENT_TASKS : [];
  return source
    .filter((t) => !t.when || (t.when === 'international') === plan.international)
    .map((t) => {
      const base = t.daysBefore < 0 ? plan.endDate : plan.startDate;
      const raw = addDays(base, t.daysBefore < 0 ? 0 : -t.daysBefore);
      // Already late: due today rather than in the past.
      return { id: uid(), text: t.text, due: raw < today ? today : raw, done: false };
    });
}

export function isOngoing(plan: Plan, date: string): boolean {
  return plan.startDate <= date && date <= plan.endDate;
}

export function activeTrip(plans: Plan[], date: string): Plan | undefined {
  return plans.find((p) => p.kind === 'trip' && isOngoing(p, date));
}

// Away now, or leaving within 2 days: don't restock perishables.
export function holdPerishables(plans: Plan[], now: Date = new Date()): boolean {
  const today = localDate(now);
  return plans.some((p) => p.kind === 'trip' && p.endDate >= today && dateDiff(today, p.startDate) <= 2);
}

export function upcomingPlans(plans: Plan[], today: string): Plan[] {
  return plans.filter((p) => p.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export function pastPlans(plans: Plan[], today: string): Plan[] {
  return plans.filter((p) => p.endDate < today).sort((a, b) => b.startDate.localeCompare(a.startDate));
}

// Open checklist items due within `days`, soonest first, across plans.
export function dueTasks(plans: Plan[], today: string, days = 7): { plan: Plan; task: PlanTask }[] {
  const out: { plan: Plan; task: PlanTask }[] = [];
  for (const plan of upcomingPlans(plans, today)) {
    for (const task of plan.checklist) {
      if (!task.done && task.due && dateDiff(today, task.due) <= days) out.push({ plan, task });
    }
  }
  return out.sort((a, b) => (a.task.due ?? '').localeCompare(b.task.due ?? ''));
}

export function dateRange(plan: Plan): string {
  const fmt = (s: string, withMonth: boolean) => {
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return withMonth ? `${d} ${dt.toLocaleString('en', { month: 'short' })}` : String(d);
  };
  if (plan.startDate === plan.endDate) return fmt(plan.startDate, true);
  const sameMonth = plan.startDate.slice(0, 7) === plan.endDate.slice(0, 7);
  return `${fmt(plan.startDate, !sameMonth)} – ${fmt(plan.endDate, true)}`;
}

export function countdown(plan: Plan, today: string): string {
  const d = dateDiff(today, plan.startDate);
  if (isOngoing(plan, today)) return plan.kind === 'trip' ? 'Happening now' : 'Today';
  if (d === 1) return 'Tomorrow';
  if (d < 0) return 'Done';
  return `In ${d} days`;
}

export function newsUrl(destination: string): string {
  return `https://news.google.com/search?q=${encodeURIComponent(`${destination} travel`)}`;
}

export function weatherUrl(destination: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`weather ${destination}`)}`;
}
