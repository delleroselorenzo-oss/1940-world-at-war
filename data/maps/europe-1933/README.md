# Mappa "Europa 1933" — bozza generata

File generati da `npm run map:build`: **non modificarli a mano**, cambia `config.json` o lo script e rigenera.

| File | Contenuto |
|---|---|
| `config.json` | Parametri: data dei confini, nazioni incluse (con nome e colore), soglie di area, nomi storici |
| `map.json` | Dati di gioco (`MapData` di `@waw/shared`): nazioni, province, confinanti con distanze in km |
| `provinces.geojson` | Forme delle province (semplificate ~2 km) per il rendering nel client |
| `preview.html` | Anteprima per controllare la bozza a occhio (apribile con doppio clic) |
| `nav.config.json` | Parametri della rete di movimento: quali fiumi fanno da ostacolo, quali strade e ferrovie |
| `nav.json` | Rete di movimento: griglia della terraferma, fiumi, strade, ferrovie, ponti (`NavData` di `@waw/shared`) |

## Come viene costruita

Lo script è [`data/scripts/build-europe-1933.ts`](../../scripts/build-europe-1933.ts).

1. **Confini degli stati** alla data di `config.json` (1° giugno 1933) da CShapes 2.0.
2. **Suddivisioni amministrative moderne** di Natural Earth, ritagliate dentro i confini del 1933.
3. **Griglia** di ~2 km su cui vengono "dipinti" i pezzi, per capire chi confina con chi e chi tocca il mare.
4. **Accorpamento**: i pezzi più piccoli della soglia si uniscono ai vicini della stessa nazione. I pezzi troppo grandi (nord della Russia) vengono tagliati a metà.
5. **Città**: la capitale e le città più popolose (popolazione 1950) diventano province urbane, fino a 5 per nazione.
6. **Risorse principali**: prima i riferimenti storici e i giacimenti di petrolio (`economy.oilFields`), poi le città di ogni nazione prendono risorse diverse tra loro, e circa un terzo delle province rurali riceve una risorsa (mai il petrolio).
7. **Popolazione e sviluppo** (`economy` in `config.json`): popolazione del 1933, quota urbana e PIL pro capite per nazione; la popolazione si divide tra le province secondo le città (parte urbana) e la superficie (parte rurale, meno a nord e a est), con alcune correzioni a mano; lo sviluppo è quello nazionale con correzioni regionali.

## Rete di movimento

Script: [`data/scripts/build-nav.ts`](../../scripts/build-nav.ts), eseguito dopo quello delle province.

1. **Griglia** di 0,1° (~8–11 km): ogni cella prende la provincia che ne contiene il centro.
2. **Grandi fiumi** (Natural Earth `rivers_lake_centerlines`, scalerank ≤ 6 più quelli in `include`): bloccano il passaggio fuori strada tra celle.
3. **Strade e ferrovie** principali (Natural Earth `roads` e `railroads`, scalerank ≤ 6), semplificate a un punto ogni ~5 km mantenendo gli incroci.
4. **Ponti**: ogni tratto di strada o ferrovia che attraversa un grande fiume (~580).

File grezzi necessari in `data/raw/` (da <https://github.com/nvkelso/natural-earth-vector/tree/master/geojson>): `ne_10m_rivers_lake_centerlines.geojson`, `ne_10m_roads.geojson`, `ne_10m_railroads.geojson`.

Le strade sono **moderne** (Natural Earth): i grandi tracciati sono simili a quelli degli anni '30, ma non identici.

## Limiti noti della bozza (da sistemare)

- Il **terreno** non è ancora assegnato (`null`). Le **risorse principali** sì: vedi `resources` in `config.json` (riferimenti storici in `overrides`, il resto in modo deterministico).
- Le **suddivisioni sono moderne**: alcune province hanno confini o nomi non del 1933. I nomi storici più importanti sono in `renames` dentro `config.json`.
- Le province della **Russia settentrionale** tagliate a metà hanno confini dritti e nomi come "Arcangelo (sud-ovest)".
- Alcune province accorpate sono **allungate** (es. Krasnodar, Stoccolma), quindi la distanza tra centri non rappresenta bene il percorso.
- **Isole senza confini via terra** (Sardegna, Corsica, Creta, Baleari, Gotland…): serviranno i collegamenti via mare, da definire insieme alle zone di mare.
- **Escluse per ora**: colonie e Nord Africa, Islanda (non presente nei dati CShapes del 1933), Malta, Cipro. L'URSS è tagliata a est a 60° di longitudine e senza l'Asia centrale.

## Fonti e licenze

- **CShapes 2.0** — Schvitz, Girardin, Rüegger, Weidmann, Cederman, Gleditsch, *Mapping the International System, 1886–2019: The CShapes 2.0 Dataset*, Journal of Conflict Resolution, 2022. ETH Zurigo, <https://icr.ethz.ch/data/cshapes/>. Licenza **CC BY-NC-SA 4.0**: uso non commerciale con attribuzione. I dati derivati (questa mappa) vanno condivisi con la stessa licenza.
- **Natural Earth** — suddivisioni amministrative e città, <https://www.naturalearthdata.com/>. **Pubblico dominio**.
- **Dati economici** (`economy` in `config.json`): popolazioni nazionali dei censimenti degli anni '30 e PIL pro capite del Maddison Project (<https://www.rug.nl/ggdc/historicaldevelopment/maddison/>), arrotondati; produzione di petrolio del 1938 da statistiche storiche. Sono stime approssimate per il gioco.

I file grezzi vengono scaricati in `data/raw/`, che è escluso dal versionamento.
