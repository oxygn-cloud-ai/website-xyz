// Talk-to-us form: record the lead in Lightfield and email the team from the site.
// Either destination succeeding counts as delivered; the visitor only sees an
// error if both fail.
// Abuse controls, in order: Vercel Firewall rate limits (dashboard, not this file),
// same-origin check, honeypot, BotID Deep Analysis, Kickbox.

const LF = 'https://api.lightfield.app/v1';
const LF_VERSION = '2026-03-01';
const TO = 'hello@oxygn.xyz';
const LIMITS = { name: 200, email: 254, company: 200, domain: 200, linkedin: 300, message: 5000 };
const REQUIRED = ['name', 'email', 'company', 'message'];

const json = (status, body) => ({ status, body });

function clean(data) {
  const out = {};
  for (const [k, max] of Object.entries(LIMITS)) {
    const v = data?.[k] ?? '';
    if (typeof v !== 'string') return null;
    const t = v.trim();
    if (t.length > max) return null;
    out[k] = t;
  }
  return out;
}

// Returns { status, json }; status 0 means the request never got a response.
async function request(fetchImpl, method, url, headers, body) {
  try {
    const r = await fetchImpl(url, { method, headers: { 'Content-Type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, json: await r.json().catch(() => ({})) };
  } catch {
    return { status: 0, json: null };
  }
}
const ok = r => r.status >= 200 && r.status < 300;
async function post(fetchImpl, url, headers, body) {
  const r = await request(fetchImpl, 'POST', url, headers, body);
  return ok(r) ? r.json : null;
}

// Lightfield's SOCIAL_HANDLE only accepts a canonical profile URL, and a bad
// value fails the whole create, so anything unrecognisable is left to the note.
function linkedInUrl(raw) {
  const m = /(?:^|[/.])linkedin\.com\/(in|company)\/([^/?#\s]+)/i.exec(raw);
  return m ? `https://www.linkedin.com/${m[1].toLowerCase()}/${m[2]}` : null;
}

// Lightfield rejects a second contact with the same email (409), so an existing
// contact is looked up and the enquiry attached to it. The list endpoint needs
// contacts:read and reads a lagging search index, so when no exact match comes
// back the enquiry is still saved as a standalone note naming the email.
async function findContactId(f, h, email) {
  const r = await request(f, 'GET', `${LF}/contacts?${new URLSearchParams({ '$email[contains]': email, limit: '5' })}`, h);
  if (!ok(r)) { console.error('lightfield contact lookup failed', r.status); return null; }
  const want = email.toLowerCase();
  const hit = (r.json?.data ?? []).find(c => [].concat(c.fields?.$email?.value ?? []).some(e => String(e).toLowerCase() === want));
  return hit?.id ?? null;
}

async function saveToLightfield(f, key, d) {
  const h = { Authorization: `Bearer ${key}`, 'Lightfield-Version': LF_VERSION };
  const [firstName, ...rest] = d.name.split(/\s+/);
  const $name = rest.length ? { firstName, lastName: rest.join(' ') } : { firstName };
  const fields = { $email: [d.email], $name };
  const $linkedIn = linkedInUrl(d.linkedin);
  if ($linkedIn) fields.$linkedIn = $linkedIn;

  const created = await request(f, 'POST', `${LF}/contacts`, h, { fields });
  let contactId = ok(created) ? created.json?.id : null;
  const existing = created.status === 409;
  if (!contactId && !existing) { console.error('lightfield contact create failed', created.status, created.json?.error?.type ?? ''); return false; }
  if (existing) contactId = await findContactId(f, h, d.email);

  const $content = [
    d.message, '',
    `Name: ${d.name}`, `Email: ${d.email}`,
    `Company: ${d.company}`,
    d.domain ? `Domain: ${d.domain}` : null,
    d.linkedin ? `LinkedIn: ${d.linkedin}` : null,
    d.emailCheck ?? null,
  ].filter(x => x !== null).join('\n');
  const $title = contactId ? `Website enquiry: ${d.company}` : `Website enquiry: ${d.company} (${d.email})`;
  const note = await post(f, `${LF}/notes`, h, { fields: { $title, $content }, ...(contactId ? { relationships: { $contact: contactId } } : {}) });
  if (!note) console.error('lightfield note create failed', contactId ?? '(standalone)');
  // A new contact is the lead even if its note fails; for an existing contact
  // the note is the only new record, so it must succeed.
  return existing ? !!note : true;
}

// Kickbox: reject addresses that can't receive mail or are throwaway; note the
// verdict otherwise. Any Kickbox problem (outage, depleted balance) fails open.
// The key travels in the query string (Kickbox's only option), so the URL is never logged.
async function checkEmail(f, key, email) {
  const q = new URLSearchParams({ email, apikey: key, timeout: '4000' });
  const r = await request(f, 'GET', `https://api.kickbox.com/v2/verify?${q}`, {});
  const k = r.json;
  if (!ok(r) || !k?.success) { console.error('kickbox check skipped', r.status, k?.message ?? ''); return {}; }
  if (k.disposable) return { reject: 'Please use your work email address.' };
  if (k.result === 'undeliverable') {
    return { reject: k.did_you_mean
      ? `That email address doesn’t seem to receive mail. Did you mean ${k.did_you_mean}?`
      : 'That email address doesn’t seem to receive mail. Please check it and try again.' };
  }
  const detail = [k.reason, typeof k.sendex === 'number' ? `sendex ${k.sendex}` : null].filter(Boolean).join(', ');
  return { note: `Email check: ${k.result}${detail ? ` (${detail})` : ''}` };
}

async function sendEmail(f, env, d, savedToCrm) {
  const lines = [
    `Name: ${d.name}`, `Email: ${d.email}`, `Company: ${d.company}`,
    d.domain ? `Domain: ${d.domain}` : null, d.linkedin ? `LinkedIn: ${d.linkedin}` : null,
    d.emailCheck ?? null,
    '', d.message, '',
    savedToCrm === false ? 'Warning: this enquiry was NOT saved to Lightfield. Add it manually.' : null,
  ].filter(x => x !== null);
  const r = await post(f, 'https://api.resend.com/emails', { Authorization: `Bearer ${env.RESEND_API_KEY}` }, {
    from: env.RESEND_FROM || (env.RESEND_EMAIL_DOMAIN ? `Oxygn website <website@${env.RESEND_EMAIL_DOMAIN}>` : 'Oxygn website <onboarding@resend.dev>'),
    to: [TO],
    reply_to: d.email,
    subject: `Website enquiry: ${d.name}, ${d.company}`,
    text: lines.join('\n'),
  });
  return r !== null;
}

// deps.checkBot: returns { isBot } (Vercel BotID). Runs only after the free
// validation above, so malformed junk never costs a Deep Analysis check.
export async function handleContact(data, env, fetchImpl = fetch, deps = {}) {
  if (typeof data?.website === 'string' && data.website.trim()) return json(200, { ok: true }); // honeypot
  const d = clean(data);
  if (!d) return json(400, { error: 'Please shorten your answers and try again.' });
  const missing = REQUIRED.filter(k => !d[k]);
  if (missing.length) return json(400, { error: `Please fill in: ${missing.join(', ')}.` });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return json(400, { error: 'Please enter a valid work email.' });

  const hasLf = !!env.LIGHTFIELD_API_KEY, hasMail = !!env.RESEND_API_KEY;
  if (!hasLf && !hasMail) {
    console.error('contact form: no LIGHTFIELD_API_KEY or RESEND_API_KEY configured');
    return json(500, { error: 'The form is not available right now. Email hello@oxygn.xyz instead.' });
  }

  if (deps.checkBot) {
    try {
      if ((await deps.checkBot()).isBot) return json(403, { error: 'We couldn’t verify this submission. Please email hello@oxygn.xyz instead.' });
    } catch (e) {
      console.error('botid check failed, allowing submission', e?.message ?? e);
    }
  }

  if (env.KICKBOX_API_KEY) {
    const v = await checkEmail(fetchImpl, env.KICKBOX_API_KEY, d.email);
    if (v.reject) return json(400, { error: v.reject });
    if (v.note) d.emailCheck = v.note;
  }

  const saved = hasLf ? await saveToLightfield(fetchImpl, env.LIGHTFIELD_API_KEY, d) : null;
  const mailed = hasMail ? await sendEmail(fetchImpl, env, d, saved) : null;
  if (mailed === false) console.error('resend email failed');

  if (saved || mailed) return json(200, { ok: true });
  return json(502, { error: 'We couldn’t send that. Please try again, or email hello@oxygn.xyz.' });
}

// Must match the client's initBotId checkLevel for /api/contact.
async function botId() {
  const { checkBotId } = await import('botid/server');
  return checkBotId({ advancedOptions: { checkLevel: 'deepAnalysis' } });
}

// --- Server-rendered responses ------------------------------------------------
// The page ships no UI logic: the enquiry script swaps in the fragment below,
// and a browser without JavaScript gets a full page.
const MAX_BODY = 32 * 1024;
const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', Pragma: 'no-cache', 'X-Content-Type-Options': 'nosniff',
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function fragment(status, body) {
  if (status === 200) {
    return '<div class="done"><h2>Thanks. We’ve got it.</h2>'
      + '<p class="sub">Someone from Oxygn will reply to the email you gave us.</p>'
      + '<a class="send" href="#_">Close</a></div>';
  }
  return `<p class="msg err" role="alert">${esc(body.error ?? 'Something went wrong. Please email hello@oxygn.xyz.')}</p>`;
}

function page(status, body) {
  const ok = status === 200;
  const title = ok ? 'Thanks. We’ve got it.' : 'We couldn’t send that';
  const text = ok ? 'Someone from Oxygn will reply to the email you gave us.' : esc(body.error ?? 'Something went wrong.');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Oxygn</title><link rel="stylesheet" href="/assets/site.css"></head>
<body class="result"><main class="talk"><h1 class="display sm">${esc(title)}</h1><p>${text}</p>
<a class="btn" href="/">Back to oxygn.xyz</a>${ok ? '' : ' <a class="btn" href="/#enquire">Try again</a>'}</main></body></html>`;
}

async function readBody(request) {
  const len = Number(request.headers.get('content-length') ?? 0);
  if (len > MAX_BODY) return { tooBig: true };
  const raw = await request.text();
  if (raw.length > MAX_BODY) return { tooBig: true };
  const type = request.headers.get('content-type') ?? '';
  try {
    if (type.includes('application/json')) {
      const v = JSON.parse(raw);
      return { data: v && typeof v === 'object' && !Array.isArray(v) ? v : null };
    }
    return { data: Object.fromEntries(new URLSearchParams(raw)) };
  } catch {
    return { data: null };
  }
}

// Vercel calls POST(request, context): never take env from a positional argument.
export function POST(request) {
  return handlePost(request, process.env, fetch, { checkBot: botId });
}

// Browsers stamp every POST with Origin (and Sec-Fetch-Site), which a page on
// another site cannot forge, so cross-site form posts and fetches are refused
// here. Non-browser clients can send any headers; BotID handles those.
function crossSite(request) {
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return true;
  const origin = request.headers.get('origin');
  return origin !== null && origin !== new URL(request.url).origin;
}

export async function handlePost(request, env, fetchImpl, deps) {
  const viaScript = request.headers.get('x-requested-with') === 'fetch';
  if (crossSite(request)) {
    const r = json(403, { error: 'This form only accepts submissions from oxygn.xyz. Please email hello@oxygn.xyz.' });
    return new Response(viaScript ? fragment(r.status, r.body) : page(r.status, r.body), { status: 403, headers: HTML_HEADERS });
  }
  const { data, tooBig } = await readBody(request);
  const r = tooBig ? json(413, { error: 'That message is too long. Please shorten it.' })
    : data ? await handleContact(data, env, fetchImpl, deps)
    : json(400, { error: 'Invalid request.' });
  const html = viaScript ? fragment(r.status, r.body) : page(r.status, r.body);
  return new Response(html, { status: r.status, headers: HTML_HEADERS });
}

// Every other method: an explicit 405 that says what is allowed.
function methodNotAllowed() {
  return new Response('Method not allowed. This endpoint only accepts POST.\n', {
    status: 405,
    headers: { Allow: 'POST', 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', Pragma: 'no-cache', 'X-Content-Type-Options': 'nosniff' },
  });
}
export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
