import { describe, expect, it } from 'vitest';
import { parseEnv } from '@/config/env';

const valid = {
  SITE_URL: 'https://example.com',
  PUBLIC_GISCUS_REPO: 'izziwoot/sdlc-izziwoot-blog-prodution',
  PUBLIC_GISCUS_REPO_ID: 'R_abc123',
  PUBLIC_GISCUS_CATEGORY_ID: 'DIC_abc123',
  PUBLIC_CF_BEACON_TOKEN: 'deadbeef',
};

describe('parseEnv', () => {
  it('returns a normalised Env for valid input', () => {
    const env = parseEnv(valid);
    expect(env.siteUrl).toBe('https://example.com');
    expect(env.analyticsToken).toBe('deadbeef');
  });

  it('strips a trailing slash from siteUrl so canonical URLs never double up', () => {
    expect(parseEnv({ ...valid, SITE_URL: 'https://example.com/' }).siteUrl).toBe(
      'https://example.com',
    );
  });

  it('throws when SITE_URL is missing', () => {
    const { SITE_URL: _omit, ...rest } = valid;
    expect(() => parseEnv(rest)).toThrow(/SITE_URL/);
  });

  it('throws when SITE_URL is not an absolute http(s) URL', () => {
    expect(() => parseEnv({ ...valid, SITE_URL: 'example.com' })).toThrow(/SITE_URL/);
  });

  it('throws when a giscus identifier is missing', () => {
    const { PUBLIC_GISCUS_REPO_ID: _omit, ...rest } = valid;
    expect(() => parseEnv(rest)).toThrow(/PUBLIC_GISCUS_REPO_ID/);
  });

  it('treats a missing analytics token as null rather than failing', () => {
    const { PUBLIC_CF_BEACON_TOKEN: _omit, ...rest } = valid;
    expect(parseEnv(rest).analyticsToken).toBeNull();
  });
});
