# Secret scanning

The highest-likelihood risk in this project is not the site breaking. It is a
credential, an internal hostname, or a client name reaching a **public**
repository inside a draft about real work.

## Local setup

The pre-commit hook lives in `.githooks/` rather than `.git/hooks/`, so it is
version-controlled. Git needs pointing at it once per clone:

```bash
git config core.hooksPath .githooks
brew install gitleaks   # or https://github.com/gitleaks/gitleaks/releases
```

`pnpm install` inside `site/` runs this via the `prepare` script, so usually you
get it for free. The hook **warns rather than fails** when gitleaks is missing, so
a fresh clone is never bricked by a missing tool — CI is the blocking gate.

## CI

The blocking gate is the `gitleaks` job in `.github/workflows/security.yml`, which
is deliberately **not** path-filtered: a secret can land in any file.

It runs the gitleaks **binary**, pinned to the same version the hook uses and
verified against a published SHA-256 before it executes. It does not use
`gitleaks/gitleaks-action`, which from v2 refuses to run for a GitHub
organization without a purchased `GITLEAKS_LICENSE`. `izziwoot` is an
organization, so that action failed with `missing gitleaks license` on every run
— the control this document calls the blocking gate was not executing at all.
Reading the job's own logs is what surfaced that; the workflow file looked
correct.

Two consequences worth keeping in mind:

- **The version is pinned in two places** — `.github/workflows/security.yml` and
  whatever the developer has installed locally. They are meant to match, so that
  local and CI cannot disagree about what counts as a secret. Bumping one is a
  deliberate change to both.
- **The subcommand is version-sensitive.** 8.30 removed `detect` and hides
  `protect`; history scanning is `gitleaks git`. A future major may remove
  `protect`, which the hook still uses, and the hook fails *closed* — it would
  block commits rather than skip silently.

## If something is caught

**Do not commit and then revert.** This repository is public and git history is
permanent: a revert hides the value without removing it, and anyone can read the
earlier commit.

1. Remove it from the staged change.
2. If it is a real credential, **rotate it**. Rotation is the remediation; nothing
   else is.
3. Record the incident under `audits/`.

## Before writing about real work

`.gitleaks.toml` carries a rule called `izziwoot-internal-disclosure` with a
placeholder regex. **Fill it in** with the actual hostnames and client names that
must never appear in a post. Generic rules catch API keys; nothing generic catches
a client's name in a war story, and that is the likelier leak here.

## Known allowlists

Three, each narrow on purpose:

| What | Why |
| --- | --- |
| `PUBLIC_GISCUS_*`, `PUBLIC_CF_BEACON_TOKEN` identifier **names** | Public by design and embedded in the page. Matching the names, not arbitrary values near them |
| `pnpm-lock.yaml` | Integrity hashes are not secrets |
| Two documented patterns in `plan/`, `spec/`, `intent/` markdown | Those documents describe the detection patterns, so the scanner matches its own rules. Uses `condition = "AND"`, so both path and pattern must match — a real credential pasted into `plan/` is still caught |

The `condition = "AND"` detail matters. A gitleaks allowlist defaults to **OR**,
which would have permitted the pattern in *any* file. An allowlist written without
it is a hole, not an exemption.
