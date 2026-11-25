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
  for (const k of ['morningBrief', 'eveningBrief'] as const) if (typeof patch[k] === 'boolean') out[k] = patch[k];
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
