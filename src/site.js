import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { email, fail, oneOf, rateLimit, readBody, readForm, redirect, send, text, clientIp } from './http.js';
import { createGiftcard, MAX_EUR, MIN_EUR } from './giftcards.js';
import { contactNotice, giftcardEmail, giftcardNotice } from './mail.js';
import { verifyWebhook } from './stripe.js';
import { tx } from './db.js';
import { notice } from './views.js';

export const TOPICS = ['Nuovo tatuaggio', 'Cover-up / rework', 'Gift card', 'Altro'];
export const BUDGETS = ['', 'Fino a 150 €', '150–300 €', '300–500 €', 'Oltre 500 €', 'Non so ancora'];
const IMAGE_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' };
const MAX_FILES = 3;
const MAX_FILE_MB = 5;

const contactLimit = rateLimit(5, 15 * 60e3);
const checkoutLimit = rateLimit(10, 15 * 60e3);

const consent = (form) => {
  if (form.get('privacy') !== 'si') throw fail(400, 'Per procedere serve il consenso al trattamento dei dati.');
};

export async function contact(req, res, { db, cfg, mail }) {
  if (!contactLimit(clientIp(req, cfg.trustProxy))) throw fail(429, 'Troppi invii ravvicinati, riprova tra qualche minuto.');
  const form = await readForm(req, (MAX_FILES * MAX_FILE_MB + 1) * 1e6);
  if (form.get('sito')) return redirect(res, '/grazie?per=messaggio'); // campo trappola: lo compilano solo i bot
  consent(form);
  const m = {
    name: text(form, 'nome', 120, true),
    email: email(form),
    phone: text(form, 'telefono', 40),
    topic: oneOf(form, 'tipo', TOPICS),
    placement: text(form, 'zona', 200),
    budget: oneOf(form, 'budget', BUDGETS),
    body: text(form, 'messaggio', 4000, true),
  };
  const files = form.getAll('riferimenti').filter((f) => typeof f !== 'string' && f.size > 0);
  if (files.length > MAX_FILES) throw fail(400, `Puoi allegare al massimo ${MAX_FILES} immagini.`);
  for (const f of files) {
    if (!IMAGE_EXT[f.type]) throw fail(400, 'Gli allegati devono essere immagini (JPG, PNG, WEBP o HEIC).');
    if (f.size > MAX_FILE_MB * 1e6) throw fail(400, `Ogni immagine può pesare al massimo ${MAX_FILE_MB} MB.`);
  }

  // Prima si salva tutto, poi si prova l'email: se l'SMTP cade, il messaggio resta nel pannello.
  const { lastInsertRowid: id } = db.prepare(
    'INSERT INTO messages (name, email, phone, topic, placement, budget, body) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(m.name, m.email, m.phone, m.topic, m.placement, m.budget, m.body);
  mkdirSync(cfg.uploadsDir, { recursive: true });
  const attachments = await Promise.all(files.map(async (f, i) => {
    const filename = `${id}-${i + 1}.${IMAGE_EXT[f.type]}`;
    const content = Buffer.from(await f.arrayBuffer());
    writeFileSync(join(cfg.uploadsDir, filename), content);
    return { filename, content };
  }));
  db.prepare('UPDATE messages SET files = ? WHERE id = ?').run(JSON.stringify(attachments.map((a) => a.filename)), id);

  try {
    await mail.send(contactNotice(m, cfg, attachments));
    db.prepare("UPDATE messages SET emailed_at = datetime('now') WHERE id = ?").run(id);
  } catch (e) {
    console.error('Email contatto non inviata', id, e.message);
  }
  redirect(res, '/grazie?per=messaggio');
}

export async function checkout(req, res, { db, cfg, stripe }) {
  if (!checkoutLimit(clientIp(req, cfg.trustProxy))) throw fail(429, 'Troppi tentativi, riprova tra qualche minuto.');
  const form = await readForm(req, 20e3);
  consent(form);
  const euros = Number(form.get('importo'));
  if (!Number.isInteger(euros) || euros < MIN_EUR || euros > MAX_EUR) throw fail(400, `L'importo deve essere tra ${MIN_EUR} e ${MAX_EUR} €.`);
  const format = oneOf(form, 'formato', ['digital', 'physical']);
  const buyerName = text(form, 'nome', 120, true);
  const buyerEmail = email(form);
  const recipientName = text(form, 'destinatario', 120);
  const message = text(form, 'dedica', 300);

  const amount = euros * 100;
  const { lastInsertRowid: orderId } = db.prepare(
    "INSERT INTO orders (kind, amount_cents, email, data) VALUES ('giftcard', ?, ?, ?)",
  ).run(amount, buyerEmail, JSON.stringify({ format, buyerName, recipientName, message }));

  const session = await stripe.createCheckout({
    mode: 'payment',
    locale: 'it',
    customer_email: buyerEmail,
    client_reference_id: String(orderId),
    metadata: { order_id: String(orderId) },
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'eur',
        unit_amount: amount,
        product_data: {
          name: `Gift card DANINK ${euros} €`,
          description: format === 'physical' ? 'Cartacea, spedita a casa' : 'Digitale, inviata via email',
        },
      },
    }],
    shipping_address_collection: format === 'physical' ? { allowed_countries: ['IT'] } : null,
    success_url: `${cfg.baseUrl}/grazie?per=giftcard`,
    cancel_url: `${cfg.baseUrl}/#gift-card`,
  });
  db.prepare('UPDATE orders SET stripe_session = ? WHERE id = ?').run(session.id, orderId);
  redirect(res, session.url);
}

const PAID_EVENTS = ['checkout.session.completed', 'checkout.session.async_payment_succeeded'];

export async function stripeWebhook(req, res, ctx) {
  const payload = (await readBody(req, 1e6)).toString('utf8');
  let event;
  try {
    event = verifyWebhook(payload, req.headers['stripe-signature'], ctx.cfg.stripeWebhookSecret);
  } catch (e) {
    throw fail(400, `Webhook rifiutato: ${e.message}`);
  }
  const session = event.data?.object;
  if (PAID_EVENTS.includes(event.type) && session?.payment_status === 'paid') await fulfil(session, ctx);
  send(res, 200, 'ok', 'text/plain');
}

function shippingText(session) {
  const s = session.collected_information?.shipping_details ?? session.shipping_details;
  if (!s?.address) return null;
  const a = s.address;
  return [s.name, a.line1, a.line2, `${a.postal_code ?? ''} ${a.city ?? ''} ${a.state ?? ''}`.trim(), a.country].filter(Boolean).join('\n');
}

// Idempotente: Stripe può mandare lo stesso evento più volte, l'ordine già pagato viene ignorato.
async function fulfil(session, { db, cfg, mail }) {
  const card = tx(db, () => {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(session.metadata?.order_id));
    if (!order || order.status === 'paid' || order.kind !== 'giftcard') return null;
    db.prepare("UPDATE orders SET status = 'paid', paid_at = datetime('now') WHERE id = ?").run(order.id);
    const d = JSON.parse(order.data);
    return createGiftcard(db, {
      orderId: order.id, amountCents: order.amount_cents, format: d.format, buyerName: d.buyerName,
      buyerEmail: order.email, recipientName: d.recipientName, message: d.message, shipping: shippingText(session),
    });
  });
  if (card) await sendGiftcard(card, { db, cfg, mail });
}

export async function sendGiftcard(card, { db, cfg, mail }) {
  try {
    if (card.buyer_email) await mail.send(giftcardEmail(card, cfg));
    if (card.order_id) await mail.send(giftcardNotice(card, cfg));
    db.prepare("UPDATE giftcards SET emailed_at = datetime('now') WHERE id = ?").run(card.id);
  } catch (e) {
    console.error('Email gift card non inviata', card.code, e.message);
  }
}

export const thanks = (per) => per === 'giftcard'
  ? notice('Grazie!', 'Il pagamento è andato a buon fine: tra pochi minuti riceverai la gift card via email. Se non la trovi, controlla lo spam.')
  : notice('Messaggio inviato', 'Grazie per avermi scritto! Ti rispondo il prima possibile, di solito entro un paio di giorni.');
