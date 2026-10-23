import type { LngLat } from "../map/types.js";
import { BLOCK_EAST, BLOCK_SOUTH, BLOCK_SOUTH_EAST, BLOCK_SOUTH_WEST, type NavData } from "./types.js";

// Operazioni sulla griglia: da coordinate a cella e ritorno, distanze, passaggi bloccati.

export function cellAt(nav: NavData, [lng, lat]: LngLat): number {
  const { bbox, step, width, height } = nav.grid;
  const col = Math.floor((lng - bbox[0]) / step);
  const row = Math.floor((bbox[3] - lat) / step);
  if (col < 0 || row < 0 || col >= width || row >= height) return -1;
  return row * width + col;
}

export function cellCenter(nav: NavData, cell: number): LngLat {
  const { bbox, step, width } = nav.grid;
  const col = cell % width;
  const row = Math.floor(cell / width);
  return [bbox[0] + (col + 0.5) * step, bbox[3] - (row + 0.5) * step];
}

/** Indice della provincia (in `nav.provinceIds`) sotto il punto, o -1 se mare o fuori gioco. */
export function provinceIndexAt(nav: NavData, at: LngLat): number {
  const cell = cellAt(nav, at);
  return cell < 0 ? -1 : nav.grid.province[cell]! - 1;
}

export function provinceIdAt(nav: NavData, at: LngLat): string | null {
  const i = provinceIndexAt(nav, at);
  return i >= 0 ? nav.provinceIds[i]! : null;
}

/** Distanza approssimata in km tra due punti vicini (proiezione locale, precisa entro pochi km). */
export function flatKm(a: LngLat, b: LngLat): number {
  const lat = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const dx = (b[0] - a[0]) * 111.32 * Math.cos(lat);
  const dy = (b[1] - a[1]) * 110.57;
  return Math.hypot(dx, dy);
}

/** Il passaggio tra due celle adiacenti (anche in diagonale) è bloccato da un fiume? */
export function isBlocked(nav: NavData, from: number, to: number): boolean {
  const { width, blocked } = nav.grid;
  let c1 = from % width;
  let r1 = Math.floor(from / width);
  let c2 = to % width;
  let r2 = Math.floor(to / width);
  // Si normalizza in modo che il passaggio vada verso est o verso sud.
  if (r2 < r1 || (r2 === r1 && c2 < c1)) [c1, r1, c2, r2] = [c2, r2, c1, r1];
  const bits = blocked[r1 * width + c1]!;
  if (r2 === r1) return (bits & BLOCK_EAST) !== 0;
  if (c2 === c1) return (bits & BLOCK_SOUTH) !== 0;
  return (bits & (c2 > c1 ? BLOCK_SOUTH_EAST : BLOCK_SOUTH_WEST)) !== 0;
}

/**
 * Il segmento a→b si può percorrere fuori strada? Tutte le celle toccate devono essere
 * ammesse da `canEnter` e nessun passaggio tra loro deve attraversare un fiume.
 */
export function segmentClear(nav: NavData, a: LngLat, b: LngLat, canEnter: (cell: number) => boolean): boolean {
  const samples = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (nav.grid.step / 4)));
  let prev = cellAt(nav, a);
  if (prev < 0 || !canEnter(prev)) return false;
  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const cell = cellAt(nav, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    if (cell === prev) continue;
    if (cell < 0 || !canEnter(cell)) return false;
    const w = nav.grid.width;
    const adjacent = Math.abs((cell % w) - (prev % w)) <= 1 && Math.abs(Math.floor(cell / w) - Math.floor(prev / w)) <= 1;
    if (!adjacent || isBlocked(nav, prev, cell)) return false;
    prev = cell;
  }
  return true;
}
