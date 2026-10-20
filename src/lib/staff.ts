import type { Expense, LeaveKind, Staff } from '../types';
import { parseLocalDate } from './dates';
import { uid } from './id';

export const HELP_CATEGORY = 'Household help';

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export function isWeeklyOff(staff: Staff, date: string): boolean {
  return staff.weeklyOff.includes(parseLocalDate(date).getDay());
}

// Tapping a day: working -> full day off -> half day -> working.
export function cycleLeave(staff: Staff, date: string): Staff {
  const leaves = { ...staff.leaves };
  const now = leaves[date];
  const next: LeaveKind | undefined = !now ? 'full' : now === 'full' ? 'half' : undefined;
  if (next) leaves[date] = next;
  else delete leaves[date];
  return { ...staff, leaves };
}

export function leaveDays(staff: Staff, month: string): number {
  let n = 0;
  for (const [date, kind] of Object.entries(staff.leaves)) {
    if (!date.startsWith(month) || isWeeklyOff(staff, date)) continue;
    n += kind === 'half' ? 0.5 : 1;
  }
  return n;
}

export interface SalaryCalc {
  leaveDays: number;
  unpaidDays: number;
  deduction: number;
  advances: number; // not yet taken out of a salary, given by the end of the month
  due: number;
}

// Salary for a month: unpaid leave beyond the free days is cut at salary / days in month.
export function salaryFor(staff: Staff, month: string): SalaryCalc {
  const leave = leaveDays(staff, month);
  const unpaidDays = Math.max(0, leave - staff.paidLeaves);
  const deduction = Math.round((unpaidDays * staff.monthlySalary) / daysInMonth(month));
  const advances = staff.advances.filter((a) => (!a.settledMonth || a.settledMonth === month) && a.date.slice(0, 7) <= month).reduce((s, a) => s + a.amount, 0);
  return { leaveDays: leave, unpaidDays, deduction, advances, due: Math.max(0, staff.monthlySalary - deduction - advances) };
}

export function paymentFor(staff: Staff, month: string) {
  return staff.payments.find((p) => p.month === month);
}

function expense(staff: Staff, amount: number, date: string, note: string): Expense {
  return { id: uid(), date, amount, category: HELP_CATEGORY, note, paidBy: '', billId: null, source: 'manual', createdAt: new Date().toISOString() };
}

// Pays a month's salary: logs the expense and settles the advances it took out.
export function payStaff(staff: Staff, month: string, amount: number, date: string, monthName: string): { staff: Staff; expense: Expense | null } {
  const e = amount > 0 ? expense(staff, amount, date, `Salary: ${staff.name}, ${monthName}`) : null;
  return {
    staff: {
      ...staff,
      advances: staff.advances.map((a) => (!a.settledMonth && a.date.slice(0, 7) <= month ? { ...a, settledMonth: month } : a)),
      payments: [...staff.payments.filter((p) => p.month !== month), { month, amount, date, expenseId: e?.id ?? null }],
    },
    expense: e,
  };
}

// An advance is money spent now; it comes off the next salary.
export function giveAdvance(staff: Staff, amount: number, date: string, note: string): { staff: Staff; expense: Expense } {
  const e = expense(staff, amount, date, `Advance: ${staff.name}${note ? ` (${note})` : ''}`);
  return { staff: { ...staff, advances: [...staff.advances, { id: e.id, date, amount, note, settledMonth: null }] }, expense: e };
}

export function offToday(staff: Staff[], date: string): { staff: Staff; kind: LeaveKind | 'weekly' }[] {
  return staff
    .filter((s) => s.active)
    .flatMap((s): { staff: Staff; kind: LeaveKind | 'weekly' }[] => (s.leaves[date] ? [{ staff: s, kind: s.leaves[date] }] : isWeeklyOff(s, date) ? [{ staff: s, kind: 'weekly' as const }] : []));
}

// Takes back a month's payment: the advances it settled are open again.
export function unpayStaff(staff: Staff, month: string): { staff: Staff; expenseId: string | null } {
  const p = paymentFor(staff, month);
  return {
    staff: {
      ...staff,
      advances: staff.advances.map((a) => (a.settledMonth === month ? { ...a, settledMonth: null } : a)),
      payments: staff.payments.filter((x) => x.month !== month),
    },
    expenseId: p?.expenseId ?? null,
  };
}
