import { parseEnv } from './env';

/**
 * Vite only surfaces PUBLIC_-prefixed variables on `import.meta.env`, and
 * SITE_URL is deliberately unprefixed (it is build-time only, not client data).
 * Reading both sources keeps this correct whichever way the value arrives.
 * This file runs at build time only — the output is static.
 */
const raw = {
  ...(typeof process !== 'undefined' ? process.env : {}),
  ...import.meta.env,
} as Record<string, string | undefined>;

const env = parseEnv(raw);

const branch = raw.CF_PAGES_BRANCH;

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
  noindex: branch !== undefined && branch !== 'main',
  /** Drafts and future-dated posts are visible in dev and on previews only. */
  includeDrafts: import.meta.env.DEV === true || (branch !== undefined && branch !== 'main'),
} as const;
