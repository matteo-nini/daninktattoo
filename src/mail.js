import nodemailer from 'nodemailer';
import { html } from './http.js';
import { euro, fmtDate } from './giftcards.js';

export function mailer(cfg) {
  // Senza SMTP (sviluppo) le email finiscono nel log invece di partire.
  const transport = cfg.smtp.host
    ? nodemailer.createTransport({ host: cfg.smtp.host, port: cfg.smtp.port, secure: cfg.smtp.port === 465, auth: { user: cfg.smtp.user, pass: cfg.smtp.pass } })
    : nodemailer.createTransport({ jsonTransport: true });
  return {
    async send(msg) {
      const info = await transport.sendMail({ from: cfg.mailFrom, ...msg, html: msg.html?.__html ?? msg.html });
      if (!cfg.smtp.host) console.log('[email non inviata, SMTP non configurato]', msg.to, msg.subject);
      return info;
    },
  };
}

const ink = '#1d1b19';
const font = "font-family: Georgia, 'Times New Roman', serif;";

// Usata sia nell'email sia nella pagina di stampa: stili inline perché i client email ignorano i CSS esterni.
export const giftcardVisual = (c) => html`
<div style="max-width:520px;margin:0 auto;background:#f2efe9;border:1px solid #d9d3c9;border-radius:24px;padding:40px 32px;color:${ink};${font}text-align:center">
  <div style="letter-spacing:.3em;font-size:12px;text-transform:uppercase">DANINK · Gift card</div>
  <div style="font-size:56px;line-height:1.1;margin:24px 0 8px">${euro(c.amount_cents)}</div>
  ${c.recipient_name && html`<div style="font-size:20px;font-style:italic">per ${c.recipient_name}</div>`}
  ${c.message && html`<p style="font-size:16px;line-height:1.5;margin:20px auto;max-width:380px">“${c.message}”</p>`}
  <div style="margin:28px auto 8px;display:inline-block;border:1px dashed ${ink};border-radius:12px;padding:12px 20px;font-family:'Courier New',monospace;font-size:22px;letter-spacing:.12em">${c.code}</div>
  <div style="font-size:13px;color:#6b655e">Valida fino al ${fmtDate(c.expires_at)}</div>
</div>`;

export const giftcardEmail = (c, cfg) => ({
  to: c.buyer_email,
  subject: `La tua gift card DANINK da ${euro(c.amount_cents)}`,
  html: html`<div style="${font}color:${ink};padding:24px">
    <p>Ciao ${c.buyer_name || ''},</p>
    <p>grazie! Ecco la gift card. ${c.format === 'physical'
      ? 'Ti spedirò la versione cartacea all’indirizzo indicato: intanto qui trovi il codice.'
      : 'Puoi inoltrare questa email o stamparla.'}</p>
    ${giftcardVisual(c)}
    <p style="font-size:14px;line-height:1.5">Per usarla: prenota su <a href="${cfg.baseUrl}/#prenota">${cfg.baseUrl.replace(/^https?:\/\//, '')}</a>
    e porta il codice il giorno del tatuaggio. Si può usare anche in più volte, fino a esaurimento del credito.</p>
    <p>A presto,<br>Dani</p></div>`,
});

export const giftcardNotice = (c, cfg) => ({
  to: cfg.notifyTo,
  subject: `Nuova gift card venduta: ${euro(c.amount_cents)} (${c.format === 'physical' ? 'CARTACEA da spedire' : 'digitale'})`,
  html: html`<p>${c.buyer_name} (${c.buyer_email}) ha acquistato la gift card <b>${c.code}</b> da ${euro(c.amount_cents)}.</p>
    ${c.shipping && html`<p>Spedire a:</p><pre>${c.shipping}</pre>`}
    <p><a href="${cfg.baseUrl}/admin/giftcards/${c.id}">Apri nel pannello</a></p>`,
});

export const contactNotice = (m, cfg, attachments) => ({
  to: cfg.notifyTo,
  replyTo: m.email,
  subject: `Nuova richiesta dal sito: ${m.topic} — ${m.name}`,
  html: html`<div style="${font}color:${ink}">
    <p><b>${m.name}</b> · <a href="mailto:${m.email}">${m.email}</a> ${m.phone && html`· ${m.phone}`}</p>
    <p><b>Richiesta:</b> ${m.topic}<br><b>Zona e dimensione:</b> ${m.placement || '—'}<br><b>Budget:</b> ${m.budget || '—'}</p>
    <p style="white-space:pre-wrap">${m.body}</p>
    <p style="color:#6b655e;font-size:13px">Rispondi direttamente a questa email per scrivere a ${m.name}.</p></div>`,
  attachments,
});
