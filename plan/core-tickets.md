---
id: tix-blog-001
owner: Adilson Cesar
version: 1.0
status: ready for grooming
derived-from: spec/core-spec.md (spec-blog-001 v1.0), intent/core-intent.md (intent-blog-001 v1.0)
companion: plan/core-plan.md (implementation steps and code)
last-reviewed: 2026-09-28
next-review: 2026-12-28
---

# Izzi Woot Blog — Ticket Backlog

23 tickets derived from the spec, numbered to match the 23 tasks in
[`plan/core-plan.md`](core-plan.md). **BLOG-n here is Task n there.** This document
holds scope, dependencies, and acceptance criteria; the plan holds the ordered TDD
steps and the actual code. An implementer needs both: groom from here, build from
there.

> **BLOG-22 is blocked on two human decisions** (spec §10.1, §10.2). It is the only
> ticket that cannot be started on technical grounds. Everything else is ready.

---

## Global constraints — apply to every ticket

A ticket is not done if it violates any of these, regardless of its own acceptance
criteria. Values copied verbatim from the spec.

| ID | Constraint |
| --- | --- |
| GC-1 | Node `>=20.11 <23`, pinned in `.nvmrc` and `engines`; must match the Cloudflare Pages build image |
| GC-2 | pnpm, version pinned via `packageManager`; CI installs `--frozen-lockfile` |
| GC-3 | `output: 'static'` — no SSR adapter, no API routes, no Cloudflare Functions (INV-1) |
| GC-4 | TypeScript `strict: true`; `astro check` blocking |
| GC-5 | Astro root is `site/`, never the repository root (INV-3 threat model) |
| GC-6 | Nothing under `policies/`, `frameworks/`, `audits/`, `templates/`, `intent/`, `spec/`, `plan/` reaches build output (INV-3) |
| GC-7 | No secrets in the deployed artifact; only `PUBLIC_*` and `SITE_URL` are public by design (INV-2) |
| GC-8 | No first-party framework JS. Only permitted runtime third parties: Giscus iframe, Cloudflare beacon (INV-4) |
| GC-9 | No `localStorage`, `sessionStorage`, or first-party cookies. Color scheme via `prefers-color-scheme` only |
| GC-10 | No `'unsafe-inline'` in `script-src`, ever |
| GC-11 | `trailingSlash: 'always'`; one canonical form per resource |
| GC-12 | A published `/blog/<slug>/` is never deleted or moved (INV-5) |
| GC-13 | Post slug is the filename; no `slug` front-matter key exists |
| GC-14 | Tag vocabulary is closed — the `TAGS` enum is the only source |
| GC-15 | `SITE_URL` required; build fails if unset or malformed |
| GC-16 | Third-party GitHub Actions pinned to a full commit SHA, never a tag |
| GC-17 | Original visual identity — no CSS, markup, or copy reproduced from the reference site |
| GC-18 | Every commit message ends with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` |
| GC-19 | One commit per ticket minimum; never batch two tickets into one commit |

---

## Backlog summary

| ID | Title | Depends on | Est | Labels |
| --- | --- | --- | --- | --- |
| BLOG-1 | Project scaffold and validated environment | — | M | `setup` `foundation` |
| BLOG-2 | Content schemas as a pure testable module | 1 | M | `content` `foundation` |
| BLOG-3 | Post selection, ordering, and tag grouping | 2 | M | `content` `foundation` |
| BLOG-4 | Slug convention and route-collision guard | 2 | S | `ci` `content` |
| BLOG-5 | Site config, SEO tags, base layout | 1, 3 | L | `seo` `foundation` |
| BLOG-6 | Original design system with verified contrast | 1, 5 | L | `design` `a11y` |
| BLOG-7 | Index route and post listing | 3, 5, 6 | M | `routes` |
| BLOG-8 | Post route, corrections, retraction | 5, 6, 7 | L | `routes` `editorial` |
| BLOG-9 | Tag index and per-tag routes | 3, 7 | S | `routes` |
| BLOG-10 | RSS feed | 3, 5, 7 | M | `routes` `discovery` |
| BLOG-11 | About, privacy, 404 pages | 5, 6 | M | `content` `privacy` |
| BLOG-12 | Sitemap, robots, canonical redirects | 7, 8, 10 | M | `discovery` |
| BLOG-13 | Image pipeline and inline-SVG diagrams | 6, 8 | M | `content` `a11y` |
| BLOG-14 | Giscus comments | 8 | S | `comments` `privacy` |
| BLOG-15 | Security headers and CSP verification | 8, 14 | L | `security` |
| BLOG-16 | Governance-leak assertions (INV-3) | 7 | L | `security` `governance` |
| BLOG-17 | Link, markdown, and formatting gates | 8, 9, 11, 12 | M | `ci` |
| BLOG-18 | Lighthouse budgets | 15, 17 | M | `ci` `perf` `a11y` |
| BLOG-19 | Secret scanning | — | M | `security` |
| BLOG-20 | Path-scoped CI workflows | 4, 15, 16, 17, 18, 19 | L | `ci` `governance` |
| BLOG-21 | Deploy to Cloudflare Pages | 20 | L | `deploy` `blocked-on-domain` |
| BLOG-22 | Branch protection and policy reconciliation | 20, 21 | M | `governance` `BLOCKED` |
| BLOG-23 | Launch verification | 21, 22 | M | `a11y` `governance` |

**Milestones.** M1 Foundation: 1–6. M2 Site renders: 7–14. M3 Gates green: 15–20.
M4 Live: 21–23.

**Critical path.** 1 → 2 → 3 → 5 → 7 → 8 → 15 → 20 → 21 → 22 → 23. BLOG-6, BLOG-19,
and BLOG-16 are parallelizable off the critical path; BLOG-19 depends on nothing at
all and can be done first if a post about real work is imminent.

---

## BLOG-1 — Project scaffold and validated environment

**Depends on:** — · **Blocks:** everything · **Est:** M · **Labels:** `setup` `foundation`

**Files:** `.nvmrc`; `site/package.json`, `site/tsconfig.json`, `site/astro.config.mjs`, `site/vitest.config.ts`, `site/src/env.d.ts`, `site/src/config/env.ts`; `site/tests/env.test.ts`

Stand up the Astro project under `site/` with a pinned toolchain and a **pure**
env-parsing module. `SITE_URL` must fail the build when missing rather than emitting
`undefined` into canonical URLs — wrong absolute URLs that get indexed are expensive
to unwind (spec §10.5).

**Acceptance criteria**
- [ ] `parseEnv` returns a normalised `Env` for valid input and strips a trailing slash from `siteUrl`
- [ ] `parseEnv` throws naming the offending variable when `SITE_URL` is absent, or is not an absolute http(s) URL
- [ ] `parseEnv` throws when any `PUBLIC_GISCUS_*` value is absent
- [ ] A missing `PUBLIC_CF_BEACON_TOKEN` yields `null`, not a throw — analytics is optional
- [ ] `astro.config.mjs` sets `output: 'static'`, `trailingSlash: 'always'`, `inlineStylesheets: 'never'`
- [ ] `tsconfig.json` sets `strict` and `noUncheckedIndexedAccess`

**Proof:** `cd site && pnpm vitest run tests/env.test.ts` → 6 passing; `pnpm check` → 0 errors.

**Reviewer note:** `inlineStylesheets: 'never'` looks cosmetic and is not — BLOG-15
proves the CSP fails without it.

---

## BLOG-2 — Content schemas as a pure testable module

**Depends on:** 1 · **Blocks:** 3, 4 · **Est:** M · **Labels:** `content` `foundation`

**Files:** `site/src/content/schema.ts`, `site/src/content/config.ts`, `site/src/content/authors/adilson-cesar.json`; `site/tests/schema.test.ts`

Define the blog and author Zod schemas so a malformed post **fails the build** rather
than reaching a reader (intent outcome #9). Schemas take their `image` helper as a
parameter and import nothing from `astro:content`, so Vitest can test every rule —
`astro:content` is a virtual module Vitest cannot resolve.

**Acceptance criteria**
- [ ] Title 10–70 chars, description 70–160 chars, both enforced at each boundary
- [ ] 1–4 tags from the closed `TAGS` enum; duplicates rejected with a message naming uniqueness
- [ ] `.strict()` rejects unknown front-matter keys, including a `slug` key (GC-13)
- [ ] `updatedDate` earlier than `pubDate` rejected; equal accepted
- [ ] `cover` is an object so an image **cannot** be expressed without `alt`; `alt` under 10 chars rejected
- [ ] `corrections[].note` and `retracted.reason` require ≥20 chars — a log entry must explain something
- [ ] Every `TAGS` member matches kebab-case; no member also appears in `RESERVED_SLUGS`

**Proof:** `cd site && pnpm vitest run tests/schema.test.ts` → 18 passing.

**Scope note:** `author` stays a plain string, **not** `reference('authors')` —
the reference would drag `astro:content` into the module and make the whole schema
untestable. BLOG-4 validates it against the authors directory instead.

---

## BLOG-3 — Post selection, ordering, and tag grouping

**Depends on:** 2 · **Blocks:** 5, 7, 9, 10 · **Est:** M · **Labels:** `content` `foundation`

**Files:** `site/src/lib/posts.ts`, `site/src/lib/format.ts`; `site/tests/posts.test.ts`, `site/tests/format.test.ts`

The single definition of what "published" means. Duplicating the draft filter across
route files is how a draft eventually leaks into RSS, so every listing, the feed, and
the sitemap consume these functions.

**Acceptance criteria**
- [ ] `selectPublished([])` returns `[]` — a fresh clone with every post drafted must not crash *(Review Focus 1)*
- [ ] Drafts excluded in production, included when `includeDrafts`
- [ ] A future-dated post is excluded from production and included with `includeDrafts`; a post dated exactly `now` is published *(Review Focus 4)*
- [ ] Order is `pubDate` descending; an identical `pubDate` breaks to `id` ascending, and reversing the input does not change the output *(Review Focus 5)*
- [ ] Input array is not mutated
- [ ] `selectListable` excludes retracted posts while `selectPublished` still yields them for routing (GC-12)
- [ ] `groupByTag` omits tags with zero posts entirely; a multi-tagged post appears under each tag
- [ ] `tagsWithCounts` sorts count descending then tag ascending
- [ ] `formatDate` uses UTC — a build-machine timezone cannot shift the printed day
- [ ] `readingTimeLabel` never reports under one minute

**Proof:** `cd site && pnpm vitest run tests/posts.test.ts tests/format.test.ts` → 21 passing.

---

## BLOG-4 — Slug convention and route-collision guard

**Depends on:** 2 · **Blocks:** 20 · **Est:** S · **Labels:** `ci` `content`

**Files:** `site/scripts/lib/filenames.mjs`, `site/scripts/check-filenames.mjs`; `site/tests/filenames.test.ts`; modify `site/package.json`

A post file named `tags.md` generates `/blog/tags/`, which is already the tag index.
Astro resolves the conflict by letting one win silently — the tag index vanishes in
production and nobody notices until a reader reports it *(Review Focus 2)*.

**Acceptance criteria**
- [ ] Non-kebab-case filenames rejected, naming the slug
- [ ] Extensions outside `.md`/`.mdx` rejected
- [ ] A slug in `RESERVED_SLUGS` rejected, and the message names the colliding route `/blog/tags/`
- [ ] Two files producing one slug (`a.md` + `a.mdx`) rejected
- [ ] A post naming an author with no record in `src/content/authors/` rejected
- [ ] All problems reported in one run, not just the first
- [ ] An empty or absent content directory passes
- [ ] A post *about* policy (`writing-policies-that-hold.md`) is **not** flagged — the guard must not be something the author fights

**Proof:** `pnpm vitest run tests/filenames.test.ts` → 8 passing; then `touch src/content/blog/tags.md && pnpm lint:content` → exit 1 naming the collision.

---

## BLOG-5 — Site config, SEO tag construction, base layout

**Depends on:** 1, 3 · **Blocks:** 7, 8, 9, 10, 11 · **Est:** L · **Labels:** `seo` `foundation`

**Files:** `site/src/config/site.ts`, `site/src/lib/seo.ts`, `site/src/components/SEO.astro`, `site/src/components/SkipLink.astro`, `site/src/layouts/BaseLayout.astro`; `site/tests/seo.test.ts`

One component owns every `<head>` metadata tag. A page that sets its own is a defect —
that is how one page ends up with a stale `og:url` (spec §4.5).

**Acceptance criteria**
- [ ] `absoluteUrl` handles a trailing-slash origin, a leading-slash-less path, and passes an already-absolute URL through
- [ ] Canonical is absolute; `canonicalUrl` front matter overrides it for cross-posts
- [ ] `og:url` and `og:image` are always absolute, never relative
- [ ] `article:published_time`/`modified_time` emitted as ISO 8601 for articles and **absent** for website pages
- [ ] `BlogPosting` JSON-LD for articles including `mainEntityOfPage`; `null` for website pages
- [ ] `noindex` tag emitted when requested — preview deploys must not compete with production (spec §10.5)
- [ ] Document title suffixed with the site name except on `/`
- [ ] An empty description throws rather than shipping a blank OG card
- [ ] `BaseLayout` renders the skip link first in tab order and emits the analytics beacon only when a token exists

**Proof:** `pnpm vitest run tests/seo.test.ts` → 15 passing; `pnpm check` → 0 errors.

---

## BLOG-6 — Original design system with machine-verified contrast

**Depends on:** 1 · **Blocks:** 7, 8, 11, 13 · **Est:** L · **Labels:** `design` `a11y`

**Files:** `site/src/styles/global.css`, `site/src/lib/contrast.ts`, `site/public/fonts/*.woff2`; `site/tests/contrast.test.ts`

Design tokens, type scale, and self-hosted subset fonts. Light and dark via
`prefers-color-scheme` with **no toggle**: a JS theme switch needs an inline blocking
script to avoid a flash of wrong theme, which would require `'unsafe-inline'` and
break GC-10.

**Acceptance criteria**
- [ ] `contrastRatio` returns 21 for black-on-white, 1 for identical colors, and is symmetric
- [ ] In **both** schemes: `--fg`, `--fg-muted`, and `--accent` each ≥4.5:1 against `--bg`
- [ ] In both schemes: `--fg` ≥4.5:1 against `--code-bg`; `--border` ≥3:1 against `--bg`
- [ ] Tests read token values **out of the stylesheet**, so a later color edit that breaks AA fails CI
- [ ] Fonts self-hosted as subset woff2 with `font-display: swap`; no font-CDN request anywhere (GC-8)
- [ ] `:focus-visible` outline is visible in both schemes
- [ ] `prefers-reduced-motion` honoured
- [ ] Typography, palette, and spacing are original — not the reference site's (GC-17)

**Proof:** `pnpm vitest run tests/contrast.test.ts` → 13 passing. **If a ratio fails, change the color, never the threshold.**

---

## BLOG-7 — Index route and post listing

**Depends on:** 3, 5, 6 · **Blocks:** 8, 9, 10, 12, 16 · **Est:** M · **Labels:** `routes`

**Files:** `site/src/lib/entries.ts`, `site/src/components/PostCard.astro`, `site/src/components/TagList.astro`, `site/src/pages/index.astro`, `site/src/content/blog/choose-boring-tools.md`; `site/tests/entries.test.ts`; modify `site/astro.config.mjs`

Reverse-chronological index with reading time. `entries.ts` is the **only** place
`getCollection('blog', …)` is called.

**Acceptance criteria**
- [ ] Every listable post rendered, newest first, with title link, `<time datetime>`, reading time, and tag links
- [ ] Zero published posts renders an explanatory sentence, not a blank page or a crash *(Review Focus 1)*
- [ ] `warnAboutFutureDated` names each future-dated post and stays silent when there are none
- [ ] `warnAboutVolume` fires at 60 published posts so pagination becomes a decision, not a surprise (FR-4a)
- [ ] Comment counts are **not** fetched per row — that would need a runtime request per post, breaking GC-8
- [ ] A real first post exists so downstream tickets have content to render

**Proof:** `pnpm vitest run tests/entries.test.ts` → 4 passing; `pnpm build && grep -q "min read" dist/index.html`.

---

## BLOG-8 — Post route, corrections, and retraction

**Depends on:** 5, 6, 7 · **Blocks:** 12, 13, 14, 15, 17 · **Est:** L · **Labels:** `routes` `editorial`

**Files:** `site/src/lib/status.ts`, `site/src/layouts/PostLayout.astro`, `site/src/pages/blog/[...slug].astro`; `site/tests/corrections.test.ts`, `site/tests/post-render.test.ts`; modify `site/astro.config.mjs`

The post template, plus the editorial protocol made structural: corrections are
append-only and a retraction never removes the URL (GC-12, FR-22…FR-25).

**Acceptance criteria**
- [ ] `postStatus` reports retraction, corrections, and whether to show an updated line; `updatedDate` equal to `pubDate` shows nothing
- [ ] `postStatus.latestChange` is the newest of pubDate, updatedDate, every correction, and the retraction date
- [ ] Retraction banner renders **before** the body with date and reason; body preserved; page still 200s
- [ ] Corrections render **after** the body, in array order, each dated
- [ ] Route uses `getPublishedPosts` (not `getListablePosts`) so a retracted post keeps its URL
- [ ] Exactly one `<h1>` per post page; body headings start at `<h2>` with stable `id`s
- [ ] Code highlighted at build time by Shiki; no `prism`/`highlight.js` in output
- [ ] **No first-party `<script src>` on a post page** — the mechanical enforcement of GC-8
- [ ] External links get `rel="noopener noreferrer"` and **no** `target="_blank"` (FR-13)

**Proof:** `pnpm vitest run tests/corrections.test.ts tests/post-render.test.ts` → 6 + 7 passing.

---

## BLOG-9 — Tag index and per-tag routes

**Depends on:** 3, 7 · **Blocks:** 12, 17 · **Est:** S · **Labels:** `routes`

**Files:** `site/src/pages/blog/tags/index.astro`, `site/src/pages/blog/tags/[tag].astro`; extend `site/tests/post-render.test.ts`

**Acceptance criteria**
- [ ] `/blog/tags/` lists every tag with ≥1 published post plus counts, and links each to its page
- [ ] `/blog/tags/<tag>/` lists that tag's posts in the same format as the index
- [ ] A tag in `TAGS` with zero published posts generates **no directory in `dist/`** and no sitemap entry (FR-16)
- [ ] Tag slugs are the enum members verbatim — no display-name transformation that could drift from the URL
- [ ] Empty state handled on the tag index

**Proof:** `pnpm vitest run tests/post-render.test.ts` → tag-routes block passing, including the assertion that unused tags emit nothing.

---

## BLOG-10 — RSS feed

**Depends on:** 3, 5, 7 · **Blocks:** 12, 17 · **Est:** M · **Labels:** `routes` `discovery`

**Files:** `site/src/lib/feed.ts`, `site/src/pages/feed.xml.ts`; `site/tests/feed.test.ts`

RSS 2.0, description-only. An unescaped `&` in one title invalidates the entire feed
and breaks every subscriber at once, silently *(Review Focus 3)*.

**Acceptance criteria**
- [ ] `toFeedItems([])` returns `[]`; `feedLastBuildDate([], fallback)` returns the fallback, never an `Invalid Date` *(Review Focus 1)*
- [ ] `link` and `guid` are identical absolute URLs with `isPermaLink="true"`
- [ ] `guid` and `pubDate` stay **stable when a post is corrected** — a changed guid re-surfaces the post for every reader
- [ ] Feed ships `description` only; no `content:encoded`, so no embedded HTML needs sanitizing
- [ ] `lastBuildDate` derives from the newest content change, **not** build wall-clock — an unchanged rebuild must not churn the feed
- [ ] Drafts and retracted posts absent
- [ ] Feed validates as XML with `&` and `<` present in a title, proven end-to-end against a built `dist/feed.xml`

**Proof:** `pnpm vitest run tests/feed.test.ts` → 9 passing; plus the escaping proof — inject `Tabs & spaces & other <holy> wars` as a title, rebuild, and `XMLValidator.validate` returns `true`.

---

## BLOG-11 — About, privacy, and 404 pages

**Depends on:** 5, 6 · **Blocks:** 12, 17 · **Est:** M · **Labels:** `content` `privacy`

**Files:** `site/src/components/Icon.astro`, `site/src/pages/about.astro`, `site/src/pages/privacy.astro`, `site/src/pages/404.astro`; extend `site/tests/post-render.test.ts`

`/privacy/` is a **v1 deliverable, not optional** (spec §10.4). The intent's "nothing
personal is collected" is imprecise: Cloudflare and GitHub both process reader IP
addresses, which are personal data under GDPR. The no-consent-banner conclusion
holds; the wording must be accurate.

**Acceptance criteria**
- [ ] `/about/` states the AI-assistance commitment in its load-bearing form: code samples executed, factual claims traced to a primary source
- [ ] `/about/` contains **no cadence claim** — omitted until Open Question 5 is answered; a test asserts no "every month"/"weekly" text (FR-21)
- [ ] `/about/` documents the corrections and retraction policy
- [ ] `/privacy/` names both processors (Cloudflare, GitHub), says IP addresses are processed, and explains why there is no cookie banner
- [ ] A test asserts `/privacy/` does **not** contain an over-claim like "nothing collected"
- [ ] Icons are inline SVG with no icon-font request; decorative icons `aria-hidden`
- [ ] `404.html` emitted and returns a real 404 at the edge

**Proof:** `pnpm vitest run tests/post-render.test.ts` → static-pages block passing, including both negative assertions.

---

## BLOG-12 — Sitemap, robots, and canonical redirects

**Depends on:** 7, 8, 10 · **Blocks:** 17 · **Est:** M · **Labels:** `discovery`

**Files:** `site/public/robots.txt`, `site/public/_redirects`; modify `site/astro.config.mjs`

**Acceptance criteria**
- [ ] `sitemap-index.xml` emitted; published posts listed; `/404` excluded
- [ ] **Retracted posts excluded from the sitemap** — `@astrojs/sitemap` cannot read front matter, so the exclusion list is generated at build time
- [ ] `robots.txt` allows all and points at the absolute sitemap URL
- [ ] `_redirects` 301s `/blog`, `/blog/`, `/tags/*`, `/feed`, `/rss.xml` to their canonical forms
- [ ] Both files ship to the output root
- [ ] **End-to-end retraction proof:** with `retracted` set, the post URL still resolves and shows the banner, while disappearing from the index, the feed, and the sitemap

**Proof:** `pnpm vitest run tests/post-render.test.ts` → discovery block passing; plus the retraction script printing `URL preserved`, `banner rendered`, and three `absent from …` lines with no `FAIL:`.

**Reviewer note:** a `FAIL:` line means a listing used `getPublishedPosts` where it
should have used `getListablePosts`.

---

## BLOG-13 — Image pipeline and inline-SVG diagrams

**Depends on:** 6, 8 · **Blocks:** — · **Est:** M · **Labels:** `content` `a11y`

**Files:** `site/src/components/Figure.astro`, `site/docs/diagrams.md`, `site/src/assets/.gitkeep`; extend `site/tests/post-render.test.ts`

**Implements a deliberate spec divergence (§10.8).** The intent said "Mermaid rendered
at build time"; build-time Mermaid normally drags a headless browser into CI — slow,
fragile, and a large dependency for a site whose premise is minimalism. Diagrams are
hand-authored inline SVG instead: diffable, zero-dependency, themeable with the same
custom properties, accessible via `<title>`/`<desc>`.

**Acceptance criteria**
- [ ] `Figure` emits AVIF + WebP with explicit dimensions and `loading="lazy"`/`decoding="async"` below the fold
- [ ] `alt` is required at the call site; `alt=""` is permitted but must be deliberate, not omitted
- [ ] A test asserts **no `<img>` in output lacks `alt`** and no raw `<img src="/…">` bypasses the pipeline
- [ ] MDX enabled so a post can use components; `.md` and `.mdx` both pass BLOG-4's checks
- [ ] `docs/diagrams.md` records the convention: `currentColor`/custom properties (a hard-coded `#000` is invisible in dark mode), `role="img"` with `<title>` and `<desc>`, `viewBox` without width/height

**Proof:** `pnpm vitest run tests/post-render.test.ts` → images block passing.

---

## BLOG-14 — Giscus comments

**Depends on:** 8 · **Blocks:** 15 · **Est:** S · **Labels:** `comments` `privacy`

**Files:** `site/src/components/Giscus.astro`; modify `site/src/styles/global.css`; extend `site/tests/post-render.test.ts`

**Human prerequisite:** enable Discussions, create an **Announcement**-type category
named `Comments`, install the Giscus app, read `repoId`/`categoryId` from giscus.app.
Announcement type means only maintainers start threads, so readers reply to posts
rather than opening arbitrary discussions.

**Implements spec §10.3.** Giscus is third-party JS, so a post page is not JS-free.
GC-8 is scoped to *first-party framework* JS with Giscus as a named, bounded
exception — lazy, below the fold, post pages only.

**Acceptance criteria**
- [ ] Embedded on post pages with `data-mapping="pathname"` and `data-strict="1"` so a near-miss path cannot attach to the wrong thread
- [ ] `data-loading="lazy"`; vertical space reserved so the iframe cannot shift layout (FR-35)
- [ ] `data-theme="preferred_color_scheme"` — matches GC-9's JS-free scheme handling with nothing to sync
- [ ] Reactions and metadata emission disabled — no data we do not use
- [ ] **Absent** from the index, tag pages, `/about/`, `/privacy/`, and 404
- [ ] Visible prose tells readers without a GitHub account how to reach the author — the spec accepts that exclusion, so the page should say so
- [ ] A post page loads **exactly two** third-party origins: `giscus.app` and `static.cloudflareinsights.com`

**Proof:** `pnpm vitest run tests/post-render.test.ts` → comments block passing. The origin-count assertion is the guard on the whole third-party posture: any future CDN breaks it immediately. **If it fails, remove the CDN — do not update the expectation.**

---

## BLOG-15 — Security headers and CSP verification

**Depends on:** 8, 14 · **Blocks:** 18, 20 · **Est:** L · **Labels:** `security`

**Files:** `site/public/_headers`, `site/scripts/lib/headers.mjs`, `site/scripts/assert-headers.mjs`; `site/tests/headers.test.ts`; modify `site/package.json`

A CSP that silently blocks the comments widget is worse than no comments; a CSP that
quietly permits `'unsafe-inline'` is worse than no CSP. Neither failure appears in a
build log, so both are asserted.

**Acceptance criteria**
- [ ] `checkCsp` rejects `'unsafe-inline'`, `'unsafe-eval'`, a wildcard fetch source, an `http://` origin, and a missing `default-src`/`base-uri`/`object-src`/`frame-ancestors`/`form-action`
- [ ] `checkCsp` rejects a policy that would block `https://giscus.app`
- [ ] The committed `_headers` passes every rule
- [ ] HSTS `max-age=63072000` with `includeSubDomains` and `preload`; `nosniff`; `strict-origin-when-cross-origin`; a `Permissions-Policy`
- [ ] Fonts and `/_astro/*` immutable for a year; `/feed.xml` cached 1 hour
- [ ] `assert-headers.mjs` fails on a missing `dist/_headers`, on any inline `<script>` with executable content, and on any inline `<style>` — JSON-LD `<script type="application/ld+json">` correctly exempted as data
- [ ] **Negative proof:** flipping `inlineStylesheets` to `'always'` makes `verify:headers` exit 1

**Proof:** `pnpm vitest run tests/headers.test.ts` → 16 passing; `pnpm build && pnpm verify:headers` → passes; the `inlineStylesheets` flip → exit 1; reverting → passes again.

---

## BLOG-16 — Governance-leak assertions (INV-3)

**Depends on:** 7 · **Blocks:** 20 · **Est:** L · **Labels:** `security` `governance`

**Files:** `site/scripts/lib/leaks.mjs`, `site/scripts/assert-no-governance-leak.mjs`, `templates/policy.md`, `site/.output-baseline.json`; `site/tests/leaks.test.ts`; modify `site/package.json`

**The most durable safeguard in the build.** A path-based rule passes the moment
someone moves the Astro root, edits a content glob, or adds a `publicDir` alias. A
content sentinel catches the leak regardless of how it happened (spec §7.4).

**Acceptance criteria**
- [ ] A governance directory name anywhere in an output path fails with `forbidden-path`
- [ ] **A governance document published under a disguised path fails via the content sentinel** — the assertion that survives a refactor
- [ ] `.env`/`.pem`/`.key`/`.sqlite` in output fails; private-key material fails regardless of filename
- [ ] Output growing >10× in file count or bytes versus the committed baseline fails as `volume-drift`
- [ ] All leaks reported per run
- [ ] **A post that merely discusses policy as a topic is not flagged** — a guard the author has to fight is a guard that gets disabled
- [ ] `templates/policy.md` carries the `publication:` sentinel, seeding the convention every governance file must follow

**Proof:** `pnpm vitest run tests/leaks.test.ts` → 7 passing; then plant a sentinel file in `dist/` two ways (governance path, then disguised path) and confirm `verify:output` exits 1 with the right `kind` each time, and passes after cleanup.

---

## BLOG-17 — Link, markdown, and formatting gates

**Depends on:** 8, 9, 11, 12 · **Blocks:** 18, 20 · **Est:** M · **Labels:** `ci`

**Files:** `lychee.toml`, `site/.markdownlint-cli2.jsonc`, `site/.prettierrc.json`, `site/.prettierignore`; modify `site/package.json`

Internal links block; external links never do (spec §10.7). A blocking external check
fails your pipeline because **someone else's** server had a bad minute.

**Acceptance criteria**
- [ ] `lychee` runs offline with `include-fragments = true` and excludes all `https?://` — internal only
- [ ] A broken internal link fails; **a broken heading anchor also fails** — the subtler rot, and the reason fragments are enabled
- [ ] `markdownlint` covers content and docs with line-length and inline-HTML rules off (inline HTML is required for diagrams)
- [ ] Prettier checks code but **not** Markdown prose — reflowing an author's prose produces noise on every save
- [ ] A single `verify` script chains: check → lint:content → lint:md → format:check → test → build → verify:headers → verify:output → lint:links

**Proof:** `pnpm verify` passes end to end; then break an internal link → exit 1; restore; break an anchor → exit 1; restore.

---

## BLOG-18 — Lighthouse budgets

**Depends on:** 15, 17 · **Blocks:** 20 · **Est:** M · **Labels:** `ci` `perf` `a11y`

**Files:** `lighthouserc.json`, `audits/<date>-launch-baseline.md`; modify `site/package.json`

**Acceptance criteria**
- [ ] Performance ≥0.95 and accessibility =1.0, median of 3 runs, mobile emulation, on `/`, a post, `/blog/tags/`, `/about/`
- [ ] LCP <1500 ms and CLS <0.02 asserted as errors
- [ ] `canonical` and `is-crawlable` skipped with the reason recorded — the static-dist server has no real origin, so both false-positive; the real canonical is asserted in BLOG-8 and the live headers in BLOG-21
- [ ] `uses-long-cache-ttl` off — caching lives in `_headers`, which the static server does not apply
- [ ] The measured numbers are **written into `audits/<date>-launch-baseline.md`**; an empty table fails review

**Proof:** `pnpm lint:lighthouse` → all four URLs pass, with the filled baseline table committed.

**Reviewer note (spec §10.6):** 100 is a floor, not a WCAG conformance claim —
automated tooling covers roughly a third of the criteria. **If accessibility is below
1.0, fix the markup; never lower the threshold.** BLOG-23 adds the manual pass this
gate cannot replace.

---

## BLOG-19 — Secret scanning

**Depends on:** — · **Blocks:** 20 · **Est:** M · **Labels:** `security`

**Files:** `.gitleaks.toml`, `.husky/pre-commit`; modify `site/package.json`

**The highest-likelihood risk in the whole project** (spec failure-mode table, row 1).
A public repository plus posts about real systems is a likelier breach path than
anything happening to the site. Git history is permanent, so the remediation for a
leak is **rotation**, never a revert commit.

**Do this ticket early** if a post about real work is imminent — it depends on nothing.

**Acceptance criteria**
- [ ] gitleaks extends the default ruleset; `PUBLIC_*` identifier **names** are allowlisted without allowlisting arbitrary values near them
- [ ] A custom `disclosure` rule exists for internal hostnames and client names, with the real strings filled in — generic rules catch API keys; nothing generic catches a client's name in a war story
- [ ] Pre-commit hook scans staged changes and prints the **rotate, don't revert** message on a hit
- [ ] The hook warns rather than fails when gitleaks is absent, so a fresh clone is not bricked; CI is the blocking gate
- [ ] `gitleaks detect` over full history reports 0
- [ ] **Negative proof:** staging a fake AWS key and committing is rejected

**Proof:** the fake-key commit is refused with the rotation message; `gitleaks detect --config .gitleaks.toml` → 0 leaks.

---

## BLOG-20 — Path-scoped CI workflows

**Depends on:** 4, 15, 16, 17, 18, 19 · **Blocks:** 21 · **Est:** L · **Labels:** `ci` `governance`

**Files:** `.github/workflows/site.yml`, `governance.yml`, `security.yml`, `links-weekly.yml`, `.github/dependabot.yml`, `scripts/check-governance-frontmatter.mjs`

This is what makes the monorepo decision defensible: a typo fix in a post must not
demand a security-owner review, and a policy change must not be a direct push
(spec §7.1, §10.9).

**Acceptance criteria**
- [ ] `site.yml` path-filtered to `site/**` and runs the full verify chain plus Lighthouse
- [ ] `governance.yml` path-filtered to governance trees; validates required front matter **and the publication sentinel** — without it, BLOG-16's test has nothing to find
- [ ] An overdue `next-review` date **fails** the governance job: an annual review nothing enforces does not happen
- [ ] `security.yml` has **no path filter** and `fetch-depth: 0` — a secret can be committed to any path and may be older than the PR
- [ ] `links-weekly.yml` checks external links with `fail: false` and opens an issue on rot
- [ ] Dependabot covers npm **and github-actions** — the latter is what keeps SHA-pinned actions from aging into unpatched versions
- [ ] **Every third-party action pinned to a full SHA**; `grep -rn "uses:.*@v[0-9]" .github/workflows/` finds nothing (GC-16)
- [ ] **Proven with a throwaway PR:** a governance-only change runs `governance` + `security` and **not** `site`; a `site/`-only change runs `site`

**Proof:** `gh pr checks --watch` on the throwaway PR shows the expected job set for each change shape; the `grep` for unpinned actions returns nothing.

---

## BLOG-21 — Deploy to Cloudflare Pages

**Depends on:** 20 · **Blocks:** 22, 23 · **Est:** L · **Labels:** `deploy` `blocked-on-domain`

**Files:** modify `site/public/robots.txt`, `site/src/content/authors/adilson-cesar.json`; create `docs/runbook-deploy.md`

**Blocked on Open Question 1 (domain).** Everything before this ticket runs without it.

**Acceptance criteria**
- [ ] Pages project: root `site`, output `site/dist`, production branch `main`, Node from `.nvmrc`
- [ ] Build-time env set for production **and** preview; `SITE_URL` is the production origin in production
- [ ] Path-filtered builds enabled so a governance-only commit does not deploy; fallback guard `git diff --quiet HEAD^ HEAD -- site/ && exit 0` if unavailable
- [ ] Custom domain attached, certificate issued, Always Use HTTPS on, Web Analytics enabled
- [ ] Registrar auto-renew on, **with a contact address not hosted on this domain** — a renewal notice that dies with the domain is not a notice
- [ ] Every `REPLACE` placeholder gone; a grep proves it
- [ ] **Verified on the live origin with curl, not in the build output:** CSP served with the giscus frame source, HSTS, nosniff, correct absolute canonical, three 301 redirects, a real 404
- [ ] **Production emits no `robots` noindex; a preview deploy does** — the check people skip, then wonder why a `pages.dev` URL outranks their blog
- [ ] Giscus loads on the live origin with **no CSP violation in the console** (manual, spec §7.3)
- [ ] `docs/runbook-deploy.md` covers publish, rollback, leaked credential, correction, retraction

**Proof:** the curl block prints every expected header and status; the preview/production noindex comparison behaves as specified.

---

## BLOG-22 — Branch protection and policy reconciliation · **BLOCKED**

**Depends on:** 20, 21 · **Blocks:** 23 · **Est:** M · **Labels:** `governance` `BLOCKED`

**Files:** `policies/change-management.md`, `audits/<date>-branch-protection.md`; modify `.github/workflows/governance.yml`

### Blocked on two human decisions — do not start, do not guess

**1. Spec §10.1 — branch protection cannot be path-scoped.** GitHub's required-PR and
required-approval settings are scoped to a *branch*, not to changed paths. One `main`
cannot require reviewed PRs for `policies/` while allowing direct pushes for posts.
Rulesets can *block* pushes touching given paths, but that is a blanket block, not a
conditional review requirement — and availability by plan and visibility is
**unverified**. Recommended **Option A**: PR-only for all of `main`, with a required
status check that inspects changed paths and applies the stricter gate.

**2. Spec §10.2 — "at least one reviewer" is unsatisfiable with one human.** GitHub
forbids self-approval. Requiring one approval makes every governance change
permanently unmergeable, unless admin bypass is used on every merge — which makes the
control decorative while appearing enforced. That is **worse than no control**,
because it misleads the auditor the control exists for. Recommended: require zero
approvals plus a PR and passing checks, **and amend the policy text to say so.**

**Acceptance criteria**
- [ ] Ruleset path-restriction capability **verified against the live API** (`gh api repos/:owner/:repo/rulesets`) and the result recorded — this is where the spec's unverified claim gets settled
- [ ] Protection configured per the chosen option; required checks named explicitly
- [ ] **A direct push to `main` is proven to be rejected** — if it succeeds, everything the policy claims is false
- [ ] Governance-path PRs require a substantive PR body, enforced by CI: the recorded rationale *is* the control
- [ ] `policies/change-management.md` **no longer says "at least one reviewer from the security owner group"** — with one maintainer that sentence is false, and leaving it is a documentation defect an auditor will find
- [ ] The amended text states the control is the recorded trail and names the condition under which the approval requirement rises to one
- [ ] `audits/<date>-branch-protection.md` records the decision, the verified capability, the live configuration, and the accepted limits — zero approvals, `enforce_admins: false`, and mixed `git log` (spec §10.9)
- [ ] Merged **via a PR**, which is itself the first evidence the process works

**Proof:** the protection API returns the intended configuration; the direct-push attempt is rejected; both artifacts committed through a PR.

---

## BLOG-23 — Launch verification

**Depends on:** 21, 22 · **Blocks:** — · **Est:** M · **Labels:** `a11y` `governance`

**Files:** `audits/<date>-launch-verification.md`; modify `audits/<date>-launch-baseline.md`

**The checks no CI can make** (spec §10.6). A Lighthouse accessibility score of 100 is
compatible with keyboard traversal that makes no sense and alt text that is
technically present and functionally useless. This is where a human looks.

**Acceptance criteria**
- [ ] **Keyboard-only traversal**, mouse untouched: skip link first and visible on focus, focus order matches visual order, nothing reachable-but-invisible, overflowing code blocks keyboard-scrollable
- [ ] **Screen-reader read-through** of one full post: single `<h1>`, no skipped heading levels, meta reads as information not punctuation soup, alt text meaningful, corrections section announced with its heading
- [ ] **400% zoom and 320px width** in both color schemes: no horizontal scroll, no clipping, no overlap
- [ ] **Rollback rehearsed** against production with elapsed time recorded — a procedure first attempted during an incident is not a procedure
- [ ] `audits/<date>-launch-verification.md` records automated and manual results separately
- [ ] The record contains an **honest conformance statement**: score plus manual checks passed is *not* a claim of full WCAG 2.2 AA conformance
- [ ] Deferred items listed **with triggers**: pagination at 60 posts, search at ~30, newsletter, headless CSP smoke test, Portuguese
- [ ] The launch-baseline performance table is filled with measured numbers

**Proof:** both audit files committed via PR, every table row filled, no blank cells.

---

## Open items carried from the spec

These are decisions, not tickets. Each blocks the ticket named.

| # | Question | Blocks | Owner |
| --- | --- | --- | --- |
| 1 | Domain — registered, or to purchase? | BLOG-21 | Adilson |
| 2 | Repository rename `prodution` → `production` — free today, permanent once in a Pages config and deploy logs | BLOG-21 | Adilson |
| 3 | Spec §10.1 branch-protection option | BLOG-22 | Adilson |
| 4 | Spec §10.2 approval requirement + policy amendment | BLOG-22 | Adilson |
| 5 | Launch tag vocabulary — tags are URLs, so a rename breaks links | BLOG-2 | Adilson |
| 6 | Publishing cadence claim | BLOG-11 (FR-21) | Adilson |
| 7 | Portuguese later? The one deferred item with a real cost of delay — it would change the URL scheme | BLOG-9 if yes | Adilson |

Items 5 and 7 touch URLs. Deciding them after BLOG-9 ships means breaking published
links, so they are cheapest to settle now.

---

*Derived from `spec/core-spec.md` (spec-blog-001 v1.0) and `intent/core-intent.md`
(intent-blog-001 v1.0) on 2026-09-28, aligned one-to-one with the 23 tasks in
`plan/core-plan.md`. Acceptance criteria are the plan's proof-of-completion criteria
restated as reviewable gates; the plan holds the steps and code.*
