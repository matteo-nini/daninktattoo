import { createHmac, timingSafeEqual } from 'node:crypto';

// Stripe vuole i parametri annidati come form: line_items[0][price_data][currency]=eur
export function encode(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v == null) continue;
    if (typeof v === 'object') encode(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export function stripeClient(secretKey) {
  return {
    async createCheckout(params) {
      if (!secretKey) throw Object.assign(new Error('Pagamenti non ancora configurati.'), { status: 503 });
      const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: encode(params),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(`Stripe: ${json.error?.message ?? res.status}`);
      return json;
    },
  };
}

export const sign = (payload, secret, t) => createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');

// Verifica l'header Stripe-Signature ("t=...,v1=...") come da documentazione Stripe.
export function verifyWebhook(payload, header, secret, now = Math.floor(Date.now() / 1000), tolerance = 300) {
  if (!secret || !header) throw new Error('firma mancante');
  const parts = header.split(',').map((p) => p.split('='));
  const t = Number(parts.find(([k]) => k === 't')?.[1]);
  if (!t || Math.abs(now - t) > tolerance) throw new Error('firma scaduta');
  const expected = Buffer.from(sign(payload, secret, t));
  const ok = parts.some(([k, v]) => k === 'v1' && v?.length === expected.length && timingSafeEqual(Buffer.from(v), expected));
  if (!ok) throw new Error('firma non valida');
  return JSON.parse(payload);
}
