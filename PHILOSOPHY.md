# PHILOSOPHY — oxygn.xyz

> The source of truth for why this project exists and how decisions are made.
> Owned by the human + Master session. No other session modifies this file.

## Vision

**oxygn.xyz is Oxygn's company homepage and brand hub.** It introduces who we
are, what we build, and gives visitors a clear path to our products, writing,
and ways to reach us. It is a static, distribution-ready marketing surface —
not an app, not a store, not a CMS.

## Mission

Communicate Oxygn's identity and work with clarity and taste. The site should
feel hand-crafted, distinctive, and obviously not a template. Visitors should
be able to understand what we do within a few seconds of landing.

## Non-Negotiable Principles

1. **Mobile-first responsive.** Every page is designed on a phone first,
   desktop second. If it doesn't feel right in a 375px viewport, it's not
   shipping.
2. **Minimal, distinctive visual design.** No generic AI aesthetic. No stock
   hero + three-column-features layout. Every surface is a deliberate design
   choice. Prefer custom typography, unusual layouts, and restrained colour
   palettes over busy gradients and off-the-shelf component kits.
3. **Craft over quantity.** One page done beautifully beats five pages done
   mediocrely.
4. **Static and boring infra.** The site must build to static assets and
   deploy anywhere. No runtime servers, no databases, no auth systems inside
   this repo.
5. **Small dependency footprint.** Adding a dependency is a decision that
   requires justification. We prefer stdlib / framework primitives.

## Explicitly Out of Scope

- **User auth / accounts.** Not here. If a product needs auth, it lives in a
  separate repo.
- **Database / dynamic backend.** The site is pre-rendered. No runtime DB.
- **E-commerce / payments.** No checkout flow, no Stripe integration.
- **Blog / CMS integration (for now).** Content is authored directly in the
  repo. A CMS may be added later as a separate phase with its own PHILOSOPHY
  update.

## Operating Rules

- Any instruction, plan, or PR that conflicts with the above must stop and
  consult the human. Do not silently drift.
- When in doubt, ship less.
- When a principle genuinely needs to change, that change is a PR to this
  file, not a workaround in code.
