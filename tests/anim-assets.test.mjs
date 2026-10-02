// Checks the animated illustrations in site/assets/anim/ (built by
// scripts/build-anim.py). They are served under the site-wide CSP, which
// blocks inline <style> and <script>, so animation must be SMIL only. Each has
// a still twin for prefers-reduced-motion. They are drawn from client
// screenshots, so no client text may ever appear in them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const dir = new URL('../site/assets/anim/', import.meta.url);
const names = ['queue', 'assess', 'register', 'written', 'decided', 'priority', 'rate'];
const read = (f) => readFileSync(new URL(f, dir), 'utf8');
const html = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');

for (const n of names) {
  for (const f of [`${n}.svg`, `${n}-still.svg`]) {
    test(`${f} exists and is a standalone SVG`, () => {
      assert.ok(existsSync(new URL(f, dir)), `${f} missing`);
      const s = read(f);
      assert.match(s, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"[^>]* viewBox="0 0 \d+ \d+"/);
      assert.match(s.trim(), /<\/svg>$/);
      assert.equal((s.match(/<svg\b/g) || []).length, 1);
    });

    test(`${f} uses nothing the CSP or an <img> context would block`, () => {
      const s = read(f);
      assert.doesNotMatch(s, /<style|<script|\sstyle=|\son[a-z]+=|<foreignObject|xlink:href="http|href="http|@import|url\(http/i);
    });

    test(`${f} carries no client or personal text`, () => {
      const s = read(f).toLowerCase();
      for (const bad of ['zetl', 'chocolate', 'chocfin', 'cygnus', 'deneb', 'acra', 'james', 'shanahan', '@']) {
        assert.ok(!s.includes(bad), `${f} contains "${bad}"`);
      }
      const shown = [...s.matchAll(/>([^<]+)</g)].map((m) => m[1]).join(' ');
      assert.doesNotMatch(shown, /\b(19|20)\d\d\b/, `${f} shows a year`);
    });
  }

  test(`${n}.svg animates; ${n}-still.svg does not`, () => {
    assert.match(read(`${n}.svg`), /<animate(Transform)? /);
    assert.match(read(`${n}.svg`), /repeatCount="indefinite"/);
    assert.doesNotMatch(read(`${n}-still.svg`), /<animate|<set\b/);
  });

  test(`index.html shows ${n} with a reduced-motion still`, () => {
    const pic = html.match(new RegExp(`<picture[^>]*>(?:(?!</picture>)[\\s\\S])*/assets/anim/${n}\\.svg[\\s\\S]*?</picture>`));
    assert.ok(pic, `no <picture> for ${n}`);
    assert.match(pic[0], new RegExp(`<source media="\\(prefers-reduced-motion: reduce\\)" srcset="/assets/anim/${n}-still\\.svg">`));
    assert.match(pic[0], /<img [^>]*width="\d+" height="\d+"/);
  });
}

// The drawings must show what the real risk register shows (Jira project
// "Risk Register": workflow Pending Review -> Risk Accepted / Live / Closed /
// Cancelled; 168 risks, 167 pending, RR-20 accepted). Summaries stay as bars.
const real = {
  queue: ['Pending Review', '167', 'Risk Accepted', '>1<', 'RR-8', 'RR-9', 'RR-10', 'RR-20', 'Subtasks', '0/5'],
  assess: ['RR-20', 'Risk Accepted', 'Function Impacted', 'Review Interval', 'Annually', 'Review Cadence', 'Periodic',
    'Risk Probability', '4 - Likely', 'Risk Impact', '3 - Moderate', 'Risk Score', '>12<', 'Subtasks', '0% Done',
    'RR-176', 'RR-177', 'Open', 'Pending Review', '+3 more'],
  register: ['Work', 'Priority', 'Status', 'RR-17', 'RR-19', 'RR-20', 'Medium', 'Pending Review', 'Risk Accepted', '50 of 168'],
  // every risk in the order it was written, coloured by its real priority
  written: ['168', '5 min 26 s', 'Highest', 'High', 'Medium', 'Low'],
  decided: ['Risk Accepted', '>1<', 'Pending Review', '167', 'RR-20'],
  priority: ['Highest', 'High', 'Medium', 'Low', '>5<', '>40<', '>122<', '>1<', '168'],
  rate: ['>1<', '>20<', '>37<', '>38<', '>34<', 'per minute'],
};
for (const n of names) {
  test(`${n} shows the real register's content, not invented content`, () => {
    for (const f of [`${n}.svg`, `${n}-still.svg`]) {
      const s = read(f);
      for (const want of real[n]) assert.ok(s.includes(want), `${f} lacks "${want}"`);
      assert.doesNotMatch(s, /signed off|>ai<|\bR-\d/i, `${f} has invented statuses or keys`);
      assert.ok(!s.includes('Unresolved'), `${f} repeats "Unresolved"`);
      assert.ok((s.match(/Pending Review/g) || []).length <= 4, `${f} repeats "Pending Review"`);
    }
  });
}

test('the old drawn visuals are gone and nothing else was removed', () => {
  assert.doesNotMatch(html, /class="ledger"/);
  assert.doesNotMatch(html, /Regulatory change detected/);
  assert.match(html, /class="term"/);
  assert.match(html, /id="how"/);
});
