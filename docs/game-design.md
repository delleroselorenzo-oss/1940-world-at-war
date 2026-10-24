# Game Design — dinamiche base

Documento di riferimento per le meccaniche del gioco. Le meccaniche sono **ricavate da guide pubbliche della community** (vedi Fonti in fondo) e riscritte con parole e numeri nostri.
I numeri sono **valori di partenza per il bilanciamento**, da tenere in `/shared/data` e ritoccare giocando.

Escluso per scelta: negozio, valuta premium (Gold), acceleratori a pagamento, alleanze/coalizioni ufficiali, forum, eventi a premi, ricompense giornaliere. Gli eventi storici invece ci sono (§13).

---

## 1. Tempo

- **Giocatori**: tutti gli stati della mappa sono selezionabili, fino a **8 giocatori umani**; la partita può iniziare anche con meno. Gli stati non scelti sono governati da **bot**.
- Il gioco è **in tempo reale**. I combattimenti si risolvono a **tick ogni 30 minuti** (tempo di gioco); la produzione è continua (calcolata in base al tasso orario).
- **Cambio giorno** ogni 24 ore di gioco dall'inizio della partita: lì si applicano morale, rivolte e consumi giornalieri.
- **Velocità partita** configurabile (x1, x4, x10…): moltiplica tutti i tempi (movimento, costruzione, produzione, ricerca, tick).

## 2. Mappa e province

- La mappa è divisa in **province**, ognuna con: proprietario, tipo, terreno, risorsa principale, morale, edifici, punti vittoria, centro (dove stazionano le guarnigioni) e confini.
- **Tipi di provincia**
  - **Urbana (città)**: produce la maggior parte delle risorse principali (~75% del totale), dà **punti vittoria** (es. 10), è l'unico posto dove si costruiscono **edifici di produzione militare**. Ogni nazione ha poche città (es. 5), ciascuna con una risorsa principale diversa.
  - **Rurale**: produce soprattutto **manodopera e denaro**, a volte una risorsa principale in piccola quantità.
- **Core / non-core**: le province iniziali di una nazione sono *core*. Quelle conquistate sono *non-core* e producono molto meno (es. **-75%**, cioè 1/4).
- **Terreni**: pianura, collina, montagna, foresta, urbano, costa/mare. Il terreno dà **solo bonus** alle unità che lo preferiscono (es. carri in pianura, fanteria in città/colline, truppe da montagna in montagna), non penalità.

## 3. Risorse

| Risorsa | Uso principale |
|---|---|
| Cibo | Fanteria, morale (carenza = calo morale) |
| Beni | Prodotti industriali (attrezzi, vestiario, tessuti, cemento, legname lavorato): edifici e quasi tutte le unità |
| Metallo | Carri, artiglieria, navi |
| Petrolio | Mezzi motorizzati, aerei, navi |
| Denaro | Tutto (unità, edifici, ricerca) |
| Manodopera | Tutte le unità |

- Produzione sommata dalle province, moltiplicata per **morale** ed **edifici industriali**. Viene **accreditata a ogni tick di 30 minuti** di gioco (1/48 della produzione giornaliera); chi è offline la ritrova al rientro.
- **Economia storica** (deciso il 23/10/2026): ogni provincia ha una **popolazione stimata del 1933** e uno **sviluppo** (PIL pro capite di fine anni '30, Maddison Project, dollari del 1990; la media è quella nazionale, con correzioni regionali come Nord e Sud Italia). Valori al giorno, provincia core al 100% di morale:
  - **manodopera**: 0,38 per migliaio di abitanti;
  - **denaro**: 0,085 per migliaio di abitanti per ogni 1.000 $ di PIL pro capite;
  - **beni e metallo** (se sono la risorsa principale): 0,27 per migliaio di abitanti per ogni 1.000 $;
  - **cibo** (se è la risorsa principale): 0,8 per migliaio di abitanti per la radice del PIL pro capite in migliaia (anche le campagne povere rendono);
  - **petrolio**: solo nei **giacimenti veri** (Baku, Grozny, Maikop, Baschiria, Ploiești, Galizia, Bassa Sassonia, Albania), 2.000 al giorno per ogni milione di tonnellate estratte nel 1938;
  - minimo di 600 per la risorsa principale anche nelle province quasi vuote.
  - Esempio: Baviera meridionale (3,7 milioni, sviluppo alto) ~1.550 di denaro e ~1.450 di manodopera; Orenburg ovest (1,4 milioni, sviluppo basso) ~235 e ~520.
- **Stima della popolazione** (`economy` in `data/maps/europe-1933/config.json`): per ogni nazione popolazione del 1933, quota urbana e PIL pro capite; la parte urbana si divide secondo le città, quella rurale secondo la superficie (meno a nord e a est); alcune province hanno valori fissati a mano.
- **Mantenimento**: le unità consumano risorse ogni giorno (proporzionale al costo). Carenze → morale in calo; per il cibo fino a -30.
- **Nessun limite di magazzino**: le scorte possono crescere senza tetto (deciso il 23/10/2026).
- **Mantenimento**: si scala a ogni tick come la produzione; le scorte non scendono sotto zero (le carenze agiranno sul morale).
- Le città di una nazione hanno risorse principali **diverse tra loro**; alcune province hanno risorse storiche (metallo nella Ruhr, in Slesia, nel Donbass e a Kiruna, grano in Ucraina…). Vedi `resources` in `data/maps/europe-1933/config.json`.

### Petrolio e mercato estero (deciso il 23/10/2026)

La mappa è solo l'Europa, ma nel 1938 quasi tutto il petrolio europeo veniva da fuori (Stati Uniti, Venezuela, Iran, Iraq). Il resto del mondo non si gioca: esiste come **mercato estero**. Valori in `shared/src/data/economy.ts` (`TRADE`), regole in `shared/src/game/trade.ts`.

- **Contratti di importazione** (deciso il 25/10/2026: per tutte le materie prime): il giocatore sceglie quanto comprare al giorno di cibo, beni, metallo e petrolio (pannello "Commercio" → "Mercato estero"). Si paga in denaro a ogni tick; senza denaro arriva solo la parte pagata. Prezzi per unità: cibo **0,6**, metallo **0,9**, beni **1**, petrolio **1,2**.
- Tutti i contratti insieme **non possono superare la capacità di importazione** al momento della firma. Se poi la capacità cala (una guerra chiude una via di terra), i contratti arrivano tutti ridotti nella stessa proporzione.
- **Capacità di importazione** al giorno: **2.500** per ogni città costiera posseduta, **1.500** per ogni porto costruito dal genio, **800** per ogni nazione confinante con cui non si è in guerra (via terra, al massimo **2.400**). Oltre la capacità il contratto non arriva.
- **Concessioni**: una quota al giorno a prezzo scontato (**0,5**) per le potenze con concessioni petrolifere all'estero: Regno Unito 8.000 (Iran e Iraq), Paesi Bassi 3.000 (Indie orientali), Francia 2.500 (Iraq). Arriva comunque attraverso la capacità di importazione.
- **Riserve iniziali**: chi non ha pozzi parte con scorte storiche di petrolio (Regno Unito 40.000, Germania e Francia 30.000, Italia 20.000…; `oilReserve` in `config.json`).
- **Carburante sintetico**: edificio nelle città (livelli 1–3); ogni livello trasforma **500 di metallo in 250 di petrolio** al giorno, fin dove basta il metallo. La strada della Germania storica (Leuna, Pölitz).
- **Sabotaggio dei pozzi**: in una propria provincia con giacimento, qualsiasi armata ferma può sabotare i pozzi (**6 ore**); non producono più, anche per chi conquista la provincia, finché il genio non li ripara (**3 giorni**, diviso per il numero di unità del genio).
- **Embargo**: chi mette un vicino sotto embargo (o lo subisce) non importa più via terra attraverso di lui.
- **Fase successiva**: blocco navale (le flotte nemiche tagliano le importazioni via mare).
- Scorte iniziali: 3 giorni di produzione.
- Valori nel codice: `shared/src/data/economy.ts`.

### Borsa degli scambi tra nazioni (deciso il 25/10/2026)

Valori in `shared/src/data/diplomacy.ts` (`MARKET`), regole in `shared/src/game/market.ts`, pannello "Commercio" → "Borsa tra nazioni".

- Si scambiano cibo, beni, metallo e petrolio; si paga in denaro (manodopera e denaro non si scambiano).
- Chi vende mette un'**offerta** (quantità e prezzo l'uno), chi compra una **richiesta**. Lo scambio avviene **solo quando qualcuno accetta**: una richiesta incontra le offerte allo stesso prezzo o più basse (prima le più convenienti, poi le più vecchie) e paga il prezzo di chi era già in borsa; lo stesso al contrario per un'offerta.
- Finché un ordine è aperto, la merce (o il denaro) resta **accantonata**; ritirandolo torna indietro. Si può prendere anche solo una parte di un ordine.
- Niente scambi tra nazioni **in guerra** o con un **embargo** in un verso o nell'altro.
- Limiti: prezzo tra 0,05 e 50, quantità tra 100 e 1.000.000, al massimo 12 ordini aperti per nazione.
- I bot per ora non usano la borsa: serve a chi gioca con gli amici.

## 4. Morale

- Ogni provincia ha un **morale 0–100%** e un **valore obiettivo**; a ogni cambio giorno il morale si sposta di circa il **22%** della distanza verso l'obiettivo.
- Obiettivo = base (~100) + bonus − malus:
  - **Malus**: distanza dalla capitale (fino a circa -30), dimensione dell'impero (fino a circa -35), vicini scontenti, eserciti nemici nella provincia, carenza di cibo (fino a -30), bombardamenti, perdita della capitale (-20 immediato ovunque), assenza di capitale (-40).
  - **Bonus**: capitale (+10), fortificazioni/infrastrutture (+5 per livello), vicini contenti, edifici di propaganda.
- **Effetti**: sotto l'80% il morale riduce produzione e velocità di costruzione/addestramento (al 25% i tempi di costruzione sono circa x2,6).
- Le province conquistate partono dal **25%**. Conquistare una capitale nemica dà **+10%** a tutte le proprie province.
- **Rivolte**: sotto circa il **31%**, a ogni cambio giorno c'è una probabilità di rivolta che cresce al calare del morale. Una **guarnigione** al centro della provincia la riduce o la azzera. Se riesce, la provincia passa all'ex proprietario o a un vicino.
  - *Deciso per ora* (§10): rivolta al 5% al giorno nelle province conquistate con morale sotto il 30% e senza armate dentro.

## 5. Edifici

- Si costruiscono in una provincia, hanno **livelli**; costi e tempi crescono per livello. Possono essere **danneggiati** dagli attacchi e vanno riparati (funzionano in proporzione alla salute).
- **Città** (fino a 5 livelli):
  - **Caserma** → fanteria
  - **Fabbrica carri** → mezzi corazzati
  - **Fonderia** → artiglieria e supporto
  - **Fabbrica aerei** → aerei, decollo/atterraggio, rifornimento
  - **Base navale** → navi, imbarco/sbarco più veloce
  - **Laboratorio segreto** → unità speciali (fine partita)
  - **Industria** → + produzione di risorse e denaro
  - **Bunker** → bonus difensivo alla guarnigione
  - **Capitale** (1 livello, unica) → centro della nazione per il calcolo della distanza
- **Province rurali** (fino a 3 livelli):
  - **Industria locale** → + produzione
  - **Fortificazioni** → bonus difensivo, + morale
  - **Infrastrutture** → + velocità di movimento, + morale
  - **Pista d'atterraggio** → decollo/atterraggio aerei
- Il livello dell'edificio di produzione determina il **livello massimo di unità** producibile lì.

### Stato attuale (milestone 4)

- Valori in `shared/src/data/buildings.ts`, regole in `shared/src/game/buildings.ts`.
- Livelli **1–3** (aeroporto e porto: 1). Il livello n costa n volte il livello 1 e richiede n volte il tempo.
- **Una costruzione alla volta** per provincia, pagata subito; annullandola le risorse tornano indietro.
- **Città**:
  - **Caserma**: fanteria, genio, sanità.
  - **Fabbrica di mezzi corazzati**: carri, autoblindo, fanteria motorizzata (escono con l'equipaggio).
  - **Fabbrica di artiglieria**: artiglieria.
  - **Fabbrica aeronautica** e **cantiere navale** (solo città costiere): si costruiscono già, produrranno con aviazione e marina.
  - Senza l'edificio giusto non si arruola. Ogni livello oltre il primo riduce del **15%** i tempi di arruolamento nella provincia.
- **Ovunque**:
  - **Industria**: +25% per livello della risorsa principale (denaro nelle province che non ne hanno).
  - **Ufficio di reclutamento**: +25% di manodopera per livello.
- **Città, economia**: **impianto di carburante sintetico** (1–3): ogni livello trasforma 500 di metallo in 250 di petrolio al giorno (vedi §3).
- **Genio** (lavoro di un'armata con il genio, ferma in una propria provincia; si paga all'inizio, si recupera interrompendo):
  - **Fortificazioni** (1–3): chi difende nella provincia subisce il 15% di danni in meno per livello.
  - **Aeroporto** e **porto** (solo province costiere): serviranno con aviazione e marina.
  - La durata si divide per il numero di unità del genio (massimo 3).
- **Edifici iniziali**: capitale con caserma 2, fabbrica di mezzi corazzati 1 e fabbrica di artiglieria 1; le altre città con caserma 1.
- **Cambio di padrone** (conquista o rivolta): ogni edificio perde un livello; quelli al livello 1 sono distrutti. Costruzione in corso e coda di arruolamento si perdono.

### Interfaccia degli edifici (deciso il 25/10/2026)

- Nel pannello "Edifici" ogni edificio mostra il suo **effetto per livello** (industria +25% della risorsa principale, ufficio di reclutamento +25% di manodopera, fortificazioni −15% di danni in difesa, caserme e fabbriche −15% sui tempi di arruolamento, porto +1.500 di capacità di importazione…) e, provincia per provincia, **cosa cambierebbe** con il livello successivo (per esempio "Metallo: +639 al giorno, da 2.559 a 3.199").

## 6. Ricerca

- Albero diviso per categoria (fanteria, corazzati, artiglieria, aerei, navi, speciali).
- Ogni ricerca sblocca un'unità o il suo **livello successivo**. I livelli si sbloccano per **giorno di partita** (es. livello 2 dal giorno 3), così la progressione è uguale per tutti.
- Al massimo **due ricerche contemporanee**. Costo e durata crescono per livello.
- Le unità già costruite **non** si aggiornano da sole: si produce la nuova versione (o si paga un aggiornamento in risorse, opzionale).
- Un'unità al livello massimo vale circa **4–6x** in combattimento e **2–3x** in costo rispetto al livello 1.

## 7. Unità

### Classi di armatura (bersaglio)
Fanteria, Corazzato leggero, Corazzato pesante, Aereo, Nave, Sottomarino, Edificio.

### Statistiche di ogni unità
- **Punti salute**
- **Danno offensivo** e **danno difensivo** *contro ciascuna classe di armatura*
- **Classe di armatura** propria
- **Velocità** (km/h), con bonus sul terreno preferito
- **Raggio visivo** e, per le unità a distanza, **gittata**
- **Costo** (risorse + manodopera + denaro), **tempo di produzione**, **mantenimento giornaliero**
- Flag: *ricognizione* (rivela unità stealth), *stealth*, *ignora bonus difensivi*, *antiaereo*
- **Terreni preferiti**

### Elenco di partenza (tipi storici generici, statistiche nostre)
- **Fanteria**: milizia, fanteria, fanteria motorizzata, fanteria meccanizzata, truppe da montagna/assalto, paracadutisti
- **Corazzati**: auto blindate, carro leggero, carro medio, carro pesante, cacciacarri
- **Supporto**: artiglieria, artiglieria semovente, antiaerea, anticarro
- **Aerei**: caccia, bombardiere tattico, bombardiere strategico, aereo navale
- **Navi**: cacciatorpediniere, incrociatore, corazzata, sottomarino, portaerei, trasporto (automatico)
- **Speciali** (fine partita, opzionali): razzi, armi atomiche

Le unità nel **ruolo preferito** sono circa 2–3x più efficaci; le "tuttofare" sono più deboli in entrambi i ruoli.

**Aeronautica e Marina** (25/10/2026): nel pannello "Produzione" ci sono già le due categorie con le prime unità **in arrivo** (non ancora arruolabili): caccia e bombardiere (fabbrica aeronautica); sottomarino, cacciatorpediniere, nave da battaglia e portaerei (cantiere navale). Statistiche e costi si decidono insieme al volo e alla navigazione (`PLANNED_UNITS` in `shared/src/data/units.ts`).

## 8. Movimento

- Gli eserciti si muovono **verso qualsiasi punto della terraferma**, non solo verso i centri delle province, con tempo di percorrenza reale in base alla distanza e alla velocità dell'unità più lenta.
- **Strade** (rete reale semplificata): velocità piena. **Fuori strada**: metà velocità. Il percorso più rapido è calcolato automaticamente e combina i due.
- **Ferrovia**: in treno tutte le unità vanno alla stessa velocità: **55 km/h nel proprio territorio** dove il morale della provincia è almeno **70%**, **35 km/h** nel resto del proprio territorio e dove si ha il diritto di passaggio (media realistica di un convoglio militare con soste e incroci). Altrove il treno non si usa e si marcia lungo i binari come su una strada. Salire e scendere costa ciascuno **15 minuti per unità, al massimo 2 ore** (dipende solo dal numero di unità, non dal tipo).
- **Il treno lo sceglie il giocatore**: con l'opzione "Treno" attiva l'ordine di marcia usa il treno nei tratti in cui fa guadagnare tempo (sui tragitti brevi può comunque convenire marciare); senza l'opzione l'armata non sale mai.
- La velocità dell'armata è quella dell'**unità più lenta**; per andare più veloci si divide l'armata.
- **Grandi fiumi** (Danubio, Reno, Volga, Dnepr, Vistola, Elba, Oder, Loira, Po, Don, Dnestr… circa 60): si attraversano **solo sui ponti**, cioè dove una strada o una ferrovia passa il fiume.
- **Ponti distruggibili** (e riparabili) e **ponti di barche** costruiti dal genio: vedi "Lavori sul campo" qui sotto.
- **Territorio straniero**: si può marciare ovunque, ma il percorso automatico passa solo per il proprio territorio, per quello di chi è già in guerra o ha un accordo con noi, e per quello della nazione verso cui si marcia (mai per un paese terzo, per non scatenare guerre per sbaglio).
- Bonus di velocità da infrastrutture e terreno preferito. Le unità sotto il 50% di salute vanno più lente.
- **Mare**: le unità terrestri diventano **trasporti** (imbarco/sbarco 3–4 ore, ridotto dalla base navale).
- **Aerei**: hanno un'autonomia; oltre quella si spostano via terra come convoglio.

### Stato attuale (milestone 3 e 4)
- Unità disponibili: fanteria, fanteria motorizzata, autoblindo, carro leggero, artiglieria (valori in `shared/src/data/units.ts`).
- Ogni nazione parte con un'armata in ogni città (3 fanterie + 1 artiglieria nella capitale, 2 fanterie nelle altre).
- Si arruola **solo nelle proprie città**: il costo si paga subito, l'unità esce dopo il tempo di produzione; più ordini formano una coda.
- Un'armata in marcia che riceve un nuovo ordine cambia strada dal punto in cui si trova; "Fermati qui" la ferma dov'è.
- L'arrivo a destinazione si registra al primo controllo dei 5 minuti (vedi §9).
- Due armate della stessa nazione ferme entro 3 km si **uniscono**; le unità appena arruolate si uniscono all'armata ferma in città.
- **Partenza ritardata** ("Ritarda"): l'armata resta ferma e parte all'ora scelta; il percorso si calcola alla partenza. Partendo si abbandona un eventuale lavoro in corso.
- Valori: `shared/src/data/movement.ts`.

### Lavori sul campo (genio e sanità)
- Due unità di supporto: **Genio** (fa i lavori) e **Sanità** (cura). Si arruolano in città come le altre.
- **Distruggere un ponte** (o un ponte di barche) entro 3 km: qualsiasi armata ferma, **1 ora**. Le armate il cui percorso passava di lì cambiano strada; se non ce n'è un'altra si fermano.
- **Riparare un ponte** entro 3 km: serve il genio, **8 ore**.
- **Ponte di barche**: serve il genio, **6 ore**, sul tratto di fiume più vicino entro 8 km. Lo può usare chiunque e si può distruggere.
- **Ospedale da campo**: servono genio e sanità, **4 ore**. Le armate della stessa nazione ferme entro 5 km guariscono del 10% per tick. Va perso se ci sono nemici entro 5 km e nessuna armata amica a difenderlo.
- **Sabotare i pozzi di petrolio** della provincia (solo nelle proprie, dove c'è un giacimento): qualsiasi armata ferma, **6 ore**. **Ripararli**: serve il genio, **3 giorni**.
- Più genio lavora più in fretta: la durata si divide per il numero di unità del genio, fino a 3 (la distruzione dura sempre 1 ora). Un ordine di marcia o "Fermati qui" interrompe il lavoro.
- **Guarigione** di un'armata ferma senza nemici a contatto: il valore più alto tra 3% per tick nel proprio territorio, 6% se ha la sanità (ovunque), 10% vicino a un proprio ospedale.
- Valori: `shared/src/data/engineering.ts` e `shared/src/data/combat.ts`.

## 9. Combattimento

- **Tick ogni 30 minuti** tra eserciti ingaggiati. Distanza di ingaggio ravvicinato: **5 km**.
- **Ritirata possibile**: un'armata a contatto può ricevere un ordine di marcia e allontanarsi; finché resta entro 5 km continua a combattere. Avanzare verso il nemico a contatto invece la ferma di nuovo: non si passa attraverso un'armata nemica.
- **Danno di un esercito contro una classe** = somma del danno delle sue unità contro quella classe, con **limite di gruppo**: oltre 10 unità il danno aggiunto cala, oltre 20 non cresce più.
- **Offensivo vs difensivo**: chi attacca usa i valori offensivi; chi è fermo in difesa usa quelli difensivi; se entrambi sono in movimento valgono entrambi.
- **Efficienza per salute**: `efficienza = 20% + 0,8 × salute%` (100% a piena salute, 60% a metà).
- **Niente fattore casuale**: a parità di condizioni il risultato è sempre lo stesso. L'unica variabilità prevista è quella data dal **generale** al comando dell'armata (vedi sotto, da definire).
- **Distribuzione**: il danno contro una classe si divide tra le unità nemiche di quella classe, in proporzione alla loro presenza nell'esercito.
- **Perdite**: dentro ogni classe il danno colpisce prima l'unità più malconcia, che viene distrutta quando arriva a zero; così le perdite arrivano una alla volta (al posto della regola "distrutte solo sotto il 50%", che serviva con i danni casuali).
- **Bonus**: terreno preferito, fortificazioni/bunker (es. -38% di danno subito al livello 1), livello dell'unità.
- **Unità a distanza** (artiglieria, navi): attaccano entro la gittata ogni 30 minuti; il bersaglio risponde solo se ha gittata sufficiente; sotto i 5 km diventa combattimento ravvicinato.
- **Aerei**:
  - *Attacco diretto*: colpiscono dopo il tempo di volo, poi devono rifornirsi (30 min, meno con aeroporti di livello più alto).
  - *Pattuglia*: ogni 15 minuti metà danno a chi è nel cerchio di pattuglia.
  - Le unità di terra/mare rispondono con i valori antiaerei difensivi; gli aerei subiscono prima la difesa, poi infliggono danno.
- **Danni agli edifici**: attaccare un'unità al centro di una provincia danneggia anche gli edifici (fortificazioni bersaglio più probabile).

### Stato attuale (milestone 4)
- **Guerra**: si può dichiarare guerra dal pannello di una provincia straniera, oppure entrare senza accordi nel suo territorio: in quel caso è il padrone di casa a dichiarare guerra. Con un accordo (diritto di passaggio o visione condivisa) non succede nulla. Pace e accordi si potranno negoziare con la diplomazia vera (milestone 6); prima di entrare in un paese neutrale l'interfaccia chiede conferma.
- **Controlli ogni 5 minuti** a orari fissi: ingresso nei territori, contatti, conquiste, arrivi. Tra un controllo e l'altro ogni armata si considera in moto rettilineo; gli orari fissi fanno sì che il risultato non dipenda da quante volte si fa avanzare la partita.
- **Contatto**: due armate nemiche che arrivano entro 5 km si fermano. Chi marciava con l'ordine **Attacca** va all'**assalto** (valori offensivi); con **Muovi** si ferma e **difende**, come chi era già fermo (valori difensivi). Durante la marcia si usano i valori offensivi. Vinto lo scontro, l'armata fermata riprende da sola la marcia interrotta.
- **Bersaglio**: ogni armata colpisce l'armata nemica più vicina; i danni del tick si calcolano tutti insieme sullo stato di inizio tick.
- **Classi di armatura** per ora due: fanteria (fanteria, motorizzata, artiglieria) e corazzati (autoblindo, carro leggero). Valori in `shared/src/data/units.ts`, parametri in `shared/src/data/combat.ts`.
- **Guarigione**: vedi §8, "Lavori sul campo".
- Non ancora: gittata dell'artiglieria (per ora combatte solo da vicino), bonus di terreno e fortificazioni, generali.

| Unità | Classe | Salute | Attacco (fant./corazz.) | Difesa (fant./corazz.) |
|---|---|---|---|---|
| Fanteria | fanteria | 15 | 2 / 1 | 3 / 1,5 |
| Fanteria motorizzata | fanteria | 15 | 2,5 / 1 | 3 / 1,5 |
| Autoblindo | corazzati | 12 | 2,5 / 1 | 1,5 / 0,75 |
| Carro leggero | corazzati | 20 | 3,5 / 2,5 | 2 / 1,5 |
| Artiglieria | fanteria | 10 | 3 / 1,5 | 2 / 1 |
| Genio | fanteria | 12 | 1 / 0,5 | 1,5 / 0,75 |
| Sanità | fanteria | 10 | 0,5 / 0,25 | 1 / 0,5 |

Esempio: l'armata di una capitale (3 fanterie + 1 artiglieria) che assalta un'armata uguale in difesa perde, dopo alcune ore di combattimento: chi difende è avvantaggiato.

### Interfaccia dell'armata
- Toccando un'armata si apre il suo pannello. Dall'alto: **comandante** (con accanto i pulsanti delle azioni), **stato attuale** (cosa fa e quando finisce, salute complessiva), **azioni**, **composizione** per tipo di unità (quantità, salute, velocità, attacco/difesa; evidenziata l'unità più lenta), riepilogo di forza e mantenimento.
- **Prima si sceglie l'azione, poi si tocca la mappa**: niente ordini dati da un tocco "indovinato". Azioni di mappa: **Muovi** (marcia, al contatto si difende), **Attacca** (marcia in assetto d'assalto verso un punto o verso la posizione attuale di un'armata nemica). Il pulsante vale per un solo ordine; senza azione scelta un tocco seleziona soltanto. Esc annulla l'azione.
- **Ritarda**: si sceglie prima dell'ordine (da 30 minuti a 24 ore); lo stato mostra il conto alla rovescia e "Annulla partenza".
- Altre azioni nel pannello: Fermati qui, Ritirati (in combattimento), Lavori del genio (grigi con il motivo se non si possono fare, con barra di avanzamento e "Interrompi" quando sono in corso), opzione "Treno" (resta impostata tra un ordine e l'altro).
- Da fare: **Dividi**, inseguimento di un'armata in movimento, generali.
- Spostarsi su un'armata propria (o fermarsi vicino) la **unisce** di default. Il comando passa al militare con **grado ed esperienza** maggiori, salvo scelta diversa del giocatore.
- Aeronautica e marina avranno pannelli analoghi.

### Generali (idea, da definire)
- Ogni armata può avere un **generale** al comando, con caratteristiche proprie (es. bonus in attacco, in difesa, su un terreno, sul morale o sulla velocità).
- È l'elemento che sostituisce la casualità: due battaglie uguali danno risultati diversi perché sono guidate da generali diversi.
- Da decidere: come si ottengono, se possono morire o essere catturati, se migliorano con l'esperienza.

## 10. Conquista e vittoria

- Una provincia si conquista **attraversandola** (anche senza fermarsi, in qualsiasi punto) quando dentro non ci sono armate nemiche. Serve essere in guerra con il proprietario (entrare senza accordi la fa scattare).
- Alla conquista la provincia passa al conquistatore con morale al **25%**; edifici, costruzioni e arruolamenti come in §5.
- **Province conquistate**: a ogni cambio giorno il morale sale di **5 punti** (25 → 30 → 35…) se non c'è stata una rivolta.
- **Rivolte**: a ogni cambio giorno una provincia conquistata con il **morale sotto il 30%** e **senza armate dentro** (di nessuno) ha il **5%** di probabilità di ribellarsi e tornare alla nazione d'origine, come se fosse stata riconquistata (morale al 25%, edifici con un livello in meno). L'esito dipende da un seme della partita, così rigiocare lo stesso tempo dà lo stesso risultato.
- **Province core**: a ogni cambio giorno il morale si avvicina a 100 del 22% della distanza (bonus e malus arriveranno con il morale completo, §4).
- **Vittoria**: raggiungere una soglia di **punti vittoria** (dalle città possedute) oppure restare l'ultimo. Soglia configurabile per partita.

## 11. Diplomazia (deciso il 25/10/2026)

Pannello "Diplomazia" nella barra in basso: elenco delle nazioni con i rapporti, e per ognuna proposte, accordi, embargo e chat. Valori in `shared/src/data/diplomacy.ts`, regole in `shared/src/game/diplomacy.ts`.

- **Guerra**: si dichiara da soli (o scatta entrando senza accordi nel territorio altrui). Fa cadere tregua e accordi.
- **Pace** e **tregua**: si propongono in guerra e l'altro accetta o rifiuta. La **tregua** ferma i combattimenti per **7 giorni**, poi la guerra riprende da sola se nel frattempo non si fa la pace. Dopo una pace o una tregua le armate rimaste nel territorio dell'altro hanno **24 ore** per ritirarsi senza far ripartire la guerra; le province conquistate restano a chi le ha prese.
- **Accordi** (in pace, si propongono, ognuno li può revocare da solo quando vuole):
  - **mappa condivisa** (visione condivisa: servirà con la nebbia di guerra; intanto le armate possono entrare senza guerra);
  - **diritto di passaggio** (attraversare il territorio dell'altro, anche in treno);
  - **alleanza** (passaggio e mappa condivisa insieme). Non trascina automaticamente in guerra: chi è alleato decide da sé.
- **Embargo**: si decide da soli contro una nazione; niente scambi in borsa con lei e niente importazioni via terra attraverso il suo territorio.
- **Proposte**: scadono dopo **72 ore** di gioco senza risposta; si possono ritirare. Tra giocatori restano in attesa; i **bot** rispondono subito con una frase in chat, con regole provvisorie finché non avranno un comportamento proprio: tregua dopo 24 ore di guerra, pace dopo 3 giorni, mappa condivisa sì, passaggio solo agli alleati, alleanza solo con chi ha un nemico in comune.
- **Chat** tra ogni coppia di nazioni (ultimi 100 messaggi), con le proposte e le risposte nello stesso filo. I bot rispondono alle proposte, non ai messaggi.
- Niente coalizioni ufficiali con classifiche o bonus: l'alleanza è un accordo tra due nazioni.

## 12. Spionaggio (fase successiva, opzionale)

- Spie che rivelano informazioni, sabotano edifici o abbassano il morale, con mantenimento giornaliero.

## 13. Storia: eventi, scenari e salto nel tempo (deciso il 25/10/2026)

La partita parte da una data storica, ma i giocatori possono cambiare la storia. Per questo gli eventi storici (Anschluss, Monaco, patto Molotov-Ribbentrop…) **non sono un copione**: sono **opportunità con condizioni**, che accadono solo se la partita ci arriva in una situazione in cui hanno senso. Le stesse regole valgono in ogni modalità: partita normale, partita in solitaria con il salto nel tempo, multigiocatore.

### Com'è fatto un evento

- **Finestra di date**: da quando l'evento può accadere e fino a quando (per esempio l'Anschluss dal 12 marzo 1938 a fine 1938). Prima della finestra non succede, dopo decade.
- **Nazioni coinvolte**, ognuna con un ruolo: chi propone (la Germania chiede l'Austria), chi riceve (l'Austria), a volte chi può intervenire (Regno Unito e Francia come garanti a Monaco).
- **Condizioni**: le nazioni esistono ancora, possiedono le province in questione, confinano, sono o non sono in guerra tra loro, è già successo un altro evento (l'invasione sovietica della Polonia richiede il patto Molotov-Ribbentrop), una provincia è in mano a qualcuno (l'armistizio francese richiede Parigi in mano tedesca), ecc.
- **Scelte**: ogni nazione coinvolta ha due o tre risposte (accettare, rifiutare, resistere, intervenire…), ognuna con i suoi **effetti**.
- **Effetti possibili**: province che passano di mano (con morale e regole delle conquiste, §10), annessione di un'intera nazione, guerra, pace, patto di non aggressione, diritto di passaggio, cambio di capo, risorse o morale.
- **Risposta predefinita e scadenza**: ogni scelta ha un tempo per rispondere (di solito 3 giorni di gioco, mai oltre la fine della finestra). Se nessuno risponde vale la risposta predefinita, quasi sempre "rifiuta". Così chi non entra per qualche giorno non blocca la partita.

### Chi decide

1. **Tutte le nazioni coinvolte sono bot**: l'evento accade da solo quando le condizioni sono vere.
2. **C'è almeno un giocatore umano**: l'evento diventa una **scelta** (notifica e riquadro con le risposte). Se gli umani sono più di uno, risponde prima chi propone, poi chi riceve, poi chi può intervenire.
3. **Le condizioni non ci sono più**: l'evento salta, anche se era già in attesa di risposta. Se la Francia non si è arresa, Pétain non arriva.

**Opzione di partita**: *storia fedele* (i bot scelgono sempre la risposta storica) oppure *storia libera* (i bot scelgono secondo la situazione, quando avranno un comportamento proprio). Gli umani scelgono sempre liberamente.

Gli eventi si controllano a ogni **cambio giorno**, insieme a morale e rivolte. Le risposte sono ordini come gli altri (validati dal server), e le scelte dei bot dipendono solo dallo stato e dal seme della partita: stesse scelte, stessa storia, anche recuperando molte ore in un colpo.

### Capi delle nazioni

- **Per data**: i cambi che non dipendono dalla guerra (elezioni, rimpasti, morti naturali: Piłsudski 1935, Atatürk 1938, Boris III 1943) seguono il calendario, come già fa `leaderAt`.
- **Per evento**: i capi nati dalla guerra arrivano solo con il loro evento: Seyss-Inquart (Anschluss), Pétain (armistizio francese), Antonescu (abdicazione di Carlo II), Badoglio (caduta di Mussolini), Dönitz (fine del Reich), i governi in esilio, Szálasi, ecc. Se l'evento non accade, resta il capo precedente e i cambi per data successivi di quella nazione si fermano dove la storia ha preso un'altra strada.

### Partire da una data (scenari)

- A inizio partita si sceglie la data dal calendario. La partita parte con la situazione storica di quel giorno: **confini** (da CShapes, che li ha giorno per giorno: si genera una mappa per data come quella del 1933), **capi** in carica, **guerre e accordi** in corso, eventi già accaduti (che non si ripetono).
- Date proposte per i primi scenari: **1 giugno 1933** (attuale), **1 marzo 1938** (prima dell'Anschluss), **1 settembre 1939** (invasione della Polonia), **22 giugno 1941** (operazione Barbarossa).
- Popolazione ed economia restano quelle del 1933 corrette per i confini (per ora); le riserve di petrolio e le scorte si adeguano alla data.

### Saltare avanti nel tempo (solo partite in solitaria)

- Il giocatore chiede "salta 6 mesi" (o fino a una data): il motore fa scorrere il tempo con le regole normali, molto più in fretta.
- **Il salto si ferma** quando serve il giocatore:
  - un **evento storico** che coinvolge la sua nazione: compare la scelta; dopo la risposta il salto riparte fino alla data chiesta o al prossimo stop;
  - **minacce**: guerra dichiarata contro di lui, provincia persa, rivolta, armata distrutta (deciso: si ferma sempre).
- Gli eventi tra soli bot **non fermano** il salto ma accadono lo stesso; a ogni stop e alla fine compare un **riepilogo** ("Nel frattempo: patto tra Unione Sovietica e Germania, Polonia invasa, nuovo capo in Romania…").
- Il risultato è *una* storia possibile, non per forza quella vera: dipende dalle scelte del giocatore e dall'opzione storia fedele/libera.
- Nel multigiocatore non si salta: le scelte arrivano come notifiche con la loro scadenza.
- Dipende dai **bot**: finché non hanno un comportamento, il salto fa scorrere economia, costruzioni ed eventi, ma le nazioni bot non muovono armate.

### Primi eventi (1933–1945)

Le province coinvolte (Sudeti, Memel, Carelia, Bessarabia…) si definiranno come gruppi nella configurazione della mappa. Tra parentesi la data storica; "→" indica la risposta storica.

| Evento | Finestra | Coinvolti | Condizioni principali | Scelte ed effetti |
|---|---|---|---|---|
| Anschluss (12/3/1938) | mar–dic 1938 | GER propone, AUT riceve | entrambe esistono, confinano, non in guerra | accetta → AUT annessa a GER, capo Seyss-Inquart per 2 giorni; rifiuta → nulla, GER può dichiarare guerra |
| Sudeti / Monaco (29/9/1938) | set 1938 – mar 1939 | GER propone, CZE riceve, GBR e FRA garanti | GER confina con i Sudeti, CZE li possiede | CZE cede → Sudeti a GER; CZE rifiuta → GBR e FRA scelgono se garantire (guerra a GER se attacca) o lasciar fare (→ lasciano fare) |
| Primo arbitrato di Vienna (2/11/1938) | nov 1938 – mar 1939 | HUN propone, CZE riceve | dopo i Sudeti | accetta → Slovacchia meridionale a HUN |
| Fine della Cecoslovacchia (15/3/1939) | mar–dic 1939 | GER propone, CZE riceve | dopo i Sudeti | accetta → Boemia e Moravia a GER, Rutenia a HUN, capo Hácha; rifiuta → guerra |
| Memel (22/3/1939) | mar–dic 1939 | GER propone, LTU riceve | GER confina con Memel | accetta → Memel a GER |
| Albania (7/4/1939) | apr–dic 1939 | ITA propone, ALB riceve | non in guerra | accetta → ALB annessa a ITA; rifiuta → guerra (→ ITA attacca) |
| Patto Molotov-Ribbentrop (23/8/1939) | ago 1939 – giu 1941 | GER propone, SOV riceve | non in guerra tra loro | accetta → non aggressione e sfere d'influenza: sblocca Polonia orientale, Baltici, Bessarabia, guerra d'inverno |
| Danzica e Polonia (1/9/1939) | ago–dic 1939 | GER propone, POL riceve, GBR e FRA garanti | DAN e POL esistono | POL cede Danzica e corridoio → passano a GER; rifiuta → GER sceglie se attaccare (→ attacca), GBR e FRA se dichiarare guerra (→ la dichiarano) |
| Polonia orientale (17/9/1939) | set 1939 – giu 1940 | SOV | dopo il patto, GER in guerra con POL | SOV entra in guerra con POL; alla pace le province a est della linea concordata vanno a SOV |
| Guerra d'inverno (30/11/1939) | nov 1939 – 1940 | SOV propone, FIN riceve | dopo il patto | FIN cede la Carelia → passa a SOV; rifiuta → guerra (→ rifiuta) |
| Entrata in guerra dell'Italia (10/6/1940) | mag–dic 1940 | ITA | GER in guerra con FRA | ITA dichiara guerra a FRA e GBR (→ sì) o resta neutrale |
| Armistizio francese (22/6/1940) | 1940–1944 | FRA, GER | Parigi in mano tedesca, FRA e GER in guerra | FRA firma → pace con GER, il nord passa a GER, capo Pétain (Vichy); continua → capo de Gaulle, governo in esilio |
| Baltici (giu 1940) | 1940–1941 | SOV propone, EST, LVA, LTU ricevono | dopo il patto | accetta → annessione a SOV; rifiuta → guerra |
| Bessarabia e Bucovina (28/6/1940) | 1940–1941 | SOV propone, ROU riceve | dopo il patto | accetta → province a SOV; rifiuta → guerra |
| Secondo arbitrato di Vienna (30/8/1940) | 1940–1941 | HUN propone, ROU riceve, GER arbitro | ROU possiede la Transilvania | accetta → Transilvania settentrionale a HUN, poi abdicazione di Carlo II (capo Antonescu) |
| Dobrugia meridionale (7/9/1940) | 1940–1941 | BGR propone, ROU riceve | ROU possiede la Dobrugia meridionale | accetta → passa a BGR |
| Patto tripartito (nov 1940 – mar 1941) | 1940–1941 | GER propone, HUN, ROU, BGR, YUG ricevono | non in guerra con GER | accetta → diritto di passaggio per GER; per YUG segue il colpo di stato (capo Pietro II) che lo annulla |
| Caduta di Mussolini (25/7/1943) | 1943–1945 | ITA | nemici in una provincia italiana, ITA in guerra | capo Badoglio, poi armistizio: pace con i nemici, guerra con GER (→ sì) |
| Cambi di campo (ago–set 1944) | 1944–1945 | ROU, BGR, FIN | truppe sovietiche nelle loro province | pace con SOV e guerra a GER (ROU, BGR) o armistizio (FIN); cambi di capo (Michele I, Georgiev) |
| Fine del Reich (30/4/1945) | 1945 | GER | Berlino in mano nemica | capo Dönitz, resa |

Regola generale, non legata a una data: una nazione che perde la capitale ma ha ancora province (o è in guerra con un alleato) forma un **governo in esilio** con il suo capo storico, se ne ha uno (Polonia, Paesi Bassi, Norvegia, Belgio, Grecia, Jugoslavia, Lussemburgo).

### Cosa serve prima, nel motore

- **Pace** e **patto di non aggressione** nella diplomazia (oggi c'è solo la guerra).
- **Gruppi di province** per gli eventi nella configurazione della mappa.
- **Stato degli eventi** nella partita: accaduti, in attesa di risposta (con scadenza), decaduti.
- **Avanzare fino a uno stop**: una variante di `advance` che si ferma al primo evento che chiede una scelta (o a una minaccia), da usare per il salto.
- Per gli scenari: mappe generate per altre date e un file di scenario (data, guerre e accordi in corso, eventi già accaduti).

---

## Fonti (guide pubbliche della community)

- Combattimento: https://www.playsupremacy.com/en/forums/call-of-war-1942/call-of-war-1942-community-guides-videos/detailed-combat-mechanics-2021-6269bc80
- Province ed edifici: https://www.playsupremacy.com/en/forums/call-of-war-1942/call-of-war-1942-community-guides-videos/7-provinces-and-buildings-946921a0
- Morale e rivolte: https://www.playsupremacy.com/en/forums/call-of-war-1942/call-of-war-1942-questions-and-answers/complete-guide-to-rebellions-and-province-morale-7730c62d
- Economia: https://www.playsupremacy.com/en/forums/call-of-war-1942/call-of-war-1942-community-guides-videos/detailed-economy-military-management-guide-585f1dac
- Risorse: https://www.playsupremacy.com/en/forums/call-of-war-1942/call-of-war-1942-general-discussion/guide-to-collecting-and-managing-resources-e0c9dc0e
- Note di versione 1.5: https://www.playsupremacy.com/en/forums/call-of-war-1942/call-of-war-1942-news/call-of-war-1-5-mechanics-new-balancing-f503c68b
- Province urbane/rurali 1.5: https://www.playsupremacy.com/en/forums/call-of-war-1942/call-of-war-1942-news/call-of-war-1-5-urban-provinces-new-buildings-3ffe0299

## Da decidere

- Includere unità speciali/atomiche?
- Mercato tra giocatori nella prima versione?
- Soglia di punti vittoria di default.
- Valori numerici di ogni unità (prossimo passo: `/shared/data/units.ts`).
