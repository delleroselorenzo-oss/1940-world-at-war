// Disegna la mappa base del rilievo per "Europa 1933" (solo grafica: il terreno di gioco delle province non cambia,
// vedi docs/game-design.md §9 "Modalità della mappa"):
//  - colore del suolo dalla copertura MODIS (boschi verdi, campi e prati verde chiaro, zone aride ocra);
//  - salendo di quota il colore vira alla roccia e, sulle vette più alte, alla neve;
//  - un'ombreggiatura leggera da nord-ovest, calcolata da un'altitudine ammorbidita: si vedono le grandi catene,
//    non ogni singola montagna.
// L'immagine è nella stessa proiezione del client (mapProject) e copre solo le province del gioco;
// fuori è del colore del mare. Usa le tessere già scaricate da build-terrain.ts (data/raw/elevation e landcover).
//
// Scrive data/maps/europe-1933/relief.jpg e relief.json (dove va messa l'immagine, in km proiettati).

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import jpeg from "jpeg-js";
import { mapProject, mapUnproject } from "@waw/shared";
import { decodePng } from "./lib/png.js";
import { Raster } from "./lib/raster.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAW = join(ROOT, "raw");
const OUT = join(ROOT, "maps", "europe-1933");

/** Lato di un pixel dell'immagine, in km proiettati. */
const PIXEL_KM = 1.3;
/** Passo delle griglie intermedie in gradi (altitudine, copertura del suolo, province). */
const GRID_DEG = 0.0125;
const ELEVATION_ZOOM = 7;
const LANDCOVER_STEP = 0.01;
/** Colore del mare: lo stesso dello sfondo della mappa (MapRenderer). */
const SEA: RGB = [0xa9, 0xc4, 0xd4];

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Tipi di suolo usati per il colore, dalla copertura MODIS (IGBP) di GIBS. */
const SOIL_COLORS = {
  forest: hex("#a9bd8f"),
  woodland: hex("#bfcc9c"),
  meadow: hex("#d4dbaa"),
  crops: hex("#dcdcb2"),
  arid: hex("#e3d3a2"),
  tundra: hex("#cdd2bd"),
  wetland: hex("#bccbb4"),
  snow: hex("#f4f5f2"),
  water: hex("#b4cbd8"),
} as const;
type Soil = keyof typeof SOIL_COLORS;
const SOILS = Object.keys(SOIL_COLORS) as Soil[];

const LANDCOVER: Record<string, Soil> = {
  "33,138,33": "forest",
  "49,204,49": "forest",
  "152,204,49": "forest",
  "150,250,150": "forest",
  "141,186,141": "forest",
  "218,235,157": "woodland",
  "250,239,115": "meadow",
  "255,213,0": "meadow",
  "153,147,86": "meadow",
  "240,185,103": "crops",
  "255,0,0": "crops",
  "245,222,179": "arid",
  "186,141,141": "arid",
  "191,191,189": "tundra",
  "71,131,181": "wetland",
  "255,255,255": "snow",
  "134,202,227": "water",
};

/** Sopra questa latitudine gli arbusteti sono tundra, non zone aride. */
const TUNDRA_LAT = 56;

/** Colori della quota: roccia, roccia alta, neve. */
const ROCK = hex("#b8a78e");
const HIGH_ROCK = hex("#c5c0b8");
const SNOW = hex("#f6f6f3");

function main() {
  const mapConfig = JSON.parse(readFileSync(join(OUT, "config.json"), "utf8")) as { bbox: [number, number, number, number] };
  const shapes = JSON.parse(readFileSync(join(OUT, "provinces.geojson"), "utf8")) as FeatureCollection<Polygon | MultiPolygon, { id: string }>;
  const bbox = mapConfig.bbox;

  console.log("· Province");
  const land = new Raster(bbox, GRID_DEG);
  for (const f of shapes.features) land.fill(f.geometry, 1);

  console.log("· Altitudine");
  const elevation = elevationGrid(new Raster(bbox, GRID_DEG));
  console.log("· Copertura del suolo");
  const soil = soilGrid(new Raster(bbox, GRID_DEG));

  // Estensione dell'immagine: le province proiettate.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const f of shapes.features) {
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const p of polys)
      for (const [lng, lat] of p[0]!) {
        const [x, y] = mapProject([lng!, lat!]);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
  }
  minX = Math.floor(minX) - 10;
  minY = Math.floor(minY) - 10;
  const width = Math.ceil((maxX + 10 - minX) / PIXEL_KM);
  const height = Math.ceil((maxY + 10 - minY) / PIXEL_KM);
  console.log(`· Immagine ${width}×${height} pixel (${PIXEL_KM} km per pixel)`);

  // Per ogni pixel: terra o mare, altitudine e colore del suolo.
  const n = width * height;
  const isLand = new Uint8Array(n);
  const height0 = new Float32Array(n);
  const color = new Float32Array(n * 3);
  for (let py = 0; py < height; py++)
    for (let px = 0; px < width; px++) {
      const i = py * width + px;
      const [lng, lat] = mapUnproject([minX + (px + 0.5) * PIXEL_KM, minY + (py + 0.5) * PIXEL_KM]);
      const cell = land.indexOf(lng, lat);
      if (cell < 0) continue;
      height0[i] = Math.max(0, elevation[cell]!);
      if (land.cells[cell]! <= 0) continue;
      isLand[i] = 1;
      const c = SOIL_COLORS[SOILS[soil[cell]!]!];
      color[i * 3] = c[0];
      color[i * 3 + 1] = c[1];
      color[i * 3 + 2] = c[2];
    }

  // Suolo un po' sfumato (niente puntini), altitudine ammorbidita per i colori e molto di più per le ombre.
  for (let k = 0; k < 3; k++) blurChannel(color, width, height, 3, k, 1.6, isLand);
  const tint = blurred(height0, width, height, 1.5);
  const relief = blurred(height0, width, height, 3);

  console.log("· Colori e ombre");
  const rgb = new Uint8Array(n * 4);
  // Luce da nord-ovest, alta 40° sull'orizzonte; dislivelli esagerati perché l'altitudine è ammorbidita.
  const alt = (40 * Math.PI) / 180;
  const L = [-Math.cos(alt) * Math.SQRT1_2, -Math.cos(alt) * Math.SQRT1_2, Math.sin(alt)];
  const exaggeration = 2.5;
  const spacing = PIXEL_KM * 1000 * 2;
  for (let py = 0; py < height; py++)
    for (let px = 0; px < width; px++) {
      const i = py * width + px;
      let c: RGB = SEA;
      if (isLand[i]) {
        const h = tint[i]!;
        c = [color[i * 3]!, color[i * 3 + 1]!, color[i * 3 + 2]!];
        c = mix(c, ROCK, smooth(500, 1600, h) * 0.6);
        c = mix(c, HIGH_ROCK, smooth(1600, 2400, h) * 0.7);
        c = mix(c, SNOW, smooth(2300, 3000, h) * 0.9);
        const dx = (relief[i + (px < width - 1 ? 1 : 0)]! - relief[i - (px > 0 ? 1 : 0)]!) / spacing;
        const dy = (relief[i + (py < height - 1 ? width : 0)]! - relief[i - (py > 0 ? width : 0)]!) / spacing;
        const nx = -dx * exaggeration;
        const ny = -dy * exaggeration;
        const len = Math.hypot(nx, ny, 1);
        const light = (nx * L[0]! + ny * L[1]! + L[2]!) / len / L[2]!;
        const shade = Math.max(0.72, Math.min(1.12, 1 + (light - 1) * 0.55));
        c = [c[0] * shade, c[1] * shade, c[2] * shade];
      }
      rgb[i * 4] = clamp(c[0]);
      rgb[i * 4 + 1] = clamp(c[1]);
      rgb[i * 4 + 2] = clamp(c[2]);
      rgb[i * 4 + 3] = 255;
    }

  const file = jpeg.encode({ data: rgb, width, height }, 82);
  writeFileSync(join(OUT, "relief.jpg"), file.data);
  writeFileSync(join(OUT, "relief.json"), JSON.stringify({ x: minX, y: minY, width: width * PIXEL_KM, height: height * PIXEL_KM }, null, 2) + "\n");
  console.log(`  relief.jpg ${(file.data.length / 1e6).toFixed(1)} MB`);
}

/** Altitudine media (metri) per cella, dalle tessere "terrarium" già scaricate. */
function elevationGrid(grid: Raster): Float32Array {
  const sum = new Float32Array(grid.width * grid.height);
  const count = new Uint16Array(sum.length);
  const dir = join(RAW, "elevation", String(ELEVATION_ZOOM));
  const n = 2 ** ELEVATION_ZOOM;
  for (const name of readdirSync(dir)) {
    const [x, y] = name.replace(".png", "").split("-").map(Number) as [number, number];
    const img = decodePng(readFileSync(join(dir, name)));
    for (let py = 0; py < img.height; py++) {
      const lat = latOf((y + (py + 0.5) / img.height) / n);
      for (let px = 0; px < img.width; px++) {
        const cell = grid.indexOf(((x + (px + 0.5) / img.width) / n) * 360 - 180, lat);
        if (cell < 0) continue;
        const o = (py * img.width + px) * img.channels;
        sum[cell]! += img.data[o]! * 256 + img.data[o + 1]! + img.data[o + 2]! / 256 - 32768;
        count[cell]!++;
      }
    }
  }
  return fillGaps(sum.map((s, i) => (count[i]! > 0 ? s / count[i]! : NaN)), grid.width, grid.height);
}

/** Tipo di suolo (indice in SOILS) per cella, dalle immagini della copertura già scaricate. */
function soilGrid(grid: Raster): Uint8Array {
  const out = new Uint8Array(grid.width * grid.height).fill(SOILS.indexOf("crops"));
  const dir = join(RAW, "landcover");
  for (const name of readdirSync(dir)) {
    const [lng, lat] = name.replace(".png", "").split("_").map(Number) as [number, number];
    const img = decodePng(readFileSync(join(dir, name)));
    const top = lat + img.height * LANDCOVER_STEP;
    for (let py = 0; py < img.height; py++)
      for (let px = 0; px < img.width; px++) {
        const o = (py * img.width + px) * img.channels;
        if (img.channels === 4 && img.data[o + 3] === 0) continue;
        let soil = LANDCOVER[`${img.data[o]},${img.data[o + 1]},${img.data[o + 2]}`];
        if (!soil) continue;
        const plat = top - (py + 0.5) * LANDCOVER_STEP;
        if (soil === "arid" && plat > TUNDRA_LAT) soil = "tundra";
        const cell = grid.indexOf(lng + (px + 0.5) * LANDCOVER_STEP, plat);
        if (cell >= 0) out[cell] = SOILS.indexOf(soil);
      }
  }
  return out;
}

/** Riempie le celle senza dati con la media dei vicini (le tessere hanno qualche buco ai bordi). */
function fillGaps(values: Float32Array, width: number, height: number): Float32Array {
  for (let pass = 0; pass < 4; pass++)
    for (let i = 0; i < values.length; i++) {
      if (!Number.isNaN(values[i]!)) continue;
      const x = i % width;
      const y = Math.floor(i / width);
      let s = 0;
      let c = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const v = values[ny * width + nx]!;
        if (!Number.isNaN(v)) {
          s += v;
          c++;
        }
      }
      if (c > 0) values[i] = s / c;
    }
  return values.map((v) => (Number.isNaN(v) ? 0 : v));
}

function blurred(values: Float32Array, width: number, height: number, sigma: number): Float32Array {
  const copy = Float32Array.from(values);
  blurChannel(copy, width, height, 1, 0, sigma);
  return copy;
}

/**
 * Sfocatura gaussiana (approssimata con tre passate di media mobile) del canale `k` di un'immagine a `stride` canali.
 * Con `mask` si sfuma solo tra pixel di terra: il mare non "sporca" il colore delle coste.
 */
function blurChannel(data: Float32Array, width: number, height: number, stride: number, k: number, sigma: number, mask?: Uint8Array) {
  const r = Math.max(1, Math.round(sigma * 1.2));
  const line = new Float32Array(Math.max(width, height));
  const weight = new Float32Array(line.length);
  const pass = (len: number, at: (j: number) => number) => {
    for (let rep = 0; rep < 3; rep++) {
      let s = 0;
      let w = 0;
      const val = (j: number) => (mask && !mask[at(j)] ? 0 : data[at(j) * stride + k]!);
      const wt = (j: number) => (mask && !mask[at(j)] ? 0 : 1);
      for (let j = 0; j < Math.min(r, len); j++) {
        s += val(j);
        w += wt(j);
      }
      for (let j = 0; j < len; j++) {
        if (j + r < len) {
          s += val(j + r);
          w += wt(j + r);
        }
        if (j - r - 1 >= 0) {
          s -= val(j - r - 1);
          w -= wt(j - r - 1);
        }
        line[j] = s;
        weight[j] = w;
      }
      for (let j = 0; j < len; j++) if (!mask || mask[at(j)]) data[at(j) * stride + k] = weight[j]! > 0 ? line[j]! / weight[j]! : 0;
    }
  };
  for (let y = 0; y < height; y++) pass(width, (j) => y * width + j);
  for (let x = 0; x < width; x++) pass(height, (j) => j * width + x);
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Da 0 sotto `from` a 1 sopra `to`, con un passaggio morbido. */
function smooth(from: number, to: number, v: number): number {
  const t = Math.max(0, Math.min(1, (v - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/** Latitudine dalla y di Mercatore normalizzata (0 in alto, 1 in basso). */
function latOf(y: number): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
}

main();
