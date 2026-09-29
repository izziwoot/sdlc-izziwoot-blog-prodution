import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '@/lib/contrast';

/** Pull the declared token values straight out of the stylesheet. */
function tokens(block: 'light' | 'dark'): Record<string, string> {
  const css = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8');
  const marker = block === 'light' ? '/* tokens:light */' : '/* tokens:dark */';
  const start = css.indexOf(marker);
  expect(start, `missing ${marker} in global.css`).toBeGreaterThan(-1);
  const section = css.slice(start, css.indexOf('}', start));
  const found: Record<string, string> = {};
  for (const [, name, value] of section.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,8})/g)) {
    found[name as string] = value as string;
  }
  return found;
}

describe('contrastRatio', () => {
  it('returns 21 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });

  it('returns 1 for identical colors', () => {
    expect(contrastRatio('#123456', '#123456')).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#333333', '#eeeeee')).toBeCloseTo(contrastRatio('#eeeeee', '#333333'), 5);
  });

  it('expands three-digit hex', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 1);
  });
});

describe.each(['light', 'dark'] as const)('WCAG 2.2 AA in the %s scheme', (scheme) => {
  it('body text meets 4.5:1 against the background', () => {
    const t = tokens(scheme);
    expect(contrastRatio(t.fg!, t.bg!)).toBeGreaterThanOrEqual(4.5);
  });

  it('muted text meets 4.5:1 - it carries dates and reading time, not decoration', () => {
    const t = tokens(scheme);
    expect(contrastRatio(t['fg-muted']!, t.bg!)).toBeGreaterThanOrEqual(4.5);
  });

  it('the link accent meets 4.5:1 against the background', () => {
    const t = tokens(scheme);
    expect(contrastRatio(t.accent!, t.bg!)).toBeGreaterThanOrEqual(4.5);
  });

  it('code text meets 4.5:1 against the code background', () => {
    const t = tokens(scheme);
    expect(contrastRatio(t.fg!, t['code-bg']!)).toBeGreaterThanOrEqual(4.5);
  });

  it('the border meets 3:1 so focus outlines and rules are perceivable', () => {
    const t = tokens(scheme);
    expect(contrastRatio(t.border!, t.bg!)).toBeGreaterThanOrEqual(3);
  });
});
