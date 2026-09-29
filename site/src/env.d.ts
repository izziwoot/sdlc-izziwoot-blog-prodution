/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly SITE_URL: string;
  readonly PUBLIC_GISCUS_REPO: string;
  readonly PUBLIC_GISCUS_REPO_ID: string;
  readonly PUBLIC_GISCUS_CATEGORY_ID: string;
  readonly PUBLIC_CF_BEACON_TOKEN?: string;
  readonly CF_PAGES_BRANCH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
