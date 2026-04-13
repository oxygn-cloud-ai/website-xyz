# Hosting Plan: website-xyz (oxygn.xyz)

## Context

Static Astro 4.16 site. Output is `dist/`. Domain is `oxygn.xyz`. Oxygn has a Cloudflare account. `wrangler` is installed locally. No deployment config exists. CI runs on GitHub Actions. Secrets live in BWS (not needed for this deployment). The plan was adversarially reviewed twice and revised.

## Host: Cloudflare Pages with Git Integration

Git Integration connects Cloudflare directly to the GitHub repo via OAuth. Cloudflare runs the build on its infrastructure and deploys automatically on push to main. Preview URLs are created for every PR.

**Why Git Integration over GitHub Actions + Wrangler:**
- This is a static marketing site with no build-time secrets. BWS integration adds complexity for zero benefit here.
- Preview deployments work out of the box. No workflow code needed.
- No API token to manage or rotate.
- Branch protection already requires the `test` check to pass before merge to main. Code that reaches main has already passed tests. The "race condition" (CF deploys before GH Actions finishes) is theoretical because code only lands on main through a merged PR that already passed.

**Acknowledged tradeoff:** Git Integration is permanent per-project. If we later need deploy-on-test-success gating or wrangler-based deploys, we must delete and recreate the Pages project. This is acceptable for a marketing site. The trigger for migration: if we add staging environments, deploy gates, or build-time secrets. Document this in ARCHITECTURE.md.

## Pre-flight checks (before any setup)

### DNS verification
Confirm that `oxygn.xyz` is a Cloudflare-managed zone on the same account:
```bash
# Check if wrangler can see the zone
wrangler dns list oxygn.xyz
# Or check Cloudflare dashboard: Websites > oxygn.xyz
```
If DNS is at a registrar: either migrate nameservers to Cloudflare (and disable DNSSEC at registrar first, wait for propagation) or use `www.oxygn.xyz` with a CNAME and redirect.

### GitHub org app permissions
The `oxygn-cloud-ai` org may restrict third-party OAuth apps. The person connecting must be an org owner. Verify at: GitHub > oxygn-cloud-ai > Settings > Third-party access.

## Implementation

### Step 1: Add `.nvmrc`

Pin Node version in source so local, CI, and Cloudflare all use the same version.

Create `.nvmrc`:
```
20
```

Update `.github/workflows/test.yml` to read from `.nvmrc` instead of hardcoding:
```yaml
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'
```

### Step 2: Add `src/pages/404.astro`

Cloudflare Pages auto-serves `404.html` for missing routes. Without it, unmatched URLs get a generic Cloudflare 404 that breaks the brand. Create a styled 404 page using the existing Base layout and Wordmark component.

### Step 3: Add `public/robots.txt`

```
User-agent: *
Allow: /
Sitemap: https://oxygn.xyz/sitemap-index.xml
```

### Step 4: Add sitemap

Install `@astrojs/sitemap` and add to `astro.config.mjs`:
```js
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://oxygn.xyz',
  integrations: [sitemap()],
});
```

This auto-generates `sitemap-index.xml` and `sitemap-0.xml` at build time.

### Step 5: Add `public/_headers`

Exact CSP for this site (loads Google Fonts stylesheets and font files, Astro emits inline styles):

```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), accelerometer=(), gyroscope=(), magnetometer=(), payment=(), usb=(), display-capture=(), autoplay=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains
```

Note: no `preload` on HSTS until we confirm all subdomains are HTTPS-ready and intend to submit to the preload list.

### Step 6: Add `public/_redirects`

```
https://www.oxygn.xyz/* https://oxygn.xyz/:splat 301
```

This only works after `www.oxygn.xyz` is attached to the Pages project (Step 8).

### Step 7: Cloudflare dashboard setup (manual, one-time)

1. Log into Cloudflare > Pages > Create a project
2. Connect to GitHub > authorize for `oxygn-cloud-ai` org > select `website-xyz`
3. Configuration:
   - Production branch: `main`
   - Framework preset: Astro
   - Build command: `npm run build`
   - Build output directory: `dist`
4. Environment variables (set for BOTH Production and Preview):
   - `NODE_VERSION` = `20` (backup pin; `.nvmrc` is primary but belt-and-suspenders)
5. Deploy

### Step 8: Custom domains (manual, in Cloudflare dashboard)

1. Pages project > Custom Domains > Add `oxygn.xyz`
   - If CF manages DNS, the CNAME record is auto-added
   - HTTPS via Cloudflare edge certificate (automatic)
2. Also add `www.oxygn.xyz` so the `_redirects` rule can fire
3. Verify CAA records do not block certificate issuance

### Step 9: Update project docs

- `ARCHITECTURE.md`: fill in Deployment section (Cloudflare Pages, Git Integration, custom domain, migration trigger)
- `CLAUDE.md`: update Hosting from "TBD" to "Cloudflare Pages (Git Integration)"
- `GITHUB_CONFIG.md`: note that deploy is on Cloudflare, not GitHub Actions

## Files to create/modify

| File | Action |
|------|--------|
| `.nvmrc` | Create |
| `src/pages/404.astro` | Create |
| `public/robots.txt` | Create |
| `public/_headers` | Create |
| `public/_redirects` | Create |
| `astro.config.mjs` | Add sitemap integration |
| `package.json` | Add `@astrojs/sitemap` dependency |
| `.github/workflows/test.yml` | Read Node version from `.nvmrc` |
| `ARCHITECTURE.md` | Update deployment section |
| `CLAUDE.md` | Update hosting field |
| `GITHUB_CONFIG.md` | Note deploy model |

## Verification

1. `npm run build` succeeds locally with sitemap output in `dist/`
2. Cloudflare dashboard shows successful first deploy
3. `website-xyz.pages.dev` serves the site with correct fonts, animations, 404 page
4. `https://oxygn.xyz` resolves with HTTPS
5. `https://www.oxygn.xyz` redirects to `https://oxygn.xyz`
6. Security headers verified via `curl -I https://oxygn.xyz`
7. `https://oxygn.xyz/nonexistent` serves the custom 404 page
8. `https://oxygn.xyz/robots.txt` serves correctly
9. `https://oxygn.xyz/sitemap-index.xml` serves the sitemap
10. Open a test PR, verify Cloudflare creates a preview deployment URL
11. GitHub Actions `test` check still gates merges on `main`
