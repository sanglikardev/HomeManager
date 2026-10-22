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

  it('body renders lines that open their screens', async () => {
    const rows: { text: string; url?: string }[] = [];
    const g = globalThis as Record<string, unknown>;
    const data = { ok: true, home: 'Cadenza', meals: [{ slot: 'lunch', label: 'Dal rice' }], parts: [{ screen: 'shopping', text: '9 to buy' }], next: { title: 'Trip', days: 9 } };
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
    expect(rows).toEqual([
      { text: 'Cadenza', url: 'https://s/#today' },
      { text: 'Lunch: Dal rice', url: 'https://s/#today' },
      { text: '• 9 to buy', url: 'https://s/#shopping' },
      { text: 'Trip in 9 days', url: 'https://s/#plans' },
    ]);
  });
});
