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
- **Terreni**: città, pianura, collina, foresta, montagna (la costa e il mare arriveranno con la marina). Un solo terreno per provincia, più la zona di città nelle province urbane; bonus e penalità per tipo di unità: vedi §9, "Terreno".

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
  - **Caserma**: fanteria, fanteria motorizzata (con i camion, quindi più beni), genio, sanità.
  - **Fabbrica di mezzi corazzati**: carri, autoblindo (escono con l'equipaggio).
  - **Fabbrica di artiglieria**: artiglieria, anticarro, antiaerea.
  - **Fabbrica aeronautica** e **cantiere navale** (solo città costiere): si costruiscono già, produrranno con aviazione e marina.
  - Senza l'edificio giusto non si arruola. Ogni livello oltre il primo riduce del **15%** i tempi di arruolamento nella provincia.
- **Ovunque**:
  - **Industria**: +25% per livello di tutto ciò che la provincia produce: risorsa principale (anche il petrolio dei giacimenti) e denaro; la manodopera cresce solo con l'ufficio di reclutamento. Prima (fino al 25/10/2026) i giacimenti non crescevano e davano solo +10% di denaro: alcune economie faticavano troppo.
  - **Ufficio di reclutamento**: +25% di manodopera per livello.
- **Città, economia**: **impianto di carburante sintetico** (1–3): ogni livello trasforma 500 di metallo in 250 di petrolio al giorno (vedi §3).
- **Genio** (lavoro di un'armata con il genio, ferma in una propria provincia; si paga all'inizio, si recupera interrompendo):
  - **Fortificazioni** (1–3): chi difende nella provincia subisce il 15% di danni in meno per livello.
  - **Aeroporto** e **porto** (solo province costiere): serviranno con aviazione e marina.
  - La durata si divide per il numero di unità del genio (massimo 3).
- **Edifici iniziali**: capitale con caserma 2, fabbrica di mezzi corazzati 1 e fabbrica di artiglieria 1; le altre città con caserma 1.
- **Cambio di padrone** (conquista o rivolta): ogni edificio perde un livello; quelli al livello 1 sono distrutti. Costruzione in corso e coda di arruolamento si perdono.

### Interfaccia degli edifici (deciso il 25/10/2026)

- Nel pannello "Edifici" ogni edificio mostra il suo **effetto per livello** (industria +25% di tutto ciò che la provincia produce tranne la manodopera, ufficio di reclutamento +25% di manodopera, fortificazioni −15% di danni in difesa, caserme e fabbriche −15% sui tempi di arruolamento, porto +1.500 di capacità di importazione…) e, provincia per provincia, **cosa cambierebbe** con il livello successivo (per esempio "Metallo: +639 al giorno, da 2.559 a 3.199").

## 6. Ricerca

- Albero diviso per categoria (fanteria, corazzati, artiglieria, aerei, navi, speciali).
- Ogni ricerca sblocca un'unità o il suo **livello successivo**. I livelli si sbloccano per **giorno di partita** (es. livello 2 dal giorno 3), così la progressione è uguale per tutti.
- Al massimo **due ricerche contemporanee**. Costo e durata crescono per livello.
- Le unità già costruite **non** si aggiornano da sole: si produce la nuova versione (o si paga un aggiornamento in risorse, opzionale).
- Un'unità al livello massimo vale circa **4–6x** in combattimento e **2–3x** in costo rispetto al livello 1.

## 7. Unità

### Classi di armatura (bersaglio)
Fanteria, Corazzato leggero, Corazzato pesante, Aereo, Nave, Sottomarino, Edificio.

### Scheda dell'unità (deciso il 25/10/2026, da realizzare a passi)
Ogni unità avrà:
- **Attacco e difesa** contro: non corazzati, armatura leggera, armatura pesante, aerei, navi, sottomarini, edifici.
- **Danno al morale della provincia** contesa: bombardamenti aerei e artiglieria lo abbassano molto. Una provincia molto bombardata cade più facilmente e si ribella più facilmente.
- **Costo** di produzione, **tempo** e **mantenimento** al giorno.
- **Terreno**: per ogni tipo, un effetto sulla velocità e uno sulla forza (es. fanteria in montagna più lenta ma +30% di forza). Il terreno è **semplificato e per provincia**, assegnato con realismo: vedi §9, "Terreno".
- Classi: **non corazzati** (fanteria, motorizzata, genio, sanità, artiglieria, antiaerea), **armatura leggera** (autoblindo, carro leggero), **armatura pesante** (carri medi e pesanti, in arrivo con l'elenco completo).
- Più avanti: **morale dell'armata**, legato anche ai generali (alcuni tengono alto il morale meglio di altri). I **livelli** delle unità arriveranno con la ricerca.

**Interfaccia (fatta il 25/10/2026)**: nel pannello Produzione una striscia di 5 riquadri (Fanteria, Corazzati, Artiglieria, Aeronautica, Marina); per ogni unità una riga con il riquadro dell'immagine, i costi (solo icone e numeri), il tempo e il tasto Arruola (elenco delle città, evidenziate sulla mappa). Toccando la riga si apre la **scheda** in una colonna al centro: immagine storica dell'unità (in arrivo), descrizione, tabella di combattimento (le voci non ancora definite hanno un trattino), caratteristiche, terreno, costi.

### Statistiche di ogni unità
- **Punti salute**
- **Danno offensivo** e **danno difensivo** *contro ciascuna classe di armatura*
- **Classe di armatura** propria
- **Velocità** (km/h), che cambia con il terreno
- **Raggio visivo** e, per le unità a distanza, **gittata**
- **Costo** (risorse + manodopera + denaro), **tempo di produzione**, **mantenimento giornaliero**
- Flag: *ricognizione* (rivela unità stealth), *stealth*, *ignora bonus difensivi*, *antiaereo*
- **Effetti del terreno** su velocità e forza

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
- Il terreno rallenta la marcia (§9, "Terreno"). Le unità sotto il 50% di salute vanno più lente.
- **Mare**: le unità terrestri diventano **trasporti** (imbarco/sbarco 3–4 ore, ridotto dalla base navale). Il mare è già nella rete di movimento (vedi "Marina" qui sotto).
- **Aerei**: hanno una portata; oltre quella atterrano e proseguono via terra come convoglio (vedi "Aviazione" in §9).

### Marina (iniziata il 26/10/2026)
Passi, ognuno giocabile da solo:
1. ✅ **Il mare sulla mappa**: celle navigabili sulla stessa griglia da 0,1° delle armate; **30 zone di mare** con un nome (Atlantico settentrionale, Mare del Nord, Baltico centrale, Tirreno, Egeo, Mar Nero, Caspio…) disegnate con un tratteggio leggero e il nome in corsivo; **stretti e canali** che si potranno chiudere (Gibilterra, Øresund, Grande e Piccolo Belt, canale di Kiel, Bosforo, Dardanelli, Messina, Kerč), controllati da chi tiene le rive; un **approdo** per ogni provincia costiera; rotte navali più brevi che girano intorno alla terra senza tagliare gli istmi (`shared/src/nav/sea.ts`). La terra fuori gioco (Africa, Medio Oriente) si vede in grigio sabbia, così le coste sono chiare.
2. ✅ **Navi e flotte**: si costruiscono nel cantiere navale (città costiere) ed escono in una flotta ormeggiata nel porto della città. La flotta naviga alla velocità della nave più lenta per la rotta più breve; gli stretti sono chiusi a chi è in guerra con il padrone di una delle rive. All'approdo di una provincia propria, o di chi concede il passaggio (o alleata), si ormeggia; nello stesso porto le flotte si uniscono. Ordini: **Naviga** (si tocca un punto di mare o una provincia costiera: si va al suo approdo), **Ferma**; nel pannello i porti vicini. Le flotte vedono intorno a sé come le armate e costano il mantenimento. Valori di partenza (velocità di crociera; il combattimento conterà dal passo 3):

   | Nave | km/h | Vista | Punti vita | Gittata | Navi (att./dif.) | Sottomarini | Contraerea | Costa (non corazz./legg./pes.) | Tempo |
   |---|---|---|---|---|---|---|---|---|---|
   | Sottomarino | 25 | 15 | 25 | — | 6 / 1 | 1 / 1 | 0,2 | — | 30 h |
   | Cacciatorpediniere | 40 | 25 | 35 | 12 km | 3 / 3 | 6 / 5 | 2 | 1 / 0,5 / 0,25 | 30 h |
   | Incrociatore | 35 | 30 | 60 | 20 km | 6 / 6 | 1 / 2 | 3 | 3 / 2 / 1 | 60 h |
   | Nave da battaglia | 30 | 30 | 120 | 30 km | 12 / 12 | 0 / 1 | 3 | 6 / 4 / 3 | 120 h |
   | Portaerei | 32 | 40 | 80 | — | 0,5 / 2 | 0 / 1 | 2 | — (i suoi aerei) | 120 h |

   Costi e mantenimento in `shared/src/data/naval.ts`. Le flotte iniziali delle nazioni (la Royal Navy del 1933…) sono da decidere.
3. ✅ **Combattimento navale** (a ogni tick di combattimento, 30 minuti, senza casualità: limite di gruppo ed efficienza per salute come a terra):
   - **Tra flotte**: ogni flotta spara alla flotta nemica più vicina che raggiunge; ogni nave arriva fin dove dice la sua gittata (almeno 5 km, la distanza di contatto: siluri e armi leggere). In navigazione valgono i valori d'attacco, da ferma quelli di difesa; contro i sottomarini i valori "Sottomarini". Le flotte non si fermano da sole al contatto: chi vuole intercettare naviga verso il nemico.
   - **Contro la costa**: senza flotte nemiche a tiro, le navi con i cannoni colpiscono l'armata nemica più vicina entro la gittata. L'artiglieria a terra, ferma e in batteria e senza armate nemiche a tiro, risponde alle navi di superficie entro la sua gittata (i sottomarini da terra non si colpiscono).
   - **Aerei contro navi**: l'attacco aereo si può ordinare anche su una flotta; prima spara la contraerea delle navi (della flotta e delle altre flotte vicine della stessa nazione), poi gli aerei colpiscono con i valori "Navi" (o "Sottomarini"). L'aerosilurante è l'arma migliore.
   - **Portaerei**: base mobile per caccia, bombardieri tattici e aerosiluranti, al massimo **8 aerei** per portaerei. Ci si trasferisce come in un aeroporto (dal pannello della squadriglia o toccando la flotta sulla mappa); gli aerei navigano con lei e, se si è spostata durante il volo, la inseguono finché la portata basta. Se la portaerei affonda, gli aerei a bordo vanno persi.
   - **Riparazioni**: una flotta ormeggiata in un proprio porto e non colpita recupera il 3% dei punti vita a ogni tick.
   - Notizie: battaglia navale (solo all'inizio di uno scontro), flotta affondata, attacchi aerei sulle navi.
4. ✅ **Sottomarini e nebbia sul mare**: le flotte si vedono come le armate (entro la vista delle proprie forze, o in un porto visibile). Una flotta di soli sottomarini fuori dal porto è **in immersione**: il nemico non la vede e non la può colpire (né con le navi, né con gli aerei) finché non la scopre: un **cacciatorpediniere entro 15 km**, un **aereo in volo** che sa cercarli (ricognitore 30 km, aerosilurante 15, bombardiere tattico 10), oppure per **un'ora dopo che ha attaccato** (il primo colpo è senza risposta). In porto i sottomarini stanno in superficie. Una flotta mista si vede come tutte le altre. Sulla mappa la flotta di soli sottomarini ha la sua sagoma e, in immersione, il gettone velato.
   Le flotte della stessa nazione che arrivano entro **5 km** l'una dall'altra (la distanza del combattimento) si uniscono, in porto come in mare aperto. La portaerei porta al massimo **8 aerei** (un aereo del gioco vale un gruppo di circa una decina: l'Ark Royal ne aveva 50–60, l'Illustrious 36, le grandi portaerei giapponesi e americane 70–90).
5. ✅ **Trasporti e sbarchi** (automatici): se la meta di "Muovi" o "Attacca" non si raggiunge via terra, l'armata va per mare. Marcia fino al **porto d'imbarco** più conveniente (un approdo proprio o di chi concede il passaggio; si sceglie il viaggio complessivo più breve), si **imbarca** (3 ore, 2 con un porto o un cantiere navale), naviga come **trasporto** a **25 km/h** fino al tratto di costa più vicino alla meta (mai in un paese terzo), **sbarca** (4 ore su una costa aperta, 2 nel porto attrezzato di una provincia amica) e prosegue a piedi. Il trasporto non spara: in mare lo colpiscono navi e aerei nemici (il danno va alle unità a bordo; se muoiono tutte, l'armata è distrutta), e durante l'imbarco e lo sbarco anche le **armate nemiche entro 5 km** dal punto a terra, senza risposta: sbarcare su una costa difesa costa caro. Una scorta di navi da guerra vicina combatte per lui. Notizie: sbarco completato, sbarco nemico nel proprio territorio.
6. **Economia del mare**: blocco navale delle importazioni via mare; convogli degli aiuti (Murmansk) e degli sbarchi della partita storica, intercettabili.

### Stato attuale (milestone 3 e 4)
- Unità disponibili: fanteria, fanteria motorizzata, autoblindo, carro leggero, artiglieria, anticarro, antiaerea, genio, sanità (valori in `shared/src/data/units.ts` e nella tabella del §9). Ogni unità ha un valore di **contraerea**.
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
- **Bonus**: terreno (§9, "Terreno"), fortificazioni/bunker (es. -38% di danno subito al livello 1), livello dell'unità.
- **Unità a distanza** (artiglieria, navi): attaccano entro la gittata ogni 30 minuti; il bersaglio risponde solo se ha gittata sufficiente; sotto i 5 km diventa combattimento ravvicinato.
- **Aerei**: vedi "Aviazione" qui sotto. Le unità di terra/mare rispondono con i valori antiaerei difensivi; gli aerei subiscono prima la difesa, poi infliggono danno.
- **Danni agli edifici**: attaccare un'unità al centro di una provincia danneggia anche gli edifici (fortificazioni bersaglio più probabile).

### Aviazione (deciso il 25/10/2026, da realizzare)

**Portata.** Ogni tipo di aereo ha una sola **portata P**, uguale per tutte le nazioni: la distanza massima in linea d'aria di un volo di trasferimento. Per attaccare e pattugliare bisogna tornare, quindi il **raggio d'azione è P/2**. In volo fiumi e confini non contano e si sorvola anche il territorio nemico. Le portate partono da quelle storiche degli aerei della RAF, ridotte di circa il 10% per la mappa europea (il realismo resta la priorità).

| Tipo | Riferimento RAF (autonomia storica) | Portata | Raggio d'azione | Velocità | Rifornimento | Compito |
|---|---|---|---|---|---|---|
| **Caccia** | Spitfire I, Hurricane I (~700 km) | 630 km | 315 km | 450 km/h | 30 min | intercetta, scorta, pattuglia |
| **Bombardiere tattico** | Fairey Battle, Blenheim IV (1.600–2.300 km) | 1.450 km | 725 km | 350 km/h | 30 min | colpisce le armate |
| **Aerosilurante** | Swordfish, Beaufort (850–2.600 km) | 1.600 km | 800 km | 300 km/h | 45 min | navi (con la marina) |
| **Bombardiere strategico** | Wellington (~2.550 km; Lancaster ~4.000 km, poi con la ricerca) | 2.300 km | 1.150 km | 300 km/h | 45 min | edifici e città |
| **Ricognitore / pattugliatore marittimo** | Hudson, Sunderland (~3.000 km) | 2.700 km | 1.350 km | 300 km/h | 45 min | vista ampia, attacco debole |

Al massimo 5 tipi. I valori staranno in un file di bilanciamento (`shared/src/data/`).

**Basi.**
- Gli aerei partono e atterrano negli **aeroporti** propri e degli **alleati** (con l'alleanza si condividono). Anche la città con la **fabbrica aeronautica** vale come aeroporto, così un aereo appena costruito ha già una base.
- Nessun limite di aerei per aeroporto. I **livelli dell'aeroporto** riducono solo i tempi di tutte le operazioni a terra (rifornimento, riparazione).

**Squadriglie.** Gli aerei formano squadriglie separate dalle armate di terra; si possono mischiare i tipi (bombardieri con la scorta dei caccia). La squadriglia va alla velocità del più lento e ha la portata più corta.

**I tre ordini.**
1. **Spostamento**: se la destinazione è entro la portata, la squadriglia ci vola. Altrimenti atterra nell'aeroporto **più vicino alla destinazione** tra quelli raggiungibili e prosegue come **convoglio** alla velocità dell'artiglieria (18 km/h), con lo stesso percorso delle truppe di terra (territorio proprio o con diritto di passaggio) e, a scelta del giocatore, anche in **treno**. Quando il convoglio entra in una provincia con un aeroporto da cui la destinazione è più vicina, decolla di nuovo e il processo si ripete. Se non c'è nessun aeroporto raggiungibile l'ordine viene rifiutato con il motivo. Il convoglio è **vulnerabile**: senza difesa, viene distrutto se un'armata nemica lo raggiunge.
2. **Attacco**: lo decide **sempre il giocatore**, mai in automatico (un'armata forte contro gli aerei può distruggere l'aviazione). Bersaglio: un'armata nemica entro il raggio d'azione. La squadriglia vola sul bersaglio, subisce la contraerea, sgancia una volta (danno senza casualità, come a terra) e torna alla base. Se il bersaglio si sposta lo insegue finché resta entro il raggio, altrimenti rientra.
   - **Attacco ordinato a una squadriglia in volo** (deciso il 25/10/2026): l'ordine si può dare anche mentre vola (in trasferimento, in pattuglia o di ritorno). Se con la portata rimasta arriva al bersaglio e poi a una base, cambia rotta e attacca subito. Altrimenti la rotta si ricalcola per arrivarci: atterra nella base raggiungibile più vicina al bersaglio, si rifornisce e poi decolla per l'attacco (se serve, prosegue come convoglio fino a una base più vicina, come nello spostamento). L'ordine resta valido finché il bersaglio esiste ed è nemico; altrimenti decade e la squadriglia resta (o rientra) alla base.
   - **Bersaglio in movimento**: la squadriglia lo insegue solo finché resta nel raggio d'azione; se ne esce, l'attacco decade e la squadriglia rientra alla base (così non finisce lontano dalla zona che il giocatore voleva presidiare). Il ricalcolo della rotta vale solo al momento dell'ordine.
   - **Niente missioni di sola andata**: dopo l'attacco la squadriglia deve sempre poter raggiungere una base con la portata rimasta (la più vicina al bersaglio, non per forza quella di partenza); un attacco che non lo permette non si può ordinare.
3. **Pattugliamento**: su un punto entro il raggio d'azione, la squadriglia gira in un **cerchio di 60 km di raggio** (circa una provincia) per **25 minuti**, poi rientra. Attacca da sola solo le armate e gli aerei delle **nazioni in guerra con te**; dopo un attacco torna alla base. È il modo in cui i caccia intercettano i bombardieri nemici.

**A terra: rifornimento e riparazione.**
- Il **rifornimento** non costa nulla (è compreso nel mantenimento, che per gli aerei include petrolio): 30 minuti, 45 per gli aerei a lunga portata.
- Un aereo danneggiato si può **riparare** o usare così com'è: decide il giocatore. La riparazione costa beni e manodopera in proporzione al danno e aggiunge tempo (valori da definire).

**Stato attuale (primo passo, 25/10/2026).** Nel motore (`shared/src/game/air.ts`, valori in `shared/src/data/air.ts`):
- i 5 tipi con portata, velocità, rifornimento, costi, tempi di costruzione e mantenimento (con petrolio);
- gli aerei si costruiscono nelle città con la fabbrica aeronautica ed escono in una **squadriglia** a terra lì;
- **trasferimento** da una base all'altra entro la portata (ordine `fly`), in linea retta, poi rifornimento; l'aeroporto arriva al livello 3 e ogni livello oltre il primo toglie il 15% ai tempi a terra;
- se la base d'arrivo non è più utilizzabile la squadriglia ripiega sulla base più vicina che raggiunge con la portata rimasta; lo stesso per gli aerei a terra in una base conquistata o non più alleata; senza una base raggiungibile la squadriglia va persa.
- **Interfaccia**: gli aerei si costruiscono dal pannello Produzione (categoria Aeronautica); le squadriglie compaiono sulla mappa accanto alla base (in volo lungo la rotta); il pannello della squadriglia mostra stato, composizione e mantenimento, e con "Vola" si tocca sulla mappa una delle basi evidenziate entro il cerchio della portata (oppure si sceglie dall'elenco).
- **Attacco** (25/10/2026): pulsante "Attacca" nel pannello della squadriglia, poi si tocca un'armata nemica (solo nazioni in guerra). Vale anche in volo: la squadriglia cambia rotta se il bersaglio è nel raggio d'azione da dove si trova e dopo può arrivare a una base; altrimenti fa scalo (con rifornimento) nelle basi necessarie e decolla da quella abbastanza vicina. Mira al punto dove il bersaglio sarà al suo arrivo; se il bersaglio cambia strada lo insegue solo dentro il raggio d'azione, poi l'attacco decade e rientra. Un solo passaggio: prima spara la **contraerea** (somma di quella del bersaglio e delle armate della stessa nazione entro 5 km, con limite di gruppo ed efficienza per salute; colpisce prima l'aereo più malconcio), poi gli aerei rimasti colpiscono con i loro valori d'attacco (limite di gruppo, efficienza per salute, fortificazioni). Dopo l'attacco rientro alla base più vicina e rifornimento. L'attacco si può annullare. Valori d'attacco: caccia 1,5/0,5, bombardiere tattico 6/5, aerosilurante 2/1,5, strategico 4/3, ricognitore 0,5/0,25 (contro fanteria/corazzati).
- Prossimi passi: pattuglia (con l'intercettazione tra caccia), spostamento verso un punto qualsiasi con il convoglio (anche per gli attacchi fuori portata), unire e dividere le squadriglie, riparazioni.

### Stato attuale (milestone 4)
- **Guerra**: si può dichiarare guerra dal pannello di una provincia straniera, oppure entrare senza accordi nel suo territorio: in quel caso è il padrone di casa a dichiarare guerra. Con un accordo (diritto di passaggio o visione condivisa) non succede nulla. Pace e accordi si potranno negoziare con la diplomazia vera (milestone 6); prima di entrare in un paese neutrale l'interfaccia chiede conferma.
- **Controlli ogni 5 minuti** a orari fissi: ingresso nei territori, contatti, conquiste, arrivi. Tra un controllo e l'altro ogni armata si considera in moto rettilineo; gli orari fissi fanno sì che il risultato non dipenda da quante volte si fa avanzare la partita.
- **Contatto**: due armate nemiche che arrivano entro 5 km si fermano. Chi marciava con l'ordine **Attacca** va all'**assalto** (valori offensivi); con **Muovi** si ferma e **difende**, come chi era già fermo (valori difensivi). Durante la marcia si usano i valori offensivi. Vinto lo scontro, l'armata fermata riprende da sola la marcia interrotta.
- **Bersaglio**: ogni armata colpisce l'armata nemica più vicina; i danni del tick si calcolano tutti insieme sullo stato di inizio tick.
- **Classi di armatura**: non corazzati (fanteria, motorizzata, artiglieria, anticarro, antiaerea, genio, sanità), armatura leggera (autoblindo, carro leggero), armatura pesante (carro pesante). Valori in `shared/src/data/units.ts`, parametri in `shared/src/data/combat.ts`.
- **Tiro a distanza** (artiglieria, gittata 12 km): un'armata ferma da almeno 30 minuti (messa in batteria) e non a contatto colpisce a ogni tick l'armata nemica più vicina entro la gittata, con i valori d'attacco delle sole unità a gittata, senza risposta. Le fortificazioni del bersaglio contano. Chi è sotto il fuoco non guarisce. A contatto l'artiglieria combatte normalmente, con i valori di difesa se è ferma.
- **Morale della provincia**: il tiro dell'artiglieria e gli attacchi aerei tolgono punti di morale alla provincia dove si trova il bersaglio (se non è di chi spara), con il limite di gruppo e l'efficienza per salute; da soli non lo portano sotto il **20%** (la storia insegna che i bombardamenti non spezzano il morale: il resto lo fanno conquista e accerchiamento). Gli effetti del morale basso nelle province di casa arriveranno con generali, capi di stato ed eventi storici.
- **Guarigione**: vedi §8, "Lavori sul campo".
- **Terreno**: ogni armata combatte con l'effetto del terreno dove si trova (vedi "Terreno" qui sotto).
- Non ancora: generali, morale dell'armata.

Valori decisi il 25/10/2026: attacco / difesa ogni 30 minuti di combattimento, contro non corazzati, armatura leggera e armatura pesante.

| Unità | Classe | Salute | Non corazzati | Armatura leggera | Armatura pesante | Contraerea | Altro |
|---|---|---|---|---|---|---|---|
| Fanteria | non corazzata | 15 | 2 / 3 | 1 / 1,5 | 0,5 / 0,75 | 0,5 | edifici 0,25 |
| Fanteria motorizzata | non corazzata | 15 | 2,5 / 3,5 | 1,25 / 1,75 | 0,75 / 1 | 0,5 | edifici 0,25 |
| Autoblindo | armatura leggera | 12 | 4 / 2,5 | 1,75 / 1,25 | 0,75 / 0,75 | 1 | edifici 0,25 |
| Carro leggero | armatura leggera | 20 | 3,5 / 2 | 2,5 / 2 | 1 / 0,75 | 0,5 | edifici 0,5 |
| Carro pesante | armatura pesante | 30 | 3 / 3 | 3 / 3 | 3 / 3 | 0,5 | edifici 1; 22 km/h, 20 ore, costa il doppio del leggero |
| Artiglieria | non corazzata | 10 | 3 / 4 | 1,5 / 3 | 1 / 2 | 0,5 | gittata 12 km, navi 1 / 1, edifici 2, morale 0,1 |
| Anticarro | non corazzata | 10 | 1,5 / 3 | 2 / 4 | 1,5 / 4,5 | 0,5 | — |
| Antiaerea | non corazzata | 10 | 1 / 2,5 | 0,5 / 2 | 0,5 / 2 | 4 | — |
| Genio | non corazzata | 12 | 1 / 1,5 | 0,5 / 0,75 | 0,25 / 0,5 | 0,25 | edifici 1 |
| Sanità | non corazzata | 10 | 0,5 / 1 | 0,25 / 0,5 | 0 / 0,25 | 0 | — |

Aerei (danni per attacco; contro gli aerei attacco / difesa):

| Aereo | Non corazzati | Armatura leggera | Armatura pesante | Aerei | Navi | Sottomarini | Edifici | Morale |
|---|---|---|---|---|---|---|---|---|
| Caccia | 1,5 | 0,5 | 0,25 | 3,5 / 3 | 0,5 | — | 0,5 | 0,1 |
| Bombardiere tattico | 6 | 5 | 3 | 0 / 1 | 2 | 0,5 | 3 | 0,3 |
| Aerosilurante | 2 | 1,5 | 1 | 0 / 1 | 8 | 2 | 1 | 0,2 |
| Bombardiere strategico | 4 | 3 | 2 | 0 / 2 | 1 | — | 8 | 1 |
| Ricognitore | 0,5 | 0,25 | 0 | 0 / 0,5 | 0,5 | 1 | 0,25 | — |

Navi, sottomarini, edifici e combattimento tra aerei sono già nei dati ma conteranno con la marina, i bombardamenti degli edifici (20 punti di integrità per livello: a zero l'edificio perde un livello, il genio lo ripara pagando) e l'intercettazione.

Esempio: l'armata di una capitale (3 fanterie + 1 artiglieria) che assalta un'armata uguale in difesa perde, dopo alcune ore di combattimento: chi difende è avvantaggiato.

### Terreno (deciso e fatto il 25/10/2026)

**Un solo terreno per provincia**, più la **zona di città**: nelle province urbane, entro 10 km dal centro, il terreno è "Città"; il resto della provincia ha il suo terreno naturale (Torino è città intorno al capoluogo, montagna fuori). Non si spezzano le province: dove sono miste vale il terreno dove si combatterebbe davvero.

**Come è assegnato** (`data/scripts/build-terrain.ts`, parametri e correzioni in `data/maps/europe-1933/terrain.config.json`):
- **Rilievo** da dati di altitudine reali (~1 km): in ogni cella di 0,1° (~10 km) il dislivello; sotto 120 m è piana, da 450 m montuosa, in mezzo collinare.
- **Foreste** dalla copertura del suolo MODIS (NASA), quella di oggi: va bene per le grandi foreste (Finlandia, Baltico, Russia del nord, Ardenne), con correzioni a mano dove il bosco è recente.
- Provincia **montuosa** se almeno il 45% delle celle lo è; altrimenti **foresta** se il bosco copre almeno il 45%; altrimenti **collinare** se almeno metà delle celle è collinare o montuosa; altrimenti **pianura**.
- Correzioni a mano, con il motivo: Milano pianura (la provincia arriva alle Alpi ma si combatte in pianura padana), Catania collina, Galizia collina (gli eucalipti sono del dopoguerra), Landes foresta, Ardenne foresta, Malmö pianura (la Scania), Brest foresta (le paludi della Polesia).
- Risultato: 72 province di montagna, 103 di collina, 119 di pianura, 67 di foresta, più le zone di città.

**Effetti** (`shared/src/data/terrain.ts`): velocità come percentuale di quella normale · forza (attacco e difesa insieme).

| Unità | Città | Pianura | Collina | Foresta | Montagna |
|---|---|---|---|---|---|
| Fanteria, genio, sanità | 100% · +25% | 100% · — | 85% · +15% | 80% · +20% | 65% · +30% |
| Fanteria motorizzata | 100% · +10% | 100% · — | 80% · +10% | 70% · +10% | 55% · +15% |
| Autoblindo | 90% · −25% | 100% · +10% | 75% · −10% | 55% · −25% | 45% · −35% |
| Carro leggero | 85% · −20% | 100% · +15% | 80% · — | 60% · −20% | 50% · −30% |
| Carro pesante | 80% · −20% | 100% · +10% | 75% · — | 55% · −25% | 40% · −35% |
| Artiglieria | 100% · −15% | 100% · +10% | 80% · +10% | 70% · −15% | 55% · — |
| Anticarro | 100% · +15% | 100% · — | 80% · +10% | 70% · +15% | 55% · +10% |
| Antiaerea | 100% · — | 100% · — | 80% · — | 70% · −10% | 55% · −10% |

- **Velocità**: il calo vale per intero fuori strada e a metà su strada; il treno non cambia. Un'armata va, su ogni terreno, alla velocità dell'unità più lenta lì. Il percorso automatico ne tiene conto (evita le montagne se c'è una strada migliore).
- **Forza**: ogni armata combatte (anche a distanza) con l'effetto del terreno del punto dove si trova.
- **Aerei**: non risentono del terreno, ma contro un'armata in foresta fanno il 25% di danno in meno.
- Cambia la regola di prima ("solo bonus, mai penalità"): i mezzi corazzati sono penalizzati in città, foresta e montagna.
- Più avanti: valichi come passaggi obbligati, truppe da montagna, generali con bonus su un terreno.

### Nebbia di guerra (deciso e fatto il 26/10/2026)
- **Cosa si vede**: le proprie province (anche quelle appena conquistate), la provincia dove sta ogni propria armata o squadriglia a terra, e tutto quello che sta entro la **vista** delle proprie armate (l'unità che vede più lontano) e degli aerei in volo. Le province confinanti restano nella nebbia: per vedere oltre il confine serve un'armata o un aereo. Calcolo nel motore (`shared/src/game/vision.ts`), così il server potrà mandare a ogni giocatore solo quello che vede.
- **Vista per unità** (`sightKm`, nella scheda): autoblindo 40 km; motorizzata, carro leggero e artiglieria (osservatori) 20 km; fanteria, carro pesante, antiaerea e genio 15 km; anticarro e sanità 10 km. Aerei in volo: caccia e aerosilurante 50 km, bombardieri 40 km, ricognitore 150 km.
- **Mappa condivisa** (o alleanza): si vede anche tutto quello che vede l'altra nazione.
- **Nella nebbia**: proprietario e morale delle province sono noti (come dai giornali); armate, squadriglie, edifici, costruzioni e lavori (ponti distrutti, ponti di barche, ospedali) no. L'arruolamento si vede solo nelle province proprie o di chi condivide la mappa.
- **Armate nemiche avvistate**: si vedono sulla mappa, ma la composizione (unità, salute, forza) solo con una propria armata entro **15 km**.
- Le province nella nebbia hanno un velo grigio in tutte le modalità della mappa.

### Modalità della mappa (deciso e fatto il 26/10/2026)
- Selettore in alto a sinistra, accanto allo zoom (sul telefono lo zoom è a destra); la scelta resta salvata nel browser.
- **Politica**: colori delle nazioni, semitrasparenti sopra il rilievo (lo stesso per morale e diplomazia).
- **Mappa base del rilievo**, sempre sotto: immagine generata da altitudine e copertura del suolo reali (`data/scripts/build-relief.ts`): boschi verdi, campi e prati verde chiaro, zone aride ocra, tundra grigio-verde; salendo di quota roccia e, sulle vette più alte, neve; un'ombreggiatura leggera da nord-ovest su un'altitudine ammorbidita (si vedono le grandi catene, non ogni montagna). Solo grafica: il terreno di gioco delle province non cambia.
- **Rilievo**: la mappa base pulita, con i soli confini.
- **Morale**: tutte le province, dal rosso mattone (0%) all'ocra (50%) al verde salvia (100%); il tooltip mostra il valore.
- **Diplomazia**: grigio neutro; la propria nazione in azzurro chiaro, chi condivide la mappa (o è alleato) in verde salvia, tregua in ocra, guerra in rosso spento. Con la nebbia, il proprio blocco risalta sul resto.
- In tutte le modalità: confini delle province sottili e **confini tra stati** marcati (tracciati dove cambia il proprietario); sul mare i confini tratteggiati delle zone di mare e i loro nomi.

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

### Dottrine (deciso il 26/10/2026, da realizzare)
- Quattro dottrine: **Alleati, Nipponici, Nazisti, Comunisti**. Ogni nazione ha quella storicamente più vicina. Per ora cambiano solo le foto delle unità (`icone/icone <dottrina>/`).
- Regola: ogni dottrina ha **un vantaggio e uno svantaggio**, niente di più. Entrambi si devono notare, ma senza esagerare: indicativamente **±15%**, da tarare giocando.
- Lo svantaggio non deve peggiorare un punto già debole dell'economia reale (per esempio il petrolio tedesco), altrimenti la nazione diventa ingiocabile.
- Valori indicativi (da tarare):

| Dottrina | Vantaggio | Svantaggio |
|---|---|---|
| Comunisti | Fanteria più economica (−15% sui costi) | Marina più debole (−15% su attacco e difesa delle navi) |
| Nazisti | Corazzati più forti in attacco (+15%) | Le province conquistate recuperano il morale più lentamente (+3 punti al giorno invece di +5), quindi restano più a lungo a rischio di rivolta |
| Alleati | Commercio: +15% di capacità di importazione dal mercato estero | Arruolamento della fanteria più lento (+15% di tempo) |
| Nipponici | Marina e aviazione navale più forti (+15%) | Carri più deboli (−15% su attacco e difesa dei corazzati) |

- **Dottrina di partenza** (giugno 1933, `shared/src/data/doctrines.ts`):
  - **Nazisti**: Germania, Austria, Città Libera di Danzica, Italia, Ungheria, Romania, Bulgaria.
  - **Comunisti**: Unione Sovietica.
  - **Alleati**: tutte le altre, comprese le neutrali (Irlanda, Svizzera, Svezia, Portogallo, Turchia) e la Spagna, che nel 1933 è la Seconda Repubblica.
  - **Nipponici**: nessuna nazione europea. Le foto sono pronte per quando la mappa si allargherà.
- **La dottrina cambia solo con un evento storico** (§13), quindi solo nella partita storica; nella partita libera resta quella di partenza. Come tutti gli eventi, accade da solo se la nazione è un bot; se è di un giocatore diventa una sua scelta.
- Cambi previsti:
  - **Spagna**: guerra civile (17/7/1936), Repubblica → Comunisti oppure nazionalisti → Nazisti (storico).
  - **Italia**: armistizio (settembre 1943) → Alleati.
  - **Romania e Bulgaria**: cambio di campo (agosto–settembre 1944) → Comunisti.
  - Da valutare più avanti: Francia di Vichy, Finlandia nella guerra di continuazione, Albania occupata, Baltici annessi, Jugoslavia di Tito.
- La nave appoggio per idrovolanti Dédalo, della Repubblica spagnola, fa da portaerei dei Comunisti (l'URSS non ne ebbe mai una).
- Più avanti si deciderà se i generali possono attenuare lo svantaggio o rafforzare il vantaggio.

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
  - **mappa condivisa** (visione condivisa: si vede quello che vede l'altra nazione, vedi "Nebbia di guerra"; le armate possono entrare senza guerra);
  - **diritto di passaggio** (attraversare il territorio dell'altro, anche in treno);
  - **alleanza** (passaggio e mappa condivisa insieme). Non trascina automaticamente in guerra: chi è alleato decide da sé.
- **Embargo**: si decide da soli contro una nazione; niente scambi in borsa con lei e niente importazioni via terra attraverso il suo territorio.
- **Proposte**: scadono dopo **72 ore** di gioco senza risposta; si possono ritirare. Tra giocatori restano in attesa; i **bot** rispondono subito con una frase in chat, con regole provvisorie finché non avranno un comportamento proprio: tregua dopo 24 ore di guerra, pace dopo 3 giorni, mappa condivisa sì, passaggio solo agli alleati, alleanza solo con chi ha un nemico in comune.
- **Chat** tra ogni coppia di nazioni (ultimi 100 messaggi), con le proposte e le risposte nello stesso filo. I bot rispondono alle proposte, non ai messaggi.
- Niente coalizioni ufficiali con classifiche o bonus: l'alleanza è un accordo tra due nazioni.

## 12. Spionaggio (fase successiva, opzionale)

- Spie che rivelano informazioni, sabotano edifici o abbassano il morale, con mantenimento giornaliero.

## 13. Storia: eventi, scenari e salto nel tempo (deciso il 25/10/2026)

La partita parte da una data storica, ma i giocatori possono cambiare la storia. Per questo gli eventi storici (Anschluss, Monaco, patto Molotov-Ribbentrop…) **non sono un copione**: sono **opportunità con condizioni**, che accadono solo se la partita ci arriva in una situazione in cui hanno senso.

### Tipi di partita (deciso il 26/10/2026)

All'inizio, nella **lobby**, chi crea la partita sceglie il tipo e la data di partenza; poi ognuno sceglie la sua nazione (le altre sono bot).

- **Partita storica**: gli eventi di questo capitolo sono attivi e arrivano le **forze fuori mappa** (Stati Uniti, aiuti all'URSS, più avanti il Giappone). La storia spinge, ma ogni evento ha le sue condizioni: se la partita è andata diversamente, l'evento salta. Con un bot l'evento accade da solo; con un giocatore diventa una sua scelta. Solo qui vale l'opzione *storia fedele / storia libera* per le scelte dei bot.
- **Partita libera**: si sceglie l'anno di partenza e da lì decidono solo i giocatori. Niente eventi, niente forze fuori mappa, niente cambi di dottrina; i capi cambiano solo per data quando il cambio non dipende dalla guerra (elezioni, morti naturali).

In entrambi i tipi la partita può partire da una data diversa dal 1933 (vedi "Partire da una data").

**Forze iniziali** (deciso il 26/10/2026):
- **storica**: ogni nazione parte con quello che aveva davvero alla data di partenza (esercito, aviazione, flotta: la Royal Navy del 1933 è enorme, la Germania quasi senza navi);
- **libera**: tutte le nazioni giocate da persone partono con **lo stesso identico esercito** (unità, aerei, navi). Da decidere se metterle anche nelle stesse condizioni economiche.

Ordine di lavoro: la scelta del tipo e della data va prima nella "Nuova partita" della partita locale; la lobby vera, con gli amici che scelgono le nazioni, arriva con il server multigiocatore (milestone 5).

### Forze fuori mappa (solo partita storica)

Potenze senza province sulla mappa (per ora **Stati Uniti**; il **Giappone** se la mappa si allarga, con la dottrina Nipponici; il **Commonwealth** come rinforzi del Regno Unito). Non costruiscono e non hanno economia: agiscono solo con i loro eventi.

- **Sbarchi**: a una data, se le condizioni ci sono, compaiono armate (dottrina Alleati) su un tratto di costa: Sicilia, Salerno, Anzio, Normandia, Provenza. Sono gestite come un bot alleato di chi è in guerra con il bersaglio, e combattono con le regole normali. Finché manca la marina compaiono direttamente sulla spiaggia; con la marina arriveranno con un convoglio che si può intercettare.
- **Forza proporzionata**: la dimensione dello sbarco dipende dalla situazione (quante armate difendono la zona, come va la guerra), così non schiaccia una difesa preparata e non è inutile contro una costa vuota.
- **Condizioni sempre presenti**: gli Stati Uniti sono in guerra solo con chi è in guerra con il Regno Unito o l'URSS dopo Pearl Harbor (7/12/1941); sbarcano in Sicilia solo se l'Italia è in guerra con gli Alleati; in Normandia solo se la Francia del nord è in mano nemica. Se l'Italia è rimasta neutrale, nessuno sbarca in Sicilia.
- **Aiuti**: risorse al giorno (Affitti e prestiti al Regno Unito da marzo 1941, all'URSS da ottobre 1941), finché la nazione è in guerra con la Germania. Con la marina passeranno da porti e convogli che si possono attaccare (Murmansk).
- Chi è il bersaglio (un giocatore o un bot) riceve l'avviso dello sbarco poche ore prima, come un'informazione dello spionaggio.

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

**Opzione della partita storica**: *storia fedele* (i bot scelgono sempre la risposta storica) oppure *storia libera* (i bot scelgono secondo la situazione, quando avranno un comportamento proprio). Gli umani scelgono sempre liberamente.

Gli eventi si controllano a ogni **cambio giorno**, insieme a morale e rivolte. Le risposte sono ordini come gli altri (validati dal server), e le scelte dei bot dipendono solo dallo stato e dal seme della partita: stesse scelte, stessa storia, anche recuperando molte ore in un colpo.

### Capi delle nazioni

- **Per data**: i cambi che non dipendono dalla guerra (elezioni, rimpasti, morti naturali: Piłsudski 1935, Atatürk 1938, Boris III 1943) seguono il calendario, come già fa `leaderAt`.
- **Per evento**: i capi nati dalla guerra arrivano solo con il loro evento: Seyss-Inquart (Anschluss), Pétain (armistizio francese), Antonescu (abdicazione di Carlo II), Badoglio (caduta di Mussolini), Dönitz (fine del Reich), i governi in esilio, Szálasi, ecc. Se l'evento non accade, resta il capo precedente e i cambi per data successivi di quella nazione si fermano dove la storia ha preso un'altra strada.

### Partire da una data (scenari)

- A inizio partita si sceglie la data dal calendario. La partita parte con la situazione storica di quel giorno: **confini** (si parte dalla mappa del 1933 e si applicano in automatico gli eventi storici accaduti fino a quella data, con le risposte storiche: è lo stesso codice del salto nel tempo; CShapes, che ha i confini giorno per giorno, serve da controllo), **capi** in carica, **guerre e accordi** in corso, eventi già accaduti (che non si ripetono).
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

### Eventi della partita storica (1933–1945)

Le province coinvolte (Sudeti, Memel, Carelia, Bessarabia, Renania…) si definiranno come gruppi nella configurazione della mappa. Tra parentesi la data storica; "→" indica la risposta storica, quella che scelgono i bot con la storia fedele. Molti eventi sono **spinte storiche per i bot**: un giocatore umano può sempre rifiutare.

Nazioni nuove (Slovacchia, Croazia, Repubblica Sociale Italiana, Francia di Vichy): per ora le loro province passano a chi le controllava storicamente (Germania, Italia, Ungheria); più avanti potranno diventare nazioni bot vere.

**1933–1936: verso il riarmo**

| Evento | Finestra | Coinvolti | Condizioni principali | Scelte ed effetti |
|---|---|---|---|---|
| Patto tedesco-polacco (26/1/1934) | 1934–1938 | GER propone, POL riceve | non in guerra | accetta → non aggressione (decade con la crisi di Danzica) (→ sì) |
| Putsch di luglio in Austria (25/7/1934) | lug–dic 1934 | GER, AUT, ITA | AUT indipendente | i nazisti austriaci uccidono Dollfuss, capo Schuschnigg; ITA sceglie se schierare armate al Brennero (→ sì): GER non può proporre l'Anschluss per 1 anno |
| Plebiscito della Saar (13/1/1935) | gen–dic 1935 | GER | la Saar non è tedesca (se è sulla mappa come zona a parte) | la Saar passa a GER |
| Riarmo tedesco (16/3/1935) | 1935–1936 | GER, poi GBR, FRA, ITA | — | GER sceglie la coscrizione (→ sì): più manodopera, morale −5 nelle nazioni vicine; GBR, FRA e ITA scelgono il fronte di Stresa (→ sì): accordo tra loro per 1 anno |
| Patto franco-sovietico (2/5/1935) | 1935–1937 | FRA propone, SOV riceve | non in guerra | accetta → visione condivisa e garanzia reciproca contro GER (→ sì) |
| Guerra d'Etiopia (3/10/1935) | 1935–1936 | ITA, poi GBR e FRA | ITA non in guerra in Europa | ITA attacca l'Etiopia fuori mappa (→ sì): costo in risorse per 6 mesi; GBR e FRA scelgono le sanzioni (→ sì): embargo verso ITA per 6 mesi, il fronte di Stresa decade |
| Rimilitarizzazione della Renania (7/3/1936) | 1936–1937 | GER, poi FRA e GBR | la Renania è tedesca e smilitarizzata (fino a qui GER non può tenerci armate né fortificazioni) | GER entra (→ sì); FRA sceglie se intervenire (guerra con GER) o lasciar fare (→ lascia fare) |
| Guerra civile spagnola (17/7/1936) | lug 1936 – 1939 | ESP, poi GER, ITA, SOV | ESP esiste e non è in guerra | dottrina della Spagna: Repubblica → Comunisti oppure nazionalisti → Nazisti (→ nazionalisti, capo Franco dal 1/4/1939). GER, ITA e SOV scelgono se mandare aiuti (risorse) alla parte amica. Semplificata: nessuna guerra simulata sulla mappa |
| Asse Roma-Berlino (1/11/1936) | 1936–1939 | GER propone, ITA riceve | non in guerra | accetta → visione condivisa (→ sì); sblocca il patto d'acciaio |

**1938–1939: le crisi**

| Evento | Finestra | Coinvolti | Condizioni principali | Scelte ed effetti |
|---|---|---|---|---|
| Anschluss (12/3/1938) | mar–dic 1938 | GER propone, AUT riceve | entrambe esistono, confinano, non in guerra | accetta → AUT annessa a GER, capo Seyss-Inquart per 2 giorni; rifiuta → nulla, GER può dichiarare guerra |
| Sudeti / Monaco (29/9/1938) | set 1938 – mar 1939 | GER propone, CZE riceve, GBR e FRA garanti | GER confina con i Sudeti, CZE li possiede | CZE cede → Sudeti a GER; CZE rifiuta → GBR e FRA scelgono se garantire (guerra a GER se attacca) o lasciar fare (→ lasciano fare) |
| Primo arbitrato di Vienna (2/11/1938) | nov 1938 – mar 1939 | HUN propone, CZE riceve | dopo i Sudeti | accetta → Slovacchia meridionale a HUN |
| Fine della Cecoslovacchia (15/3/1939) | mar–dic 1939 | GER propone, CZE riceve | dopo i Sudeti | accetta → Boemia e Moravia a GER, Slovacchia protettorato tedesco, Rutenia a HUN, capo Hácha; rifiuta → guerra |
| Memel (22/3/1939) | mar–dic 1939 | GER propone, LTU riceve | GER confina con Memel | accetta → Memel a GER |
| Garanzia alla Polonia (31/3/1939) | mar–ago 1939 | GBR e FRA | dopo la fine della Cecoslovacchia | garantiscono (→ sì): guerra automatica a chi attacca la Polonia (anche a Romania e Grecia dopo l'Albania) |
| Albania (7/4/1939) | apr–dic 1939 | ITA propone, ALB riceve | non in guerra | accetta → ALB annessa a ITA; rifiuta → guerra (→ ITA attacca) |
| Patto d'acciaio (22/5/1939) | 1939–1940 | GER propone, ITA riceve | dopo l'asse Roma-Berlino | accetta → alleanza (→ sì) |
| Patto Molotov-Ribbentrop (23/8/1939) | ago 1939 – giu 1941 | GER propone, SOV riceve | non in guerra tra loro | accetta → non aggressione e sfere d'influenza: sblocca Polonia orientale, Baltici, Bessarabia, guerra d'inverno (→ sì). Senza patto la Polonia orientale non viene invasa e la Polonia resiste più a lungo |
| Danzica e Polonia (1/9/1939) | ago–dic 1939 | GER propone, POL riceve, GBR e FRA garanti | DAN e POL esistono | POL cede Danzica e corridoio → passano a GER; rifiuta → GER sceglie se attaccare (→ attacca), GBR e FRA se dichiarare guerra (→ la dichiarano) |
| Polonia orientale (17/9/1939) | set 1939 – giu 1940 | SOV | dopo il patto, GER in guerra con POL | SOV entra in guerra con POL; alla pace le province a est della linea concordata vanno a SOV |
| Basi sovietiche nei Baltici (set–ott 1939) | 1939–1940 | SOV propone, EST, LVA, LTU ricevono | dopo il patto | accetta → diritto di passaggio per SOV (→ sì); Vilnius a LTU |
| Guerra d'inverno (30/11/1939) | nov 1939 – 1940 | SOV propone, FIN riceve | dopo il patto | FIN cede la Carelia → passa a SOV; rifiuta → guerra (→ rifiuta); pace di Mosca (12/3/1940) proposta da SOV dopo 3 mesi |

**1940–1941: la guerra in Europa**

| Evento | Finestra | Coinvolti | Condizioni principali | Scelte ed effetti |
|---|---|---|---|---|
| Danimarca e Norvegia (9/4/1940) | 1940 | GER | GER in guerra con GBR, DNK e NOR neutrali | GER attacca (→ sì); DNK sceglie se resistere o arrendersi (→ si arrende in un giorno: annessa a GER come occupata) |
| Attacco a occidente (10/5/1940) | 1940–1941 | GER | GER in guerra con FRA, Paesi Bassi e Belgio neutrali | GER dichiara guerra a NLD, BEL, LUX (→ sì); GBR e FRA possono entrare in Belgio con il diritto di passaggio |
| Entrata in guerra dell'Italia (10/6/1940) | mag–dic 1940 | ITA | GER in guerra con FRA | ITA dichiara guerra a FRA e GBR (→ sì) o resta neutrale |
| Armistizio francese (22/6/1940) | 1940–1944 | FRA, GER | Parigi in mano tedesca, FRA e GER in guerra | FRA firma → pace con GER, il nord passa a GER, capo Pétain (Vichy); continua → capo de Gaulle, governo in esilio |
| Baltici (giu 1940) | 1940–1941 | SOV propone, EST, LVA, LTU ricevono | dopo il patto | accetta → annessione a SOV; rifiuta → guerra |
| Bessarabia e Bucovina (28/6/1940) | 1940–1941 | SOV propone, ROU riceve | dopo il patto | accetta → province a SOV; rifiuta → guerra |
| Secondo arbitrato di Vienna (30/8/1940) | 1940–1941 | HUN propone, ROU riceve, GER arbitro | ROU possiede la Transilvania | accetta → Transilvania settentrionale a HUN, poi abdicazione di Carlo II (capo Antonescu) |
| Dobrugia meridionale (7/9/1940) | 1940–1941 | BGR propone, ROU riceve | ROU possiede la Dobrugia meridionale | accetta → passa a BGR |
| Guerra italo-greca (28/10/1940) | 1940–1941 | ITA propone, GRC riceve | ITA possiede l'Albania | ultimatum: GRC accetta (basi italiane) o rifiuta (→ "Όχι": guerra); GBR sceglie se aiutare la Grecia (→ sì) |
| Patto tripartito (nov 1940 – mar 1941) | 1940–1941 | GER propone, HUN, ROU, BGR, YUG ricevono | non in guerra con GER | accetta → diritto di passaggio per GER; per YUG segue il colpo di stato (capo Pietro II) che lo annulla |
| Affitti e prestiti (11/3/1941) | 1941–1945 | Stati Uniti → GBR | GBR in guerra con GER | aiuti in risorse al giorno (forza fuori mappa) |
| Jugoslavia e Grecia (6/4/1941) | 1941 | GER, ITA, HUN, BGR | YUG ha annullato il patto tripartito, oppure GRC in guerra con ITA | GER attacca (→ sì); alla pace province alla Croazia (→ ITA e GER per ora), a HUN e BGR |
| Operazione Barbarossa (22/6/1941) | 1941–1942 | GER, poi ROU, HUN, FIN, ITA | dopo il patto, GER e SOV non in guerra | GER rompe il patto e attacca (→ sì); ROU e ITA scelgono se unirsi (→ sì); HUN (→ sì, 27/6); FIN guerra di continuazione (→ sì, 25/6) |
| Aiuti all'URSS (ott 1941) | 1941–1945 | Stati Uniti e GBR → SOV | SOV in guerra con GER | aiuti in risorse al giorno (forza fuori mappa) |
| Pearl Harbor (7/12/1941) | dic 1941 | Stati Uniti, GER, ITA | — | gli Stati Uniti entrano in guerra; GER e ITA scelgono se dichiarare guerra agli Stati Uniti (→ sì, 11/12): senza, niente sbarchi americani contro di loro |

**1942–1945: la svolta**

| Evento | Finestra | Coinvolti | Condizioni principali | Scelte ed effetti |
|---|---|---|---|---|
| Incursione su Dieppe (19/8/1942) | 1942 | Commonwealth → GER | la costa della Manica è in mano tedesca | piccolo sbarco che si ritira dopo 1 giorno (forza fuori mappa) |
| Sbarco in Nordafrica e occupazione della Francia di Vichy (8–11/11/1942) | 1942–1943 | Stati Uniti, GER | c'è la Francia di Vichy | fuori mappa: risorse e morale; GER sceglie se occupare la Francia meridionale (→ sì) |
| Sbarco in Sicilia (10/7/1943) | 1943–1944 | Stati Uniti e GBR → ITA | ITA in guerra con gli Alleati, la Sicilia è italiana o tedesca | sbarco in Sicilia (forza fuori mappa) |
| Caduta di Mussolini (25/7/1943) | 1943–1945 | ITA | nemici in una provincia italiana, ITA in guerra | il Gran Consiglio sfiducia Mussolini (→ sì): capo Badoglio |
| Armistizio italiano (8/9/1943) | 1943–1945 | ITA, poi GER | dopo la caduta di Mussolini | ITA firma (→ sì): pace con gli Alleati, guerra con GER, dottrina Alleati; GER sceglie l'occupazione dell'Italia del nord (→ sì): province a nord della linea del fronte passano a GER (Repubblica Sociale per ora tedesca) |
| Sbarchi a Salerno e Anzio (9/9/1943, 22/1/1944) | 1943–1944 | Stati Uniti e GBR → GER o ITA | nemici degli Alleati nell'Italia del sud o del centro | sbarchi (forza fuori mappa) |
| Occupazione dell'Ungheria (19/3/1944) | 1944 | GER, HUN | HUN alleata di GER, SOV vicina al confine | GER occupa le province ungheresi (→ sì) |
| Sbarco in Normandia (6/6/1944) | 1944–1945 | Stati Uniti, GBR, Commonwealth → GER | la Francia del nord è in mano a un nemico degli Alleati | grande sbarco in Normandia (forza fuori mappa) |
| Insurrezione di Varsavia (1/8/1944) | 1944 | POL in esilio | Varsavia occupata, SOV a meno di 50 km | rivolta nella provincia: armata polacca che combatte da sola (→ sì); SOV sceglie se aiutarla (→ no) |
| Sbarco in Provenza (15/8/1944) | 1944 | Stati Uniti e Francia libera → GER | la Francia del sud è in mano tedesca | sbarco in Provenza (forza fuori mappa) |
| Liberazione di Parigi (25/8/1944) | 1944–1945 | FRA in esilio | Parigi in mano alleata | torna il governo francese: capo de Gaulle, province liberate a FRA |
| Cambi di campo (ago–set 1944) | 1944–1945 | ROU, BGR, FIN | truppe sovietiche nelle loro province | pace con SOV e guerra a GER con dottrina Comunisti (ROU 23/8, BGR 9/9) o armistizio (FIN 19/9); cambi di capo (Michele I, Georgiev) |
| Szálasi al potere (15/10/1944) | 1944–1945 | HUN, GER | HUN tenta l'armistizio con SOV in guerra | GER impone Szálasi (→ sì): HUN resta nell'Asse |
| Insurrezione del nord Italia (25/4/1945) | 1945 | ITA (del sud) | province italiane in mano tedesca, Alleati vicini | le province del nord senza armate tedesche tornano all'Italia |
| Fine del Reich (30/4/1945) | 1945 | GER | Berlino in mano nemica | capo Dönitz, resa (8/5/1945): pace con tutti, la partita storica finisce |

Regola generale, non legata a una data: una nazione che perde la capitale ma ha ancora province (o è in guerra con un alleato) forma un **governo in esilio** con il suo capo storico, se ne ha uno (Polonia, Paesi Bassi, Norvegia, Belgio, Grecia, Jugoslavia, Lussemburgo).

### Cosa serve prima, nel motore

- **Patto di non aggressione** e **garanzia** nella diplomazia (pace e tregua ci sono già).
- **Forze fuori mappa**: armate che compaiono sulla costa, aiuti in risorse; poi la marina per i convogli.
- **Cambio di dottrina** di una nazione come effetto di un evento (oggi la dottrina è fissa per nazione).
- **Gruppi di province** per gli eventi nella configurazione della mappa.
- **Stato degli eventi** nella partita: accaduti, in attesa di risposta (con scadenza), decaduti.
- **Avanzare fino a uno stop**: una variante di `advance` che si ferma al primo evento che chiede una scelta (o a una minaccia), da usare per il salto.
- Per gli scenari: un file di scenario per data (guerre e accordi in corso, eventi già accaduti), ottenuto applicando gli eventi storici alla mappa del 1933.

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
- **Ostacoli naturali** (idea del 25/10/2026, da riprendere dopo il combattimento): oggi la marcia conosce strade, ferrovie e grandi fiumi, ma non i rilievi. Milano–Rimini è pianura, Milano–Berna attraversa le Alpi: fatto (25/10/2026) il terreno per provincia con effetti su velocità e forza (vedi §9, "Terreno"); restano da decidere i valichi come passaggi obbligati.
