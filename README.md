# sdlc-izziwoot-blog-prodution

Compliance and security policy repository for the Izzi Woot blog production SDLC.

## Purpose

Single source of truth for the policies, control mappings, and audit evidence that
govern how changes reach production. Everything here is version-controlled so that
policy changes follow the same review path as code.

## Planned structure

| Path | Contents |
| --- | --- |
| `policies/` | Written policies (access control, change management, incident response) |
| `frameworks/` | Control mappings to external frameworks (SOC 2, ISO 27001, NIST) |
| `audits/` | Audit evidence, findings, and remediation tracking |
| `templates/` | Reusable templates for policies, risk assessments, and exceptions |
| `.github/workflows/` | Automated policy linting and evidence checks |

## Conventions

- One policy per file, named in kebab-case (`access-control.md`).
- Every policy carries front matter with `id`, `owner`, `version`, `last-reviewed`,
  and `next-review`.
- Policies are reviewed at least annually; the review date is recorded in git history.
- Changes land via pull request with at least one reviewer from the security owner group.

## Status

Initial scaffold. Directory structure and templates to follow.
