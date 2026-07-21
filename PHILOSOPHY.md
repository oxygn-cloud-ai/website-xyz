# PHILOSOPHY — oxygn.xyz

> The source of truth for why this site exists and how decisions are made.
> Owned by the human + Master session. No other session modifies this file.

## Vision

**oxygn.xyz is Oxygn's public brand surface and client-acquisition engine.** It
communicates who Oxygn is, what the company delivers, and why regulated financial
institutions should trust Oxygn with their Governance, Risk, Compliance, Legal,
Internal Audit, and Company Secretary obligations. It is a static,
distribution-ready marketing site — not an app, not a store, not a CMS.

## Mission

Convert heads of compliance, risk, and legal at Singapore MPI, SPI, and CMS
licensees and aspirants into qualified conversations. Every page must answer the
question: "Why should a regulated financial institution trust Oxygn with their
regulatory obligations?"

## Audience

**Primary:** Heads of Compliance, Chief Risk Officers, General Counsel, Heads of
Internal Audit, and Company Secretaries at Singapore-licensed financial
institutions.

**Secondary:** Regulators, professional advisers who refer clients, potential
hires, and the broader AI and fintech community.

## Non-Negotiable Principles

1. **Mobile-first responsive.** Every page is designed on a phone first,
   desktop second. If it does not feel right in a 375px viewport, it does not
   ship.
2. **Minimal, distinctive visual design.** No generic AI aesthetic. No stock
   hero + three-column-features layout. Custom typography, restrained colour
   palette. The site should feel hand-crafted and obviously not a template.
3. **Craft over quantity.** Pages done beautifully, not many done mediocrely.
4. **Static and boring infrastructure.** The site builds to static assets and
   deploys anywhere. No runtime servers, no databases, no auth systems inside
   this repo.
5. **Small dependency footprint.** Adding a dependency is a decision that
   requires justification. We prefer framework primitives.
6. **Defensibility as through-line.** Every page answers "why should an FI
   trust Oxygn with their regulatory obligations?" Content leads with the
   buyer's regulatory problem, not Oxygn's technology.
7. **Confident, not hype-driven.** The site says what Oxygn does. It does not
   overclaim. It does not represent Oxygn as a MAS-licensed entity it is not.
   It speaks with the authority of a professional-services firm, not a startup.

## Content Standards

- **British English.** Formal grammar. No em dashes — use commas, semicolons,
  colons, or full stops.
- **Problem-first framing.** Every section starts from the FI buyer's pain
  point, not Oxygn's capability.
- **Specific over abstract.** Concrete service descriptions, real jurisdiction
  names, actual regulatory instruments (PSA, SFA, MAS Notices).
- **No Claude attribution in any artifact.** Per global CLAUDE.md rule.

## Naming Strategy

Internal Machine terminology is translated for public-facing use with selective
distinctiveness — professional enough for an FI buyer, distinctive enough to
signal category-defining ambition:

| Internal | Public |
|----------|--------|
| The Machine | Oxygn Platform |
| The Hive | AI Workforce |
| The Bees | AI Specialists / AI Agents |
| Codex | Governance Framework |
| Articles | Founding Principles |
| Conclave | Escalation Protocol |
| Governor | Compliance Engine |
| Periscope | Regulatory Intelligence |
| 6 Pillars | 6 Service Lines |

## Visual Identity

| Element | Value |
|---------|-------|
| Paper | `#F7F4ED` (cream) |
| Ink | `#0A0A0A` (near-black) |
| Accent | `#FF4A1C` (orange-red) |
| Display font | Jost (200–600) |
| Editorial font | Instrument Serif (italic) |
| Mono font | JetBrains Mono (300, 400) |

The design language borrows from gradient-labs.ai's confident B2B SaaS layout
structure — clear visual hierarchy, metric-forward sections, card-grid service
presentation, sticky navigation — rendered in Oxygn's own restrained palette.

## Explicitly Out of Scope

- **User auth / accounts.** Not here. If a product needs auth, it lives in a
  separate repo.
- **Database / dynamic backend.** The site is pre-rendered. No runtime DB.
- **E-commerce / payments.** No checkout flow, no Stripe integration.
- **Blog / CMS integration (for now).** Content is authored directly in the
  repo. A CMS may be added later.
- **Analytics / tracking.** Zero visitor tracking. This may change with
  explicit human approval.
- **Client data.** No client data of any kind lives in this repo or on this
  site. The site is marketing only.

## Operating Rules

- Any instruction, plan, or PR that conflicts with this document must stop and
  consult the human. Do not silently drift.
- When in doubt, ship less.
- When a principle genuinely needs to change, that change is a PR to this
  file, not a workaround in code.
- PHILOSOPHY.md is human-owned. Only the Master session may edit it, and only
  with explicit human approval per change.
