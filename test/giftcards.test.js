import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createGiftcard, findByCode, newCode, normalizeCode, redeem, redemptions, status, toCents } from '../src/giftcards.js';
import { encode, sign, verifyWebhook } from '../src/stripe.js';
import { hashPassword, verifyPassword } from '../src/auth.js';

test('codici: formato leggibile e normalizzazione', () => {
  assert.match(newCode(), /^DANI-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(normalizeCode(' dani-abcd-2345 '), 'DANI-ABCD-2345');
  assert.equal(normalizeCode('abcd 2345'), 'DANI-ABCD-2345');
  assert.equal(normalizeCode('xyz'), null);
  assert.equal(toCents('45,50'), 4550);
});

test('utilizzo parziale, saldo e limiti', () => {
  const db = openDb(':memory:');
  const card = createGiftcard(db, { amountCents: 10000, format: 'digital' });
  assert.equal(findByCode(db, card.code.toLowerCase()).id, card.id);
  assert.equal(status(card), 'attiva');

  const after = redeem(db, card.id, 6000, 'avambraccio');
  assert.equal(after.balance_cents, 4000);
  assert.equal(status(after), 'parziale');
  assert.throws(() => redeem(db, card.id, 4001), /saldo/);
  assert.throws(() => redeem(db, card.id, 0), /non valido/);
  assert.equal(status(redeem(db, card.id, 4000)), 'usata');
  assert.equal(redemptions(db, card.id).length, 2);

  db.prepare("UPDATE giftcards SET balance_cents = 100, expires_at = date('now', '-1 day') WHERE id = ?").run(card.id);
  assert.throws(() => redeem(db, card.id, 100), /scaduta/);
});

test('stripe: parametri annidati e firma webhook', () => {
  assert.equal(encode({ a: { b: [{ c: 1 }] }, x: null }).toString(), 'a%5Bb%5D%5B0%5D%5Bc%5D=1');
  const payload = '{"type":"x"}';
  const t = 1_700_000_000;
  const header = `t=${t},v1=${sign(payload, 'whsec', t)}`;
  assert.deepEqual(verifyWebhook(payload, header, 'whsec', t), { type: 'x' });
  assert.throws(() => verifyWebhook(payload, header, 'altro', t), /non valida/);
  assert.throws(() => verifyWebhook(payload, header, 'whsec', t + 1000), /scaduta/);
});

test('password del pannello', () => {
  const h = hashPassword('una-password-lunga');
  assert.ok(verifyPassword('una-password-lunga', h));
  assert.ok(!verifyPassword('sbagliata', h));
  assert.ok(!verifyPassword('x', 'spazzatura'));
});
