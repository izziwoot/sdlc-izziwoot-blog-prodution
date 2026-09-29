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
