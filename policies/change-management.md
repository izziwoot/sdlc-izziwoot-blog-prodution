---
id: POL-001
owner: Adilson Cesar
version: 1.0
last-reviewed: 2026-10-01
next-review: 2027-10-01
publication: IZZIWOOT-GOVERNANCE-DO-NOT-PUBLISH
---

# Change management

## Purpose

To make every change that reaches production traceable to a reviewed pull request
with a recorded result, so that what is deployed can be explained after the fact
rather than reconstructed.

## Scope

Applies to every branch, file, and deployment in this repository, including
governance documents under `policies/`, `frameworks/`, and `audits/`, and including
changes authored with AI assistance.

It does **not** apply to the author's local working tree before a push, nor to
forks outside this organisation.

## Policy

1. **`main` is written only through a pull request.** Direct pushes are rejected by
   a repository ruleset targeting the default branch. Verified by probe: a push to
   `main` returns `GH013: Repository rule violations found` with
   "Changes must be made through a pull request."

2. **Two status checks are required to merge:** `gitleaks` and `dependencies`. Both
   come from `security.yml`, which is deliberately not path-filtered, so both report
   on every pull request regardless of what it touches.

3. **The remaining gates are not required checks, and this is deliberate.** `verify`
   (`site.yml`) and `frontmatter` (`governance.yml`) are path-filtered. A required
   check that cannot report blocks a pull request permanently, so requiring `verify`
   would make a documentation-only change unmergeable. Both still run on the pull
   requests they apply to, and both still show red on failure; they are enforced by
   attention rather than by the ruleset. Removing the path filters to make them
   requirable would mean running a full site build on every governance edit, which
   the path-scoping exists to avoid.

4. **Zero approving reviews are required, and the control is the recorded trail —
   not independent review.** This is stated plainly because the alternative is
   misleading. GitHub forbids approving one's own pull request, and this repository
   has one maintainer with write access, so any non-zero approval requirement would
   either deadlock every merge or be bypassed by administrator override on every
   merge. An override exercised routinely is not a control; it is a control that
   reports success while doing nothing. What this policy claims, and what the
   configuration actually delivers, is that every change to `main` exists as a pull
   request with its diff, its description, its check results, and its merge
   timestamp preserved.

   If a second maintainer with write access becomes a standing reviewer, raise the
   requirement to one approval and amend this clause. Read-only collaborators cannot
   satisfy it.

5. **History is linear and append-only.** Merges are squash or rebase; merge commits
   are not an allowed method. Force-pushes and branch deletion on `main` are blocked.

6. **Stale approvals are dismissed on push,** so an approval always refers to the
   code that merged.

7. **A published post URL is never deleted or moved.** Corrections and retractions
   change content, never the path.

## Exceptions

Request an exception in the pull request description, stating what is being skipped
and why. The maintainer approves or declines it there, so the decision is recorded
against the change it applies to. Record any exception exercised under `audits/`
with the date, the reason, and the compensating control if one exists.

Administrator override is not an exception route. If a rule has to be bypassed to
ship, the rule is wrong and should be changed on the record instead.

## Review

Reviewed at least annually. CI fails once `next-review` has passed — an annual
review nothing enforces does not happen.
