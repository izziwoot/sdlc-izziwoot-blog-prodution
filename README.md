# sdlc-izziwoot-blog-prodution

The Izzi Woot blog, and the SDLC governance that controls how it reaches production,
in one repository.

> **Note on the name:** `prodution` is a typo. Renaming is free until the name is
> embedded in a Cloudflare Pages config, a custom domain, and deploy logs — see
> [Open decisions](#open-decisions).

## What is here

Two things with deliberately different cadences:

- **`site/`** — a static blog built with Astro, published to Cloudflare Pages. Posts
  are Markdown in git. Changes here are frequent.
- **`policies/`, `frameworks/`, `audits/`** — the written policies, control mappings,
  and audit evidence governing how changes reach production. Changes here are rare
  and deliberate.

Keeping them together is a deliberate choice, and it only works because CI is
**path-scoped**: a typo fix in a post does not run policy linting, and a policy change
does not deploy the site. The cost is that `git log` mixes both, so the governance
trail is read with `git log -- policies/ frameworks/ audits/`.

## Layout

| Path | Contents | Status |
| --- | --- | --- |
| `intent/core-intent.md` | Why this exists, decided outcomes, affected users, open questions | present |
| `spec/core-spec.md` | Technical spec: invariants, data models, routes, security protocols, and the contradictions §10 could not resolve | present |
| `plan/core-plan.md` | 23-task implementation plan with TDD steps and proof-of-completion criteria | present |
| `plan/core-tickets.md` | The same 23 tasks as groomable tickets with dependencies and acceptance criteria | present |
| `site/` | The Astro application — the only publishable tree | in progress |
| `policies/` | Written policies (access control, change management, incident response) | planned |
| `frameworks/` | Control mappings to external frameworks (SOC 2, ISO 27001, NIST) | planned |
| `audits/` | Audit evidence, findings, and remediation tracking | planned |
| `templates/` | Reusable templates for policies, risk assessments, and exceptions | planned |
| `.github/workflows/` | Path-scoped CI: site build, governance checks, secret scanning | planned |

**Nothing outside `site/` is ever published.** The Astro root is `site/`, never the
repository root — at the root, the content globber would match `policies/**/*.md` and
put governance documents on the public web. A build-output assertion enforces this by
grepping for a sentinel string that every governance file carries, so the check
survives someone moving the Astro root or editing a glob.

## The document chain

Each document is derived from the one before it, and each records where it diverged:

```
intent/core-intent.md  ->  spec/core-spec.md  ->  plan/core-plan.md  ->  plan/core-tickets.md
   what and why              how, plus            ordered TDD steps      groomable units
                             unresolved conflicts  and proofs            with acceptance criteria
```

Read `spec/core-spec.md` §10 first. It lists ten places where the intent could not be
implemented as literally written, including two that still need a human decision.

## Working on the site

```bash
# Node version is pinned; use fnm, nvm, or any .nvmrc-aware manager.
fnm use                      # reads .nvmrc -> 22.23.3
corepack-free: npm i -g pnpm@9

cd site
pnpm install --frozen-lockfile
pnpm dev                     # local preview
pnpm test                    # vitest, pure-function suites
pnpm check                   # astro check, blocking
pnpm build                   # static output to site/dist
```

Build-time environment variables (all required except the last):
`SITE_URL`, `PUBLIC_GISCUS_REPO`, `PUBLIC_GISCUS_REPO_ID`,
`PUBLIC_GISCUS_CATEGORY_ID`, `PUBLIC_CF_BEACON_TOKEN`. `SITE_URL` must be absolute
with no trailing slash; the build fails rather than emitting `undefined` into
canonical URLs.

### Toolchain constraints that actually bite

Each of these was found by running the build, not by reading docs:

- **Node must be 22.x**, not 20.x, even though `engines` allows `>=20.11 <23`.
  `@astrojs/check` transitively `require()`s an ESM-only module, which Node supports
  only from 22.12. Node 20.11.1 fails with `ERR_REQUIRE_ESM`. **Cloudflare Pages must
  be set to Node 22**, or this reappears in CI rather than locally.
- **zod must be `^4`.** Astro 7 depends on `zod ^4.5.4`. Mixing majors breaks
  typechecking *and* runtime — zod 3 schemas make Astro's JSON-schema generation throw
  while continuing past the error, so validation silently does nothing.
- **The content config lives at `site/src/content.config.ts`**, not
  `src/content/config.ts`. Astro 6 removed legacy content collections.
- **Collections use `loader: glob(...)`**, and entries are keyed by `id`, not `slug`.
  `render` is imported from `astro:content`; it is not a method on an entry.
- **Do not add a top-level `vite` dependency.** Vitest 3's peer range excludes Astro
  7's vite 8, so two vite copies in the tree is the correct state.
- **`astro.config.mjs` sets `inlineStylesheets: 'never'`** on purpose. Inlined
  `<style>` blocks would be blocked by the `style-src 'self'` CSP.

## Conventions

**Governance documents**

- One policy per file, kebab-case (`access-control.md`).
- Front matter carries `id`, `owner`, `version`, `last-reviewed`, `next-review`, and
  `publication` (the do-not-publish sentinel). CI fails on a missing field, and on a
  `next-review` date that has passed — an annual review nothing enforces does not happen.

**Posts**

- The filename is the URL slug. There is no `slug` front-matter key.
- A typed schema fails the build on a malformed post: missing description, a tag
  outside the closed vocabulary, or an image without alt text.
- Published URLs are permanent. Corrections are appended and dated, never silent;
  a retracted post keeps its URL and carries a notice.

**Changes**

- Every change reaches `main` through a pull request with required checks passing.
- With a single maintainer the control is the **recorded trail** — the PR, its diff,
  its checks, and its written rationale — not independent review. GitHub forbids
  self-approval, so requiring an approval would make governance changes unmergeable
  while appearing enforced. If a second security owner joins, the approval requirement
  rises to one and this paragraph changes.
- Changes under `policies/`, `frameworks/`, and `audits/` additionally require a
  substantive PR body explaining the change.

## Status

| Task | State |
| --- | --- |
| 1 — project scaffold, validated environment | done |
| 2 — content schemas on the Astro 7 content layer | done |
| 3 — post selection, ordering, tag grouping | done |
| 4–21 — routes, design, feed, CI gates, deploy | not started |
| 22 — branch protection | **blocked** on spec §10.1 and §10.2 |
| 23 — launch verification | not started |

Current verification: 45 tests passing, `astro check` clean, and
`pnpm audit --audit-level=high` exiting 0. No page has been built yet — everything
verified so far is pure functions and typechecking. `astro build` first runs at Task 7.

## Open decisions

These block specific work and are recorded in `intent/core-intent.md`:

1. **Domain** — required before deploy (Task 21).
2. **Repository rename** — `prodution` → `production`, free until the first deploy.
3. **Branch protection strategy** — GitHub cannot scope required reviews to file
   paths; spec §10.1 has the options.
4. **Approval requirement** — and amending the policy text to match, per spec §10.2.
5. **Launch tag vocabulary** — tags are URLs, so a later rename breaks links.
6. **Publishing cadence** — stated publicly or omitted; no claim is invented.
7. **Portuguese content** — the one deferred item with a real cost of delay, since it
   would change the URL scheme.
