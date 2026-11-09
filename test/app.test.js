import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, loadConfig } from '../src/app.js';
import { openDb } from '../src/db.js';
import { hashPassword } from '../src/auth.js';
import { sign } from '../src/stripe.js';

const tmp = mkdtempSync(join(tmpdir(), 'danink-'));
const sent = [];
const sessions = [];
const db = openDb(':memory:');
let server, base;

before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
  const cfg = loadConfig({
    BASE_URL: base, ADMIN_PASSWORD_HASH: hashPassword('password-di-prova'), SESSION_SECRET: 'x'.repeat(40),
    NOTIFY_TO: 'dani@example.com', STRIPE_WEBHOOK_SECRET: 'whsec_test', UPLOADS_DIR: tmp, CAL_LINK: 'dani/consulenza',
  });
  const stripe = { createCheckout: async (params) => (sessions.push(params), { id: `cs_${sessions.length}`, url: 'https://checkout.stripe.com/pay/test' }) };
  server.on('request', createApp({ cfg, db, mail: { send: async (m) => sent.push(m) }, stripe }));
});
after(() => { server.close(); rmSync(tmp, { recursive: true, force: true }); });

const post = (path, body, headers = {}) => fetch(base + path, { method: 'POST', body, headers, redirect: 'manual' });

test('home con calendario configurato', async () => {
  const html = await (await fetch(base)).text();
  assert.match(html, /data-link="dani\/consulenza"/);
  assert.equal((await fetch(`${base}/../package.json`)).status, 404);
});

test('modulo contatti: salva, allega e notifica', async () => {
  const form = new FormData();
  Object.entries({ nome: 'Anna Rossi', email: 'anna@example.com', tipo: 'Nuovo tatuaggio', budget: '', messaggio: 'Un ramo di ulivo', privacy: 'si' })
    .forEach(([k, v]) => form.append(k, v));
  form.append('riferimenti', new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }), 'ref.jpg');
  const res = await post('/api/contact', form);
  assert.equal(res.status, 303);
  const msg = db.prepare('SELECT * FROM messages').get();
  assert.equal(msg.name, 'Anna Rossi');
  assert.ok(msg.emailed_at);
  assert.ok(existsSync(join(tmp, JSON.parse(msg.files)[0])));
  assert.equal(sent.at(-1).replyTo, 'anna@example.com');
  assert.equal(sent.at(-1).attachments.length, 1);

  const bad = new URLSearchParams({ nome: 'X', email: 'non-una-email', tipo: 'Altro', budget: '', messaggio: 'ciao', privacy: 'si' });
  assert.equal((await post('/api/contact', bad)).status, 400);
});

test('gift card: checkout → webhook → codice → utilizzo nel pannello', async () => {
  const form = new URLSearchParams({ importo: '120', formato: 'physical', nome: 'Luca', email: 'luca@example.com', destinatario: 'Sara', dedica: 'Auguri!', privacy: 'si' });
  assert.equal((await post('/api/giftcards/checkout', new URLSearchParams({ ...Object.fromEntries(form), importo: '20' }))).status, 400);
  const res = await post('/api/giftcards/checkout', form);
  assert.equal(res.headers.get('location'), 'https://checkout.stripe.com/pay/test');
  const params = sessions.at(-1);
  assert.equal(params.line_items[0].price_data.unit_amount, 12000);
  assert.deepEqual(params.shipping_address_collection.allowed_countries, ['IT']);

  const event = JSON.stringify({ type: 'checkout.session.completed', data: { object: {
    payment_status: 'paid', metadata: params.metadata,
    collected_information: { shipping_details: { name: 'Sara Bianchi', address: { line1: 'Via Roma 1', postal_code: '80100', city: 'Napoli', country: 'IT' } } },
  } } });
  const t = Math.floor(Date.now() / 1000);
  const hook = () => post('/api/stripe/webhook', event, { 'stripe-signature': `t=${t},v1=${sign(event, 'whsec_test', t)}` });
  assert.equal((await post('/api/stripe/webhook', event, { 'stripe-signature': `t=${t},v1=falsa` })).status, 400);
  assert.equal((await hook()).status, 200);
  assert.equal((await hook()).status, 200); // Stripe ritenta: nessun doppione
  const cards = db.prepare('SELECT * FROM giftcards').all();
  assert.equal(cards.length, 1);
  assert.equal(cards[0].amount_cents, 12000);
  assert.match(cards[0].shipping, /Via Roma 1/);
  assert.ok(sent.some((m) => m.to === 'luca@example.com' && m.html.__html.includes(cards[0].code)));

  assert.equal((await fetch(`${base}/admin`, { redirect: 'manual' })).headers.get('location'), '/admin/login');
  assert.equal((await post('/admin/login', new URLSearchParams({ password: 'sbagliata' }))).status, 401);
  const login = await post('/admin/login', new URLSearchParams({ password: 'password-di-prova' }));
  const cookie = login.headers.get('set-cookie').split(';')[0];

  const lookup = await fetch(`${base}/admin?q=${cards[0].code.toLowerCase()}`, { headers: { cookie }, redirect: 'manual' });
  assert.equal(lookup.headers.get('location'), `/admin/giftcards/${cards[0].id}`);
  assert.match(await (await fetch(base + lookup.headers.get('location'), { headers: { cookie } })).text(), /Sara Bianchi/);

  await post(`/admin/giftcards/${cards[0].id}/redeem`, new URLSearchParams({ importo: '100,00', nota: 'braccio' }), { cookie });
  assert.equal(db.prepare('SELECT balance_cents FROM giftcards').get().balance_cents, 2000);
  const tooMuch = await post(`/admin/giftcards/${cards[0].id}/redeem`, new URLSearchParams({ importo: '50' }), { cookie });
  assert.equal(tooMuch.status, 400);
  const foreign = await post(`/admin/giftcards/${cards[0].id}/ship`, '', { cookie, origin: 'https://evil.example' });
  assert.equal(foreign.status, 403);
});
