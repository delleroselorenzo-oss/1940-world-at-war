// Prepara le pedine dipinte della mappa (docs/pedine.md) a partire dalle immagini grandi in icone/:
//  - icone/icone <dottrina>/icone pedine/<id>.png → client/src/assets/tokens/<dottrina>/<id>.png
//  - icone/icone in comune/<id>.png (trasporto, convoglio: uguali per tutti) → client/src/assets/tokens/common/<id>.png
// Per ogni immagine: se non ha la trasparenza toglie lo sfondo chiaro attaccato ai bordi (bianco o la scacchiera finta
// che alcuni generatori disegnano), ritaglia la figura e la rimpicciolisce perché stia in un quadrato di SIZE pixel.
//
// Uso: npm run build:tokens -w data

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng, encodePng } from "./lib/png.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ICONS = join(ROOT, "icone");
const OUT = join(ROOT, "client", "src", "assets", "tokens");

/** Lato massimo della figura in pixel: la pedina sulla mappa è di circa 40 pixel, così resta nitida anche sugli schermi Retina. */
const SIZE = 128;
/** Margine trasparente intorno alla figura ritagliata, in pixel dell'immagine finale. */
const MARGIN = 2;
/** Sopra questa opacità un pixel conta come figura quando si ritaglia. */
const SOLID = 24;

const SOURCES: { dir: string; out: string }[] = [
  { dir: "icone alleati/icone pedine", out: "allies" },
  { dir: "icone nazisti/icone pedine", out: "nazi" },
  { dir: "icone comunisti/icone pedine", out: "communist" },
  { dir: "icone nipponici/icone pedine", out: "japanese" },
  { dir: "icone in comune", out: "common" },
];

interface Rgba {
  width: number;
  height: number;
  data: Uint8Array;
}

function load(path: string): Rgba {
  const img = decodePng(readFileSync(path));
  if (img.channels === 4) return { width: img.width, height: img.height, data: img.data };
  const data = new Uint8Array(img.width * img.height * 4);
  for (let i = 0, j = 0; i < img.data.length; i += 3, j += 4) data.set([img.data[i]!, img.data[i + 1]!, img.data[i + 2]!, 255], j);
  return { width: img.width, height: img.height, data };
}

/** L'immagine ha già uno sfondo trasparente (qualche pixel del bordo lo è)? */
function hasTransparentBorder(img: Rgba): boolean {
  const { width: w, height: h, data } = img;
  for (let x = 0; x < w; x++) if (data[x * 4 + 3]! < 250 || data[((h - 1) * w + x) * 4 + 3]! < 250) return true;
  for (let y = 0; y < h; y++) if (data[y * w * 4 + 3]! < 250 || data[(y * w + w - 1) * 4 + 3]! < 250) return true;
  return false;
}

/** Pixel chiaro e quasi grigio: sfondo bianco o scacchiera. */
function isBackdrop(data: Uint8Array, i: number, minLight: number): boolean {
  const r = data[i]!;
  const g = data[i + 1]!;
  const b = data[i + 2]!;
  return Math.min(r, g, b) >= minLight && Math.max(r, g, b) - Math.min(r, g, b) <= 18;
}

/** Toglie lo sfondo chiaro attaccato ai bordi (riempimento dai bordi), poi sfuma l'alone chiaro rimasto sul contorno. */
function removeBackdrop(img: Rgba): void {
  const { width: w, height: h, data } = img;
  const clear = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (p: number) => {
    if (!clear[p] && isBackdrop(data, p * 4, 190)) {
      clear[p] = 1;
      stack.push(p);
    }
  };
  for (let x = 0; x < w; x++) push(x), push((h - 1) * w + x);
  for (let y = 0; y < h; y++) push(y * w), push(y * w + w - 1);
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (p >= w) push(p - w);
    if (p < w * (h - 1)) push(p + w);
  }
  for (let p = 0; p < w * h; p++) if (clear[p]) data[p * 4 + 3] = 0;
  // Contorno: i pixel chiari accanto allo sfondo tolto sono l'alone della scontornatura, li si rende semitrasparenti.
  for (let p = 0; p < w * h; p++) {
    if (clear[p]) continue;
    const x = p % w;
    const near = (x > 0 && clear[p - 1]) || (x < w - 1 && clear[p + 1]) || (p >= w && clear[p - w]) || (p < w * (h - 1) && clear[p + w]);
    if (near && isBackdrop(data, p * 4, 150)) data[p * 4 + 3] = 90;
  }
}

/** Rettangolo che contiene la figura. */
function bounds(img: Rgba): { x0: number; y0: number; x1: number; y1: number } {
  const { width: w, height: h, data } = img;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[(y * w + x) * 4 + 3]! > SOLID) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) throw new Error("immagine vuota");
  return { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/** Ritaglia e rimpicciolisce con la media dei pixel coperti (colori pesati per l'opacità, così i bordi non diventano scuri). */
function cropAndScale(img: Rgba): Rgba {
  const { x0, y0, x1, y1 } = bounds(img);
  const cw = x1 - x0;
  const ch = y1 - y0;
  const k = Math.min(1, (SIZE - 2 * MARGIN) / Math.max(cw, ch));
  const fw = Math.max(1, Math.round(cw * k));
  const fh = Math.max(1, Math.round(ch * k));
  const width = fw + 2 * MARGIN;
  const height = fh + 2 * MARGIN;
  const data = new Uint8Array(width * height * 4);
  for (let oy = 0; oy < fh; oy++) {
    const sy0 = y0 + (oy * ch) / fh;
    const sy1 = y0 + ((oy + 1) * ch) / fh;
    for (let ox = 0; ox < fw; ox++) {
      const sx0 = x0 + (ox * cw) / fw;
      const sx1 = x0 + ((ox + 1) * cw) / fw;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let area = 0;
      for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy++) {
        const wy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
        for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx++) {
          const wgt = wy * (Math.min(sx + 1, sx1) - Math.max(sx, sx0));
          const i = (sy * img.width + sx) * 4;
          const al = img.data[i + 3]! * wgt;
          r += img.data[i]! * al;
          g += img.data[i + 1]! * al;
          b += img.data[i + 2]! * al;
          a += al;
          area += wgt;
        }
      }
      const o = ((oy + MARGIN) * width + ox + MARGIN) * 4;
      if (a > 0) data.set([Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round(a / area)], o);
    }
  }
  return { width, height, data };
}

let count = 0;
for (const { dir, out } of SOURCES) {
  const from = join(ICONS, dir);
  if (!existsSync(from)) continue;
  const files = readdirSync(from).filter((f) => f.toLowerCase().endsWith(".png"));
  if (files.length === 0) continue;
  mkdirSync(join(OUT, out), { recursive: true });
  for (const file of files) {
    const img = load(join(from, file));
    const cleaned = !hasTransparentBorder(img);
    if (cleaned) removeBackdrop(img);
    const token = cropAndScale(img);
    writeFileSync(join(OUT, out, basename(file).replace(/\.png$/i, ".png")), encodePng(token.width, token.height, token.data));
    console.log(`${out}/${file}: ${token.width}×${token.height}${cleaned ? " (sfondo tolto)" : ""}`);
    count++;
  }
}
console.log(`${count} pedine in ${OUT}`);
