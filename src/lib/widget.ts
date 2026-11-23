// iPhone home-screen widget for the Scriptable app.
// The script people paste is a small loader with their private key; it fetches the
// layout (WIDGET_BODY) from /api/widget.js, so layout changes need no re-paste.

// Runs inside Scriptable as an async function of (KEY, SITE).
export const WIDGET_BODY = `
let d;
try {
  d = await new Request(SITE + '/api/widget?k=' + KEY).loadJSON();
} catch (e) {
  d = { ok: false, offline: true };
}

const size = config.widgetFamily || 'medium';
// Widget parameter "habits" (long-press the widget, Edit Widget, Parameter) shows only habits.
const mode = String((typeof args !== 'undefined' && args.widgetParameter) || '').trim().toLowerCase();
const w = new ListWidget();
w.backgroundColor = new Color('#0f766e');
w.url = mode === 'habits' ? SITE + '/#habits' : SITE;
w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
w.setPadding(12, 14, 12, 14);

// Each line opens its own screen (medium and large widgets; small opens the app).
const line = (text, screen, opts = {}) => {
  const row = w.addStack();
  if (screen && size !== 'small') row.url = SITE + '/#' + screen;
  const t = row.addText(text);
  t.font = opts.bold ? Font.boldSystemFont(opts.size || 13) : Font.systemFont(opts.size || (size === 'small' ? 12 : 13));
  t.textColor = opts.color || Color.white();
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.8;
  row.addSpacer();
  if (screen && size !== 'small') {
    const arrow = row.addText('›');
    arrow.font = Font.systemFont(13);
    arrow.textColor = new Color('#99f6e4');
  }
  w.addSpacer(3);
};

const habits = (d.ok && d.habits) || [];
const doneCount = habits.filter((h) => h.done).length;
const num = (n) => String(Math.round(Number(n) * 100) / 100);
const habitText = (h) =>
  (h.done ? '✓ ' : '○ ') + (h.emoji ? h.emoji + ' ' : '') + h.name +
  (h.kind === 'count' && !h.done ? '  ' + num(h.amount) + '/' + num(h.target) + (h.unit ? ' ' + h.unit : '') : '');

if (mode === 'habits') {
  line(d.ok ? 'Habits · ' + doneCount + ' of ' + habits.length + ' done' : 'HomeManager', 'habits', { bold: true, size: 12, color: new Color('#99f6e4') });
} else {
  line(d.ok ? d.home || 'Home' : 'HomeManager', 'today', { bold: true, size: 12, color: new Color('#99f6e4') });
}
w.addSpacer(3);

if (!d.ok) {
  line(d.offline ? 'Offline. Will try again soon.' : 'Widget key expired. Make a new one in Settings.');
} else if (mode === 'habits') {
  const max = size === 'small' ? 4 : size === 'large' ? 12 : 5;
  if (!habits.length) line('No habits today. Add some in the app.', 'habits');
  habits.slice(0, max).forEach((h) => line(habitText(h), 'habits', h.done ? { color: new Color('#99f6e4') } : {}));
  if (habits.length > max) line('+' + (habits.length - max) + ' more', 'habits', { color: new Color('#99f6e4') });
} else {
  const lines = [];
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  for (const m of d.meals) lines.push([cap(m.slot) + ': ' + m.label, 'today']);
  if (habits.length) lines.push([doneCount === habits.length ? 'Habits: all ' + habits.length + ' done ✓' : 'Habits: ' + doneCount + ' of ' + habits.length + ' done', 'habits']);
  for (const p of d.parts || (d.items || []).map((text) => ({ text }))) lines.push(['• ' + p.text, p.screen]);
  if (d.next) lines.push([d.next.title + (d.next.days === 0 ? ' today' : d.next.days === 1 ? ' tomorrow' : ' in ' + d.next.days + ' days'), 'plans']);
  if (!lines.length) lines.push(['All clear today ✓', 'today']);
  const max = size === 'small' ? 4 : size === 'large' ? 12 : 5;
  lines.slice(0, max).forEach(([text, screen]) => line(text, screen));
  if (lines.length > max) line('+' + (lines.length - max) + ' more', 'today', { color: new Color('#99f6e4') });
}
w.addSpacer();

if (config.runsInWidget) Script.setWidget(w);
else await w.presentMedium();
Script.complete();
`;

export function widgetScript(key: string, site: string): string {
  return `// HomeManager widget for the Scriptable app.
// Keep this private: anyone with this script can see your home's summary.
const KEY = '${key}';
const SITE = '${site}';
const code = await new Request(SITE + '/api/widget.js').loadString();
const run = new (Object.getPrototypeOf(async function () {}).constructor)('KEY', 'SITE', code);
await run(KEY, SITE);
`;
}
