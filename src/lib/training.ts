// Homie's training plan: gym plus knee rehab, in phases toward a goal date (the ski trip).
// Rule-based and private to each person. Not medical advice: knee pain scales the day down and
// points to the physio.

export type Phase = 'foundation' | 'strength' | 'power' | 'build' | 'ski' | 'taper' | 'maintain';
export type SessionType = 'lowerA' | 'upper' | 'lowerB' | 'condition' | 'rehab' | 'rest';
type Kind = 'main' | 'acc' | 'hold' | 'plyo' | 'cardio' | 'rehab';

export interface Workout {
  date: string; // YYYY-MM-DD, local
  session: string;
  done: string[]; // exercise keys ticked
  complete: boolean;
  knee: number | null; // knee pain 0-10 after the session
  note: string;
}

export interface TrainingSettings {
  trainingStart: string; // YYYY-MM-DD, '' = plan not started
  gymDays: number[]; // 0 = Sunday
  goalDate: string; // YYYY-MM-DD
}

export interface Exercise {
  key: string;
  name: string;
  dose: string;
  cue: string;
}

export interface TodaySession {
  type: SessionType;
  title: string;
  minutes: number;
  phase: Phase;
  phaseLabel: string;
  week: number; // 1-based week of the plan
  weeksToGoal: number;
  deload: boolean;
  note: string; // knee or deload advice, '' if none
  exercises: Exercise[];
}

export const PHASE_LABEL: Record<Phase, string> = {
  foundation: 'Foundation: control and range',
  strength: 'Strength',
  power: 'Power and landing',
  build: 'Build',
  ski: 'Ski-ready',
  taper: 'Taper: fresh legs for the trip',
  maintain: 'Maintain',
};

// Sets and reps by phase for each kind of exercise.
const DOSE: Record<Phase, Record<Kind, string>> = {
  foundation: { main: '3 × 12, light, slow down', acc: '3 × 12', hold: '3 × 30 s', plyo: '', cardio: '10 min easy', rehab: '2 × 12' },
  strength: { main: '4 × 6-8, heavy, 2 reps in reserve', acc: '3 × 10', hold: '3 × 45 s', plyo: '', cardio: '6 × 1 min hard, 1 min easy', rehab: '2 × 12' },
  power: { main: '4 × 5, fast up, slow down', acc: '3 × 8', hold: '3 × 45 s', plyo: '4 × 5, stick each landing', cardio: '8 × 30 s hard, 90 s easy', rehab: '2 × 10' },
  build: { main: '4 × 6', acc: '3 × 10', hold: '3 × 60 s', plyo: '3 × 6, stick each landing', cardio: '6 × 1 min hard, 1 min easy', rehab: '2 × 10' },
  ski: { main: '3 × 10-12, slow down', acc: '3 × 12', hold: '3 × 60-90 s', plyo: '3 × 20 s', cardio: '8 × 1 min hard, 1 min easy', rehab: '2 × 10' },
  taper: { main: '2 × 8, moderate', acc: '2 × 10', hold: '2 × 45 s', plyo: '2 × 5, easy', cardio: '15 min easy', rehab: '2 × 10' },
  maintain: { main: '3 × 8', acc: '3 × 10', hold: '3 × 45 s', plyo: '3 × 5', cardio: '20 min easy', rehab: '2 × 10' },
};

const EX: Record<string, { name: string; kind: Kind; cue: string; dose?: string }> = {
  warm: { name: 'Bike or brisk walk warm-up', kind: 'rehab', cue: 'Easy pace, knee warm before loading.', dose: '8 min' },
  squat: { name: 'Goblet or back squat', kind: 'main', cue: 'Knees track over toes, even weight both legs.' },
  split: { name: 'Bulgarian split squat', kind: 'main', cue: 'Start with the operated leg. Same reps both sides.' },
  rdl: { name: 'Romanian deadlift', kind: 'main', cue: 'Hips back, flat back, feel the hamstrings.' },
  curl: { name: 'Hamstring curl (slow lowering)', kind: 'acc', cue: '3 seconds down. Hamstrings protect the ACL.' },
  ext: { name: 'Leg extension, slow', kind: 'acc', cue: 'Smooth, no snapping the knee straight.' },
  calf: { name: 'Single-leg calf raise', kind: 'acc', cue: 'Full range, pause at the top.' },
  copen: { name: 'Copenhagen plank', kind: 'hold', cue: 'Short lever (knee on bench) to start.' },
  stepup: { name: 'Step-up (knee height)', kind: 'main', cue: 'Drive through the top leg, no push from the bottom foot.' },
  slrdl: { name: 'Single-leg RDL', kind: 'acc', cue: 'Hips square, slow and balanced.' },
  latlunge: { name: 'Lateral lunge', kind: 'acc', cue: 'Sit back into the hip, knee over the foot.' },
  slpress: { name: 'Single-leg leg press', kind: 'main', cue: 'Compare legs: the operated one should match.' },
  band: { name: 'Lateral band walk', kind: 'acc', cue: 'Knees out, small steps.' },
  side: { name: 'Side plank', kind: 'hold', cue: 'Straight line, hips high.' },
  bench: { name: 'Bench press or push-ups', kind: 'main', cue: 'Shoulder blades back.' },
  row: { name: 'Dumbbell or cable row', kind: 'main', cue: 'Pull to the hip, pause.' },
  ohp: { name: 'Overhead press', kind: 'acc', cue: 'Ribs down, glutes tight.' },
  pull: { name: 'Pull-ups or lat pulldown', kind: 'acc', cue: 'Full hang to chest up.' },
  deadbug: { name: 'Dead bug', kind: 'hold', cue: 'Low back stays on the floor.' },
  carry: { name: "Farmer's carry", kind: 'hold', cue: 'Tall, slow steps.' },
  pallof: { name: 'Pallof press', kind: 'acc', cue: "Don't let the band twist you." },
  intervals: { name: 'Bike or rower intervals', kind: 'cardio', cue: 'Hard means you can only say a few words.' },
  balance: { name: 'Single-leg balance', kind: 'rehab', cue: 'Eyes closed or on a cushion once it gets easy.', dose: '3 × 30 s each leg' },
  spanish: { name: 'Spanish squat hold (band behind knees)', kind: 'rehab', cue: 'Shins vertical, sit back.', dose: '5 × 30-45 s' },
  stepdown: { name: 'Slow step-down from a low step', kind: 'rehab', cue: 'Knee stays over the middle toe, 3 seconds down.' },
  bridge: { name: 'Single-leg glute bridge', kind: 'rehab', cue: 'Squeeze at the top.' },
  jumps: { name: 'Box jump or squat jump', kind: 'plyo', cue: 'Land soft and quiet, knees out. Step down, never jump down.' },
  bounds: { name: 'Lateral bound', kind: 'plyo', cue: 'Stick the landing on one leg for 2 seconds.' },
  wallsit: { name: 'Wall sit', kind: 'hold', cue: 'Thighs parallel, like a ski tuck.' },
  skier: { name: 'Skier hops (side to side)', kind: 'plyo', cue: 'Quick, light feet, both knees bent.' },
  mobility: { name: 'Knee and hip mobility', kind: 'rehab', cue: 'Heel slides, quad and calf stretch, foam roll.', dose: '10 min' },
  walk: { name: 'Easy walk', kind: 'cardio', cue: 'Just move.', dose: '20-30 min' },
};

const PLYO_PHASES: Phase[] = ['power', 'build', 'ski', 'taper', 'maintain'];

function sessionKeys(type: SessionType, phase: Phase): string[] {
  const plyo = PLYO_PHASES.includes(phase);
  switch (type) {
    case 'lowerA':
      return ['warm', ...(plyo ? ['jumps'] : []), 'squat', 'split', 'rdl', 'curl', ...(phase === 'ski' ? ['wallsit'] : ['ext']), 'calf', 'copen'];
    case 'lowerB':
      return ['warm', ...(plyo ? [phase === 'ski' ? 'skier' : 'bounds'] : []), 'stepup', 'slpress', 'slrdl', 'latlunge', 'band', 'side', 'balance'];
    case 'upper':
      return ['warm', 'bench', 'row', 'ohp', 'pull', 'deadbug', 'balance', 'calf'];
    case 'condition':
      return ['warm', 'row', 'bench', 'pallof', 'carry', 'intervals', 'stepdown'];
    case 'rehab':
      return ['warm', 'spanish', 'stepdown', 'balance', 'bridge', 'calf'];
    case 'rest':
      return ['mobility', 'walk'];
  }
}

const TITLE: Record<SessionType, string> = {
  lowerA: 'Legs A: squat and hamstrings',
  lowerB: 'Legs B: single leg and side to side',
  upper: 'Upper body and core',
  condition: 'Conditioning',
  rehab: 'Knee rehab',
  rest: 'Rest and mobility',
};
const MINUTES: Record<SessionType, number> = { lowerA: 60, lowerB: 55, upper: 50, condition: 45, rehab: 15, rest: 15 };
const ROTATION: SessionType[] = ['lowerA', 'upper', 'lowerB', 'condition'];

export const DEFAULT_TRAINING: TrainingSettings = { trainingStart: '', gymDays: [1, 2, 4, 6], goalDate: '2028-01-10' };

const dayNum = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86_400_000);
const weekday = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export function phaseFor(t: TrainingSettings, day: string): { phase: Phase; week: number; weeksToGoal: number; deload: boolean } {
  const week = Math.max(0, Math.floor((dayNum(day) - dayNum(t.trainingStart)) / 7));
  const weeksToGoal = Math.ceil((dayNum(t.goalDate) - dayNum(day)) / 7);
  let phase: Phase;
  if (weeksToGoal <= 0) phase = 'maintain';
  else if (weeksToGoal <= 2) phase = 'taper';
  else if (weeksToGoal <= 16 && week >= 8) phase = 'ski';
  else if (week < 8) phase = 'foundation';
  else if (week < 24) phase = 'strength';
  else if (week < 40) phase = 'power';
  else phase = 'build';
  // Every 6th week is lighter, except in the taper.
  const deload = week % 6 === 5 && phase !== 'taper' && phase !== 'foundation';
  return { phase, week: week + 1, weeksToGoal: Math.max(0, weeksToGoal), deload };
}

// The planned session type for a day: gym days rotate legs A, upper, legs B, conditioning;
// other days are short knee rehab, Sunday is rest unless it's a gym day.
export function plannedType(t: TrainingSettings, day: string): SessionType {
  const gym = [...t.gymDays].sort();
  const i = gym.indexOf(weekday(day));
  if (i >= 0) return gym.length === 3 ? (['lowerA', 'upper', 'lowerB'] as SessionType[])[i] : ROTATION[i % 4];
  return weekday(day) === 0 ? 'rest' : 'rehab';
}

export const isGymType = (type: string) => type === 'lowerA' || type === 'lowerB' || type === 'upper' || type === 'condition';

// Today's session, scaled down when the knee has been hurting. Null when the plan isn't started.
export function todaySession(t: TrainingSettings, day: string, workouts: Workout[]): TodaySession | null {
  if (!t.trainingStart || day < t.trainingStart) return null;
  const { phase, week, weeksToGoal, deload } = phaseFor(t, day);
  let type = plannedType(t, day);
  const recent = workouts.filter((w) => w.knee != null && w.date < day && w.date >= addDays(day, -2)).sort((a, b) => b.date.localeCompare(a.date));
  const lastKnee = recent[0]?.knee ?? 0;
  const sore7 = workouts.filter((w) => (w.knee ?? 0) >= 4 && w.date >= addDays(day, -7)).length;
  const notes: string[] = [];
  if (lastKnee >= 6) {
    type = 'rest';
    notes.push(`Knee was ${lastKnee}/10 last time: no training today, and get your physio to check it.`);
  } else if (lastKnee >= 4) {
    if (isGymType(type) && type !== 'upper') type = 'rehab';
    notes.push(`Knee was ${lastKnee}/10 last time: no jumps or heavy legs today.`);
  }
  if (sore7 >= 2 && lastKnee < 6) notes.push('Knee pain keeps coming back this week: show your physio.');
  if (deload && isGymType(type)) notes.push('Lighter week: same moves, about two thirds of the weight.');
  const exercises = sessionKeys(type, phase)
    .filter((k) => !(lastKnee >= 4 && EX[k].kind === 'plyo'))
    .map((key) => ({ key, name: EX[key].name, dose: EX[key].dose ?? DOSE[phase][EX[key].kind], cue: EX[key].cue }));
  return { type, title: TITLE[type], minutes: MINUTES[type], phase, phaseLabel: PHASE_LABEL[phase], week, weeksToGoal, deload, note: notes.join(' '), exercises };
}

// The last 7 days ending today: what was planned and whether it was done.
export function weekStrip(t: TrainingSettings, day: string, workouts: Workout[]) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(day, i - 6);
    const w = workouts.find((x) => x.date === d);
    return { date: d, type: plannedType(t, d), done: !!w?.complete, partial: !!w && !w.complete && w.done.length > 0, knee: w?.knee ?? null };
  });
}

// Gym sessions planned in the 7 days before today that weren't completed.
export function missedGym(t: TrainingSettings, day: string, workouts: Workout[]): number {
  if (!t.trainingStart) return 0;
  return weekStrip(t, addDays(day, -1), workouts).filter((d) => d.date >= t.trainingStart && isGymType(d.type) && !d.done).length;
}

export function cleanWorkout(input: { date: string; session: string; done?: unknown; complete?: unknown; knee?: unknown; note?: unknown }): Workout {
  const done = Array.isArray(input.done) ? [...new Set(input.done.filter((k): k is string => typeof k === 'string' && k in EX))] : [];
  const knee = typeof input.knee === 'number' && input.knee >= 0 && input.knee <= 10 ? Math.round(input.knee) : null;
  return { date: input.date, session: input.session, done, complete: input.complete === true, knee, note: typeof input.note === 'string' ? input.note.trim().slice(0, 500) : '' };
}
