// Homie: the personal assistant. Pure helpers shared by the app and the Worker.
// Homie's data is per account (hm_homie_*), never shared with the household.

export type HomieTone = 'gentle' | 'firm' | 'drill';
export type HomieItemKind = 'fact' | 'note' | 'reminder' | 'busy';

export interface HomieSettings {
  name: string; // what the assistant is called
  tone: HomieTone;
  wake: string; // HH:MM target wake-up
  leave: string; // HH:MM leave for office
  homeBy: string; // HH:MM usually home
  commuteMin: number; // one way
  officeDays: number[]; // 0 = Sunday
  evening: string; // HH:MM evening wrap-up
  morningBrief: boolean;
  eveningBrief: boolean;
  about: string; // anything Homie should always keep in mind (goals, health, likes)
  interests: string[]; // what the daily scout watches: comedians, stocks, bands, topics
  nudges: boolean; // leave-now, streak saver and bedtime nudges
  tzOffsetMin: number; // minutes east of UTC (India = 330)
}

export const DEFAULT_HOMIE: HomieSettings = {
  name: 'Homie',
  tone: 'firm',
  wake: '06:00',
  leave: '08:00',
  homeBy: '19:30',
  commuteMin: 60,
  officeDays: [1, 2, 3, 4, 5],
  evening: '21:30',
  morningBrief: true,
  eveningBrief: true,
  about: '',
  interests: [],
  nudges: true,
  tzOffsetMin: 330,
};

export function homieSettings(raw: Partial<HomieSettings> | null | undefined): HomieSettings {
  return { ...DEFAULT_HOMIE, ...(raw ?? {}) };
}

export interface HomieItem {
  id: string;
  kind: HomieItemKind;
  text: string;
  at: string | null; // reminder time (ISO, UTC)
  day: string | null; // busy day YYYY-MM-DD
  done: boolean;
  sent: boolean;
  forgotten: boolean;
  created_at: string;
  updated_at: string;
}

export interface HomieChatLine {
  role: 'user' | 'assistant';
  text: string;
  at: string;
}

// What Homie did on one request, shown under its reply.
export interface HomieAction {
  kind: 'reminder' | 'fact' | 'note' | 'busy' | 'todo' | 'shopping' | 'expense' | 'habit' | 'done' | 'forget' | 'settings';
  label: string;
  itemId?: string; // a Homie item, so it can be undone
}

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_DT = /^(\d{4}-\d{2}-\d{2})[T ]([01]\d|2[0-3]):([0-5]\d)$/;

export const isTime = (s: unknown): s is string => typeof s === 'string' && TIME.test(s);
export const isDate = (s: unknown): s is string => typeof s === 'string' && DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

// "2026-11-26T07:30" in local time -> UTC ISO string. Null when malformed.
export function localToUtc(local: string, tzOffsetMin: number): string | null {
  const m = LOCAL_DT.exec(local.trim());
  if (!m || !isDate(m[1])) return null;
  const ms = Date.parse(`${m[1]}T${m[2]}:${m[3]}:00Z`) - tzOffsetMin * 60_000;
  return new Date(ms).toISOString();
}

// UTC ISO -> "YYYY-MM-DDTHH:MM" local.
export function utcToLocal(iso: string, tzOffsetMin: number): string {
  return new Date(Date.parse(iso) + tzOffsetMin * 60_000).toISOString().slice(0, 16);
}

// Today's date where the user is.
export function localToday(tzOffsetMin: number, now = Date.now()): string {
  return new Date(now + tzOffsetMin * 60_000).toISOString().slice(0, 10);
}

// "Thu 26 Nov, 7:30 am" for a reminder time.
export function friendlyWhen(iso: string, tzOffsetMin: number, now = Date.now()): string {
  const local = utcToLocal(iso, tzOffsetMin);
  const [d, t] = local.split('T');
  const [h, min] = t.split(':').map(Number);
  const clock = `${h % 12 || 12}${min ? `:${String(min).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`;
  const today = localToday(tzOffsetMin, now);
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  if (d === today) return `today, ${clock}`;
  if (d === tomorrow) return `tomorrow, ${clock}`;
  const dt = new Date(`${d}T00:00:00Z`);
  const day = dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${day}, ${clock}`;
}

// Cleans a settings patch from Homie's tool or the settings sheet. Unknown or bad fields are dropped.
export function cleanSettingsPatch(patch: Record<string, unknown>): Partial<HomieSettings> {
  const out: Partial<HomieSettings> = {};
  for (const k of ['wake', 'leave', 'homeBy', 'evening'] as const) if (isTime(patch[k])) out[k] = patch[k];
  if (patch.tone === 'gentle' || patch.tone === 'firm' || patch.tone === 'drill') out.tone = patch.tone;
  if (typeof patch.name === 'string' && patch.name.trim()) out.name = patch.name.trim().slice(0, 24);
  if (typeof patch.commuteMin === 'number' && patch.commuteMin >= 0 && patch.commuteMin <= 300) out.commuteMin = Math.round(patch.commuteMin);
  if (Array.isArray(patch.officeDays) && patch.officeDays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
    out.officeDays = [...new Set(patch.officeDays as number[])].sort();
  }
  for (const k of ['morningBrief', 'eveningBrief', 'nudges'] as const) if (typeof patch[k] === 'boolean') out[k] = patch[k];
  if (Array.isArray(patch.interests)) out.interests = cleanInterests(patch.interests);
  if (typeof patch.about === 'string') out.about = patch.about.slice(0, 4000);
  return out;
}

// Reminders still to come first (soonest first), then the rest newest first.
export function sortItems(items: HomieItem[]): HomieItem[] {
  const open = items.filter((i) => i.kind === 'reminder' && !i.done).sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''));
  const rest = items.filter((i) => !(i.kind === 'reminder' && !i.done)).sort((a, b) => b.created_at.localeCompare(a.created_at));
  return [...open, ...rest];
}

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ---------- briefs without AI ----------

export interface BriefContext {
  now: string; // local YYYY-MM-DDTHH:MM
  settings: Partial<HomieSettings>;
  items: { kind: string; text: string; at: string | null; day: string | null; done: boolean }[];
  home: {
    habits?: { name: string; kind: string; target: number; schedule: string; days: number[] | null; perWeek: number | null; today: number; daysDoneLast7: number }[];
    billsDue?: { name: string; due: string }[];
    plans?: { title: string; start: string; end: string }[];
    todos?: { title: string; due: string | null }[];
  } | null;
}

const PUSH: Record<HomieTone, { morning: string; evening: string }> = {
  gentle: { morning: "You've got this.", evening: 'Rest well.' },
  firm: { morning: 'No excuses today.', evening: 'Phone down on time.' },
  drill: { morning: 'Up and moving. Now.', evening: 'Lights out. No negotiating.' },
};

const addDay = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const weekday = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const clock = (m: number) => {
  const x = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
};
const list = (xs: string[], max = 3) => (xs.length > max ? `${xs.slice(0, max).join(', ')} +${xs.length - max}` : xs.join(', '));

// Habits that are on for a day (weekly ones only while the week's count isn't met).
function habitsDue(ctx: BriefContext, day: string) {
  return (ctx.home?.habits ?? []).filter((h) =>
    h.schedule === 'days' ? (h.days ?? []).includes(weekday(day)) : h.schedule === 'weekly' ? h.daysDoneLast7 < (h.perWeek ?? 1) : true,
  );
}

function remindersOn(ctx: BriefContext, day: string, tz: number) {
  return ctx.items
    .filter((i) => i.kind === 'reminder' && !i.done && i.at && utcToLocal(i.at, tz).slice(0, 10) === day)
    .sort((a, b) => a.at!.localeCompare(b.at!))
    .map((i) => `${utcToLocal(i.at!, tz).slice(11)} ${i.text}`);
}

// A short notification for the morning or the evening, built from the same data Homie sees.
export function buildBrief(ctx: BriefContext, kind: 'morning' | 'evening'): string {
  const s = homieSettings(ctx.settings);
  const today = ctx.now.slice(0, 10);
  const day = kind === 'morning' ? today : addDay(today, 1);
  const parts: string[] = [];
  const office = s.officeDays.includes(weekday(day));
  const busy = ctx.items.filter((i) => i.kind === 'busy' && i.day === day).map((i) => i.text);
  const rem = remindersOn(ctx, day, s.tzOffsetMin);

  if (kind === 'morning') {
    parts.push(office ? `Office day: leave by ${s.leave}.` : 'No office today.');
    if (busy.length) parts.push(`Busy: ${list(busy, 2)}.`);
    const habits = habitsDue(ctx, day).filter((h) => h.today < h.target).map((h) => h.name);
    if (habits.length) parts.push(`Habits: ${list(habits)}.`);
    if (rem.length) parts.push(`${rem.length} reminder${rem.length > 1 ? 's' : ''}: ${list(rem, 2)}.`);
    const bills = (ctx.home?.billsDue ?? []).filter((b) => b.due <= today).map((b) => b.name);
    if (bills.length) parts.push(`Bills due: ${list(bills)}.`);
    const plans = (ctx.home?.plans ?? []).filter((p) => p.start <= today && p.end >= today).map((p) => p.title);
    if (plans.length) parts.push(`Today: ${list(plans, 2)}.`);
    parts.push(PUSH[s.tone].morning);
  } else {
    const due = habitsDue(ctx, today);
    const done = due.filter((h) => h.today >= h.target).map((h) => h.name);
    const missed = due.filter((h) => h.today < h.target).map((h) => h.name);
    if (done.length || missed.length) parts.push(missed.length ? `Done: ${done.length}/${due.length}. Still open: ${list(missed)}.` : `All ${done.length} habits done today.`);
    parts.push(office ? `Tomorrow is an office day, leave by ${s.leave}.` : 'No office tomorrow.');
    if (busy.length) parts.push(`Busy tomorrow: ${list(busy, 2)}.`);
    if (rem.length) parts.push(`First up: ${rem[0]}.`);
    parts.push(`Bed by ${clock(minutes(s.wake) - 450)} to wake at ${s.wake}. ${PUSH[s.tone].evening}`);
  }
  return parts.join(' ');
}

export function cleanInterests(list: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of list) {
    if (typeof x !== 'string') continue;
    const v = x.trim().slice(0, 80);
    if (v && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase());
      out.push(v);
    }
  }
  return out.slice(0, 40);
}

// ---------- nudges (always rule-based) ----------

const SAVER: Record<HomieTone, (open: string, missed: number) => string> = {
  gentle: (open, missed) => `${open} still open today.${missed >= 3 ? ` It's been a few days, a short one counts.` : ''} Even 15 minutes keeps the streak alive.`,
  firm: (open, missed) => `${open} still not done.${missed >= 3 ? ` ${missed} misses this week. That stops tonight.` : ''} 20 minutes, start now.`,
  drill: (open, missed) => `${open}. Not done. ${missed >= 3 ? `${missed} misses this week. Unacceptable. ` : ''}Get up and do it. Now.`,
};

// Leave-now, streak saver and bedtime nudges. Null when there is nothing worth saying.
export function buildNudge(ctx: BriefContext, kind: 'leave' | 'saver' | 'bed'): string | null {
  const s = homieSettings(ctx.settings);
  const today = ctx.now.slice(0, 10);
  if (kind === 'leave') {
    const busy = ctx.items.filter((i) => i.kind === 'busy' && i.day === today).map((i) => i.text);
    const tail = s.tone === 'gentle' ? 'Ride safe.' : s.tone === 'drill' ? 'Helmet on. Move.' : 'Out the door. Ride safe.';
    return `Time to leave: about ${s.commuteMin} min to office.${busy.length ? ` Busy day: ${busy[0]}.` : ''} ${tail}`;
  }
  if (kind === 'saver') {
    const open = habitsDue(ctx, today).filter((h) => h.today < h.target);
    if (!open.length) return null;
    // Missed days this week for the most-skipped open habit.
    const missed = Math.max(...open.map((h) => Math.max(0, (h.schedule === 'weekly' ? (h.perWeek ?? 1) : h.schedule === 'days' ? (h.days ?? []).length : 7) - h.daysDoneLast7)));
    return SAVER[s.tone](list(open.map((h) => h.name)), missed);
  }
  const bed = clock(minutes(s.wake) - 450);
  const office = s.officeDays.includes(weekday(addDay(today, 1)));
  const tail = s.tone === 'gentle' ? 'Sleep well.' : s.tone === 'drill' ? 'Screens off. Now.' : 'Phone down.';
  return `Bed by ${bed} to be up at ${s.wake}.${office ? ` Office tomorrow, leave by ${s.leave}.` : ''} ${tail}`;
}
