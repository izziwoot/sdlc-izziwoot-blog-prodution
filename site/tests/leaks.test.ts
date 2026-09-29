import { describe, expect, it } from 'vitest';
import { SENTINEL, findLeaks } from '../scripts/lib/leaks.mjs';

const opts = {
  sentinel: SENTINEL,
  forbiddenPaths: ['policies', 'frameworks', 'audits', 'templates', 'intent', 'spec', 'plan'],
  forbiddenExtensions: ['.env', '.pem', '.key', '.sqlite'],
};

const clean = [
  { path: '/index.html', content: '<h1>Izzi Woot</h1>' },
  { path: '/blog/a-post/index.html', content: '<h1>A post</h1>' },
];

describe('findLeaks', () => {
  it('passes a clean output tree', () => {
    expect(findLeaks({ files: clean, ...opts })).toEqual([]);
  });

  it('catches a governance document published by path', () => {
    const files = [...clean, { path: '/policies/access-control/index.html', content: 'x' }];
    const problems = findLeaks({ files, ...opts });
    expect(problems).toHaveLength(1);
    expect(problems[0]?.kind).toBe('forbidden-path');
  });

  it('catches a governance document whose path was disguised, via the content sentinel', () => {
    // The assertion that survives a refactor: someone moves the Astro root or
    // edits a glob, and a path rule passes while the document still leaks.
    const files = [
      ...clean,
      { path: '/blog/access-control/index.html', content: `<!-- ${SENTINEL} -->\n<h1>Policy</h1>` },
    ];
    const problems = findLeaks({ files, ...opts });
    expect(problems).toHaveLength(1);
    expect(problems[0]?.kind).toBe('sentinel');
  });

  it('catches a credential-shaped file by extension', () => {
    const files = [...clean, { path: '/.env', content: 'TOKEN=abc' }];
    expect(findLeaks({ files, ...opts })[0]?.kind).toBe('forbidden-extension');
  });

  it('catches private key material regardless of filename', () => {
    const files = [...clean, { path: '/assets/notes.txt', content: '-----BEGIN PRIVATE KEY-----' }];
    expect(findLeaks({ files, ...opts })[0]?.kind).toBe('private-key');
  });

  it('reports every leak rather than stopping at the first', () => {
    const files = [
      ...clean,
      { path: '/policies/a/index.html', content: 'x' },
      { path: '/.env', content: 'y' },
    ];
    expect(findLeaks({ files, ...opts })).toHaveLength(2);
  });

  it('does NOT flag a post whose subject happens to be policy', () => {
    // A guard the author has to fight is a guard that gets disabled.
    const files = [
      ...clean,
      {
        path: '/blog/writing-policies-that-hold/index.html',
        content: '<h1>Writing policies that hold</h1><p>audits and frameworks discussed</p>',
      },
    ];
    expect(findLeaks({ files, ...opts })).toEqual([]);
  });

  it('names the offending path in every problem', () => {
    const files = [...clean, { path: '/policies/a/index.html', content: 'x' }];
    expect(findLeaks({ files, ...opts })[0]?.path).toBe('/policies/a/index.html');
  });
});

describe('volume drift', () => {
  const current = { count: 100, bytes: 1_000_000 };

  it('passes when output is stable', () => {
    expect(findLeaks({ files: clean, ...opts, current, baseline: current })).toEqual([]);
  });

  it('passes without a baseline, so a first run is not a failure', () => {
    expect(findLeaks({ files: clean, ...opts, current, baseline: null })).toEqual([]);
  });

  it('flags a tenfold jump in file count, which means something got globbed', () => {
    const problems = findLeaks({
      files: clean,
      ...opts,
      current: { count: 1001, bytes: 1_000_000 },
      baseline: current,
    });
    expect(problems[0]?.kind).toBe('volume-drift');
  });

  it('flags a tenfold jump in bytes', () => {
    const problems = findLeaks({
      files: clean,
      ...opts,
      current: { count: 100, bytes: 10_000_001 },
      baseline: current,
    });
    expect(problems[0]?.kind).toBe('volume-drift');
  });

  it('does not flag ordinary growth', () => {
    const problems = findLeaks({
      files: clean,
      ...opts,
      current: { count: 140, bytes: 1_400_000 },
      baseline: current,
    });
    expect(problems).toEqual([]);
  });
});
