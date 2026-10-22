import { describe, expect, it } from 'vitest';
import { widgetScript } from '../widget';

describe('widgetScript', () => {
  it('embeds the key and site and is valid JavaScript', () => {
    const s = widgetScript('abc123', 'https://example.workers.dev');
    expect(s).toContain("const KEY = 'abc123';");
    expect(s).toContain("const SITE = 'https://example.workers.dev';");
    // Scriptable runs top-level await; check it parses as an async function body.
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
    expect(() => new AsyncFunction(s)).not.toThrow();
  });
});
