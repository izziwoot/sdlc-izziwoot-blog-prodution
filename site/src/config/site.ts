import { parseEnv } from './env';

/**
 * Astro surfaces unprefixed build-time variables on `import.meta.env`, verified
 * against a real build: SITE_URL resolves here without a process.env fallback.
 * Only PUBLIC_-prefixed values are additionally exposed to the client, which is
 * why the giscus and analytics identifiers carry that prefix and SITE_URL does
 * not. This module runs at build time only — the output is static.
 */
const raw = import.meta.env as unknown as Record<string, string | undefined>;

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
