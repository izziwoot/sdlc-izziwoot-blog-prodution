# Izzi Woot Blog — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static, zero-backend blog under `site/` in this repository, published to Cloudflare Pages, with CI gates that make malformed posts and governance-document leaks impossible to ship.

**Architecture:** Astro in `output: 'static'` mode. All content is Markdown in git, validated by a Zod schema at build time. Every piece of logic worth testing is extracted into a **pure function module** (`site/src/lib/*.ts`, `site/src/content/schema.ts`) that imports nothing from `astro:content`, so Vitest can test it directly; the `.astro` route files are thin presentational shells over those functions. Security is a static-file posture: no runtime, no input, no cookies — enforced by post-build assertion scripts rather than by convention.

**Tech Stack:** Astro 5, TypeScript (strict), Zod, Vitest, pnpm, Shiki, `@astrojs/rss`, `@astrojs/sitemap`, lychee, Lighthouse CI, gitleaks, Cloudflare Pages.

**Spec:** [`spec/core-spec.md`](../spec/core-spec.md) — argue from the spec, not from this plan's prose. **Intent:** [`intent/core-intent.md`](../intent/core-intent.md).

---

## Global Constraints

Every task's requirements implicitly include all of these. Values are copied verbatim from the spec.

- **Node.js `>=20.11 <23`**, pinned in `.nvmrc` and `package.json` `engines`; must match the Cloudflare Pages build image. **Pin `.nvmrc` to 22.x, not 20.x** — `@astrojs/check` transitively `require()`s an ESM-only module, which Node only supports from 22.12. Verified: 20.11.1 fails with `ERR_REQUIRE_ESM`; 22.23.3 passes. The range is unchanged.
- **pnpm 9**, version pinned via the `packageManager` field to the version actually installed — pnpm 9 auto-switches to whatever that field names, so a stale value silently pulls an unverified release. CI installs with `--frozen-lockfile`. A build that would mutate the lockfile fails.
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

### Dependency versions are security-constrained, not stylistic

Verified by running `pnpm audit --audit-level=high` during Task 1 on 2026-09-28:
**Astro `^5` and Vitest `^2` cannot satisfy the spec's own blocking audit gate**
(spec §5.3). Two criticals are patched only on later majors — `astro` in **7.2.8**
and `vitest` in **3.2.6** — so there is no fix available on the 5.x or 2.x lines.
`sharp` (pulled by Astro) and `vite` (pulled by Vitest) clear as a side effect.

Measured: 20 vulnerabilities (2 critical, 5 high) on the original pins → 2
moderate, audit exit 0, on `astro@7.3.5` + `vitest@3.2.7`. Do **not** pin an
explicit top-level `vite`: Vitest 3.2.7 declares `vite` peer
`^5.0.0 || ^6.0.0 || ^7.0.0-0`, so it cannot use Astro 7's vite 8. Two vite
copies in the tree is correct and expected here, and the copy Vitest uses is
already past the `>=6.4.3` fix.

### ⚠️ Astro 7 content-layer API — RESOLVED, and it changes Tasks 3, 7, 8, 9, 10, 12

Settled during Task 2 by reading the generated `.astro/content.d.ts` and the
installed `astro@7.3.5`, not by guessing. Task 2 is already corrected; the
listed tasks still contain code that **cannot run**:

| Finding | Consequence |
| --- | --- |
| **`slug` does not exist.** `grep slug .astro/content.d.ts` returns nothing; entries are keyed by `id`, and `ReferenceDataEntry` is `{ collection, id }` | Every `post.slug` in Tasks 3, 7, 8, 9, 10, 12 becomes `post.id`. Affects route params, `PostCard`, feed link/guid construction, and the sitemap exclusion list |
| **`render` is a standalone export**, not a method: `export function render<C extends keyof DataEntryMap>(...)` | `await post.render()` in Tasks 7, 8, 9 becomes `await render(post)` with `import { render } from 'astro:content'`. `RenderResult` still carries `Content`, `headings`, and `remarkPluginFrontmatter`, so reading time is unaffected |
| **The config file is `src/content.config.ts`** — Astro 6 removed legacy content collections and throws `LegacyContentConfigError` for `src/content/config.ts` | The file-structure table above and Task 2 are corrected. Note the relative import becomes `./content/schema` |
| **Collections need `loader: glob(...)`** from `astro/loaders`, not `type: 'content'` | The glob loader derives `id` from the filename, which is what keeps GC-13 true |
| **zod must be `^4`.** Astro 7 depends on `zod ^4.5.4` | Mixing majors breaks typechecking *and* runtime: zod 3 schemas make Astro's JSON-schema generation throw `Cannot read properties of undefined (reading 'def')`. zod 4 idioms: `required_error` → `error`, `z.string().url()` → `z.url()` |

**Do not carry `post.slug` or `post.render()` into any new task.** Both are
Astro 4 idioms that typecheck against nothing in this project.

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
| `src/content.config.ts` | Thin Astro binding: `defineCollection` with `loader: glob(...)` over `schema.ts`. **Must sit at `src/content.config.ts`** — Astro 6+ rejects `src/content/config.ts` |
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
echo "22.23.3" > .nvmrc   # 22.x, NOT 20.x: see note below
mkdir -p site/src/{config,content,lib,components,layouts,pages,styles,assets} site/public site/scripts/lib site/tests
cd site
pnpm init
pnpm add astro@^7 zod@^4
pnpm add -D typescript vitest@^3 @types/node @astrojs/check
pnpm pkg set packageManager="pnpm@$(pnpm --version)"
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
- Create: `site/src/content.config.ts` (NOT `src/content/config.ts`)
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

---

### Task 11: About, privacy, and 404 pages

**Files:**
- Create: `site/src/pages/about.astro`
- Create: `site/src/pages/privacy.astro`
- Create: `site/src/pages/404.astro`
- Create: `site/src/components/Icon.astro`
- Test: extend `site/tests/post-render.test.ts` with a static-pages block

**Interfaces:**
- Consumes: `BaseLayout`; `getEntry` from `astro:content` for the author record.
- Produces: `Icon.astro` props: `{ name: 'github' | 'linkedin' | 'x' | 'rss' | 'email'; label?: string }`.

**Why `/privacy/` is in this task, not deferred:** spec §10.4. The intent's
"nothing personal is collected" is imprecise — Cloudflare and GitHub both process
reader IP addresses. The page is the honest form of that claim and it ships in v1.

- [ ] **Step 1: Write `site/src/components/Icon.astro`**

```astro
---
type Props = { name: 'github' | 'linkedin' | 'x' | 'rss' | 'email'; label?: string };
const { name, label } = Astro.props;

// Inline SVG only. An icon font is a third-party request, a FOIT risk, and a
// screen-reader hazard; font-src 'self' in Task 15 would block it anyway.
const paths: Record<Props['name'], string> = {
  github:
    'M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.95 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.85-2.34 4.7-4.57 4.95.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z',
  linkedin: 'M4 4h4v16H4zM6 2.5A2 2 0 1 1 6 6.5a2 2 0 0 1 0-4zM10 9h4v2a4 4 0 0 1 7 3v6h-4v-5a2 2 0 0 0-4 0v5h-3z',
  x: 'M3 3h5l4.5 6L17 3h4l-7 9 7 9h-5l-4.5-6L7 21H3l7-9z',
  rss: 'M4 11a9 9 0 0 1 9 9h-3a6 6 0 0 0-6-6zm0-7a16 16 0 0 1 16 16h-3A13 13 0 0 0 4 7zm1.5 12a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z',
  email: 'M3 5h18v14H3zm2 2v.5l7 4.5 7-4.5V7z',
};
---
<svg
  viewBox="0 0 24 24"
  width="20"
  height="20"
  fill="currentColor"
  aria-hidden={label ? undefined : 'true'}
  role={label ? 'img' : undefined}
  focusable="false"
>
  {label && <title>{label}</title>}
  <path d={paths[name]} />
</svg>
```

- [ ] **Step 2: Write `site/src/pages/about.astro`**

```astro
---
import BaseLayout from '@/layouts/BaseLayout.astro';
import Icon from '@/components/Icon.astro';
import { getEntry } from 'astro:content';
import { site } from '@/config/site';

const author = await getEntry('authors', 'adilson-cesar');
if (!author) throw new Error('Missing author record: src/content/authors/adilson-cesar.json');
---
<BaseLayout
  title="About"
  description="Who writes this blog, how it is produced, how factual claims and code samples are verified before publication, and how corrections are handled."
  path="/about/"
>
  <h1>About</h1>

  <p>
    {site.name} is written by {author.data.name}{author.data.title && `, ${author.data.title}`}.
    Posts here are about software architecture, AI systems, and the day-to-day
    practice of building and operating things that have to keep working.
  </p>

  <h2>How these posts are made</h2>
  <p>
    Posts on this site may be written with AI assistance. What that does not change:
    every code sample is executed before it is published, and every factual claim is
    traced to a primary source. If something here is wrong, the error is mine.
  </p>

  <h2>Corrections</h2>
  <p>
    Published posts are not silently rewritten. Typos and formatting get fixed without
    ceremony, but any change to meaning, facts, code, or a recommendation is recorded
    in a dated correction note at the foot of the post. Retracted posts keep their
    URL and carry a notice explaining why — nothing here disappears quietly.
  </p>

  <h2>Elsewhere</h2>
  <ul class="links">
    {author.data.links.map((link) => (
      <li>
        <a href={link.href} rel={link.icon === 'rss' ? undefined : 'me noopener noreferrer'}>
          <Icon name={link.icon} /> {link.label}
        </a>
      </li>
    ))}
  </ul>

  <p><a href="/privacy/">What this site collects about you</a> (almost nothing).</p>
</BaseLayout>
```

**No cadence sentence** — spec FR-21. Add "at least one post a month" only if Open
Question 5 is answered with a specific commitment. Do not invent one.

- [ ] **Step 3: Write `site/src/pages/privacy.astro`**

```astro
---
import BaseLayout from '@/layouts/BaseLayout.astro';
---
<BaseLayout
  title="Privacy"
  description="What this site stores about you, which third parties process your requests, and why there is no cookie banner: this site sets no cookies at all."
  path="/privacy/"
>
  <h1>Privacy</h1>

  <p><strong>This site sets no cookies and stores no personal data about you.</strong></p>

  <h2>What happens when you load a page</h2>
  <p>
    The site is a set of static files. There is no login, no form, no database, and
    no server-side code. Nothing you do here is recorded by me.
  </p>
  <p>
    Two third parties see your request, and both process your IP address in order to
    do their job:
  </p>
  <ul>
    <li>
      <strong>Cloudflare</strong> serves the pages and provides aggregate, cookieless
      traffic analytics. I see page counts and referrers; I cannot identify you.
    </li>
    <li>
      <strong>GitHub</strong> hosts the comment threads, which load on post pages via
      Giscus. Loading a thread discloses your IP address to GitHub. Posting a comment
      requires a GitHub account, and the comment lives in GitHub Discussions under
      GitHub's terms, not mine.
    </li>
  </ul>

  <h2>Why there is no cookie banner</h2>
  <p>
    Because there are no cookies to consent to. The analytics are cookieless and no
    identifier is stored in your browser.
  </p>

  <h2>Following without being seen</h2>
  <p>
    The <a href="/feed.xml">RSS feed</a> needs no email address and no account. There
    is no mailing list.
  </p>
</BaseLayout>
```

- [ ] **Step 4: Write `site/src/pages/404.astro`**

```astro
---
import BaseLayout from '@/layouts/BaseLayout.astro';
---
<BaseLayout
  title="Page not found"
  description="That page does not exist on this site. Published post URLs here are permanent, so a broken link is more likely a typo than a deletion."
  path="/404.html"
>
  <h1>Page not found</h1>
  <p>
    Published post URLs on this site are permanent — nothing is deleted or moved — so
    a link that fails here is more likely mistyped than gone.
  </p>
  <p><a href="/">Back to the index</a> · <a href="/blog/tags/">Browse topics</a></p>
</BaseLayout>
```

- [ ] **Step 5: Extend the build-output suite**

```ts
describe('static pages', () => {
  it.each([
    ['about/index.html', 'About'],
    ['privacy/index.html', 'Privacy'],
    ['404.html', 'Page not found'],
  ])('emits %s', (path, heading) => {
    expect(read(path)).toContain(heading);
  });

  it('states the AI-assistance commitment on the about page', () => {
    const html = read('about/index.html');
    expect(html).toMatch(/executed before it is published/);
    expect(html).toMatch(/primary source/);
  });

  it('does not claim a publishing cadence that has not been decided', () => {
    expect(read('about/index.html')).not.toMatch(/every month|weekly|each week/i);
  });

  it('names both processors on the privacy page', () => {
    const html = read('privacy/index.html');
    expect(html).toContain('Cloudflare');
    expect(html).toContain('GitHub');
    expect(html).toMatch(/IP address/);
  });

  it('does not overclaim that nothing is processed', () => {
    expect(read('privacy/index.html')).not.toMatch(/nothing (is )?collected/i);
  });

  it('renders icons as inline SVG with no icon font request', () => {
    const html = read('about/index.html');
    expect(html).toContain('<svg');
    expect(html).not.toMatch(/fontawesome|fa-|font-awesome/i);
  });
});
```

- [ ] **Step 6: Run it and commit**

Run: `cd site && pnpm vitest run tests/post-render.test.ts`
Expected: PASS.

```bash
git add site/
git commit -m "feat(site): add about, privacy, and 404 pages with accurate processor disclosure"
```

---

### Task 12: Sitemap, robots, and canonical redirects

**Files:**
- Create: `site/public/robots.txt`
- Create: `site/public/_redirects`
- Modify: `site/astro.config.mjs` — add `@astrojs/sitemap`
- Test: extend `site/tests/post-render.test.ts` with a discovery block

**Interfaces:**
- Consumes: `getPublishedPosts` (indirectly, via the sitemap filter).
- Produces: no new exports.

- [ ] **Step 1: Add the sitemap integration with a retraction-aware filter**

```bash
cd site && pnpm add @astrojs/sitemap
```

```js
// site/astro.config.mjs — add the integration
import sitemap from '@astrojs/sitemap';

  integrations: [
    sitemap({
      filter: (page) => !page.includes('/404'),
      serialize: (item) => item,
    }),
  ],
```

Retracted posts must also be absent. `@astrojs/sitemap` cannot see front matter, so
generate the exclusion list at build time and filter on it:

```js
// site/astro.config.mjs — above defineConfig
import { readdirSync, readFileSync } from 'node:fs';

/** Slugs of retracted posts, read straight from front matter. */
function retractedSlugs() {
  const dir = new URL('./src/content/blog/', import.meta.url);
  let files = [];
  try {
    files = readdirSync(dir);
  } catch {
    return [];
  }
  return files
    .filter((f) => /\.mdx?$/.test(f))
    .filter((f) => /^retracted:/m.test(readFileSync(new URL(f, dir), 'utf8')))
    .map((f) => f.replace(/\.mdx?$/, ''));
}

const EXCLUDED = retractedSlugs();
```

```js
    sitemap({
      filter: (page) =>
        !page.includes('/404') && !EXCLUDED.some((slug) => page.includes(`/blog/${slug}/`)),
    }),
```

- [ ] **Step 2: Write `site/public/robots.txt`**

```
User-agent: *
Allow: /

Sitemap: https://REPLACE_WITH_DOMAIN/sitemap-index.xml
```

Replace the placeholder once Open Question 1 is answered. Task 21 verifies it.

- [ ] **Step 3: Write `site/public/_redirects`**

```
# Canonical shapes. 301 = permanent and cacheable.
/blog            /                 301
/blog/           /                 301
/tags/*          /blog/tags/:splat 301
/feed            /feed.xml         301
/rss.xml         /feed.xml         301
```

- [ ] **Step 4: Extend the build-output suite**

```ts
describe('discovery', () => {
  it('emits a sitemap index', () => {
    expect(existsSync(new URL('../dist/sitemap-index.xml', import.meta.url))).toBe(true);
  });

  it('lists the published post in the sitemap', () => {
    const xml = read('sitemap-0.xml');
    expect(xml).toContain('https://example.com/blog/choose-boring-tools/');
  });

  it('excludes the 404 page from the sitemap', () => {
    expect(read('sitemap-0.xml')).not.toContain('/404');
  });

  it('ships robots.txt and _redirects to the output root', () => {
    expect(existsSync(new URL('../dist/robots.txt', import.meta.url))).toBe(true);
    expect(existsSync(new URL('../dist/_redirects', import.meta.url))).toBe(true);
  });

  it('points robots.txt at the sitemap', () => {
    expect(read('robots.txt')).toMatch(/Sitemap: https?:\/\/\S+\/sitemap-index\.xml/);
  });
});
```

- [ ] **Step 5: Prove the retraction exclusion works**

```bash
cd site
cp src/content/blog/choose-boring-tools.md /tmp/post-backup.md
cat >> src/content/blog/choose-boring-tools.md.tmp <<'EOF'
EOF
# Insert a retraction into the front matter, rebuild, and confirm the URL still
# resolves while disappearing from the sitemap and the feed.
python3 - <<'PY'
import re, pathlib
p = pathlib.Path('src/content/blog/choose-boring-tools.md')
text = p.read_text()
text = text.replace('tags:', 'retracted:\n  date: 2026-09-29\n  reason: The central claim does not hold under load.\ntags:', 1)
p.write_text(text)
PY
SITE_URL=https://example.com PUBLIC_GISCUS_REPO=izziwoot/x PUBLIC_GISCUS_REPO_ID=R_x \
  PUBLIC_GISCUS_CATEGORY_ID=DIC_x pnpm build
test -f dist/blog/choose-boring-tools/index.html && echo "URL preserved (INV-5)"
grep -q "Retracted on" dist/blog/choose-boring-tools/index.html && echo "banner rendered"
grep -q "choose-boring-tools" dist/index.html && echo "FAIL: still in index" || echo "absent from index"
grep -q "choose-boring-tools" dist/feed.xml && echo "FAIL: still in feed" || echo "absent from feed"
grep -q "choose-boring-tools" dist/sitemap-0.xml && echo "FAIL: still in sitemap" || echo "absent from sitemap"
cp /tmp/post-backup.md src/content/blog/choose-boring-tools.md
rm -f src/content/blog/choose-boring-tools.md.tmp
```

Expected: `URL preserved`, `banner rendered`, and three `absent from …` lines. Any
`FAIL:` line means a listing is using `getPublishedPosts` where it should use
`getListablePosts`.

- [ ] **Step 6: Commit**

```bash
git add site/
git commit -m "feat(site): add sitemap, robots, and canonical redirects with retraction exclusion"
```

---

### Task 13: Image pipeline and inline SVG diagrams

**Files:**
- Create: `site/src/components/Figure.astro`
- Create: `site/src/assets/.gitkeep`
- Create: `site/docs/diagrams.md` (authoring convention)
- Modify: `site/astro.config.mjs` — enable MDX for posts that need components
- Test: extend `site/tests/post-render.test.ts` with an images block

**Interfaces:**
- Consumes: `Image` from `astro:assets`.
- Produces: `Figure.astro` props: `{ src: ImageMetadata; alt: string; caption?: string; loading?: 'lazy' | 'eager' }`.

**Spec divergence being implemented here:** §10.8. The intent said "Mermaid rendered
at build time"; build-time Mermaid normally drags a headless browser into CI. Hand-
authored inline SVG is the adopted approach — diffable, zero dependencies, themeable
with the same CSS custom properties, and accessible via `<title>`/`<desc>`.

- [ ] **Step 1: Write `site/src/components/Figure.astro`**

```astro
---
import { Image } from 'astro:assets';

type Props = {
  src: ImageMetadata;
  alt: string;
  caption?: string;
  loading?: 'lazy' | 'eager';
};
const { src, alt, caption, loading = 'lazy' } = Astro.props;

// An empty alt is legitimate for a decorative image, but it must be a deliberate
// choice made at the call site, not an omission.
if (alt === undefined) throw new Error('Figure: alt is required (pass alt="" for decorative images)');
---
<figure>
  <Image
    src={src}
    alt={alt}
    loading={loading}
    decoding="async"
    formats={['avif', 'webp']}
    widths={[400, 800, 1200]}
    sizes="(max-width: 40rem) 100vw, 34rem"
  />
  {caption && <figcaption>{caption}</figcaption>}
</figure>
```

- [ ] **Step 2: Enable MDX so posts can use `Figure` and inline SVG**

```bash
cd site && pnpm astro add mdx --yes
```

Markdown posts stay `.md`; only a post that needs a component becomes `.mdx`. The
filename check in Task 4 already allows both extensions and rejects a slug collision
between `a-post.md` and `a-post.mdx`.

- [ ] **Step 3: Write the diagram authoring convention**

```markdown
<!-- site/docs/diagrams.md -->
# Diagrams

Diagrams are hand-authored inline SVG committed alongside the post. No Mermaid, no
build-time browser, no client-side renderer.

## Rules

1. Use `currentColor` and the CSS custom properties (`var(--fg)`, `var(--accent)`,
   `var(--border)`) for every stroke and fill, so the diagram follows the light and
   dark schemes automatically. A hard-coded `#000` becomes invisible in dark mode.
2. Give every diagram a `role="img"`, a `<title>`, and a `<desc>`. The title is the
   name; the desc explains what the diagram shows for someone who cannot see it.
3. Set `viewBox`, omit `width`/`height`, and constrain with CSS — this scales
   without layout shift.
4. Keep it in the post file (`.mdx`) when it is used once; extract to
   `src/components/diagrams/` when it is reused.

## Skeleton

```html
<svg viewBox="0 0 400 200" role="img" aria-labelledby="retry-title retry-desc" class="diagram">
  <title id="retry-title">Retry loop with exponential backoff</title>
  <desc id="retry-desc">
    A request flows to a handler. On failure it waits, doubling the delay each time,
    and retries up to three times before surfacing the error to the caller.
  </desc>
  <rect x="10" y="70" width="110" height="50" fill="none" stroke="var(--border)" />
  <text x="65" y="100" text-anchor="middle" fill="var(--fg)" font-size="14">Request</text>
</svg>
```
```

- [ ] **Step 4: Extend the build-output suite**

```ts
describe('images and diagrams', () => {
  it('emits optimized image variants when a post uses a cover or figure', () => {
    // Skipped until the first post ships an image; the assertion below is the
    // permanent guard that raw <img> to /public never creeps back in.
    const html = read('blog/choose-boring-tools/index.html');
    const rawImgs = [...html.matchAll(/<img[^>]+src="\/(?!_astro)([^"]+)"/g)];
    expect(rawImgs).toEqual([]);
  });

  it('never emits an image without an alt attribute', () => {
    const html = read('blog/choose-boring-tools/index.html');
    const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
    for (const img of imgs) expect(img).toMatch(/\balt="/);
  });
});
```

- [ ] **Step 5: Run and commit**

Run: `cd site && pnpm vitest run tests/post-render.test.ts`
Expected: PASS.

```bash
git add site/
git commit -m "feat(site): add image pipeline and inline-SVG diagram convention"
```

---

### Task 14: Giscus comments

**Files:**
- Create: `site/src/components/Giscus.astro`
- Test: extend `site/tests/post-render.test.ts` with a comments block

**Interfaces:**
- Consumes: `site.giscus` from `@/config/site`.
- Produces: `Giscus.astro` — no props; reads config directly.

**Prerequisite (human, one-off):** enable Discussions on the repository, create a
category named `Comments` of type *Announcement*, install the Giscus app, and read
`repoId` and `categoryId` from <https://giscus.app>. These are public identifiers,
not secrets. Announcement type matters: only maintainers can start threads, so
readers reply to a post rather than opening arbitrary discussions.

- [ ] **Step 1: Write the component**

```astro
---
import { site } from '@/config/site';
---
<section class="comments" aria-labelledby="comments-heading">
  <h2 id="comments-heading">Comments</h2>
  <p class="post-meta">
    Comments are GitHub Discussions and need a GitHub account. No account? The
    <a href="/about/">about page</a> has other ways to reach me.
  </p>
  <script
    src="https://giscus.app/client.js"
    data-repo={site.giscus.repo}
    data-repo-id={site.giscus.repoId}
    data-category={site.giscus.category}
    data-category-id={site.giscus.categoryId}
    data-mapping="pathname"
    data-strict="1"
    data-reactions-enabled="0"
    data-emit-metadata="0"
    data-input-position="top"
    data-theme="preferred_color_scheme"
    data-lang="en"
    data-loading="lazy"
    crossorigin="anonymous"
    async
  />
</section>
```

Each attribute earns its place:
- `data-mapping="pathname"` + `data-strict="1"` — bind a thread to its exact URL so
  a near-miss path cannot attach to the wrong post's thread.
- `data-theme="preferred_color_scheme"` — matches §5.1's JS-free scheme handling
  without us syncing anything.
- `data-loading="lazy"` — keeps the iframe out of the LCP path (FR-35).
- `data-emit-metadata="0"` and `data-reactions-enabled="0"` — no data we do not use.

The prose above the widget is the accessibility and fairness note for readers
without a GitHub account: the spec accepts that tradeoff, so the site should at
least say so out loud.

- [ ] **Step 2: Reserve vertical space so the lazy iframe cannot shift layout**

Append to `site/src/styles/global.css`:

```css
.comments { margin-block-start: calc(var(--space) * 2); border-block-start: 1px solid var(--border); padding-block-start: var(--space); }
/* Reserve height for the lazily-loaded Giscus iframe (spec FR-35: CLS < 0.02). */
.comments .giscus, .comments .giscus-frame { min-height: 20rem; }
.comments iframe { width: 100%; border: 0; }
```

- [ ] **Step 3: Extend the build-output suite**

```ts
describe('comments', () => {
  it('embeds giscus on a post page', () => {
    const html = read('blog/choose-boring-tools/index.html');
    expect(html).toContain('https://giscus.app/client.js');
    expect(html).toContain('data-mapping="pathname"');
    expect(html).toContain('data-strict="1"');
    expect(html).toContain('data-loading="lazy"');
  });

  it('omits giscus everywhere else, so only post pages load a third party', () => {
    for (const page of ['index.html', 'about/index.html', 'privacy/index.html', 'blog/tags/index.html', '404.html']) {
      expect(read(page)).not.toContain('giscus.app');
    }
  });

  it('tells readers without a GitHub account how to reach the author instead', () => {
    expect(read('blog/choose-boring-tools/index.html')).toMatch(/need a GitHub account/i);
  });

  it('loads exactly two third-party origins on a post page and no more', () => {
    const html = read('blog/choose-boring-tools/index.html');
    const origins = new Set(
      [...html.matchAll(/(?:src|href)="https?:\/\/([^/"]+)/g)].map((m) => m[1]),
    );
    expect([...origins].sort()).toEqual(['giscus.app', 'static.cloudflareinsights.com']);
  });
});
```

The last assertion is the mechanical guard on the whole third-party posture: any
future font CDN, icon CDN, or embed breaks this test immediately.

- [ ] **Step 4: Run and commit**

Run: `cd site && pnpm vitest run tests/post-render.test.ts`
Expected: PASS. If the origin-count test fails, something added a CDN — remove it
rather than updating the expectation.

```bash
git add site/
git commit -m "feat(site): add lazy Giscus comments scoped to post pages"
```

---

### Task 15: Security headers and CSP verification

**Files:**
- Create: `site/public/_headers`
- Create: `site/scripts/lib/headers.mjs`
- Create: `site/scripts/assert-headers.mjs`
- Modify: `site/package.json` — add `verify:headers`
- Test: `site/tests/headers.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseHeadersFile(text): Map<string, Record<string,string>>`, `parseCsp(value): Record<string, string[]>`, `checkCsp(directives, { requiredOrigins }): string[]` (returns problem strings, empty means clean).

**Why this needs its own verification script:** a CSP that silently blocks the
comments widget is worse than no comments, and a CSP that quietly permits
`'unsafe-inline'` is worse than no CSP. Neither failure is visible in a build log.

- [ ] **Step 1: Write the failing test**

```ts
// site/tests/headers.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error -- plain JS helper shared with a bare-Node script
import { checkCsp, parseCsp, parseHeadersFile } from '../scripts/lib/headers.mjs';

const text = () => readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');

describe('parseHeadersFile', () => {
  it('groups headers under their path pattern', () => {
    const parsed = parseHeadersFile('/*\n  X-A: 1\n  X-B: 2\n/fonts/*\n  X-C: 3\n');
    expect(parsed.get('/*')).toEqual({ 'X-A': '1', 'X-B': '2' });
    expect(parsed.get('/fonts/*')).toEqual({ 'X-C': '3' });
  });

  it('ignores comments and blank lines', () => {
    const parsed = parseHeadersFile('# comment\n\n/*\n  X-A: 1\n');
    expect(parsed.get('/*')).toEqual({ 'X-A': '1' });
  });
});

describe('parseCsp', () => {
  it('splits directives into source lists', () => {
    const d = parseCsp("default-src 'self'; frame-src https://giscus.app");
    expect(d['default-src']).toEqual(["'self'"]);
    expect(d['frame-src']).toEqual(['https://giscus.app']);
  });

  it('keeps a valueless directive as an empty list', () => {
    expect(parseCsp('upgrade-insecure-requests').['upgrade-insecure-requests']).toEqual([]);
  });
});

describe('checkCsp', () => {
  const good = parseCsp(
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; " +
      "form-action 'none'; img-src 'self' data:; font-src 'self'; style-src 'self'; " +
      "script-src 'self' https://static.cloudflareinsights.com; " +
      "connect-src 'self' https://cloudflareinsights.com; frame-src https://giscus.app; " +
      'upgrade-insecure-requests',
  );

  it('accepts the intended policy', () => {
    expect(checkCsp(good, { requiredOrigins: ['https://giscus.app'] })).toEqual([]);
  });

  it("rejects 'unsafe-inline' in script-src", () => {
    const bad = { ...good, 'script-src': ["'self'", "'unsafe-inline'"] };
    expect(checkCsp(bad, { requiredOrigins: [] }).join()).toMatch(/unsafe-inline/);
  });

  it("rejects 'unsafe-eval' anywhere", () => {
    const bad = { ...good, 'script-src': ["'self'", "'unsafe-eval'"] };
    expect(checkCsp(bad, { requiredOrigins: [] }).join()).toMatch(/unsafe-eval/);
  });

  it('rejects a missing default-src', () => {
    const { 'default-src': _drop, ...bad } = good;
    expect(checkCsp(bad, { requiredOrigins: [] }).join()).toMatch(/default-src/);
  });

  it('rejects a policy that would block the comments iframe', () => {
    const bad = { ...good, 'frame-src': ["'none'"] };
    expect(checkCsp(bad, { requiredOrigins: ['https://giscus.app'] }).join()).toMatch(/giscus/);
  });

  it('rejects a wildcard source in any fetch directive', () => {
    const bad = { ...good, 'img-src': ['*'] };
    expect(checkCsp(bad, { requiredOrigins: [] }).join()).toMatch(/wildcard/i);
  });
});

describe('the committed _headers file', () => {
  const parsed = () => parseHeadersFile(text());

  it('applies a CSP to every path', () => {
    expect(parsed().get('/*')?.['Content-Security-Policy']).toBeDefined();
  });

  it('passes every CSP rule', () => {
    const csp = parsed().get('/*')!['Content-Security-Policy'];
    expect(checkCsp(parseCsp(csp), { requiredOrigins: ['https://giscus.app'] })).toEqual([]);
  });

  it('sets HSTS with a two-year max-age and preload', () => {
    const hsts = parsed().get('/*')?.['Strict-Transport-Security'] ?? '';
    expect(hsts).toMatch(/max-age=63072000/);
    expect(hsts).toMatch(/includeSubDomains/);
    expect(hsts).toMatch(/preload/);
  });

  it('sets nosniff, a referrer policy, and a permissions policy', () => {
    const h = parsed().get('/*') ?? {};
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(h['Permissions-Policy']).toMatch(/geolocation=\(\)/);
  });

  it('marks hashed assets and fonts immutable for a year', () => {
    for (const path of ['/fonts/*', '/_astro/*']) {
      expect(parsed().get(path)?.['Cache-Control']).toBe('public, max-age=31536000, immutable');
    }
  });

  it('caches the feed briefly rather than forever', () => {
    expect(parsed().get('/feed.xml')?.['Cache-Control']).toMatch(/max-age=3600/);
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `cd site && pnpm vitest run tests/headers.test.ts`
Expected: FAIL — cannot find `../scripts/lib/headers.mjs`.

- [ ] **Step 3: Write `site/scripts/lib/headers.mjs`**

```js
const FETCH_DIRECTIVES = [
  'default-src', 'script-src', 'style-src', 'img-src', 'font-src', 'connect-src', 'frame-src',
];

export function parseHeadersFile(text) {
  const groups = new Map();
  let current = null;
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      current = line.trim();
      if (!groups.has(current)) groups.set(current, {});
      continue;
    }
    if (current === null) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    groups.get(current)[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return groups;
}

export function parseCsp(value) {
  const directives = {};
  for (const part of value.split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    directives[tokens[0]] = tokens.slice(1);
  }
  return directives;
}

/** @returns {string[]} problems; empty means the policy is acceptable. */
export function checkCsp(directives, { requiredOrigins = [] } = {}) {
  const problems = [];

  if (!directives['default-src']) problems.push('missing default-src');

  for (const [name, sources] of Object.entries(directives)) {
    for (const source of sources) {
      if (source === "'unsafe-inline'") problems.push(`${name} permits 'unsafe-inline'`);
      if (source === "'unsafe-eval'") problems.push(`${name} permits 'unsafe-eval'`);
      if (source === '*' && FETCH_DIRECTIVES.includes(name)) {
        problems.push(`${name} permits a wildcard source`);
      }
      if (source.startsWith('http://')) problems.push(`${name} permits insecure origin ${source}`);
    }
  }

  for (const origin of requiredOrigins) {
    const frame = directives['frame-src'] ?? directives['default-src'] ?? [];
    if (!frame.includes(origin)) {
      problems.push(`frame-src does not permit ${origin} — the comments iframe would be blocked`);
    }
  }

  for (const name of ['base-uri', 'object-src', 'frame-ancestors', 'form-action']) {
    if (!directives[name]) problems.push(`missing ${name}`);
  }

  return problems;
}
```

- [ ] **Step 4: Write `site/public/_headers`**

```
/*
  Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'none'; img-src 'self' data:; font-src 'self'; style-src 'self'; script-src 'self' https://static.cloudflareinsights.com; connect-src 'self' https://cloudflareinsights.com; frame-src https://giscus.app; upgrade-insecure-requests
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), camera=(), microphone=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin
  X-Frame-Options: DENY

/fonts/*
  Cache-Control: public, max-age=31536000, immutable

/_astro/*
  Cache-Control: public, max-age=31536000, immutable

/feed.xml
  Cache-Control: public, max-age=3600
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `cd site && pnpm vitest run tests/headers.test.ts`
Expected: PASS — 16 tests.

- [ ] **Step 6: Write the post-build assertion script**

```js
// site/scripts/assert-headers.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { checkCsp, parseCsp, parseHeadersFile } from './lib/headers.mjs';

const DIST = new URL('../dist/', import.meta.url);
const problems = [];

// 1. _headers must have survived into the output.
let headersText;
try {
  headersText = readFileSync(new URL('_headers', DIST), 'utf8');
} catch {
  problems.push('dist/_headers is missing — Cloudflare will serve no security headers');
}

if (headersText) {
  const groups = parseHeadersFile(headersText);
  const csp = groups.get('/*')?.['Content-Security-Policy'];
  if (!csp) problems.push('no Content-Security-Policy applied to /*');
  else problems.push(...checkCsp(parseCsp(csp), { requiredOrigins: ['https://giscus.app'] }));
}

// 2. No inline <script> with executable content — the CSP would block it, and its
//    presence means someone tried to add behavior that needs 'unsafe-inline'.
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (path.endsWith('.html')) out.push(path);
  }
  return out;
}

const distPath = new URL('../dist', import.meta.url).pathname;
for (const file of walk(distPath)) {
  const html = readFileSync(file, 'utf8');
  for (const [, attrs, body] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/\bsrc=/.test(attrs)) continue;
    if (/type="application\/ld\+json"/.test(attrs)) continue; // data, not script
    if (body.trim() === '') continue;
    problems.push(`${file.replace(distPath, '')}: inline <script> would be blocked by the CSP`);
  }
  if (/<style[^>]*>[\s\S]*?<\/style>/.test(html)) {
    problems.push(`${file.replace(distPath, '')}: inline <style> would be blocked by style-src 'self'`);
  }
}

if (problems.length > 0) {
  console.error('Header/CSP verification failed:\n');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log('Header/CSP verification passed.');
```

- [ ] **Step 7: Wire it up and prove it catches a violation**

```bash
cd site
pnpm pkg set scripts.verify:headers="node scripts/assert-headers.mjs"
pnpm build && pnpm verify:headers        # expect: passed

# Prove the inline-style guard fires.
sed -i.bak "s/inlineStylesheets: 'never'/inlineStylesheets: 'always'/" astro.config.mjs
pnpm build && pnpm verify:headers        # expect: exit 1, names inline <style>
mv astro.config.mjs.bak astro.config.mjs
pnpm build && pnpm verify:headers        # expect: passed again
```

Expected: the middle run exits non-zero. This is the proof that
`inlineStylesheets: 'never'` is load-bearing and not decoration.

- [ ] **Step 8: Commit**

```bash
git add site/
git commit -m "feat(security): add CSP and security headers with post-build verification"
```

---

### Task 16: Governance-leak assertions (INV-3)

**Files:**
- Create: `site/scripts/lib/leaks.mjs`
- Create: `site/scripts/assert-no-governance-leak.mjs`
- Create: `templates/policy.md` (carries the sentinel, seeds the convention)
- Modify: `site/package.json` — add `verify:output`
- Test: `site/tests/leaks.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `findLeaks({ files, sentinel, forbiddenPaths, forbiddenExtensions }): Problem[]`; `SENTINEL = 'IZZIWOOT-GOVERNANCE-DO-NOT-PUBLISH'`.

**Why the sentinel is the important half:** a path-based rule passes the moment
someone moves the Astro root, edits a content glob, or adds a `publicDir` alias. A
content sentinel catches the leak regardless of how it happened. Spec §7.4
assertion 2.

- [ ] **Step 1: Write the failing test**

```ts
// site/tests/leaks.test.ts
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain JS helper shared with a bare-Node script
import { findLeaks, SENTINEL } from '../scripts/lib/leaks.mjs';

const clean = [
  { path: '/index.html', content: '<h1>Izzi Woot</h1>' },
  { path: '/blog/a-post/index.html', content: '<h1>A post</h1>' },
];

const opts = {
  sentinel: SENTINEL,
  forbiddenPaths: ['policies', 'frameworks', 'audits', 'templates', 'intent', 'spec'],
  forbiddenExtensions: ['.env', '.pem', '.key', '.sqlite'],
};

describe('findLeaks', () => {
  it('passes a clean output tree', () => {
    expect(findLeaks({ files: clean, ...opts })).toEqual([]);
  });

  it('catches a governance document published by path', () => {
    const files = [...clean, { path: '/policies/access-control/index.html', content: 'x' }];
    const problems = findLeaks({ files, ...opts });
    expect(problems).toHaveLength(1);
    expect(problems[0].kind).toBe('forbidden-path');
  });

  it('catches a governance document whose path was disguised, via the content sentinel', () => {
    const files = [
      ...clean,
      { path: '/blog/access-control/index.html', content: `<!-- ${SENTINEL} -->\n<h1>Access control policy</h1>` },
    ];
    const problems = findLeaks({ files, ...opts });
    expect(problems).toHaveLength(1);
    expect(problems[0].kind).toBe('sentinel');
  });

  it('catches a credential file by extension', () => {
    const files = [...clean, { path: '/.env', content: 'TOKEN=abc' }];
    expect(findLeaks({ files, ...opts })[0].kind).toBe('forbidden-extension');
  });

  it('catches a private key regardless of its filename', () => {
    const files = [...clean, { path: '/assets/notes.txt', content: '-----BEGIN PRIVATE KEY-----' }];
    expect(findLeaks({ files, ...opts })[0].kind).toBe('private-key');
  });

  it('reports every leak rather than stopping at the first', () => {
    const files = [
      ...clean,
      { path: '/policies/a/index.html', content: 'x' },
      { path: '/.env', content: 'y' },
    ];
    expect(findLeaks({ files, ...opts })).toHaveLength(2);
  });

  it('does not flag a post that merely discusses policy as a topic', () => {
    const files = [
      ...clean,
      { path: '/blog/writing-policies-that-hold/index.html', content: '<h1>Writing policies that hold</h1>' },
    ];
    expect(findLeaks({ files, ...opts })).toEqual([]);
  });
});
```

The last test matters: the guard must not become something the author has to fight
in order to write a post about compliance, or it will be disabled.

- [ ] **Step 2: Run it, verify it fails, then write `site/scripts/lib/leaks.mjs`**

Run: `cd site && pnpm vitest run tests/leaks.test.ts` → FAIL.

```js
export const SENTINEL = 'IZZIWOOT-GOVERNANCE-DO-NOT-PUBLISH';

const PRIVATE_KEY = /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/;

/**
 * @param {{ files: { path: string, content: string }[], sentinel: string,
 *           forbiddenPaths: string[], forbiddenExtensions: string[] }} input
 */
export function findLeaks({ files, sentinel, forbiddenPaths, forbiddenExtensions }) {
  const problems = [];

  for (const { path, content } of files) {
    const segments = path.split('/').filter(Boolean);

    if (segments.some((s) => forbiddenPaths.includes(s))) {
      problems.push({
        path,
        kind: 'forbidden-path',
        message: 'output path contains a governance directory name (INV-3)',
      });
      continue;
    }

    if (forbiddenExtensions.some((ext) => path.endsWith(ext))) {
      problems.push({ path, kind: 'forbidden-extension', message: 'credential-shaped file in output' });
      continue;
    }

    if (content.includes(sentinel)) {
      problems.push({
        path,
        kind: 'sentinel',
        message: `governance sentinel found in published output — a policy document leaked (INV-3)`,
      });
      continue;
    }

    if (PRIVATE_KEY.test(content)) {
      problems.push({ path, kind: 'private-key', message: 'private key material in output' });
    }
  }

  return problems;
}
```

Run again: PASS — 7 tests.

- [ ] **Step 3: Write the CLI wrapper with the size/count drift check**

```js
// site/scripts/assert-no-governance-leak.mjs
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { findLeaks, SENTINEL } from './lib/leaks.mjs';

const DIST = new URL('../dist', import.meta.url).pathname;
const BASELINE = new URL('../.output-baseline.json', import.meta.url).pathname;
const TEXTUAL = /\.(html|xml|txt|json|css|js|svg|md)$/;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

const all = walk(DIST);
const files = all.map((path) => ({
  path: `/${relative(DIST, path)}`,
  content: TEXTUAL.test(path) ? readFileSync(path, 'utf8') : '',
}));

const problems = findLeaks({
  files,
  sentinel: SENTINEL,
  forbiddenPaths: ['policies', 'frameworks', 'audits', 'templates', 'intent', 'spec'],
  forbiddenExtensions: ['.env', '.pem', '.key', '.sqlite'],
});

// Volume drift: a sudden 10x jump means something unintended got globbed.
const totalBytes = all.reduce((sum, p) => sum + statSync(p).size, 0);
const current = { count: all.length, bytes: totalBytes };
if (existsSync(BASELINE)) {
  const prev = JSON.parse(readFileSync(BASELINE, 'utf8'));
  if (current.count > prev.count * 10 || current.bytes > prev.bytes * 10) {
    problems.push({
      path: '(output)',
      kind: 'volume-drift',
      message: `output grew from ${prev.count} files / ${prev.bytes} bytes to ${current.count} / ${current.bytes} — verify nothing unintended was globbed`,
    });
  }
}

if (problems.length > 0) {
  console.error('Output leak check FAILED:\n');
  for (const p of problems) console.error(`  ${p.path} [${p.kind}] ${p.message}`);
  process.exit(1);
}

writeFileSync(BASELINE, JSON.stringify(current, null, 2));
console.log(`Output leak check passed (${current.count} files, ${current.bytes} bytes).`);
```

Commit `.output-baseline.json` so drift is measured against the last reviewed state.

- [ ] **Step 4: Seed the sentinel convention in the policy template**

```markdown
<!-- templates/policy.md -->
---
id: POL-000
owner: TODO
version: 0.1
last-reviewed: YYYY-MM-DD
next-review: YYYY-MM-DD
publication: IZZIWOOT-GOVERNANCE-DO-NOT-PUBLISH
---

# <Policy name>

## Purpose

## Scope

## Policy

## Exceptions

## Review
```

Every file under `policies/`, `frameworks/`, and `audits/` must carry the
`publication:` line. `governance.yml` (Task 20) enforces its presence — without it,
the sentinel test has nothing to find.

- [ ] **Step 5: Wire it up and prove it catches a real leak**

```bash
cd site
pnpm pkg set scripts.verify:output="node scripts/assert-no-governance-leak.mjs"
pnpm build && pnpm verify:output          # expect: passed

# Simulate the exact failure INV-3 exists to prevent.
mkdir -p dist/policies/access-control
echo "IZZIWOOT-GOVERNANCE-DO-NOT-PUBLISH" > dist/policies/access-control/index.html
pnpm verify:output                         # expect: exit 1, forbidden-path

# And the disguised-path variant the sentinel exists for.
rm -rf dist/policies
echo "<!-- IZZIWOOT-GOVERNANCE-DO-NOT-PUBLISH -->" > dist/blog/leaked.html
pnpm verify:output                         # expect: exit 1, sentinel
rm dist/blog/leaked.html
pnpm verify:output                         # expect: passed
```

Expected: the two middle runs exit non-zero with the named `kind`.

- [ ] **Step 6: Commit**

```bash
git add site/ templates/policy.md
git commit -m "feat(ci): assert no governance document or credential reaches build output"
```

---

### Task 17: Link checking, markdown hygiene, and formatting

**Files:**
- Create: `lychee.toml`
- Create: `site/.markdownlint-cli2.jsonc`
- Create: `site/.prettierrc.json`, `site/.prettierignore`
- Modify: `site/package.json` — add `lint:links`, `lint:md`, `format:check`, `verify`

**Interfaces:**
- Consumes: `dist/` from a completed build.
- Produces: the `verify` script — the single command CI runs.

**Spec §10.7 reminder:** internal links block; external links never do. A blocking
external check fails your pipeline because someone else's server had a bad minute.

- [ ] **Step 1: Write `lychee.toml`**

```toml
# Internal-only, offline. Fails the build on a broken internal link or anchor.
offline = true
include-fragments = true
verbose = "info"
no-progress = true

# Nothing external is checked here — see spec §10.7. The weekly workflow in
# Task 20 checks external links and reports without blocking.
exclude = ['^https?://', '^mailto:']
```

- [ ] **Step 2: Write the markdownlint and prettier configuration**

```jsonc
// site/.markdownlint-cli2.jsonc
{
  "globs": ["src/content/**/*.md", "src/content/**/*.mdx", "docs/**/*.md"],
  "config": {
    "default": true,
    "MD013": false,           // line length is the author's business
    "MD033": false,           // inline HTML is required for diagrams
    "MD041": false,           // front matter precedes the h1
    "MD024": { "siblings_only": true },
    "MD046": { "style": "fenced" }
  }
}
```

```json
// site/.prettierrc.json
{
  "singleQuote": true,
  "printWidth": 100,
  "plugins": ["prettier-plugin-astro"],
  "overrides": [{ "files": "*.astro", "options": { "parser": "astro" } }]
}
```

```
# site/.prettierignore
dist
.astro
public/fonts
pnpm-lock.yaml
.output-baseline.json
```

Markdown content is **not** prettier-formatted — reflowing an author's prose
produces noisy diffs on every save. `markdownlint` handles structure; prose is left
alone.

- [ ] **Step 3: Install and wire the scripts**

```bash
cd site
pnpm add -D markdownlint-cli2 prettier prettier-plugin-astro
pnpm pkg set scripts.lint:md="markdownlint-cli2"
pnpm pkg set scripts.lint:links="lychee --config ../lychee.toml --base dist dist"
pnpm pkg set scripts.format:check="prettier --check ."
pnpm pkg set scripts.format="prettier --write ."
pnpm pkg set scripts.verify="pnpm check && pnpm lint:content && pnpm lint:md && pnpm format:check && pnpm test && pnpm build && pnpm verify:headers && pnpm verify:output && pnpm lint:links"
```

`lychee` is a Rust binary, installed in CI via its action rather than via pnpm.
Locally: `brew install lychee`.

- [ ] **Step 4: Prove the internal link gate fires**

```bash
cd site
pnpm build && pnpm lint:links               # expect: 0 broken

# Break an internal link and confirm it is caught.
python3 - <<'PY'
import pathlib
p = pathlib.Path('src/content/blog/choose-boring-tools.md')
p.write_text(p.read_text() + '\n[a dead internal link](/blog/does-not-exist/)\n')
PY
pnpm build && pnpm lint:links               # expect: exit 1, names /blog/does-not-exist/
git checkout src/content/blog/choose-boring-tools.md

# Confirm a broken ANCHOR is caught too — the subtler failure.
python3 - <<'PY'
import pathlib
p = pathlib.Path('src/content/blog/choose-boring-tools.md')
p.write_text(p.read_text() + '\n[a dead anchor](#no-such-heading)\n')
PY
pnpm build && pnpm lint:links               # expect: exit 1
git checkout src/content/blog/choose-boring-tools.md
```

Expected: both broken cases exit non-zero. `include-fragments = true` is what makes
the anchor case work; without it the check passes and deep links rot silently.

- [ ] **Step 5: Run the whole verify chain and commit**

Run: `cd site && SITE_URL=https://example.com PUBLIC_GISCUS_REPO=izziwoot/x PUBLIC_GISCUS_REPO_ID=R_x PUBLIC_GISCUS_CATEGORY_ID=DIC_x pnpm verify`
Expected: every step passes.

```bash
git add lychee.toml site/
git commit -m "feat(ci): add internal link, markdown, and formatting gates behind one verify script"
```

---

### Task 18: Lighthouse budgets

**Files:**
- Create: `lighthouserc.json`
- Modify: `site/package.json` — add `lint:lighthouse`

**Interfaces:**
- Consumes: `site/dist/` from a completed build.
- Produces: no exports; a CI assertion only.

**Spec §10.6 reminder:** a score of 100 is a useful floor, not a WCAG conformance
claim. Task 23 adds the manual pass this gate cannot replace.

- [ ] **Step 1: Write `lighthouserc.json`**

```json
{
  "ci": {
    "collect": {
      "staticDistDir": "site/dist",
      "numberOfRuns": 3,
      "url": [
        "http://localhost/index.html",
        "http://localhost/blog/choose-boring-tools/index.html",
        "http://localhost/blog/tags/index.html",
        "http://localhost/about/index.html"
      ],
      "settings": {
        "preset": "desktop",
        "emulatedFormFactor": "mobile",
        "throttlingMethod": "simulate",
        "skipAudits": ["canonical", "is-crawlable"]
      }
    },
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.95, "aggregationMethod": "median" }],
        "categories:accessibility": ["error", { "minScore": 1, "aggregationMethod": "median" }],
        "categories:best-practices": ["warn", { "minScore": 0.95 }],
        "categories:seo": ["warn", { "minScore": 0.95 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 1500 }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.02 }],
        "total-byte-weight": ["warn", { "maxNumericValue": 512000 }],
        "unused-javascript": ["off"],
        "uses-long-cache-ttl": ["off"]
      }
    },
    "upload": { "target": "filesystem", "outputDir": ".lighthouseci" }
  }
}
```

`canonical` and `is-crawlable` are skipped because the static-dist server has no
real origin, so both audits false-positive; the real canonical is asserted in the
build-output suite (Task 8) and the headers on the live origin in Task 21.
`uses-long-cache-ttl` is off because caching lives in `_headers`, which the static
server does not apply.

- [ ] **Step 2: Wire it and establish the baseline**

```bash
cd "$(git rev-parse --show-toplevel)"
cd site && pnpm add -D @lhci/cli
pnpm pkg set scripts.lint:lighthouse="lhci autorun --config=../lighthouserc.json"
SITE_URL=https://example.com PUBLIC_GISCUS_REPO=izziwoot/x PUBLIC_GISCUS_REPO_ID=R_x \
  PUBLIC_GISCUS_CATEGORY_ID=DIC_x pnpm build
pnpm lint:lighthouse
```

Expected: all four URLs pass. **If accessibility is below 1.0, fix the markup — do
not lower the threshold.** If performance is below 0.95 on a text page with no
first-party JS, the cause is almost always the font: check `font-display: swap`, the
`preload`, and that the subset actually shipped.

- [ ] **Step 3: Record the measured numbers in the plan's own audit trail**

```bash
cd "$(git rev-parse --show-toplevel)"
mkdir -p audits
cat > audits/2026-XX-XX-launch-baseline.md <<'EOF'
---
id: AUD-001
owner: Adilson Cesar
version: 1.0
last-reviewed: 2026-XX-XX
next-review: 2027-XX-XX
publication: IZZIWOOT-GOVERNANCE-DO-NOT-PUBLISH
---

# Launch performance and accessibility baseline

Measured with Lighthouse CI, 3 runs, median, mobile emulation, against `site/dist`.

| URL | Performance | Accessibility | LCP (ms) | CLS |
| --- | --- | --- | --- | --- |
| `/` | | | | |
| `/blog/choose-boring-tools/` | | | | |
| `/blog/tags/` | | | | |
| `/about/` | | | | |

Fill from `.lighthouseci/` after the run. These are the numbers a future
regression is measured against.
EOF
```

Fill the table from the actual run output. An empty table is a plan failure.

- [ ] **Step 4: Commit**

```bash
git add lighthouserc.json site/package.json audits/
git commit -m "feat(ci): enforce Lighthouse performance and accessibility budgets"
```

---

### Task 19: Secret scanning — the highest-likelihood risk

**Files:**
- Create: `.gitleaks.toml`
- Create: `.husky/pre-commit`
- Modify: `site/package.json` — add `prepare` for husky

**Interfaces:**
- Consumes: nothing.
- Produces: a local pre-commit gate and a config shared with the CI job in Task 20.

**Why this is the task to get right:** spec failure-mode table, row 1. A public
repository plus posts about real systems is the realistic breach path — far likelier
than anything happening to the site. Git history is permanent, so the remediation
for a leak is **rotation**, never a revert commit.

- [ ] **Step 1: Write `.gitleaks.toml`**

```toml
title = "Izzi Woot blog secret scan"

[extend]
useDefault = true

# Public-by-design identifiers that would otherwise trip generic rules.
[[allowlist]]
description = "Public Giscus and Cloudflare identifiers embedded in the page by design"
regexes = [
  '''PUBLIC_GISCUS_REPO_ID''',
  '''PUBLIC_GISCUS_CATEGORY_ID''',
  '''PUBLIC_CF_BEACON_TOKEN''',
]

[[allowlist]]
description = "Lockfile integrity hashes are not secrets"
paths = ['''pnpm-lock\.yaml$''']

[[rules]]
id = "izziwoot-internal-hostname"
description = "Internal hostname or client name that should not appear in a public post"
# Populate with the specific strings that must never be published. Keep this list
# in the repo, not in your head — it is the whole point of the rule.
regex = '''(?i)(REPLACE_WITH_CLIENT_NAME|\.internal\.example\.com)'''
tags = ["disclosure"]
```

The custom rule is the one that will actually save a draft. Generic secret rules
catch API keys; nothing generic catches a client's name in a war story. Fill the
regex with the real strings before the first post about work.

- [ ] **Step 2: Install the local hook**

```bash
cd "$(git rev-parse --show-toplevel)"
brew install gitleaks    # or: https://github.com/gitleaks/gitleaks/releases
cd site && pnpm add -D husky
pnpm pkg set scripts.prepare="cd .. && husky site/.husky"
cd "$(git rev-parse --show-toplevel)"
mkdir -p .husky
cat > .husky/pre-commit <<'EOF'
#!/usr/bin/env sh
# Staged-only secret scan. Fast enough to run on every commit.
if command -v gitleaks >/dev/null 2>&1; then
  gitleaks protect --staged --redact --config .gitleaks.toml || {
    echo ""
    echo "A potential secret is staged. Do NOT commit and then revert —"
    echo "git history is permanent and this repository is public."
    echo "Remove it from the staged change, and if it is a real credential, ROTATE it."
    exit 1
  }
else
  echo "warning: gitleaks not installed — staged secret scan skipped"
fi

# Formatting, staged files only.
cd site && pnpm prettier --check $(git diff --cached --name-only --diff-filter=ACM --relative=site | grep -E '\.(ts|astro|css|json|mjs)$' || true) || exit 1
EOF
chmod +x .husky/pre-commit
```

The hook warns rather than fails when gitleaks is absent, so a fresh clone is not
bricked — CI is the blocking gate (Task 20), the hook is the fast local one.

- [ ] **Step 3: Prove the hook blocks a real secret**

```bash
cd "$(git rev-parse --show-toplevel)"
cat > /tmp/leak-test.md <<'EOF'
Here is the key: AKIAIOSFODNN7EXAMPLE
EOF
cp /tmp/leak-test.md site/src/content/blog/leak-test.md
git add site/src/content/blog/leak-test.md
git commit -m "test: this must be rejected"    # expect: BLOCKED by pre-commit
git restore --staged site/src/content/blog/leak-test.md
rm site/src/content/blog/leak-test.md
```

Expected: the commit is rejected and the rotation message prints. If it succeeds,
the hook is not installed — fix it before writing any post that mentions real
systems.

- [ ] **Step 4: Verify the allowlist does not defeat the purpose**

```bash
cd "$(git rev-parse --show-toplevel)"
gitleaks detect --config .gitleaks.toml --redact --verbose
```

Expected: 0 leaks on the current history, and the `PUBLIC_*` names in
`site/src/config/env.ts` are not reported. If a real token were pasted next to one
of those names it would still be caught — the allowlist matches the identifier
names, not arbitrary values near them.

- [ ] **Step 5: Commit**

```bash
git add .gitleaks.toml .husky site/package.json
git commit -m "feat(security): add gitleaks config and pre-commit secret scan"
```

---

### Task 20: Path-scoped CI workflows

**Files:**
- Create: `.github/workflows/site.yml`
- Create: `.github/workflows/governance.yml`
- Create: `.github/workflows/security.yml`
- Create: `.github/workflows/links-weekly.yml`
- Create: `scripts/check-governance-frontmatter.mjs`

**Interfaces:**
- Consumes: every `verify:*` and `lint:*` script from Tasks 4, 15, 16, 17, 18.
- Produces: the status checks that Task 22's branch protection will require by name.

**Action pinning:** every third-party action below must be pinned to a full commit
SHA before merge. The `@vN` tags shown are placeholders for readability — resolve
each with `gh api repos/<owner>/<repo>/commits/<tag> --jq .sha` and substitute. A
mutable tag is the standard Actions compromise vector (spec §5.3).

- [ ] **Step 1: Write `.github/workflows/site.yml`**

```yaml
name: site

on:
  push:
    branches: [main]
    paths: ['site/**', '.github/workflows/site.yml', 'lychee.toml', 'lighthouserc.json']
  pull_request:
    paths: ['site/**', '.github/workflows/site.yml', 'lychee.toml', 'lighthouserc.json']

permissions:
  contents: read

concurrency:
  group: site-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    env:
      SITE_URL: ${{ vars.SITE_URL || 'https://example.com' }}
      PUBLIC_GISCUS_REPO: ${{ vars.PUBLIC_GISCUS_REPO }}
      PUBLIC_GISCUS_REPO_ID: ${{ vars.PUBLIC_GISCUS_REPO_ID }}
      PUBLIC_GISCUS_CATEGORY_ID: ${{ vars.PUBLIC_GISCUS_CATEGORY_ID }}
    steps:
      - uses: actions/checkout@v4          # PIN TO SHA
      - uses: pnpm/action-setup@v4         # PIN TO SHA
      - uses: actions/setup-node@v4        # PIN TO SHA
        with:
          node-version-file: .nvmrc
          cache: pnpm
          cache-dependency-path: site/pnpm-lock.yaml

      - run: pnpm install --frozen-lockfile
        working-directory: site

      - run: pnpm audit --audit-level=high
        working-directory: site

      - run: pnpm check
        working-directory: site

      - run: pnpm lint:content
        working-directory: site

      - run: pnpm lint:md
        working-directory: site

      - run: pnpm format:check
        working-directory: site

      - run: pnpm test
        working-directory: site

      - run: pnpm build
        working-directory: site

      - run: pnpm verify:headers
        working-directory: site

      - run: pnpm verify:output
        working-directory: site

      - name: Internal link and anchor check
        uses: lycheeverse/lychee-action@v2   # PIN TO SHA
        with:
          args: --config lychee.toml --base site/dist site/dist
          fail: true

      - name: Lighthouse budgets
        run: pnpm lint:lighthouse
        working-directory: site
```

`pnpm test` runs the build-output suite, which builds the site a second time. That
is acceptable — correctness of the gate matters more than shaving 40 seconds.

- [ ] **Step 2: Write `scripts/check-governance-frontmatter.mjs`**

```js
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DIRS = ['policies', 'frameworks', 'audits'];
const REQUIRED = ['id', 'owner', 'version', 'last-reviewed', 'next-review', 'publication'];
const SENTINEL = 'IZZIWOOT-GOVERNANCE-DO-NOT-PUBLISH';

const problems = [];

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (path.endsWith('.md')) out.push(path);
  }
  return out;
}

for (const dir of DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const text = readFileSync(file, 'utf8');
    const rel = file.replace(ROOT, '');
    const match = text.match(/^---\n([\s\S]*?)\n---/);
    if (!match) {
      problems.push(`${rel}: missing YAML front matter`);
      continue;
    }
    const front = match[1];
    for (const key of REQUIRED) {
      if (!new RegExp(`^${key}:`, 'm').test(front)) problems.push(`${rel}: missing "${key}"`);
    }
    if (!front.includes(SENTINEL)) {
      problems.push(`${rel}: publication sentinel absent — the leak test cannot detect this file`);
    }
    const next = front.match(/^next-review:\s*(\S+)/m)?.[1];
    if (next && !/^\d{4}-\d{2}-\d{2}$/.test(next)) {
      problems.push(`${rel}: next-review must be an ISO date (YYYY-MM-DD), got "${next}"`);
    } else if (next && new Date(next) < new Date()) {
      problems.push(`${rel}: next-review date ${next} has passed — review the document`);
    }
  }
}

if (problems.length > 0) {
  console.error('Governance front-matter check failed:\n');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log('Governance front-matter check passed.');
```

An overdue `next-review` failing CI is deliberate: an annual review that nothing
enforces is a review that does not happen.

- [ ] **Step 3: Write `.github/workflows/governance.yml`**

```yaml
name: governance

on:
  push:
    branches: [main]
    paths: ['policies/**', 'frameworks/**', 'audits/**', 'templates/**', 'intent/**', 'spec/**', 'plan/**']
  pull_request:
    paths: ['policies/**', 'frameworks/**', 'audits/**', 'templates/**', 'intent/**', 'spec/**', 'plan/**']

permissions:
  contents: read

jobs:
  frontmatter:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4        # PIN TO SHA
      - uses: actions/setup-node@v4      # PIN TO SHA
        with: { node-version-file: .nvmrc }
      - run: node scripts/check-governance-frontmatter.mjs
```

- [ ] **Step 4: Write `.github/workflows/security.yml` — deliberately unfiltered**

```yaml
name: security

# NO path filter. A secret can be committed to any path, including a policy
# document or a draft post. This workflow must run on every change.
on:
  push:
    branches: [main]
  pull_request:
  schedule:
    - cron: '17 4 * * 1'

permissions:
  contents: read

jobs:
  gitleaks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4        # PIN TO SHA
        with: { fetch-depth: 0 }         # full history: a secret may be older than this PR
      - uses: gitleaks/gitleaks-action@v2  # PIN TO SHA
        env:
          GITLEAKS_CONFIG: .gitleaks.toml

  dependencies:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4        # PIN TO SHA
      - uses: pnpm/action-setup@v4       # PIN TO SHA
      - uses: actions/setup-node@v4      # PIN TO SHA
        with:
          node-version-file: .nvmrc
          cache: pnpm
          cache-dependency-path: site/pnpm-lock.yaml
      - run: pnpm install --frozen-lockfile
        working-directory: site
      - run: pnpm audit --audit-level=high
        working-directory: site
```

- [ ] **Step 5: Write `.github/workflows/links-weekly.yml` — reports, never blocks**

```yaml
name: links-weekly

on:
  schedule:
    - cron: '23 6 * * 1'
  workflow_dispatch:

permissions:
  contents: read
  issues: write

jobs:
  external:
    runs-on: ubuntu-latest
    env:
      SITE_URL: ${{ vars.SITE_URL || 'https://example.com' }}
      PUBLIC_GISCUS_REPO: ${{ vars.PUBLIC_GISCUS_REPO }}
      PUBLIC_GISCUS_REPO_ID: ${{ vars.PUBLIC_GISCUS_REPO_ID }}
      PUBLIC_GISCUS_CATEGORY_ID: ${{ vars.PUBLIC_GISCUS_CATEGORY_ID }}
    steps:
      - uses: actions/checkout@v4        # PIN TO SHA
      - uses: pnpm/action-setup@v4       # PIN TO SHA
      - uses: actions/setup-node@v4      # PIN TO SHA
        with: { node-version-file: .nvmrc, cache: pnpm, cache-dependency-path: site/pnpm-lock.yaml }
      - run: pnpm install --frozen-lockfile
        working-directory: site
      - run: pnpm build
        working-directory: site
      - name: Check external links
        id: lychee
        uses: lycheeverse/lychee-action@v2   # PIN TO SHA
        with:
          args: --no-progress --exclude-path site/dist/feed.xml site/dist
          fail: false                         # spec §10.7: never block on someone else's downtime
          output: lychee-report.md
      - name: Open or update a rot report issue
        if: steps.lychee.outputs.exit_code != 0
        uses: peter-evans/create-issue-from-file@v5   # PIN TO SHA
        with:
          title: Weekly external link report
          content-filepath: lychee-report.md
          labels: link-rot
```

- [ ] **Step 6: Add Dependabot**

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: npm
    directory: /site
    schedule: { interval: weekly }
    groups:
      minor-and-patch:
        update-types: [minor, patch]
  - package-ecosystem: github-actions
    directory: /
    schedule: { interval: weekly }
```

The `github-actions` entry matters more than the npm one here: it is what keeps your
SHA-pinned actions from silently aging into unpatched versions.

- [ ] **Step 7: Pin every action and verify the workflows parse**

```bash
cd "$(git rev-parse --show-toplevel)"
for repo in actions/checkout pnpm/action-setup actions/setup-node lycheeverse/lychee-action \
            gitleaks/gitleaks-action peter-evans/create-issue-from-file; do
  echo "$repo: $(gh api "repos/$repo/commits/$(gh api repos/$repo/releases/latest --jq .tag_name)" --jq .sha 2>/dev/null)"
done
# Substitute each SHA into the workflow files, keeping the version as a trailing comment:
#   uses: actions/checkout@<sha> # v4.2.2
grep -rn "uses:.*@v[0-9]" .github/workflows/ && echo "FAIL: unpinned action remains" || echo "all actions pinned"
gh workflow list   # confirms GitHub parsed every file
```

Expected: the grep finds nothing and prints `all actions pinned`.

- [ ] **Step 8: Prove the path filters work**

```bash
cd "$(git rev-parse --show-toplevel)"
git checkout -b ci/verify-path-filters
echo "" >> policies/.gitkeep 2>/dev/null || { mkdir -p policies && touch policies/.gitkeep; }
git add policies/.gitkeep && git commit -m "test: governance-only change"
git push -u origin ci/verify-path-filters
gh pr create --fill
gh pr checks --watch
```

Expected: `governance` and `security` run; **`site` does not**. Then push a
`site/`-only change to the same PR and confirm `site` runs. Close the PR without
merging and delete the branch. This is the evidence that spec §7.1 is real.

- [ ] **Step 9: Commit**

```bash
git add .github/ scripts/check-governance-frontmatter.mjs
git commit -m "feat(ci): add path-scoped site, governance, and unfiltered security workflows"
```

---

### Task 21: Deploy to Cloudflare Pages

**Files:**
- Modify: `site/public/robots.txt` — real domain
- Modify: `site/src/content/authors/adilson-cesar.json` — real feed URL
- Create: `docs/runbook-deploy.md`

**Interfaces:**
- Consumes: a green `site` workflow.
- Produces: a live origin; the `SITE_URL` repository variable.

**Blocked on:** Open Question 1 (domain). Everything before this task runs without it.

- [ ] **Step 1: Create the Pages project (human, in the dashboard)**

| Setting | Value |
| --- | --- |
| Root directory | `site` |
| Build command | `pnpm install --frozen-lockfile && pnpm build` |
| Build output directory | `site/dist` |
| Production branch | `main` |
| Node version | from `.nvmrc` |

Build-time environment variables, set for **both** production and preview:
`SITE_URL`, `PUBLIC_GISCUS_REPO`, `PUBLIC_GISCUS_REPO_ID`,
`PUBLIC_GISCUS_CATEGORY_ID`, `PUBLIC_CF_BEACON_TOKEN`.

Set `SITE_URL` to the **production origin** in the production environment. Preview
builds inherit `CF_PAGES_BRANCH`, which `site.ts` already uses to emit `noindex`
(spec §10.5) — verify that in Step 4 rather than trusting it.

Enable path-filtered builds so a governance-only commit does not deploy. If the
plan in use lacks that setting, add this guard as the first line of the build
command: `git diff --quiet HEAD^ HEAD -- site/ && exit 0`.

- [ ] **Step 2: Replace the domain placeholders**

```bash
cd "$(git rev-parse --show-toplevel)"
DOMAIN="https://REPLACE_ME"          # the real origin
sed -i.bak "s|https://REPLACE_WITH_DOMAIN|$DOMAIN|" site/public/robots.txt && rm site/public/robots.txt.bak
sed -i.bak "s|https://example.com/feed.xml|$DOMAIN/feed.xml|" site/src/content/authors/adilson-cesar.json && rm site/src/content/authors/adilson-cesar.json.bak
grep -rn "REPLACE" site/public site/src/content && echo "FAIL: placeholder remains" || echo "no placeholders left"
gh variable set SITE_URL --body "$DOMAIN"
```

- [ ] **Step 3: Attach the custom domain and enable analytics**

In the dashboard: add the custom domain, confirm the certificate is issued, enable
**Always Use HTTPS**, and enable **Web Analytics** for the hostname. Copy the beacon
token into `PUBLIC_CF_BEACON_TOKEN`.

At the registrar: enable **auto-renew**, and set the registrar contact address to a
mailbox **not** hosted on this domain (spec failure-mode table). A renewal notice
delivered to an address that dies with the domain is not a notice.

- [ ] **Step 4: Verify the live origin, not the build output**

```bash
DOMAIN="REPLACE_ME"

# Headers actually served (the _headers file being present is not the same thing).
curl -sSI "https://$DOMAIN/" | tee /tmp/headers.txt
grep -i "content-security-policy" /tmp/headers.txt | grep -q "frame-src https://giscus.app" && echo "CSP served"
grep -qi "strict-transport-security: max-age=63072000" /tmp/headers.txt && echo "HSTS served"
grep -qi "x-content-type-options: nosniff" /tmp/headers.txt && echo "nosniff served"

# Canonical URL correctness on the live origin.
curl -sS "https://$DOMAIN/blog/choose-boring-tools/" | grep -o '<link rel="canonical"[^>]*>'
# Expect: href="https://$DOMAIN/blog/choose-boring-tools/"

# Redirects.
for path in /blog /feed /rss.xml; do
  printf '%s -> ' "$path"
  curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' "https://$DOMAIN$path"
done
# Expect: 301 to /, /feed.xml, /feed.xml respectively.

# 404 returns a real 404, not a 200 soft-404.
curl -sS -o /dev/null -w '%{http_code}\n' "https://$DOMAIN/no-such-page/"   # expect 404

# Feed validity on the live origin.
curl -sS "https://$DOMAIN/feed.xml" | head -5

# Production must be indexable; a preview must not be.
curl -sS "https://$DOMAIN/" | grep -c 'name="robots"'                       # expect 0
curl -sS "https://<preview-hash>.pages.dev/" | grep -o 'name="robots"[^>]*' # expect noindex, nofollow
```

Expected: every `echo` fires, the canonical matches the real domain, the three
redirects are 301, the missing page is 404, and only the preview carries `noindex`.
**The preview `noindex` check is the one people skip and then wonder why a
`pages.dev` URL outranks their blog.**

- [ ] **Step 5: Smoke-test comments under the enforced CSP**

Open a post on the live origin in a browser with devtools. Confirm: the Giscus
thread renders, and the console shows **no CSP violation**. This is a manual check
(spec §7.3) — a headless version is worth adding later but is not a launch blocker.

- [ ] **Step 6: Write the deploy runbook**

```markdown
<!-- docs/runbook-deploy.md -->
# Deploy runbook

## Publish a post
1. Branch, add `site/src/content/blog/<kebab-slug>.md`, push, open a PR.
2. Read it on the Cloudflare preview URL — rendered, not raw.
3. Merge to `main`. Production deploys automatically.

## Roll back a bad deploy
1. Cloudflare Pages → Deployments → the last good one → **Rollback**.
2. Then fix forward on a branch. `main` is always deployable.
3. Rollback is not a fix — it buys time.

## A leaked credential
1. **Rotate the credential first.** Revocation is the remediation.
2. Do not revert-and-forget: this repository is public and history is permanent.
3. Record the incident under `audits/`.

## Correct a published post
1. Add a `corrections` entry (date + note) and bump `updatedDate`.
2. Never edit an existing correction. Never delete the URL.

## Retract a post
1. Add `retracted: { date, reason }`.
2. The URL keeps working and keeps the notice. It leaves listings, the feed, and the sitemap.
```

- [ ] **Step 7: Commit**

```bash
git add site/public/robots.txt site/src/content/authors docs/runbook-deploy.md
git commit -m "feat(deploy): point the site at its production domain and document the runbook"
```

---

### Task 22: Branch protection and policy reconciliation — **GATED**

**Files:**
- Modify: `policies/change-management.md` (create if absent, from `templates/policy.md`)
- Create: `audits/2026-XX-XX-branch-protection.md`

**DO NOT START** until a human has answered both:

1. **Spec §10.1** — branch protection cannot be path-scoped. Recommended **Option A**:
   PR-only for all of `main`, with a required status check that inspects the changed
   paths and applies the stricter gate to governance directories.
2. **Spec §10.2** — "at least one reviewer" is unsatisfiable with a single
   maintainer, because GitHub forbids self-approval. Recommended: require **zero**
   approvals plus a PR and passing checks, and **amend the policy text** to say the
   control is the recorded trail, not independent review.

**Do not guess.** A configuration that looks enforced but is bypassed by admin on
every merge is worse than no control, because it misleads the auditor the control
exists for.

- [ ] **Step 1: Verify what this repository's plan actually supports**

```bash
cd "$(git rev-parse --show-toplevel)"
gh api repos/:owner/:repo --jq '{visibility, plan: .owner.type}'
gh api repos/:owner/:repo/rulesets --jq '.[] | {id, name, target}' 2>&1 | head
```

Record the result in the audit file. Spec §10.1 flags ruleset path-restriction
availability as **unverified** — this step is where it gets verified, against the
live API rather than against documentation.

- [ ] **Step 2: Configure protection per the decision (Option A shown)**

```bash
gh api -X PUT repos/:owner/:repo/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  -F required_status_checks[strict]=true \
  -F 'required_status_checks[contexts][]=verify' \
  -F 'required_status_checks[contexts][]=gitleaks' \
  -F 'required_status_checks[contexts][]=dependencies' \
  -F enforce_admins=false \
  -F required_pull_request_reviews[required_approving_review_count]=0 \
  -F required_pull_request_reviews[dismiss_stale_reviews]=true \
  -F required_linear_history=true \
  -F allow_force_pushes=false \
  -F allow_deletions=false \
  -F restrictions=
```

`required_approving_review_count=0` is the §10.2 resolution made explicit, not an
oversight. `enforce_admins=false` is deliberate: with one maintainer, an
admin-locked branch that also demands checks can deadlock on a CI outage. The
tradeoff is recorded in Step 4.

Then add the path-sensitive gate as a required check:

```yaml
# .github/workflows/governance.yml — add this job
  stricter-gate-for-governance:
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4          # PIN TO SHA
        with: { fetch-depth: 0 }
      - name: Require a descriptive PR body for governance changes
        run: |
          CHANGED=$(git diff --name-only origin/${{ github.base_ref }}...HEAD)
          if echo "$CHANGED" | grep -qE '^(policies|frameworks|audits)/'; then
            BODY=$(gh pr view ${{ github.event.pull_request.number }} --json body --jq .body)
            if [ "${#BODY}" -lt 80 ]; then
              echo "A governance change needs a PR body explaining what changed and why."
              echo "The recorded rationale IS the control (spec §10.2)."
              exit 1
            fi
          fi
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 3: Verify the configuration matches the written policy**

```bash
gh api repos/:owner/:repo/branches/main/protection --jq \
  '{checks: .required_status_checks.contexts, approvals: .required_pull_request_reviews.required_approving_review_count, force_push: .allow_force_pushes.enabled, linear: .required_linear_history.enabled}'

# Prove a direct push to main is refused.
git checkout main && echo "" >> README.md && git commit -am "test: direct push must fail"
git push origin main     # expect: rejected
git reset --hard origin/main
```

Expected: the push is rejected. If it succeeds, protection is not active and
everything the policy claims is false.

- [ ] **Step 4: Amend the policy text so it matches reality**

```bash
cd "$(git rev-parse --show-toplevel)"
mkdir -p policies
cp templates/policy.md policies/change-management.md
```

Edit `policies/change-management.md` so the control section says what is actually
enforced. The wording that must **not** survive is "at least one reviewer from the
security owner group", because with a single maintainer that is false. Replace it
with the substance of the §10.2 decision:

> Every change to this repository reaches `main` through a pull request with all
> required status checks passing. Direct pushes to `main` are refused by branch
> protection. With a single maintainer, the control is the **recorded trail** — the
> PR, its diff, its checks, and its written rationale — not independent review.
> Changes under `policies/`, `frameworks/`, and `audits/` additionally require a
> substantive PR body explaining the change, enforced by CI. Should a second
> security owner join, the approval requirement is raised to one and this paragraph
> is amended.

- [ ] **Step 5: Record the configuration as audit evidence**

```bash
cat > audits/2026-XX-XX-branch-protection.md <<'EOF'
---
id: AUD-002
owner: Adilson Cesar
version: 1.0
last-reviewed: 2026-XX-XX
next-review: 2027-XX-XX
publication: IZZIWOOT-GOVERNANCE-DO-NOT-PUBLISH
---

# Branch protection configuration and its limits

## Decision
Spec §10.1 Option A — PR-only for all of `main`; path sensitivity implemented as a
required status check, not as branch protection, because GitHub scopes protection
to a branch and not to changed paths.

## Verified capability
Output of `gh api repos/:owner/:repo/rulesets` on <date>: <paste>

## Configuration
<paste the output of the Step 3 verification command>

## Known limits, accepted
- `required_approving_review_count` is 0. GitHub forbids self-approval, so with one
  maintainer any non-zero value would make governance changes unmergeable. The
  control is the recorded trail (spec §10.2).
- `enforce_admins` is false, so the sole maintainer can bypass checks in an
  emergency. Every such bypass must be recorded as an addendum here.
- `git log` mixes blog and governance commits (spec §10.9). Reconstruct the
  governance trail with `git log -- policies/ frameworks/ audits/`.

## Evidence that protection is live
A direct push to `main` was attempted on <date> and rejected. <paste>
EOF
```

- [ ] **Step 6: Commit via a PR, since `main` is now protected**

```bash
git checkout -b governance/branch-protection
git add policies/change-management.md audits/ .github/workflows/governance.yml
git commit -m "docs(governance): reconcile change-management policy with enforceable controls"
git push -u origin governance/branch-protection
gh pr create --title "Reconcile change-management policy with enforceable controls" \
  --body "Implements spec §10.1 Option A and §10.2. Branch protection cannot be path-scoped and GitHub forbids self-approval, so the policy text is amended to describe the control that actually exists: the recorded trail. Configuration and its accepted limits are recorded in audits/."
```

This PR is itself the first piece of evidence that the process works.

---

### Task 23: Launch verification — the checks no CI can make

**Files:**
- Create: `audits/2026-XX-XX-launch-verification.md`
- Modify: `audits/2026-XX-XX-launch-baseline.md` — fill the measured table

**Interfaces:**
- Consumes: a live production site.
- Produces: the launch evidence record.

**Why this task is not optional:** spec §10.6. Automated tooling detects roughly a
third of WCAG failures. A Lighthouse accessibility score of 100 is compatible with
keyboard traversal that makes no sense and alt text that is technically present and
functionally useless. This task is where a human looks.

- [ ] **Step 1: Keyboard-only traversal**

Put the mouse away. From a cold load of the home page, `Tab` through: the skip link
(must be first and must become visible on focus), the header nav, every post link,
the footer. Then a post page, then `/blog/tags/`. Confirm: focus is always visible,
order matches visual order, nothing is reachable-but-invisible, and an overflowing
code block can be scrolled with the keyboard.

- [ ] **Step 2: Screen-reader read-through of one post**

VoiceOver (`Cmd+F5`) on macOS. Listen to a full post. Confirm: `<h1>` announces once,
heading levels descend without skipping, the date and reading time read as
information rather than as punctuation soup (the `·` separators are
`aria-hidden="true"` for this reason), images announce meaningful alt text, and the
corrections section announces with its heading.

- [ ] **Step 3: Zoom and reflow**

At 400% browser zoom and at a 320px viewport width: no horizontal page scroll, no
clipped text, no overlapping elements. Repeat in both color schemes (toggle the OS
setting — there is no in-page switch by design).

- [ ] **Step 4: Rehearse the rollback before you need it**

```bash
# Deliberately ship a visible but harmless defect.
git checkout -b chore/rollback-rehearsal
python3 - <<'PY'
import pathlib
p = pathlib.Path('site/src/pages/index.astro')
p.write_text(p.read_text().replace('<h1>{site.name}</h1>', '<h1>ROLLBACK REHEARSAL</h1>'))
PY
git commit -am "chore: rollback rehearsal marker" && git push -u origin chore/rollback-rehearsal
gh pr create --fill && gh pr merge --squash --auto
```

Wait for production to show the marker, then roll back in the Cloudflare dashboard
and confirm the marker is gone within a minute. Then revert the commit properly.
Record the elapsed time. **A rollback procedure first attempted during an incident
is not a procedure.**

- [ ] **Step 5: Write the launch verification record**

```bash
cat > audits/2026-XX-XX-launch-verification.md <<'EOF'
---
id: AUD-003
owner: Adilson Cesar
version: 1.0
last-reviewed: 2026-XX-XX
next-review: 2027-XX-XX
publication: IZZIWOOT-GOVERNANCE-DO-NOT-PUBLISH
---

# Launch verification

## Automated (CI, per spec §7.2)
| Gate | Result |
| --- | --- |
| astro check | |
| content filename / collision check | |
| schema validation (vitest) | |
| build-output assertions | |
| header + CSP verification | |
| governance leak assertions | |
| internal link + anchor check | |
| Lighthouse performance ≥ 0.95 | |
| Lighthouse accessibility = 1.0 | |
| gitleaks | |

## Manual (spec §10.6 — these are NOT covered by the score above)
| Check | Result | Notes |
| --- | --- | --- |
| Keyboard-only traversal, both schemes | | |
| Screen-reader read-through of one post | | |
| 400% zoom, no horizontal scroll | | |
| 320px viewport reflow | | |
| Giscus loads with CSP enforced, no console violation | | |
| Live headers verified with curl | | |
| Preview deploy emits noindex; production does not | | |
| Rollback rehearsed | | elapsed: |

## Conformance statement
Lighthouse accessibility scored 100 and the manual checks above passed. This is
**not** a claim of full WCAG 2.2 AA conformance — automated tooling covers roughly a
third of the criteria. It is a record of what was actually verified, by whom, and
when.

## Deferred, with triggers
| Item | Revisit when |
| --- | --- |
| Pagination | published posts reach 60 (build warns) |
| Full-text search | ~30 posts |
| Email newsletter | there is content worth subscribing to |
| Headless CSP/comments smoke test | next CSP change |
| Portuguese content | if bilingual becomes likely — changes the URL scheme |
EOF
```

- [ ] **Step 6: Commit via PR**

```bash
git checkout -b governance/launch-evidence
git add audits/
git commit -m "docs(audit): record launch verification evidence and manual accessibility pass"
git push -u origin governance/launch-evidence
gh pr create --fill
```

---

## Self-Review

Run against the spec after completing the plan. Findings are recorded here rather than silently fixed, so a reader can see what was checked.

**1. Spec coverage.** Every spec section maps to a task:

| Spec § | Task |
| --- | --- |
| INV-1…INV-5 | Global Constraints; INV-3 mechanically in 16, INV-4 in 8, INV-5 in 8 and 12 |
| §2.1 layout / §2.2 toolchain / §2.3 build | 1, 21 |
| §3.1–3.2 schemas | 2 |
| §3.3 derived data | 3, 7 |
| §3.4 config contract | 1, 5 |
| §3.5 schema migration | documented in spec; no task needed until a field changes |
| §4.1 routes | 7, 8, 9, 10, 11 |
| §4.2 normalization / §4.3 redirects | 1, 12 |
| §4.4 feed | 10 |
| §4.5 metadata | 5 |
| §5.1 state | 5, 6 |
| §5.2 trust boundaries | 15, 16, 19 |
| §5.3 supply chain | 1, 20 |
| §5.4 headers | 15 |
| §5.5 data protection | 11 |
| §5.6 secrets | 19, 21 |
| §6.1–6.7 FR-1…FR-35 | 7 (1–5), 8 (6–13), 9 (14–17), 11 (18–21), 8 (22–25), 6 + 23 (26–31), 6 + 18 (32–35) |
| §7.1–7.4 CI | 4, 15, 16, 17, 18, 20 |
| §8 sequence | this task order |
| §10.1–10.2 | 22 (gated) |
| §10.3–10.4 | 14, 11 |
| §10.5 | 5, 21 |
| §10.6 | 18, 23 |
| §10.7 | 17, 20 |
| §10.8 | 13 |
| §10.9 | 20 |
| §11 Definition of Done | 23 |

**Gap found and accepted:** §3.5 (schema migration procedure) has no task because it
describes how to make a *future* change, not something to build now. It is
documented in the spec and referenced here so a future engineer finds it.

**Gap found and closed:** the spec's §7.3 asks for a headless check that Giscus
loads under the enforced CSP. That is a manual step in Task 21 Step 5 and Task 23,
and is listed as deferred with a trigger in the launch record — not silently dropped.

**2. Placeholder scan.** No `TBD`, no "add error handling", no "similar to Task N",
no "write tests for the above". Three intentional `REPLACE_ME` markers exist — the
domain (Task 21), the client-name regex (Task 19), and the audit dates — each with
an explicit step that replaces it and a `grep` that fails if one survives.

**3. Type consistency.** Verified across tasks: `selectPublished`/`selectListable`
keep the same `SelectOpts` shape in Tasks 3, 7, 8, 9, 10. `PostLike` in Task 3
matches what `BlogEntry` satisfies in Task 7. `buildSeo`'s `SeoInput` in Task 5 is
consumed with the same field names by `BaseLayout` and `PostLayout` in Tasks 5 and 8.
`postStatus` returns the same four fields used in Task 8's template. `toFeedItems`
and `feedLastBuildDate` signatures in Task 10 match their call site in
`feed.xml.ts`. `findLeaks` and `checkCsp` return `Problem[]`/`string[]`
consistently between their tests and their CLI wrappers.

**4. Review Focus.** All five are pinned to a task with a real test, not to a
checklist: empty collection → Tasks 3 and 10; slug/route collision → Task 4;
XML-unsafe title → Task 10 (unit test plus an end-to-end escaping proof);
future `pubDate` → Task 3; identical `pubDate` → Task 3, including an assertion
that reversing the input does not change the output.

---

*Derived from `spec/core-spec.md` (spec-blog-001 v1.0) and `intent/core-intent.md`
(intent-blog-001 v1.0) on 2026-09-28. 23 tasks; Task 22 gated on two human
decisions. Where this plan diverges from the spec, the divergence is named at the
point it occurs.*
