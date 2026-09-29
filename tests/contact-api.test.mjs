import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleContact, POST } from '../site/api/contact.mjs';

const valid = {
  name: 'Ada Tan',
  email: 'ada@bank.example',
  company: 'Example Bank',
  domain: 'bank.example',
  linkedin: 'linkedin.com/in/adatan',
  message: 'We need help with MAS reporting.',
};
const env = { LIGHTFIELD_API_KEY: 'lf', RESEND_API_KEY: 're' };

// Records every outbound call. `statuses` maps a URL (without query) to an HTTP
// status; `lookup` is the JSON body returned for a contacts list GET.
function fakeFetch(statuses = {}, lookup = { data: [] }) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const method = init.method || 'GET';
    const base = url.split('?')[0];
    calls.push({ url, base, method, init, body: init.body ? JSON.parse(init.body) : null });
    const status = statuses[`${method} ${base}`] ?? statuses[base] ?? 200;
    if (method === 'GET') return new Response(JSON.stringify(lookup), { status });
    const id = base.endsWith('/contacts') ? 'con_1' : base.endsWith('/notes') ? 'note_1' : 'em_1';
    return new Response(JSON.stringify({ id }), { status });
  };
  fn.calls = calls;
  return fn;
}
const existing = email => ({ data: [{ id: 'con_old', fields: { $email: { value: [email], valueType: 'EMAIL' } } }] });
const LF_CONTACTS = 'https://api.lightfield.app/v1/contacts';
const LF_NOTES = 'https://api.lightfield.app/v1/notes';
const RESEND = 'https://api.resend.com/emails';

test('happy path: Lightfield contact + linked note, then email from the site', async () => {
  const f = fakeFetch();
  const r = await handleContact(valid, env, f);
  assert.equal(r.status, 200);
  assert.deepEqual(f.calls.map(c => c.url), [LF_CONTACTS, LF_NOTES, RESEND]);

  const [contact, note, email] = f.calls;
  assert.equal(contact.init.headers.Authorization, 'Bearer lf');
  assert.ok(contact.init.headers['Lightfield-Version']);
  assert.deepEqual(contact.body.fields.$email, ['ada@bank.example']);
  assert.deepEqual(contact.body.fields.$name, { firstName: 'Ada', lastName: 'Tan' });

  assert.equal(note.body.relationships.$contact, 'con_1');
  assert.match(note.body.fields.$title, /Example Bank/);
  assert.match(note.body.fields.$content, /MAS reporting/);
  assert.match(note.body.fields.$content, /linkedin\.com\/in\/adatan/);

  assert.equal(email.init.headers.Authorization, 'Bearer re');
  assert.deepEqual(email.body.to, ['hello@oxygn.xyz']);
  assert.equal(email.body.reply_to, 'ada@bank.example');
  assert.match(email.body.from, /@/);
  assert.match(email.body.text, /MAS reporting/);
});

for (const [input, expected] of [
  ['linkedin.com/in/adatan', 'https://www.linkedin.com/in/adatan'],
  ['https://www.linkedin.com/in/ada-tan-123/', 'https://www.linkedin.com/in/ada-tan-123'],
  ['http://sg.linkedin.com/in/adatan?trk=x', 'https://www.linkedin.com/in/adatan'],
  ['www.linkedin.com/company/example-bank', 'https://www.linkedin.com/company/example-bank'],
]) {
  test(`LinkedIn "${input}" is normalised onto the contact's $linkedIn field`, async () => {
    const f = fakeFetch();
    await handleContact({ ...valid, linkedin: input }, env, f);
    assert.equal(f.calls[0].body.fields.$linkedIn, expected);
  });
}

for (const input of ['adatan', 'https://example.com/in/adatan', 'linkedin.com/feed', '']) {
  test(`unrecognisable LinkedIn "${input}" is left off the contact (so the create can't fail) but kept in the note`, async () => {
    const f = fakeFetch();
    await handleContact({ ...valid, linkedin: input }, env, f);
    assert.equal('$linkedIn' in f.calls[0].body.fields, false);
    if (input) assert.match(f.calls[1].body.fields.$content, new RegExp(input.replace(/[.?/]/g, '\\$&')));
  });
}

test('single-word name has no lastName', async () => {
  const f = fakeFetch();
  await handleContact({ ...valid, name: 'Cher' }, env, f);
  assert.deepEqual(f.calls[0].body.fields.$name, { firstName: 'Cher' });
});

for (const field of ['name', 'email', 'company', 'message']) {
  test(`missing required ${field} is rejected without any outbound call`, async () => {
    const f = fakeFetch();
    const r = await handleContact({ ...valid, [field]: '  ' }, env, f);
    assert.equal(r.status, 400);
    assert.equal(f.calls.length, 0);
  });
}

test('optional fields may be omitted', async () => {
  const f = fakeFetch();
  const { domain, linkedin, ...rest } = valid;
  const r = await handleContact(rest, env, f);
  assert.equal(r.status, 200);
});

test('malformed email is rejected', async () => {
  const f = fakeFetch();
  const r = await handleContact({ ...valid, email: 'not-an-email' }, env, f);
  assert.equal(r.status, 400);
  assert.equal(f.calls.length, 0);
});

test('over-long message is rejected', async () => {
  const f = fakeFetch();
  const r = await handleContact({ ...valid, message: 'x'.repeat(5001) }, env, f);
  assert.equal(r.status, 400);
});

test('non-string values are rejected', async () => {
  const f = fakeFetch();
  const r = await handleContact({ ...valid, name: { $gt: '' } }, env, f);
  assert.equal(r.status, 400);
});

test('honeypot filled: reports success but sends nothing', async () => {
  const f = fakeFetch();
  const r = await handleContact({ ...valid, website: 'spam.example' }, env, f);
  assert.equal(r.status, 200);
  assert.equal(f.calls.length, 0);
});

test('Lightfield down: email still sent, and it says the CRM write failed', async () => {
  const f = fakeFetch({ [LF_CONTACTS]: 500 });
  const r = await handleContact(valid, env, f);
  assert.equal(r.status, 200);
  const email = f.calls.find(c => c.url === RESEND);
  assert.ok(email);
  assert.match(email.body.text, /not saved to Lightfield/i);
});

test('note failure is not fatal once the contact exists', async () => {
  const f = fakeFetch({ [LF_NOTES]: 500 });
  const r = await handleContact(valid, env, f);
  assert.equal(r.status, 200);
  assert.ok(f.calls.some(c => c.url === RESEND));
});

test('existing contact (409): note is attached to the contact found by email', async () => {
  const f = fakeFetch({ [`POST ${LF_CONTACTS}`]: 409 }, existing('ada@bank.example'));
  const r = await handleContact(valid, env, f);
  assert.equal(r.status, 200);
  const get = f.calls.find(c => c.method === 'GET');
  assert.equal(get.base, LF_CONTACTS);
  assert.equal(new URL(get.url).searchParams.get('$email[contains]'), 'ada@bank.example');
  const note = f.calls.find(c => c.base === LF_NOTES);
  assert.equal(note.body.relationships.$contact, 'con_old');
  assert.doesNotMatch(f.calls.at(-1).body.text, /NOT saved to Lightfield/);
});

test('existing contact match is exact and case-insensitive', async () => {
  const f = fakeFetch({ [`POST ${LF_CONTACTS}`]: 409 }, existing('ADA@bank.example'));
  await handleContact(valid, env, f);
  assert.equal(f.calls.find(c => c.base === LF_NOTES).body.relationships.$contact, 'con_old');
});

test('409 but lookup only finds a different address: standalone note naming the email', async () => {
  const f = fakeFetch({ [`POST ${LF_CONTACTS}`]: 409 }, existing('xada@bank.example'));
  const r = await handleContact(valid, env, f);
  assert.equal(r.status, 200);
  const note = f.calls.find(c => c.base === LF_NOTES);
  assert.equal(note.body.relationships, undefined);
  assert.match(note.body.fields.$title, /ada@bank\.example/);
});

test('409 and lookup forbidden (key lacks contacts:read): standalone note still saves the enquiry', async () => {
  const f = fakeFetch({ [`POST ${LF_CONTACTS}`]: 409, [`GET ${LF_CONTACTS}`]: 403 });
  const r = await handleContact(valid, env, f);
  assert.equal(r.status, 200);
  const note = f.calls.find(c => c.base === LF_NOTES);
  assert.ok(note);
  assert.equal(note.body.relationships, undefined);
  assert.match(note.body.fields.$content, /MAS reporting/);
  assert.doesNotMatch(f.calls.at(-1).body.text, /NOT saved to Lightfield/);
});

test('409 and the note also fails: email warns that Lightfield has nothing', async () => {
  const f = fakeFetch({ [`POST ${LF_CONTACTS}`]: 409, [`POST ${LF_NOTES}`]: 500 }, existing('ada@bank.example'));
  const r = await handleContact(valid, env, f);
  assert.equal(r.status, 200);
  assert.match(f.calls.at(-1).body.text, /NOT saved to Lightfield/);
});

test('email down but Lightfield saved: still success', async () => {
  const f = fakeFetch({ [RESEND]: 500 });
  const r = await handleContact(valid, env, f);
  assert.equal(r.status, 200);
});

test('both down: 502 so the visitor knows to retry', async () => {
  const f = fakeFetch({ [LF_CONTACTS]: 500, [RESEND]: 500 });
  const r = await handleContact(valid, env, f);
  assert.equal(r.status, 502);
});

test('network error counts as failure, not a crash', async () => {
  const f = async () => { throw new Error('ECONNRESET'); };
  const r = await handleContact(valid, env, f);
  assert.equal(r.status, 502);
});

test('no keys configured: 500 and no calls', async () => {
  const f = fakeFetch();
  const r = await handleContact(valid, {}, f);
  assert.equal(r.status, 500);
  assert.equal(f.calls.length, 0);
});

test('only Resend configured: email only', async () => {
  const f = fakeFetch();
  const r = await handleContact(valid, { RESEND_API_KEY: 're' }, f);
  assert.equal(r.status, 200);
  assert.deepEqual(f.calls.map(c => c.url), [RESEND]);
});

test('RESEND_FROM overrides the sender', async () => {
  const f = fakeFetch();
  await handleContact(valid, { ...env, RESEND_FROM: 'Oxygn <web@oxygn.xyz>' }, f);
  assert.equal(f.calls.at(-1).body.from, 'Oxygn <web@oxygn.xyz>');
});

test('RESEND_EMAIL_DOMAIN (set by the Vercel integration) becomes the sender domain', async () => {
  const f = fakeFetch();
  await handleContact(valid, { ...env, RESEND_EMAIL_DOMAIN: 'oxygn.xyz' }, f);
  assert.equal(f.calls.at(-1).body.from, 'Oxygn website <website@oxygn.xyz>');
});

test('RESEND_FROM still wins over RESEND_EMAIL_DOMAIN', async () => {
  const f = fakeFetch();
  await handleContact(valid, { ...env, RESEND_EMAIL_DOMAIN: 'oxygn.xyz', RESEND_FROM: 'X <x@oxygn.xyz>' }, f);
  assert.equal(f.calls.at(-1).body.from, 'X <x@oxygn.xyz>');
});

// --- BotID -----------------------------------------------------------------
const human = async () => ({ isBot: false });
const bot = async () => ({ isBot: true });

test('BotID flags a bot: 403 and nothing is sent anywhere', async () => {
  const f = fakeFetch();
  const r = await handleContact(valid, { ...env, KICKBOX_API_KEY: 'kb' }, f, { checkBot: bot });
  assert.equal(r.status, 403);
  assert.equal(f.calls.length, 0);
});

test('invalid input is rejected before BotID runs (no Deep Analysis charge)', async () => {
  let called = false;
  const r = await handleContact({ ...valid, email: '' }, env, fakeFetch(), { checkBot: async () => { called = true; return { isBot: false }; } });
  assert.equal(r.status, 400);
  assert.equal(called, false);
});

test('honeypot is rejected before BotID runs', async () => {
  let called = false;
  await handleContact({ ...valid, website: 'x' }, env, fakeFetch(), { checkBot: async () => { called = true; return { isBot: false }; } });
  assert.equal(called, false);
});

test('BotID outage fails open: the enquiry still goes through', async () => {
  const f = fakeFetch();
  const r = await handleContact(valid, env, f, { checkBot: async () => { throw new Error('botid down'); } });
  assert.equal(r.status, 200);
  assert.ok(f.calls.some(c => c.base === RESEND));
});

// --- Kickbox ---------------------------------------------------------------
const KB = 'https://api.kickbox.com/v2/verify';
const kbEnv = { ...env, KICKBOX_API_KEY: 'kb' };
function kbFetch(verdict, statuses = {}) {
  const inner = fakeFetch(statuses);
  const fn = async (url, init = {}) => {
    if (url.startsWith(KB)) {
      inner.calls.push({ url, base: KB, method: 'GET', init, body: null });
      if (verdict instanceof Error) throw verdict;
      return new Response(JSON.stringify(verdict), { status: 200 });
    }
    return inner(url, init);
  };
  fn.calls = inner.calls;
  return fn;
}

test('Kickbox is called with the email, key and a timeout, before anything is saved', async () => {
  const f = kbFetch({ success: true, result: 'deliverable', sendex: 0.9 });
  await handleContact(valid, kbEnv, f, { checkBot: human });
  const u = new URL(f.calls[0].url);
  assert.equal(u.origin + u.pathname, KB);
  assert.equal(u.searchParams.get('email'), 'ada@bank.example');
  assert.equal(u.searchParams.get('apikey'), 'kb');
  assert.ok(Number(u.searchParams.get('timeout')) > 0);
});

test('undeliverable address: 400 asking them to check it, nothing saved or sent', async () => {
  const f = kbFetch({ success: true, result: 'undeliverable', reason: 'rejected_email', did_you_mean: null });
  const r = await handleContact(valid, kbEnv, f, { checkBot: human });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /check/i);
  assert.equal(f.calls.filter(c => c.base !== KB).length, 0);
});

test('undeliverable with a typo suggestion: the error offers it', async () => {
  const f = kbFetch({ success: true, result: 'undeliverable', did_you_mean: 'ada@bank.example.com' });
  const r = await handleContact(valid, kbEnv, f, { checkBot: human });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /ada@bank\.example\.com/);
});

test('disposable address: 400 asking for a work email', async () => {
  const f = kbFetch({ success: true, result: 'deliverable', disposable: true });
  const r = await handleContact(valid, kbEnv, f, { checkBot: human });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /work email/i);
});

for (const result of ['risky', 'unknown']) {
  test(`"${result}" address is accepted and the verdict is noted for the team`, async () => {
    const f = kbFetch({ success: true, result, reason: 'accept_all', sendex: 0.4 });
    const r = await handleContact(valid, kbEnv, f, { checkBot: human });
    assert.equal(r.status, 200);
    assert.match(f.calls.find(c => c.base === LF_NOTES).body.fields.$content, new RegExp(result));
    assert.match(f.calls.find(c => c.base === RESEND).body.text, new RegExp(result));
  });
}

test('Kickbox reports failure (e.g. balance depleted): fail open', async () => {
  const f = kbFetch({ success: false, message: 'Balance Depleted' });
  const r = await handleContact(valid, kbEnv, f, { checkBot: human });
  assert.equal(r.status, 200);
});

test('Kickbox network error: fail open', async () => {
  const f = kbFetch(new Error('ETIMEDOUT'));
  const r = await handleContact(valid, kbEnv, f, { checkBot: human });
  assert.equal(r.status, 200);
});

test('no KICKBOX_API_KEY: Kickbox is skipped', async () => {
  const f = kbFetch({ success: true, result: 'undeliverable' });
  const r = await handleContact(valid, env, f, { checkBot: human });
  assert.equal(r.status, 200);
  assert.equal(f.calls.some(c => c.base === KB), false);
});

test('BotID runs before Kickbox, so bots never spend Kickbox credits', async () => {
  const f = kbFetch({ success: true, result: 'deliverable' });
  await handleContact(valid, kbEnv, f, { checkBot: bot });
  assert.equal(f.calls.some(c => c.base === KB), false);
});

test('POST: invalid JSON body is a 400', async () => {
  const r = await POST(new Request('https://x/api/contact', { method: 'POST', body: '{nope' }));
  assert.equal(r.status, 400);
});

test('POST: returns JSON', async () => {
  const r = await POST(new Request('https://x/api/contact', { method: 'POST', body: JSON.stringify({}) }));
  assert.equal(r.status, 400);
  assert.equal(typeof (await r.json()).error, 'string');
});
