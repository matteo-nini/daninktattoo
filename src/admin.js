import { email, fail, html, oneOf, rateLimit, readForm, redirect, send, serveFile, text, clientIp } from './http.js';
import { clearCookie, isAuthed, sessionCookie, verifyPassword } from './auth.js';
import { createGiftcard, euro, findByCode, fmtDate, getGiftcard, redeem, redemptions, status, toCents } from './giftcards.js';
import { giftcardVisual } from './mail.js';
import { sendGiftcard } from './site.js';
import { page } from './views.js';

const loginLimit = rateLimit(10, 15 * 60e3);

export async function admin(req, res, url, ctx) {
  const { cfg } = ctx;
  const p = url.pathname;
  const post = req.method === 'POST';

  if (p === '/admin/login') return post ? login(req, res, ctx) : send(res, 200, loginPage());
  if (!isAuthed(req, cfg.sessionSecret)) return redirect(res, '/admin/login');
  // Oltre al cookie SameSite=Strict: un POST da un'altra origine viene rifiutato.
  if (post && req.headers.origin && req.headers.origin !== new URL(cfg.baseUrl).origin) throw fail(403, 'Origine non valida.');

  if (post && p === '/admin/logout') return redirect(res, '/admin/login', { 'Set-Cookie': clearCookie() });
  if (p === '/admin' || p === '/admin/') return dashboard(res, url, ctx);
  if (p === '/admin/messages') return messages(res, ctx);
  if (p === '/admin/giftcards/new') return post ? createManual(req, res, ctx) : send(res, 200, newPage());
  const file = p.match(/^\/admin\/uploads\/(\d+-\d\.(?:jpg|png|webp|heic))$/);
  if (file && serveFile(res, cfg.uploadsDir, file[1], 'private, no-store')) return;

  const m = p.match(/^\/admin\/giftcards\/(\d+)(?:\/(redeem|ship|resend|print))?$/);
  const card = m && getGiftcard(ctx.db, Number(m[1]));
  if (!card) throw fail(404, 'Pagina non trovata.');
  const action = m[2];
  if (!post && !action) return send(res, 200, detailPage(card, ctx));
  if (!post && action === 'print') return send(res, 200, page(`Stampa ${card.code}`, html`<div class="print">${giftcardVisual(card)}</div>`, { admin: true }));
  if (post && action === 'redeem') {
    const form = await readForm(req, 10e3);
    redeem(ctx.db, card.id, toCents(form.get('importo')), text(form, 'nota', 300));
  }
  if (post && action === 'ship') ctx.db.prepare("UPDATE giftcards SET shipped_at = datetime('now') WHERE id = ?").run(card.id);
  if (post && action === 'resend') await sendGiftcard(card, ctx);
  redirect(res, `/admin/giftcards/${card.id}`);
}

async function login(req, res, { cfg }) {
  if (!loginLimit(clientIp(req, cfg.trustProxy))) throw fail(429, 'Troppi tentativi, riprova tra 15 minuti.');
  const form = await readForm(req, 2e3);
  if (!verifyPassword(form.get('password') ?? '', cfg.adminHash)) return send(res, 401, loginPage('Password errata.'));
  redirect(res, '/admin', { 'Set-Cookie': sessionCookie(cfg.sessionSecret, cfg.baseUrl.startsWith('https')) });
}

const loginPage = (error) => page('Accesso', html`
  <form class="card narrow" method="post" action="/admin/login">
    <h1>Pannello</h1>
    ${error && html`<p class="error">${error}</p>`}
    <label>Password <input type="password" name="password" required autofocus autocomplete="current-password"></label>
    <button class="btn">Entra</button>
  </form>`, { admin: true });

const badge = (c) => html`<span class="badge ${status(c)}">${status(c)}</span>`;

function dashboard(res, url, { db }) {
  const q = (url.searchParams.get('q') ?? '').trim();
  const exact = q && findByCode(db, q);
  if (exact) return redirect(res, `/admin/giftcards/${exact.id}`);
  const like = `%${q}%`;
  const cards = q
    ? db.prepare('SELECT * FROM giftcards WHERE code LIKE ? OR buyer_name LIKE ? OR buyer_email LIKE ? OR recipient_name LIKE ? ORDER BY id DESC LIMIT 100').all(like, like, like, like)
    : db.prepare('SELECT * FROM giftcards ORDER BY id DESC LIMIT 100').all();
  const toShip = db.prepare("SELECT COUNT(*) AS n FROM giftcards WHERE format = 'physical' AND shipped_at IS NULL").get().n;
  send(res, 200, page('Gift card', html`
    <div class="bar">
      <h1>Gift card</h1>
      <a class="btn" href="/admin/giftcards/new">+ Nuova gift card</a>
    </div>
    <form class="search" method="get" action="/admin">
      <label>Verifica un codice o cerca per nome/email
        <input name="q" value="${q}" placeholder="DANI-XXXX-XXXX" autocapitalize="characters" autofocus>
      </label>
      <button class="btn">Cerca</button>
    </form>
    ${toShip > 0 && html`<p class="alert">${toShip} gift card cartacee da spedire.</p>`}
    ${q && !cards.length && html`<p class="error">Nessuna gift card trovata per “${q}”.</p>`}
    <table class="table">
      <thead><tr><th>Codice</th><th>Valore</th><th>Saldo</th><th>Stato</th><th>Acquirente</th><th>Creata</th></tr></thead>
      <tbody>${cards.map((c) => html`<tr>
        <td><a href="/admin/giftcards/${c.id}">${c.code}</a>${c.format === 'physical' && !c.shipped_at && html` <span class="badge ship">da spedire</span>`}</td>
        <td>${euro(c.amount_cents)}</td><td>${euro(c.balance_cents)}</td><td>${badge(c)}</td>
        <td>${c.buyer_name || c.note || '—'}</td><td>${fmtDate(c.created_at)}</td></tr>`)}</tbody>
    </table>`, { admin: true }));
}

function detailPage(c, { db }) {
  const used = redemptions(db, c.id);
  const canRedeem = ['attiva', 'parziale'].includes(status(c));
  return page(c.code, html`
    <p><a href="/admin">← Tutte le gift card</a></p>
    <div class="bar"><h1 class="code">${c.code}</h1>${badge(c)}</div>
    <div class="grid2">
      <dl class="card facts">
        <dt>Valore</dt><dd>${euro(c.amount_cents)}</dd>
        <dt>Saldo</dt><dd><b>${euro(c.balance_cents)}</b></dd>
        <dt>Scadenza</dt><dd>${fmtDate(c.expires_at)}</dd>
        <dt>Formato</dt><dd>${c.format === 'physical' ? 'Cartacea' : 'Digitale'}</dd>
        <dt>Acquirente</dt><dd>${c.buyer_name || '—'} ${c.buyer_email && html`<br><a href="mailto:${c.buyer_email}">${c.buyer_email}</a>`}</dd>
        <dt>Per</dt><dd>${c.recipient_name || '—'}</dd>
        ${c.message && html`<dt>Dedica</dt><dd>${c.message}</dd>`}
        ${c.note && html`<dt>Nota</dt><dd>${c.note}</dd>`}
        ${c.shipping && html`<dt>Spedizione</dt><dd class="pre">${c.shipping}</dd>`}
        <dt>Email</dt><dd>${c.emailed_at ? `inviata il ${fmtDate(c.emailed_at)}` : 'non inviata'}</dd>
      </dl>
      <div>
        ${canRedeem && html`<form class="card" method="post" action="/admin/giftcards/${c.id}/redeem">
          <h2>Usa la gift card</h2>
          <label>Importo da scalare (€) <input name="importo" inputmode="decimal" required value="${(c.balance_cents / 100).toFixed(2).replace('.', ',')}"></label>
          <label>Nota (es. tatuaggio avambraccio) <input name="nota" maxlength="300"></label>
          <button class="btn">Conferma utilizzo</button>
        </form>`}
        <div class="actions">
          <a class="btn ghost" href="/admin/giftcards/${c.id}/print" target="_blank">Stampa</a>
          ${c.buyer_email && html`<form method="post" action="/admin/giftcards/${c.id}/resend"><button class="btn ghost">Reinvia email</button></form>`}
          ${c.format === 'physical' && !c.shipped_at && html`<form method="post" action="/admin/giftcards/${c.id}/ship"><button class="btn ghost">Segna come spedita</button></form>`}
          ${c.shipped_at && html`<span>Spedita il ${fmtDate(c.shipped_at)}</span>`}
        </div>
      </div>
    </div>
    <h2>Utilizzi</h2>
    ${used.length ? html`<table class="table"><thead><tr><th>Data</th><th>Importo</th><th>Nota</th></tr></thead>
      <tbody>${used.map((r) => html`<tr><td>${fmtDate(r.created_at)}</td><td>${euro(r.amount_cents)}</td><td>${r.note || ''}</td></tr>`)}</tbody></table>`
      : html`<p>Non ancora utilizzata.</p>`}`, { admin: true });
}

const newPage = () => page('Nuova gift card', html`
  <p><a href="/admin">← Tutte le gift card</a></p>
  <form class="card narrow" method="post" action="/admin/giftcards/new">
    <h1>Nuova gift card</h1>
    <p>Per le gift card vendute di persona (contanti, POS). Il codice viene generato in automatico.</p>
    <label>Valore (€) <input name="importo" inputmode="decimal" required></label>
    <fieldset><legend>Formato</legend>
      <label class="inline"><input type="radio" name="formato" value="physical" checked> Cartacea</label>
      <label class="inline"><input type="radio" name="formato" value="digital"> Digitale</label>
    </fieldset>
    <label>Acquirente <input name="nome" maxlength="120"></label>
    <label>Email acquirente (se compilata riceve la gift card) <input type="email" name="email" maxlength="200"></label>
    <label>Per chi è <input name="destinatario" maxlength="120"></label>
    <label>Dedica <textarea name="dedica" maxlength="300" rows="2"></textarea></label>
    <label>Nota interna (es. pagata in contanti) <input name="nota" maxlength="300"></label>
    <button class="btn">Crea gift card</button>
  </form>`, { admin: true });

async function createManual(req, res, ctx) {
  const form = await readForm(req, 10e3);
  const amountCents = toCents(form.get('importo'));
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw fail(400, 'Valore non valido.');
  const card = createGiftcard(ctx.db, {
    amountCents,
    format: oneOf(form, 'formato', ['digital', 'physical']),
    buyerName: text(form, 'nome', 120),
    buyerEmail: email(form, 'email', false),
    recipientName: text(form, 'destinatario', 120),
    message: text(form, 'dedica', 300),
    note: text(form, 'nota', 300),
  });
  if (card.buyer_email) await sendGiftcard(card, ctx);
  redirect(res, `/admin/giftcards/${card.id}`);
}

function messages(res, { db }) {
  const rows = db.prepare('SELECT * FROM messages ORDER BY id DESC LIMIT 200').all();
  send(res, 200, page('Messaggi', html`
    <h1>Messaggi dal sito</h1>
    ${!rows.length && html`<p>Ancora nessun messaggio.</p>`}
    ${rows.map((m) => html`<article class="card message">
      <header><b>${m.name}</b> · <a href="mailto:${m.email}">${m.email}</a> ${m.phone && html`· <a href="tel:${m.phone}">${m.phone}</a>`}
        <span class="muted">${fmtDate(m.created_at)} ${!m.emailed_at && '· email non inviata'}</span></header>
      <p><b>${m.topic}</b>${m.placement && html` · ${m.placement}`}${m.budget && html` · ${m.budget}`}</p>
      <p class="pre">${m.body}</p>
      ${JSON.parse(m.files).map((f) => html`<a href="/admin/uploads/${f}" target="_blank"><img class="thumb" src="/admin/uploads/${f}" alt="Riferimento allegato"></a>`)}
    </article>`)}`, { admin: true }));
}
