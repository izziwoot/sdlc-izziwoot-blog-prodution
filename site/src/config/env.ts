import { z } from 'zod';

const schema = z.object({
  // zod 4: top-level z.url() replaces the deprecated z.string().url().
  SITE_URL: z
    .url({ error: 'SITE_URL must be an absolute http(s) URL' })
    .refine((u) => /^https?:\/\//.test(u), 'SITE_URL must be an absolute http(s) URL'),
  PUBLIC_GISCUS_REPO: z.string({ error: 'PUBLIC_GISCUS_REPO is required' }).min(3),
  PUBLIC_GISCUS_REPO_ID: z.string({ error: 'PUBLIC_GISCUS_REPO_ID is required' }).min(3),
  PUBLIC_GISCUS_CATEGORY_ID: z
    .string({ error: 'PUBLIC_GISCUS_CATEGORY_ID is required' })
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
