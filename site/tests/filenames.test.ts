import { describe, expect, it } from 'vitest';
import { checkFilenames } from '../scripts/lib/filenames.mjs';

const authors = ['adilson-cesar'];
const reserved = ['tags'];
const ok = (file: string) => ({ file, author: 'adilson-cesar' });

describe('checkFilenames', () => {
  it('accepts kebab-case markdown filenames', () => {
    expect(checkFilenames({ files: [ok('choose-boring-tools.md')], reserved, authors })).toEqual([]);
  });

  it('rejects a filename that is not kebab-case', () => {
    const problems = checkFilenames({ files: [ok('Choose_Boring_Tools.md')], reserved, authors });
    expect(problems).toHaveLength(1);
    expect(problems[0]?.kind).toBe('case');
  });

  it('rejects an unexpected extension', () => {
    const problems = checkFilenames({ files: [ok('a-post.markdown')], reserved, authors });
    expect(problems[0]?.kind).toBe('extension');
  });

  it('rejects a slug that collides with a reserved route segment', () => {
    const problems = checkFilenames({ files: [ok('tags.md')], reserved, authors });
    expect(problems).toHaveLength(1);
    expect(problems[0]?.kind).toBe('reserved');
    expect(problems[0]?.message).toMatch(/\/blog\/tags\//);
  });

  it('rejects two files that would produce the same slug', () => {
    const problems = checkFilenames({
      files: [ok('a-post.md'), ok('a-post.mdx')],
      reserved,
      authors,
    });
    expect(problems.some((p) => p.kind === 'duplicate')).toBe(true);
  });

  it('rejects a post naming an author with no record', () => {
    const problems = checkFilenames({
      files: [{ file: 'a-post.md', author: 'nobody' }],
      reserved,
      authors,
    });
    expect(problems[0]?.kind).toBe('unknown-author');
  });

  it('reports every problem at once rather than stopping at the first', () => {
    const problems = checkFilenames({
      files: [ok('Bad_Name.md'), ok('tags.md')],
      reserved,
      authors,
    });
    expect(problems).toHaveLength(2);
  });

  it('accepts an empty content directory', () => {
    expect(checkFilenames({ files: [], reserved, authors })).toEqual([]);
  });

  it('does not flag a post whose subject happens to be policy', () => {
    const problems = checkFilenames({
      files: [ok('writing-policies-that-hold.md')],
      reserved,
      authors,
    });
    expect(problems).toEqual([]);
  });
});
