# Prodotto

## Per chi e perché

Il sito è di **Dani (DANINK)**, tatuatrice che lavora su progetto personalizzato. Il primo sito, fatto su Squarespace, aveva due problemi bloccanti che Dani stessa racconta nel video di brief:

1. **Gift card**: c'era la sezione, ma nessun modo per far *pagare* le persone e ricevere i soldi.
2. **Modulo contatti**: non era chiaro dove arrivassero i messaggi.

In più chiede di poter **verificare e "consumare" la gift card il giorno del tatuaggio**, e in futuro vendere **lavoretti** (oggetti in argilla, specchi…).

## Obiettivi

| Obiettivo | Come lo misuriamo |
|---|---|
| Vendere gift card online senza intervento manuale | Pagamento → email con codice in < 1 minuto |
| Nessun messaggio perso | Ogni richiesta salvata nel pannello anche se l'email non parte |
| Verifica della gift card in studio in pochi secondi | Codice digitato → saldo visibile → "Conferma utilizzo" |
| Prenotare le consulenze senza scambi di messaggi | Calendario Cal.diy incorporato nella pagina |

## Sezioni del sito (una sola pagina)

1. **Hero** — "Ciao, sono Dani", foto, chiamate all'azione *Chiedi un preventivo* e *Regala una gift card*.
2. **Lavori** — galleria di 6 foto + link a Instagram.
3. **Chi sono** — racconto + "come funziona" in 3 passi (consulenza, disegno, seduta).
4. **Cosa dicono le persone** — 3 recensioni.
5. **Gift card** — testo + modulo d'acquisto.
6. **Prenota** — calendario Cal.diy (caricato solo al clic).
7. **Contattami** — modulo con immagini di riferimento.
8. **Footer** — studio, Instagram, P. IVA, privacy, area riservata.

## Flussi

### Acquisto gift card (cliente)
1. Sceglie importo (da 50 € a 1.000 €, scorciatoie 50/100/150/200), formato (digitale o cartacea), nome, email, destinatario e dedica facoltativi.
2. "Vai al pagamento" → pagina sicura Stripe (carta, Apple Pay, Google Pay; per la cartacea chiede l'indirizzo di spedizione).
3. Pagato → torna su "Grazie!" e riceve l'email con la gift card (importo, dedica, codice `DANI-XXXX-XXXX`, scadenza).
4. Dani riceve un avviso; se cartacea, il pannello la segnala "da spedire".

### Utilizzo gift card (Dani, in studio)
1. Pannello → digita il codice (maiuscole, spazi e trattini non contano).
2. Vede stato (*attiva, parziale, usata, scaduta*), saldo, scadenza, dedica.
3. Inserisce l'importo del tatuaggio (proposto: tutto il saldo) e una nota → **Conferma utilizzo**. Il saldo residuo resta usabile.

### Gift card vendute di persona
Pannello → **Nuova gift card**: valore, formato, nota (es. "contanti"). Il codice si genera da solo; se si inserisce l'email dell'acquirente, gliela invia. "Stampa" apre la versione stampabile.

### Richiesta di contatto
Nome, email, telefono (facoltativo), tipo di richiesta, zona e dimensione, budget, descrizione, fino a 3 immagini. Il messaggio arriva via email a Dani (con *Rispondi* diretto al cliente e immagini allegate) e resta nel pannello → Messaggi.

### Prenotazione
Pulsante "Mostra il calendario" → calendario Cal.diy dentro la pagina; conferme e promemoria li manda Cal.diy.

## Regole decise

- Importo minimo 50 € (come sul sito originale), massimo 1.000 €.
- Validità 12 mesi; uso anche parziale e in più volte.
- Cartacea spedita solo in Italia, senza costo di spedizione (da rivedere con Dani).
- Nessun cookie di profilazione/statistica: niente banner cookie. Il calendario esterno si carica solo su richiesta.

## Fuori perimetro (per ora)

Saltati di proposito, si aggiungono quando servono:
- Invio programmato della gift card direttamente al destinatario (oggi arriva all'acquirente che la inoltra).
- QR code sulla gift card, costi di spedizione, codici sconto.
- Più utenti nel pannello (oggi una sola password, quella di Dani).
- Rimborsi dal pannello (si fanno dalla dashboard Stripe).

## Roadmap: shop dei lavoretti

Già predisposto: la tabella `orders` ha un campo `kind` e i dettagli in JSON, Stripe Checkout e webhook sono generici. Per aggiungere lo shop: tabella `products` (nome, prezzo, foto, disponibilità), sezione "Shop" nella home, `kind = 'shop'` nel checkout, ramo dedicato nella funzione di evasione dell'ordine e pagina "Ordini" nel pannello. Dettagli in [ARCHITECTURE.md](ARCHITECTURE.md#estensione-shop).

## Contenuti da fornire (Dani)

- [ ] Foto hero (verticale 4:5) e 6+ foto dei lavori (quadrate, ≥ 1200 px) → `public/img/`
- [ ] Testo "Chi sono" definitivo (l'attuale è una bozza basata sulle recensioni)
- [ ] Profilo Instagram, indirizzo dello studio, P. IVA
- [ ] Dati per l'informativa privacy (`public/privacy.html`) e verifica legale
- [ ] Account Stripe (IBAN per gli accrediti) e casella email su SiteGround
- [ ] Tipo di evento su Cal.diy (es. "Consulenza 30 min") e disponibilità
