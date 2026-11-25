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

import { buildBrief, type BriefContext } from '../homie';
import { handleMcp, mcpHttp } from '../../../worker/mcp';

const briefCtx = (): BriefContext => ({
  now: '2026-11-25T06:05', // a Wednesday
  settings: {},
  items: [
    { kind: 'reminder', text: 'Call the CA', at: '2026-11-25T13:30:00.000Z', done: false, day: null },
    { kind: 'reminder', text: 'Physio', at: '2026-11-26T01:30:00.000Z', done: false, day: null },
    { kind: 'busy', text: 'Release day', at: null, day: '2026-11-26', done: false },
  ],
  home: {
    habits: [
      { name: 'Workout', kind: 'check', target: 1, schedule: 'weekly', days: [], perWeek: 4, today: 0, daysDoneLast7: 1 },
      { name: 'Water', kind: 'count', target: 8, schedule: 'daily', days: [], perWeek: 1, today: 8, daysDoneLast7: 7 },
      { name: 'Yoga', kind: 'check', target: 1, schedule: 'days', days: [0], perWeek: 1, today: 0, daysDoneLast7: 0 },
    ],
    billsDue: [{ name: 'Electricity', due: '2026-11-24' }],
    plans: [],
  },
});

describe('buildBrief', () => {
  it('writes a morning brief from the day', () => {
    expect(buildBrief(briefCtx(), 'morning')).toBe(
      'Office day: leave by 08:00. Habits: Workout. 1 reminder: 19:00 Call the CA. Bills due: Electricity. No excuses today.',
    );
  });
  it('writes an evening wrap-up with tomorrow and bedtime', () => {
    expect(buildBrief(briefCtx(), 'evening')).toBe(
      'Done: 1/2. Still open: Workout. Tomorrow is an office day, leave by 08:00. Busy tomorrow: Release day. First up: 07:00 Physio. Bed by 22:30 to wake at 06:00. Phone down on time.',
    );
  });
});

describe('connector (MCP)', () => {
  const KEY = 'a'.repeat(48);
  it('answers initialize and lists tools', async () => {
    const init = (await handleMcp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, KEY, async () => null)) as { result: { protocolVersion: string; instructions: string } };
    expect(init.result.protocolVersion).toBe('2025-06-18');
    expect(init.result.instructions).toContain('get_overview');
    const list = (await handleMcp({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, KEY, async () => null)) as { result: { tools: { name: string; inputSchema: object }[] } };
    expect(list.result.tools.map((t) => t.name)).toContain('get_overview');
    expect(list.result.tools.every((t) => t.inputSchema)).toBe(true);
    expect(await handleMcp({ jsonrpc: '2.0', method: 'notifications/initialized' }, KEY, async () => null)).toBeNull();
  });
  it('runs a tool with the key as the session token', async () => {
    const calls: string[] = [];
    const rpc = async (fn: string, args: Record<string, unknown>) => {
      calls.push(`${fn}:${args.p_token}`);
      return fn === 'hm_homie_context' ? ctx() : fn === 'hm_homie_gate' ? { unlocked: true } : { id: 'r1' };
    };
    const out = (await handleMcp({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'remember', arguments: { text: 'Shoe size 10' } } }, KEY, rpc)) as { result: { content: { text: string }[]; isError?: boolean } };
    expect(out.result.isError).toBeUndefined();
    expect(out.result.content[0].text).toContain('Shoe size 10');
    expect(calls).toEqual([`hm_homie_gate:${KEY}`, `hm_homie_context:${KEY}`, `hm_homie_item_save:${KEY}`]);
  });
  it('says so when the key no longer works', async () => {
    const rpc = async () => {
      throw new Error('hm_homie_context: Please sign in again');
    };
    const out = (await handleMcp({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'get_overview', arguments: {} } }, KEY, rpc)) as { result: { isError: boolean } };
    expect(out.result.isError).toBe(true);
  });
  it('refuses malformed keys and GET over HTTP', async () => {
    const post = (key: string) => mcpHttp(new Request('https://x/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }) }), key, async () => null);
    expect((await post('short')).status).toBe(404);
    expect((await post(KEY)).status).toBe(200);
    expect((await mcpHttp(new Request('https://x/mcp'), KEY, async () => null)).status).toBe(405);
  });
});

import { buildNudge, cleanInterests } from '../homie';

describe('nudges', () => {
  it('says when to leave, with a busy day', () => {
    const c = briefCtx();
    c.items.push({ kind: 'busy', text: 'Demo', at: null, day: '2026-11-25', done: false });
    expect(buildNudge(c, 'leave')).toBe('Time to leave: about 60 min to office. Busy day: Demo. Out the door. Ride safe.');
  });
  it('saves a streak only when something is still open, firmer after misses', () => {
    expect(buildNudge(briefCtx(), 'saver')).toBe('Workout still not done. 3 misses this week. That stops tonight. 20 minutes, start now.');
    const done = briefCtx();
    done.home!.habits = done.home!.habits!.map((h) => ({ ...h, today: h.target }));
    expect(buildNudge(done, 'saver')).toBeNull();
  });
  it('sends you to bed 7.5 hours before wake', () => {
    expect(buildNudge(briefCtx(), 'bed')).toBe('Bed by 22:30 to be up at 06:00. Office tomorrow, leave by 08:00. Phone down.');
  });
});

describe('scout tools', () => {
  it('cleans interests', () => {
    expect(cleanInterests([' Samay Raina ', 'samay raina', '', 3, 'PSTG'])).toEqual(['Samay Raina', 'PSTG']);
  });
  it('adds and removes interests on the caller only', async () => {
    const { calls, rpc } = fakeRpc();
    const c = ctx();
    c.settings = { interests: ['Cricket'] };
    await runTool('update_interests', { add: ['Samay Raina'], remove: ['cricket'] }, c, 'tok', rpc);
    expect(calls[0]).toMatchObject({ fn: 'hm_homie_save_settings', args: { p_token: 'tok' } });
    expect((calls[0].args.p_settings as { interests: string[] }).interests).toEqual(['Samay Raina']);
  });
  it('saves a find as a private note and notifies through the given notifier', async () => {
    const { calls, rpc } = fakeRpc();
    await runTool('save_find', { title: 'Samay Raina in Bangalore', detail: 'Dec 14', url: 'https://example.com/x' }, ctx(), 'tok', rpc);
    expect(calls[0].args.p_item).toEqual({ kind: 'note', text: 'Scout: Samay Raina in Bangalore. Dec 14 https://example.com/x' });
    const sent: string[] = [];
    const out = await runTool('notify', { title: 'Homie scout', body: '1 new find' }, ctx(), 'tok', rpc, async (t, b) => (sent.push(`${t}|${b}`), 'sent to 1 device(s)'));
    expect(out.result).toBe('sent to 1 device(s)');
    expect(sent).toEqual(['Homie scout|1 new find']);
    expect((await runTool('notify', { title: 'a', body: 'b' }, ctx(), 'tok', rpc)).error).toBe(true);
  });
  it('ticks plan tasks by reading the full plan first', async () => {
    const plan = { id: 'p1', title: 'Europe', checklist: [{ id: 't1', text: 'Visa', due: null, done: false }], notes: '' };
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    const rpc = async (fn: string, args: Record<string, unknown>) => (calls.push({ fn, args }), fn === 'hm_homie_lookup' ? [plan] : null);
    const out = await runTool('tick_plan_tasks', { plan_id: 'p1', task_ids: ['t1'] }, ctx(), 'tok', rpc);
    expect(out.error).toBeUndefined();
    expect(calls[1].args.p_rows).toEqual([{ ...plan, checklist: [{ id: 't1', text: 'Visa', due: null, done: true }] }]);
  });
});

describe('Homie lock (connector)', () => {
  const KEY = 'b'.repeat(48);
  const call = (name: string, args: Record<string, unknown>, rpc: (fn: string, a: Record<string, unknown>) => Promise<unknown>) =>
    handleMcp({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name, arguments: args } }, KEY, rpc as never) as Promise<{ result: { content: { text: string }[]; isError?: boolean } }>;
  const locked = () => {
    const calls: string[] = [];
    const rpc = async (fn: string, a: Record<string, unknown>) => {
      calls.push(fn);
      if (fn === 'hm_homie_gate') return { pin: true, unlocked: false };
      if (fn === 'hm_homie_unlock') return a.p_pin === '4821' ? { ok: true } : { ok: false, reason: 'wrong' };
      if (fn === 'hm_homie_context') return ctx();
      if (fn === 'hm_homie_scout_view') return { interests: ['PSTG'] };
      return { id: 'n1' };
    };
    return { calls, rpc };
  };
  it('refuses data while locked and never loads the context', async () => {
    const { calls, rpc } = locked();
    const out = await call('get_overview', {}, rpc);
    expect(out.result.isError).toBe(true);
    expect(out.result.content[0].text).toContain('locked');
    expect(calls).toEqual(['hm_homie_gate']);
  });
  it('unlocks with the right PIN only', async () => {
    const { rpc } = locked();
    expect((await call('unlock', { pin: '1111' }, rpc)).result.isError).toBe(true);
    expect((await call('unlock', { pin: ' 4821 ' }, rpc)).result.content[0].text).toContain('Unlocked');
  });
  it('lets the scout work while locked', async () => {
    const { rpc } = locked();
    expect((await call('scout_view', {}, rpc)).result.content[0].text).toContain('PSTG');
    expect((await call('save_find', { title: 'PSTG results', detail: 'Up 6%', url: null }, rpc)).result.isError).toBeUndefined();
    expect((await call('remember', { text: 'x' }, rpc)).result.isError).toBe(true);
  });
});
