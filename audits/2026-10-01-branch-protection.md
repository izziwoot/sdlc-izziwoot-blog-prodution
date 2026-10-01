---
id: AUD-002
owner: Adilson Cesar
version: 1.0
last-reviewed: 2026-10-01
next-review: 2027-10-01
publication: IZZIWOOT-GOVERNANCE-DO-NOT-PUBLISH
---

# Branch protection on `main`

Task 22. Records what this repository's plan supports, the two decisions spec §10.1
and §10.2 left open, the configuration applied, and the probe that shows it enforces.

## Capability, verified against the live API

Spec §10.1 flagged ruleset availability as **unverified**. It is now verified, and
the answer turned on repository visibility rather than on the plan tier:

| Check | Result |
| --- | --- |
| `GET /repos/:owner/:repo` | `visibility=public`, `owner.type=Organization`, plan `free` |
| `GET /branches/main/protection` while **private** | `403 — Upgrade to GitHub Pro or make this repository public` |
| `GET /branches/main/protection` while **public** | `404 Branch not protected` — configurable, unconfigured |
| `GET /rulesets` | one ruleset, id `24330528` |

Branch protection is unavailable on a private repository on this plan. Making the
repository public is what made Task 22 configurable; nothing was purchased.

## Decisions

**§10.1 — required status checks cannot be path-scoped.** Required: `gitleaks` and
`dependencies` only. Both come from `security.yml`, which carries no path filter, so
both report on every pull request. `verify` and `frontmatter` are path-filtered and
are deliberately **not** required: a required check that never reports blocks a pull
request permanently, so requiring `verify` would make a documentation-only change
unmergeable. Two of the four pull requests merged on 2026-10-01 touched no `site/`
path and would have been stuck.

**§10.2 — "at least one reviewer" is unsatisfiable with one maintainer.** Resolved as
**zero required approvals**, with `policies/change-management.md` §4 stating that the
control is the recorded trail rather than independent review.

A one-approval variant was configured first and deliberately left unenforced. The
repository has a second collaborator, `MateusHenriqueOliveira`, but with
`push=false`: a read-only collaborator's approval does not satisfy a required review,
so activating that variant would have made `main` unmergeable. Raising the
requirement later means granting write access first.

## Configuration applied

Ruleset `24330528`, target `branch`, enforcement **active**, conditions
`ref_name.include = ["~DEFAULT_BRANCH"]`.

| Rule | Value |
| --- | --- |
| `pull_request` | 0 approvals; dismiss stale reviews on push; merge methods squash and rebase only |
| `required_status_checks` | `gitleaks`, `dependencies`; strict (branch must be current) |
| `non_fast_forward` | force-pushes blocked |
| `deletion` | branch deletion blocked |

The ruleset's initial state had two defects that would have made it inert: enforcement
was `disabled`, and `conditions.ref_name` had empty `include` and `exclude`, so it
matched no branch even if enabled. Both are corrected above.

## Evidence that it enforces

Configuration was not taken as proof. An empty commit pushed directly to `main`:

```
remote: error: GH013: Repository rule violations found for refs/heads/main.
remote: - Changes must be made through a pull request.
remote: - 2 of 2 required status checks are expected.
 ! [remote rejected] main -> main (push declined due to repository rule violations)
```

The probe commit was reset locally and `main` was unchanged at `adef5ca`.

## Known limits, accepted

- **`verify` is not gated by the ruleset.** A site change can merge with `verify`
  red if someone ignores it. Accepted, because the alternative — removing the path
  filters so the check always reports — runs a full build and Lighthouse pass on
  every governance edit. Enforced by attention, recorded here as such.
- **Administrators are not exempted, and no bypass actors are configured.** There is
  no standing override. A rule that has to be bypassed should be changed instead.
- **Zero approvals means no second pair of eyes.** On 2026-10-01 a dependency bump
  merged before its `verify` run finished; the ruleset now prevents that specific
  case by requiring the two unfiltered checks, but it does not substitute for review.
