# ARCHITECTURE — website-xyz

**Version:** 0.1.0
**Status:** scaffold — flesh out as real pages land.

## Design Philosophy

See `PHILOSOPHY.md` for the non-negotiable principles. In short: static,
mobile-first, distinctive, minimal. This file describes *how* the code is
organised to serve those principles.

## System Overview

```
website-xyz/
├── astro.config.mjs   # build + site config
├── package.json       # scripts + dependencies
├── src/
│   ├── pages/         # route-based Astro pages (index.astro = "/")
│   ├── components/    # reusable UI (add as needed)
│   ├── layouts/       # shared page shells (add as needed)
│   └── styles/        # global CSS (add as needed)
├── public/            # static assets served as-is
└── tests/             # vitest suites
```

The entire system compiles to static HTML/CSS/JS in `dist/` via
`npm run build`. There is no runtime server.

## Module Reference

| Path | Purpose |
|------|---------|
| `src/pages/index.astro` | Home page. Placeholder during scaffold. |
| `tests/smoke.test.ts` | Placeholder smoke test until real tests land. |
| `astro.config.mjs` | Site URL, integrations, build config. |

This table grows as modules are added. Every new `src/` subtree gets a row
here in the same PR it lands in.

## Endpoints

None. The site is fully static — no runtime HTTP handlers.

## State Files

None. The site has no persistent state. All content is authored in the repo.

## Security Model

- **No runtime backend** means no auth, no sessions, no secrets at runtime.
- **Build-time secrets** (if any are added later) live in GitHub Actions
  secrets and are never committed.
- **Third-party scripts** (analytics, etc.) are not present today. Any
  addition must be justified against `PHILOSOPHY.md` (performance, tracking
  concerns) before landing.
- **CSP / security headers** are the hosting provider's responsibility and
  documented here when hosting is finalised.

## Error Handling

- Build errors fail `npm run build` and are caught by CI.
- Runtime errors don't exist — there is no runtime.
- 404s are served by the static host's default behaviour (to be configured
  per host when deployment lands).

## Deployment

TBD. Candidate hosts: Cloudflare Pages, Netlify, Vercel, GitHub Pages. The
choice will be documented here and in `CLAUDE.md` once decided.
