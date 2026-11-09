import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { send, serveFile } from './http.js';
import { admin } from './admin.js';
import { checkout, contact, stripeWebhook, thanks } from './site.js';
import { notice } from './views.js';

const ROOT = resolve(import.meta.dirname, '..');
const PUBLIC = join(ROOT, 'public');

export function loadConfig(env = process.env) {
  const cfg = {
    port: Number(env.PORT ?? 3000),
    baseUrl: (env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
    dbFile: resolve(ROOT, env.DB_FILE ?? 'data/daninktattoo.db'),
    uploadsDir: resolve(ROOT, env.UPLOADS_DIR ?? 'data/uploads'),
    trustProxy: env.TRUST_PROXY === '1',
    adminHash: env.ADMIN_PASSWORD_HASH ?? '',
    sessionSecret: env.SESSION_SECRET ?? '',
    stripeKey: env.STRIPE_SECRET_KEY ?? '',
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET ?? '',
    smtp: { host: env.SMTP_HOST, port: Number(env.SMTP_PORT ?? 465), user: env.SMTP_USER, pass: env.SMTP_PASS },
    mailFrom: env.MAIL_FROM ?? 'DANINK <noreply@localhost>',
    notifyTo: env.NOTIFY_TO ?? '',
    calOrigin: (env.CAL_ORIGIN ?? 'https://app.cal.com').replace(/\/$/, ''),
    calLink: env.CAL_LINK ?? '',
  };
  const missing = ['adminHash', 'sessionSecret', 'notifyTo'].filter((k) => !cfg[k]);
  if (missing.length) throw new Error(`Configurazione mancante: ${missing.join(', ')} (vedi .env.example)`);
  if (cfg.sessionSecret.length < 32) throw new Error('SESSION_SECRET deve avere almeno 32 caratteri.');
  return cfg;
}

export function createApp(ctx) {
  const { cfg } = ctx;
  const calHost = new URL(cfg.calOrigin).origin;
  // La home è statica: al boot si inseriscono solo i dati del calendario.
  const index = readFileSync(join(PUBLIC, 'index.html'), 'utf8')
    .replaceAll('%CAL_ORIGIN%', cfg.calOrigin).replaceAll('%CAL_LINK%', cfg.calLink);
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': [
      "default-src 'self'", `script-src 'self' ${calHost}`, `frame-src ${calHost}`, `connect-src 'self' ${calHost}`,
      "img-src 'self' data:", "style-src 'self' 'unsafe-inline'", "font-src 'self'",
      "form-action 'self' https://checkout.stripe.com", "frame-ancestors 'none'", "base-uri 'none'",
    ].join('; '),
  };

  return async (req, res) => {
    const url = new URL(req.url, 'http://local');
    const p = url.pathname;
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    try {
      if (p.startsWith('/admin')) return await admin(req, res, url, ctx);
      if (req.method === 'POST' && p === '/api/contact') return await contact(req, res, ctx);
      if (req.method === 'POST' && p === '/api/giftcards/checkout') return await checkout(req, res, ctx);
      if (req.method === 'POST' && p === '/api/stripe/webhook') return await stripeWebhook(req, res, ctx);
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Metodo non consentito', 'text/plain');
      if (p === '/' || p === '/index.html') return send(res, 200, index, 'text/html; charset=utf-8', { 'Cache-Control': 'no-cache' });
      if (p === '/grazie') return send(res, 200, thanks(url.searchParams.get('per')));
      if (serveFile(res, PUBLIC, decodeURIComponent(p))) return;
      send(res, 404, notice('Pagina non trovata', 'Questa pagina non esiste (o non esiste più).'));
    } catch (e) {
      if (!e.status || e.status >= 500) console.error(e);
      if (res.headersSent) return res.end();
      const back = p.startsWith('/admin') ? '/admin' : '/';
      send(res, e.status ?? 500, e.status && e.status < 500
        ? notice('Qualcosa non va', `${e.message} Usa il tasto «indietro» del browser per correggere: i dati inseriti restano nel modulo.`, back)
        : notice('Errore', e.status === 503 ? e.message : 'Si è verificato un errore imprevisto. Riprova più tardi o scrivimi su Instagram.', back));
    }
  };
}
