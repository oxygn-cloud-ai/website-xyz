# CLAUDE.md — website-xyz

Project-specific instructions. Inherits from the global
`~/.claude/CLAUDE.md` — this file only documents deviations and
project-specific context.

## Project

- **Name:** website-xyz
- **Type:** Software — static marketing website
- **Description:** oxygn.xyz company website
- **Version:** 0.1.0 (see `package.json`)
- **Repo:** `oxygn-cloud-ai/website-xyz`
- **Jira epic:** `CPT-2`
- **Hosting:** TBD

## Stack

- **Framework:** [Astro](https://astro.build) 4.x
- **Language:** TypeScript (strict)
- **Test runner:** Vitest
- **Node:** 20 LTS

## Key Files

| Path | Purpose |
|------|---------|
| `PHILOSOPHY.md` | Vision, principles, out-of-scope (human-owned) |
| `ARCHITECTURE.md` | System layout, module reference |
| `astro.config.mjs` | Site + build config |
| `src/pages/` | Route-based pages |
| `tests/` | Vitest suites |
| `.github/workflows/test.yml` | CI (build + test + notify-failure) |

## Development Commands

```bash
npm install       # first-time setup
npm run dev       # local dev server
npm run build     # static build to ./dist
npm run preview   # preview built output
npm run check     # astro/TS typecheck
npm test          # vitest
```

## Multi-Session Architecture

This project follows `~/.claude/MULTI_SESSION_ARCHITECTURE.md` with the full
11-session software profile (chk1, chk2, playtester included). Session
worktrees live under `.worktrees/` and their branches are `session/<role>`.

Startup prompts for each role are in `.claude/sessions/<role>.md`.

## Philosophy Ownership

`PHILOSOPHY.md` is **human-owned**. Only the Master session may edit it,
and only with explicit human approval per change.

## Sandbox (Playtester)

Playtester runs the built site in an isolated environment. Recommended:
a Docker container serving `dist/` via a static HTTP server (e.g.,
`npx serve dist`) on a port not used by the dev machine. Specific sandbox
setup will be documented here once the Playtester session is configured.

## Deviations From Global Standards

- None at scaffold time. Record any future deviations here with justification.
