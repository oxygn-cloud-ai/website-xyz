// Tests for site/assets/site.js (the page's progressive enhancement) and the
// register data it reads. The module must be importable without a DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sgtClock, feedLine, countFrame } from '../site/assets/site.js';

const data = JSON.parse(readFileSync(new URL('../site/assets/register.json', import.meta.url), 'utf8'));
const js = readFileSync(new URL('../site/assets/site.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');

test('register.json holds the real risk register: 168 risks, 5/40/122/1, no timings', () => {
  assert.equal(data.first, 8);
  assert.equal(data.prio.length, 168);
  assert.equal(data.secs, undefined, 'timing data is not shipped');
  const n = (k) => [...data.prio].filter((c) => c === k).length;
  assert.deepEqual([n('X'), n('H'), n('M'), n('L')], [5, 40, 122, 1]);
  assert.equal(JSON.stringify(data).match(/zetl|chocolate/i), null);
});

test('sgtClock shows Singapore time only, never a date', () => {
  assert.equal(sgtClock(new Date('2026-10-02T16:58:05Z')), '00:58:05');
  assert.equal(sgtClock(new Date('2026-10-02T03:04:09Z')), '11:04:09');
  assert.doesNotMatch(sgtClock(new Date()), /\d{4}|\//);
});

test('feedLine names the real key and priority, and wraps round', () => {
  assert.equal(feedLine(data, 0), 'RR-8 · High · assessed');
  assert.equal(feedLine(data, 12), 'RR-20 · Medium · assessed');
  assert.equal(feedLine(data, 167), 'RR-175 · Medium · assessed');
  assert.equal(feedLine(data, 168), 'RR-8 · High · assessed');
});

test('countFrame eases from 0 to the target and clamps', () => {
  assert.equal(countFrame(168, 0), 0);
  assert.equal(countFrame(168, 1), 168);
  assert.equal(countFrame(168, 2), 168);
  assert.equal(countFrame(168, -1), 0);
  const mid = countFrame(168, 0.5);
  assert.ok(mid > 84 && mid < 168, `ease-out midpoint ${mid}`);
  assert.ok(Number.isInteger(mid));
});

test('site.js is CSP-safe and does not touch the form', () => {
  assert.doesNotMatch(js, /\beval\(|new Function|setAttribute\(\s*['"]style|innerHTML\s*=|document\.write/);
  assert.doesNotMatch(js, /talk-form|\/api\/contact/);
  assert.match(js, /prefers-reduced-motion/);
});

test('the page loads site.js as an external module', () => {
  assert.match(html, /<script type="module" src="\/assets\/site\.js"><\/script>/);
});
