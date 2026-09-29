---
id: intent-blog-001
owner: Adilson Cesar
version: 1.0
status: draft — awaiting sign-off
last-reviewed: 2026-09-28
next-review: 2026-12-28
---

# Core Intent — Izzi Woot Blog

## Title

**Izzi Woot — a personal engineering blog for IT and AI writing**, delivered as a
static site inside this repository and governed by the same SDLC controls the
repository already defines.

## Problem Statement

There is today no place to publish writing on IT and AI under the Izzi Woot
identity. Existing options each fail a requirement:

- **Hosted platforms** (Medium, Substack, dev.to) own the URL, inject tracking and
  interstitials, and make the content hostage to a third party's business model.
- **No outlet at all** means writing happens in private notes and is never
  published, which is the current state.

The reference point for the desired reading experience is
[sizovs.net](https://sizovs.net/): a single-column, type-first, reverse-chronological
list of posts with no chrome competing with the text. Its **information
architecture** is the target. Its stylesheet, markup, and copy are its author's
work and are explicitly **not** to be copied — the visual identity here is
original.

A second, subtler problem: this repository is declared as the compliance and
policy source of truth for the blog's SDLC. Publishing the site from the *same*
repository is the stated preference, so blog content and audit evidence will share
one history. That coexistence must be engineered deliberately or it degrades both
— high-frequency post commits drowning the audit trail, or governance review
friction applied to typo fixes.

## Proposed Outcomes

### Reader-facing

1. A fast, accessible, ad-free blog at a custom domain: single-column layout,
   reverse-chronological index, reading time per post, tag index pages, and an
   `/about` page.
2. Post URLs permanently shaped `/blog/<slug>/` — no dates in the path, so
   evergreen posts do not read as stale.
3. An RSS feed at `/feed.xml` and a `sitemap.xml`, so readers are never required
   to hand over an email address to follow the blog.
4. Comment threads via **Giscus** (backed by GitHub Discussions): no third-party
   tracking, no moderation database, and a GitHub sign-in requirement that filters
   drive-by spam. Accepted tradeoff: readers without a GitHub account cannot
   comment.
5. **Nothing personal is collected.** Analytics is Cloudflare Web Analytics —
   cookieless, therefore no consent banner and no cookie-consent compliance
   surface.
6. English only for v1.

### Author-facing

7. Write a post as a Markdown file in `site/src/content/blog/`, preview locally
   with the dev server, open a PR, read it rendered on the Cloudflare preview URL,
   merge to publish.
8. `draft: true` front matter keeps a post out of production builds while leaving
   it visible in dev and on PR previews.
9. A typed content-collection schema **fails the build** on a malformed post —
   missing title, date, description, tags, or image `alt` text. Metadata mistakes
   are caught by CI, not discovered by readers.
10. Path-scoped CI: site changes need a green build; `policies/`, `frameworks/`,
    and `audits/` remain PR-only with the recorded review trail the repository
    README already mandates.

### Governance-facing

11. The compliance material keeps its own cadence and gates. An auditor can see
    that a blog typo and an access-control policy change did not travel the same
    path.
12. Written, testable plans exist for the six identified failure modes (below).

### Explicit non-goals for v1

Full-text search (revisit at ~30 posts), an email newsletter, multi-language
content, a web CMS, guest authors, and scheduled/cron publishing.

## Affected Users

| Role | Who | What they need | How this is served |
| --- | --- | --- | --- |
| **Author / maintainer** | Adilson Cesar (sole human) | Publish in minutes without fighting tooling; never ship a broken or malformed post | Markdown-in-git, typed schema, PR previews, drafts |
| **Reader** | Engineers and practitioners following IT/AI topics | Fast load, readable typography, no ads or trackers, a way to subscribe | Static output, zero-JS baseline, cookieless analytics, RSS |
| **Commenter** | Readers with GitHub accounts | Respond without creating yet another account | Giscus / GitHub Discussions |
| **Assistive-technology user** | Readers using screen readers, keyboard navigation, or high-zoom | Semantic structure, required alt text, AA contrast, keyboard-reachable nav | WCAG 2.2 AA enforced in CI |
| **Compliance reviewer / auditor** | Security owner role defined by this repository's policies | Evidence that production changes follow the documented path | Path-scoped CI, PR-only governance paths, this document under version control |
| **Search engines / feed readers** | Automated consumers | Stable URLs, sitemap, valid feed, correct OG metadata | Permanent URL scheme, generated sitemap and feed, schema-enforced metadata |

No anonymous write access exists anywhere in the system. There is no login, no
user-generated content stored by the site, and no admin surface — a deliberate
reduction of the attack surface to "static files plus a CDN."

## Technical Constraints

### Decided

| Decision | Choice | Rationale |
| --- | --- | --- |
| Repository | **Monorepo in `sdlc-izziwoot-blog-prodution`** | Author's standing preference; one repository as the standard |
| Layout | `site/` (Astro app), `intent/`, plus `policies/` `frameworks/` `audits/` `templates/` | The SSG must **never** sit at the repo root, or it would treat `policies/*.md` as publishable content and leak governance docs to the public web |
| Generator | **Astro** | Markdown/MDX, zero-JS output by default, built-in RSS and sitemap, build-time image optimization, typed content collections; leaves room to embed an interactive AI/IT demo later without giving up the static baseline |
| Hosting | **Cloudflare Pages** | Git-push deploys, a preview URL per PR (proofread rendered, not raw), CDN and analytics included, rollback to any prior deployment |
| Authoring | **Markdown committed to git** | No CMS, therefore no auth surface and no additional service to maintain |
| Content model | **Tags + tag index pages**, no search in v1 | Flat listing is honest at 10 posts, unusable at 80; tags are cheap now and expensive to retrofit into URLs later |
| URL scheme | **`/blog/<slug>/`** | Reserves the top-level namespace for `/about`, `/tags`, and future pages; avoids a slug someday colliding with a page name. Dates omitted deliberately |
| Identity | **Izzi Woot** as publication, **Adilson Cesar** as author byline | Reads as a real publication, survives a future second author, still credits the author on every post |
| Comments | **Giscus** | No trackers, no database; GitHub sign-in suppresses spam without manual moderation |
| Analytics | **Cloudflare Web Analytics** | Cookieless → no consent banner, no cookie-consent compliance obligation |
| Subscriptions | **RSS only** | An email list would convert a zero-personal-data site into one with storage, unsubscribe, and GDPR obligations — deferred until there is content worth subscribing to |
| Visual identity | **Original** stylesheet, type scale, and palette | The reference site's IA is the model; its design and words are its author's and are not reproduced |

### Enforced quality budgets (CI-gated, not aspirational)

- Lighthouse **performance ≥ 95**, **accessibility = 100** on the built site.
- **Zero-JS baseline** — no framework JavaScript shipped for a text post.
- **Self-hosted fonts; no third-party CSS or icon-font CDNs.** The reference site
  pulls fonts and icons from three external origins; that is three round-trips and
  three privacy leaks before body text paints. Icons are inline SVG.
- **WCAG 2.2 AA** contrast; semantic headings; keyboard-navigable nav.
- **Broken internal link check fails the build.**
- **gitleaks secret scan fails the build**, plus a local pre-commit hook.
- Images via Astro `<Image>` from `src/assets/` — automatic AVIF/WebP, explicit
  dimensions (no layout shift), **`alt` text required by schema**. Diagrams are
  inline SVG or Mermaid rendered at build time, so they stay diffable text in git.

### Editorial constraints

- **AI-assisted content disclosure**: a standing note on `/about` stating posts may
  be AI-assisted and that every claim is human-verified. The load-bearing
  commitment, not the badge: **code samples are executed, and factual claims are
  traced to a primary source, before publish.** No per-post badge — it invites
  grading posts by tooling rather than substance.
- **Corrections are never silent.** A published post is not quietly rewritten; a
  dated `Correction` or `Retracted` block is added and the URL is never removed.

### Failure modes with committed plans

| Failure mode | Plan |
| --- | --- |
| **Secret or client name leaked in a draft** | Highest-likelihood risk: a public repository plus posts about real systems. `gitleaks` blocking in CI + local pre-commit hook. Git history is permanent, so response is **key rotation**, never a revert commit |
| **Bad deploy** | `main` is always deployable; roll back to the previous Cloudflare deployment, then fix forward |
| **A post must be corrected or retracted** | Dated correction/retraction block; URL preserved; no silent edits |
| **Domain or DNS lapse** | Auto-renew enabled; registrar contact address **not** hosted on the domain being renewed |
| **Comment abuse** | Giscus threads are GitHub Discussions: lock, delete, block, and GitHub's own abuse reporting are already available |
| **Content loss** | Content is Markdown in git; the repository is the backup. No database exists to lose |

## Open Questions

| # | Question | Why it blocks | Owner |
| --- | --- | --- | --- |
| 1 | **What is the domain?** Is one already registered for Izzi Woot, or does it need purchasing? | Required for Cloudflare Pages custom-domain setup, canonical URLs, `og:url`, and the RSS feed's self-link. Local development can proceed without it; **deploy cannot** | Adilson |
| 2 | **Rename the repository?** `sdlc-izziwoot-blog-prodution` → `...-production`. GitHub redirects the old URL and only the one local clone needs `git remote set-url`. Cost is ~zero today; once the typo is embedded in a Pages build config, a custom domain, and every deploy log, it is permanent | Should be settled before the first deploy | Adilson (GitHub Settings → Rename) |
| 3 | **Does `policies/` stay PR-only given a single reviewer?** The author would be approving their own PRs. Confirmed in principle — the value is the recorded trail, not a second pair of eyes — but worth restating explicitly if an auditor will read it | Affects branch-protection configuration | Adilson |
| 4 | **Initial tag vocabulary.** Which tags exist at launch (e.g. `ai`, `llm`, `architecture`, `devops`, `career`)? | Tags are part of URLs; renaming one later breaks links. A small starting set is safer than a broad one | Adilson |
| 5 | **Posting cadence commitment.** The reference site advertises "at least one new post every month." Stating a cadence publicly creates an obligation; omitting it costs nothing | Copy on `/about` and the index only | Adilson |
| 6 | **Portuguese later?** English-only is decided for v1, but if bilingual is ever likely, the i18n-capable URL structure is cheaper to reserve now than to retrofit | Would change the URL scheme, so it is the one deferred item with a real cost of delay | Adilson |

## Deliberately deferred (revisit, do not re-litigate)

Full-text search (~30 posts), email newsletter, web CMS (Decap/Sveltia — only if
writing away from the primary machine becomes real behavior, not an assumption),
multi-language content, guest authors, cron-based scheduled publishing.

---

*Compiled from an 18-question architecture grilling session on 2026-09-28. Every
decision above was put to the author explicitly; nothing is silently assumed.
Items not decided appear under Open Questions rather than as defaults.*
