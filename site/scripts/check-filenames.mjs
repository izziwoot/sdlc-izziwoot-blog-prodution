import { readdir, readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { checkFilenames } from './lib/filenames.mjs';

const BLOG_DIR = new URL('../src/content/blog/', import.meta.url);
const AUTHORS_DIR = new URL('../src/content/authors/', import.meta.url);

/** Top-level segments already used under /blog/. */
const RESERVED = ['tags'];

async function listBlogFiles() {
  let entries = [];
  try {
    entries = await readdir(BLOG_DIR);
  } catch {
    return []; // an empty or absent content directory is valid
  }
  return Promise.all(
    entries
      .filter((f) => !f.startsWith('.'))
      .map(async (file) => {
        const raw = await readFile(new URL(file, BLOG_DIR), 'utf8');
        const match = raw.match(/^author:\s*["']?([\w-]+)["']?\s*$/m);
        return { file, author: match?.[1] };
      }),
  );
}

async function listAuthors() {
  try {
    const entries = await readdir(AUTHORS_DIR);
    return entries.filter((f) => f.endsWith('.json')).map((f) => basename(f, '.json'));
  } catch {
    return [];
  }
}

const problems = checkFilenames({
  files: await listBlogFiles(),
  reserved: RESERVED,
  authors: await listAuthors(),
});

if (problems.length > 0) {
  console.error('Content filename check failed:\n');
  for (const p of problems) console.error(`  ${p.file} [${p.kind}] ${p.message}`);
  console.error(`\n${problems.length} problem(s).`);
  process.exit(1);
}
console.log('Content filename check passed.');
