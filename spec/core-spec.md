---
id: spec-blog-001
owner: Adilson Cesar
version: 1.0
status: draft — for engineering review
derived-from: intent/core-intent.md (intent-blog-001 v1.0)
last-reviewed: 2026-09-28
next-review: 2026-12-28
---

# Core Spec — Izzi Woot Blog

Formal technical specification derived from [`intent/core-intent.md`](../intent/core-intent.md).
Authored for direct hand-off to an implementing engineer or agent.

> **Read [§10 Areas of Concern](#10-areas-of-concern) before estimating.** Five of the
> intent document's constraints **cannot all be satisfied simultaneously as literally
> written**. §10 states each contradiction, why it is unsatisfiable, and the resolution
> this spec adopts. Two require a human decision before implementation starts (§10.1,
> §10.2). Do not silently resolve them in code.

---

## 1. Scope

### 1.1 In scope (v1)

A statically generated, zero-backend blog built with Astro, published from `site/`
in this repository to Cloudflare Pages. Reverse-chronological index, tag index
pages, individual post pages, an `/about` page, RSS, sitemap, Giscus comments,
cookieless analytics, and CI gates enforcing build, schema, link, accessibility,
performance, and secret-scanning budgets.

### 1.2 Out of scope (v1 — do not build)

Full-text search, email/newsletter capture, any CMS or admin UI, i18n/multi-language
routing, multi-author support beyond a single configured author record, cron or
date-based scheduled publishing, any server-side runtime, any database, any
authenticated surface.

### 1.3 Architectural invariants

These are non-negotiable and every change must preserve them:

| ID | Invariant |
| --- | --- |
| **INV-1** | **No server runtime.** Output is static files. `output: 'static'`. No SSR adapter, no API routes, no Cloudflare Functions, no `/functions` directory. |
| **INV-2** | **No secrets in the deployed artifact.** Build output contains no credentials. All identifiers embedded in HTML (giscus repo id, analytics token) are public by design. |
| **INV-3** | **Governance content never ships.** No file under `policies/`, `frameworks/`, `audits/`, `templates/`, or `intent/` may appear in build output. Enforced by test, not convention (§7.4). |
| **INV-4** | **No first-party JavaScript on a text post** beyond the two documented third-party embeds (§10.3, §10.4). No UI framework runtime. |
| **INV-5** | **URLs are permanent.** A published `/blog/<slug>/` is never deleted or moved. Retraction changes content, never the path (§6.5). |

---

## 2. Repository and Build Topology

### 2.1 Directory layout

```
/
├─ intent/core-intent.md          # governing intent (this spec derives from it)
├─ spec/core-spec.md              # this document
├─ policies/                      # governance — NEVER published (INV-3)
├─ frameworks/                    # control mappings — NEVER published
├─ audits/                        # audit evidence — NEVER published
├─ templates/                     # policy templates — NEVER published
├─ .github/workflows/
│  ├─ site.yml                    # site build + quality gates
│  ├─ governance.yml              # policy lint / front-matter checks
│  └─ security.yml                # gitleaks (runs on ALL paths)
└─ site/                          # Astro application — the ONLY publishable tree
   ├─ astro.config.mjs
   ├─ package.json
   ├─ tsconfig.json
   ├─ public/
   │  ├─ _headers                 # Cloudflare Pages response headers (§5.4)
   │  ├─ _redirects               # Cloudflare Pages redirects (§4.3)
   │  ├─ fonts/                   # self-hosted woff2 — no font CDN
   │  └─ robots.txt
   └─ src/
      ├─ content/
      │  ├─ config.ts             # collection schemas (§3)
      │  └─ blog/<slug>.md        # posts — filename IS the URL slug
      ├─ assets/                  # images processed at build time
      ├─ components/
      ├─ layouts/
      ├─ pages/                   # route definitions (§4)
      ├─ styles/
      └─ config/site.ts           # single source of site-wide config (§3.4)
```

**Rule:** the Astro root is `site/`, never the repository root. At the root, the
content globber would match `policies/**/*.md` and publish governance documents.
This is INV-3's primary threat model, not a stylistic preference.

### 2.2 Toolchain

| Component | Version constraint | Note |
| --- | --- | --- |
| Node.js | `>=20.11 <23` — pinned via `.nvmrc` and `engines` | Must match the Cloudflare Pages build image |
| Package manager | `pnpm`, version pinned via `packageManager` field | Lockfile committed; CI uses `--frozen-lockfile` |
| Astro | `^5` | `output: 'static'` |
| TypeScript | `strict: true` | `astro check` is a blocking gate |

### 2.3 Build and deploy

| Setting | Value |
| --- | --- |
| Pages root directory | `site` |
| Build command | `pnpm install --frozen-lockfile && pnpm build` |
| Build output directory | `site/dist` |
| Production branch | `main` |
| Preview deployments | every PR branch |
| Build-time env | `SITE_URL`, `PUBLIC_GISCUS_*`, `PUBLIC_CF_BEACON_TOKEN` (§3.4) |

Cloudflare Pages must be configured to **skip builds when no file under `site/`
changed** (path-filtered builds), so a policy-only commit does not trigger a site
deployment. If path filtering is unavailable on the plan in use, the build script
exits `0` early after a `git diff --quiet HEAD^ HEAD -- site/` check.

---

## 3. Data Models

There is no database. All state is files in git, typed and validated at build time.
A schema violation **fails the build** (intent outcome #9).

### 3.1 `blog` collection schema

`site/src/content/config.ts`:

```ts
import { defineCollection, reference, z } from 'astro:content';

/** Lowercase kebab-case, the shape enforced on both slugs and tags. */
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Closed tag vocabulary. Adding a member is a deliberate, reviewed change:
 *  tags are URLs (§4.1), so a rename breaks published links (INV-5). */
export const TAGS = [
  'ai', 'llm', 'architecture', 'devops', 'security', 'career', 'tooling',
] as const;

const blog = defineCollection({
  type: 'content',
  schema: ({ image }) =>
    z
      .object({
        /** 10–70 chars. <h1> and <title>; over ~70 truncates in SERPs. */
        title: z.string().min(10).max(70),

        /** 70–160 chars. Required — drives <meta description> and og:description.
         *  Absent, the OG card renders blank; hence required, not optional. */
        description: z.string().min(70).max(160),

        /** First publication date. Immutable once published. */
        pubDate: z.coerce.date(),

        /** Set ONLY on material revision. Renders "Updated <date>". */
        updatedDate: z.coerce.date().optional(),

        /** 1–4 tags from the closed vocabulary; unique; first is primary. */
        tags: z.array(z.enum(TAGS)).min(1).max(4)
          .refine((t) => new Set(t).size === t.length, 'tags must be unique'),

        /** true ⇒ excluded from production build, included in dev and preview. */
        draft: z.boolean().default(false),

        /** Optional social/hero image. If present, alt text is MANDATORY —
         *  the pair is modelled as an object so one cannot exist without the other. */
        cover: z
          .object({
            src: image(),
            alt: z.string().min(10, 'alt text must be meaningful, not a filename'),
          })
          .optional(),

        /** Canonical elsewhere (cross-post). Emits rel="canonical" off-site. */
        canonicalUrl: z.string().url().optional(),

        /** Append-only correction log. Never edit or remove an entry (§6.5). */
        corrections: z
          .array(z.object({ date: z.coerce.date(), note: z.string().min(20) }))
          .optional(),

        /** Set when retracted. Post remains reachable; body is banner-prefixed. */
        retracted: z
          .object({ date: z.coerce.date(), reason: z.string().min(20) })
          .optional(),

        author: reference('authors').default('adilson-cesar'),
      })
      .strict() // unknown front-matter keys fail the build (catches typos)
      .refine(
        (d) => !d.updatedDate || d.updatedDate >= d.pubDate,
        'updatedDate cannot precede pubDate',
      ),
});
```

**Slug rule:** the filename is the slug. No `slug` front-matter override — a
front-matter slug lets the URL drift from the filename, and INV-5 makes URL drift
a defect. Filenames must match `KEBAB` (enforced in §7.2).

### 3.2 `authors` collection schema

```ts
const authors = defineCollection({
  type: 'data',
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      /** Shown on the byline; not a bio paragraph. */
      title: z.string().optional(),
      avatar: z.object({ src: image(), alt: z.string().min(5) }).optional(),
      links: z
        .array(z.object({
          label: z.string(),
          href: z.string().url(),
          icon: z.enum(['github', 'linkedin', 'x', 'rss', 'email']),
        }))
        .default([]),
    }),
});

export const collections = { blog, authors };
```

`site/src/content/authors/adilson-cesar.json` is the single seeded record.

### 3.3 Derived data (computed, never authored)

| Datum | Derivation | Consumed by |
| --- | --- | --- |
| `readingTime` | `remark-reading-time` on the raw Markdown body → minutes, `Math.max(1, round(…))` | index, tag pages, post header |
| Tag → posts index | Group published posts by `tags` | `/blog/tags/` and `/blog/tags/<tag>/` |
| Tag counts | Length of each group | tag list ordering |
| `publishedPosts` | `getCollection('blog', p => import.meta.env.DEV \|\| !p.data.draft)` | every listing, RSS, sitemap |
| Sort order | `pubDate` descending, `id` ascending as deterministic tiebreak | all listings, RSS |

`publishedPosts` is defined **once** in `src/lib/posts.ts` and imported everywhere.
Duplicating the draft filter is how a draft eventually leaks into RSS.

### 3.4 Site configuration contract

`site/src/config/site.ts` — the only place these values are read:

```ts
export const site = {
  /** Publication name (Izzi Woot); author byline comes from the authors record. */
  name: 'Izzi Woot',
  tagline: 'Notes on software, systems, and AI.',
  /** Absolute origin, no trailing slash. See §10.5 — build fails if unresolved. */
  url: import.meta.env.SITE_URL,
  defaultLocale: 'en',
  giscus: {
    repo: import.meta.env.PUBLIC_GISCUS_REPO,
    repoId: import.meta.env.PUBLIC_GISCUS_REPO_ID,
    category: 'Comments',
    categoryId: import.meta.env.PUBLIC_GISCUS_CATEGORY_ID,
  },
  analyticsToken: import.meta.env.PUBLIC_CF_BEACON_TOKEN,
} as const;
```

Env vars are validated at build start; a missing or malformed value **fails the
build** rather than emitting a site with `undefined` in its canonical URLs.

### 3.5 Migration / change management for schema

Content schema changes are breaking changes to existing posts. Required procedure:

1. Add the field as `.optional()` or with `.default()`.
2. Backfill existing posts in the same PR.
3. Tighten to required in a **follow-up** PR, once backfill is verified.

Never add a required field and backfill in one commit — a partially backfilled
tree cannot build, which blocks any unrelated hotfix until backfill completes.

---

## 4. Route Interfaces

A static site has no HTTP API. The interface contract is its **route surface**:
every path, its generator, its response, and its headers. All routes are `GET`
(and `HEAD`); any other method is answered by Cloudflare's edge, not by us.

### 4.1 Route table

| Path | Source | Type | Response | Notes |
| --- | --- | --- | --- | --- |
| `/` | `pages/index.astro` | static | 200 HTML | Reverse-chron list of **all** published posts, no pagination in v1. Add pagination at >60 posts. |
| `/blog/<slug>/` | `pages/blog/[...slug].astro` | `getStaticPaths` over `publishedPosts` | 200 HTML | Canonical post URL. Trailing slash required (§4.2). |
| `/blog/tags/` | `pages/blog/tags/index.astro` | static | 200 HTML | All tags with post counts. |
| `/blog/tags/<tag>/` | `pages/blog/tags/[tag].astro` | `getStaticPaths` over `TAGS` **that have ≥1 published post** | 200 HTML | An empty tag must not generate a page (thin content, and it would 200 with nothing). |
| `/about/` | `pages/about.astro` | static | 200 HTML | Bio, contact, **AI-assistance disclosure (§6.4)**, correction policy link. |
| `/feed.xml` | `pages/feed.xml.ts` | endpoint | 200 `application/rss+xml` | RSS 2.0 via `@astrojs/rss`. §4.4. |
| `/sitemap-index.xml` | `@astrojs/sitemap` | integration | 200 XML | Excludes drafts and 404. Referenced from `robots.txt`. |
| `/robots.txt` | `public/robots.txt` | static | 200 text | `Allow: /`, plus `Sitemap:` absolute URL. |
| `/404.html` | `pages/404.astro` | static | **404** HTML | Cloudflare Pages serves this automatically for unmatched paths. |

### 4.2 URL normalization

- `trailingSlash: 'always'` in `astro.config.mjs`.
- Exactly one canonical form per resource; every other form 301s to it (§4.3).
- Every page emits `<link rel="canonical" href="{absolute canonical}">`.
- Slug is derived from filename only (§3.1). No `/blog/<year>/...`, ever (INV-5).

### 4.3 Redirects (`site/public/_redirects`)

```
# Legacy/alternate shapes → canonical. 301 = permanent, cacheable.
/blog            /                 301
/blog/           /                 301
/tags/*          /blog/tags/:splat 301
/feed            /feed.xml         301
/rss.xml         /feed.xml         301
```

`/blog` redirects to `/` because in v1 the index **is** the blog; if a distinct
`/blog/` listing is introduced later, this line is removed, not repointed.

### 4.4 Feed contract

`/feed.xml` — RSS 2.0. Required per-item fields: `title`, `link` (absolute),
`guid` (absolute URL, `isPermaLink="true"`), `pubDate` (RFC-822), `description`.

- **Ships `description` only — never full post content.** Full-content feeds must
  sanitize embedded HTML for every consumer; the description is plain text and
  cannot carry an injection payload. This is a deliberate reader-convenience-for-
  safety trade, recorded here so it is not "fixed" later without thought.
- Channel `<atom:link rel="self">` = absolute feed URL.
- Drafts and retracted posts are excluded. A **correction does not** re-issue an
  item: `guid` is stable, so feed readers must not re-surface a corrected post as
  new.
- `<lastBuildDate>` = most recent `updatedDate ?? pubDate`, not build wall-clock —
  otherwise every deploy churns the feed.

### 4.5 Per-page metadata contract

Every route emits, without exception: `<title>`, `<meta name="description">`,
`rel=canonical`, `og:title`, `og:description`, `og:url`, `og:type`
(`article` for posts, `website` otherwise), `og:image` (absolute), `twitter:card`,
and for posts `article:published_time` plus `article:modified_time` when present.
Posts additionally emit JSON-LD `BlogPosting` (headline, datePublished,
dateModified, author, publisher, mainEntityOfPage).

A shared `<SEO>` component owns all of it. A page that sets these tags itself is a
defect — that is how one page ends up with a stale `og:url`.

---

## 5. Client State and Security Protocols

### 5.1 State inventory

Static site, no session, no auth, no server state. The **complete** client state:

| State | Mechanism | Persistence | Justification |
| --- | --- | --- | --- |
| Color scheme | `@media (prefers-color-scheme)` in CSS — **no toggle, no JS, no storage** | OS-level | A JS theme toggle needs an inline blocking script to avoid a flash-of-wrong-theme, breaking INV-4. Honour the OS setting instead. |
| Mobile nav disclosure | `<details>`/`<summary>` or a CSS `:target` pattern — **no JS** | none | The reference site uses an `onclick` handler; a native disclosure element is keyboard-accessible and screen-reader-announced for free. |
| Giscus thread | third-party iframe (§10.3) | GitHub-side | State lives in GitHub Discussions; the page holds none of it. |
| Analytics beacon | Cloudflare script (§10.4) | none (cookieless) | No identifier is stored client-side. |

**No `localStorage`, no `sessionStorage`, no cookies are set by first-party code.**
Introducing any of them requires revisiting §5.5 and §10.4, because it may create
a consent obligation.

### 5.2 Trust boundaries

| Boundary | Direction | Control |
| --- | --- | --- |
| Author → repository | write | GitHub auth + 2FA; branch protection (§10.1); gitleaks pre-commit + CI |
| Repository → Cloudflare build | read | Pages GitHub App, least privilege, repo-scoped |
| Build → public internet | publish | INV-3 output assertion (§7.4); no secrets in artifact (INV-2) |
| Reader → site | read-only | Static files. No input is accepted anywhere. |
| Reader → Giscus | read/write | Delegated wholly to GitHub auth and moderation |

The site accepts **no reader input** — no forms, no query-param-driven rendering,
no `innerHTML` from any source. The classic web vulnerability classes (injection,
XSS via user input, CSRF, IDOR, SSRF, deserialization) have **no reachable
surface**, because there is no code path that processes untrusted input at runtime.
The realistic risks are therefore (a) supply chain, (b) secret leakage, and
(c) publishing something that should not be public — §5.3, §5.5, §7.

### 5.3 Supply-chain controls

| Control | Requirement |
| --- | --- |
| Lockfile | `pnpm-lock.yaml` committed; CI installs `--frozen-lockfile`. A build that would mutate the lockfile fails. |
| Dependency review | Dependabot weekly, grouped minor/patch. Major bumps reviewed by hand. |
| Audit gate | `pnpm audit --audit-level=high` blocking in CI. |
| Install scripts | `enable-pre-post-scripts=false`; postinstall scripts allow-listed explicitly (`sharp` and similar). |
| Action pinning | Third-party GitHub Actions pinned to a **full commit SHA**, never a tag. A tag is mutable and is the standard Actions compromise vector. |
| Runtime CDNs | **None.** Fonts, CSS and icons are self-hosted (intent §budgets). The only runtime third parties are Giscus and the analytics beacon, both declared in CSP (§5.4). |

### 5.4 Response headers (`site/public/_headers`)

```
/*
  Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'none'; img-src 'self' data:; font-src 'self'; style-src 'self'; script-src 'self' https://static.cloudflareinsights.com; connect-src 'self' https://cloudflareinsights.com; frame-src https://giscus.app; upgrade-insecure-requests
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), camera=(), microphone=(), payment=(), usb=(), interest-cohort=()
  Cross-Origin-Opener-Policy: same-origin
  X-Frame-Options: DENY

/fonts/*
  Cache-Control: public, max-age=31536000, immutable

/_astro/*
  Cache-Control: public, max-age=31536000, immutable

/feed.xml
  Cache-Control: public, max-age=3600
```

Notes an implementer must not get wrong:

- **No `'unsafe-inline'` in `script-src`.** This is what forces the JS-free theme
  decision in §5.1; an inline theme script would require it.
- `style-src 'self'` requires Astro's scoped styles to be emitted as files, not
  inline `<style>`. Verify after the first build; if Astro inlines small styles,
  either disable that (`inlineStylesheets: 'never'`) or add hashes — **not**
  `'unsafe-inline'`.
- `frame-src https://giscus.app` is the single frame exception; `frame-ancestors
  'none'` still forbids anyone framing us.
- CSP must be **verified against the built output**, not assumed (§7.3). A CSP
  that silently blocks comments is worse than no comments.

### 5.5 Data protection posture

| Question | Answer |
| --- | --- |
| Personal data stored by the site | **None.** No database, no forms, no cookies, no logs under our control. |
| Personal data *processed* on our behalf | IP addresses, transiently, by Cloudflare (CDN + analytics) and by GitHub/Giscus when a reader loads a thread. See §10.4 — the intent's "nothing personal is collected" is imprecise and is corrected there. |
| Cookies set | **Zero** by first-party code. No consent banner required. |
| Third-party requests on a page load | Exactly two origins: `static.cloudflareinsights.com` (beacon) and `giscus.app` (comments iframe, on post pages only). |
| Required public disclosure | A short `/privacy/` page (or an `/about/` section) naming those two processors, the absence of cookies, and where comment data lives (GitHub, under GitHub's terms). **This is a v1 deliverable**, not optional — it is the honest form of the intent's privacy claim. |

### 5.6 Secrets inventory

| Secret | Location | Rotation |
| --- | --- | --- |
| Cloudflare API token (if CI deploys directly rather than via the Pages GitHub App) | GitHub Actions secret, least-privilege (Pages edit only) | 90 days, or immediately on suspicion |
| GitHub token for CI | Default `GITHUB_TOKEN`, `permissions:` narrowed per workflow | Ephemeral |

Public-by-design, safe to commit: `PUBLIC_GISCUS_REPO_ID`,
`PUBLIC_GISCUS_CATEGORY_ID`, `PUBLIC_CF_BEACON_TOKEN`, `SITE_URL`.

**Incident response for a leaked credential:** rotate the credential first;
revoking is the remediation. Git history is permanent and the repository is
public, so a revert commit does **not** remediate — it only hides. Record the
incident under `audits/`. (Intent failure-mode table, row 1.)

---

## 6. Functional Requirements

Testable, numbered for traceability.

### 6.1 Index — `/`

- **FR-1** Lists every published post, `pubDate` descending.
- **FR-2** Each entry renders title (link to canonical URL), formatted `pubDate`
  (`<time datetime="…">`), reading time, and its tags as links.
- **FR-3** Drafts absent in production; present in dev and on preview deploys.
- **FR-4** No pagination in v1. **FR-4a:** the build emits a warning above 60 posts
  so pagination is introduced deliberately, not after a performance complaint.
- **FR-5** Comment counts are **not** shown on the index. Fetching per-post counts
  would require a runtime request per row, breaking INV-4 and §5.4's `connect-src`.
  (The reference site does this via Disqus; it is a deliberate omission here.)

### 6.2 Post — `/blog/<slug>/`

- **FR-6** Renders title as the sole `<h1>`; body headings start at `<h2>`.
- **FR-7** Header shows byline (author record), `pubDate`, reading time, tags, and
  `Updated <date>` when `updatedDate` is set.
- **FR-8** Heading anchors: `<h2>`–`<h4>` get stable `id`s (`rehype-slug`) plus a
  visible-on-focus anchor link (`rehype-autolink-headings`). Anchor ids are part of
  the URL contract — renaming a heading breaks inbound deep links, so treat a
  heading rename as a URL change.
- **FR-9** Code blocks: Shiki syntax highlighting **at build time** (no client
  highlighter), language label, `tabindex="0"` on the `<pre>` so overflowing blocks
  are keyboard-scrollable, and a dual light/dark Shiki theme driven by the same
  media query as §5.1.
- **FR-10** Corrections, when present, render as a `<section>` after the body,
  labelled and dated, in `corrections` array order.
- **FR-11** Retracted posts render a prominent banner **before** the body, with
  date and reason; the body is preserved; the page still returns 200; the post is
  removed from listings, RSS, and sitemap but the **URL keeps working** (INV-5).
- **FR-12** Giscus mounts at the end of the article on post pages only —
  `loading="lazy"`, never on the index, tag pages, or `/about/`.
- **FR-13** External links in post bodies get `rel="noopener noreferrer"`
  (`rehype-external-links`); `target="_blank"` is **not** applied — hijacking the
  reader's navigation choice is a usability regression, not a feature.

### 6.3 Tags — `/blog/tags/` and `/blog/tags/<tag>/`

- **FR-14** `/blog/tags/` lists every tag with ≥1 published post, plus counts.
- **FR-15** `/blog/tags/<tag>/` lists that tag's posts, same entry format as FR-2.
- **FR-16** A tag in `TAGS` with zero published posts generates **no page** and no
  sitemap entry.
- **FR-17** Tag slugs are the enum members verbatim; no display-name-to-slug
  transformation, so the URL can never drift from the vocabulary.

### 6.4 About — `/about/`

- **FR-18** Bio, author links from the `authors` record, and a link to `/feed.xml`.
- **FR-19** **AI-assistance disclosure**, as a standing statement: posts may be
  AI-assisted; code samples are executed before publication; factual claims are
  traced to a primary source. No per-post badge (intent, editorial constraints).
- **FR-20** Link to the corrections policy and to `/privacy/` (§5.5).
- **FR-21** Publishing cadence claim is rendered **only if** Open Question 5 is
  answered with a specific cadence. Absent an answer, the sentence is omitted — a
  cadence promise must not be invented by an implementer.

### 6.5 Corrections and retraction protocol

- **FR-22** A published post's body is never silently rewritten. Typo and
  formatting fixes need no record; any change to **meaning, facts, code, or
  recommendation** requires a `corrections` entry and an `updatedDate` bump.
- **FR-23** `corrections` is append-only. Editing or deleting an existing entry is
  a policy violation, reviewable in git history.
- **FR-24** Retraction sets `retracted`; it never deletes the file or the URL.
- **FR-25** Unpublishing (removing a URL) is **not supported** and requires an
  explicit, recorded exception under `audits/` — it breaks INV-5.

### 6.6 Accessibility

- **FR-26** WCAG 2.2 AA: contrast ≥4.5:1 body / 3:1 large text, verified on both
  light and dark schemes; visible focus indicators on every interactive element;
  logical heading order with no skipped levels; `lang="en"` on `<html>`.
- **FR-27** A skip-to-content link, first in tab order.
- **FR-28** Every image has an `alt`; decorative images use `alt=""` plus
  `role="presentation"`. Schema-enforced for `cover` (§3.1); lint-enforced for
  in-body Markdown images (§7.2).
- **FR-29** Text reflows without horizontal scrolling at 320 px and at 400 % zoom.
- **FR-30** `prefers-reduced-motion` honoured; no animation is load-bearing.
- **FR-31** Automated checks **plus** a documented manual pass — see §10.6 for why
  a Lighthouse score of 100 is not a conformance claim.

### 6.7 Performance

- **FR-32** Budgets on the built site, at mobile emulation, on the post template:
  LCP < 1.5 s, CLS < 0.02, total JS excluding Giscus < 5 KB, total CSS < 30 KB
  gzipped, initial HTML < 50 KB.
- **FR-33** Fonts self-hosted `woff2`, `font-display: swap`, subset to Latin,
  `<link rel="preload">` for the body face only.
- **FR-34** Images via Astro `<Image>`/`<Picture>`: AVIF with WebP fallback,
  explicit `width`/`height`, `loading="lazy"` and `decoding="async"` below the
  fold.
- **FR-35** Giscus is lazy and below the fold; it must not affect LCP or CLS —
  reserve its vertical space to avoid shift on load.

---

## 7. CI/CD Pipeline and Quality Gates

### 7.1 Workflow topology

| Workflow | Triggers on paths | Jobs |
| --- | --- | --- |
| `site.yml` | `site/**`, `.github/workflows/site.yml` | install → `astro check` → build → schema/lint gates → link check → output assertions → Lighthouse |
| `governance.yml` | `policies/**`, `frameworks/**`, `audits/**`, `templates/**`, `intent/**`, `spec/**` | front-matter validation (`id`, `owner`, `version`, `last-reviewed`, `next-review`), review-date freshness, markdown lint |
| `security.yml` | **all paths** | `gitleaks` (blocking), `pnpm audit --audit-level=high`, Dependabot config validation |

`security.yml` is path-unfiltered deliberately: a secret can be committed to any
path, including a policy document or a draft post.

### 7.2 Blocking gates — `site.yml`

| Gate | Tool | Fails when |
| --- | --- | --- |
| Type/content check | `astro check` | Any TS or content-schema error, incl. every §3.1 rule |
| Filename convention | script over `src/content/blog/` | A filename is not kebab-case `.md`/`.mdx` |
| In-body image alt | `remark-lint-no-empty-alt` / custom remark rule | A Markdown image lacks `alt` (FR-28) |
| Build | `astro build` | Non-zero exit |
| Internal links | `lychee` over `dist/`, offline mode | Any broken internal link or anchor (intent §budgets) |
| External links | `lychee`, **non-blocking**, scheduled weekly | Reported, never blocking — see §10.7 |
| Markdown hygiene | `markdownlint` | Rule violation in `site/src/content/**` |
| Formatting | `prettier --check` | Unformatted file |
| Output assertions | §7.4 | Any assertion fails |
| Lighthouse | `treosh/lighthouse-ci-action` over `/`, one post, `/blog/tags/`, `/about/` | Performance < 0.95 (median of 3) or accessibility < 1.0 — see §10.6 |

### 7.3 Post-build verification

Run against `dist/` and the preview deployment, not against source:

- `_headers` present in output; CSP parses; `script-src` contains no
  `'unsafe-inline'`.
- No inline `<style>` or `<script>` blocks that the CSP would block (§5.4).
- `feed.xml` validates as RSS 2.0; every `<link>` and `<guid>` is absolute.
- Sitemap contains no draft or retracted URL.
- Giscus iframe loads on a preview deploy without a CSP violation. **This is a
  manual smoke check on the first deploy and after any CSP change** — an automated
  headless check here is worth adding but is not a v1 blocker.

### 7.4 INV-3 output assertions (governance leak prevention)

Blocking. Any failure is a release-stopping defect, not a warning:

1. No file path in `dist/` resolves from `policies/`, `frameworks/`, `audits/`,
   `templates/`, `intent/`, or `spec/`.
2. `grep -ri` over `dist/` finds no sentinel string planted in a policy document
   (e.g. `IZZIWOOT-GOVERNANCE-DO-NOT-PUBLISH`). Every governance file carries the
   sentinel in its front matter; a hit in `dist/` fails the build.
3. `dist/` contains no `.env`, `.pem`, `.key`, `id_rsa`, or `*.sqlite`.
4. Emitted file count and total size are within an order of magnitude of the
   previous build — a sudden 10× jump means something unintended got globbed.

Assertion 2 is the one that survives a refactor: a future engineer who moves the
Astro root, changes a glob, or adds a `publicDir` alias gets caught by a content
sentinel even when a path-based rule would pass.

---

## 8. Implementation Sequence

Each phase ends in a verifiable state and a mergeable PR.

| Phase | Deliverable | Exit criterion |
| --- | --- | --- |
| **0. Decisions** | §10.1 and §10.2 resolved; Open Questions 1, 2, 4 answered | Recorded in `intent/core-intent.md`; **no code until then** |
| **1. Skeleton** | `site/` Astro app, TS strict, content collections (§3), `site.ts`, env validation | `astro check` + `astro build` green; `pnpm dev` serves an empty index |
| **2. Routes** | Every route in §4.1, canonical + normalization, `<SEO>` component | All routes 200 locally; canonical URLs absolute and correct |
| **3. Design** | Original stylesheet, self-hosted fonts, type scale, light/dark via media query, inline SVG icons | Zero third-party origins in `dist/` except the two declared |
| **4. Content pipeline** | Shiki, reading time, heading anchors, `<Image>`, Mermaid decision (§10.8) | A representative post with code, images, and a diagram renders correctly |
| **5. Feed & discovery** | `/feed.xml`, sitemap, `robots.txt`, JSON-LD | RSS validates; sitemap excludes drafts |
| **6. Comments** | Giscus on post pages; GitHub Discussions category created | Thread loads on a preview deploy with CSP enforced |
| **7. CI gates** | All three workflows, §7.4 assertions, gitleaks pre-commit | A deliberately malformed post and a planted fake secret each fail CI |
| **8. Deploy** | Cloudflare Pages, custom domain, HSTS, analytics beacon, `/privacy/` page | Production Lighthouse meets FR-32; headers verified on the live origin |
| **9. Governance** | Branch protection per §10.1 resolution; `audits/` evidence entry | Configuration matches the written policy, or the divergence is recorded |

Phase 0 is not ceremony. Implementing §10.1 the wrong way means either a
permanently blocked policy path or a control that only appears to exist.

---

## 9. Traceability

| Intent outcome | Spec coverage |
| --- | --- |
| 1 — fast, accessible, ad-free blog | §4.1, FR-1–FR-4, §6.6, §6.7 |
| 2 — `/blog/<slug>/` permanent URLs | §4.2, INV-5, §3.1 (no slug override) |
| 3 — RSS + sitemap, no email required | §4.4, §4.1 |
| 4 — Giscus comments | FR-12, §5.4, §10.3 |
| 5 — nothing personal collected | §5.5, §10.4 (**claim corrected**) |
| 6 — English only | §3.4 `defaultLocale`, out of scope §1.2 |
| 7 — Markdown → PR → preview → merge | §2.3, §8 |
| 8 — drafts excluded from production | §3.3, FR-3 |
| 9 — schema fails the build | §3.1, §7.2 |
| 10 — path-scoped CI | §7.1, §10.1 (**partially unsatisfiable**) |
| 11 — auditable separation of cadence | §7.1, §7.4, §10.1 |
| 12 — failure-mode plans | §5.6, FR-22–FR-25, §10 |

---

## 10. Areas of Concern

Every item below is a place where the intent document, as literally written,
cannot be implemented — or can only be implemented in a way that differs from
what the words imply. **§10.1 and §10.2 need a human decision before Phase 1.**

### 10.1 ⛔ Branch protection cannot be path-scoped — CONTRADICTION, needs decision

**Intent asks for:** "`policies/`, `frameworks/`, and `audits/` remain PR-only with
the recorded review trail"; site changes merely need a green build.

**Why it cannot be done as written:** GitHub's required-pull-request and
required-approval settings are scoped to a **branch**, not to changed file paths.
A single `main` cannot simultaneously require a reviewed PR for one directory and
permit direct pushes to another. Rulesets can *restrict* pushes touching given
paths, but that is a blanket block, not a conditional review requirement — and
availability varies by plan and repository visibility, so **verify against current
GitHub documentation before relying on it.** I have not verified it for this
repository's plan.

**Resolution options:**

| Option | Mechanism | Cost |
| --- | --- | --- |
| **A (recommended)** | PR-only for **all** of `main`. A required status check inspects the diff and demands a stricter gate (CODEOWNERS review, policy lint) when governance paths are touched. | Posts also need a PR — ~30 seconds more per post, and you already want the preview URL, so the real cost is near zero |
| B | Two branches: `main` (site, loose) and `governance` (protected). | Two histories to reason about; an auditor must understand both; higher long-term complexity |
| C | Direct push allowed everywhere; rely on gitleaks and after-the-fact audit. | Fails the README's stated control; do not choose this silently |

**This spec assumes Option A.** It is the only option where the control the
policy claims actually exists and the blog stays pleasant to publish to.

### 10.2 ⛔ "At least one reviewer" is unsatisfiable with one human — CONTRADICTION, needs decision

**Intent/README ask for:** changes land via PR with "at least one reviewer from the
security owner group."

**Why it cannot be done as written:** GitHub does not permit a PR author to approve
their own PR. With a single maintainer, requiring one approval makes every
governance change **permanently unmergeable** — unless the repository admin
bypasses protection, which means the control is decorative while appearing
enforced. That is worse than no control, because an auditor would be misled.

**Resolution options:** (a) require 0 approvals but mandate PR + passing checks,
and state plainly in the policy that the control is the **recorded trail**, not
independent review; (b) add a second human to the security-owner group and require
1 approval for real; (c) keep the requirement and accept admin bypass, recording
every bypass under `audits/`.

**This spec assumes (a)**, per the answer to Open Question 3 — *but the policy text
in `policies/` must be amended to say so.* Leaving "at least one reviewer" written
while operating with zero reviewers is a documentation defect an auditor will find.

### 10.3 ⚠️ Giscus contradicts the zero-JavaScript baseline

The intent mandates a "zero-JS baseline" **and** Giscus comments. Giscus is a
third-party script that injects an iframe loading `giscus.app` and GitHub. On post
pages the site is therefore not JS-free.

**Adopted resolution:** INV-4 is stated as *no first-party framework JS*, with
Giscus as a named, bounded exception — lazy-loaded, below the fold, post pages
only (FR-12), and excluded from the FR-32 JS budget. The index, tag pages, and
`/about/` remain genuinely JS-free. If a strict zero-JS site is the real
requirement, comments must be dropped; those two goals cannot both hold.

### 10.4 ⚠️ "Nothing personal is collected" is not accurate as stated

Cloudflare Web Analytics is **cookieless**, not **request-less**: it loads a
beacon from `static.cloudflareinsights.com` and reports to Cloudflare, which
processes the reader's IP address and user-agent. Loading a Giscus thread likewise
discloses the reader's IP to GitHub. IP addresses are personal data under GDPR.

Two consequences:

1. **No cookie-consent banner is required** — that part of the intent holds, and it
   is the part with the real compliance weight.
2. The public claim must be **"we set no cookies and store no personal data; our
   CDN and comment provider process IP addresses to serve the page"**, not "nothing
   personal is collected." Hence the `/privacy/` page in §5.5 is a v1 deliverable.
   This is a wording correction, not a design change.

Also note the beacon is itself JavaScript, so it is the second exception to §10.3.
A fully request-free posture means dropping analytics entirely.

### 10.5 ⚠️ The domain is unresolved and blocks correctness, not just deployment

`SITE_URL` feeds canonical URLs, `og:url`, absolute RSS links, sitemap entries, and
JSON-LD. Building without it yields a site that is *wrong*, not merely unhosted —
and wrong absolute URLs that get indexed are expensive to unwind.

**Adopted resolution:** `SITE_URL` is required; the build **fails** if unset
(§3.4). Local dev defaults to `http://localhost:4321`. Preview deployments use the
Cloudflare preview URL **and must emit `<meta name="robots" content="noindex">`**
so preview builds cannot be indexed and compete with production. Production
requires the real domain. **Open Question 1 blocks Phase 8, not Phase 1.**

### 10.6 ⚠️ A Lighthouse accessibility score of 100 is not WCAG 2.2 AA conformance

The intent gates accessibility at "= 100". Automated tooling detects roughly a
third of WCAG failures. A score of 100 is compatible with unusable keyboard
ordering, meaningless-but-present alt text, or a heading structure that reads as
nonsense aloud. Conversely, gating on exactly 100 makes CI brittle: one
third-party iframe or one audit heuristic change turns a green pipeline red for
reasons unrelated to real accessibility.

**Adopted resolution:** keep the automated gate at 100 (it is a useful floor and
currently achievable for a text site), **and** add a documented manual pass —
keyboard-only traversal, screen-reader read-through of one post, 400 % zoom, both
color schemes — recorded once before launch and on any template change (FR-31).
The spec does not claim WCAG 2.2 AA conformance on the basis of the score alone.

### 10.7 ⚠️ External link checking must not block the build

A blocking external link check makes your pipeline fail because **someone else's**
site went down, rate-limited the checker, or started 403-ing CI user agents.
External checks run weekly and report; only **internal** links and anchors block
(§7.2). Accepted consequence: external link rot is detected within a week, not
immediately.

### 10.8 ⚠️ Build-time Mermaid is heavier than it looks

Rendering Mermaid at build time traditionally means a headless browser in CI —
slow, fragile, and a large new dependency, for a site whose whole premise is
minimalism. Client-side Mermaid is the alternative but violates INV-4 and requires
CSP loosening.

**Adopted resolution:** author diagrams as **hand-written inline SVG** committed to
the repository — diffable, zero-dependency, no build cost, fully styleable for
both color schemes, and accessible via `<title>`/`<desc>`. Evaluate a
browser-free Mermaid renderer only if diagram volume makes hand-authoring painful.
This reverses the intent's "Mermaid rendered at build time" phrasing on cost
grounds; flagging it rather than quietly doing something else.

### 10.9 ⚠️ Monorepo coupling: deploy triggers and audit noise

A single repository means every commit is a candidate site deployment and blog
commits dominate the history an auditor reads.

**Adopted resolution:** path-filtered Pages builds and path-filtered workflows
(§2.3, §7.1) so governance commits do not deploy and site commits do not run policy
linting. Residual, accepted: `git log` mixes both, and the audit trail must be
reconstructed with `git log -- policies/`. This is the honest cost of the Q1
decision; it is tolerable, and it is the reason §7.4's assertions exist.

### 10.10 ℹ️ Smaller items, resolved but worth knowing

- **Reading time** is an estimate from word count; it will be wrong for
  code-dense posts. Accepted — it is a courtesy, not a metric.
- **No pagination** is fine now and wrong eventually; FR-4a makes the threshold
  visible rather than letting it degrade silently.
- **Heading anchor ids** are an unversioned URL surface (FR-8): renaming a heading
  breaks inbound deep links. No tooling guards this; it is a discipline item.
- **Tag vocabulary is closed** (§3.1). This is deliberate — an open vocabulary
  grows synonym tags (`ai`, `AI`, `artificial-intelligence`) that fragment the
  index. Adding a tag is a one-line reviewed change.
- **Description-only RSS** (§4.4) trades reader convenience for a smaller
  sanitization surface. Recorded so it is not reversed by accident.
- **Repository name typo** (`prodution`) is cosmetic today and permanent once it
  reaches a Pages config, a deploy log, and a custom domain. Open Question 2.

---

## 11. Definition of Done

- [ ] §10.1 and §10.2 resolved by decision and the `policies/` text amended to match
- [ ] Open Questions 1 (domain), 2 (rename), 4 (tag vocabulary) answered
- [ ] All routes in §4.1 live and returning documented status codes
- [ ] FR-1 – FR-35 verified, each traceable to a check or a recorded manual test
- [ ] All §7.2 gates blocking in CI; a malformed post **and** a planted fake secret
      each proven to fail the pipeline
- [ ] §7.4 output assertions passing, including the governance sentinel test
- [ ] Headers from §5.4 verified on the **live** origin, not just in `_headers`
- [ ] Giscus thread confirmed working under the enforced CSP
- [ ] `/privacy/` published with the accurate §10.4 wording
- [ ] Manual accessibility pass recorded (§10.6)
- [ ] FR-32 budgets met on production
- [ ] Rollback rehearsed once: a deliberate bad deploy reverted via Cloudflare
- [ ] Evidence entry written under `audits/`

---

*Derived from `intent/core-intent.md` (intent-blog-001 v1.0) on 2026-09-28.
Where this spec diverges from the intent, §10 states the divergence and the
reason. Nothing in the intent has been silently dropped.*
