import { describe, expect, it } from 'vitest';
import type { HomeDoc } from '../../types';
import { docDueLabel, docsDue, docStatus } from '../docs';

const doc = (p: Partial<HomeDoc>): HomeDoc => ({ id: p.title ?? 'd', title: 'Doc', category: 'other', number: '', expiryDate: null, remindDays: 30, notes: '', files: [], createdAt: '', ...p });

describe('documents', () => {
  it('works out the status', () => {
    expect(docStatus(doc({}), '2026-10-20')).toBe('none');
    expect(docStatus(doc({ expiryDate: '2026-11-10' }), '2026-10-20')).toBe('soon');
    expect(docStatus(doc({ expiryDate: '2027-11-10' }), '2026-10-20')).toBe('ok');
    expect(docStatus(doc({ expiryDate: '2026-10-19' }), '2026-10-20')).toBe('expired');
  });
  it('labels warranties and expiries', () => {
    expect(docDueLabel(doc({ category: 'appliance', expiryDate: '2026-10-30' }), '2026-10-20')).toBe('Warranty ends in 10 days');
    expect(docDueLabel(doc({ expiryDate: '2026-10-18' }), '2026-10-20')).toBe('Expired 2 days ago');
  });
  it('lists what needs action, skipping ended warranties', () => {
    const list = docsDue(
      [
        doc({ title: 'Passport', expiryDate: '2026-11-15' }),
        doc({ title: 'Old fridge', category: 'appliance', expiryDate: '2026-10-01' }),
        doc({ title: 'PUC', expiryDate: '2026-10-10' }),
        doc({ title: 'Licence', expiryDate: '2030-01-01' }),
      ],
      '2026-10-20',
    );
    expect(list.map((d) => d.title)).toEqual(['PUC', 'Passport']);
  });
});
