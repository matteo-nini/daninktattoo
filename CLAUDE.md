# Note per chi modifica il codice (anche agenti AI)

- Leggi prima `docs/ARCHITECTURE.md` (struttura, convenzioni) e `docs/DESIGN.md` (token e componenti).
- Stile Ponytail: la modifica più piccola che risolve tutto. Niente nuove dipendenze se Node basta; niente astrazioni "per dopo".
- Importi in centesimi interi, validazione sempre lato server, salva nel DB prima di mandare email.
- Testi visibili e commenti in italiano; colori e font solo dai token in `public/styles.css`.
- Ogni logica nuova non banale → un test in `test/`. Verifica con `npm test`.
