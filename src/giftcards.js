import { randomInt } from 'node:crypto';
import { fail } from './http.js';
import { tx } from './db.js';

export const MIN_EUR = 50;
export const MAX_EUR = 1000;
const VALID_MONTHS = 12;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // niente 0/O e 1/I: si dettano senza equivoci

export function newCode() {
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `DANI-${s.slice(0, 4)}-${s.slice(4)}`;
}

// Accetta "dani-abcd-2345", "ABCD 2345", "abcd2345"...
export function normalizeCode(input) {
  const s = String(input).toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^DANI(?=.{8}$)/, '');
  return /^[A-Z0-9]{8}$/.test(s) ? `DANI-${s.slice(0, 4)}-${s.slice(4)}` : null;
}

export const today = () => new Date().toISOString().slice(0, 10);

export function status(card, day = today()) {
  if (card.balance_cents === 0) return 'usata';
  if (card.expires_at < day) return 'scaduta';
  return card.balance_cents < card.amount_cents ? 'parziale' : 'attiva';
}

export function createGiftcard(db, c) {
  // Codici da 32^8 combinazioni: una collisione è praticamente impossibile, il vincolo UNIQUE fa da rete.
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO giftcards (code, order_id, amount_cents, balance_cents, format, buyer_name, buyer_email,
      recipient_name, message, shipping, note, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, date('now', '+${VALID_MONTHS} months'))`).run(
    newCode(), c.orderId ?? null, c.amountCents, c.amountCents, c.format, c.buyerName || null, c.buyerEmail || null,
    c.recipientName || null, c.message || null, c.shipping || null, c.note || null);
  return getGiftcard(db, lastInsertRowid);
}

export const getGiftcard = (db, id) => db.prepare('SELECT * FROM giftcards WHERE id = ?').get(id);

export const findByCode = (db, input) => {
  const code = normalizeCode(input);
  return code && db.prepare('SELECT * FROM giftcards WHERE code = ?').get(code);
};

export const redemptions = (db, id) =>
  db.prepare('SELECT * FROM redemptions WHERE giftcard_id = ? ORDER BY id').all(id);

// Scala l'importo usato al momento del tatuaggio. Ammessi utilizzi parziali.
export function redeem(db, id, amountCents, note) {
  return tx(db, () => {
    const card = getGiftcard(db, id);
    if (!card) throw fail(404, 'Gift card non trovata.');
    if (card.expires_at < today()) throw fail(400, 'Gift card scaduta.');
    if (!Number.isInteger(amountCents) || amountCents <= 0) throw fail(400, 'Importo non valido.');
    if (amountCents > card.balance_cents) throw fail(400, 'Importo superiore al saldo disponibile.');
    db.prepare('UPDATE giftcards SET balance_cents = balance_cents - ? WHERE id = ?').run(amountCents, id);
    db.prepare('INSERT INTO redemptions (giftcard_id, amount_cents, note) VALUES (?, ?, ?)').run(id, amountCents, note || null);
    return getGiftcard(db, id);
  });
}

export const euro = (cents) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100);

export const toCents = (input) => {
  const n = Number(String(input).trim().replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};

export const fmtDate = (s) =>
  s ? new Date(s.length === 10 ? `${s}T12:00:00Z` : `${s.replace(' ', 'T')}Z`).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' }) : '';
