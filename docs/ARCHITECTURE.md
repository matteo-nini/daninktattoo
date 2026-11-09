# Architettura

## Principi

Scritto seguendo [Ponytail](https://github.com/dietrichgebert/ponytail): la modifica più piccola che risolve davvero il problema.

- **Piattaforma prima delle dipendenze.** Server HTTP, database (`node:sqlite`), crittografia, parsing dei moduli (anche multipart) e lettura di `.env` sono tutti di Node. Unica dipendenza: `nodemailer` (SMTP non si riscrive a mano).
- **Niente framework né build.** HTML/CSS/JS serviti così come sono; le pagine dinamiche sono template string con escape automatico (`html` in `src/http.js`).
- **Salvare prima, notificare dopo.** Messaggi e gift card finiscono nel database prima di tentare l'email: se l'SMTP cade non si perde nulla.
- **Mai fidarsi del browser.** Ogni modulo è validato sul server; importi in centesimi interi; il webhook Stripe è verificato con la firma.

## Mappa

```
                ┌──────────────── SiteGround (Node.js) ────────────────┐
 Browser ──────▶│ server.js → src/app.js (router)                      │
                │   ├─ public/            sito statico                 │
                │   ├─ src/site.js        contatti, checkout, webhook  │──▶ SMTP SiteGround ──▶ Dani / clienti
                │   ├─ src/admin.js       pannello /admin              │
                │   └─ data/*.db          SQLite + data/uploads/       │
                └──────────┬───────────────────────────▲───────────────┘
                           │ crea sessione              │ webhook firmato
                           ▼                            │
                     Stripe Checkout ───────────────────┘
 Browser ── iframe (solo al clic) ──▶ Cal.diy su VPS (cal.daninktattoo.it)
```

## File

| File | Responsabilità |
|---|---|
| `server.js` | avvio: legge `.env`, apre il DB, crea mailer e client Stripe |
| `src/app.js` | configurazione (`loadConfig`), header di sicurezza, instradamento, gestione errori |
| `src/http.js` | utilità: risposte, lettura e validazione moduli, file statici, limiti di frequenza, template HTML |
| `src/db.js` | schema SQLite (creato all'avvio) e transazioni |
| `src/giftcards.js` | codici, creazione, ricerca, stato, utilizzo (anche parziale) |
| `src/stripe.js` | creazione sessione Checkout via API REST, verifica firma webhook |
| `src/mail.js` | trasporto SMTP e modelli email (incl. grafica della gift card) |
| `src/site.js` | endpoint pubblici: contatti, checkout, webhook, pagina grazie |
| `src/admin.js` | pannello: login, elenco/verifica, dettaglio, utilizzo, creazione manuale, messaggi |
| `src/auth.js` | hash password (scrypt) e cookie di sessione firmato |
| `src/views.js` | guscio HTML per pagine generate dal server |

## Rotte

| Metodo | Percorso | Cosa fa |
|---|---|---|
| GET | `/` | home (con i dati del calendario inseriti all'avvio) |
| POST | `/api/contact` | salva il messaggio + immagini, email a Dani, → `/grazie?per=messaggio` |
| POST | `/api/giftcards/checkout` | crea ordine `pending`, sessione Stripe, → Stripe |
| POST | `/api/stripe/webhook` | pagamento confermato → ordine `paid`, gift card, email |
| GET | `/grazie?per=giftcard\|messaggio` | conferma |
| GET/POST | `/admin/login`, `/admin/logout` | accesso |
| GET | `/admin?q=` | elenco; un codice esatto apre direttamente la gift card |
| GET | `/admin/giftcards/:id` | dettaglio |
| POST | `/admin/giftcards/:id/redeem\|ship\|resend` | utilizzo, spedita, reinvio email |
| GET | `/admin/giftcards/:id/print` | versione stampabile |
| GET/POST | `/admin/giftcards/new` | gift card venduta in studio |
| GET | `/admin/messages`, `/admin/uploads/:file` | messaggi e allegati (solo dopo login) |

## Dati

```
orders       id, kind ('giftcard'|…), amount_cents, status (pending|paid), email, data (JSON), stripe_session, created_at, paid_at
giftcards    id, code UNIQUE, order_id UNIQUE NULL, amount_cents, balance_cents ≥ 0, format, buyer_*, recipient_name,
             message, shipping, note, expires_at, created_at, emailed_at, shipped_at
redemptions  id, giftcard_id, amount_cents > 0, note, created_at        ← storico, non si cancella
messages     id, name, email, phone, topic, placement, budget, body, files (JSON), created_at, emailed_at
```

Lo **stato** della gift card non è salvato: si calcola da saldo e scadenza (`status()`), così non può andare fuori sincrono.

## Pagamento gift card, passo per passo

1. Il modulo invia importo e dati; il server valida e crea `orders` (`pending`, dettagli in `data`).
2. Il server crea la sessione Stripe Checkout con importo calcolato **dal server**, `metadata.order_id` e, se cartacea, la raccolta dell'indirizzo.
3. Stripe chiama `/api/stripe/webhook` (`checkout.session.completed` o `…async_payment_succeeded`). Firma verificata, poi in una transazione: ordine → `paid`, gift card creata.
4. **Idempotenza**: se Stripe ripete l'evento l'ordine è già `paid` e non succede nulla; `order_id UNIQUE` impedisce doppioni.
5. Email all'acquirente e avviso a Dani. Se falliscono, `emailed_at` resta vuoto e nel pannello c'è "Reinvia email".

## Sicurezza

- Password del pannello con hash scrypt; sessione = scadenza firmata HMAC in cookie `HttpOnly; SameSite=Strict; Secure`, 12 ore.
- POST del pannello rifiutati se l'header `Origin` è di un altro sito (oltre a SameSite).
- Limiti di frequenza: contatti 5 / 15 min, checkout 10 / 15 min, login 10 / 15 min per IP (in memoria).
- Content-Security-Policy restrittiva (solo stesso sito + dominio del calendario; moduli solo verso il sito e Stripe), `nosniff`, niente iframe del sito altrove.
- Allegati: solo immagini, max 3 × 5 MB, nome file generato dal server, serviti solo dopo login.
- Campo trappola anti-bot nel modulo contatti.
- Codici gift card: 8 caratteri casuali crittografici da 32 simboli (≈ 10¹² combinazioni), senza 0/O/1/I.

## Calendario: Cal.diy

[Cal.diy](https://github.com/calcom/cal.diy) è la versione comunitaria MIT di Cal.com. Richiede **PostgreSQL** (+ Redis) e un'app Next.js pesante: l'hosting condiviso SiteGround offre MySQL e risorse limitate, quindi **non ci sta**. Soluzione:

- **Consigliata**: piccolo VPS (2 GB RAM) con il `docker-compose.yml` ufficiale di Cal.diy, su `cal.daninktattoo.it`.
- **Alternativa senza server**: account gratuito Cal.com; stesso codice, basta `CAL_ORIGIN=https://app.cal.com`.

Il sito si integra solo tramite lo snippet di embed ufficiale (`public/app.js`), caricato **al clic**: nessuna richiesta a terzi finché la persona non apre il calendario. Cambiare provider = cambiare due variabili.

## Scorciatoie note

- Limiti di frequenza in memoria: si azzerano a ogni riavvio e valgono per un solo processo. Da spostare su DB se si passa a più istanze.
- `node:sqlite` è ancora marcato "sperimentale" in Node 22 (stabile nell'uso, l'avviso è silenziato). Con traffico da piccolo studio SQLite è più che sufficiente; se un giorno servisse MySQL di SiteGround, cambia solo `src/db.js` e le query.

## Estensione shop

Quando arriveranno i lavoretti:

1. `products` (id, nome, descrizione, prezzo_cents, foto, quantità, attivo) + gestione nel pannello.
2. Sezione "Shop" nella home (lista prodotti generata dal server come le pagine del pannello).
3. Checkout: `kind = 'shop'`, `data` = articoli e quantità; spedizione via `shipping_address_collection` come per la cartacea.
4. In `fulfil()` (`src/site.js`) un ramo per `kind === 'shop'`: scala le quantità, avvisa Dani.
5. Pagina "Ordini" nel pannello (stato spedizione, già presente il modello `shipped_at` sulle gift card).

## Convenzioni

- Codice in inglese, testi e commenti in italiano (il dominio è italiano). Commenti solo per il *perché*.
- Importi sempre in centesimi interi; date UTC nel DB, mostrate in ora italiana.
- Ogni nuova logica non banale ha un test in `test/` (`npm test`, runner integrato di Node).
- Nuovi colori/font solo tramite i token in `styles.css` e documentati in [DESIGN.md](DESIGN.md).
