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

---

## Prompt di stile (da incollare per primo in ogni chat)

Sostituisci `[FACTION]` con il blocco della dottrina qui sotto.

```
I need a set of game pieces for a WW2 strategy board game seen on a map.
Style for ALL images in this chat:
- a single hand-painted tin toy soldier / miniature figure, like a classic painted lead figurine, slightly glossy enamel paint, subtle metal wear on the edges
- chunky, simplified proportions and a strong, clear silhouette that stays readable when shown very small (40 pixels)
- three-quarter view from slightly above, the figure faces RIGHT
- soft light from the top left, gentle shadows on the figure only
- NO base, NO pedestal, NO ground, NO shadow on the ground
- transparent background (PNG), square 1024x1024 image, the whole figure visible and centered with some margin
- no text, no letters, no numbers, no flags, no frame
Faction for this chat: [FACTION]
Reply only with the image. First figure: one infantry soldier advancing with a rifle.
```

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
| `engineer` | `Next figure, same style: a combat engineer soldier carrying a shovel and a pickaxe, with a coil of rope or a small toolbox; rifle slung on the back.` |
| `medic` | `Next figure, same style: an army medic soldier carrying a canvas first-aid bag and a folded stretcher, with a plain white armband (no symbols on it).` |

Per la Sanità niente croce rossa: è un simbolo protetto e nei giochi si evita. Basta la fascia bianca.

---

## Seconda tornata (facoltativa): aerei e navi

Stessa chat o una nuova. Prima incolla questa variante del prompt di stile (al posto della frase sul punto di vista):

```
Same tin miniature style as before. Aircraft: seen from above at a three-quarter angle, flying towards the RIGHT, no propeller blur. Ships: seen from the side, slightly from above, bow pointing RIGHT, no water. Transparent background, no text, no flags.
```

| id | Prompt |
|---|---|
| `fighter` | `A single-engine fighter plane. Allies: Spitfire/Hurricane-like. Germans: Bf 109-like. Soviets: I-16 / Yak-1-like.` |
| `tacticalBomber` | `A dive bomber / light bomber with bombs under the wings. Allies: Blenheim-like. Germans: Ju 87 Stuka-like. Soviets: Il-2-like.` |
| `torpedoBomber` | `A torpedo bomber carrying a torpedo under the fuselage. Allies: Swordfish biplane-like. Germans: He 111 with torpedo-like. Soviets: DB-3-like.` |
| `strategicBomber` | `A large four-engine heavy bomber. Allies: Lancaster/Halifax-like. Germans: Fw 200 Condor-like. Soviets: Pe-8-like.` |
| `recon` | `A slender twin-engine reconnaissance plane with a glazed nose. Allies: Lysander/Anson-like. Germans: Fw 189-like. Soviets: R-5 / Su-2-like.` |
| `submarine` | `A submarine on the surface, low hull and conning tower with a deck gun.` |
| `destroyer` | `A slim, fast destroyer with two gun turrets and torpedo tubes.` |
| `cruiser` | `A cruiser, longer than a destroyer, with several medium gun turrets and one or two funnels.` |
| `battleship` | `A huge battleship with big triple or twin gun turrets fore and aft and a tall superstructure; clearly the largest warship.` |
| `carrier` | `An aircraft carrier with a long flat flight deck and a small island superstructure on the right side, a few small planes parked on deck.` |

I file vanno in `icone/pedine/<dottrina>/<id>.png`, come per le unità di terra.

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

I file vanno in `icone/pedine/<dottrina>/<id>.png`, come gli altri.

---

## Come le userà il gioco

- **Armata**: figura dell'unità "di testa". Per ora è la più numerosa; a parità, la più forte (carri prima della fanteria). Niente basetta né ovali: un'ombra morbida e sfumata della sagoma, spostata in basso a destra (luce da sinistra in alto), uguale a terra e in mare; la selezione è un contorno giallo intorno alla figura e la battaglia un contorno rosso.
- **Cartellino** accanto alla figura: una riga per tipo di truppa con l'icona delle categorie di Produzione (fanteria, corazzati, artiglieria) e il numero; a sinistra una striscia col colore della nazione, a destra la salute in verticale (verde, gialla, rossa). Bordo bianco se è tua, giallo se selezionata, rosso in battaglia. Per le flotte una riga con le navi (per un trasporto, le truppe a bordo; per il convoglio mercantile solo l'icona), per le squadriglie una riga con gli aerei.
- **Navi**: nessun effetto d'acqua, le figure restano senza mare intorno (una macchia d'acqua dipinta avrebbe un azzurro diverso dal mare della mappa e in porto finirebbe sulla terra).
- **Squadriglia**: l'aereo più numeroso (a parità il più costoso). **Flotta**: la nave più grande. Le figure si voltano nel senso di marcia, di navigazione o di volo.
- **Convogli**: una squadriglia che viaggia a terra mostra `airConvoy`. Un'armata in mare mostra `transport`, con le truppe a bordo nel cartellino. Le importazioni via mare mostrano `convoy`. Il convoglio aereo a terra non c'è ancora nel gioco: la figura è pronta per quando arriverà.
- **Stazza**: non in scala vera, ma ogni tipo ha la sua misura (lato più lungo, con lo zoom di partenza): fanteria, genio e sanità 40 px; anticarro 44; antiaerea 46; autoblindo 50; motorizzata, artiglieria e carro leggero 52; carro pesante 62; caccia 46, ricognitore 48, bombardiere tattico 52, aerosilurante 54, bombardiere strategico 66; sottomarino 56, cacciatorpediniere 64, trasporto 72, convoglio e incrociatore 74, portaerei e corazzata 84. Avvicinandosi le pedine crescono (fino al doppio), per vedere i dettagli. I valori stanno in `client/src/map/tokens.ts` (`TOKEN_SIZE`).
- **Aerei in volo**: la figura si alza sopra la sua ombra, che resta a terra con la stessa sagoma ed è più leggera in quota. Sale nei primi 10 minuti dopo il decollo da una base, resta in quota verso il bersaglio e sopra di lui, scende solo negli ultimi 10 minuti prima di atterrare in una base (`squadronAltitude`).
- Le figure della dottrina della nazione: un'armata tedesca ha soldatini tedeschi, una britannica soldatini alleati. È lo stesso sistema delle foto nelle schede delle unità.
