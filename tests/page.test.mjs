// Checks the oxygn.xyz page itself: it must stay CSP-safe (no inline style or
// script), follow the copy rules (no em dashes, no dates), keep every in-page
// link working, and carry the real register figures it quotes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../site/assets/site.css', import.meta.url), 'utf8');
const visible = html
  .replace(/<head>[\s\S]*?<\/head>/, '')
  .replace(/<[^>]+>/g, ' ');

test('no inline styles or scripts (the CSP would block them)', () => {
  assert.doesNotMatch(html, /\sstyle=/i);
  assert.doesNotMatch(html, /<style/i);
  for (const s of html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || []) {
    assert.match(s, /^<script\b[^>]*\ssrc="\/[^"]+"[^>]*><\/script>$/, `inline script: ${s.slice(0, 60)}`);
  }
  assert.doesNotMatch(html, /\son[a-z]+=/i);
});

test('copy rules: no em dashes, no dates', () => {
  assert.ok(!visible.includes('—'), 'em dash in visible copy');
  assert.doesNotMatch(visible, /\b(19|20)\d\d\b/, 'a year in visible copy');
  assert.doesNotMatch(visible, /\b(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.? \d/);
});

test('never names the client', () => {
  assert.doesNotMatch(html, /zetl|chocolate|chocfin|cygnus|deneb/i);
});

test('every in-page link has a target', () => {
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const [, frag] of html.matchAll(/href="#([^"]*)"/g)) {
    if (frag === '_' || frag === '') continue;
    assert.ok(ids.has(frag), `#${frag} has no target`);
  }
});

test('quotes the real register figures', () => {
  for (const want of ['275', '24/7/365', '167', 'Risk Accepted']) {
    assert.ok(visible.includes(want), `page lacks "${want}"`);
  }
});

test('no speed or timing claims: the message is continuous assessment', () => {
  assert.doesNotMatch(visible, /5 min 26|per minute|1\.6 s|one every|in \d+ min/i);
});

test('has the sections the page promises', () => {
  for (const id of ['top', 'desk', 'functions', 'how', 'faq', 'enquire']) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  }
  const faqs = html.match(/<details\b/g) || [];
  assert.ok(faqs.length >= 6, `only ${faqs.length} FAQ entries`);
});

test('motion is optional: reduced-motion users get stills and no CSS motion', () => {
  assert.match(css, /@media \(prefers-reduced-motion:\s?reduce\)\{[^}]*animation:none/);
});

test('the enquiry form is untouched', () => {
  assert.match(html, /<form id="talk-form" method="post" action="\/api\/contact">/);
  for (const n of ['name', 'email', 'company', 'domain', 'linkedin', 'message', 'website']) {
    assert.match(html, new RegExp(`name="${n}"`));
  }
});

test('function windows list what each covers (owner edits)', () => {
  const fn = (name) => html.match(new RegExp(`<span>${name}</span>[\\s\\S]*?</ul>`))?.[0] ?? '';
  assert.doesNotMatch(fn('Compliance'), /KYC/i);
  assert.match(fn('Governance'), /<li>Statutory filings<\/li>/);
});

test('content sits in a narrow 1240px column, like typesafe.ai (backgrounds stay full width)', () => {
  assert.match(css, /--pad:max\(clamp\([^)]*\),calc\(50% - 38\.75rem\)\)/);
});

test('the legal function is called "legal operations" everywhere', () => {
  assert.match(html, /<span>Legal operations<\/span>/);
  assert.doesNotMatch(html, /\blegal\b(?! operations)/i);
});
