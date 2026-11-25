import { describe, expect, it } from 'vitest';
import { cleanSettingsPatch, friendlyWhen, homieSettings, localToday, localToUtc, sortItems, utcToLocal, type HomieItem } from '../homie';
import { contextBlock, historyMessages, runTool, type HomieContext } from '../../../worker/homie';

const IST = 330;

describe('homie times', () => {
  it('converts local India time to UTC and back', () => {
    expect(localToUtc('2026-11-26T07:30', IST)).toBe('2026-11-26T02:00:00.000Z');
    expect(localToUtc('2026-11-26 00:15', IST)).toBe('2026-11-25T18:45:00.000Z');
    expect(utcToLocal('2026-11-25T18:45:00.000Z', IST)).toBe('2026-11-26T00:15');
  });
  it('rejects malformed times', () => {
    expect(localToUtc('tomorrow 7am', IST)).toBeNull();
    expect(localToUtc('2026-13-01T07:00', IST)).toBeNull();
    expect(localToUtc('2026-11-26T24:00', IST)).toBeNull();
  });
  it('says today / tomorrow / a weekday', () => {
    const now = Date.parse('2026-11-25T12:00:00Z'); // 17:30 in India
    expect(localToday(IST, now)).toBe('2026-11-25');
    expect(friendlyWhen('2026-11-25T13:30:00Z', IST, now)).toBe('today, 7 pm');
    expect(friendlyWhen('2026-11-26T02:15:00Z', IST, now)).toBe('tomorrow, 7:45 am');
    expect(friendlyWhen('2026-11-28T06:30:00Z', IST, now)).toBe('Sat 28 Nov, 12 pm');
  });
});

describe('homie settings', () => {
  it('fills defaults', () => {
    expect(homieSettings(null).wake).toBe('06:00');
    expect(homieSettings({ tone: 'drill' }).tone).toBe('drill');
  });
  it('keeps only valid changes', () => {
    expect(cleanSettingsPatch({ wake: '05:45', leave: '8am', tone: 'nice', officeDays: [5, 1, 1], commuteMin: 45, morningBrief: false })).toEqual({
      wake: '05:45',
      officeDays: [1, 5],
      commuteMin: 45,
      morningBrief: false,
    });
    expect(cleanSettingsPatch({ officeDays: [7] })).toEqual({});
  });
});

const item = (p: Partial<HomieItem>): HomieItem => ({ id: 'x', kind: 'fact', text: 't', at: null, day: null, done: false, sent: false, forgotten: false, created_at: '2026-11-01', updated_at: '2026-11-01', ...p });

describe('sortItems', () => {
  it('puts open reminders first, soonest first', () => {
    const out = sortItems([
      item({ id: 'f', created_at: '2026-11-03' }),
      item({ id: 'r2', kind: 'reminder', at: '2026-11-30T00:00:00Z' }),
      item({ id: 'r1', kind: 'reminder', at: '2026-11-27T00:00:00Z' }),
      item({ id: 'rd', kind: 'reminder', at: '2026-11-20T00:00:00Z', done: true, created_at: '2026-11-02' }),
    ]);
    expect(out.map((i) => i.id)).toEqual(['r1', 'r2', 'f', 'rd']);
  });
});

const ctx = (): HomieContext => ({
  now: '2026-11-25T18:30',
  weekday: 'Wednesday',
  username: 'dev',
  settings: {},
  items: [{ id: '11111111-1111-1111-1111-111111111111', kind: 'fact', text: 'Likes window seats', at: null, day: null, done: false }],
  chat: [],
  home: { habits: [{ id: '22222222-2222-2222-2222-222222222222', name: 'Water', kind: 'count', target: 8, unit: 'glasses' }] },
});

function fakeRpc() {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args });
    return fn === 'hm_homie_item_save' ? { id: 'new-id' } : null;
  };
  return { calls, rpc };
}

describe('homie tools', () => {
  it('saves a reminder in UTC', async () => {
    const { calls, rpc } = fakeRpc();
    const out = await runTool('add_reminder', { text: 'Knee exercises', at: '2099-01-02T19:00' }, ctx(), 'tok', rpc);
    expect(out.error).toBeUndefined();
    expect(calls[0].args.p_item).toEqual({ kind: 'reminder', text: 'Knee exercises', at: '2099-01-02T13:30:00.000Z' });
    expect(out.action?.itemId).toBe('new-id');
  });
  it('refuses a reminder in the past or with a bad time', async () => {
    const { calls, rpc } = fakeRpc();
    expect((await runTool('add_reminder', { text: 'x', at: '2020-01-01T10:00' }, ctx(), 'tok', rpc)).error).toBe(true);
    expect((await runTool('add_reminder', { text: 'x', at: 'soon' }, ctx(), 'tok', rpc)).error).toBe(true);
    expect(calls).toHaveLength(0);
  });
  it('only forgets its own items', async () => {
    const { calls, rpc } = fakeRpc();
    expect((await runTool('forget', { id: '99999999-9999-9999-9999-999999999999' }, ctx(), 'tok', rpc)).error).toBe(true);
    await runTool('forget', { id: '11111111-1111-1111-1111-111111111111' }, ctx(), 'tok', rpc);
    expect(calls[0].args.p_item).toEqual({ id: '11111111-1111-1111-1111-111111111111', forgotten: true });
  });
  it('logs a count habit, an expense and shopping through hm_upsert', async () => {
    const { calls, rpc } = fakeRpc();
    await runTool('log_habit', { habit_id: '22222222-2222-2222-2222-222222222222', amount: 2, note: null }, ctx(), 'tok', rpc);
    await runTool('log_expense', { amount: 400, category: 'Transport & fuel', note: 'Petrol', date: null }, ctx(), 'tok', rpc);
    await runTool('add_shopping', { items: ['Eggs', ' ', 'Milk'] }, ctx(), 'tok', rpc);
    expect(calls.map((c) => c.args.p_table)).toEqual(['hm_habit_logs', 'hm_expenses', 'hm_shopping']);
    expect((calls[0].args.p_rows as { amount: number }[])[0].amount).toBe(2);
    expect((calls[1].args.p_rows as { paid_by: string; category: string }[])[0]).toMatchObject({ paid_by: 'dev', category: 'Transport & fuel' });
    expect((calls[2].args.p_rows as { name: string }[]).map((r) => r.name)).toEqual(['Eggs', 'Milk']);
  });
  it('rejects a habit that is not in the home', async () => {
    const { rpc } = fakeRpc();
    expect((await runTool('log_habit', { habit_id: 'nope', amount: null, note: null }, ctx(), 'tok', rpc)).error).toBe(true);
  });
  it('merges settings changes', async () => {
    const { calls, rpc } = fakeRpc();
    const c = ctx();
    await runTool('update_settings', { wake: '05:30', leave: null, homeBy: null, evening: null, commuteMin: null, officeDays: null, tone: null, morningBrief: null, eveningBrief: null }, c, 'tok', rpc);
    expect(calls[0].args.p_settings).toMatchObject({ wake: '05:30', leave: '08:00', tone: 'firm' });
  });
});

describe('homie prompt', () => {
  it('starts history with the person and leaves chat out of the context block', () => {
    const msgs = historyMessages([
      { role: 'assistant', text: 'Good morning', at: '' },
      { role: 'user', text: 'hi', at: '' },
      { role: 'assistant', text: 'hey', at: '' },
    ]);
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant']);
    const c = ctx();
    c.chat = [{ role: 'user', text: 'secret-chat-line', at: '' }];
    expect(contextBlock(c)).not.toContain('secret-chat-line');
    expect(contextBlock(c)).toContain('"tone":"firm"');
  });
});
