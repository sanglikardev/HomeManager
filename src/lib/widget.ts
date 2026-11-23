// iPhone home-screen widget for the Scriptable app.
// The script people paste is a small loader with their private key; it fetches the
// layout (WIDGET_BODY) from /api/widget.js, so layout changes need no re-paste.
//
// By default the widget shows today's habits. Tapping a habit runs this script in
// Scriptable with ?toggle=<habit id>: it ticks or unticks the habit (POST
// /api/widget/toggle) and shows the updated widget. Nothing opens in the browser.
// iOS only allows true in-place widget buttons for App Store apps, so Scriptable
// comes to the front for a moment. Widget Parameter "home" shows the old home summary.

// Runs inside Scriptable as an async function of (KEY, SITE).
export const WIDGET_BODY = `
const A = typeof args !== 'undefined' ? args : {};
const params = A.queryParameters || {};
const mode = String(A.widgetParameter || '').trim().toLowerCase();
const size = config.widgetFamily || 'medium';
const RUN = URLScheme.forRunningScript();
const runWith = (q) => RUN + (RUN.indexOf('?') >= 0 ? '&' : '?') + q;

async function toggle(id) {
  try {
    const r = new Request(SITE + '/api/widget/toggle?k=' + encodeURIComponent(KEY) + '&h=' + encodeURIComponent(id));
    r.method = 'POST';
    return await r.loadJSON();
  } catch (e) {
    return { ok: false, offline: true };
  }
}

async function load() {
  try {
    return await new Request(SITE + '/api/widget?k=' + encodeURIComponent(KEY)).loadJSON();
  } catch (e) {
    return { ok: false, offline: true };
  }
}

// Tapped a habit on the widget.
let toggled = null;
if (params.toggle) toggled = await toggle(params.toggle);

let d = await load();

// Opened in Scriptable without a habit (e.g. tapped a small widget): pick one from a list.
if (!config.runsInWidget && !params.toggle && mode !== 'home' && d.ok && (d.habits || []).length) {
  const a = new Alert();
  a.title = 'Tick a habit';
  for (const h of d.habits) a.addAction((h.done ? '✓ ' : '') + (h.emoji ? h.emoji + ' ' : '') + h.name);
  a.addCancelAction('Close');
  const i = await a.presentSheet();
  if (i >= 0) {
    toggled = await toggle(d.habits[i].id);
    d = await load();
  }
}

const WHITE = Color.white();
const SOFT = new Color('#99f6e4');
const DIM = new Color('#ccfbf1', 0.75);
const GREEN = new Color('#34d399');
const num = (n) => String(Math.round(Number(n) * 100) / 100);

function bar(width, height, frac, fill) {
  const c = new DrawContext();
  c.size = new Size(width, height);
  c.opaque = false;
  c.respectScreenScale = true;
  const back = new Path();
  back.addRoundedRect(new Rect(0, 0, width, height), height / 2, height / 2);
  c.addPath(back);
  c.setFillColor(new Color('#ffffff', 0.18));
  c.fillPath();
  if (frac > 0) {
    const front = new Path();
    front.addRoundedRect(new Rect(0, 0, Math.max(height, width * Math.min(1, frac)), height), height / 2, height / 2);
    c.addPath(front);
    c.setFillColor(fill);
    c.fillPath();
  }
  return c.getImage();
}

function text(stack, value, font, color) {
  const t = stack.addText(value);
  t.font = font;
  t.textColor = color || WHITE;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.75;
  return t;
}

function icon(stack, name, color, side) {
  const s = SFSymbol.named(name);
  s.applyFont(Font.systemFont(side));
  const img = stack.addImage(s.image);
  img.imageSize = new Size(side, side);
  img.tintColor = color;
  return img;
}

function dateLabel() {
  const n = new Date();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return days[n.getDay()] + ' ' + n.getDate() + ' ' + months[n.getMonth()];
}

function subLine(h) {
  if (h.kind === 'count') return num(h.amount) + ' / ' + num(h.target) + (h.unit ? ' ' + h.unit : '');
  if (h.schedule === 'weekly') return (h.week_done || 0) + ' of ' + h.per_week + ' this week';
  return h.done ? 'Done today' : 'Not yet';
}

// One habit: emoji, name (+ progress), and a tick / plus on the right. Tapping toggles it.
function habitRow(parent, h, opts) {
  const r = parent.addStack();
  r.layoutHorizontally();
  r.centerAlignContent();
  r.backgroundColor = h.done ? new Color('#34d399', 0.2) : new Color('#ffffff', 0.09);
  r.cornerRadius = 12;
  r.setPadding(opts.compact ? 5 : 6, 8, opts.compact ? 5 : 6, 8);
  if (opts.width) r.size = new Size(opts.width, 0);
  if (size !== 'small') r.url = runWith('toggle=' + encodeURIComponent(h.id));
  text(r, h.emoji || '•', Font.systemFont(opts.compact ? 14 : 17));
  r.addSpacer(7);
  const mid = r.addStack();
  mid.layoutVertically();
  text(mid, h.name, Font.semiboldSystemFont(opts.compact ? 12 : 13), h.done ? SOFT : WHITE);
  if (!opts.compact) {
    mid.addSpacer(1);
    text(mid, subLine(h), Font.mediumSystemFont(10), DIM);
    if (h.kind === 'count' && opts.barWidth) {
      mid.addSpacer(3);
      const b = mid.addImage(bar(opts.barWidth, 4, h.amount / (h.target || 1), h.done ? GREEN : SOFT));
      b.imageSize = new Size(opts.barWidth, 4);
    }
  }
  r.addSpacer();
  if (h.done) icon(r, 'checkmark.circle.fill', GREEN, opts.compact ? 17 : 21);
  else if (h.kind === 'count') icon(r, 'plus.circle', WHITE, opts.compact ? 17 : 21);
  else icon(r, 'circle', new Color('#ffffff', 0.7), opts.compact ? 17 : 21);
}

function habitsWidget() {
  const w = new ListWidget();
  const g = new LinearGradient();
  g.colors = [new Color('#0f766e'), new Color('#134e4a')];
  g.locations = [0, 1];
  w.backgroundGradient = g;
  w.setPadding(12, 12, 10, 12);
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  w.url = RUN; // not the browser: opens Scriptable, which offers a list to tick

  const habits = d.ok ? d.habits || [] : [];
  const done = habits.filter((h) => h.done).length;

  const head = w.addStack();
  head.layoutHorizontally();
  head.centerAlignContent();
  icon(head, 'flame.fill', new Color('#fb923c'), size === 'small' ? 13 : 15);
  head.addSpacer(4);
  text(head, 'Habits', Font.boldRoundedSystemFont(size === 'small' ? 14 : 16));
  head.addSpacer();
  text(head, habits.length ? (done === habits.length ? 'All done 🎉' : done + '/' + habits.length) : dateLabel(), Font.semiboldSystemFont(11), SOFT);
  w.addSpacer(5);

  if (!d.ok) {
    text(w, d.offline || d.error ? 'Could not reach HomeManager. Will try again soon.' : 'Widget key not valid. Make a new one in the app: Settings > App > iPhone widget.', Font.systemFont(12));
    w.addSpacer();
    return w;
  }
  if (!habits.length) {
    text(w, 'No habits today.', Font.semiboldSystemFont(13));
    text(w, 'Add some in the app under Habits.', Font.systemFont(11), DIM);
    w.addSpacer();
    return w;
  }

  const barW = size === 'small' ? 130 : size === 'large' ? 310 : 300;
  const pb = w.addImage(bar(barW, 5, done / habits.length, GREEN));
  pb.imageSize = new Size(barW, 5);
  w.addSpacer(7);

  if (size === 'small') {
    habits.slice(0, 3).forEach((h, i) => {
      if (i) w.addSpacer(4);
      habitRow(w, h, { compact: true });
    });
    if (habits.length > 3) text(w, '+' + (habits.length - 3) + ' more', Font.systemFont(10), DIM);
  } else if (size === 'medium' && habits.length > 3) {
    // Two columns of compact rows, up to 6.
    const grid = w.addStack();
    grid.layoutHorizontally();
    const cols = [grid.addStack(), null];
    grid.addSpacer(6);
    cols[1] = grid.addStack();
    cols.forEach((c) => c.layoutVertically());
    habits.slice(0, 6).forEach((h, i) => {
      const c = cols[i % 2];
      if (i > 1) c.addSpacer(5);
      habitRow(c, h, { compact: true, width: 150 });
    });
    if (habits.length > 6) {
      w.addSpacer(3);
      text(w, '+' + (habits.length - 6) + ' more in the app', Font.systemFont(10), DIM);
    }
  } else {
    const max = size === 'large' ? 7 : 3;
    habits.slice(0, max).forEach((h, i) => {
      if (i) w.addSpacer(5);
      habitRow(w, h, { barWidth: size === 'large' ? 200 : 150 });
    });
    if (habits.length > max) {
      w.addSpacer(3);
      text(w, '+' + (habits.length - max) + ' more in the app', Font.systemFont(10), DIM);
    }
  }

  if (toggled) {
    w.addSpacer(4);
    text(w, toggled.ok ? (toggled.done ? '✓ ' + toggled.name + ' done' : toggled.name + ': ' + (toggled.amount > 0 ? num(toggled.amount) + ' so far' : 'not done')) : 'Could not update. Try again.', Font.mediumSystemFont(10), SOFT);
  }
  w.addSpacer();
  return w;
}

// The older home summary, with Parameter "home".
function homeWidget() {
  const w = new ListWidget();
  w.backgroundColor = new Color('#0f766e');
  w.url = SITE;
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
  w.setPadding(12, 14, 12, 14);
  const line = (value, screen, opts = {}) => {
    const row = w.addStack();
    if (screen && size !== 'small') row.url = SITE + '/#' + screen;
    const t = row.addText(value);
    t.font = opts.bold ? Font.boldSystemFont(opts.size || 13) : Font.systemFont(opts.size || (size === 'small' ? 12 : 13));
    t.textColor = opts.color || WHITE;
    t.lineLimit = 1;
    t.minimumScaleFactor = 0.8;
    row.addSpacer();
    if (screen && size !== 'small') {
      const arrow = row.addText('›');
      arrow.font = Font.systemFont(13);
      arrow.textColor = SOFT;
    }
    w.addSpacer(3);
  };
  line(d.ok ? d.home || 'Home' : 'HomeManager', 'today', { bold: true, size: 12, color: SOFT });
  w.addSpacer(3);
  if (!d.ok) {
    line(d.offline || d.error ? 'Could not reach HomeManager. Will try again soon.' : 'Widget key not valid. Make a new one in Settings.');
  } else {
    const lines = [];
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const habits = d.habits || [];
    const doneCount = habits.filter((h) => h.done).length;
    for (const m of d.meals) lines.push([cap(m.slot) + ': ' + m.label, 'today']);
    if (habits.length) lines.push([doneCount === habits.length ? 'Habits: all ' + habits.length + ' done ✓' : 'Habits: ' + doneCount + ' of ' + habits.length + ' done', 'habits']);
    for (const p of d.parts || (d.items || []).map((t) => ({ text: t }))) lines.push(['• ' + p.text, p.screen]);
    if (d.next) lines.push([d.next.title + (d.next.days === 0 ? ' today' : d.next.days === 1 ? ' tomorrow' : ' in ' + d.next.days + ' days'), 'plans']);
    if (!lines.length) lines.push(['All clear today ✓', 'today']);
    const max = size === 'small' ? 4 : size === 'large' ? 12 : 5;
    lines.slice(0, max).forEach(([t, screen]) => line(t, screen));
    if (lines.length > max) line('+' + (lines.length - max) + ' more', 'today', { color: SOFT });
  }
  w.addSpacer();
  return w;
}

const widget = mode === 'home' ? homeWidget() : habitsWidget();
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();
`;

export function widgetScript(key: string, site: string): string {
  return `// HomeManager widget for the Scriptable app.
// Keep this private: anyone with this script can see and tick your home's habits.
const KEY = '${key}';
const SITE = '${site}';
const code = await new Request(SITE + '/api/widget.js').loadString();
const run = new (Object.getPrototypeOf(async function () {}).constructor)('KEY', 'SITE', code);
await run(KEY, SITE);
`;
}
