import { describe, expect, it } from 'vitest';
import { WIDGET_BODY, widgetScript } from '../widget';

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

describe('widget', () => {
  it('loader embeds the key and site and parses', () => {
    const s = widgetScript('abc123', 'https://example.workers.dev');
    expect(s).toContain("const KEY = 'abc123';");
    expect(s).toContain("const SITE = 'https://example.workers.dev';");
    expect(() => new AsyncFunction(s)).not.toThrow();
  });

  const habits = [
    { name: 'Drink water', emoji: '💧', kind: 'count', amount: 3, target: 8, unit: 'glasses', done: false },
    { name: 'Work out', emoji: '', kind: 'check', amount: 0, target: 1, unit: '', done: false },
    { name: 'Read', emoji: '📖', kind: 'check', amount: 1, target: 1, unit: '', done: true },
  ];

  it('body renders lines that open their screens', async () => {
    const rows = await render({ ok: true, home: 'Cadenza', meals: [{ slot: 'lunch', label: 'Dal rice' }], parts: [{ screen: 'shopping', text: '9 to buy' }], next: { title: 'Trip', days: 9 } });
    expect(rows).toEqual([
      { text: 'Cadenza', url: 'https://s/#today' },
      { text: 'Lunch: Dal rice', url: 'https://s/#today' },
      { text: '• 9 to buy', url: 'https://s/#shopping' },
      { text: 'Trip in 9 days', url: 'https://s/#plans' },
    ]);
  });

  it('adds a habits line to the home widget', async () => {
    const rows = await render({ ok: true, home: 'Cadenza', meals: [], parts: [], habits });
    expect(rows).toEqual([
      { text: 'Cadenza', url: 'https://s/#today' },
      { text: 'Habits: 1 of 3 done', url: 'https://s/#habits' },
    ]);
  });

  it('shows only habits with the "habits" parameter', async () => {
    const rows = await render({ ok: true, home: 'Cadenza', meals: [{ slot: 'lunch', label: 'Dal rice' }], parts: [], habits }, ' Habits ');
    expect(rows).toEqual([
      { text: 'Habits · 1 of 3 done', url: 'https://s/#habits' },
      { text: '○ 💧 Drink water  3/8 glasses', url: 'https://s/#habits' },
      { text: '○ Work out', url: 'https://s/#habits' },
      { text: '✓ 📖 Read', url: 'https://s/#habits' },
    ]);
    expect(await render({ ok: true, home: 'C', meals: [], parts: [], habits: [] }, 'habits')).toEqual([
      { text: 'Habits · 0 of 0 done', url: 'https://s/#habits' },
      { text: 'No habits today. Add some in the app.', url: 'https://s/#habits' },
    ]);
  });
});

async function render(data: object, param?: string) {
  const rows: { text: string; url?: string }[] = [];
  const g = globalThis as Record<string, unknown>;
  g.args = { widgetParameter: param ?? null };
  g.Request = class {
    async loadJSON() {
      return data;
    }
  };
  g.Color = class {
    static white() {
      return 'white';
    }
  };
  g.Font = { boldSystemFont: () => 'b', systemFont: () => 'r' };
  const stack = () => {
    const row: { text: string; url?: string } = { text: '' };
    rows.push(row);
    return {
      set url(u: string) {
        row.url = u;
      },
      addText(t: string) {
        if (t !== '›') row.text = t;
        return {};
      },
      addSpacer() {},
    };
  };
  g.ListWidget = class {
    addStack = stack;
    addSpacer() {}
    setPadding() {}
  };
  g.config = { runsInWidget: true, widgetFamily: 'medium' };
  g.Script = { setWidget() {}, complete() {} };
  await new AsyncFunction('KEY', 'SITE', WIDGET_BODY)('k', 'https://s');
  return rows;
}
