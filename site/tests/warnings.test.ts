import { describe, expect, it, vi } from 'vitest';
import { POST_LIMIT_WARNING, warnAboutFutureDated, warnAboutVolume } from '@/lib/warnings';
import type { PostLike } from '@/lib/posts';

const NOW = new Date('2026-09-29T00:00:00Z');
const post = (id: string, pubDate: string): PostLike => ({
  id,
  data: { pubDate: new Date(pubDate), draft: false, tags: ['ai'] },
});

describe('warnAboutFutureDated', () => {
  it('logs nothing when no post is future-dated', () => {
    const log = vi.fn();
    warnAboutFutureDated([post('a', '2026-01-01')], NOW, log);
    expect(log).not.toHaveBeenCalled();
  });

  it('names every future-dated post so the author notices before deploying', () => {
    const log = vi.fn();
    warnAboutFutureDated([post('a', '2027-01-01'), post('b', '2026-01-01')], NOW, log);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toMatch(/\ba\b/);
    expect(log.mock.calls[0]?.[0]).not.toMatch(/\bb\b/);
  });

  it('reports how many were excluded, not just that some were', () => {
    const log = vi.fn();
    warnAboutFutureDated([post('a', '2027-01-01'), post('c', '2027-02-01')], NOW, log);
    expect(log.mock.calls[0]?.[0]).toMatch(/2 post/);
  });
});

describe('warnAboutVolume', () => {
  it('stays silent below the pagination threshold', () => {
    const log = vi.fn();
    warnAboutVolume(POST_LIMIT_WARNING - 1, log);
    expect(log).not.toHaveBeenCalled();
  });

  it('warns at the threshold so pagination is a decision, not a surprise', () => {
    const log = vi.fn();
    warnAboutVolume(POST_LIMIT_WARNING, log);
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]?.[0]).toMatch(/pagination/i);
  });
});
