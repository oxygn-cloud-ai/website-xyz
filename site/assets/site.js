// Progressive enhancement for oxygn.xyz. The page is complete without it:
// every section has a static or CSS-animated fallback. Loaded as an external
// module, so the CSP (script-src 'self') stays as it is.
//
// What it adds: illustrations that play from the start when scrolled to (and
// pause off screen), a replay button, count-ups, a typed terminal, a live
// Singapore clock, a feed replaying the real register entries, and draggable
// windows on the OXYGN.OS desk. The enquiry form is left to botid-client.js.

const NAMES = { X: 'Highest', H: 'High', M: 'Medium', L: 'Low' };

const clockFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

/** Singapore wall-clock time, HH:MM:SS (the site shows no dates). */
export const sgtClock = (d) => clockFormat.format(d);

/** Seconds as m:ss. */
export const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** One register entry as a feed line; wraps round after the last. */
export function feedLine(data, i) {
  const j = i % data.prio.length;
  return `RR-${data.first + j} · ${NAMES[data.prio[j]]} · +${mmss(data.secs[j])}`;
}

/** Value of a count-up at progress t (0..1), easing out, as an integer. */
export function countFrame(target, t) {
  const c = Math.min(1, Math.max(0, t));
  return Math.round(target * (1 - (1 - c) ** 3));
}

/** Register offsets (seconds) as replay delays in ms at `speed`x. */
export const schedule = (secs, speed) => secs.map((s) => Math.round((s * 1000) / speed));

// ---------------------------------------------------------------- browser --

const onScreen = (el, enter, leave, threshold = 0.35) => {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) (e.isIntersecting ? enter : leave)?.(e.target);
  }, { threshold });
  io.observe(el);
  return io;
};

// Swap each animated <img> for the same SVG inline, so its clock can be
// controlled: start from zero when it comes into view, pause when it leaves.
async function liveSvg(pic) {
  const img = pic.querySelector('img');
  if (!img) return null;
  const res = await fetch(img.currentSrc || img.src);
  if (!res.ok) return null;
  const doc = new DOMParser().parseFromString(await res.text(), 'image/svg+xml');
  const root = doc.documentElement;
  if (root.nodeName !== 'svg' || doc.querySelector('parsererror')) return null;
  const svg = document.importNode(root, true);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', img.alt);
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  const box = document.createElement('div');
  box.className = pic.className;
  box.append(svg);
  pic.replaceWith(box);
  svg.pauseAnimations();
  svg.setCurrentTime(0);
  onScreen(box, () => { svg.setCurrentTime(0); svg.unpauseAnimations(); }, () => svg.pauseAnimations());
  return svg;
}

async function liveSvgs() {
  const pics = [...document.querySelectorAll('picture.anim')];
  const svgs = await Promise.all(pics.map((p) => liveSvg(p).catch(() => null)));
  const split = document.querySelector('.split');
  const pair = svgs.filter((s) => s && split?.contains(s));
  if (pair.length) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'replay mono';
    b.textContent = 'Replay the 5 min 26 s';
    b.addEventListener('click', () => pair.forEach((s) => { s.setCurrentTime(0); s.unpauseAnimations(); }));
    split.after(b);
  }
}

function counters() {
  for (const el of document.querySelectorAll('[data-count]')) {
    const target = Number(el.dataset.count);
    let done = false;
    onScreen(el, () => {
      if (done) return;
      done = true;
      const t0 = performance.now();
      const tick = (now) => {
        const t = (now - t0) / 1400;
        el.textContent = String(countFrame(target, t));
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, null, 0.6);
  }
}

// The terminal types its lines out the first time it is seen.
function terminal() {
  const term = document.querySelector('.term');
  if (!term) return;
  const lines = [...term.querySelectorAll('li')].map((li) => {
    const span = li.querySelector('span');
    const nodes = [...span.childNodes].map((n) => n.cloneNode(true)); // keeps <em>Signed off</em>
    const text = span.textContent;
    li.classList.add('wait');
    return { li, span, nodes, text };
  });
  let started = false;
  onScreen(term, async () => {
    if (started) return;
    started = true;
    for (const { li, span, nodes, text } of lines) {
      li.classList.remove('wait');
      span.textContent = '';
      for (let i = 1; i <= text.length; i++) {
        span.textContent = text.slice(0, i);
        await new Promise((r) => setTimeout(r, 16));
      }
      span.replaceChildren(...nodes);  // restore the original mark-up
      await new Promise((r) => setTimeout(r, 260));
    }
  }, null, 0.4);
}

function clock() {
  const el = document.querySelector('.clock');
  if (!el) return;
  const set = () => { el.textContent = sgtClock(new Date()); };
  set();
  setInterval(set, 1000);
}

// Replays the real register: each entry in the order it was written, at the
// pace it was written (the one long pause, after the first risk, shortened).
async function feed(still) {
  const list = document.querySelector('.feed');
  if (!list) return;
  const res = await fetch('/assets/register.json');
  if (!res.ok) return;
  const data = await res.json();
  const gaps = data.secs.map((s, i) => (i ? Math.min(s - data.secs[i - 1], 3) : 3) * 1000);
  const show = (i) => {
    const li = document.createElement('li');
    li.textContent = feedLine(data, i);
    list.append(li);
    while (list.children.length > 6) list.firstElementChild.remove();
  };
  list.replaceChildren();
  if (still) { for (let i = 0; i < 6; i++) show(i); return; }
  let i = 0;
  const next = () => { show(i); i = (i + 1) % data.prio.length; setTimeout(next, gaps[i]); };
  next();
}

// Desk windows can be dragged by their title bars on wide screens.
function drag() {
  if (!matchMedia('(min-width: 64rem)').matches) return;
  let z = 10;
  for (const win of document.querySelectorAll('.os > .w, .os > .board')) {
    const handle = win.classList.contains('board') ? win : win.querySelector('.wb');
    if (!handle) continue;
    handle.classList.add('grab');
    let x = 0, y = 0, sx = 0, sy = 0, on = false;
    handle.addEventListener('pointerdown', (e) => {
      on = true; sx = e.clientX - x; sy = e.clientY - y;
      win.style.zIndex = String(++z);
      handle.setPointerCapture(e.pointerId);
      win.classList.add('lifted');
    });
    handle.addEventListener('pointermove', (e) => {
      if (!on) return;
      x = e.clientX - sx; y = e.clientY - sy;
      win.style.transform = `translate(${x}px, ${y}px)`;
    });
    const stop = () => { on = false; win.classList.remove('lifted'); };
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
  }
}

function init() {
  document.documentElement.classList.add('js');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  clock();
  drag();
  feed(still).catch(() => {});
  if (still) return;               // reduced motion: keep the still images
  liveSvgs().catch(() => {});
  counters();
  terminal();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}
