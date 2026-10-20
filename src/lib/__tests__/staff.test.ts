import { describe, expect, it } from 'vitest';
import type { Staff } from '../../types';
import { cycleLeave, giveAdvance, leaveDays, offToday, payStaff, salaryFor, unpayStaff } from '../staff';

const base: Staff = {
  id: 's1', name: 'Asha', role: 'Cook', monthlySalary: 9300, paidLeaves: 2, weeklyOff: [0], phone: '', notes: '', active: true,
  startDate: null, leaves: {}, advances: [], payments: [], createdAt: '',
};

describe('household help', () => {
  it('cycles a day through full, half and working', () => {
    const a = cycleLeave(base, '2026-10-07');
    expect(a.leaves['2026-10-07']).toBe('full');
    const b = cycleLeave(a, '2026-10-07');
    expect(b.leaves['2026-10-07']).toBe('half');
    expect(cycleLeave(b, '2026-10-07').leaves).toEqual({});
  });
  it('counts half days and ignores weekly offs', () => {
    const s = { ...base, leaves: { '2026-10-07': 'full', '2026-10-08': 'half', '2026-10-04': 'full', '2026-11-02': 'full' } as Staff['leaves'] };
    expect(leaveDays(s, '2026-10')).toBe(1.5); // 4 Oct 2026 is a Sunday
  });
  it('cuts only leave beyond the free days, and takes out advances', () => {
    const s = { ...base, leaves: { '2026-10-06': 'full', '2026-10-07': 'full', '2026-10-08': 'full', '2026-10-09': 'half' } as Staff['leaves'] };
    const withAdv = giveAdvance(s, 1000, '2026-10-10', '').staff;
    expect(salaryFor(withAdv, '2026-10')).toEqual({ leaveDays: 3.5, unpaidDays: 1.5, deduction: 450, advances: 1000, due: 7850 });
  });
  it('settles advances when paying and records the payment', () => {
    const adv = giveAdvance(base, 500, '2026-10-02', 'medical');
    expect(adv.expense.category).toBe('Household help');
    const paid = payStaff(adv.staff, '2026-10', 8800, '2026-10-31', 'October');
    expect(paid.staff.advances[0].settledMonth).toBe('2026-10');
    expect(paid.staff.payments).toEqual([{ month: '2026-10', amount: 8800, date: '2026-10-31', expenseId: paid.expense!.id }]);
    expect(salaryFor(paid.staff, '2026-11').advances).toBe(0);
    expect(salaryFor(paid.staff, '2026-10').advances).toBe(500);
  });
  it('lists who is off on a day', () => {
    const s = { ...base, leaves: { '2026-10-07': 'half' } as Staff['leaves'] };
    expect(offToday([s], '2026-10-07')).toEqual([{ staff: s, kind: 'half' }]);
    expect(offToday([s], '2026-10-04')[0].kind).toBe('weekly');
    expect(offToday([s], '2026-10-06')).toEqual([]);
  });
});

describe('unpayStaff', () => {
  it('reopens settled advances', () => {
    const adv = giveAdvance(base, 500, '2026-10-02', '');
    const paid = payStaff(adv.staff, '2026-10', 8800, '2026-10-31', 'October');
    const back = unpayStaff(paid.staff, '2026-10');
    expect(back.expenseId).toBe(paid.expense!.id);
    expect(back.staff.payments).toEqual([]);
    expect(back.staff.advances[0].settledMonth).toBeNull();
  });
});
