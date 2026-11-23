import { describe, expect, it } from 'vitest';
import { WIDGET_BODY, widgetScript } from '../widget';

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

// A tiny fake of Scriptable's widget API: records each text with the link it opens.
interface Node {
  url?: string;
  parent?: Node;
}
interface Run {
  rows: { text: string; url?: string }[];
  requests: { url: string; method?: string }[];
  presented: boolean;
  set: boolean;
  notes: string[];
}

// Swallows any property, call or construction (fonts, colors, images, paths...).
const any: () => unknown = () =>
  new Proxy(function () {}, {
    get: (_t, p) => (p === 'image' || p === 'getImage' ? any() : p === Symbol.toPrimitive ? () => '' : any()),
    apply: () => any(),
    construct: () => any() as object,
    set: () => true,
  });

async function render(data: object, opts: { param?: string; query?: Record<string, string>; inWidget?: boolean; family?: string; pick?: number } = {}): Promise<Run> {
  const run: Run = { rows: [], requests: [], presented: false, set: false, notes: [] };
  const texts: { text: string; node: Node }[] = [];
  const g = globalThis as Record<string, unknown>;
  class Stack implements Node {
    url?: string;
    parent?: Node;
    constructor(parent?: Node) {
      this.parent = parent;
    }
    addStack() {
      return new Stack(this);
    }
    addText(t: string) {
      texts.push({ text: t, node: this });
      return any();
    }
    addImage() {
      return any();
    }
    addSpacer() {}
    layoutHorizontally() {}
    layoutVertically() {}
    centerAlignContent() {}
    setPadding() {}
  }
  class Widget extends Stack {
    async presentMedium() {
      run.presented = true;
    }
  }
  const current = data;
  g.Request = class {
    url: string;
    method?: string;
    constructor(url: string) {
      this.url = url;
    }
    async loadJSON() {
      run.requests.push({ url: this.url, method: this.method });
      if (this.url.includes('/toggle')) {
        return { ok: true, name: 'Work out', amount: 1, done: true };
      }
      return current;
    }
  };
  g.ListWidget = Widget;
  g.Color = class {
    static white() {
      return 'white';
    }
  };
  g.Font = any();
  g.SFSymbol = any();
  for (const k of ['LinearGradient', 'DrawContext', 'Size', 'Rect', 'Path']) g[k] = any();
  g.URLScheme = { forRunningScript: () => 'scriptable:///run/HomeManager' };
  g.Alert = class {
    title = '';
    addAction() {}
    addCancelAction() {}
    async presentSheet() {
      return opts.pick ?? -1;
    }
  };
  g.Notification = class {
    title = '';
    async schedule() {
      run.notes.push(this.title);
    }
  };
  g.args = { widgetParameter: opts.param ?? null, queryParameters: opts.query ?? {} };
  g.config = { runsInWidget: opts.inWidget ?? true, widgetFamily: opts.family ?? (opts.inWidget === false ? undefined : 'medium') };
  g.Script = {
    setWidget() {
      run.set = true;
    },
    complete() {},
  };
  await new AsyncFunction('KEY', 'SITE', WIDGET_BODY)('k', 'https://s');
  const urlOf = (n?: Node): string | undefined => (n ? (n.url ?? urlOf(n.parent)) : undefined);
  run.rows = texts.filter((t) => t.text !== '›').map((t) => ({ text: t.text, url: urlOf(t.node) }));
  return run;
}

const habits = [
  { id: 'h1', name: 'Drink water', emoji: '💧', kind: 'count', amount: 3, target: 8, unit: 'glasses', step: 1, done: false, schedule: 'daily', per_week: 3, week_done: 0 },
  { id: 'h2', name: 'Work out', emoji: '', kind: 'check', amount: 0, target: 1, unit: '', step: 1, done: false, schedule: 'weekly', per_week: 4, week_done: 1 },
  { id: 'h3', name: 'Read', emoji: '📖', kind: 'check', amount: 1, target: 1, unit: '', step: 1, done: true, schedule: 'daily', per_week: 3, week_done: 1 },
];
const data = { ok: true, home: 'Cadenza', meals: [{ slot: 'lunch', label: 'Dal rice' }], parts: [{ screen: 'shopping', text: '9 to buy' }], next: { title: 'Trip', days: 9 }, habits };
const RUN = 'scriptable:///run/HomeManager';

describe('widget', () => {
  it('loader embeds the key and site and parses', () => {
    const s = widgetScript('abc123', 'https://example.workers.dev');
    expect(s).toContain("const KEY = 'abc123';");
    expect(s).toContain("const SITE = 'https://example.workers.dev';");
    expect(() => new AsyncFunction(s)).not.toThrow();
  });

  it('shows only habits by default, each tapping to tick it in Scriptable (never the browser)', async () => {
    const { rows, set } = await render(data);
    expect(set).toBe(true);
    expect(rows.map((r) => r.text)).toEqual(['Habits', '1/3', '💧', 'Drink water', '3 / 8 glasses', '•', 'Work out', '1 of 4 this week', '📖', 'Read', 'Done today']);
    expect(rows.find((r) => r.text === 'Drink water')?.url).toBe(`${RUN}?toggle=h1`);
    expect(rows.find((r) => r.text === 'Read')?.url).toBe(`${RUN}?toggle=h3`);
    expect(rows.find((r) => r.text === 'Habits')?.url).toBe(RUN);
    expect(rows.every((r) => !r.url?.startsWith('https://'))).toBe(true);
  });

  it('uses two compact columns on a medium widget with more than 3 habits', async () => {
    const many = [...habits, ...habits.map((h) => ({ ...h, id: `${h.id}b`, name: `${h.name} 2` }))];
    const { rows } = await render({ ...data, habits: [...many, { ...habits[0], id: 'x', name: 'Seventh' }] });
    const names = rows.map((r) => r.text);
    expect(names).toContain('Read 2');
    expect(names).not.toContain('Seventh');
    expect(names).toContain('+1 more in the app');
    expect(names).not.toContain('3 / 8 glasses'); // compact rows skip the detail line
  });

  it('ticks a tapped habit with just a notification: no preview, nothing else loaded', async () => {
    const run = await render(data, { inWidget: false, query: { toggle: 'h2' } });
    expect(run.requests).toEqual([{ url: 'https://s/api/widget/toggle?k=k&h=h2', method: 'POST' }]);
    expect(run.notes).toEqual(['✓ Work out done']);
    expect(run.presented).toBe(false);
    expect(run.rows).toEqual([]);
  });

  it('offers a list to tick when opened without a habit (small widget tap)', async () => {
    const run = await render(data, { inWidget: false, pick: 1 });
    expect(run.requests.some((r) => r.url.includes('/toggle') && r.url.endsWith('h=h2'))).toBe(true);
    expect(run.presented).toBe(false);
    expect(run.notes).toEqual(['✓ Work out done']);
    const none = await render(data, { inWidget: false, pick: -1 });
    expect(none.requests.some((r) => r.url.includes('/toggle'))).toBe(false);
    expect(none.presented).toBe(true); // "Show widget" previews it
  });

  it('explains a bad key or an empty day', async () => {
    expect((await render({ ok: false })).rows.map((r) => r.text)).toContain('Widget key not valid. Make a new one in the app: Settings > App > iPhone widget.');
    expect((await render({ ok: false, error: true })).rows.map((r) => r.text)).toContain('Could not reach HomeManager. Will try again soon.');
    expect((await render({ ...data, habits: [] })).rows.map((r) => r.text)).toContain('No habits today.');
  });

  it('keeps the home summary with the "home" parameter', async () => {
    const { rows } = await render(data, { param: ' Home ' });
    expect(rows).toEqual([
      { text: 'Cadenza', url: 'https://s/#today' },
      { text: 'Lunch: Dal rice', url: 'https://s/#today' },
      { text: 'Habits: 1 of 3 done', url: 'https://s/#habits' },
      { text: '• 9 to buy', url: 'https://s/#shopping' },
      { text: 'Trip in 9 days', url: 'https://s/#plans' },
    ]);
  });
});
