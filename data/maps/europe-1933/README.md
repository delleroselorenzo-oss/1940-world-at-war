# Mappa "Europa 1933" — bozza generata

File generati da `npm run map:build`: **non modificarli a mano**, cambia `config.json` o lo script e rigenera.

| File | Contenuto |
|---|---|
| `config.json` | Parametri: data dei confini, nazioni incluse (con nome e colore), soglie di area, nomi storici |
| `map.json` | Dati di gioco (`MapData` di `@waw/shared`): nazioni, province, confinanti con distanze in km |
| `provinces.geojson` | Forme delle province (semplificate ~2 km) per il rendering nel client |
| `preview.html` | Anteprima per controllare la bozza a occhio (apribile con doppio clic) |

## Come viene costruita

Lo script è [`data/scripts/build-europe-1933.ts`](../../scripts/build-europe-1933.ts).

1. **Confini degli stati** alla data di `config.json` (1° giugno 1933) da CShapes 2.0.
2. **Suddivisioni amministrative moderne** di Natural Earth, ritagliate dentro i confini del 1933.
3. **Griglia** di ~2 km su cui vengono "dipinti" i pezzi, per capire chi confina con chi e chi tocca il mare.
4. **Accorpamento**: i pezzi più piccoli della soglia si uniscono ai vicini della stessa nazione. I pezzi troppo grandi (nord della Russia) vengono tagliati a metà.
5. **Città**: la capitale e le città più popolose (popolazione 1950) diventano province urbane, fino a 5 per nazione.

## Limiti noti della bozza (da sistemare)

- **Terreno e risorse** non sono ancora assegnati (`null`).
- Le **suddivisioni sono moderne**: alcune province hanno confini o nomi non del 1933. I nomi storici più importanti sono in `renames` dentro `config.json`.
- Le province della **Russia settentrionale** tagliate a metà hanno confini dritti e nomi come "Arcangelo (sud-ovest)".
- Alcune province accorpate sono **allungate** (es. Krasnodar, Stoccolma), quindi la distanza tra centri non rappresenta bene il percorso.
- **Isole senza confini via terra** (Sardegna, Corsica, Creta, Baleari, Gotland…): serviranno i collegamenti via mare, da definire insieme alle zone di mare.
- **Escluse per ora**: colonie e Nord Africa, Islanda (non presente nei dati CShapes del 1933), Malta, Cipro. L'URSS è tagliata a est a 60° di longitudine e senza l'Asia centrale.

## Fonti e licenze

- **CShapes 2.0** — Schvitz, Girardin, Rüegger, Weidmann, Cederman, Gleditsch, *Mapping the International System, 1886–2019: The CShapes 2.0 Dataset*, Journal of Conflict Resolution, 2022. ETH Zurigo, <https://icr.ethz.ch/data/cshapes/>. Licenza **CC BY-NC-SA 4.0**: uso non commerciale con attribuzione. I dati derivati (questa mappa) vanno condivisi con la stessa licenza.
- **Natural Earth** — suddivisioni amministrative e città, <https://www.naturalearthdata.com/>. **Pubblico dominio**.

I file grezzi vengono scaricati in `data/raw/`, che è escluso dal versionamento.
