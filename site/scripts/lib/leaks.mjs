/**
 * INV-3: nothing from the governance trees may reach build output.
 *
 * Two independent checks, deliberately. A path rule passes the moment someone
 * moves the Astro root, edits a content glob, or adds a publicDir alias — the
 * document still leaks, the rule still says fine. The content sentinel catches it
 * regardless of how it happened, which is why every governance file carries the
 * marker in its front matter.
 */
export const SENTINEL = 'IZZIWOOT-GOVERNANCE-DO-NOT-PUBLISH';

const PRIVATE_KEY = /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/;

/** A tenfold jump means something unintended got globbed. */
const DRIFT_FACTOR = 10;

/**
 * @typedef {{ path: string, kind: string, message: string }} Problem
 * @typedef {{ count: number, bytes: number }} Volume
 *
 * @param {{
 *   files: { path: string, content: string }[],
 *   sentinel: string,
 *   forbiddenPaths: string[],
 *   forbiddenExtensions: string[],
 *   current?: Volume,
 *   baseline?: Volume | null,
 * }} input
 * @returns {Problem[]} empty means clean
 */
export function findLeaks({
  files,
  sentinel,
  forbiddenPaths,
  forbiddenExtensions,
  current,
  baseline,
}) {
  /** @type {Problem[]} */
  const problems = [];

  if (current && baseline) {
    if (
      current.count > baseline.count * DRIFT_FACTOR ||
      current.bytes > baseline.bytes * DRIFT_FACTOR
    ) {
      problems.push({
        path: '(output)',
        kind: 'volume-drift',
        message:
          `output grew from ${baseline.count} files / ${baseline.bytes} bytes to ` +
          `${current.count} / ${current.bytes} — verify nothing unintended was globbed`,
      });
    }
  }

  for (const { path, content } of files) {
    const segments = path.split('/').filter(Boolean);

    // Only a PATH SEGMENT counts. A post named writing-policies-that-hold must
    // not trip this, or the guard becomes something the author fights.
    if (segments.some((s) => forbiddenPaths.includes(s))) {
      problems.push({
        path,
        kind: 'forbidden-path',
        message: 'output path contains a governance directory name (INV-3)',
      });
      continue;
    }

    if (forbiddenExtensions.some((ext) => path.endsWith(ext))) {
      problems.push({
        path,
        kind: 'forbidden-extension',
        message: 'credential-shaped file in published output',
      });
      continue;
    }

    if (content.includes(sentinel)) {
      problems.push({
        path,
        kind: 'sentinel',
        message: 'governance sentinel found in published output — a policy document leaked (INV-3)',
      });
      continue;
    }

    if (PRIVATE_KEY.test(content)) {
      problems.push({ path, kind: 'private-key', message: 'private key material in output' });
    }
  }

  return problems;
}
