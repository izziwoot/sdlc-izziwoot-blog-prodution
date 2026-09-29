/** Directives where a wildcard source is a real loosening. */
const FETCH_DIRECTIVES = [
  'default-src',
  'script-src',
  'style-src',
  'img-src',
  'font-src',
  'connect-src',
  'frame-src',
];

/** Must never carry 'unsafe-inline'. */
const NO_INLINE_DIRECTIVES = ['script-src', 'style-src'];

/** Present, or the policy is not actually locked down. */
const REQUIRED_DIRECTIVES = [
  'default-src',
  'base-uri',
  'object-src',
  'frame-ancestors',
  'form-action',
];

/**
 * @param {string} text
 * @returns {Map<string, Record<string, string>>}
 */
export function parseHeadersFile(text) {
  /** @type {Map<string, Record<string, string>>} */
  const groups = new Map();
  let current = null;
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      current = line.trim();
      if (!groups.has(current)) groups.set(current, {});
      continue;
    }
    if (current === null) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    // Only the FIRST colon separates name from value — a CSP value is full of them.
    groups.get(current)[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return groups;
}

/**
 * @param {string} value
 * @returns {Record<string, string[]>}
 */
export function parseCsp(value) {
  /** @type {Record<string, string[]>} */
  const directives = {};
  for (const part of value.split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    directives[tokens[0]] = tokens.slice(1);
  }
  return directives;
}

/**
 * @returns {string[]} problems; empty means the policy is acceptable.
 *
 * The style-src-attr rule is the subtle one. Shiki emits inline style ATTRIBUTES
 * on <pre> and on every highlighted token, and CSP style-src covers attributes as
 * well as <style> elements — so a policy without style-src-attr silently strips
 * all syntax colour, with no build error and nothing visible locally.
 * style-src-attr 'unsafe-inline' scopes the exception to attributes only:
 * <style> elements and external stylesheets stay forbidden. Putting
 * 'unsafe-inline' into style-src itself would also permit <style> and is worse.
 */
/**
 * @param {Record<string, string[]>} directives
 * @param {{ requiredFrameOrigins?: string[] }} [options]
 */
export function checkCsp(directives, { requiredFrameOrigins = [] } = {}) {
  /** @type {string[]} */
  const problems = [];

  for (const name of REQUIRED_DIRECTIVES) {
    if (!directives[name]) problems.push(`missing ${name}`);
  }

  if (!directives['style-src-attr']) {
    problems.push(
      "missing style-src-attr: without it, style-src blocks Shiki's inline style " +
        'attributes and every code block loses its colours, silently',
    );
  }

  for (const name of NO_INLINE_DIRECTIVES) {
    if ((directives[name] ?? []).includes("'unsafe-inline'")) {
      problems.push(
        `${name} permits 'unsafe-inline'` +
          (name === 'style-src' ? " — use style-src-attr 'unsafe-inline' instead" : ''),
      );
    }
  }

  for (const [name, sources] of Object.entries(directives)) {
    for (const source of sources) {
      if (source === "'unsafe-eval'") problems.push(`${name} permits 'unsafe-eval'`);
      if (source === '*' && FETCH_DIRECTIVES.includes(name)) {
        problems.push(`${name} permits a wildcard source`);
      }
      if (source.startsWith('http://')) {
        problems.push(`${name} permits insecure origin ${source}`);
      }
    }
  }

  for (const origin of requiredFrameOrigins) {
    const frame = directives['frame-src'] ?? directives['default-src'] ?? [];
    if (!frame.includes(origin)) {
      problems.push(`frame-src does not permit ${origin} — the comments iframe would be blocked`);
    }
  }

  return problems;
}
