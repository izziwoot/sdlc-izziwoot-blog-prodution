# Deploy runbook

Production is Cloudflare Pages, building from `main`. There is no runtime: no SSR
adapter, no Functions, no Workers on this hostname (INV-1). Anything that
introduces one is a change to the spec, not a configuration tweak.

## Deploy configuration

These are the verified values, not the obvious ones. Each line below was wrong on
the first attempt in some way worth remembering.

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Root directory | `site` |
| Build command | `pnpm install --frozen-lockfile && pnpm build` |
| Build output directory | `dist` |
| Build watch paths | `site/*` |

- **Output is `dist`, not `site/dist`.** It resolves relative to the root
  directory, so `site/dist` becomes `site/site/dist` and the build fails.
- **`NODE_VERSION` must be set explicitly to a 22.x release.** `.nvmrc` lives at
  the repository root and there is no `site/.nvmrc`, so with the root directory
  set to `site` Cloudflare never finds it. 22 specifically: `@astrojs/check`
  transitively `require()`s an ESM-only module that Node supports from 22.12.
- **Use build watch paths, not a `git diff` guard in the build command.** Exiting
  early leaves an empty output directory, which Cloudflare treats as a failed
  deploy rather than a skipped one.
- **A Worker route on the hostname silently wins over a Pages custom domain.** If
  the site serves content it should not, check Workers & Pages for a route
  claiming the hostname before suspecting the build.

Build-time variables, required in **both** Production and Preview. The build fails
with `Invalid build environment` if any of the first four is missing — they are
validated by a Zod schema in `site/src/config/env.ts`, deliberately, so a
misconfigured deploy fails loudly instead of emitting `undefined` into canonical
URLs.

| Variable | Notes |
| --- | --- |
| `SITE_URL` | Absolute, no trailing slash |
| `PUBLIC_GISCUS_REPO` | `owner/name`; changes if the repository is renamed |
| `PUBLIC_GISCUS_REPO_ID` | `R_…` node ID; stable across renames |
| `PUBLIC_GISCUS_CATEGORY_ID` | `DIC_…` node ID; stable across renames |
| `PUBLIC_CF_BEACON_TOKEN` | Optional. Build-time, so a change needs a redeploy |

Do not enable Web Analytics' automatic script injection. `BaseLayout.astro`
injects the beacon itself when the token is set, and the CSP already allows
`static.cloudflareinsights.com`. Enabling both gives two beacons.

## Publish a post

1. Branch, add `site/src/content/blog/<kebab-slug>.md`, push, open a PR.
2. Read it on the Cloudflare preview URL — rendered, not raw.
3. Merge to `main`. Production deploys automatically.

Preview deployments emit `noindex` because `site.ts` keys off `CF_PAGES_BRANCH`.
Verify that on the preview rather than trusting it: a `pages.dev` URL competing
with production in the index is an easy failure to miss.

## Roll back a bad deploy

1. Cloudflare Pages → Deployments → the last good one → **Rollback**.
2. Then fix forward on a branch. `main` is always deployable.
3. Rollback is not a fix — it buys time.

## A leaked credential

1. **Rotate the credential first.** Revocation is the remediation; nothing else is.
2. Do not revert-and-forget. Git history is permanent, and once the repository is
   public a revert hides the value without removing it.
3. Record the incident under `audits/`.

## Correct a published post

1. Add a `corrections` entry (date + note) and bump `updatedDate`.
2. Never edit an existing correction. Never delete the URL.

## Retract a post

1. Add `retracted: { date, reason }`.
2. The URL keeps working and keeps the notice. It leaves listings, the feed, and
   the sitemap (INV-5).

## Verify a deploy served what you think it built

A `_headers` file present in `dist` is not the same claim as a header being
served. Check the live origin:

```bash
D=myblog.mycirrusit.com
curl -sSI "https://$D/" | grep -iE "content-security-policy|strict-transport|nosniff"
curl -sS "https://$D/blog/<slug>/" | grep -o '<link rel="canonical"[^>]*>'
for p in /blog /feed /rss.xml; do
  curl -sS -o /dev/null -w "$p -> %{http_code} %{redirect_url}\n" "https://$D$p"
done
curl -sS -o /dev/null -w "404 check: %{http_code}\n" "https://$D/no-such-page/"
```

Expect the three headers present, a canonical matching the real origin, three
301s, and a real 404 rather than a soft 200.
