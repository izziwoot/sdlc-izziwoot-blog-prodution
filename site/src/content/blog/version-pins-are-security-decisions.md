---
title: Version pins are security decisions
description: A dependency range that cannot reach a patched release is not a preference. It is an unfixable vulnerability sitting in your lockfile.
pubDate: 2026-09-29
tags:
  - security
  - tooling
---

I wrote a specification that mandated a blocking dependency audit, and in the same
document I pinned the two dependencies that made passing it impossible. Both
statements looked reasonable in isolation. Together they were a contradiction, and
nothing caught it until the build ran.

## The pin was the vulnerability

The advisories were not subtle. Two criticals, five highs. What made them
interesting was the patched-version field: the fix existed only on a later major
line. There was no patch release for the version I had pinned, and there never
would be. The range I had written could not reach safety.

<svg viewBox="0 0 440 150" role="img" aria-labelledby="pin-title pin-desc" class="diagram">
  <title id="pin-title">A fix that lands only on a later major line</title>
  <desc id="pin-desc">
    Two horizontal release lines. The upper line, major version five, runs from an
    early release to the current one with no fix marker on it. The lower line, major
    version seven, carries a marker labelled "fix" partway along. A bracket on the
    left shows a pin covering only the upper line, so the fix on the lower line is
    out of reach.
  </desc>

  <line x1="120" y1="45" x2="415" y2="45" stroke="var(--border)" stroke-width="2" />
  <line x1="120" y1="110" x2="415" y2="110" stroke="var(--border)" stroke-width="2" />

  <circle cx="160" cy="45" r="5" fill="var(--fg-muted)" />
  <circle cx="240" cy="45" r="5" fill="var(--fg-muted)" />
  <circle cx="320" cy="45" r="5" fill="var(--fg-muted)" />

  <circle cx="200" cy="110" r="5" fill="var(--fg-muted)" />
  <circle cx="300" cy="110" r="7" fill="var(--accent)" />
  <circle cx="380" cy="110" r="5" fill="var(--fg-muted)" />

  <text x="300" y="136" text-anchor="middle" fill="var(--accent)" font-size="13">fix</text>

  <text x="108" y="50" text-anchor="end" fill="var(--fg)" font-size="14">5.x</text>
  <text x="108" y="115" text-anchor="end" fill="var(--fg)" font-size="14">7.x</text>

  <path d="M40 28 h14 v34 h-14" fill="none" stroke="var(--fg)" stroke-width="2" />
  <text x="30" y="50" text-anchor="end" fill="var(--fg)" font-size="13">pin</text>
</svg>

That reframes what a pin is. `^5` reads like a compatibility statement, and it is
one — but it is also a commitment about which security fixes you are able to
receive. When the fix lands in 7, a project pinned to 5 has quietly opted out.

## Gates only work if you run them

The specification said the audit was blocking. Writing that sentence cost nothing
and proved nothing. The contradiction surfaced the first time a command actually
exited non-zero:

```bash
pnpm audit --audit-level=high
# 20 vulnerabilities found
# Severity: 3 low | 10 moderate | 5 high | 2 critical
```

Every document I had produced was internally consistent and externally wrong. The
build was the only thing with an opinion grounded in reality. The exit code and
the severity counts come from [the pnpm audit command](https://pnpm.io/cli/audit),
which reads the same advisory database the registry publishes.

## What I do differently now

Resolve version pins against the current advisory database at the moment you write
them, not at the moment you first deploy. Treat a major-version pin as a claim that
security fixes reach you through that line, and check that the claim is true. And
run the gate you specified before you write the sentence claiming it passes —
otherwise you are documenting an intention and calling it a control.
