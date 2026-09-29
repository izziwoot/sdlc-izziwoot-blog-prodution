---
id: AUD-001
owner: Adilson Cesar
version: 1.0
last-reviewed: 2026-09-29
next-review: 2027-09-29
publication: IZZIWOOT-GOVERNANCE-DO-NOT-PUBLISH
---

# Launch performance and accessibility baseline

Measured with Lighthouse CI, 3 runs per URL, median, mobile emulation with
simulated throttling, against the static `site/dist` output. These are the
numbers a future regression is measured against.

## Results

| URL | Perf | A11y | Best practices | SEO | LCP (ms) | CLS | Weight (KB) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | 1.00 | 1.00 | 1.00 | 1.00 | 323 | 0.0000 | 54 |
| `/blog/version-pins-are-security-decisions/` | 1.00 | 1.00 | 0.96 | 1.00 | 362 | 0.0006 | 212 |
| `/blog/tags/` | 1.00 | 1.00 | 1.00 | 1.00 | 322 | 0.0001 | 54 |
| `/about/` | 1.00 | 1.00 | 1.00 | 1.00 | 322 | 0.0026 | 54 |

Budgets: performance ≥ 0.95 and accessibility = 1.00 are **blocking**; LCP < 1500 ms
and CLS < 0.02 are blocking. All pass with substantial margin — LCP is roughly a
quarter of budget, CLS roughly a tenth at worst.

## Two deviations, both explained

**The post page scores 0.96 on best practices.** The sole cause is a console
error: `[giscus] giscus is not installed on this repository`. The build uses
placeholder Giscus identifiers because Discussions, the Announcement-type
`Comments` category, and the Giscus app do not exist yet. This resolves when those
are set up, and should be re-measured then rather than assumed fixed.

**The measured build omits the analytics beacon.** The Cloudflare beacon cannot
complete a cross-origin request from `localhost`, so including it produced a CORS
failure that never occurs in production and depressed the score for reasons
unrelated to the page. Consequence, stated plainly: **the beacon's real cost is
not captured here.** It is roughly 5 KB deferred, and the live-origin measurement
in Task 21 is what confirms it.

## Where the weight goes

The post page is 212 KB against 54 KB elsewhere. Breakdown:

| Resource | KB |
| --- | --- |
| `body-latin.woff2` | 50 |
| `mono-latin.woff2` | 40 |
| Giscus Next.js chunks (3) | ~47 |
| Giscus loading GIF | 18 |

Two things worth noting. The monospace font loads only where code appears, which
is why the other pages are lighter. And **Giscus brings roughly 65 KB of its own
JavaScript plus a loading GIF** — the measured price of the spec §10.3 exception,
recorded so the trade is an informed one rather than an assumption.

## What this is not

A Lighthouse accessibility score of 1.00 is **not** a claim of WCAG 2.2 AA
conformance. Automated tooling detects roughly a third of WCAG failures, and a
perfect score is compatible with unusable keyboard ordering, alt text that is
present but meaningless, or a heading structure that reads as nonsense aloud. The
manual pass — keyboard-only traversal, a screen-reader read-through, 400 % zoom,
both colour schemes — is Task 23, and it is what this score cannot replace.

Nothing here has been rendered by a browser for a human to look at. These are
machine measurements of machine-generated output.

## Regeneration

```bash
cd site && pnpm build && CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" pnpm lint:lighthouse
```
