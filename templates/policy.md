---
id: POL-000
owner: TODO
version: 0.1
last-reviewed: YYYY-MM-DD
next-review: YYYY-MM-DD
publication: IZZIWOOT-GOVERNANCE-DO-NOT-PUBLISH
---

# <Policy name>

## Purpose

Why this policy exists and what it protects.

## Scope

What and who it applies to, and explicitly what it does not.

## Policy

The requirements themselves, stated so compliance is checkable rather than
aspirational.

## Exceptions

How an exception is requested, who approves it, and where it is recorded.

## Review

Reviewed at least annually. CI fails once `next-review` has passed — an annual
review nothing enforces does not happen.

---

**Do not remove the `publication:` line.** It is the sentinel the build-output
leak check greps for. A path-based rule passes the moment someone moves the Astro
root or edits a glob; the sentinel catches the leak regardless of how it happened.
