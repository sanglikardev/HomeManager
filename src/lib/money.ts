import { DEFAULT_EXPENSE_CATEGORIES, type Bill, type Expense, type HouseholdSettings } from '../types';
import { dateDiff } from './dates';
import { uid } from './id';

export function categoriesFor(settings: HouseholdSettings): string[] {
  return settings.expenseCategories?.length ? settings.expenseCategories : DEFAULT_EXPENSE_CATEGORIES;
}

// ₹1,23,456 (Indian grouping), paise only when there are any.
export function formatINR(n: number): string {
  const whole = Math.round(n * 100) % 100 === 0;
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 })}`;
}

// "1,250.50" or "1250" typed in a field -> 1250.5; null when it isn't a positive number.
export function parseAmount(s: string): number | null {
  const n = Number(s.replace(/[₹,\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en', { month: 'long', year: 'numeric' });
}

// Same day of month n months later, clamped to the month's last day (31 Jan + 1 -> 28/29 Feb).
export function addMonths(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const last = new Date(y, m - 1 + n + 1, 0).getDate();
  const out = new Date(y, m - 1 + n, Math.min(d, last));
  return `${out.getFullYear()}-${String(out.getMonth() + 1).padStart(2, '0')}-${String(out.getDate()).padStart(2, '0')}`;
}

export interface MonthSummary {
  total: number;
  count: number;
  byCategory: { category: string; total: number }[]; // biggest first
  top: Expense[]; // 5 biggest
  expenses: Expense[]; // newest first
}

export function summarize(expenses: Expense[], month: string): MonthSummary {
  const list = expenses.filter((e) => monthOf(e.date) === month);
  const cats = new Map<string, number>();
  for (const e of list) cats.set(e.category, (cats.get(e.category) ?? 0) + e.amount);
  return {
    total: round(list.reduce((s, e) => s + e.amount, 0)),
    count: list.length,
    byCategory: [...cats].map(([category, total]) => ({ category, total: round(total) })).sort((a, b) => b.total - a.total),
    top: [...list].sort((a, b) => b.amount - a.amount).slice(0, 5),
    expenses: [...list].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
  };
}

// Percent change from last month; null when there is nothing to compare with.
export function changePct(now: number, before: number): number | null {
  if (!before) return null;
  return Math.round(((now - before) / before) * 100);
}

// ---------- bills ----------

const STEP: Record<Bill['frequency'], number> = { monthly: 1, quarterly: 3, yearly: 12 };

export type BillStatus = 'overdue' | 'soon' | 'ok';

export function billStatus(bill: Bill, today: string): BillStatus {
  const left = dateDiff(today, bill.nextDue);
  if (left < 0) return 'overdue';
  if (left <= bill.remindDays) return 'soon';
  return 'ok';
}

export function billDueLabel(bill: Bill, today: string): string {
  const left = dateDiff(today, bill.nextDue);
  if (left < 0) return `Overdue by ${-left} day${left === -1 ? '' : 's'}`;
  if (left === 0) return 'Due today';
  if (left === 1) return 'Due tomorrow';
  return `Due in ${left} days`;
}

export function billsDue(bills: Bill[], today: string): Bill[] {
  return bills
    .filter((b) => b.active && billStatus(b, today) !== 'ok')
    .sort((a, b) => a.nextDue.localeCompare(b.nextDue));
}

// Paying a bill logs an expense and moves its due date on by one period.
export function payBill(bill: Bill, amount: number, date: string, now: Date = new Date()): { bill: Bill; expense: Expense } {
  return {
    bill: { ...bill, lastPaid: date, nextDue: addMonths(bill.nextDue, STEP[bill.frequency]) },
    expense: {
      id: uid(),
      date,
      amount,
      category: bill.category,
      note: bill.name,
      paidBy: '',
      billId: bill.id,
      source: 'bill',
      createdAt: now.toISOString(),
    },
  };
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
