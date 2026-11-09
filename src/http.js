import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

export const fail = (status, message) => Object.assign(new Error(message), { status });

// Template HTML con escape automatico: interpola solo testo sicuro, raw() per HTML fidato.
export const raw = (s) => ({ __html: String(s) });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const render = (v) => (v == null || v === false ? '' : Array.isArray(v) ? v.map(render).join('') : v.__html ?? esc(v));
export const html = (strings, ...vals) =>
  raw(strings.reduce((out, s, i) => out + s + (i < vals.length ? render(vals[i]) : ''), ''));

export function send(res, status, body, type = 'text/html; charset=utf-8', headers = {}) {
  res.writeHead(status, { 'Content-Type': type, ...headers });
  res.end(body?.__html ?? body);
}

export const redirect = (res, location, headers = {}) => send(res, 303, '', 'text/plain', { Location: location, ...headers });

export async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw fail(413, 'Richiesta troppo grande.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// La Request di Node sa già leggere sia form urlencoded sia multipart (file inclusi).
export async function readForm(req, limit) {
  const body = await readBody(req, limit);
  return new Request('http://local/', { method: 'POST', headers: { 'content-type': req.headers['content-type'] ?? '' }, body })
    .formData()
    .catch(() => {
      throw fail(400, 'Modulo non valido.');
    });
}

export function text(form, name, max, required = false) {
  const v = String(form.get(name) ?? '').trim();
  if (required && !v) throw fail(400, `Manca un campo obbligatorio (${name}).`);
  if (v.length > max) throw fail(400, `Il campo ${name} è troppo lungo.`);
  return v;
}

export function email(form, name = 'email', required = true) {
  const v = text(form, name, 200, required);
  if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw fail(400, 'Indirizzo email non valido.');
  return v;
}

export function oneOf(form, name, values) {
  const v = String(form.get(name) ?? '');
  if (!values.includes(v)) throw fail(400, `Valore non valido (${name}).`);
  return v;
}

// shortcut: contatori in memoria, si azzerano al riavvio; basta per un solo processo.
export function rateLimit(max, windowMs) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    if (hits.size > 10_000) hits.clear();
    const h = hits.get(key);
    if (h && now - h.t <= windowMs) return ++h.n <= max;
    hits.set(key, { t: now, n: 1 });
    return true;
  };
}

export const clientIp = (req, trustProxy) =>
  (trustProxy && req.headers['x-forwarded-for']?.split(',')[0].trim()) || req.socket.remoteAddress;

export function cookies(req) {
  return Object.fromEntries((req.headers.cookie ?? '').split(';').filter(Boolean).map((c) => {
    const i = c.indexOf('=');
    return [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1).trim())];
  }));
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.heic': 'image/heic', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

export function serveFile(res, root, path, cache = 'public, max-age=3600') {
  const file = normalize(join(root, path));
  if (!file.startsWith(root)) return false;
  let stat;
  try { stat = statSync(file); } catch { return false; }
  if (!stat.isFile()) return false;
  res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', 'Content-Length': stat.size, 'Cache-Control': cache });
  createReadStream(file).pipe(res);
  return true;
}
