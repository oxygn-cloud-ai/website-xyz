// The only JavaScript the site ships. Bundled to assets/botid-client.js with
// `npm run bundle` (committed; the site has no build step).
//
// BotID proves a real browser by attaching headers to fetch/XHR, which a plain
// form post can't carry, so the enquiry form is sent with fetch. The server
// renders the result as HTML; this script only swaps it in. Without JavaScript
// the form still posts and the server answers with a full page.
import { initBotId } from 'botid/client/core';

// checkLevel must match checkBotId() in api/contact.mjs.
initBotId({
  protect: [{ path: '/api/contact', method: 'POST', advancedOptions: { checkLevel: 'deepAnalysis' } }],
});

const form = document.getElementById('talk-form');
form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const out = form.querySelector('.result');
  const btn = form.querySelector('.send');
  btn.disabled = true;
  out.textContent = 'Sending…';
  try {
    const r = await fetch(form.action, {
      method: 'POST',
      body: new URLSearchParams(new FormData(form)),
      headers: { 'X-Requested-With': 'fetch' },
    });
    if (r.status === 429) {
      out.textContent = 'Too many attempts from your connection. Please wait a few minutes, or email hello@oxygn.xyz.';
      return;
    }
    const html = await r.text();
    if (r.ok) form.outerHTML = html;
    else out.innerHTML = html;
  } catch {
    out.textContent = 'Connection problem. Please try again.';
  } finally {
    btn.disabled = false;
  }
});
