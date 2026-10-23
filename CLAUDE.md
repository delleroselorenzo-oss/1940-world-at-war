# 1940 World at War

Gioco di strategia multiplayer ambientato nella Seconda guerra mondiale, **ispirato** a Supremacy: Call of War 1942.
Lo scopo è avere una versione privata da giocare con un piccolo gruppo di amici: **niente acquisti in-game, niente pay-to-win, niente sconosciuti**.

> Lingua: rispondi e commenta in **italiano**. Nomi di variabili, funzioni e file in **inglese**.

## Regole di progetto (importanti)

- **Codice, grafica, nomi e testi originali.** Non copiare asset, sprite, mappe, audio o codice del gioco originale e non decompilarne il client. Prendiamo ispirazione dalle meccaniche (che non sono protette), non dai contenuti.
- Il nome del gioco è "1940 World at War" (provvisorio). Non usare il marchio "Supremacy" o "Call of War" nel gioco.
- Il bilanciamento deve essere **equo**: nessuna valuta premium e nessun modo di accelerare pagando.

## Concetto di gioco

- Partite **persistenti in tempo reale**: durano giorni o settimane, i giocatori entrano qualche volta al giorno (come l'originale), ma con opzione di **velocità accelerata** per partite più brevi tra amici (es. x4, x10).
- Mappa del mondo (o dell'Europa) divisa in **province**. Ogni giocatore controlla una nazione.
- **Risorse**: cibo, materiali, petrolio, ferro/acciaio, manodopera, denaro (lista da rifinire). Prodotte dalle province, consumate da edifici e unità.
- **Edifici** nelle province: caserme, fabbriche, fortificazioni, ecc., con livelli.
- **Unità** con statistiche (attacco/difesa per tipo di bersaglio, velocità, vista, costo, mantenimento) e un **albero della ricerca** che sblocca unità e livelli.
- **Movimento** sulla mappa con tempi di percorrenza reali; **combattimento** automatico a tick quando eserciti si incontrano.
- **Diplomazia** semplice: pace, guerra, diritto di passaggio, condivisione visione; chat tra giocatori.
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
2. **Stato di gioco locale**: province con proprietario e risorse; produzione a tick.
3. **Unità e movimento**: creare un esercito, spostarlo tra province con tempo di viaggio.
4. **Combattimento** base e conquista delle province.
5. **Server multiplayer**: partita condivisa, login, più giocatori via WebSocket.
6. **Edifici, ricerca, diplomazia, nebbia di guerra**.
7. Rifiniture: notifiche, velocità partita, IA per nazioni libere.

## Documentazione

- `docs/game-design.md` — meccaniche di gioco e valori di bilanciamento di partenza. Leggilo prima di lavorare sulla logica di gioco.

## Struttura del client

- `client/src/map/` — mappa: `projection.ts` (proiezione di Lambert sull'Europa, coordinate in km), `camera.ts` (zoom e spostamento), `geometry.ts` (forme proiettate e ricerca della provincia sotto il puntatore), `labels.ts` (etichette senza sovrapposizioni), `MapRenderer.ts` (disegno PixiJS e input mouse/tocco, senza React), `MapView.tsx` (componente React che lo ospita).
- La logica pura (proiezione, camera, geometria, etichette) ha test accanto ai file (`*.test.ts`).

## Comandi

Monorepo con npm workspaces (`shared`, `data`, `client`, `server`), Node 24.

- `./start.command` (o doppio clic dal Finder, o `npm start`) — avvia tutto: controlla Node, installa le dipendenze se servono, genera la mappa se manca, poi avvia client e server (quando avranno uno script `dev`) oppure apre l'anteprima della mappa. Opzioni: `--check` (test e tipi), `--map` (rigenera la mappa). Quando client o server ottengono uno script `dev`, lo script li avvia da solo.
- `npm install` — installa le dipendenze di tutti i pacchetti
- `npm run dev` — avvia il client (Vite) su http://localhost:5173
- `npm test` — test unitari (Vitest)
- `npm run typecheck` — controllo dei tipi TypeScript su tutto il progetto
- `npm run map:build` — rigenera la mappa Europa 1933 in `data/maps/europe-1933/` (scarica i dati grezzi in `data/raw/` la prima volta). Vedi il README in quella cartella.

## Decisioni prese

- **Mappa**: prima versione solo **Europa**, con confini del **1933**. Le zone di mare si definiscono a mano sulla prima mappa (e così per le mappe future).
- **Giocatori**: tutti gli stati sono selezionabili; massimo **8 giocatori umani**, la partita può partire anche con meno. Gli stati non scelti sono governati da **bot** (comportamento da definire).
- **Velocità**: si sceglie a inizio partita; per ora si sviluppa e si prova solo **x1**.
- **Niente casualità pura nel combattimento**: l'unica variabilità ammessa verrà dal **generale** al comando dell'armata (meccanica da definire).
- **Gittate e distanze di ingaggio**: definite per singola unità, più avanti.

## Decisioni aperte

- Quante province per la mappa Europa? La prima bozza generata ne ha ~360 (vedi `data/maps/europe-1933/`).
- Hosting del server: MacBook Air 2013 di casa o VPS economico.
- Comportamento dei bot.
- Meccanica dei generali.
