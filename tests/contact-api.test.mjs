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

// Records every outbound call; responds per URL with the supplied status.
function fakeFetch(statuses = {}) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const status = statuses[url] ?? 200;
    const id = url.endsWith('/contacts') ? 'con_1' : url.endsWith('/notes') ? 'note_1' : 'em_1';
    return new Response(JSON.stringify({ id }), { status });
  };
  fn.calls = calls;
  return fn;
}
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

test('POST: invalid JSON body is a 400', async () => {
  const r = await POST(new Request('https://x/api/contact', { method: 'POST', body: '{nope' }));
  assert.equal(r.status, 400);
});

test('POST: returns JSON', async () => {
  const r = await POST(new Request('https://x/api/contact', { method: 'POST', body: JSON.stringify({}) }));
  assert.equal(r.status, 400);
  assert.equal(typeof (await r.json()).error, 'string');
});
