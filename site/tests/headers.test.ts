import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkCsp, parseCsp, parseHeadersFile } from '../scripts/lib/headers.mjs';

const headersText = () => readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
const REQUIRED_FRAME = ['https://giscus.app'];

describe('parseHeadersFile', () => {
  it('groups headers under their path pattern', () => {
    const parsed = parseHeadersFile('/*\n  X-A: 1\n  X-B: 2\n/fonts/*\n  X-C: 3\n');
    expect(parsed.get('/*')).toEqual({ 'X-A': '1', 'X-B': '2' });
    expect(parsed.get('/fonts/*')).toEqual({ 'X-C': '3' });
  });

  it('ignores comments and blank lines', () => {
    expect(parseHeadersFile('# comment\n\n/*\n  X-A: 1\n').get('/*')).toEqual({ 'X-A': '1' });
  });

  it('keeps a header value containing colons intact', () => {
    const parsed = parseHeadersFile("/*\n  CSP: default-src 'self'; img-src https://x.test\n");
    expect(parsed.get('/*')?.['CSP']).toBe("default-src 'self'; img-src https://x.test");
  });
});

describe('parseCsp', () => {
  it('splits directives into source lists', () => {
    const d = parseCsp("default-src 'self'; frame-src https://giscus.app");
    expect(d['default-src']).toEqual(["'self'"]);
    expect(d['frame-src']).toEqual(['https://giscus.app']);
  });

  it('keeps a valueless directive as an empty list', () => {
    expect(parseCsp('upgrade-insecure-requests')['upgrade-insecure-requests']).toEqual([]);
  });
});

describe('checkCsp', () => {
  const good = () =>
    parseCsp(
      "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; " +
        "form-action 'none'; img-src 'self' data:; font-src 'self'; style-src 'self'; " +
        "style-src-attr 'unsafe-inline'; script-src 'self' https://static.cloudflareinsights.com; " +
        "connect-src 'self' https://cloudflareinsights.com; frame-src https://giscus.app; " +
        'upgrade-insecure-requests',
    );

  it('accepts the intended policy', () => {
    expect(checkCsp(good(), { requiredFrameOrigins: REQUIRED_FRAME })).toEqual([]);
  });

  it("rejects 'unsafe-inline' in script-src", () => {
    const bad = { ...good(), 'script-src': ["'self'", "'unsafe-inline'"] };
    expect(checkCsp(bad, { requiredFrameOrigins: REQUIRED_FRAME }).join()).toMatch(
      /script-src.*unsafe-inline/,
    );
  });

  it("rejects 'unsafe-inline' in style-src, which would also permit <style> elements", () => {
    const bad = { ...good(), 'style-src': ["'self'", "'unsafe-inline'"] };
    expect(checkCsp(bad, { requiredFrameOrigins: REQUIRED_FRAME }).join()).toMatch(
      /style-src.*unsafe-inline/,
    );
  });

  it("PERMITS 'unsafe-inline' in style-src-attr, which Shiki requires", () => {
    // Shiki emits inline style ATTRIBUTES on <pre> and every token. Without this
    // the policy strips all syntax colour, silently. style-src-attr scopes the
    // exception to attributes: <style> elements stay forbidden.
    expect(checkCsp(good(), { requiredFrameOrigins: REQUIRED_FRAME })).toEqual([]);
  });

  it('rejects a policy missing style-src-attr entirely, since highlighting would break', () => {
    const bad = { ...good() };
    delete bad['style-src-attr'];
    expect(checkCsp(bad, { requiredFrameOrigins: REQUIRED_FRAME }).join()).toMatch(
      /style-src-attr/,
    );
  });

  it("rejects 'unsafe-eval' anywhere", () => {
    const bad = { ...good(), 'script-src': ["'self'", "'unsafe-eval'"] };
    expect(checkCsp(bad, { requiredFrameOrigins: REQUIRED_FRAME }).join()).toMatch(/unsafe-eval/);
  });

  it('rejects a missing default-src', () => {
    const bad = { ...good() };
    delete bad['default-src'];
    expect(checkCsp(bad, { requiredFrameOrigins: REQUIRED_FRAME }).join()).toMatch(/default-src/);
  });

  it('rejects a policy that would block the comments iframe', () => {
    const bad = { ...good(), 'frame-src': ["'none'"] };
    expect(checkCsp(bad, { requiredFrameOrigins: REQUIRED_FRAME }).join()).toMatch(/giscus/);
  });

  it('rejects a wildcard source in a fetch directive', () => {
    const bad = { ...good(), 'img-src': ['*'] };
    expect(checkCsp(bad, { requiredFrameOrigins: REQUIRED_FRAME }).join()).toMatch(/wildcard/i);
  });

  it('rejects an insecure http origin', () => {
    const bad = { ...good(), 'script-src': ["'self'", 'http://cdn.test'] };
    expect(checkCsp(bad, { requiredFrameOrigins: REQUIRED_FRAME }).join()).toMatch(/insecure/i);
  });

  it('rejects a policy missing any of the lockdown directives', () => {
    for (const name of ['base-uri', 'object-src', 'frame-ancestors', 'form-action']) {
      const bad = { ...good() };
      delete bad[name];
      expect(checkCsp(bad, { requiredFrameOrigins: REQUIRED_FRAME }).join()).toMatch(name);
    }
  });
});

describe('the committed _headers file', () => {
  const groups = () => parseHeadersFile(headersText());

  it('applies a CSP to every path', () => {
    expect(groups().get('/*')?.['Content-Security-Policy']).toBeDefined();
  });

  it('passes every CSP rule', () => {
    const csp = groups().get('/*')!['Content-Security-Policy']!;
    expect(checkCsp(parseCsp(csp), { requiredFrameOrigins: REQUIRED_FRAME })).toEqual([]);
  });

  it('sets HSTS with a two-year max-age, subdomains and preload', () => {
    const hsts = groups().get('/*')?.['Strict-Transport-Security'] ?? '';
    expect(hsts).toMatch(/max-age=63072000/);
    expect(hsts).toMatch(/includeSubDomains/);
    expect(hsts).toMatch(/preload/);
  });

  it('sets nosniff, a referrer policy and a permissions policy', () => {
    const h = groups().get('/*') ?? {};
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(h['Permissions-Policy']).toMatch(/geolocation=\(\)/);
  });

  it('marks hashed assets and fonts immutable for a year', () => {
    for (const path of ['/fonts/*', '/_astro/*']) {
      expect(groups().get(path)?.['Cache-Control']).toBe('public, max-age=31536000, immutable');
    }
  });

  it('caches the feed briefly rather than forever', () => {
    expect(groups().get('/feed.xml')?.['Cache-Control']).toMatch(/max-age=3600/);
  });
});
