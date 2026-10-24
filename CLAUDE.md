# 1940 World at War

Gioco di strategia multiplayer ambientato nella Seconda guerra mondiale, **ispirato** a Supremacy: Call of War 1942.
Lo scopo è avere una versione privata da giocare con un piccolo gruppo di amici: **niente acquisti in-game, niente pay-to-win**.

> Lingua: rispondi e commenta in **italiano**. Nomi di variabili, funzioni e file in **inglese**.

## Regole di progetto (importanti)

- **Codice, grafica, nomi e testi originali.** Prendiamo ispirazione dalle meccaniche, non dai contenuti.
- Il nome del gioco è "1940 World at War" (provvisorio). Non usare il marchio "Supremacy" o "Call of War" nel gioco.
- Il bilanciamento deve essere **equo**: nessuna valuta premium e nessun modo di accelerare pagando.

## Concetto di gioco

- Partite **persistenti in tempo reale**: durano giorni o settimane, i giocatori entrano qualche volta al giorno (come l'originale), ma con opzione di **velocità accelerata** per partite più brevi tra amici (es. x4, x10).
- Mappa del mondo (o dell'Europa) divisa in **province**. Ogni giocatore controlla una nazione.
- **Risorse**: cibo, beni (prodotti industriali), metallo, petrolio, denaro, manodopera. Prodotte dalle province, consumate da edifici e unità. I materiali rari sono stati tolti perché non servivano a niente. La produzione dipende dalla popolazione del 1933 e dallo sviluppo (PIL pro capite) della provincia; il petrolio solo dai giacimenti veri.
- **Edifici** nelle province: caserme, fabbriche, fortificazioni, ecc., con livelli.
- **Unità** con statistiche (attacco/difesa per tipo di bersaglio, velocità, vista, costo, mantenimento) e un **albero della ricerca** che sblocca unità e livelli.
- **Movimento** sulla mappa con tempi di percorrenza reali; **combattimento** automatico a tick quando eserciti si incontrano.
- **Diplomazia**: guerra, pace, tregua, mappa condivisa, diritto di passaggio, alleanza, embargo; chat tra nazioni. **Borsa degli scambi** tra nazioni.
- **Nebbia di guerra**.
- Fazioni/IA per nazioni non controllate da giocatori (fase successiva).

## Stack tecnico (proposta — da confermare con Lorenzo)

- **Linguaggio**: TypeScript ovunque (client, server, codice condiviso).
- **Client**: web app nel browser (Vite + React per l'interfaccia, PixiJS o Canvas per la mappa).
- **Server**: Node.js autoritativo; il server è l'unica fonte di verità sullo stato del gioco. Il client invia solo ordini.
- **Tempo reale**: WebSocket per aggiornamenti; simulazione a **tick** sul server.
- **Persistenza e account**: Supabase (Postgres + Auth) — il connettore Supabase è già disponibile.
- **Monorepo** suggerito:
  ```
  /client     # interfaccia e rendering mappa
  /server     # simulazione, API, WebSocket
  /shared     # tipi, regole di gioco, dati di bilanciamento (unità, edifici, ricerca)
  /data       # mappa e province (formato GeoJSON o JSON proprio)
  /docs       # game design, decisioni
  ```

## Principi di sviluppo

- **Logica di gioco deterministica e testabile** in `/shared`: funzioni pure che prendono stato + tempo trascorso e restituiscono il nuovo stato. Test unitari per combattimento, produzione e movimento.
- **Dati di bilanciamento in file di configurazione** (JSON/TS), non sparsi nel codice, così si possono ritoccare facilmente.
- Mai fidarsi del client: ogni ordine viene validato dal server.
- Procedere per **piccole milestone giocabili**, una alla volta.

## Roadmap iniziale

1. ✅ **Prototipo mappa**: rendering di una mappa con province cliccabili, zoom e spostamento (`client/`, PixiJS + React).
2. ✅ **Stato di gioco locale**: province con proprietario e risorse; produzione a tick (`shared/src/game/`, partita salvata nel browser).
3. ✅ **Unità e movimento**: creare un esercito, spostarlo tra province con tempo di viaggio (arruolamento nelle città, marcia nel proprio territorio).
4. ✅ **Combattimento** base e conquista delle province (dichiarazione di guerra, battaglie automatiche, ritirata, conquista per attraversamento, morale e rivolte), genio e sanità (ponti distruggibili, ponti di barche, ospedali da campo), treno, partenze ritardate, pannello dell'armata con le azioni Muovi/Attacca, **edifici** (caserma, fabbriche, industria, ufficio di reclutamento; fortificazioni, aeroporto e porto costruiti dal genio).
5. **Server multiplayer**: partita condivisa, login, più giocatori via WebSocket.
6. **Ricerca, diplomazia, nebbia di guerra** (edifici: danni e riparazioni con i bombardamenti).
7. Rifiniture: notifiche, velocità partita, IA per nazioni libere.
8. **Storia**: eventi storici come opportunità con condizioni, scenari con data di partenza, salto nel tempo nelle partite in solitaria (vedi `docs/game-design.md` §13). Prima servono pace e patti nella diplomazia.

## Documentazione

- `docs/game-design.md` — meccaniche di gioco e valori di bilanciamento di partenza. Leggilo prima di lavorare sulla logica di gioco.

## Struttura del client

- `client/src/map/` — mappa: `projection.ts` (proiezione di Lambert sull'Europa, coordinate in km), `camera.ts` (zoom e spostamento), `geometry.ts` (forme proiettate e ricerca della provincia sotto il puntatore), `labels.ts` (etichette senza sovrapposizioni), `MapRenderer.ts` (disegno PixiJS e input mouse/tocco, senza React), `ArmyLayer.ts` (gettoni delle armate e percorso), `TerrainLayer.ts` (fiumi, strade, ferrovie, ponti, e i lavori: ponti distrutti, ponti di barche, ospedali), `MapView.tsx` (componente React che lo ospita).
- `client/src/game/` — partita locale: `useLocalGame.ts` fa scorrere il tempo reale, chiama il motore di `/shared` e salva in `localStorage` (al rientro recupera il tempo passato offline).
- `client/src/ui/Dock.tsx` — barra in basso con Diplomazia, Commercio, Edifici, Produzione (Ricerca in arrivo); ognuna apre il suo pannello a destra. `DiplomacyPanel.tsx` (nazioni, rapporti, proposte, accordi, embargo, chat), `TradePanel.tsx` con `MarketSection.tsx` (borsa tra nazioni e mercato estero), `BuildingsPanel.tsx` (effetto di ogni edificio da `ui/buildingEffects.ts`) e `ProductionPanel.tsx` (con aeronautica e marina in arrivo): si sceglie cosa, poi dove, e le province adatte si evidenziano sulla mappa con `MapView.highlighted`. Dal pannello della provincia "Costruisci qui" e "Arruola qui" aprono gli stessi pannelli limitati a quella provincia.
- `client/src/ArmyPanel.tsx` — pannello dell'armata: comandante con i pulsanti Muovi/Attacca (il prossimo tocco sulla mappa dà l'ordine, gestito in `App.tsx`), stato, Ritarda, lavori, composizione, riepilogo. `ProvincePanel.tsx` — provincia: dati, rapporti con il padrone, produzione, armate, edifici, costruzione e arruolamento in corso.
- `client/src/ui/` — barra in alto (`TopBar.tsx`: capo della nazione in carica nella data della partita, con ritratto (`leaders.ts`, miniature in `client/src/assets/leaders/` ritagliate da `icone/icone capi di stato/`) e bandiera di `Flag.tsx`, calendario della partita; `ResourceBar.tsx`: risorse con icona, saldo e riepilogo al tocco, voci calcolate in `balance.ts`), `ResourceIcon.tsx` (immagini delle risorse in `client/src/assets/resources/`, ritagliate da `icone/icone materie prime/`), scelta della nazione, avviso di rientro, `EventFeed.tsx` (notizie: guerre, battaglie, conquiste, armate distrutte).
- La logica pura (proiezione, camera, geometria, etichette) ha test accanto ai file (`*.test.ts`).

## Motore di gioco (`shared/src/game/`)

- `engine.ts` — `createGame` e `advance(stato, mondo, minuti)` (`EngineWorld` = mappa + rete di movimento): funzioni pure che elaborano gli eventi in ordine di tempo (arruolamenti, costruzioni e lavori completati; controlli ogni 5 minuti a orari fissi per sconfinamenti, contatti, conquiste e arrivi; combattimento e produzione ogni 30 minuti; morale e rivolte a ogni cambio giorno). Le rivolte usano un numero pseudo-casuale dato dal seme della partita (`seed`), dal giorno e dalla provincia. Recuperare molte ore in un colpo dà lo stesso risultato che giocarle passo passo (ci sono test).
- `orders.ts` — ordini dei giocatori (`recruit`, `move` con `attack`, `delayMinutes` e `rail`, `stop`, `declareWar`, `work`, `cancelWork`, `build`, `cancelBuild`, `setImport`, `propose`, `answerProposal`, `withdrawProposal`, `revokeAgreement`, `setEmbargo`, `sendMessage`, `placeMarketOrder`, `cancelMarketOrder`) con tutte le validazioni: è il punto da cui passerà anche il server. `wouldStartWar` serve all'interfaccia per chiedere conferma prima di sconfinare.
- `routing.ts` — percorsi nello stato attuale della partita (`planRoute`): territorio percorribile (mai paesi terzi), ponti distrutti, ponti di barche, velocità del treno per cella (`railSpeeds`: più veloce in casa con morale alto, solo in territorio proprio o con diritto di passaggio).
- `works.ts` — lavori sul campo: `availableWorks` dice cosa può fare un'armata (con durata, costo e motivo se non può), il motore applica il risultato a fine lavoro (e fa cambiare strada a chi passava su un ponte distrutto). Fortificazioni, aeroporto e porto sono lavori del genio che costruiscono edifici. I pozzi di petrolio si sabotano (qualsiasi armata, nelle proprie province) e si riparano (genio).
- `trade.ts` — mercato estero (il resto del mondo fuori mappa): capacità di importazione (città costiere, porti, vicini in pace e senza embargo), contratti per cibo, beni, metallo e petrolio (`setImport`, insieme entro la capacità; se cala, ridotti in proporzione) pagati a ogni tick, concessioni a prezzo scontato; carburante sintetico (metallo → petrolio). `tradePerDay` dà il saldo per l'interfaccia, `applyTradeTick` lo applica nel motore.
- `buildings.ts` — edifici: cosa si può costruire in una provincia (`buildOptions`), edificio richiesto e tempi di arruolamento, effetto delle fortificazioni, perdita di livelli al cambio di padrone.
- `combat.ts` — danni per tick senza casualità: valori di attacco (chi marcia o va all'assalto) o difesa per classe di corazza, limite di gruppo, efficienza legata alla salute. Un'armata fermata dal contatto riprende la marcia (`halted`) a fine combattimento; chi è fermo nel proprio territorio guarisce.
- `diplomacy.ts` — rapporti per coppia di nazioni (`relations`, chiave `pairKey`): guerra, tregua (a scadenza), ritiro dopo la pace, diritto di passaggio, visione condivisa, alleanza; embargo per nazione; proposte con scadenza (`proposals`), risposte provvisorie dei bot (`botAnswer`), chat (`chats`). Entrare senza accordi nel territorio altrui dichiara guerra. Registro eventi della partita (`events`, `logEvent`).
- `market.ts` — borsa degli scambi tra nazioni: ordini con merce o denaro accantonati, scambio solo quando un ordine incontra quello opposto, niente scambi con guerra o embargo.
- `movement.ts` (velocità, orari di passaggio con le soste per salire e scendere dal treno, posizione durante la marcia), `economy.ts` (produzione e mantenimento), `clock.ts` (orologio di gioco: tempo reale × velocità, formato "Giorno N, hh:mm").
- Le armate hanno una posizione libera `[lng, lat]`; la marcia è una sequenza di punti con l'orario di passaggio.
- Test di movimento, ordini, combattimento, lavori (`works.test.ts`) e treno/partenze (`train.test.ts`) su un mondo minimo con fiume, strada (o ferrovia) e ponte in `testMaps.ts`.
- `shared/src/data/leaders.ts` — capi delle nazioni 1933–1945 con data d'inizio (`leaderAt`), data del calendario della partita (`calendarDate`, dal 1 giugno 1933). Archivio e fonti in `docs/leaders-1933-1945.md`.
- I valori di bilanciamento stanno in `shared/src/data/`: `economy.ts`, `units.ts`, `movement.ts`, `combat.ts` (distanze di contatto, limite di gruppo, guarigione, morale e rivolte), `engineering.ts` (lavori del genio), `buildings.ts` (edifici).
- Se cambia la forma di `GameState`, aumentare `VERSION` in `client/src/game/storage.ts` (i salvataggi vecchi vengono ignorati).

## Rete di movimento (`shared/src/nav/`)

- `types.ts` — formato: griglia di 0,1° con la provincia di ogni cella e i passaggi bloccati dai fiumi; rete di strade e ferrovie; ponti; fiumi per il disegno.
- `route.ts` — `findRoute`: A* (costo in minuti) che combina celle (fuori strada, metà velocità), strade (velocità piena) e, con l'opzione `rail`, il treno (velocità per cella, ogni nodo ha una copia "in treno" e salire/scendere costa tempo); i fiumi si passano solo su un ponte o su un ponte di barche (`openPassages`). Supporta ponti chiusi.
- `grid.ts` — cella/provincia sotto un punto, distanze, linea retta senza ostacoli. `codec.ts` — lettura/scrittura di `nav.json`.
- Generata da `data/scripts/build-nav.ts` con i parametri di `data/maps/europe-1933/nav.config.json` (quali fiumi, quali strade).

## Comandi

Monorepo con npm workspaces (`shared`, `data`, `client`, `server`), Node 24.

- `./start.command` (o doppio clic dal Finder, o `npm start`) — avvia tutto: controlla Node, installa le dipendenze se servono, genera la mappa se manca, poi avvia client e server (quando avranno uno script `dev`) oppure apre l'anteprima della mappa. Opzioni: `--check` (test e tipi), `--map` (rigenera la mappa). Quando client o server ottengono uno script `dev`, lo script li avvia da solo.
- `npm install` — installa le dipendenze di tutti i pacchetti
- `npm run dev` — avvia il client (Vite) su http://localhost:5173
- `npm test` — test unitari (Vitest)
- `npm run typecheck` — controllo dei tipi TypeScript su tutto il progetto
- `npm run map:build` — rigenera la mappa Europa 1933 in `data/maps/europe-1933/`: province (`map.json`, `provinces.geojson`) e rete di movimento (`nav.json`). Vedi il README in quella cartella. I dati grezzi stanno in `data/raw/` (le province scaricano da sole i file mancanti; strade, ferrovie e fiumi vanno scaricati da Natural Earth, vedi il README).

## Decisioni prese

- **Mappa**: prima versione solo **Europa**, con confini del **1933**. Le zone di mare si definiscono a mano sulla prima mappa (e così per le mappe future).
- **Giocatori**: tutti gli stati sono selezionabili; massimo **8 giocatori umani**, la partita può partire anche con meno. Gli stati non scelti sono governati da **bot** (comportamento da definire).
- **Velocità**: si sceglie a inizio partita; per ora si sviluppa e si prova solo **x1**.
- **Niente casualità pura nel combattimento**: l'unica variabilità ammessa verrà dal **generale** al comando dell'armata (meccanica da definire). Fuori dal combattimento: le rivolte (5%).
- **Gittate e distanze di ingaggio**: definite per singola unità, più avanti.
- **Guerra**: si dichiara esplicitamente oppure scatta da sola quando si entra senza accordi nel territorio altrui (dichiara il padrone di casa). Accordi (passaggio, visione condivisa) evitano la guerra.
- **Combattimento**: ci si può ritirare; la provincia si conquista attraversandola senza armate nemiche dentro.
- **Conquista e rivolte**: provincia conquistata al 25% di morale, +5 punti al giorno; con il morale sotto il 30% e senza armate dentro ha il 5% al giorno di ribellarsi e tornare all'origine (edifici con un livello in meno, come una riconquista). È l'unica casualità ammessa oltre al generale.
- **Edifici**: militari solo nelle città (caserma, fabbrica di mezzi corazzati, fabbrica di artiglieria, fabbrica aeronautica, cantiere navale); industria e ufficio di reclutamento ovunque; fortificazioni, aeroporto e porto li costruisce il genio.
- **Petrolio**: solo dai giacimenti veri; chi non ne ha lo compra dal **mercato estero** (contratto al giorno, limitato da città costiere, porti e vicini in pace; concessioni scontate per Regno Unito, Paesi Bassi e Francia), lo produce col **carburante sintetico** (metallo → petrolio) o conquista i pozzi (che chi si ritira può sabotare). Riserve iniziali storiche. Poi: blocco navale e commercio tra giocatori.
- **Eventi storici** (§13 del game design): non un copione ma **opportunità con condizioni** (finestra di date, nazioni coinvolte, condizioni, scelte con effetti, risposta predefinita a scadenza). Tra soli bot accadono da sole; con un umano diventano una scelta; senza condizioni saltano. Opzione storia fedele/libera per i bot. Capi per data o legati al loro evento.
- **Scenari e salto nel tempo**: si può partire da una data (confini, capi, guerre di quel giorno). In solitaria si può saltare avanti di x mesi: il salto si ferma a ogni scelta che riguarda il giocatore e a ogni minaccia (guerra dichiarata, provincia persa, rivolta, armata distrutta) e mostra un riepilogo di quanto è successo.
- **Diplomazia** (§11): guerra da soli; pace e tregua (7 giorni, poi la guerra riprende) su proposta; accordi su proposta e revocabili da soli: mappa condivisa, diritto di passaggio, alleanza; embargo da soli. Chat tra nazioni. I bot rispondono subito con regole provvisorie.
- **Borsa degli scambi** (§3): offerte e richieste di cibo, beni, metallo e petrolio; lo scambio avviene solo se qualcuno accetta il prezzo.
- **Interfaccia**: in alto capo, risorse e calendario; in basso la barra con Diplomazia, Commercio, Edifici, Produzione (poi Ricerca). Edifici e produzione: prima si sceglie cosa, poi dove (province evidenziate sulla mappa).
- **Interfaccia dell'armata**: prima si sceglie l'azione (Muovi, Attacca), poi si tocca la mappa. Velocità dell'armata = unità più lenta. Treno su scelta del giocatore: 55 km/h nel proprio territorio con morale ≥ 70%, altrimenti 35 km/h; salita e discesa 15 min per unità (max 2 h).

## Decisioni aperte

- Quante province per la mappa Europa? La prima bozza generata ne ha ~360 (vedi `data/maps/europe-1933/`).
- Hosting del server: MacBook Air 2013 di casa o VPS economico.
- Comportamento dei bot.
- Meccanica dei generali.
