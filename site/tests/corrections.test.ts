import { describe, expect, it } from 'vitest';
import { postStatus } from '@/lib/status';

const pubDate = new Date('2026-01-01');

describe('postStatus', () => {
  it('reports a clean post as unchanged', () => {
    expect(postStatus({ pubDate })).toEqual({
      retracted: false,
      hasCorrections: false,
      showUpdated: false,
      latestChange: pubDate,
    });
  });

  it('flags a retracted post', () => {
    const s = postStatus({
      pubDate,
      retracted: { date: new Date('2026-02-01'), reason: 'x'.repeat(20) },
    });
    expect(s.retracted).toBe(true);
  });

  it('flags corrections and treats an empty array as none', () => {
    expect(postStatus({ pubDate, corrections: [] }).hasCorrections).toBe(false);
    expect(
      postStatus({
        pubDate,
        corrections: [{ date: new Date('2026-02-01'), note: 'x'.repeat(20) }],
      }).hasCorrections,
    ).toBe(true);
  });

  it('shows the updated line only when updatedDate differs from pubDate', () => {
    expect(postStatus({ pubDate, updatedDate: pubDate }).showUpdated).toBe(false);
    expect(postStatus({ pubDate, updatedDate: new Date('2026-03-01') }).showUpdated).toBe(true);
  });

  it('derives latestChange as the most recent of pubDate, updatedDate, and any correction', () => {
    const s = postStatus({
      pubDate,
      updatedDate: new Date('2026-02-01'),
      corrections: [
        { date: new Date('2026-05-01'), note: 'x'.repeat(20) },
        { date: new Date('2026-03-01'), note: 'y'.repeat(20) },
      ],
    });
    expect(s.latestChange).toEqual(new Date('2026-05-01'));
  });

  it('uses the retraction date when it is the most recent event', () => {
    const s = postStatus({
      pubDate,
      retracted: { date: new Date('2026-09-01'), reason: 'x'.repeat(20) },
    });
    expect(s.latestChange).toEqual(new Date('2026-09-01'));
  });
});
