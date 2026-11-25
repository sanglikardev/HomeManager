import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildBrief, buildNudge, homieSettings, type BriefContext } from '../homie';
import { missedGym, phaseFor, plannedType, todaySession, weekStrip, type Workout } from '../training';
import { runTool, trainingView, type HomieContext } from '../../../worker/homie';

const t = { trainingStart: '2026-11-23', gymDays: [1, 2, 4, 6], goalDate: '2028-01-10' }; // starts on a Monday
const log = (date: string, extra: Partial<Workout> = {}): Workout => ({ date, session: 'lowerA', done: [], complete: true, knee: null, note: '', ...extra });

describe('training phases', () => {
  it('moves through the phases toward the trip', () => {
    expect(phaseFor(t, '2026-11-25')).toMatchObject({ phase: 'foundation', week: 1 });
    expect(phaseFor(t, '2027-02-01').phase).toBe('strength'); // week 11
    expect(phaseFor(t, '2027-06-01').phase).toBe('power'); // week 28
    expect(phaseFor(t, '2027-09-01').phase).toBe('build');
    expect(phaseFor(t, '2027-11-01').phase).toBe('ski'); // 10 weeks out
    expect(phaseFor(t, '2027-12-30').phase).toBe('taper');
    expect(phaseFor(t, '2028-02-01').phase).toBe('maintain');
  });
  it('rotates gym days and fills the rest with knee rehab', () => {
    expect(['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-28', '2026-11-29'].map((d) => plannedType(t, d))).toEqual(['lowerA', 'upper', 'rehab', 'lowerB', 'condition', 'rest']);
  });
});

describe('today session', () => {
  it('is null before the plan starts', () => {
    expect(todaySession({ ...t, trainingStart: '' }, '2026-11-25', [])).toBeNull();
  });
  it('adds jumps only from the power phase', () => {
    expect(todaySession(t, '2026-11-23', [])!.exercises.map((e) => e.key)).not.toContain('jumps');
    expect(todaySession(t, '2027-06-07', [])!.exercises.map((e) => e.key)).toContain('jumps');
  });
  it('scales down after knee pain and sends 6+ to the physio', () => {
    const sore = todaySession(t, '2027-06-07', [log('2027-06-05', { knee: 5 })])!;
    expect(sore.type).toBe('rehab');
    expect(sore.note).toContain('5/10');
    const bad = todaySession(t, '2027-06-07', [log('2027-06-06', { knee: 7 })])!;
    expect(bad.type).toBe('rest');
    expect(bad.note).toContain('physio');
  });
  it('counts missed gym days in the last week', () => {
    const w = [log('2026-11-30'), log('2026-12-01', { complete: false })];
    expect(weekStrip(t, '2026-12-06', w).filter((d) => d.done)).toHaveLength(1);
    expect(missedGym(t, '2026-12-07', w)).toBe(3); // Tue, Thu, Sat missed
  });
});

const ctx = (): BriefContext => ({ now: '2026-11-26T06:05', settings: { ...t }, items: [], home: { habits: [] }, workouts: [] });

describe('training in briefs and nudges', () => {
  it('puts the session in the morning brief and the evening wrap-up', () => {
    expect(buildBrief(ctx(), 'morning')).toBe('Office day: leave by 08:00. Training: Legs B: single leg and side to side (55 min). No excuses today.');
    expect(buildBrief({ ...ctx(), now: '2026-11-26T21:30' }, 'evening')).toContain('Training not logged: Legs B');
  });
  it('the streak saver chases an unlogged gym session', () => {
    expect(buildNudge(ctx(), 'saver')).toBe('Legs B: single leg and side to side still not done. 20 minutes, start now.');
    expect(buildNudge({ ...ctx(), workouts: [log('2026-11-26')] }, 'saver')).toBeNull();
  });
  it('keeps training out when no plan is started', () => {
    expect(buildBrief({ ...ctx(), settings: {} }, 'morning')).not.toContain('Training');
    expect(homieSettings({}).trainingStart).toBe('');
  });
});

describe('training tools', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-26T13:30:00Z')); // 19:00 in India
  });
  afterAll(() => vi.useRealTimers());
  const hctx = (): HomieContext => ({ now: '2026-11-26T19:00', weekday: 'Thursday', username: 'dev', settings: { ...t }, items: [], chat: [], home: null, workouts: [] });
  it('shows today in the overview', () => {
    expect(trainingView(hctx())!.today.type).toBe('lowerB');
  });
  it('logs a workout for a past day with knee pain, own token only', async () => {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    const rpc = async (fn: string, args: Record<string, unknown>) => (calls.push({ fn, args }), null);
    const out = await runTool('log_workout', { date: '2026-11-24', complete: true, exercises: null, knee: 3, note: 'Bench 60 kg' }, hctx(), 'tok', rpc);
    expect(out.error).toBeUndefined();
    expect(calls[0]).toMatchObject({ fn: 'hm_homie_workout_save', args: { p_token: 'tok', p_workout: { date: '2026-11-24', session: 'upper', complete: true, knee: 3, note: 'Bench 60 kg' } } });
    expect((await runTool('log_workout', { date: '2020-01-01', complete: true, exercises: null, knee: null, note: null }, hctx(), 'tok', rpc)).error).toBe(true);
  });
  it('starts and stops the plan', async () => {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    const rpc = async (fn: string, args: Record<string, unknown>) => (calls.push({ fn, args }), null);
    const c = hctx();
    c.settings = {};
    expect((await runTool('log_workout', { date: null, complete: true, exercises: null, knee: null, note: null }, c, 'tok', rpc)).error).toBe(true);
    await runTool('set_training', { start: '2026-11-26', gymDays: [1, 3, 5], goalDate: null }, c, 'tok', rpc);
    expect(calls[0].args.p_settings).toMatchObject({ trainingStart: '2026-11-26', gymDays: [1, 3, 5], goalDate: '2028-01-10' });
  });
});
