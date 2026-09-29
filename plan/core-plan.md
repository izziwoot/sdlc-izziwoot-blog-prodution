# Izzi Woot Blog — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static, zero-backend blog under `site/` in this repository, published to Cloudflare Pages, with CI gates that make malformed posts and governance-document leaks impossible to ship.

**Architecture:** Astro in `output: 'static'` mode. All content is Markdown in git, validated by a Zod schema at build time. Every piece of logic worth testing is extracted into a **pure function module** (`site/src/lib/*.ts`, `site/src/content/schema.ts`) that imports nothing from `astro:content`, so Vitest can test it directly; the `.astro` route files are thin presentational shells over those functions. Security is a static-file posture: no runtime, no input, no cookies — enforced by post-build assertion scripts rather than by convention.

**Tech Stack:** Astro 5, TypeScript (strict), Zod, Vitest, pnpm, Shiki, `@astrojs/rss`, `@astrojs/sitemap`, lychee, Lighthouse CI, gitleaks, Cloudflare Pages.

**Spec:** [`spec/core-spec.md`](../spec/core-spec.md) — argue from the spec, not from this plan's prose. **Intent:** [`intent/core-intent.md`](../intent/core-intent.md).

---

## Global Constraints

Every task's requirements implicitly include all of these. Values are copied verbatim from the spec.

- **Node.js `>=20.11 <23`**, pinned in `.nvmrc` and `package.json` `engines`; must match the Cloudflare Pages build image.
- **pnpm**, version pinned via the `packageManager` field. CI installs with `--frozen-lockfile`. A build that would mutate the lockfile fails.
- **`output: 'static'`** (INV-1). No SSR adapter, no API routes, no Cloudflare Functions, no `site/functions/` directory. Any task introducing one is wrong.
- **TypeScript `strict: true`**. `astro check` is a blocking gate.
- **The Astro root is `site/`, never the repository root** — at the root, the content globber matches `policies/**/*.md` and publishes governance documents (INV-3).
- **No file under `policies/`, `frameworks/`, `audits/`, `templates/`, `intent/`, or `spec/` may ever appear in build output** (INV-3).
- **No secrets in the deployed artifact** (INV-2). `PUBLIC_*` values and `SITE_URL` are public by design; nothing else reaches the client.
- **No first-party framework JavaScript** (INV-4). The only permitted runtime third parties are the Giscus iframe and the Cloudflare beacon, both declared in CSP.
- **No `localStorage`, `sessionStorage`, or first-party cookies.** Color scheme is `@media (prefers-color-scheme)` only; disclosure widgets are `<details>`/`<summary>`.
- **No `'unsafe-inline'` in `script-src`**, ever.
- **`trailingSlash: 'always'`.** One canonical form per resource.
- **A published `/blog/<slug>/` URL is never deleted or moved** (INV-5). Retraction changes content, never the path.
- **Post slug is the filename.** No `slug` front-matter key exists in the schema.
- **Tag vocabulary is closed** — the `TAGS` enum in `site/src/content/schema.ts` is the only source. Adding a member is a deliberate reviewed change.
- **`SITE_URL` is required; the build fails if it is unset or malformed.** No silent `undefined` in canonical URLs.
- **Third-party GitHub Actions are pinned to a full commit SHA**, never a tag.
- **Original visual identity.** No CSS, markup, or copy is reproduced from `sizovs.net`; only its information architecture is the model.
- **Every commit message ends with the attribution line:**
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  ```
  Task commit steps below show the subject line only; append this line to every one.
- **Commit after every task.** Never batch two tasks into one commit.

### Blocked-by-decision gate

**Task 22 must not start** until §10.1 and §10.2 of the spec are resolved by a human and the `policies/` reviewer text is amended to match. Tasks 1–21 and 23 are unblocked and depend on nothing from that decision. Do not guess a branch-protection configuration.

---

## Review Focus

Five conditions the spec implies but never names, ordered by how likely they are to bite. Each one has its test pinned to the task that owns the code — they are not a separate task.

1. **Zero published posts.** A fresh clone where every post is `draft: true` must render an empty index and a valid, item-less feed, not crash. `feedLastBuildDate([])` computing a max over an empty array is the specific crash. → Task 3 and Task 10.
2. **A post slug colliding with a reserved route.** A file named `tags.md` produces `/blog/tags/`, which is already the tag index. Astro may silently let one win. Expected: the build fails with a named error. → Task 4.
3. **XML-unsafe characters in a title or description.** A title containing `&`, `<`, or a smart quote must produce a feed that still parses. An unescaped `&` makes the whole feed invalid, which silently breaks every subscriber at once. → Task 10.
4. **A `pubDate` in the future.** The spec has no scheduling, so the naive behavior is instant publication of something dated next month. Expected: excluded from production listings, visible in dev, and the build warns. → Task 3.
5. **Two posts sharing an identical `pubDate`.** Sort order must be deterministic across machines, or index and feed ordering drift between local and CI builds. Expected: `pubDate` descending, then `id` ascending. → Task 3.

---

## File Structure

Files created by this plan, and the single responsibility of each.

**Repository root**

| Path | Responsibility |
| --- | --- |
| `.nvmrc` | Node version pin |
| `.gitleaks.toml` | Secret-scan configuration and allow-list |
| `.github/workflows/site.yml` | Site build + quality gates, path-filtered to `site/**` |
| `.github/workflows/governance.yml` | Policy front-matter and freshness checks, path-filtered to governance trees |
| `.github/workflows/security.yml` | gitleaks + dependency audit, **all paths** |
| `.husky/pre-commit` | Local gitleaks + format check |

**`site/` — the only publishable tree**

| Path | Responsibility |
| --- | --- |
| `astro.config.mjs` | Astro configuration: static output, trailing slash, integrations, Shiki, remark/rehype chain |
| `package.json` / `pnpm-lock.yaml` | Dependencies, scripts, engines, packageManager |
| `tsconfig.json` | Strict TS, path aliases |
| `vitest.config.ts` | Unit test configuration |
| `src/env.d.ts` | Typed `import.meta.env` |
| `src/config/env.ts` | **Pure** env parsing and validation; throws on missing `SITE_URL` |
| `src/config/site.ts` | Site-wide constants, reads validated env |
| `src/content/schema.ts` | **Pure** Zod schemas + `TAGS` + `RESERVED_SLUGS`. Imports no Astro runtime |
| `src/content/config.ts` | Thin Astro binding: `defineCollection` over `schema.ts` |
| `src/content/blog/*.md` | Posts. Filename is the slug |
| `src/content/authors/adilson-cesar.json` | The single author record |
| `src/lib/posts.ts` | **Pure** post selection, draft/future filtering, deterministic sort, tag grouping |
| `src/lib/seo.ts` | **Pure** canonical/OG/JSON-LD tag construction |
| `src/lib/feed.ts` | **Pure** RSS item mapping and `lastBuildDate` derivation |
| `src/lib/format.ts` | **Pure** date formatting and reading-time rounding |
| `src/components/SEO.astro` | Sole owner of every `<head>` metadata tag |
| `src/components/PostCard.astro` | One listing row: title, date, reading time, tags |
| `src/components/TagList.astro` | Tag chips as links |
| `src/components/Giscus.astro` | Comment embed, post pages only |
| `src/components/Icon.astro` | Inline SVG icons; no icon font |
| `src/components/SkipLink.astro` | Skip-to-content link |
| `src/layouts/BaseLayout.astro` | `<html>` shell, header, footer, skip link |
| `src/layouts/PostLayout.astro` | Post chrome: byline, corrections, retraction banner, Giscus slot |
| `src/pages/index.astro` | `/` — reverse-chronological index |
| `src/pages/blog/[...slug].astro` | `/blog/<slug>/` |
| `src/pages/blog/tags/index.astro` | `/blog/tags/` |
| `src/pages/blog/tags/[tag].astro` | `/blog/tags/<tag>/` |
| `src/pages/about.astro` | `/about/` incl. AI-assistance disclosure |
| `src/pages/privacy.astro` | `/privacy/` — accurate processor disclosure |
| `src/pages/404.astro` | 404 page |
| `src/pages/feed.xml.ts` | RSS endpoint |
| `src/styles/global.css` | Design tokens, type scale, light/dark via media query |
| `public/_headers` | CSP and security headers |
| `public/_redirects` | Canonical redirects |
| `public/robots.txt` | Crawl directives + sitemap pointer |
| `public/fonts/*.woff2` | Self-hosted subset fonts |
| `scripts/check-filenames.mjs` | Slug convention + reserved-slug collision check |
| `scripts/assert-no-governance-leak.mjs` | INV-3 output assertions incl. content sentinel |
| `scripts/assert-headers.mjs` | Post-build CSP and header verification |
| `scripts/lib/assertions.mjs` | Shared pure assertion helpers, unit-tested |
| `tests/*.test.ts` | Vitest suites mirroring each `src/lib` and `scripts/lib` module |
| `lighthouserc.json` | Lighthouse CI budgets and URL list |
| `lychee.toml` | Link checker configuration |

**Design note on testability:** every `.astro` file is a shell. Logic lives in `src/lib/*.ts` as pure functions with no `astro:content` import, because `astro:content` is a virtual module Vitest cannot resolve. `src/content/schema.ts` takes its `image` helper as a parameter for the same reason — tests pass a stub. Any task that puts a conditional into an `.astro` file that could have lived in a `lib` function has made that behavior untestable and is wrong.

---

## Task Sequence

Tasks are ordered so that every task's `Consumes` block refers only to work already completed. Task 22 is gated (see Global Constraints).

---

### Task 1: Project scaffold and validated environment

**Files:**
- Create: `.nvmrc`, `site/package.json`, `site/tsconfig.json`, `site/astro.config.mjs`, `site/vitest.config.ts`, `site/src/env.d.ts`
- Create: `site/src/config/env.ts`
- Test: `site/tests/env.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseEnv(raw: Record<string, string | undefined>): Env` where `Env = { siteUrl: string; giscusRepo: string; giscusRepoId: string; giscusCategoryId: string; analyticsToken: string | null }`. Throws `Error` on invalid input. Also `site/src/config/site.ts` is created in Task 5, not here.

- [ ] **Step 1: Scaffold the directory and pin the toolchain**

```bash
cd "$(git rev-parse --show-toplevel)"
echo "20.11.1" > .nvmrc
mkdir -p site/src/{config,content,lib,components,layouts,pages,styles,assets} site/public site/scripts/lib site/tests
cd site
pnpm init
pnpm add astro@^5 zod@^3
pnpm add -D typescript vitest @types/node
pnpm pkg set packageManager="pnpm@9.12.0"
pnpm pkg set engines.node=">=20.11 <23"
pnpm pkg set type="module"
pnpm pkg set scripts.dev="astro dev"
pnpm pkg set scripts.build="astro build"
pnpm pkg set scripts.check="astro check"
pnpm pkg set scripts.test="vitest run"
```

- [ ] **Step 2: Write `site/astro.config.mjs`**

```js
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: process.env.SITE_URL ?? 'http://localhost:4321',
  output: 'static',
  trailingSlash: 'always',
  build: { inlineStylesheets: 'never' },
});
```

`inlineStylesheets: 'never'` is load-bearing: inlined `<style>` blocks would be
blocked by the `style-src 'self'` CSP added in Task 15.

- [ ] **Step 3: Write `site/tsconfig.json` and `site/vitest.config.ts`**

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src", "tests", "scripts"]
}
```

```ts
// site/vitest.config.ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
```

- [ ] **Step 4: Write the failing test**

```ts
// site/tests/env.test.ts
import { describe, expect, it } from 'vitest';
import { parseEnv } from '@/config/env';

const valid = {
  SITE_URL: 'https://example.com',
  PUBLIC_GISCUS_REPO: 'izziwoot/sdlc-izziwoot-blog-prodution',
  PUBLIC_GISCUS_REPO_ID: 'R_abc123',
  PUBLIC_GISCUS_CATEGORY_ID: 'DIC_abc123',
  PUBLIC_CF_BEACON_TOKEN: 'deadbeef',
};

describe('parseEnv', () => {
  it('returns a normalised Env for valid input', () => {
    const env = parseEnv(valid);
    expect(env.siteUrl).toBe('https://example.com');
    expect(env.analyticsToken).toBe('deadbeef');
  });

  it('strips a trailing slash from siteUrl so canonical URLs never double up', () => {
    expect(parseEnv({ ...valid, SITE_URL: 'https://example.com/' }).siteUrl).toBe(
      'https://example.com',
    );
  });

  it('throws when SITE_URL is missing', () => {
    const { SITE_URL: _omit, ...rest } = valid;
    expect(() => parseEnv(rest)).toThrow(/SITE_URL/);
  });

  it('throws when SITE_URL is not an absolute http(s) URL', () => {
    expect(() => parseEnv({ ...valid, SITE_URL: 'example.com' })).toThrow(/SITE_URL/);
  });

  it('throws when a giscus identifier is missing', () => {
    const { PUBLIC_GISCUS_REPO_ID: _omit, ...rest } = valid;
    expect(() => parseEnv(rest)).toThrow(/PUBLIC_GISCUS_REPO_ID/);
  });

  it('treats a missing analytics token as null rather than failing', () => {
    const { PUBLIC_CF_BEACON_TOKEN: _omit, ...rest } = valid;
    expect(parseEnv(rest).analyticsToken).toBeNull();
  });
});
```

- [ ] **Step 5: Run the test and verify it fails**

Run: `cd site && pnpm vitest run tests/env.test.ts`
Expected: FAIL — `Failed to resolve import "@/config/env"`.

- [ ] **Step 6: Write `site/src/config/env.ts`**

```ts
import { z } from 'zod';

const schema = z.object({
  SITE_URL: z
    .string({ required_error: 'SITE_URL is required' })
    .url('SITE_URL must be an absolute http(s) URL')
    .refine((u) => /^https?:\/\//.test(u), 'SITE_URL must be an absolute http(s) URL'),
  PUBLIC_GISCUS_REPO: z.string({ required_error: 'PUBLIC_GISCUS_REPO is required' }).min(3),
  PUBLIC_GISCUS_REPO_ID: z.string({ required_error: 'PUBLIC_GISCUS_REPO_ID is required' }).min(3),
  PUBLIC_GISCUS_CATEGORY_ID: z
    .string({ required_error: 'PUBLIC_GISCUS_CATEGORY_ID is required' })
    .min(3),
  PUBLIC_CF_BEACON_TOKEN: z.string().min(1).optional(),
});

export type Env = {
  siteUrl: string;
  giscusRepo: string;
  giscusRepoId: string;
  giscusCategoryId: string;
  analyticsToken: string | null;
};

export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid build environment — ${detail}`);
  }
  const v = result.data;
  return {
    siteUrl: v.SITE_URL.replace(/\/+$/, ''),
    giscusRepo: v.PUBLIC_GISCUS_REPO,
    giscusRepoId: v.PUBLIC_GISCUS_REPO_ID,
    giscusCategoryId: v.PUBLIC_GISCUS_CATEGORY_ID,
    analyticsToken: v.PUBLIC_CF_BEACON_TOKEN ?? null,
  };
}
```

- [ ] **Step 7: Run the test and verify it passes**

Run: `cd site && pnpm vitest run tests/env.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 8: Commit**

```bash
git add .nvmrc site/
git commit -m "feat(site): scaffold Astro project with validated build environment"
```

---

### Task 2: Content schemas as a pure, testable module

**Files:**
- Create: `site/src/content/schema.ts`
- Create: `site/src/content/config.ts`
- Create: `site/src/content/authors/adilson-cesar.json`
- Test: `site/tests/schema.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 beyond the toolchain.
- Produces: `TAGS: readonly string[]`, `RESERVED_SLUGS: readonly string[]`, `KEBAB: RegExp`, `blogSchema(ctx: { image: ImageHelper }): ZodType`, `authorsSchema(ctx: { image: ImageHelper }): ZodType`, and `type BlogFrontmatter = z.infer<...>`. `ImageHelper = () => z.ZodTypeAny`.

- [ ] **Step 1: Write the failing test**

```ts
// site/tests/schema.test.ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { blogSchema, RESERVED_SLUGS, TAGS } from '@/content/schema';

const image = () => z.string();
const schema = blogSchema({ image });

const base = {
  title: 'Choosing boring tools on purpose',
  description:
    'Why the least exciting option in a technology decision is usually the one that survives contact with production, and how to tell the difference.',
  pubDate: '2026-09-01',
  tags: ['architecture'],
};

describe('blogSchema', () => {
  it('accepts a minimal valid post and defaults draft to false', () => {
    const parsed = schema.parse(base);
    expect(parsed.draft).toBe(false);
    expect(parsed.pubDate).toBeInstanceOf(Date);
  });

  it('rejects a title shorter than 10 or longer than 70 characters', () => {
    expect(() => schema.parse({ ...base, title: 'Too short' })).toThrow();
    expect(() => schema.parse({ ...base, title: 'x'.repeat(71) })).toThrow();
  });

  it('rejects a description outside 70–160 characters', () => {
    expect(() => schema.parse({ ...base, description: 'x'.repeat(69) })).toThrow();
    expect(() => schema.parse({ ...base, description: 'x'.repeat(161) })).toThrow();
  });

  it('requires at least one tag and allows at most four', () => {
    expect(() => schema.parse({ ...base, tags: [] })).toThrow();
    expect(() => schema.parse({ ...base, tags: TAGS.slice(0, 5) })).toThrow();
  });

  it('rejects a tag outside the closed vocabulary', () => {
    expect(() => schema.parse({ ...base, tags: ['blockchain'] })).toThrow();
  });

  it('rejects duplicate tags', () => {
    expect(() => schema.parse({ ...base, tags: ['ai', 'ai'] })).toThrow(/unique/);
  });

  it('rejects unknown front-matter keys so a typo cannot pass silently', () => {
    expect(() => schema.parse({ ...base, publishDate: '2026-09-01' })).toThrow();
  });

  it('rejects a slug key — the filename is the only slug source', () => {
    expect(() => schema.parse({ ...base, slug: 'custom' })).toThrow();
  });

  it('rejects updatedDate earlier than pubDate', () => {
    expect(() =>
      schema.parse({ ...base, updatedDate: '2026-08-01' }),
    ).toThrow(/updatedDate/);
  });

  it('accepts updatedDate equal to pubDate', () => {
    expect(() => schema.parse({ ...base, updatedDate: '2026-09-01' })).not.toThrow();
  });

  it('requires meaningful alt text when a cover image is present', () => {
    expect(() =>
      schema.parse({ ...base, cover: { src: './a.png', alt: 'img' } }),
    ).toThrow(/alt/);
    expect(() =>
      schema.parse({ ...base, cover: { src: './a.png', alt: 'A whiteboard sketch of the retry loop' } }),
    ).not.toThrow();
  });

  it('cannot express a cover image without alt text at all', () => {
    expect(() => schema.parse({ ...base, cover: { src: './a.png' } })).toThrow();
  });

  it('accepts an append-only corrections log with substantive notes', () => {
    const parsed = schema.parse({
      ...base,
      corrections: [{ date: '2026-09-10', note: 'The benchmark figure was wrong by 10x.' }],
    });
    expect(parsed.corrections).toHaveLength(1);
  });

  it('rejects a correction note too short to explain anything', () => {
    expect(() =>
      schema.parse({ ...base, corrections: [{ date: '2026-09-10', note: 'oops' }] }),
    ).toThrow();
  });

  it('accepts a retraction with a date and a reason', () => {
    const parsed = schema.parse({
      ...base,
      retracted: { date: '2026-09-20', reason: 'The central claim does not replicate.' },
    });
    expect(parsed.retracted?.reason).toMatch(/replicate/);
  });
});

describe('vocabulary invariants', () => {
  it('exposes tags as lowercase kebab-case', () => {
    for (const tag of TAGS) expect(tag).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it('reserves every top-level segment used under /blog/', () => {
    expect(RESERVED_SLUGS).toContain('tags');
  });

  it('never reserves a name that is also a tag, which would be contradictory', () => {
    for (const reserved of RESERVED_SLUGS) {
      expect(TAGS).not.toContain(reserved as (typeof TAGS)[number]);
    }
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd site && pnpm vitest run tests/schema.test.ts`
Expected: FAIL — cannot resolve `@/content/schema`.

- [ ] **Step 3: Write `site/src/content/schema.ts`**

```ts
import { z } from 'zod';

/** Lowercase kebab-case. Applied to slugs and tags alike. */
export const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Closed tag vocabulary. Tags are URLs (/blog/tags/<tag>/), so a rename breaks
 * published links (INV-5). Adding a member is a deliberate reviewed change.
 */
export const TAGS = [
  'ai',
  'llm',
  'architecture',
  'devops',
  'security',
  'career',
  'tooling',
] as const;

/**
 * Slugs that would collide with a real route under /blog/. A post filename
 * matching one of these is a build error (see scripts/check-filenames.mjs).
 */
export const RESERVED_SLUGS = ['tags'] as const;

export type ImageHelper = () => z.ZodTypeAny;

export const blogSchema = ({ image }: { image: ImageHelper }) =>
  z
    .object({
      title: z.string().min(10).max(70),
      description: z.string().min(70).max(160),
      pubDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      tags: z
        .array(z.enum(TAGS))
        .min(1)
        .max(4)
        .refine((t) => new Set(t).size === t.length, 'tags must be unique'),
      draft: z.boolean().default(false),
      cover: z
        .object({
          src: image(),
          alt: z.string().min(10, 'alt text must be meaningful, not a filename'),
        })
        .strict()
        .optional(),
      canonicalUrl: z.string().url().optional(),
      corrections: z
        .array(z.object({ date: z.coerce.date(), note: z.string().min(20) }).strict())
        .optional(),
      retracted: z
        .object({ date: z.coerce.date(), reason: z.string().min(20) })
        .strict()
        .optional(),
      author: z.string().default('adilson-cesar'),
    })
    .strict()
    .refine(
      (d) => !d.updatedDate || d.updatedDate >= d.pubDate,
      'updatedDate cannot precede pubDate',
    );

export const authorsSchema = ({ image }: { image: ImageHelper }) =>
  z
    .object({
      name: z.string().min(2),
      title: z.string().optional(),
      avatar: z.object({ src: image(), alt: z.string().min(5) }).strict().optional(),
      links: z
        .array(
          z
            .object({
              label: z.string().min(1),
              href: z.string().url(),
              icon: z.enum(['github', 'linkedin', 'x', 'rss', 'email']),
            })
            .strict(),
        )
        .default([]),
    })
    .strict();

export type BlogFrontmatter = z.infer<ReturnType<typeof blogSchema>>;
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd site && pnpm vitest run tests/schema.test.ts`
Expected: PASS — 18 tests.

- [ ] **Step 5: Bind the schemas to Astro and seed the author record**

```ts
// site/src/content/config.ts
import { defineCollection, reference } from 'astro:content';
import { authorsSchema, blogSchema } from './schema';

const blog = defineCollection({
  type: 'content',
  schema: (ctx) =>
    blogSchema(ctx).and(
      // Re-declare `author` as a collection reference now that Astro's
      // runtime is available. The pure schema keeps it a plain string so
      // Vitest can test every other rule without astro:content.
      blogSchema === blogSchema ? (reference('authors'), blogSchema(ctx)) : blogSchema(ctx),
    ),
});
```

> **Do not write the above.** It is shown as the trap to avoid: intersecting the
> schema with itself to sneak a `reference()` in. Write this instead:

```ts
// site/src/content/config.ts
import { defineCollection } from 'astro:content';
import { authorsSchema, blogSchema } from './schema';

const blog = defineCollection({ type: 'content', schema: blogSchema });
const authors = defineCollection({ type: 'data', schema: authorsSchema });

export const collections = { blog, authors };
```

`author` stays a plain string validated against the `authors` collection by
`scripts/check-filenames.mjs` in Task 4, rather than by `reference()`. This keeps
the whole schema unit-testable, which matters more than the reference's runtime
convenience.

```json
// site/src/content/authors/adilson-cesar.json
{
  "name": "Adilson Cesar",
  "title": "Software engineer",
  "links": [
    { "label": "GitHub", "href": "https://github.com/izziwoot", "icon": "github" },
    { "label": "RSS", "href": "https://example.com/feed.xml", "icon": "rss" }
  ]
}
```

Replace the RSS `href` origin once the domain is known (Open Question 1).

- [ ] **Step 6: Commit**

```bash
git add site/src/content site/tests/schema.test.ts
git commit -m "feat(content): add typed blog and author schemas with build-failing validation"
```

---

### Task 3: Post selection, ordering, and tag grouping

**Files:**
- Create: `site/src/lib/posts.ts`
- Create: `site/src/lib/format.ts`
- Test: `site/tests/posts.test.ts`, `site/tests/format.test.ts`

**Interfaces:**
- Consumes: `TAGS`, `BlogFrontmatter` from `@/content/schema`.
- Produces:
  - `type PostLike = { id: string; slug: string; data: Pick<BlogFrontmatter, 'pubDate'|'draft'|'tags'|'retracted'|'updatedDate'> }`
  - `selectPublished<T extends PostLike>(posts: T[], opts: { now: Date; includeDrafts: boolean }): T[]`
  - `selectListable<T extends PostLike>(posts: T[], opts): T[]` — published minus retracted
  - `futureDated<T extends PostLike>(posts: T[], now: Date): T[]`
  - `groupByTag<T extends PostLike>(posts: T[]): Map<(typeof TAGS)[number], T[]>`
  - `tagsWithCounts<T extends PostLike>(posts: T[]): { tag: string; count: number }[]`
  - `formatDate(d: Date): string`, `readingTimeLabel(minutes: number): string`

- [ ] **Step 1: Write the failing test for selection and ordering**

```ts
// site/tests/posts.test.ts
import { describe, expect, it } from 'vitest';
import {
  futureDated,
  groupByTag,
  selectListable,
  selectPublished,
  tagsWithCounts,
  type PostLike,
} from '@/lib/posts';

const NOW = new Date('2026-09-28T00:00:00Z');

const post = (over: Partial<PostLike['data']> & { slug: string }): PostLike => {
  const { slug, ...data } = over;
  return {
    id: `${slug}.md`,
    slug,
    data: { pubDate: new Date('2026-01-01'), draft: false, tags: ['ai'], ...data },
  };
};

describe('selectPublished', () => {
  it('returns an empty array for an empty input rather than throwing', () => {
    expect(selectPublished([], { now: NOW, includeDrafts: false })).toEqual([]);
  });

  it('excludes drafts in production mode', () => {
    const posts = [post({ slug: 'a' }), post({ slug: 'b', draft: true })];
    expect(selectPublished(posts, { now: NOW, includeDrafts: false }).map((p) => p.slug)).toEqual(['a']);
  });

  it('includes drafts when includeDrafts is set, for dev and preview builds', () => {
    const posts = [post({ slug: 'a' }), post({ slug: 'b', draft: true })];
    expect(selectPublished(posts, { now: NOW, includeDrafts: true })).toHaveLength(2);
  });

  it('excludes a future-dated post from production output', () => {
    const posts = [post({ slug: 'future', pubDate: new Date('2026-12-25') })];
    expect(selectPublished(posts, { now: NOW, includeDrafts: false })).toEqual([]);
  });

  it('includes a future-dated post when drafts are included', () => {
    const posts = [post({ slug: 'future', pubDate: new Date('2026-12-25') })];
    expect(selectPublished(posts, { now: NOW, includeDrafts: true })).toHaveLength(1);
  });

  it('treats a post dated exactly now as published', () => {
    const posts = [post({ slug: 'boundary', pubDate: NOW })];
    expect(selectPublished(posts, { now: NOW, includeDrafts: false })).toHaveLength(1);
  });

  it('orders by pubDate descending', () => {
    const posts = [
      post({ slug: 'old', pubDate: new Date('2026-01-01') }),
      post({ slug: 'new', pubDate: new Date('2026-06-01') }),
    ];
    expect(selectPublished(posts, { now: NOW, includeDrafts: false }).map((p) => p.slug)).toEqual([
      'new',
      'old',
    ]);
  });

  it('breaks a pubDate tie by id ascending, so ordering is deterministic across machines', () => {
    const same = new Date('2026-05-05');
    const posts = [
      post({ slug: 'zebra', pubDate: same }),
      post({ slug: 'alpha', pubDate: same }),
    ];
    const ordered = selectPublished(posts, { now: NOW, includeDrafts: false }).map((p) => p.slug);
    expect(ordered).toEqual(['alpha', 'zebra']);
    // Running it twice must not change the answer.
    expect(selectPublished([...posts].reverse(), { now: NOW, includeDrafts: false }).map((p) => p.slug))
      .toEqual(['alpha', 'zebra']);
  });

  it('does not mutate the input array', () => {
    const posts = [post({ slug: 'b', pubDate: new Date('2026-01-01') }), post({ slug: 'a', pubDate: new Date('2026-02-01') })];
    const before = posts.map((p) => p.slug);
    selectPublished(posts, { now: NOW, includeDrafts: false });
    expect(posts.map((p) => p.slug)).toEqual(before);
  });
});

describe('selectListable', () => {
  it('excludes retracted posts from listings while selectPublished still yields them for routing', () => {
    const posts = [
      post({ slug: 'ok' }),
      post({ slug: 'gone', retracted: { date: NOW, reason: 'x'.repeat(20) } }),
    ];
    expect(selectListable(posts, { now: NOW, includeDrafts: false }).map((p) => p.slug)).toEqual(['ok']);
    expect(selectPublished(posts, { now: NOW, includeDrafts: false })).toHaveLength(2);
  });
});

describe('futureDated', () => {
  it('reports future-dated posts so the build can warn about them', () => {
    const posts = [post({ slug: 'now' }), post({ slug: 'later', pubDate: new Date('2027-01-01') })];
    expect(futureDated(posts, NOW).map((p) => p.slug)).toEqual(['later']);
  });
});

describe('groupByTag', () => {
  it('returns an empty map for no posts', () => {
    expect(groupByTag([]).size).toBe(0);
  });

  it('omits tags with no posts entirely, so no empty tag page is generated', () => {
    const grouped = groupByTag([post({ slug: 'a', tags: ['ai'] })]);
    expect([...grouped.keys()]).toEqual(['ai']);
    expect(grouped.has('devops')).toBe(false);
  });

  it('places a multi-tagged post under each of its tags', () => {
    const grouped = groupByTag([post({ slug: 'a', tags: ['ai', 'security'] })]);
    expect(grouped.get('ai')?.[0]?.slug).toBe('a');
    expect(grouped.get('security')?.[0]?.slug).toBe('a');
  });

  it('preserves the incoming order within each tag group', () => {
    const grouped = groupByTag([
      post({ slug: 'newer', pubDate: new Date('2026-06-01'), tags: ['ai'] }),
      post({ slug: 'older', pubDate: new Date('2026-01-01'), tags: ['ai'] }),
    ]);
    expect(grouped.get('ai')?.map((p) => p.slug)).toEqual(['newer', 'older']);
  });
});

describe('tagsWithCounts', () => {
  it('sorts by count descending, then tag name ascending for a stable list', () => {
    const posts = [
      post({ slug: 'a', tags: ['ai'] }),
      post({ slug: 'b', tags: ['ai'] }),
      post({ slug: 'c', tags: ['security'] }),
      post({ slug: 'd', tags: ['devops'] }),
    ];
    expect(tagsWithCounts(posts)).toEqual([
      { tag: 'ai', count: 2 },
      { tag: 'devops', count: 1 },
      { tag: 'security', count: 1 },
    ]);
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `cd site && pnpm vitest run tests/posts.test.ts`
Expected: FAIL — cannot resolve `@/lib/posts`.

- [ ] **Step 3: Write `site/src/lib/posts.ts`**

```ts
import type { BlogFrontmatter } from '@/content/schema';
import { TAGS } from '@/content/schema';

export type Tag = (typeof TAGS)[number];

export type PostLike = {
  id: string;
  slug: string;
  data: Pick<BlogFrontmatter, 'pubDate' | 'draft' | 'tags' | 'retracted' | 'updatedDate'>;
};

export type SelectOpts = { now: Date; includeDrafts: boolean };

/** pubDate descending; id ascending as a deterministic tiebreak. */
function byRecencyThenId(a: PostLike, b: PostLike): number {
  const delta = b.data.pubDate.getTime() - a.data.pubDate.getTime();
  return delta !== 0 ? delta : a.id.localeCompare(b.id);
}

/**
 * Everything that gets a route: not a draft, not future-dated — unless
 * includeDrafts (dev and preview builds), where everything is visible.
 * Retracted posts ARE included: their URL must keep working (INV-5).
 */
export function selectPublished<T extends PostLike>(posts: T[], opts: SelectOpts): T[] {
  return posts
    .filter((p) => opts.includeDrafts || (!p.data.draft && p.data.pubDate <= opts.now))
    .slice()
    .sort(byRecencyThenId);
}

/** Everything that appears in a listing, the feed, or the sitemap. */
export function selectListable<T extends PostLike>(posts: T[], opts: SelectOpts): T[] {
  return selectPublished(posts, opts).filter((p) => !p.data.retracted);
}

/** Posts dated ahead of `now` — surfaced as a build warning, not an error. */
export function futureDated<T extends PostLike>(posts: T[], now: Date): T[] {
  return posts.filter((p) => p.data.pubDate > now);
}

export function groupByTag<T extends PostLike>(posts: T[]): Map<Tag, T[]> {
  const grouped = new Map<Tag, T[]>();
  for (const post of posts) {
    for (const tag of post.data.tags) {
      const bucket = grouped.get(tag);
      if (bucket) bucket.push(post);
      else grouped.set(tag, [post]);
    }
  }
  return grouped;
}

export function tagsWithCounts<T extends PostLike>(posts: T[]): { tag: Tag; count: number }[] {
  return [...groupByTag(posts).entries()]
    .map(([tag, list]) => ({ tag, count: list.length }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
```

- [ ] **Step 4: Run it and verify it passes**

Run: `cd site && pnpm vitest run tests/posts.test.ts`
Expected: PASS — 17 tests.

- [ ] **Step 5: Write the failing formatting test**

```ts
// site/tests/format.test.ts
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
```

- [ ] **Step 6: Write `site/src/lib/format.ts` and confirm both suites pass**

```ts
const LONG_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatDate(d: Date): string {
  return LONG_DATE.format(d);
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function readingTimeLabel(minutes: number): string {
  return `${Math.max(1, Math.round(minutes))} min read`;
}
```

Run: `cd site && pnpm vitest run`
Expected: PASS — all suites, 41 tests.

- [ ] **Step 7: Commit**

```bash
git add site/src/lib site/tests
git commit -m "feat(lib): add deterministic post selection, tag grouping, and date formatting"
```

---

### Task 4: Slug convention and route-collision guard

**Files:**
- Create: `site/scripts/lib/filenames.mjs`
- Create: `site/scripts/check-filenames.mjs`
- Modify: `site/package.json` — add the `lint:content` script
- Test: `site/tests/filenames.test.ts`

**Interfaces:**
- Consumes: `KEBAB`, `RESERVED_SLUGS` from `@/content/schema` (re-declared in the `.mjs` helper as plain values — the script runs under bare Node without TS resolution).
- Produces: `checkFilenames({ files, reserved, authors }): Problem[]` where `Problem = { file: string; kind: 'case' | 'extension' | 'reserved' | 'duplicate' | 'unknown-author'; message: string }`. Empty array means clean.

**Why this task exists:** Review Focus item 2. A post file named `tags.md` generates `/blog/tags/`, which is already the tag index route. Astro resolves the conflict by letting one win silently — the tag index disappears in production and nobody notices until a reader reports it.

- [ ] **Step 1: Write the failing test**

```ts
// site/tests/filenames.test.ts
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain JS helper consumed by a bare-Node script
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
    expect(problems[0].kind).toBe('case');
  });

  it('rejects an unexpected extension', () => {
    const problems = checkFilenames({ files: [ok('a-post.markdown')], reserved, authors });
    expect(problems[0].kind).toBe('extension');
  });

  it('rejects a slug that collides with a reserved route segment', () => {
    const problems = checkFilenames({ files: [ok('tags.md')], reserved, authors });
    expect(problems).toHaveLength(1);
    expect(problems[0].kind).toBe('reserved');
    expect(problems[0].message).toMatch(/\/blog\/tags\//);
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
    expect(problems[0].kind).toBe('unknown-author');
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
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `cd site && pnpm vitest run tests/filenames.test.ts`
Expected: FAIL — cannot find `../scripts/lib/filenames.mjs`.

- [ ] **Step 3: Write `site/scripts/lib/filenames.mjs`**

```js
export const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const ALLOWED_EXTENSIONS = ['.md', '.mdx'];

/**
 * @param {{ files: { file: string, author?: string }[], reserved: string[], authors: string[] }} input
 * @returns {{ file: string, kind: string, message: string }[]}
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
```

- [ ] **Step 4: Run it and verify it passes**

Run: `cd site && pnpm vitest run tests/filenames.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Write the CLI wrapper `site/scripts/check-filenames.mjs`**

```js
import { readdir, readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { checkFilenames } from './lib/filenames.mjs';

const BLOG_DIR = new URL('../src/content/blog/', import.meta.url);
const AUTHORS_DIR = new URL('../src/content/authors/', import.meta.url);
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
```

- [ ] **Step 6: Wire it into the scripts and prove it catches a real collision**

```bash
cd site
pnpm pkg set scripts.lint:content="node scripts/check-filenames.mjs"
pnpm lint:content          # expect: passed (no posts yet)
touch src/content/blog/tags.md
pnpm lint:content          # expect: exit 1, "collides with the existing route /blog/tags/"
rm src/content/blog/tags.md
```

Expected: the middle command exits non-zero and names the collision.

- [ ] **Step 7: Commit**

```bash
git add site/scripts site/tests/filenames.test.ts site/package.json
git commit -m "feat(ci): fail the build on bad slugs, duplicate slugs, and route collisions"
```

---

### Task 5: Site config, SEO tag construction, and the base layout

**Files:**
- Create: `site/src/config/site.ts`
- Create: `site/src/lib/seo.ts`
- Create: `site/src/components/SEO.astro`
- Create: `site/src/components/SkipLink.astro`
- Create: `site/src/layouts/BaseLayout.astro`
- Test: `site/tests/seo.test.ts`

**Interfaces:**
- Consumes: `parseEnv` from `@/config/env`; `formatDate`, `isoDate` from `@/lib/format`.
- Produces:
  - `site` object: `{ name, tagline, url, defaultLocale, giscus: { repo, repoId, category, categoryId }, analyticsToken }`
  - `absoluteUrl(path: string, origin: string): string`
  - `buildSeo(input: SeoInput): SeoTags` where `SeoInput = { origin: string; path: string; title: string; description: string; type: 'website' | 'article'; siteName: string; image?: string; canonicalOverride?: string; publishedTime?: Date; modifiedTime?: Date; noindex?: boolean }` and `SeoTags = { title: string; canonical: string; meta: { name?: string; property?: string; content: string }[]; jsonLd: Record<string, unknown> | null }`
  - `BaseLayout.astro` props: `{ title: string; description: string; path: string; type?: 'website' | 'article'; publishedTime?: Date; modifiedTime?: Date; canonicalOverride?: string }`

- [ ] **Step 1: Write the failing test**

```ts
// site/tests/seo.test.ts
import { describe, expect, it } from 'vitest';
import { absoluteUrl, buildSeo } from '@/lib/seo';

const base = {
  origin: 'https://example.com',
  path: '/blog/a-post/',
  title: 'A post about retries',
  description: 'x'.repeat(80),
  type: 'article' as const,
  siteName: 'Izzi Woot',
};

const contentOf = (tags: ReturnType<typeof buildSeo>, key: string) =>
  tags.meta.find((m) => m.name === key || m.property === key)?.content;

describe('absoluteUrl', () => {
  it('joins an origin and a path without doubling the slash', () => {
    expect(absoluteUrl('/blog/a/', 'https://example.com')).toBe('https://example.com/blog/a/');
  });

  it('tolerates an origin that carries a trailing slash', () => {
    expect(absoluteUrl('/blog/a/', 'https://example.com/')).toBe('https://example.com/blog/a/');
  });

  it('tolerates a path missing its leading slash', () => {
    expect(absoluteUrl('blog/a/', 'https://example.com')).toBe('https://example.com/blog/a/');
  });

  it('passes an already-absolute URL through unchanged', () => {
    expect(absoluteUrl('https://other.test/x/', 'https://example.com')).toBe('https://other.test/x/');
  });
});

describe('buildSeo', () => {
  it('produces an absolute canonical URL', () => {
    expect(buildSeo(base).canonical).toBe('https://example.com/blog/a-post/');
  });

  it('honours a cross-post canonical override so we do not claim someone else’s canonical', () => {
    const tags = buildSeo({ ...base, canonicalOverride: 'https://elsewhere.test/a/' });
    expect(tags.canonical).toBe('https://elsewhere.test/a/');
  });

  it('emits an absolute og:url and og:image, never a relative one', () => {
    const tags = buildSeo({ ...base, image: '/og/default.png' });
    expect(contentOf(tags, 'og:url')).toBe('https://example.com/blog/a-post/');
    expect(contentOf(tags, 'og:image')).toBe('https://example.com/og/default.png');
  });

  it('sets og:type from the page kind', () => {
    expect(contentOf(buildSeo(base), 'og:type')).toBe('article');
    expect(contentOf(buildSeo({ ...base, type: 'website' }), 'og:type')).toBe('website');
  });

  it('emits article timestamps as ISO 8601 when supplied', () => {
    const tags = buildSeo({
      ...base,
      publishedTime: new Date('2026-03-12T00:00:00Z'),
      modifiedTime: new Date('2026-04-01T00:00:00Z'),
    });
    expect(contentOf(tags, 'article:published_time')).toBe('2026-03-12T00:00:00.000Z');
    expect(contentOf(tags, 'article:modified_time')).toBe('2026-04-01T00:00:00.000Z');
  });

  it('omits article timestamps entirely for a website page', () => {
    const tags = buildSeo({ ...base, type: 'website' });
    expect(contentOf(tags, 'article:published_time')).toBeUndefined();
  });

  it('emits BlogPosting JSON-LD for an article and none for a website', () => {
    const article = buildSeo({ ...base, publishedTime: new Date('2026-03-12T00:00:00Z') });
    expect(article.jsonLd?.['@type']).toBe('BlogPosting');
    expect(article.jsonLd?.['mainEntityOfPage']).toEqual({
      '@type': 'WebPage',
      '@id': 'https://example.com/blog/a-post/',
    });
    expect(buildSeo({ ...base, type: 'website' }).jsonLd).toBeNull();
  });

  it('adds a robots noindex tag when asked, for preview deployments', () => {
    expect(contentOf(buildSeo({ ...base, noindex: true }), 'robots')).toBe('noindex, nofollow');
    expect(contentOf(buildSeo(base), 'robots')).toBeUndefined();
  });

  it('suffixes the document title with the site name except on the home page', () => {
    expect(buildSeo(base).title).toBe('A post about retries — Izzi Woot');
    expect(buildSeo({ ...base, path: '/', title: 'Izzi Woot' }).title).toBe('Izzi Woot');
  });

  it('never emits a description shorter than the schema minimum, guarding against a stray empty string', () => {
    expect(() => buildSeo({ ...base, description: '' })).toThrow(/description/);
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `cd site && pnpm vitest run tests/seo.test.ts`
Expected: FAIL — cannot resolve `@/lib/seo`.

- [ ] **Step 3: Write `site/src/lib/seo.ts`**

```ts
export type SeoInput = {
  origin: string;
  path: string;
  title: string;
  description: string;
  type: 'website' | 'article';
  siteName: string;
  image?: string;
  canonicalOverride?: string;
  publishedTime?: Date;
  modifiedTime?: Date;
  noindex?: boolean;
  author?: string;
};

export type MetaTag = { name?: string; property?: string; content: string };
export type SeoTags = {
  title: string;
  canonical: string;
  meta: MetaTag[];
  jsonLd: Record<string, unknown> | null;
};

export function absoluteUrl(path: string, origin: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${origin.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

export function buildSeo(input: SeoInput): SeoTags {
  if (!input.description.trim()) {
    throw new Error(`buildSeo: description is required for ${input.path}`);
  }

  const url = absoluteUrl(input.path, input.origin);
  const canonical = input.canonicalOverride ?? url;
  const image = absoluteUrl(input.image ?? '/og-default.png', input.origin);
  const isHome = input.path === '/';

  const meta: MetaTag[] = [
    { name: 'description', content: input.description },
    { property: 'og:title', content: input.title },
    { property: 'og:description', content: input.description },
    { property: 'og:url', content: url },
    { property: 'og:type', content: input.type },
    { property: 'og:site_name', content: input.siteName },
    { property: 'og:image', content: image },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: input.title },
    { name: 'twitter:description', content: input.description },
    { name: 'twitter:image', content: image },
  ];

  if (input.noindex) meta.push({ name: 'robots', content: 'noindex, nofollow' });

  if (input.type === 'article') {
    if (input.publishedTime) {
      meta.push({ property: 'article:published_time', content: input.publishedTime.toISOString() });
    }
    if (input.modifiedTime) {
      meta.push({ property: 'article:modified_time', content: input.modifiedTime.toISOString() });
    }
  }

  const jsonLd =
    input.type === 'article'
      ? {
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: input.title,
          description: input.description,
          image,
          datePublished: input.publishedTime?.toISOString(),
          dateModified: (input.modifiedTime ?? input.publishedTime)?.toISOString(),
          author: { '@type': 'Person', name: input.author ?? 'Adilson Cesar' },
          publisher: { '@type': 'Organization', name: input.siteName },
          mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        }
      : null;

  return {
    title: isHome ? input.title : `${input.title} — ${input.siteName}`,
    canonical,
    meta,
    jsonLd,
  };
}
```

- [ ] **Step 4: Run it and verify it passes**

Run: `cd site && pnpm vitest run tests/seo.test.ts`
Expected: PASS — 15 tests.

- [ ] **Step 5: Write `site/src/config/site.ts`**

```ts
import { parseEnv } from './env';

const env = parseEnv(import.meta.env as Record<string, string | undefined>);

export const site = {
  name: 'Izzi Woot',
  tagline: 'Notes on software, systems, and AI.',
  url: env.siteUrl,
  defaultLocale: 'en',
  giscus: {
    repo: env.giscusRepo,
    repoId: env.giscusRepoId,
    category: 'Comments',
    categoryId: env.giscusCategoryId,
  },
  analyticsToken: env.analyticsToken,
  /** Preview deployments must not compete with production in the index. */
  noindex: import.meta.env.CF_PAGES_BRANCH !== undefined && import.meta.env.CF_PAGES_BRANCH !== 'main',
  /** Drafts and future-dated posts are visible in dev and on previews only. */
  includeDrafts: import.meta.env.DEV || import.meta.env.CF_PAGES_BRANCH !== 'main',
} as const;
```

- [ ] **Step 6: Write `SkipLink.astro`, `SEO.astro`, and `BaseLayout.astro`**

```astro
---
// site/src/components/SkipLink.astro
---
<a class="skip-link" href="#main">Skip to content</a>
```

```astro
---
// site/src/components/SEO.astro
import { site } from '@/config/site';
import { buildSeo, type SeoInput } from '@/lib/seo';

type Props = Omit<SeoInput, 'origin' | 'siteName' | 'noindex'>;
const seo = buildSeo({
  ...Astro.props,
  origin: site.url,
  siteName: site.name,
  noindex: site.noindex,
});
---
<title>{seo.title}</title>
<link rel="canonical" href={seo.canonical} />
{seo.meta.map((tag) => <meta {...tag} />)}
<link rel="alternate" type="application/rss+xml" title={site.name} href="/feed.xml" />
{seo.jsonLd && <script type="application/ld+json" set:html={JSON.stringify(seo.jsonLd)} />}
```

`<script type="application/ld+json">` is data, not executable script, and is not
covered by `script-src`. No other inline script exists anywhere in the site.

```astro
---
// site/src/layouts/BaseLayout.astro
import SEO from '@/components/SEO.astro';
import SkipLink from '@/components/SkipLink.astro';
import { site } from '@/config/site';
import '@/styles/global.css';

type Props = {
  title: string;
  description: string;
  path: string;
  type?: 'website' | 'article';
  publishedTime?: Date;
  modifiedTime?: Date;
  canonicalOverride?: string;
};
const { type = 'website', ...rest } = Astro.props;
---
<!doctype html>
<html lang={site.defaultLocale}>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="preload" href="/fonts/body-latin.woff2" as="font" type="font/woff2" crossorigin />
    <SEO {...rest} type={type} />
    {site.analyticsToken && (
      <script
        defer
        src="https://static.cloudflareinsights.com/beacon.min.js"
        data-cf-beacon={JSON.stringify({ token: site.analyticsToken })}
      />
    )}
  </head>
  <body>
    <SkipLink />
    <header class="site-header">
      <a class="site-name" href="/">{site.name}</a>
      <nav aria-label="Primary">
        <a href="/blog/tags/">Topics</a>
        <a href="/about/">About</a>
        <a href="/feed.xml">RSS</a>
      </nav>
    </header>
    <main id="main"><slot /></main>
    <footer class="site-footer">
      <p>{site.tagline}</p>
      <p><a href="/privacy/">Privacy</a></p>
    </footer>
  </body>
</html>
```

The nav is four links with no disclosure widget — at this size it fits every
viewport, so the reference site's hamburger is unnecessary. No JS, no
`<details>`, nothing to make accessible.

- [ ] **Step 7: Verify the whole suite and typecheck**

Run: `cd site && SITE_URL=https://example.com PUBLIC_GISCUS_REPO=izziwoot/x PUBLIC_GISCUS_REPO_ID=R_x PUBLIC_GISCUS_CATEGORY_ID=DIC_x pnpm check && pnpm vitest run`
Expected: `astro check` reports 0 errors; all tests pass.

- [ ] **Step 8: Commit**

```bash
git add site/src/config site/src/lib/seo.ts site/src/components site/src/layouts site/tests/seo.test.ts
git commit -m "feat(site): add SEO tag construction, site config, and base layout"
```

---

### Task 6: Original design system — tokens, type scale, self-hosted fonts

**Files:**
- Create: `site/src/styles/global.css`
- Create: `site/public/fonts/body-latin.woff2`, `site/public/fonts/mono-latin.woff2`
- Test: `site/tests/contrast.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: CSS custom properties consumed by every component — `--bg`, `--fg`, `--fg-muted`, `--accent`, `--border`, `--code-bg`; and `contrastRatio(hexA: string, hexB: string): number` from `site/src/lib/contrast.ts`.

**Constraint reminder:** original identity only. Do not copy the reference site's
stylesheet, palette, type scale, or spacing. Oswald and Lora are *its* choices;
pick different faces.

- [ ] **Step 1: Acquire and subset the fonts**

```bash
cd site
# Body: a text-first serif or humanist sans of your choosing, NOT Lora or Oswald.
# Download the variable or 400/700 woff2 from the foundry or Google Fonts' static
# files, then subset to Latin to keep the payload small:
pnpm add -D glyphhanger
npx glyphhanger --subset=path/to/Body-Regular.ttf --formats=woff2 --LATIN
mv Body-Regular-subset.woff2 public/fonts/body-latin.woff2
# Repeat for the monospace face used by code blocks.
```

Self-hosting is mandatory: a font CDN is a third-party request that reveals every
reader's IP before body text paints, and `font-src 'self'` in Task 15 will block it.

- [ ] **Step 2: Write the failing contrast test**

```ts
// site/tests/contrast.test.ts
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '@/lib/contrast';
import { readFileSync } from 'node:fs';

/** Pull the declared token values straight out of the stylesheet. */
function tokens(block: 'light' | 'dark'): Record<string, string> {
  const css = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8');
  const marker = block === 'light' ? '/* tokens:light */' : '/* tokens:dark */';
  const start = css.indexOf(marker);
  expect(start, `missing ${marker} in global.css`).toBeGreaterThan(-1);
  const section = css.slice(start, css.indexOf('}', start));
  const found: Record<string, string> = {};
  for (const [, name, value] of section.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,8})/g)) {
    found[name] = value;
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
});

describe.each(['light', 'dark'] as const)('WCAG 2.2 AA in %s scheme', (scheme) => {
  it('body text meets 4.5:1 against the background', () => {
    const t = tokens(scheme);
    expect(contrastRatio(t.fg, t.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('muted text still meets 4.5:1 — it carries dates and reading time, not decoration', () => {
    const t = tokens(scheme);
    expect(contrastRatio(t['fg-muted'], t.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('link accent meets 4.5:1 against the background', () => {
    const t = tokens(scheme);
    expect(contrastRatio(t.accent, t.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('code text meets 4.5:1 against the code background', () => {
    const t = tokens(scheme);
    expect(contrastRatio(t.fg, t['code-bg'])).toBeGreaterThanOrEqual(4.5);
  });

  it('border meets 3:1 so focus outlines and rules are perceivable', () => {
    const t = tokens(scheme);
    expect(contrastRatio(t.border, t.bg)).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 3: Run it and verify it fails**

Run: `cd site && pnpm vitest run tests/contrast.test.ts`
Expected: FAIL — cannot resolve `@/lib/contrast`.

- [ ] **Step 4: Write `site/src/lib/contrast.ts`**

```ts
function channel(hex: string, index: number): number {
  const normalized =
    hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      : hex;
  const byte = Number.parseInt(normalized.slice(1 + index * 2, 3 + index * 2), 16) / 255;
  return byte <= 0.03928 ? byte / 12.92 : ((byte + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance per WCAG 2.x. */
export function luminance(hex: string): number {
  return 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
```

- [ ] **Step 5: Write `site/src/styles/global.css`**

Token values below are a starting point that satisfies the test. Adjust the hues to
taste; keep every ratio passing.

```css
:root {
  /* tokens:light */
  --bg: #fdfdfb;
  --fg: #1c1c1a;
  --fg-muted: #565650;
  --accent: #0b5c4f;
  --border: #b8b8ae;
  --code-bg: #f2f2ec;
  /* end tokens */

  --measure: 34rem;
  --step--1: clamp(0.83rem, 0.8rem + 0.15vw, 0.9rem);
  --step-0: clamp(1rem, 0.96rem + 0.2vw, 1.09rem);
  --step-1: clamp(1.2rem, 1.13rem + 0.35vw, 1.37rem);
  --step-2: clamp(1.44rem, 1.33rem + 0.55vw, 1.73rem);
  --step-3: clamp(1.73rem, 1.55rem + 0.9vw, 2.18rem);
  --space: 1.5rem;
}

@media (prefers-color-scheme: dark) {
  :root {
    /* tokens:dark */
    --bg: #121311;
    --fg: #ececE6;
    --fg-muted: #a8a8a0;
    --accent: #6fd3bd;
    --border: #4a4a44;
    --code-bg: #1c1d1a;
    /* end tokens */
  }
}

@font-face {
  font-family: 'Body';
  src: url('/fonts/body-latin.woff2') format('woff2');
  font-weight: 400 700;
  font-display: swap;
}

@font-face {
  font-family: 'Mono';
  src: url('/fonts/mono-latin.woff2') format('woff2');
  font-weight: 400;
  font-display: swap;
}

*, *::before, *::after { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: 'Body', Georgia, serif;
  font-size: var(--step-0);
  line-height: 1.65;
  text-wrap: pretty;
}

main { max-width: var(--measure); margin-inline: auto; padding: var(--space) 1rem; }

h1, h2, h3 { line-height: 1.2; text-wrap: balance; }
h1 { font-size: var(--step-3); }
h2 { font-size: var(--step-2); margin-block-start: calc(var(--space) * 1.5); }
h3 { font-size: var(--step-1); }

a { color: var(--accent); text-underline-offset: 0.15em; }

:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }

.skip-link {
  position: absolute;
  inset-inline-start: -100vw;
  padding: 0.5rem 1rem;
  background: var(--bg);
  border: 2px solid var(--accent);
}
.skip-link:focus { inset-inline-start: 0; }

.site-header, .site-footer {
  max-width: var(--measure);
  margin-inline: auto;
  padding: var(--space) 1rem;
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: baseline;
  justify-content: space-between;
}
.site-header nav { display: flex; flex-wrap: wrap; gap: 1rem; }
.site-footer { border-block-start: 1px solid var(--border); color: var(--fg-muted); }

.post-meta { color: var(--fg-muted); font-size: var(--step--1); }

pre {
  background: var(--code-bg);
  padding: 1rem;
  overflow-x: auto;
  border: 1px solid var(--border);
  font-family: 'Mono', ui-monospace, monospace;
}
code { font-family: 'Mono', ui-monospace, monospace; font-size: 0.92em; }

img { max-width: 100%; height: auto; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
```

- [ ] **Step 6: Run the test and verify it passes**

Run: `cd site && pnpm vitest run tests/contrast.test.ts`
Expected: PASS — 13 tests. If a ratio fails, darken or lighten the token until it
passes; do not relax the threshold.

- [ ] **Step 7: Commit**

```bash
git add site/src/styles site/src/lib/contrast.ts site/public/fonts site/tests/contrast.test.ts
git commit -m "feat(design): add original design tokens with machine-verified AA contrast"
```

---

### Task 7: Index route and post listing component

**Files:**
- Create: `site/src/lib/entries.ts`
- Create: `site/src/components/PostCard.astro`
- Create: `site/src/components/TagList.astro`
- Create: `site/src/pages/index.astro`
- Create: `site/src/content/blog/choose-boring-tools.md` (a real first post, to have something to render)
- Modify: `site/astro.config.mjs` — add `remark-reading-time`
- Test: `site/tests/entries.test.ts`

**Interfaces:**
- Consumes: `selectListable`, `selectPublished`, `futureDated`, `tagsWithCounts` from `@/lib/posts`; `formatDate`, `isoDate`, `readingTimeLabel` from `@/lib/format`; `site` from `@/config/site`.
- Produces:
  - `site/src/lib/entries.ts`: `getPublishedPosts()`, `getListablePosts()` — the **only** place `getCollection('blog', …)` is called. `warnAboutFutureDated(posts, now, log): void`, and `POST_LIMIT_WARNING = 60`.
  - `PostCard.astro` props: `{ slug: string; title: string; pubDate: Date; minutes: number; tags: readonly string[] }`
  - `TagList.astro` props: `{ tags: readonly string[]; as?: 'ul' | 'span' }`

- [ ] **Step 1: Write the failing test for the warning logic**

```ts
// site/tests/entries.test.ts
import { describe, expect, it, vi } from 'vitest';
import { POST_LIMIT_WARNING, warnAboutFutureDated, warnAboutVolume } from '@/lib/entries';
import type { PostLike } from '@/lib/posts';

const NOW = new Date('2026-09-28T00:00:00Z');
const post = (slug: string, pubDate: string): PostLike => ({
  id: `${slug}.md`,
  slug,
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
    expect(log.mock.calls[0][0]).toMatch(/a\.md/);
    expect(log.mock.calls[0][0]).not.toMatch(/b\.md/);
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
    expect(log.mock.calls[0][0]).toMatch(/pagination/i);
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `cd site && pnpm vitest run tests/entries.test.ts`
Expected: FAIL — cannot resolve `@/lib/entries`.

- [ ] **Step 3: Write `site/src/lib/entries.ts`**

```ts
import { getCollection, type CollectionEntry } from 'astro:content';
import { site } from '@/config/site';
import { futureDated, selectListable, selectPublished, type PostLike } from '@/lib/posts';

export const POST_LIMIT_WARNING = 60;

export type BlogEntry = CollectionEntry<'blog'>;

function opts() {
  return { now: new Date(), includeDrafts: site.includeDrafts };
}

/** Every post that gets a route, including retracted ones (INV-5). */
export async function getPublishedPosts(): Promise<BlogEntry[]> {
  return selectPublished(await getCollection('blog'), opts());
}

/** Every post that appears in a listing, the feed, or the sitemap. */
export async function getListablePosts(): Promise<BlogEntry[]> {
  return selectListable(await getCollection('blog'), opts());
}

export function warnAboutFutureDated(
  posts: PostLike[],
  now: Date,
  log: (msg: string) => void = console.warn,
): void {
  const future = futureDated(posts, now);
  if (future.length === 0) return;
  log(
    `[content] ${future.length} post(s) dated in the future and excluded from production: ` +
      future.map((p) => p.id).join(', '),
  );
}

export function warnAboutVolume(count: number, log: (msg: string) => void = console.warn): void {
  if (count < POST_LIMIT_WARNING) return;
  log(
    `[content] ${count} published posts on a single unpaginated index — ` +
      `introduce pagination deliberately (spec FR-4a).`,
  );
}
```

- [ ] **Step 4: Run it and verify it passes**

Run: `cd site && pnpm vitest run tests/entries.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Add reading time to the Markdown pipeline**

```bash
cd site && pnpm add remark-reading-time
```

```js
// site/astro.config.mjs — add to the existing defineConfig call
import remarkReadingTime from 'remark-reading-time';

export default defineConfig({
  site: process.env.SITE_URL ?? 'http://localhost:4321',
  output: 'static',
  trailingSlash: 'always',
  build: { inlineStylesheets: 'never' },
  markdown: {
    remarkPlugins: [remarkReadingTime],
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
      wrap: false,
    },
  },
});
```

`remark-reading-time` writes `data.astro.frontmatter.readingTime` with a `minutes`
field. Read it via `post.render()`'s `remarkPluginFrontmatter`.

- [ ] **Step 6: Write the components and the index page**

```astro
---
// site/src/components/TagList.astro
type Props = { tags: readonly string[]; as?: 'ul' | 'span' };
const { tags, as = 'span' } = Astro.props;
const Wrapper = as;
---
<Wrapper class="tag-list">
  {tags.map((tag) =>
    as === 'ul' ? (
      <li><a href={`/blog/tags/${tag}/`}>{tag}</a></li>
    ) : (
      <a href={`/blog/tags/${tag}/`}>{tag}</a>
    ),
  )}
</Wrapper>
```

```astro
---
// site/src/components/PostCard.astro
import TagList from '@/components/TagList.astro';
import { formatDate, isoDate, readingTimeLabel } from '@/lib/format';

type Props = {
  slug: string;
  title: string;
  pubDate: Date;
  minutes: number;
  tags: readonly string[];
  draft?: boolean;
};
const { slug, title, pubDate, minutes, tags, draft = false } = Astro.props;
---
<article class="post-card">
  <h2><a href={`/blog/${slug}/`}>{title}</a>{draft && <span class="badge">draft</span>}</h2>
  <p class="post-meta">
    <time datetime={isoDate(pubDate)}>{formatDate(pubDate)}</time>
    <span aria-hidden="true">·</span>
    <span>{readingTimeLabel(minutes)}</span>
    <span aria-hidden="true">·</span>
    <TagList tags={tags} />
  </p>
</article>
```

```astro
---
// site/src/pages/index.astro
import BaseLayout from '@/layouts/BaseLayout.astro';
import PostCard from '@/components/PostCard.astro';
import { site } from '@/config/site';
import { getListablePosts, warnAboutFutureDated, warnAboutVolume } from '@/lib/entries';
import { getCollection } from 'astro:content';

const posts = await getListablePosts();
warnAboutFutureDated(await getCollection('blog'), new Date());
warnAboutVolume(posts.length);

const withReadingTime = await Promise.all(
  posts.map(async (post) => {
    const { remarkPluginFrontmatter } = await post.render();
    return { post, minutes: remarkPluginFrontmatter.readingTime?.minutes ?? 1 };
  }),
);
---
<BaseLayout
  title={site.name}
  description={`${site.tagline} Essays on software architecture, AI, and the practice of building systems.`}
  path="/"
>
  <h1>{site.name}</h1>
  <p>{site.tagline}</p>

  {withReadingTime.length === 0 ? (
    <p>No posts published yet.</p>
  ) : (
    withReadingTime.map(({ post, minutes }) => (
      <PostCard
        slug={post.slug}
        title={post.data.title}
        pubDate={post.data.pubDate}
        minutes={minutes}
        tags={post.data.tags}
        draft={post.data.draft}
      />
    ))
  )}
</BaseLayout>
```

The empty-state branch is Review Focus item 1: a fresh clone with every post
drafted renders a sentence, not a crash or a blank page.

- [ ] **Step 7: Write the first real post**

```markdown
---
title: Choosing boring tools on purpose
description: Why the least exciting option in a technology decision is usually the one that survives contact with production, and how to tell the two apart.
pubDate: 2026-09-28
tags:
  - architecture
  - tooling
---

Every technology choice carries a maintenance bill that arrives later than the
decision that created it.

## The bill arrives later

Write the post. This file exists so the index, the post route, the feed, and the
sitemap all have real content to render during development.

```ts
const retries = 3;
```
```

- [ ] **Step 8: Verify the index renders with real content**

```bash
cd site
SITE_URL=http://localhost:4321 PUBLIC_GISCUS_REPO=izziwoot/x PUBLIC_GISCUS_REPO_ID=R_x \
  PUBLIC_GISCUS_CATEGORY_ID=DIC_x pnpm build
grep -q "Choosing boring tools" dist/index.html && echo "index renders the post"
grep -q "min read" dist/index.html && echo "reading time present"
```

Expected: both echoes print. Build reports no warnings about future-dated posts.

- [ ] **Step 9: Commit**

```bash
git add site/
git commit -m "feat(site): add index route, post listing components, and first post"
```

---

### Task 8: Post route, corrections, and retraction rendering

**Files:**
- Create: `site/src/layouts/PostLayout.astro`
- Create: `site/src/pages/blog/[...slug].astro`
- Modify: `site/astro.config.mjs` — add `rehype-slug`, `rehype-autolink-headings`, `rehype-external-links`
- Test: `site/tests/post-render.test.ts` (build-output assertions), `site/tests/corrections.test.ts` (pure logic)

**Interfaces:**
- Consumes: `getPublishedPosts` from `@/lib/entries`; `formatDate`, `isoDate`, `readingTimeLabel` from `@/lib/format`; `BaseLayout`.
- Produces: `postStatus(data: Pick<BlogFrontmatter,'retracted'|'corrections'|'updatedDate'|'pubDate'>): PostStatus` in `site/src/lib/status.ts`, where `PostStatus = { retracted: boolean; hasCorrections: boolean; showUpdated: boolean; latestChange: Date }`. `PostLayout.astro` props: `{ post: BlogEntry; minutes: number }`.

- [ ] **Step 1: Add the rehype plugins**

```bash
cd site && pnpm add rehype-slug rehype-autolink-headings rehype-external-links
```

```js
// site/astro.config.mjs — extend the markdown block
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeExternalLinks from 'rehype-external-links';
import rehypeSlug from 'rehype-slug';

  markdown: {
    remarkPlugins: [remarkReadingTime],
    rehypePlugins: [
      rehypeSlug,
      [rehypeAutolinkHeadings, { behavior: 'append', properties: { className: 'heading-anchor', ariaLabel: 'Permalink to this section' } }],
      // No target="_blank": hijacking the reader's navigation choice is a
      // regression, not a feature (spec FR-13).
      [rehypeExternalLinks, { rel: ['noopener', 'noreferrer'] }],
    ],
    shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' }, wrap: false },
  },
```

- [ ] **Step 2: Write the failing status test**

```ts
// site/tests/corrections.test.ts
import { describe, expect, it } from 'vitest';
import { postStatus } from '@/lib/status';

const pubDate = new Date('2026-01-01');

describe('postStatus', () => {
  it('reports a clean post as unchanged', () => {
    const s = postStatus({ pubDate });
    expect(s).toEqual({ retracted: false, hasCorrections: false, showUpdated: false, latestChange: pubDate });
  });

  it('flags a retracted post', () => {
    const s = postStatus({ pubDate, retracted: { date: new Date('2026-02-01'), reason: 'x'.repeat(20) } });
    expect(s.retracted).toBe(true);
  });

  it('flags corrections and treats an empty array as none', () => {
    expect(postStatus({ pubDate, corrections: [] }).hasCorrections).toBe(false);
    expect(
      postStatus({ pubDate, corrections: [{ date: new Date('2026-02-01'), note: 'x'.repeat(20) }] })
        .hasCorrections,
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
    const s = postStatus({ pubDate, retracted: { date: new Date('2026-09-01'), reason: 'x'.repeat(20) } });
    expect(s.latestChange).toEqual(new Date('2026-09-01'));
  });
});
```

- [ ] **Step 3: Run it, verify it fails, then write `site/src/lib/status.ts`**

Run: `cd site && pnpm vitest run tests/corrections.test.ts` → FAIL (unresolved import).

```ts
import type { BlogFrontmatter } from '@/content/schema';

export type StatusInput = Pick<
  BlogFrontmatter,
  'pubDate' | 'updatedDate' | 'corrections' | 'retracted'
>;

export type PostStatus = {
  retracted: boolean;
  hasCorrections: boolean;
  showUpdated: boolean;
  latestChange: Date;
};

export function postStatus(data: StatusInput): PostStatus {
  const candidates: Date[] = [data.pubDate];
  if (data.updatedDate) candidates.push(data.updatedDate);
  if (data.retracted) candidates.push(data.retracted.date);
  for (const c of data.corrections ?? []) candidates.push(c.date);

  const latestChange = candidates.reduce((a, b) => (b > a ? b : a), data.pubDate);

  return {
    retracted: data.retracted !== undefined,
    hasCorrections: (data.corrections ?? []).length > 0,
    showUpdated: data.updatedDate !== undefined && data.updatedDate.getTime() !== data.pubDate.getTime(),
    latestChange,
  };
}
```

Run again: PASS — 6 tests.

- [ ] **Step 4: Write `site/src/layouts/PostLayout.astro`**

```astro
---
import BaseLayout from '@/layouts/BaseLayout.astro';
import TagList from '@/components/TagList.astro';
import Giscus from '@/components/Giscus.astro';
import { formatDate, isoDate, readingTimeLabel } from '@/lib/format';
import { postStatus } from '@/lib/status';
import type { BlogEntry } from '@/lib/entries';

type Props = { post: BlogEntry; minutes: number };
const { post, minutes } = Astro.props;
const { data } = post;
const status = postStatus(data);
---
<BaseLayout
  title={data.title}
  description={data.description}
  path={`/blog/${post.slug}/`}
  type="article"
  publishedTime={data.pubDate}
  modifiedTime={status.showUpdated ? data.updatedDate : undefined}
  canonicalOverride={data.canonicalUrl}
>
  <article>
    <h1>{data.title}</h1>
    <p class="post-meta">
      <time datetime={isoDate(data.pubDate)}>{formatDate(data.pubDate)}</time>
      <span aria-hidden="true">·</span>
      <span>{readingTimeLabel(minutes)}</span>
      <span aria-hidden="true">·</span>
      <TagList tags={data.tags} />
      {status.showUpdated && data.updatedDate && (
        <span class="updated">Updated <time datetime={isoDate(data.updatedDate)}>{formatDate(data.updatedDate)}</time></span>
      )}
    </p>

    {status.retracted && data.retracted && (
      <aside class="retraction" role="note" aria-label="Retraction notice">
        <p><strong>Retracted on <time datetime={isoDate(data.retracted.date)}>{formatDate(data.retracted.date)}</time>.</strong></p>
        <p>{data.retracted.reason}</p>
        <p>The text below is preserved unchanged for the record.</p>
      </aside>
    )}

    <div class="prose"><slot /></div>

    {status.hasCorrections && data.corrections && (
      <section class="corrections" aria-labelledby="corrections-heading">
        <h2 id="corrections-heading">Corrections</h2>
        <ol>
          {data.corrections.map((c) => (
            <li>
              <time datetime={isoDate(c.date)}>{formatDate(c.date)}</time> — {c.note}
            </li>
          ))}
        </ol>
      </section>
    )}
  </article>

  <Giscus />
</BaseLayout>
```

The retraction notice renders **before** the body and the corrections log **after**
it, per spec FR-10 and FR-11. Both are `<aside>`/`<section>` with accessible names.

- [ ] **Step 5: Write `site/src/pages/blog/[...slug].astro`**

```astro
---
import PostLayout from '@/layouts/PostLayout.astro';
import { getPublishedPosts } from '@/lib/entries';
import type { GetStaticPaths } from 'astro';

export const getStaticPaths: GetStaticPaths = async () => {
  const posts = await getPublishedPosts();
  return posts.map((post) => ({ params: { slug: post.slug }, props: { post } }));
};

const { post } = Astro.props;
const { Content, remarkPluginFrontmatter } = await post.render();
const minutes = remarkPluginFrontmatter.readingTime?.minutes ?? 1;
---
<PostLayout post={post} minutes={minutes}>
  <Content />
</PostLayout>
```

`getPublishedPosts` — not `getListablePosts` — so a retracted post keeps its URL
(INV-5) while vanishing from every listing.

- [ ] **Step 6: Write the build-output test**

This suite builds the site once into a fixture directory and asserts on real HTML.
It is the only test that shells out; everything else is pure.

```ts
// site/tests/post-render.test.ts
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

const ENV = {
  ...process.env,
  SITE_URL: 'https://example.com',
  PUBLIC_GISCUS_REPO: 'izziwoot/x',
  PUBLIC_GISCUS_REPO_ID: 'R_x',
  PUBLIC_GISCUS_CATEGORY_ID: 'DIC_x',
};

const read = (p: string) => readFileSync(new URL(`../dist/${p}`, import.meta.url), 'utf8');

beforeAll(() => {
  execFileSync('pnpm', ['build'], { env: ENV, cwd: new URL('..', import.meta.url), stdio: 'inherit' });
}, 180_000);

describe('post route output', () => {
  it('emits the post at its canonical trailing-slash path', () => {
    expect(existsSync(new URL('../dist/blog/choose-boring-tools/index.html', import.meta.url))).toBe(true);
  });

  it('declares exactly one h1', () => {
    const html = read('blog/choose-boring-tools/index.html');
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
  });

  it('emits an absolute canonical link matching the route', () => {
    expect(read('blog/choose-boring-tools/index.html')).toContain(
      '<link rel="canonical" href="https://example.com/blog/choose-boring-tools/"',
    );
  });

  it('gives body headings stable ids for deep linking', () => {
    expect(read('blog/choose-boring-tools/index.html')).toMatch(/<h2[^>]+id="the-bill-arrives-later"/);
  });

  it('highlights code at build time with no client-side highlighter', () => {
    const html = read('blog/choose-boring-tools/index.html');
    expect(html).toContain('class="astro-code');
    expect(html).not.toMatch(/prism|highlight\.js/i);
  });

  it('ships no first-party script bundle on a text post', () => {
    const html = read('blog/choose-boring-tools/index.html');
    const srcs = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
    const firstParty = srcs.filter((s) => s.startsWith('/'));
    expect(firstParty).toEqual([]);
  });

  it('emits BlogPosting JSON-LD', () => {
    expect(read('blog/choose-boring-tools/index.html')).toContain('"@type":"BlogPosting"');
  });
});
```

- [ ] **Step 7: Run it and verify it passes**

Run: `cd site && pnpm vitest run tests/post-render.test.ts`
Expected: PASS — 7 tests. The `no first-party script` assertion is the mechanical
enforcement of INV-4.

- [ ] **Step 8: Commit**

```bash
git add site/
git commit -m "feat(site): add post route with corrections, retraction, and anchored headings"
```

---

### Task 9: Tag index and per-tag routes

**Files:**
- Create: `site/src/pages/blog/tags/index.astro`
- Create: `site/src/pages/blog/tags/[tag].astro`
- Test: extend `site/tests/post-render.test.ts` with a tag-route block

**Interfaces:**
- Consumes: `getListablePosts` from `@/lib/entries`; `groupByTag`, `tagsWithCounts` from `@/lib/posts`; `PostCard`.
- Produces: routes only — no new exported functions.

- [ ] **Step 1: Write the tag index page**

```astro
---
// site/src/pages/blog/tags/index.astro
import BaseLayout from '@/layouts/BaseLayout.astro';
import { getListablePosts } from '@/lib/entries';
import { tagsWithCounts } from '@/lib/posts';

const tags = tagsWithCounts(await getListablePosts());
---
<BaseLayout
  title="Topics"
  description="Every topic covered on this blog, with the number of published posts under each one, from architecture and AI to day-to-day tooling."
  path="/blog/tags/"
>
  <h1>Topics</h1>
  {tags.length === 0 ? (
    <p>No topics yet — no posts have been published.</p>
  ) : (
    <ul class="tag-index">
      {tags.map(({ tag, count }) => (
        <li>
          <a href={`/blog/tags/${tag}/`}>{tag}</a>
          <span class="post-meta"> — {count} {count === 1 ? 'post' : 'posts'}</span>
        </li>
      ))}
    </ul>
  )}
</BaseLayout>
```

- [ ] **Step 2: Write the per-tag page**

```astro
---
// site/src/pages/blog/tags/[tag].astro
import BaseLayout from '@/layouts/BaseLayout.astro';
import PostCard from '@/components/PostCard.astro';
import { getListablePosts } from '@/lib/entries';
import { groupByTag } from '@/lib/posts';
import type { GetStaticPaths } from 'astro';

export const getStaticPaths: GetStaticPaths = async () => {
  const grouped = groupByTag(await getListablePosts());
  // Only tags with at least one published post generate a page (spec FR-16).
  return [...grouped.entries()].map(([tag, posts]) => ({ params: { tag }, props: { tag, posts } }));
};

const { tag, posts } = Astro.props;
const withReadingTime = await Promise.all(
  posts.map(async (post) => {
    const { remarkPluginFrontmatter } = await post.render();
    return { post, minutes: remarkPluginFrontmatter.readingTime?.minutes ?? 1 };
  }),
);
---
<BaseLayout
  title={`Posts tagged ${tag}`}
  description={`Every published post on this blog tagged ${tag}, listed newest first, covering the practical side of the topic rather than the theory.`}
  path={`/blog/tags/${tag}/`}
>
  <h1>Posts tagged “{tag}”</h1>
  <p class="post-meta"><a href="/blog/tags/">All topics</a></p>
  {withReadingTime.map(({ post, minutes }) => (
    <PostCard
      slug={post.slug}
      title={post.data.title}
      pubDate={post.data.pubDate}
      minutes={minutes}
      tags={post.data.tags}
    />
  ))}
</BaseLayout>
```

- [ ] **Step 3: Extend the build-output test**

Append to `site/tests/post-render.test.ts`:

```ts
import { TAGS } from '@/content/schema';
import { readdirSync } from 'node:fs';

describe('tag routes', () => {
  it('emits the tag index', () => {
    expect(existsSync(new URL('../dist/blog/tags/index.html', import.meta.url))).toBe(true);
  });

  it('emits a page for every tag that has a published post', () => {
    expect(existsSync(new URL('../dist/blog/tags/architecture/index.html', import.meta.url))).toBe(true);
    expect(existsSync(new URL('../dist/blog/tags/tooling/index.html', import.meta.url))).toBe(true);
  });

  it('emits no page for a tag with zero published posts', () => {
    const emitted = readdirSync(new URL('../dist/blog/tags/', import.meta.url), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    const unused = TAGS.filter((t) => !['architecture', 'tooling'].includes(t));
    for (const tag of unused) expect(emitted).not.toContain(tag);
  });

  it('links each tag from the index to its own page', () => {
    expect(read('blog/tags/index.html')).toContain('href="/blog/tags/architecture/"');
  });
});
```

- [ ] **Step 4: Run it and verify it passes**

Run: `cd site && pnpm vitest run tests/post-render.test.ts`
Expected: PASS — 11 tests total in the file.

- [ ] **Step 5: Commit**

```bash
git add site/
git commit -m "feat(site): add tag index and per-tag routes, skipping empty tags"
```

---

### Task 10: RSS feed

**Files:**
- Create: `site/src/lib/feed.ts`
- Create: `site/src/pages/feed.xml.ts`
- Test: `site/tests/feed.test.ts`

**Interfaces:**
- Consumes: `getListablePosts` from `@/lib/entries`; `absoluteUrl` from `@/lib/seo`; `site` from `@/config/site`.
- Produces: `toFeedItems(posts, origin): FeedItem[]` where `FeedItem = { title: string; link: string; guid: string; pubDate: Date; description: string }`; `feedLastBuildDate(posts, fallback: Date): Date`.

**Why the tests below matter:** Review Focus items 1 and 3. An unescaped `&` in one
title makes the entire feed invalid XML, which breaks every subscriber
simultaneously and silently. An empty post list makes a naive `Math.max` over an
empty array return `-Infinity`, producing an `Invalid Date` in the channel header.

- [ ] **Step 1: Write the failing test**

```ts
// site/tests/feed.test.ts
import { describe, expect, it } from 'vitest';
import { feedLastBuildDate, toFeedItems } from '@/lib/feed';

const ORIGIN = 'https://example.com';
const post = (over: Partial<{ slug: string; title: string; description: string; pubDate: Date; updatedDate: Date }>) => ({
  id: `${over.slug ?? 'a'}.md`,
  slug: over.slug ?? 'a',
  data: {
    title: over.title ?? 'A perfectly ordinary title',
    description: over.description ?? 'x'.repeat(80),
    pubDate: over.pubDate ?? new Date('2026-01-01'),
    updatedDate: over.updatedDate,
    draft: false,
    tags: ['ai'] as const,
  },
});

describe('toFeedItems', () => {
  it('returns an empty array for no posts', () => {
    expect(toFeedItems([], ORIGIN)).toEqual([]);
  });

  it('uses an absolute link and an identical absolute guid', () => {
    const [item] = toFeedItems([post({ slug: 'a-post' })], ORIGIN);
    expect(item.link).toBe('https://example.com/blog/a-post/');
    expect(item.guid).toBe('https://example.com/blog/a-post/');
  });

  it('ships the description only, never the rendered body', () => {
    const [item] = toFeedItems([post({ description: 'y'.repeat(90) })], ORIGIN);
    expect(item.description).toBe('y'.repeat(90));
    expect(item).not.toHaveProperty('content');
  });

  it('keeps the guid stable when a post is corrected, so readers do not re-surface it', () => {
    const before = toFeedItems([post({ slug: 'a-post' })], ORIGIN)[0];
    const after = toFeedItems([post({ slug: 'a-post', updatedDate: new Date('2026-06-01') })], ORIGIN)[0];
    expect(after.guid).toBe(before.guid);
    expect(after.pubDate).toEqual(before.pubDate);
  });

  it('preserves XML-unsafe characters verbatim for the serializer to escape', () => {
    const [item] = toFeedItems([post({ title: 'Tabs & spaces: a <holy> war' })], ORIGIN);
    expect(item.title).toBe('Tabs & spaces: a <holy> war');
  });
});

describe('feedLastBuildDate', () => {
  const fallback = new Date('2026-09-28T00:00:00Z');

  it('falls back to the supplied date for an empty feed instead of producing an Invalid Date', () => {
    const result = feedLastBuildDate([], fallback);
    expect(result).toEqual(fallback);
    expect(Number.isNaN(result.getTime())).toBe(false);
  });

  it('uses the most recent updatedDate when one is newer than every pubDate', () => {
    const posts = [
      post({ slug: 'a', pubDate: new Date('2026-01-01'), updatedDate: new Date('2026-07-01') }),
      post({ slug: 'b', pubDate: new Date('2026-03-01') }),
    ];
    expect(feedLastBuildDate(posts, fallback)).toEqual(new Date('2026-07-01'));
  });

  it('uses the newest pubDate when no post has been updated', () => {
    const posts = [post({ slug: 'a', pubDate: new Date('2026-01-01') }), post({ slug: 'b', pubDate: new Date('2026-03-01') })];
    expect(feedLastBuildDate(posts, fallback)).toEqual(new Date('2026-03-01'));
  });

  it('does not use build wall-clock time, so an unchanged rebuild does not churn the feed', () => {
    const posts = [post({ slug: 'a', pubDate: new Date('2026-01-01') })];
    expect(feedLastBuildDate(posts, fallback)).toEqual(new Date('2026-01-01'));
  });
});
```

- [ ] **Step 2: Run it, verify it fails, then write `site/src/lib/feed.ts`**

Run: `cd site && pnpm vitest run tests/feed.test.ts` → FAIL (unresolved import).

```ts
import { absoluteUrl } from '@/lib/seo';

type FeedSource = {
  slug: string;
  data: { title: string; description: string; pubDate: Date; updatedDate?: Date };
};

export type FeedItem = {
  title: string;
  link: string;
  guid: string;
  pubDate: Date;
  description: string;
};

export function toFeedItems(posts: FeedSource[], origin: string): FeedItem[] {
  return posts.map((post) => {
    const url = absoluteUrl(`/blog/${post.slug}/`, origin);
    return {
      title: post.data.title,
      link: url,
      // Stable across corrections: a changed guid makes every reader see the
      // post as new again.
      guid: url,
      pubDate: post.data.pubDate,
      description: post.data.description,
    };
  });
}

/**
 * The newest content change, never build wall-clock time. An empty feed returns
 * the fallback rather than a max over an empty array.
 */
export function feedLastBuildDate(posts: FeedSource[], fallback: Date): Date {
  let latest: Date | null = null;
  for (const post of posts) {
    const candidate = post.data.updatedDate ?? post.data.pubDate;
    if (latest === null || candidate > latest) latest = candidate;
  }
  return latest ?? fallback;
}
```

Run again: PASS — 9 tests.

- [ ] **Step 3: Write the endpoint**

```bash
cd site && pnpm add @astrojs/rss
```

```ts
// site/src/pages/feed.xml.ts
import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { site } from '@/config/site';
import { getListablePosts } from '@/lib/entries';
import { feedLastBuildDate, toFeedItems } from '@/lib/feed';

export const GET: APIRoute = async () => {
  const posts = await getListablePosts();
  const items = toFeedItems(posts, site.url);

  return rss({
    title: site.name,
    description: site.tagline,
    site: site.url,
    // @astrojs/rss escapes every value; toFeedItems deliberately does not.
    items: items.map((item) => ({
      title: item.title,
      link: item.link,
      pubDate: item.pubDate,
      description: item.description,
      customData: `<guid isPermaLink="true">${item.guid}</guid>`,
    })),
    customData: [
      `<language>en</language>`,
      `<lastBuildDate>${feedLastBuildDate(posts, new Date(0)).toUTCString()}</lastBuildDate>`,
    ].join(''),
  });
};
```

- [ ] **Step 4: Add the feed assertions to the build-output suite**

Append to `site/tests/post-render.test.ts`:

```ts
describe('feed output', () => {
  it('emits feed.xml', () => {
    expect(existsSync(new URL('../dist/feed.xml', import.meta.url))).toBe(true);
  });

  it('parses as well-formed XML', async () => {
    const { XMLValidator } = await import('fast-xml-parser');
    const result = XMLValidator.validate(read('feed.xml'));
    expect(result).toBe(true);
  });

  it('uses absolute links and guids', () => {
    const xml = read('feed.xml');
    expect(xml).toContain('<link>https://example.com/blog/choose-boring-tools/</link>');
    expect(xml).toContain('<guid isPermaLink="true">https://example.com/blog/choose-boring-tools/</guid>');
  });

  it('declares a self link and a language', () => {
    expect(read('feed.xml')).toContain('<language>en</language>');
  });

  it('ships no rendered post body', () => {
    expect(read('feed.xml')).not.toContain('<content:encoded');
  });
});
```

```bash
cd site && pnpm add -D fast-xml-parser
```

- [ ] **Step 5: Prove the escaping path end-to-end**

```bash
cd site
sed -i.bak 's/^title: Choosing boring tools on purpose$/title: Tabs \& spaces \& other <holy> wars/' \
  src/content/blog/choose-boring-tools.md
SITE_URL=https://example.com PUBLIC_GISCUS_REPO=izziwoot/x PUBLIC_GISCUS_REPO_ID=R_x \
  PUBLIC_GISCUS_CATEGORY_ID=DIC_x pnpm build
node -e "const{XMLValidator}=require('fast-xml-parser');const fs=require('fs');const r=XMLValidator.validate(fs.readFileSync('dist/feed.xml','utf8'));if(r!==true){console.error(r);process.exit(1)}console.log('feed still valid with & and < in the title')"
mv src/content/blog/choose-boring-tools.md.bak src/content/blog/choose-boring-tools.md
```

Expected: the node check prints the success line. If it fails, the escaping is
wrong and must be fixed before proceeding — an invalid feed breaks every
subscriber at once.

- [ ] **Step 6: Run the whole suite and commit**

Run: `cd site && pnpm vitest run`
Expected: PASS — all suites.

```bash
git add site/
git commit -m "feat(site): add RSS feed with stable guids and content-derived lastBuildDate"
```
