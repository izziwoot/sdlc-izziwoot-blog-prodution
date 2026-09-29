export const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const ALLOWED_EXTENSIONS = ['.md', '.mdx'];

/**
 * Validate blog filenames. The filename IS the URL slug (Astro 7's glob loader
 * derives each entry's `id` from it), so a bad filename is a bad URL.
 *
 * @param {{ files: { file: string, author?: string }[], reserved: string[], authors: string[] }} input
 * @returns {{ file: string, kind: string, message: string }[]} empty means clean
 */
export function checkFilenames({ files, reserved, authors }) {
  const problems = [];
  const seen = new Map();

  for (const { file, author } of files) {
    const dot = file.lastIndexOf('.');
    const ext = dot === -1 ? '' : file.slice(dot);
    const slug = dot === -1 ? file : file.slice(0, dot);

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      problems.push({
        file,
        kind: 'extension',
        message: `extension "${ext}" is not one of ${ALLOWED_EXTENSIONS.join(', ')}`,
      });
      continue;
    }

    if (!KEBAB.test(slug)) {
      problems.push({
        file,
        kind: 'case',
        message: `slug "${slug}" must be lowercase kebab-case — the filename IS the URL`,
      });
    }

    if (reserved.includes(slug)) {
      problems.push({
        file,
        kind: 'reserved',
        message: `slug "${slug}" collides with the existing route /blog/${slug}/ — rename the post`,
      });
    }

    const prior = seen.get(slug);
    if (prior) {
      problems.push({
        file,
        kind: 'duplicate',
        message: `slug "${slug}" is already produced by ${prior} — two files cannot share one URL`,
      });
    } else {
      seen.set(slug, file);
    }

    if (author !== undefined && !authors.includes(author)) {
      problems.push({
        file,
        kind: 'unknown-author',
        message: `author "${author}" has no record in src/content/authors/`,
      });
    }
  }

  return problems;
}
