// Talk-to-us form: record the lead in Lightfield and email the team from the site.
// Either destination succeeding counts as delivered; the visitor only sees an
// error if both fail.
// ponytail: no rate limiting beyond the honeypot; add Vercel Firewall rules if spam appears.

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
  ].filter(x => x !== null).join('\n');
  const $title = contactId ? `Website enquiry: ${d.company}` : `Website enquiry: ${d.company} (${d.email})`;
  const note = await post(f, `${LF}/notes`, h, { fields: { $title, $content }, ...(contactId ? { relationships: { $contact: contactId } } : {}) });
  if (!note) console.error('lightfield note create failed', contactId ?? '(standalone)');
  // A new contact is the lead even if its note fails; for an existing contact
  // the note is the only new record, so it must succeed.
  return existing ? !!note : true;
}

async function sendEmail(f, env, d, savedToCrm) {
  const lines = [
    `Name: ${d.name}`, `Email: ${d.email}`, `Company: ${d.company}`,
    d.domain ? `Domain: ${d.domain}` : null, d.linkedin ? `LinkedIn: ${d.linkedin}` : null,
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

export async function handleContact(data, env, fetchImpl = fetch) {
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

  const saved = hasLf ? await saveToLightfield(fetchImpl, env.LIGHTFIELD_API_KEY, d) : null;
  const mailed = hasMail ? await sendEmail(fetchImpl, env, d, saved) : null;
  if (mailed === false) console.error('resend email failed');

  if (saved || mailed) return json(200, { ok: true });
  return json(502, { error: 'We couldn’t send that. Please try again, or email hello@oxygn.xyz.' });
}

export async function POST(request) {
  let data;
  try { data = await request.json(); } catch { data = null; }
  const r = data && typeof data === 'object'
    ? await handleContact(data, process.env)
    : json(400, { error: 'Invalid request.' });
  return Response.json(r.body, { status: r.status });
}
