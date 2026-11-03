# 1940 World at War

Gioco di strategia in tempo reale sulla Seconda guerra mondiale, nel browser. Ogni giocatore guida una nazione sulla mappa dell'Europa del 1933: economia, edifici, eserciti, aviazione e marina, diplomazia, commercio e nebbia di guerra. Le partite sono persistenti: durano giorni o settimane e si entra qualche volta al giorno.

È un progetto amatoriale, nato per giocare con un piccolo gruppo di amici. **Niente acquisti nel gioco e niente modi di andare avanti pagando**: vince chi gioca meglio.

> Il nome è provvisorio. Codice, grafica e testi sono originali.

## Stato

Si gioca in locale, una partita alla volta nel browser (salvata in `localStorage`), contro nazioni ferme o bot con regole provvisorie. Ci sono:

- mappa dell'Europa con circa 360 province, terreno, fiumi, strade, ferrovie e mare;
- produzione di risorse, edifici con livelli, arruolamento;
- armate con movimento a tempi reali, treno, combattimento automatico senza dadi, conquista, morale e rivolte;
- genio (ponti, fortificazioni, aeroporti, porti) e sanità;
- aviazione (trasferimenti, attacchi, contraerea) e marina (flotte, sottomarini, trasporti e sbarchi, blocchi navali, convogli mercantili);
- diplomazia (guerra, pace, tregua, accordi, embargo, chat), mercato estero e borsa degli scambi tra nazioni.

Il prossimo grande passo è il **server multiplayer**. La tabella di marcia è in [CLAUDE.md](CLAUDE.md), le regole del gioco in [docs/game-design.md](docs/game-design.md).

## Avvio

Serve Node.js 24.

```bash
npm install
npm run dev
```

Poi si apre <http://localhost:5173>. In alternativa `./start.command` (anche con un doppio clic dal Finder) controlla Node, installa quello che manca e avvia tutto.

Altri comandi:

- `npm test`: test del motore di gioco e della mappa (Vitest)
- `npm run typecheck`: controllo dei tipi TypeScript
- `npm run map:build`: rigenera la mappa da dati geografici pubblici (vedi [data/maps/europe-1933/README.md](data/maps/europe-1933/README.md))

## Struttura

Monorepo TypeScript con npm workspaces:

```
client/   interfaccia (React) e mappa (PixiJS)
shared/   motore di gioco: regole, dati di bilanciamento, rete di movimento (funzioni pure, con test)
data/     mappa e script che la generano
server/   server multiplayer (in arrivo)
docs/     game design, guide e crediti
```

Il motore è deterministico: prende lo stato e il tempo trascorso e restituisce il nuovo stato. Il futuro server sarà l'unica fonte di verità e il client manderà solo ordini, validati da `shared/src/game/orders.ts`.

## Licenze

- **Codice**: [GNU AGPL 3.0](LICENSE). Si può usare, modificare e ridistribuire; chi mette online una versione modificata deve pubblicarne il codice.
- **Mappa** (`data/maps/`): i confini del 1933 vengono da CShapes 2.0, con licenza CC BY-NC-SA 4.0. La mappa derivata segue la stessa licenza: **solo uso non commerciale**, citando la fonte. Le altre fonti sono elencate nel [README della mappa](data/maps/europe-1933/README.md).
- **Foto delle unità** (`client/src/assets/units/`) e **ritratti dei capi di stato** (`client/src/assets/leaders/`): da Wikimedia Commons, di pubblico dominio o con licenze Creative Commons. Fonte e licenza di ogni immagine sono in [docs/crediti/](docs/crediti/). Le immagini con licenza CC BY-SA restano CC BY-SA anche ritagliate.
- **Pedine dipinte** (`client/src/assets/tokens/`): generate per il gioco (guida e prompt in [docs/pedine.md](docs/pedine.md)).

Le immagini storiche sono mostrate come sono, senza ritocchi né censure: è un gioco storico.
