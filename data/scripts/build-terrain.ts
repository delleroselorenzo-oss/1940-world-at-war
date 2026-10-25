// Assegna il terreno a ogni provincia della mappa "Europa 1933" (un solo terreno per provincia,
// vedi docs/game-design.md §9 "Terreno"):
//  1. rilievo da dati di altitudine reali (tessere "terrarium" di Mapzen/AWS, ~1 km per pixel):
//     per ogni cella di 0,1° (~10 km) il dislivello tra i punti più alti e più bassi;
//  2. foreste dalla copertura del suolo MODIS (NASA GIBS, ~1 km per pixel);
//  3. per ogni provincia le quote di celle montuose, collinari e boscose decidono il terreno,
//     con le correzioni a mano di `terrain.config.json`.
// La zona di città delle province urbane non è qui: la aggiunge build-nav.ts nella griglia.
//
// Va eseguito dopo build-europe-1933.ts e prima di build-nav.ts; scrive il campo `terrain` in map.json.
// Le tessere scaricate restano in data/raw/elevation e data/raw/landcover.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { MapData, Terrain } from "@waw/shared";
import { decodePng, type Image } from "./lib/png.js";
import { Raster } from "./lib/raster.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAW = join(ROOT, "raw");
const OUT = join(ROOT, "maps", "europe-1933");

interface TerrainConfig {
  /** Dislivello in metri dentro una cella: sotto `hillsM` è piana, da `mountainsM` in su è montuosa. */
  reliefM: { hillsM: number; mountainsM: number };
  /** Quote di celle (0–1) che decidono il terreno della provincia. */
  shares: { mountains: number; forest: number; hills: number };
  /** Correzioni a mano: id della provincia → terreno (con il motivo nel campo `_why`). */
  overrides: Record<string, Terrain>;
}

const STEP = 0.1;
const ELEVATION_ZOOM = 7;
const LANDCOVER_STEP = 0.01;
const LANDCOVER_CHUNK = 6;

/** Colori della copertura MODIS (IGBP) su GIBS → quota di bosco: 1–5 foreste, 8 savane alberate (metà). */
const FOREST_COLORS: Record<string, number> = {
  "33,138,33": 1,
  "49,204,49": 1,
  "152,204,49": 1,
  "150,250,150": 1,
  "141,186,141": 1,
  "218,235,157": 0.5,
};

async function main() {
  const config = JSON.parse(readFileSync(join(OUT, "terrain.config.json"), "utf8")) as TerrainConfig;
  const mapConfig = JSON.parse(readFileSync(join(OUT, "config.json"), "utf8")) as { bbox: [number, number, number, number] };
  const map = JSON.parse(readFileSync(join(OUT, "map.json"), "utf8")) as MapData;
  const shapes = JSON.parse(readFileSync(join(OUT, "provinces.geojson"), "utf8")) as FeatureCollection<Polygon | MultiPolygon, { id: string }>;
  const bbox = mapConfig.bbox;

  // Celle di 0,1° con la provincia, come nella rete di movimento.
  const ids = map.provinces.map((p) => p.id);
  const indexOf = new Map(ids.map((id, i) => [id, i + 1]));
  const raster = new Raster(bbox, STEP);
  const ordered = [...shapes.features].sort((a, b) => roughArea(b.geometry) - roughArea(a.geometry));
  for (const f of ordered) raster.fill(f.geometry, indexOf.get(f.properties.id)!);
  const cellCount = raster.width * raster.height;

  console.log("· Altitudine");
  const relief = await reliefPerCell(raster);
  console.log("· Copertura del suolo");
  const forest = await forestPerCell(raster);

  // Quote per provincia.
  const stats = ids.map(() => ({ cells: 0, mountains: 0, hills: 0, forest: 0, relief: 0 }));
  for (let i = 0; i < cellCount; i++) {
    const v = raster.cells[i]!;
    if (v <= 0) continue;
    const s = stats[v - 1]!;
    const r = relief[i]!;
    s.cells++;
    s.relief += r;
    if (r >= config.reliefM.mountainsM) s.mountains++;
    else if (r >= config.reliefM.hillsM) s.hills++;
    s.forest += forest[i]!;
  }

  const counts: Record<string, number> = {};
  const report: string[] = [];
  map.provinces.forEach((p, i) => {
    const s = stats[i]!;
    if (s.cells === 0) {
      // Provincia più piccola di una cella: si guarda la cella del suo centro.
      const c = raster.indexOf(p.center[0], p.center[1]);
      s.cells = 1;
      s.relief = relief[c] ?? 0;
      s.mountains = s.relief >= config.reliefM.mountainsM ? 1 : 0;
      s.hills = s.relief >= config.reliefM.hillsM && !s.mountains ? 1 : 0;
      s.forest = forest[c] ?? 0;
    }
    const m = s.mountains / s.cells;
    const h = s.hills / s.cells;
    const f = s.forest / s.cells;
    const auto: Terrain =
      m >= config.shares.mountains ? "mountains" : f >= config.shares.forest ? "forest" : m + h >= config.shares.hills ? "hills" : "plains";
    const terrain = config.overrides[p.id] ?? auto;
    p.terrain = terrain;
    counts[terrain] = (counts[terrain] ?? 0) + 1;
    report.push(
      `${p.id}\t${p.name}\t${terrain}${terrain !== auto ? ` (calcolato: ${auto})` : ""}\tmontagna ${pct(m)} collina ${pct(h)} bosco ${pct(f)} dislivello medio ${Math.round(s.relief / s.cells)} m`,
    );
  });
  writeFileSync(join(OUT, "map.json"), JSON.stringify(map, null, 2) + "\n");
  writeFileSync(join(RAW, "terrain-report.tsv"), report.join("\n") + "\n");
  console.log(
    `  ${Object.entries(counts)
      .map(([t, n]) => `${t} ${n}`)
      .join(", ")}`,
  );
  console.log(`  dettaglio per provincia in data/raw/terrain-report.tsv`);
}

/** Dislivello (metri) in ogni cella: differenza tra il 98° e il 2° percentile delle altitudini sopra il livello del mare. */
async function reliefPerCell(raster: Raster): Promise<Float32Array> {
  const [lng0, lat0, lng1, lat1] = raster.bbox;
  const n = 2 ** ELEVATION_ZOOM;
  const tx0 = Math.floor(((lng0 + 180) / 360) * n);
  const tx1 = Math.floor(((lng1 + 180) / 360) * n);
  const ty0 = Math.floor(mercY(lat1) * n);
  const ty1 = Math.floor(mercY(lat0) * n);
  const samples: number[][] = Array.from({ length: raster.width * raster.height }, () => []);
  const tiles: [number, number][] = [];
  for (let x = tx0; x <= tx1; x++) for (let y = ty0; y <= ty1; y++) tiles.push([x, y]);
  await pool(tiles, 8, async ([x, y]) => {
    const file = join(RAW, "elevation", String(ELEVATION_ZOOM), `${x}-${y}.png`);
    const img = await cached(file, `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${ELEVATION_ZOOM}/${x}/${y}.png`);
    for (let py = 0; py < img.height; py++) {
      const lat = latOf((y + (py + 0.5) / img.height) / n);
      for (let px = 0; px < img.width; px++) {
        const lng = ((x + (px + 0.5) / img.width) / n) * 360 - 180;
        const cell = raster.indexOf(lng, lat);
        if (cell < 0 || raster.cells[cell]! <= 0) continue;
        const o = (py * img.width + px) * img.channels;
        const h = img.data[o]! * 256 + img.data[o + 1]! + img.data[o + 2]! / 256 - 32768;
        if (h > 0) samples[cell]!.push(h);
      }
    }
  });
  const out = new Float32Array(samples.length);
  samples.forEach((s, i) => {
    if (s.length < 2) return;
    s.sort((a, b) => a - b);
    out[i] = s[Math.floor((s.length - 1) * 0.98)]! - s[Math.floor((s.length - 1) * 0.02)]!;
  });
  return out;
}

/** Quota di bosco (0–1) in ogni cella. */
async function forestPerCell(raster: Raster): Promise<Float32Array> {
  const [lng0, lat0, lng1, lat1] = raster.bbox;
  const sum = new Float32Array(raster.width * raster.height);
  const count = new Uint16Array(sum.length);
  const chunks: [number, number][] = [];
  for (let lng = lng0; lng < lng1; lng += LANDCOVER_CHUNK) for (let lat = lat0; lat < lat1; lat += LANDCOVER_CHUNK) chunks.push([lng, lat]);
  const size = Math.round(LANDCOVER_CHUNK / LANDCOVER_STEP);
  await pool(chunks, 4, async ([lng, lat]) => {
    const file = join(RAW, "landcover", `${lng}_${lat}.png`);
    const url =
      "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap" +
      `&LAYERS=MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual&STYLES=&CRS=EPSG:4326&BBOX=${lat},${lng},${lat + LANDCOVER_CHUNK},${lng + LANDCOVER_CHUNK}` +
      `&WIDTH=${size}&HEIGHT=${size}&FORMAT=image/png&TIME=2020-01-01`;
    const img = await cached(file, url);
    for (let py = 0; py < img.height; py++) {
      const plat = lat + LANDCOVER_CHUNK - (py + 0.5) * LANDCOVER_STEP;
      for (let px = 0; px < img.width; px++) {
        const cell = raster.indexOf(lng + (px + 0.5) * LANDCOVER_STEP, plat);
        if (cell < 0 || raster.cells[cell]! <= 0) continue;
        const o = (py * img.width + px) * img.channels;
        if (img.channels === 4 && img.data[o + 3] === 0) continue;
        const key = `${img.data[o]},${img.data[o + 1]},${img.data[o + 2]}`;
        if (key === "134,202,227") continue; // acqua
        sum[cell]! += FOREST_COLORS[key] ?? 0;
        count[cell]!++;
      }
    }
  });
  return sum.map((s, i) => (count[i]! > 0 ? s / count[i]! : 0));
}

/** Legge il PNG da `file`, scaricandolo da `url` la prima volta. */
async function cached(file: string, url: string): Promise<Image> {
  if (!existsSync(file)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} scaricando ${url}`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, new Uint8Array(await res.arrayBuffer()));
  }
  return decodePng(readFileSync(file));
}

async function pool<T>(items: T[], size: number, run: (item: T) => Promise<void>) {
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        await run(items[next++]!);
        if (++done % 50 === 0) console.log(`  ${done}/${items.length}`);
      }
    }),
  );
}

const mercY = (lat: number) => {
  const r = (lat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2;
};
const latOf = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
const pct = (x: number) => `${Math.round(x * 100)}%`;

function roughArea(g: Polygon | MultiPolygon): number {
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  let area = 0;
  for (const rings of polys) {
    const ring = rings[0]!;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) area += ring[j]![0]! * ring[i]![1]! - ring[i]![0]! * ring[j]![1]!;
  }
  return Math.abs(area / 2);
}

main();
