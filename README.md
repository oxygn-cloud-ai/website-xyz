# website-xyz

> oxygn.xyz company website — static, mobile-first marketing surface.

Built with [Astro](https://astro.build) + TypeScript. Deploys to any static
host.

## Features

- Statically rendered marketing site
- Mobile-first responsive layout
- Zero runtime backend

## Requirements

- Node.js 20 LTS or newer
- npm (or pnpm/yarn, but examples assume npm)

## Installation

```bash
git clone git@github.com:oxygn-cloud-ai/website-xyz.git
cd website-xyz
npm install
```

## Usage

```bash
npm run dev       # start dev server
npm run build     # build static output to ./dist
npm run preview   # preview production build locally
npm run check     # astro/TS typecheck
npm test          # run vitest suite
```

## Configuration

All build-time configuration lives in `astro.config.mjs`. The site's canonical
URL is `https://oxygn.xyz`.

## Troubleshooting

- **Port 4321 already in use:** run `npm run dev -- --port 4322` (or stop the
  other process).
- **Type errors after a dependency bump:** run `npm run check` and fix before
  committing.

## Contributing

This repo follows the multi-session architecture defined in
[`~/.claude/MULTI_SESSION_ARCHITECTURE.md`](file:///Users/oxygnserver01/.claude/MULTI_SESSION_ARCHITECTURE.md).
Work is coordinated through Jira issues in the `CPT` project (epic: see
`CLAUDE.md`). See `CLAUDE.md` and `GITHUB_CONFIG.md` for project-specific
rules.

- Bug fixes and features happen on `fix/PROJ-<n>` or
  `feature/PROJ-<n>-<slug>` branches.
- All work is TDD (red-green).
- Every change that affects documented behaviour updates `README.md` and
  `ARCHITECTURE.md` in the same branch.

## License

Copyright (c) Oxygn. All rights reserved. (License to be finalised.)
