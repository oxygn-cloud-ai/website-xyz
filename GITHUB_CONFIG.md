# GITHUB_CONFIG — website-xyz

Inherits from [`~/.claude/GITHUB_CONFIG.md`](file:///Users/oxygnserver01/.claude/GITHUB_CONFIG.md).
This file documents project-specific config and any deviations from the
global standard.

## Project

- **Repo:** `oxygn-cloud-ai/website-xyz`
- **Type:** Software (static marketing site)
- **Default branch:** `main`
- **Jira epic:** `CPT-2`

## Labels

Uses the full software label set from the global standard:

- Priority: `P1`, `P2`, `P3`, `P4`
- Categories: `bug`, `enhancement`, `security`, `performance`,
  `code-quality`, `documentation`, `ci-failure`

No project-specific labels at scaffold time.

## Branch Protection

`main` is protected per global spec:

- Required status check: `test` (from `.github/workflows/test.yml`)
- Force-push blocked
- Deletions blocked
- `enforce_admins: false` (solo project; flip to true once collaborators join)

## CI

Primary workflow: `.github/workflows/test.yml`

- Runs on push + pull_request to `main`
- Jobs: `test` (install → check → test → build), `notify-failure`,
  `notify-recovery`
- CI failures auto-file to GitHub Issues per the global reference
  implementation (Jira filing from Actions is not yet wired; Master session
  mirrors to Jira until it is).

## Deployment

TBD. The `test.yml` workflow currently only builds and tests — a
`deploy.yml` will be added when the host is chosen.

## Deviations

- **Jira mirror is manual.** The architecture says Jira is the source of
  truth for CI failures, but direct Jira integration from GitHub Actions is
  deferred until the epic exists and credentials are wired. Until then, the
  Master session mirrors `ci-failure` GitHub issues into the Jira epic.
