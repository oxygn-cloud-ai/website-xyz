# website-xyz

> oxygn.xyz — AI-native governance, risk, and compliance for regulated financial institutions.

Multi-page marketing site for **Oxygn** — an AI-native managed-service provider delivering Governance, Risk, Compliance, Legal, Internal Audit, and Company Secretary services to Singapore-licensed financial institutions.

Built with [Astro](https://astro.build) + TypeScript. Deploys to Cloudflare Pages.

## Site structure (8 pages)

| Route | Page |
|-------|------|
| `/` | Home — hero, metrics, services overview, how-it-works preview, journey, CTA |
| `/services` | Six service lines detail, flagship MAS licence-acquisition engagement, autonomy model |
| `/how-it-works` | Three-layer operating model, per-client isolation, escalation flow |
| `/trust` | Operator standards, certifications, data residency, professional indemnity |
| `/about` | Mission, founder, qualified human team, jurisdictions |
| `/resources` | MAS Licensing Playbook, methodology, regulatory radar |
| `/contact` | Contact form, company info, demo request |
| `/404` | Styled error page |

## Requirements

- Node.js 20 LTS or newer
- npm

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

## Content architecture

All site content lives in `src/content/site.config.ts` as typed constants. Pages import what they need and pass data to components as props. No runtime state. No API calls. All content is build-time static.

## Configuration

Build-time configuration in `astro.config.mjs`. The site's canonical URL is `https://oxygn.xyz`.

## Contributing

This repo follows the multi-session architecture. Work is coordinated through Jira issues in the AI1 project (epic: AI1-293). See `CLAUDE.md` for project-specific rules.

- All work is TDD (red-green).
- Every behavioural change updates documentation in the same branch.
- PHILOSOPHY.md is human-owned — Master session only, with explicit human approval.

## License

Copyright (c) Oxygn. All rights reserved.
