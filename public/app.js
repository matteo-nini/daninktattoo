// Scorciatoie per l'importo della gift card: il campo numerico resta la fonte di verità.
const amount = document.querySelector('input[name=importo]');
const chips = document.querySelectorAll('[data-amount]');
for (const chip of chips) {
  chip.addEventListener('click', () => {
    amount.value = chip.dataset.amount;
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
  });
}
amount?.addEventListener('input', () => chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.amount === amount.value))));

// Il calendario (Cal.diy / Cal.com) si carica solo al clic: nessuna richiesta a terzi finché non serve.
const cal = document.getElementById('cal');
cal?.querySelector('button').addEventListener('click', () => {
  const { origin, link } = cal.dataset;
  // Snippet ufficiale di embed Cal: mette in coda i comandi finché embed.js non è caricato.
  (function (C, A, L) {
    const p = (a, ar) => a.q.push(ar);
    const d = C.document;
    C.Cal = C.Cal || function () {
      const cal = C.Cal;
      const ar = arguments;
      if (!cal.loaded) {
        cal.ns = {};
        cal.q = cal.q || [];
        d.head.appendChild(d.createElement('script')).src = A;
        cal.loaded = true;
      }
      if (ar[0] === L) {
        const api = function () { p(api, arguments); };
        const namespace = ar[1];
        api.q = api.q || [];
        if (typeof namespace === 'string') {
          cal.ns[namespace] = cal.ns[namespace] || api;
          p(cal.ns[namespace], ar);
          p(cal, ['initNamespace', namespace]);
        } else p(cal, ar);
        return;
      }
      p(cal, ar);
    };
  })(window, `${origin}/embed/embed.js`, 'init');

  cal.innerHTML = '<div id="cal-inline" class="cal-inline"></div>';
  window.Cal('init', { origin });
  window.Cal('inline', { elementOrSelector: '#cal-inline', calLink: link, config: { layout: 'month_view' } });
  window.Cal('ui', { theme: 'light', cssVarsPerTheme: { light: { 'cal-brand': '#1d1b19' } } });
});
