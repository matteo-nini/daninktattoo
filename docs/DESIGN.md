# Design

## Direzione

Si mantiene la linea che Dani aveva già scelto su Squarespace: **carta calda, nero inchiostro, serif elegante, un tocco di rosa cipria**. È sobria, lascia parlare le foto dei tatuaggi e sembra un piccolo studio d'autore, non un negozio. Elementi ripresi dall'originale:

- titoli in serif leggero ("Ciao, sono Dani"), testo corrente in sans;
- foto principale con angoli molto arrotondati;
- bottoni a pillola rosa cipria con bordo scuro;
- fascia che scorre **"GIFT CARD \*"** con una scritta calligrafica sfocata dietro;
- titolo scorrevole "Cosa dicono le persone \*" sopra le recensioni.

Proposte nuove: "come funziona" in tre passi numerati, scorciatoie d'importo a pillola, modulo contatti pensato per il tatuaggio (zona, dimensione, budget, immagini) al posto dei campi del template Squarespace.

## Token

Definiti una sola volta in `public/styles.css` (`:root`). Non usare colori o font fuori da qui.

| Token | Valore | Uso |
|---|---|---|
| `--bg` | `#f2efe9` | sfondo pagina |
| `--surface` | `#fbf9f5` | card, moduli, fascia recensioni |
| `--ink` | `#1d1b19` | testo, bordi forti |
| `--muted` | `#6b655e` | testo secondario |
| `--line` | `#d9d3c9` | separatori, bordi input |
| `--accent` | `#eab0a4` | bottone principale |
| `--accent-ink` | `#5c2219` | testo/bordo del bottone principale |
| `--radius` | `28px` | card e foto |

Contrasto: `--ink` su `--bg` ≈ 15:1, `--accent-ink` su `--accent` ≈ 6.6:1, `--muted` su `--bg` ≈ 5:1 (tutti AA).

## Tipografia

Font self-hosted in `public/fonts/` (niente Google Fonts: nessuna richiesta a terzi, ok GDPR). Licenza SIL OFL.

| Ruolo | Font | Note |
|---|---|---|
| Titoli, testi "di voce" | **Newsreader** (variabile, 200–800, + corsivo) | peso 350 per i titoli |
| Testo corrente, UI | **DM Sans** (variabile) | 16 px, interlinea 1.6 |
| Decorazione | **Pinyon Script** | solo per la scritta sfocata, mai per testo da leggere |

Scala: `h1` clamp(2.8 → 5.5rem), `h2` clamp(2 → 3.4rem), marquee clamp(2.6 → 5.5rem).

## Componenti

- **`.btn`** pillola rosa; **`.btn.ghost`** contorno nero (azione secondaria).
- **`.card`** contenitore chiaro arrotondato per moduli e riquadri del pannello.
- **`.marquee`** fascia scorrevole decorativa (`aria-hidden`, il titolo vero è un `h2` per gli screen reader). Si ferma con `prefers-reduced-motion`.
- **`.chips`** scelta rapida dell'importo (`aria-pressed`).
- **`.badge`** stato gift card: *attiva* (verde), *parziale* (ambra), *usata/scaduta* (grigio), *da spedire* (rosa).

## Layout e responsive

Contenuto max 1200 px, margini laterali `clamp(16px, 4vw, 48px)`. Sotto gli 820 px tutte le griglie diventano a una colonna, la galleria a due; la navigazione resta una riga scorrevole (nessun menu a tendina, nessun JavaScript). Nessuno scroll orizzontale a 390 px (verificato).

## Immagini

- Hero 4:5, galleria 1:1: ritagliate con `object-fit: cover`, quindi va bene anche una foto non perfettamente in formato.
- Esportare in JPG/WEBP a 1200–1600 px di lato, < 300 KB. Testo `alt` descrittivo (soggetto e zona del tatuaggio).
- I file `*.svg` attuali in `public/img/` sono segnaposto.

## Accessibilità

Link "Vai al contenuto", focus visibile, etichette su tutti i campi, decorazioni nascoste agli screen reader, movimento ridotto rispettato, `lang="it"`.

## Pannello

Stesso foglio di stile e stessi token: è uno strumento da usare in studio anche dal telefono, quindi campi grandi, codice in monospazio, un'azione principale per pagina (*Conferma utilizzo*).
