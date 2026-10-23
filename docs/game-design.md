# Game Design — dinamiche base

Documento di riferimento per le meccaniche del gioco. Le meccaniche sono **ricavate da guide pubbliche della community** (vedi Fonti in fondo) e riscritte con parole e numeri nostri.
I numeri sono **valori di partenza per il bilanciamento**, da tenere in `/shared/data` e ritoccare giocando.

Escluso per scelta: negozio, valuta premium (Gold), acceleratori a pagamento, alleanze/coalizioni ufficiali, forum, eventi, ricompense giornaliere.

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
| Beni | Edifici, quasi tutte le unità |
| Metallo | Carri, artiglieria, navi |
| Petrolio | Mezzi motorizzati, aerei, navi |
| Materiali rari | Unità avanzate e speciali |
| Denaro | Tutto (unità, edifici, ricerca) |
| Manodopera | Tutte le unità |

- Produzione sommata dalle province, moltiplicata per **morale** ed **edifici industriali**. Viene **accreditata a ogni tick di 30 minuti** di gioco (1/48 della produzione giornaliera); chi è offline la ritrova al rientro.
- Valori di partenza indicativi (al 100% di morale, provincia core):
  - città, risorsa principale: **6.000/giorno**
  - provincia rurale con risorsa: **1.500/giorno**
  - provincia rurale senza risorsa: tripla manodopera rispetto alle altre
- **Mantenimento**: le unità consumano risorse ogni giorno (proporzionale al costo). Carenze → morale in calo; per il cibo fino a -30.
- **Nessun limite di magazzino**: le scorte possono crescere senza tetto (deciso il 23/10/2026).
- **Mantenimento**: si scala a ogni tick come la produzione; le scorte non scendono sotto zero (le carenze agiranno sul morale).
- Città: oltre alla risorsa principale producono 3.000 di denaro e 1.500 di manodopera al giorno; province rurali 1.000 di denaro e 800 di manodopera (2.400 se senza risorsa principale).
- Le città di una nazione hanno risorse principali **diverse tra loro**; alcune province hanno risorse storiche (petrolio a Baku e Ploiești, metallo nella Ruhr, in Slesia, nel Donbass e a Kiruna…). Vedi `resources` in `data/maps/europe-1933/config.json`.
- Scorte iniziali: 3 giorni di produzione.
- Valori nel codice: `shared/src/data/economy.ts`.
- **Mercato** (fase successiva): scambio di risorse tra giocatori tramite offerte.

## 4. Morale

- Ogni provincia ha un **morale 0–100%** e un **valore obiettivo**; a ogni cambio giorno il morale si sposta di circa il **22%** della distanza verso l'obiettivo.
- Obiettivo = base (~100) + bonus − malus:
  - **Malus**: distanza dalla capitale (fino a circa -30), dimensione dell'impero (fino a circa -35), vicini scontenti, eserciti nemici nella provincia, carenza di cibo (fino a -30), bombardamenti, perdita della capitale (-20 immediato ovunque), assenza di capitale (-40).
  - **Bonus**: capitale (+10), fortificazioni/infrastrutture (+5 per livello), vicini contenti, edifici di propaganda.
- **Effetti**: sotto l'80% il morale riduce produzione e velocità di costruzione/addestramento (al 25% i tempi di costruzione sono circa x2,6).
- Le province conquistate partono dal **25%**. Conquistare una capitale nemica dà **+10%** a tutte le proprie province.
- **Rivolte**: sotto circa il **31%**, a ogni cambio giorno c'è una probabilità di rivolta che cresce al calare del morale. Una **guarnigione** al centro della provincia la riduce o la azzera. Se riesce, la provincia passa all'ex proprietario o a un vicino.

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

## 8. Movimento

- Gli eserciti si muovono **verso qualsiasi punto della terraferma**, non solo verso i centri delle province, con tempo di percorrenza reale in base alla distanza e alla velocità dell'unità più lenta.
- **Strade e ferrovie** (rete reale semplificata): velocità piena. **Fuori strada**: metà velocità. Il percorso più rapido è calcolato automaticamente e combina i due.
- **Grandi fiumi** (Danubio, Reno, Volga, Dnepr, Vistola, Elba, Oder, Loira, Po, Don, Dnestr… circa 60): si attraversano **solo sui ponti**, cioè dove una strada o una ferrovia passa il fiume.
- **Ponti distruggibili** (e riparabili) e **ponti di barche** costruiti dal genio: decisi, arriveranno con il combattimento; il motore già supporta ponti chiusi.
- La provincia si conquisterà raggiungendone il centro (milestone 4).
- Bonus di velocità da infrastrutture e terreno preferito. Le unità sotto il 50% di salute vanno più lente.
- **Mare**: le unità terrestri diventano **trasporti** (imbarco/sbarco 3–4 ore, ridotto dalla base navale).
- **Aerei**: hanno un'autonomia; oltre quella si spostano via terra come convoglio.

### Stato attuale (milestone 3)
- Unità disponibili: fanteria, fanteria motorizzata, autoblindo, carro leggero, artiglieria (valori in `shared/src/data/units.ts`).
- Ogni nazione parte con un'armata in ogni città (3 fanterie + 1 artiglieria nella capitale, 2 fanterie nelle altre).
- Si arruola **solo nelle proprie città**: il costo si paga subito, l'unità esce dopo il tempo di produzione; più ordini formano una coda.
- Le armate marciano solo **nel proprio territorio e via terra** finché non arriva il combattimento (milestone 4).
- Un'armata in marcia che riceve un nuovo ordine cambia strada dal punto in cui si trova; "Fermati qui" la ferma dov'è.
- Due armate della stessa nazione ferme entro 3 km si **uniscono**; le unità appena arruolate si uniscono all'armata ferma in città.
- Valori: `shared/src/data/movement.ts`.

## 9. Combattimento

- **Tick ogni 30 minuti** tra eserciti ingaggiati. Distanza di ingaggio ravvicinato: **5 km**. Una volta ingaggiati non ci si può ritirare.
- **Danno di un esercito contro una classe** = somma del danno delle sue unità contro quella classe, con **limite di gruppo**: oltre 10 unità il danno aggiunto cala, oltre 20 non cresce più.
- **Offensivo vs difensivo**: chi attacca usa i valori offensivi; chi è fermo in difesa usa quelli difensivi; se entrambi sono in movimento valgono entrambi.
- **Efficienza per salute**: `efficienza = 20% + 0,8 × salute%` (100% a piena salute, 60% a metà).
- **Niente fattore casuale**: a parità di condizioni il risultato è sempre lo stesso. L'unica variabilità prevista è quella data dal **generale** al comando dell'armata (vedi sotto, da definire).
- **Distribuzione**: il danno contro una classe si divide tra le unità nemiche di quella classe, in proporzione alla loro presenza nell'esercito.
- Le unità di un esercito vengono distrutte solo quando la condizione complessiva scende sotto il 50%.
- **Bonus**: terreno preferito, fortificazioni/bunker (es. -38% di danno subito al livello 1), livello dell'unità.
- **Unità a distanza** (artiglieria, navi): attaccano entro la gittata ogni 30 minuti; il bersaglio risponde solo se ha gittata sufficiente; sotto i 5 km diventa combattimento ravvicinato.
- **Aerei**:
  - *Attacco diretto*: colpiscono dopo il tempo di volo, poi devono rifornirsi (30 min, meno con aeroporti di livello più alto).
  - *Pattuglia*: ogni 15 minuti metà danno a chi è nel cerchio di pattuglia.
  - Le unità di terra/mare rispondono con i valori antiaerei difensivi; gli aerei subiscono prima la difesa, poi infliggono danno.
- **Danni agli edifici**: attaccare un'unità al centro di una provincia danneggia anche gli edifici (fortificazioni bersaglio più probabile).

### Generali (idea, da definire)
- Ogni armata può avere un **generale** al comando, con caratteristiche proprie (es. bonus in attacco, in difesa, su un terreno, sul morale o sulla velocità).
- È l'elemento che sostituisce la casualità: due battaglie uguali danno risultati diversi perché sono guidate da generali diversi.
- Da decidere: come si ottengono, se possono morire o essere catturati, se migliorano con l'esperienza.

## 10. Conquista e vittoria

- Una provincia si conquista entrando nel suo centro senza difensori.
- **Vittoria**: raggiungere una soglia di **punti vittoria** (dalle città possedute) oppure restare l'ultimo. Soglia configurabile per partita.

## 11. Diplomazia (versione semplice)

- Stati: **guerra**, **pace**, **diritto di passaggio**, **visione condivisa**.
- Messaggi privati tra giocatori e chat della partita.
- Niente coalizioni ufficiali: le alleanze si fanno a parole tra amici.

## 12. Spionaggio (fase successiva, opzionale)

- Spie che rivelano informazioni, sabotano edifici o abbassano il morale, con mantenimento giornaliero.

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
