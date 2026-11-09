import { html } from './http.js';

// Guscio per le pagine generate dal server (grazie, errori, pannello). La home è public/index.html.
export const page = (title, body, { admin = false } = {}) => html`<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} · DANINK</title>
  ${admin && html`<meta name="robots" content="noindex">`}
  <link rel="stylesheet" href="/styles.css">
</head>
<body class="${admin ? 'admin' : 'plain'}">
  <header class="site-header">
    <a class="logo" href="${admin ? '/admin' : '/'}">DANINK${admin && html` <small>pannello</small>`}</a>
    ${admin && html`<nav class="nav"><a href="/admin">Gift card</a><a href="/admin/messages">Messaggi</a>
      <form method="post" action="/admin/logout"><button class="link">Esci</button></form></nav>`}
  </header>
  <main class="wrap">${body}</main>
</body>
</html>`;

export const notice = (title, text, back = '/') => page(title, html`
  <section class="notice">
    <h1>${title}</h1>
    <p>${text}</p>
    <a class="btn" href="${back}">Torna al sito</a>
  </section>`);
