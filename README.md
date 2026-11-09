# DANINK — sito di Dani

Sito della tatuatrice Dani: portfolio, **gift card con pagamento online**, **modulo contatti** che arriva davvero via email, **prenotazioni** con Cal.diy e un **pannello** per verificare e usare le gift card in studio.

Node.js senza framework, SQLite integrato, una sola dipendenza (`nodemailer`).

| Documento | Contenuto |
|---|---|
| [docs/PRODUCT.md](docs/PRODUCT.md) | obiettivi, flussi, regole, roadmap, contenuti da fornire |
| [docs/DESIGN.md](docs/DESIGN.md) | linea grafica, token, tipografia, componenti |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | struttura, dati, pagamenti, sicurezza, calendario, estensione shop |

## Avvio in locale

Requisiti: Node.js ≥ 22.13.

```bash
npm install
```

```bash
cp .env.example .env
```

```bash
npm run hash-password
```

Incolla l'hash in `ADMIN_PASSWORD_HASH`, poi compila almeno `BASE_URL=http://localhost:3000`, `SESSION_SECRET` (`openssl rand -hex 32`) e `NOTIFY_TO`. Senza SMTP le email vengono solo scritte nel log; senza chiavi Stripe il pagamento risponde "non ancora configurato".

```bash
npm run dev
```

Sito su http://localhost:3000, pannello su http://localhost:3000/admin.

Per provare i pagamenti in locale usa le chiavi `sk_test_…` e la [Stripe CLI](https://docs.stripe.com/stripe-cli):

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

(il `whsec_…` che stampa va in `STRIPE_WEBHOOK_SECRET`; carta di prova `4242 4242 4242 4242`).

## Test

```bash
npm test
```

Coprono: codici e normalizzazione, utilizzo parziale/saldo/scadenza, firma webhook Stripe, password, e il percorso completo *modulo contatti → email* e *checkout → webhook → gift card → verifica e utilizzo nel pannello*.

## Messa online su SiteGround

1. **Email**: Site Tools → Email → crea `info@<dominio>`. Usa host, porta 465, utente e password in `SMTP_*`.
2. **App Node.js**: Site Tools → sezione Node.js → nuova applicazione con Node ≥ 22.13, cartella dell'app (fuori da `public_html`), file di avvio `server.js`. Carica il progetto (Git o SFTP) ed esegui `npm install --omit=dev`.
3. **Variabili**: imposta quelle di `.env.example` nel pannello dell'app (o carica un file `.env` nella cartella dell'app). `TRUST_PROXY=1`. `PORT` di solito la assegna SiteGround.
4. **Dati**: `data/` contiene database e allegati. Deve stare fuori da `public_html` e rientrare nei backup.
5. **Dominio + HTTPS**: collega il dominio all'app e attiva il certificato SSL (Let's Encrypt), poi `BASE_URL=https://…`.

> Le voci esatte del pannello SiteGround cambiano nel tempo: se qualcosa non coincide, cerca "Node.js" nella guida di Site Tools.

### Stripe

1. Crea l'account su [stripe.com](https://stripe.com), completa i dati dell'attività e l'IBAN.
2. Sviluppatori → Chiavi API → `STRIPE_SECRET_KEY` (`sk_live_…` in produzione).
3. Sviluppatori → Webhook → *Aggiungi endpoint* `https://<dominio>/api/stripe/webhook`, eventi `checkout.session.completed` e `checkout.session.async_payment_succeeded` → segreto in `STRIPE_WEBHOOK_SECRET`.
4. Impostazioni → Metodi di pagamento: attiva Apple Pay / Google Pay (ed eventualmente PayPal).

### Calendario (Cal.diy)

Cal.diy richiede PostgreSQL e Redis: non gira sull'hosting condiviso SiteGround. Due strade:

- **Cal.diy self-hosted** (consigliata, gratuita salvo il server): VPS da ~2 GB RAM con Docker, sottodominio `cal.<dominio>`, seguendo il `docker-compose.yml` di [calcom/cal.diy](https://github.com/calcom/cal.diy). Poi `CAL_ORIGIN=https://cal.<dominio>`.
- **Cal.com hosted** (zero manutenzione): account gratuito e `CAL_ORIGIN=https://app.cal.com`.

In entrambi i casi crea il tipo di evento (es. "Consulenza 30 min") e metti `utente/evento` in `CAL_LINK`.

## Guida rapida per Dani

- **Arriva un messaggio** → lo ricevi via email: premi *Rispondi* e scrivi direttamente al cliente. Tutti i messaggi sono anche in *Pannello → Messaggi*.
- **Qualcuno compra una gift card** → ricevi un'email "Nuova gift card venduta". Se è cartacea, nel pannello compare "da spedire": stampala, spediscila e premi *Segna come spedita*.
- **Il giorno del tatuaggio** → *Pannello*, scrivi il codice, controlla saldo e scadenza, inserisci l'importo e premi *Conferma utilizzo*. Se avanza credito, resta sulla gift card.
- **Vendi una gift card in studio** → *Nuova gift card*, poi *Stampa*.
- **Cambiare foto e testi** → foto in `public/img/`, testi in `public/index.html`.

## Struttura

```
server.js            avvio
src/                 app, pannello, gift card, Stripe, email, DB
public/              sito: index.html, styles.css, app.js, font, immagini, privacy
test/                test (node --test)
scripts/             hash della password del pannello
docs/                prodotto, design, architettura
```
