# Pedine dipinte per la mappa — guida e prompt

Le armate sulla mappa diventano **soldatini dipinti**: ogni gettone mostra la figura dell'unità principale dell'armata. Niente basetta: la figura poggia direttamente sulla mappa con un'ombra morbida della sua sagoma; accanto un cartellino con le truppe, la salute e il colore della nazione. Le immagini quindi contengono **solo la figura**: niente base, niente sfondo, niente bandiere.

## Cosa serve

**Prima tornata: le 10 unità di terra per le 3 dottrine presenti in Europa**, cioè 30 immagini. Le dottrine Alleati, Nazisti e Comunisti sono quelle di `shared/src/data/doctrines.ts`. I Nipponici serviranno solo quando la mappa si allargherà.

| id (nome del file) | Unità |
|---|---|
| `infantry` | Fanteria |
| `motorized` | Fanteria motorizzata |
| `armoredCar` | Autoblindo |
| `lightTank` | Carro leggero |
| `heavyTank` | Carro pesante |
| `artillery` | Artiglieria |
| `antiTank` | Anticarro |
| `antiAircraft` | Antiaerea |
| `engineer` | Genio |
| `medic` | Sanità |

**Seconda tornata, facoltativa: aerei e navi.** Sono 5 aerei e 5 navi per dottrina. Per ora le loro sagome disegnate dal gioco funzionano; si possono fare dopo con le stesse regole (prompt in fondo).

**Terza tornata: i convogli.** Sono 3 per dottrina: il convoglio aereo a terra, il trasporto truppe e il convoglio mercantile (prompt in fondo).

## Dove metterle

```
icone/icone alleati/icone pedine/infantry.png
icone/icone nazisti/icone pedine/infantry.png
icone/icone comunisti/icone pedine/infantry.png
icone/icone nipponici/icone pedine/infantry.png
icone/icone in comune/transport.png      (uguali per tutte le dottrine)
icone/icone in comune/convoy.png
```

Usa il nome del file esattamente come la colonna "id" (maiuscole comprese). Poi basta lanciare:

```
npm run build:tokens -w data
```

Lo script (`data/scripts/build-tokens.ts`) prepara le figure per la mappa in `client/src/assets/tokens/<dottrina>/` e `tokens/common/`:
- toglie lo sfondo, se l'immagine non è trasparente (sfondo bianco o scacchiera finta attaccati ai bordi);
- ritaglia la figura;
- la rimpicciolisce a 128 pixel sul lato più lungo.

Il gioco le prende da solo. Una dottrina senza figure tiene i gettoni disegnati.

**Stato (27/10/2026):** ci sono tutte le figure degli Alleati (unità di terra, aerei, navi, convoglio aereo) e quelle in comune (trasporto e convoglio mercantile). Mancano Nazisti, Comunisti e Nipponici.

## Regole per tenere lo stile uguale su tutte

1. **Una sola chat per dottrina.** Incolla prima il "prompt di stile", poi chiedi le figure una alla volta con i prompt brevi. Il generatore ricorda lo stile della chat.
2. Se una figura esce diversa dalle altre (luce, colori, angolo), rigenerala dicendo: *"Same style, lighting and angle as the first figure in this chat."* Puoi anche allegare la prima figura buona come riferimento.
3. **Sfondo trasparente** (PNG). Con ChatGPT basta chiederlo, è già nel prompt. Se il tuo generatore non lo fa, va bene anche un fondo bianco uniforme: lo tolgo io.
4. **Formato quadrato** (1024×1024). La figura deve stare intera, con un po' di margine, e guardare **verso destra**.
5. **Niente testo, scritte, numeri o bandiere** nell'immagine: il colore della nazione lo mette il gioco. Piccole insegne sui mezzi vanno bene se il generatore le aggiunge da solo. Non le ritocchiamo: è la stessa regola delle foto storiche.
6. I prompt sono in inglese perché i generatori li capiscono meglio. Le spiegazioni sono in italiano.

Sulla mappa la pedina è piccola, circa 40 pixel. Per questo il prompt chiede forme semplici e massicce e una silhouette che si riconosca a colpo d'occhio.

### Perché una figura sembra sospesa, e come lo evita il prompt

La mappa si guarda dall'alto. Una figura disegnata di lato (occhio all'altezza della pancia) mostra i piedi o le ruote sulla stessa linea della pancia, e sulla mappa sembra galleggiare. Per sembrare appoggiata servono tre cose, già nel prompt di stile:

- **Camera alta, a circa 45°.** Si vede la parte superiore dell'elmetto, delle spalle, del cofano o della torretta; i piedi stanno più in basso e un po' più vicini a chi guarda.
- **Peso sul terreno.** Piedi entrambi piatti alla stessa altezza (o un piede avanti ma appoggiato), ruote e cingoli che toccano tutti lo stesso piano, gambe leggermente piegate: niente salti, niente passi a mezz'aria.
- **Niente ombra disegnata e niente terreno.** L'ombra e il contatto col suolo li mette il gioco, uguali per tutte le figure. Un'ombra dipinta dal generatore sarebbe ogni volta diversa e verrebbe tagliata male quando si toglie lo sfondo.

Per le navi vale lo stesso al livello dell'acqua: lo scafo finisce **dritto sulla linea di galleggiamento**, senza la chiglia rossa sotto. Una nave con la chiglia visibile sembra tirata fuori dall'acqua.

Se una figura esce comunque sospesa, chiedi: *"Redo it seen more from above, about 45 degrees, like an isometric strategy game unit: we must see the top of the helmet and shoulders, and both feet flat on the same invisible ground level."*

---

## Prompt di stile (da incollare per primo in ogni chat)

Sostituisci `[FACTION]` con il blocco della dottrina qui sotto.

```
I need a set of game pieces for a WW2 strategy game. They will be placed on a map that the player looks at FROM ABOVE, so every figure must be seen from above too.

CAMERA (the most important rule, same for every image in this chat):
- high bird's-eye three-quarter view, like the units of an isometric strategy game, or like a photo of a miniature on a table taken by a standing person looking DOWN at it (camera about 45 degrees above the ground)
- because we look down: the top of the helmet is a clearly visible oval, we see the top of the shoulders and of the backpack, the head is slightly foreshortened, the legs look shorter, and the feet are the lowest point of the image
- NOT a side view, NOT eye level, NOT a low angle, NOT a profile
- the figure moves diagonally towards the RIGHT and slightly towards the viewer

GROUND CONTACT:
- imagine the figure standing on a flat table seen from above, then erase the table and its shadow completely
- soldiers: both boot soles flat on that invisible table, the nearer foot a little lower in the image than the farther foot, weight down, knees slightly bent; nobody jumps, runs or lifts a foot
- vehicles and guns: every wheel and both tracks rest on the same flat invisible surface

STYLE:
- a single hand-painted tin toy soldier / miniature figure, like a classic painted lead figurine, slightly glossy enamel paint, subtle metal wear on the edges
- chunky, simplified proportions and a strong silhouette that stays readable when shown very small (40 pixels)
- soft light from the top left, shading on the figure only
- NO base, NO pedestal, NO ground, NO shadow on the ground (the game adds its own)
- transparent background (PNG), square 1024x1024, the whole figure visible and centered with some margin
- no text, no letters, no numbers, no flags, no frame

Faction for this chat: [FACTION]
Reply only with the image. First figure: one infantry soldier walking calmly forward with a rifle held across the chest.
```

**Da aggiungere in fondo a ogni prompt successivo** (i generatori dimenticano la camera dopo due o tre immagini):

```
Same camera as the first figure: high three-quarter view looking DOWN from about 45 degrees, not a side view. Resting flat on the invisible ground.
```

**Controllo prima di salvare** (dieci secondi, risparmia di rifarla dopo):
1. Si vede la **calotta dell'elmetto** (o il tetto del mezzo, la torretta da sopra)? Se si vede solo il profilo, è di lato: rifalla.
2. I **piedi sono il punto più basso** e tutti e due appoggiati? Le ruote e i cingoli tutti sulla stessa linea?
3. Niente ombra, niente terreno, niente basetta?
4. Guarda **a destra**?

**Il trucco migliore: l'immagine di riferimento.** Quando una figura esce bene (camera alta e piedi a terra), salvala e allegala ai prompt successivi con: *"Use the attached image as the reference for camera angle, style and lighting."* Il generatore copia l'angolo da un'immagine molto meglio che da una descrizione. Puoi anche iniziare la chat allegando una foto vera di un soldatino fotografato dall'alto, con: *"Copy only the camera angle of this photo."*

Se dopo due tentativi esce ancora di lato, chiedi la stessa figura **"as seen in an isometric strategy game"**: è la parola che più spesso sblocca la vista dall'alto.

Le figure degli Alleati già fatte con la versione vecchia del prompt (camera più bassa) vanno bene per i mezzi. **Fanteria, genio e sanità** conviene rifarle solo quando esce una figura davvero vista dall'alto: sono quelle che sembrano più sospese, perché sono alte e strette.

### Blocchi `[FACTION]`

**Alleati** (Regno Unito, Francia e le altre nazioni con questa dottrina):
```
Allied army of 1939-1942, British/French style: khaki-brown wool uniforms, flat "Brodie" steel helmets, webbing in pale khaki; vehicles painted in khaki-green and dark earth.
```

**Nazisti** (Germania, Italia, Ungheria, Romania, Bulgaria…):
```
German army of 1939-1942: field-grey uniforms, the typical rounded German steel helmet, black leather boots and belts; vehicles painted in dark panzer grey.
```

**Comunisti** (Unione Sovietica):
```
Soviet Red Army of 1939-1942: olive-khaki gymnastyorka tunics, SSh-40 style round steel helmets or pilotka caps, rolled greatcoat over the shoulder; vehicles painted in Soviet olive green.
```

---

## Prompt delle singole figure (da incollare uno alla volta, nella stessa chat)

Dove ci sono tre esempi di mezzo, usa quello della dottrina della chat. Gli esempi sono solo per la forma: al generatore basta il "tipo".

| id | Prompt |
|---|---|
| `infantry` | *(già chiesta nel prompt di stile)* |
| `motorized` | `Next figure, same style: a military truck with a canvas-covered cargo bed and two seated soldiers visible in the back. Allies: Bedford-like truck. Germans: Opel Blitz-like truck. Soviets: GAZ-AA-like truck.` |
| `armoredCar` | `Next figure, same style: a wheeled armoured car with a small turret and a machine gun, four or six wheels. Allies: Humber/Panhard-like. Germans: Sd.Kfz. 222/231-like. Soviets: BA-10-like.` |
| `lightTank` | `Next figure, same style: a small light tank with a small turret and a short gun. Allies: Vickers light tank / Renault R35-like. Germans: Panzer II-like. Soviets: T-26 / BT-7-like.` |
| `heavyTank` | `Next figure, same style: a big heavy tank, wide tracks, thick armour, large turret with a long gun; it must look clearly bigger and heavier than the light tank. Allies: Matilda II / Char B1-like. Germans: Tiger I-like. Soviets: KV-1-like.` |
| `artillery` | `Next figure, same style: a towed field howitzer with a long barrel raised at an angle, with one crewman loading a shell beside it.` |
| `antiTank` | `Next figure, same style: a small, low anti-tank gun with a gun shield and a straight barrel aimed forward, with one kneeling crewman.` |
| `antiAircraft` | `Next figure, same style: a light anti-aircraft gun on a cross-shaped mount with the barrel pointing steeply up at the sky, with one crewman aiming.` |
| `engineer` | `Next figure, same style, same high camera: a combat engineer soldier standing with both boots flat on the ground, carrying a shovel and a pickaxe, with a coil of rope or a small toolbox; rifle slung on the back.` |
| `medic` | `Next figure, same style, same high camera: an army medic soldier standing with both boots flat on the ground, carrying a canvas first-aid bag and a folded stretcher, with a plain white armband (no symbols on it).` |

Per la Sanità niente croce rossa: è un simbolo protetto e nei giochi si evita. Basta la fascia bianca.

---

## Seconda tornata (facoltativa): aerei e navi

Stessa chat o una nuova. Prima incolla questa variante del prompt di stile (al posto della frase sul punto di vista):

```
Same tin miniature style as before. Aircraft: seen from above at a three-quarter angle, flying towards the RIGHT. Ships: seen from the side and from above at about 30 degrees so we see the deck, bow pointing RIGHT, the hull ends in a straight flat line at the waterline (no keel, no red underwater hull, no water). Transparent background, no text, no flags.
PROPELLERS, very important for every aircraft:
- the propellers are STOPPED, sharp and solid, like on a parked toy model: no motion blur, no transparent spinning disc, no circle
- exactly one propeller at the front of EACH engine, mounted on a pointed spinner cone at the very front of the engine nose; nothing on the back of the wing
- every propeller has the exact number of blades I give you, all the same length and shape, evenly spaced around the spinner like a star
- blades are thin, dark metal, as long as the engine is wide or a bit longer, clearly separated from the engine cowling
```

### Le eliche: come farle uscire giuste

I generatori sbagliano le eliche in quattro modi: le disegnano **in movimento** (un disco sfocato o trasparente, che poi si taglia male con lo sfondo), sbagliano **il numero di pale**, ne mettono **di troppo o di meno** sui plurimotori, oppure le **fondono col muso** del motore. Per questo:

1. Il blocco PROPELLERS sopra va incollato una volta nella chat, prima del primo aereo.
2. Ogni prompt degli aerei dice **quanti motori e quante pale**: il numero esplicito funziona molto meglio di "come l'aereo vero".
3. Controlla l'immagine prima di salvarla: conta motori ed eliche, conta le pale di un'elica.
4. Se è sbagliata, **correggi solo le eliche**, senza far rigenerare tutto l'aereo (che cambierebbe anche il resto). In ChatGPT puoi selezionare la zona delle eliche con lo strumento di modifica dell'immagine e scrivere:
   *"Fix only the propellers: [N] stopped propellers, one on the nose of each engine, each with exactly [B] sharp blades evenly spaced around a pointed spinner. No blur, no disc. Keep everything else identical."*
5. Se dopo due tentativi esce ancora male: chiedi l'aereo con le eliche viste un po' più di fronte (*"turn the plane slightly towards the viewer so the propellers are seen more from the front"*). Di tre quarti le pale si accorciano in prospettiva ed è lì che il generatore si confonde.

| id | Prompt |
|---|---|
| `fighter` | `A single-engine fighter plane: ONE engine in the nose, ONE stopped propeller. Allies: Hurricane-like, 3 blades. Germans: Bf 109-like, 3 blades. Soviets: I-16-like, 2 blades.` |
| `tacticalBomber` | `A single-engine dive bomber with bombs under the wings: ONE engine in the nose, ONE stopped propeller with 3 blades. Allies: Fairey Battle-like. Germans: Ju 87 Stuka-like with gull wings. Soviets: Il-2-like.` |
| `torpedoBomber` | `A torpedo bomber carrying a torpedo under the fuselage. Allies: Swordfish biplane-like, ONE engine, ONE stopped propeller with 3 blades. Germans: He 111-like, TWO engines on the wings, TWO stopped propellers with 3 blades each. Soviets: DB-3-like, TWO engines on the wings, TWO stopped propellers with 3 blades each.` |
| `strategicBomber` | `A large heavy bomber with FOUR engines on the wings, two on each wing, and FOUR stopped propellers with 3 blades each, one on the front of every engine. Allies: Lancaster/Halifax-like. Germans: Fw 200 Condor-like. Soviets: Pe-8-like.` |
| `recon` | `A slender twin-engine reconnaissance plane with a glazed nose: TWO engines on the wings, TWO stopped propellers with 3 blades each. Allies: Blenheim-like. Germans: Ju 88-like. Soviets: Pe-2-like.` |
| `submarine` | `A submarine on the surface, low hull and conning tower with a deck gun.` |
| `destroyer` | `A slim, fast destroyer with two gun turrets and torpedo tubes.` |
| `cruiser` | `A cruiser, longer than a destroyer, with several medium gun turrets and one or two funnels.` |
| `battleship` | `A huge battleship with big triple or twin gun turrets fore and aft and a tall superstructure; clearly the largest warship.` |
| `carrier` | `An aircraft carrier with a long flat flight deck and a small island superstructure on the right side, a few small planes parked on deck.` |

I file vanno in `icone/icone <dottrina>/icone pedine/<id>.png`, come per le unità di terra.

---

## Terza tornata: i convogli

Sono 3 pedine per dottrina, quindi 9 immagini. Servono per tre cose che si muovono sulla mappa ma non combattono:

| id (nome del file) | Cos'è nel gioco |
|---|---|
| `airConvoy` | **Convoglio aereo a terra.** Quando una squadriglia deve andare oltre la sua portata, atterra nell'aeroporto più vicino alla meta e prosegue su strada (o in treno) a 18 km/h. Durante il viaggio è indifesa: se un'armata nemica la raggiunge, la distrugge. È già nel game design (§9, "Aviazione"); nel gioco arriverà con il prossimo passo dell'aviazione. |
| `transport` | **Trasporto truppe.** Un'armata che attraversa il mare: si imbarca in un porto, naviga a 25 km/h e sbarca sulla costa. Se viene colpita in mare, perde unità a bordo. |
| `convoy` | **Convoglio mercantile.** Porta le importazioni via mare (cibo, beni, metallo, petrolio): parte ogni giorno a mezzanotte da una porta sull'oceano e va al porto. Non spara; navi, sottomarini, artiglieria costiera e aerei nemici lo possono affondare. |

Si fanno nella **stessa chat della dottrina** con i prompt di stile già dati. Per il convoglio aereo vale il punto di vista delle unità di terra. Per trasporto e convoglio mercantile vale quello delle navi: prima incolla la variante della seconda tornata, se in quella chat non l'hai già fatto.

| id | Prompt |
|---|---|
| `airConvoy` | `Next figure, same style as the land units: a small road convoy moving an aircraft by land, one military truck towing a low trailer that carries a fighter plane with its wings removed and strapped alongside the fuselage, wheels on the road, the plane clearly recognisable. Allies: Bedford truck with a Hurricane-like fuselage. Germans: Opel Blitz with a Bf 109-like fuselage. Soviets: GAZ/ZIS truck with an I-16-like fuselage.` |
| `transport` | `Next figure, same style as the ships: a troop transport ship, a converted passenger liner with one or two funnels, rows of lifeboats along the side and small soldiers crowded on the open deck; plain hull, no big gun turrets, clearly a troopship and not a warship.` |
| `convoy` | `Next figure, same style as the ships: two merchant cargo ships sailing close together in convoy, one slightly behind the other; tramp steamers with a single funnel, cargo derricks and crates or barrels on deck, one of them a low tanker with its bridge at the stern; worn, rusty civilian paint, no guns except perhaps one small gun at the stern.` |

Accorgimenti:
- Per il **convoglio aereo** l'aereo sul rimorchio deve vedersi bene: è l'unica cosa che lo distingue dalla fanteria motorizzata. Se il generatore disegna l'aereo con le ali aperte, chiedi: *"Wings removed and carried beside the fuselage, the plane must fit on the trailer."*
- Il **trasporto** deve sembrare diverso dalle navi da guerra: più alto, niente torri dei cannoni, soldati sul ponte.
- Il **convoglio mercantile** è l'unica pedina con due figure. Tienile vicine, così a 40 pixel si legge come un gruppo e non come due macchie.
- Le navi mercantili sono civili, quindi le tre dottrine possono uscire simili. Va bene così: il colore del cartellino dirà di chi sono.

I file vanno in `icone/icone <dottrina>/icone pedine/<id>.png` (trasporto e convoglio mercantile in `icone/icone in comune/`), come gli altri.

---

## Come le userà il gioco

- **Armata**: figura dell'unità "di testa". Per ora è la più numerosa; a parità, la più forte (carri prima della fanteria). Niente basetta né ovali. Ombra: per i soldati (fanteria, genio, sanità) la sagoma stesa per terra, che parte dai piedi e si allunga in basso a destra; per mezzi, navi e aerei la sagoma sfumata spostata in basso a destra (luce da sinistra in alto); in più, per chi sta a terra, una piccola ombra di contatto sfumata sotto i piedi o le ruote, che fa sembrare la figura appoggiata; la selezione è un contorno giallo intorno alla figura e la battaglia un contorno rosso.
- **Cartellino** accanto alla figura: una riga per tipo di truppa con l'icona delle categorie di Produzione (fanteria, corazzati, artiglieria) e il numero; a sinistra una striscia col colore della nazione, a destra la salute in verticale (verde, gialla, rossa). Bordo bianco se è tua, giallo se selezionata, rosso in battaglia. Per le flotte una riga con le navi (per un trasporto, le truppe a bordo; per il convoglio mercantile solo l'icona), per le squadriglie una riga con gli aerei.
- **Segnaposto**: un pallino col colore della nazione (bordo bianco se è tua) sul punto esatto dove si trova l'unità, collegato alla figura da una linea sottile. La figura sta un po' scostata (sopra la città, o impilata con le altre armate, o accanto alla base per gli aerei a terra) e la linea dice dove si trova davvero.
- **Vista da lontano**: sotto lo zoom 2,5 (1 = Europa intera; `COMPACT_ZOOM`) figura e cartellino diventano un segnalino piccolo: un rombo chiaro col bordo del colore della nazione (giallo se selezionato, rosso in battaglia), l'icona del tipo principale (fanteria, corazzati, artiglieria, nave, aereo) e il numero in una linguetta scura. Così la mappa intera resta leggibile, senza figure giganti; avvicinandosi tornano le figure.
- **Navi**: nessun effetto d'acqua, le figure restano senza mare intorno (una macchia d'acqua dipinta avrebbe un azzurro diverso dal mare della mappa e in porto finirebbe sulla terra).
- **Squadriglia**: l'aereo più numeroso (a parità il più costoso). **Flotta**: la nave più grande. Le figure si voltano nel senso di marcia, di navigazione o di volo.
- **Convogli**: una squadriglia che viaggia a terra mostra `airConvoy`. Un'armata in mare mostra `transport`, con le truppe a bordo nel cartellino. Le importazioni via mare mostrano `convoy`. Il convoglio aereo a terra non c'è ancora nel gioco: la figura è pronta per quando arriverà.
- **Stazza**: non in scala vera, ma ogni tipo ha la sua misura (lato più lungo, con lo zoom di partenza): fanteria, genio e sanità 40 px; anticarro 44; antiaerea 46; autoblindo 50; motorizzata, artiglieria e carro leggero 52; carro pesante 62; caccia 46, ricognitore 48, bombardiere tattico 52, aerosilurante 54, bombardiere strategico 66; sottomarino 56, cacciatorpediniere 64, trasporto 72, convoglio e incrociatore 74, portaerei e corazzata 84. Avvicinandosi le pedine crescono (fino al doppio), per vedere i dettagli. I valori stanno in `client/src/map/tokens.ts` (`TOKEN_SIZE`).
- **Aerei in volo**: la figura si alza sopra la sua ombra, che resta a terra con la stessa sagoma ed è più leggera in quota. Sale nei primi 10 minuti dopo il decollo da una base, resta in quota verso il bersaglio e sopra di lui, scende solo negli ultimi 10 minuti prima di atterrare in una base (`squadronAltitude`).
- Le figure della dottrina della nazione: un'armata tedesca ha soldatini tedeschi, una britannica soldatini alleati. È lo stesso sistema delle foto nelle schede delle unità.
