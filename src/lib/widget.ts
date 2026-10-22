// The Scriptable script for the iPhone home-screen widget, with this home's private key in it.
export function widgetScript(key: string, site: string): string {
  return `// HomeManager widget for the Scriptable app.
// Keep this private: anyone with this script can see your home's summary.
const KEY = '${key}';
const SITE = '${site}';

let d;
try {
  d = await new Request(SITE + '/api/widget?k=' + KEY).loadJSON();
} catch (e) {
  d = { ok: false, offline: true };
}

const size = config.widgetFamily || 'medium';
const w = new ListWidget();
w.backgroundColor = new Color('#0f766e');
w.url = SITE;
w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);

const line = (text, opts = {}) => {
  const t = w.addText(text);
  t.font = opts.bold ? Font.boldSystemFont(opts.size || 13) : Font.systemFont(opts.size || (size === 'small' ? 12 : 13));
  t.textColor = opts.color || Color.white();
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.8;
};

line(d.ok ? d.home || 'Home' : 'HomeManager', { bold: true, size: 12, color: new Color('#99f6e4') });
w.addSpacer(6);

if (!d.ok) {
  line(d.offline ? 'Offline. Will try again soon.' : 'Widget key expired. Make a new one in Settings.');
} else {
  const lines = [];
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  for (const m of d.meals) lines.push(cap(m.slot) + ': ' + m.label);
  for (const i of d.items) lines.push('• ' + i);
  if (d.next) lines.push(d.next.title + (d.next.days === 0 ? ' today' : d.next.days === 1 ? ' tomorrow' : ' in ' + d.next.days + ' days'));
  if (!lines.length) lines.push('All clear today ✓');
  const max = size === 'small' ? 4 : size === 'large' ? 12 : 5;
  lines.slice(0, max).forEach((l) => line(l));
  if (lines.length > max) line('+' + (lines.length - max) + ' more', { color: new Color('#99f6e4') });
}
w.addSpacer();

if (config.runsInWidget) Script.setWidget(w);
else await w.presentMedium();
Script.complete();
`;
}
