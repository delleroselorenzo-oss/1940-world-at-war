# Pedine dipinte per la mappa — guida e prompt

Le armate sulla mappa diventano **soldatini dipinti**: ogni gettone mostra la figura dell'unità principale dell'armata. Sotto la figura il gioco disegna una basetta tonda con il colore della nazione e, accanto, il numero di unità. Le immagini quindi contengono **solo la figura**: niente base, niente sfondo, niente bandiere.

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

## Dove metterle

```
icone/pedine/alleati/infantry.png
icone/pedine/nazisti/infantry.png
icone/pedine/comunisti/infantry.png
…
```

Usa il nome del file esattamente come la colonna "id" (maiuscole comprese). Dimmi quando ci sono e penso io al resto:
- tolgo lo sfondo, se è rimasto;
- ritaglio e centro tutte le figure allo stesso modo;
- le rimpicciolisco per la mappa (dentro `client/src/assets/tokens/`);
- le collego ai gettoni.

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

## Come le userà il gioco

- **Armata**: figura dell'unità "di testa". Per ora è la più numerosa; a parità, la più forte (carri prima della fanteria). Basetta col colore della nazione, numero di unità accanto, bordo bianco se è tua e giallo se è selezionata. Il numero e la selezione ci sono già oggi.
- **Squadriglia**: l'aereo principale. **Flotta**: la nave più grande. Trasporti e convogli tengono le sagome disegnate dal gioco.
- Le figure della dottrina della nazione: un'armata tedesca ha soldatini tedeschi, una britannica soldatini alleati. È lo stesso sistema delle foto nelle schede delle unità.
