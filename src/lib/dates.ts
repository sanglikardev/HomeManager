const DAY_MS = 24 * 60 * 60 * 1000;

export function localDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const d = parseLocalDate(s);
  d.setDate(d.getDate() + n);
  return localDate(d);
}

export function daysBetween(fromIso: string | null, to: Date): number {
  if (!fromIso) return Infinity;
  return Math.max(0, (to.getTime() - new Date(fromIso).getTime()) / DAY_MS);
}

// Whole calendar days between two YYYY-MM-DD dates.
export function dateDiff(a: string, b: string): number {
  return Math.round((parseLocalDate(b).getTime() - parseLocalDate(a).getTime()) / DAY_MS);
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function friendlyDate(s: string, today: string = localDate()): string {
  const diff = dateDiff(s, today);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  const d = parseLocalDate(s);
  return `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${d.toLocaleString('en', { month: 'short' })}`;
}

// Small deterministic hash, used to rotate ties differently each day.
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}
