import { describe, expect, it } from 'vitest';
import type { Bill, Expense } from '../../types';
import { addMonths, billStatus, billsDue, changePct, formatINR, parseAmount, payBill, shiftMonth, summarize } from '../money';

const exp = (p: Partial<Expense>): Expense => ({
  id: Math.random().toString(36), date: '2026-10-05', amount: 100, category: 'Groceries', note: '', paidBy: '', billId: null, source: 'manual', createdAt: '2026-10-05T10:00:00Z', ...p,
});

const bill = (p: Partial<Bill>): Bill => ({
  id: 'b', name: 'Rent', category: 'Rent / EMI', amount: 20000, frequency: 'monthly', nextDue: '2026-10-25', remindDays: 3, lastPaid: null, active: true, notes: '', ...p,
});

describe('money', () => {
  it('formats rupees with Indian grouping', () => {
    expect(formatINR(123456)).toBe('₹1,23,456');
    expect(formatINR(99.5)).toBe('₹99.50');
  });
  it('parses typed amounts', () => {
    expect(parseAmount('1,250.50')).toBe(1250.5);
    expect(parseAmount('₹ 300')).toBe(300);
    expect(parseAmount('0')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });
  it('adds months, clamping to the month end', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
  it('summarizes a month by category and biggest spends', () => {
    const list = [
      exp({ amount: 500, category: 'Groceries' }),
      exp({ amount: 1500, category: 'Eating out' }),
      exp({ amount: 300, category: 'Groceries' }),
      exp({ amount: 999, date: '2026-09-30' }),
    ];
    const s = summarize(list, '2026-10');
    expect(s.total).toBe(2300);
    expect(s.count).toBe(3);
    expect(s.byCategory).toEqual([
      { category: 'Eating out', total: 1500 },
      { category: 'Groceries', total: 800 },
    ]);
    expect(s.top[0].amount).toBe(1500);
    expect(changePct(2300, 2000)).toBe(15);
    expect(changePct(100, 0)).toBeNull();
  });
  it('knows when a bill is due and moves it on when paid', () => {
    expect(billStatus(bill({}), '2026-10-20')).toBe('ok');
    expect(billStatus(bill({}), '2026-10-23')).toBe('soon');
    expect(billStatus(bill({}), '2026-10-26')).toBe('overdue');
    expect(billsDue([bill({}), bill({ id: 'x', active: false, nextDue: '2026-10-01' })], '2026-10-24').map((b) => b.id)).toEqual(['b']);
    const paid = payBill(bill({ frequency: 'quarterly' }), 21000, '2026-10-24');
    expect(paid.bill.nextDue).toBe('2027-01-25');
    expect(paid.bill.lastPaid).toBe('2026-10-24');
    expect(paid.expense).toMatchObject({ amount: 21000, category: 'Rent / EMI', note: 'Rent', billId: 'b', source: 'bill' });
  });
});
