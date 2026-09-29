import { describe, expect, it } from 'vitest';
import { formatDate, isoDate, readingTimeLabel } from '@/lib/format';

describe('formatDate', () => {
  it('renders an unambiguous long form, never a locale-dependent numeric one', () => {
    expect(formatDate(new Date('2026-03-12T00:00:00Z'))).toBe('12 March 2026');
  });

  it('uses UTC so a build machine timezone cannot shift the printed day', () => {
    expect(formatDate(new Date('2026-03-12T23:30:00Z'))).toBe('12 March 2026');
    expect(formatDate(new Date('2026-03-12T00:30:00Z'))).toBe('12 March 2026');
  });
});

describe('isoDate', () => {
  it('emits a date-only ISO string for the datetime attribute', () => {
    expect(isoDate(new Date('2026-03-12T23:30:00Z'))).toBe('2026-03-12');
  });
});

describe('readingTimeLabel', () => {
  it('never reports less than one minute', () => {
    expect(readingTimeLabel(0)).toBe('1 min read');
    expect(readingTimeLabel(0.2)).toBe('1 min read');
  });

  it('rounds to the nearest minute', () => {
    expect(readingTimeLabel(3.4)).toBe('3 min read');
    expect(readingTimeLabel(3.6)).toBe('4 min read');
  });
});
