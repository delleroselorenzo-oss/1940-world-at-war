import type { LngLat, ProvinceId } from "../map/types.js";
import { cellAt, cellCenter, flatKm } from "./grid.js";
import { MinHeap } from "./heap.js";
import type { NavData, SeaZone, Strait } from "./types.js";

// Navigazione: celle di mare della griglia, zone con un nome, stretti, approdi delle province.
//
// Le navi vanno di cella in cella anche in diagonale, ma mai "tagliando un angolo" di terra
// (in diagonale solo se anche le due celle a fianco sono navigabili): così non scavalcano
// un istmo largo una cella. Gli stretti chiusi (`closedStraits`) non si attraversano.

export interface SeaRoute {
  /** Punti da percorrere, dal punto di partenza a quello d'arrivo. */
  points: LngLat[];
  /** Lunghezza totale in km. */
  km: number;
}

export interface SeaRouteOptions {
  /** Stretti non percorribili, per indice in `nav.sea.straits`. */
  closedStraits?: ReadonlySet<number>;
}

export function isNavigable(nav: NavData, cell: number): boolean {
  return cell >= 0 && (nav.sea?.zone[cell] ?? 0) > 0;
}

export function seaZoneAt(nav: NavData, at: LngLat): SeaZone | null {
  const cell = cellAt(nav, at);
  const z = cell >= 0 ? (nav.sea?.zone[cell] ?? 0) : 0;
  return z > 0 ? nav.sea!.zones[z - 1]! : null;
}

export function straitAt(nav: NavData, at: LngLat): Strait | null {
  const cell = cellAt(nav, at);
  const s = cell >= 0 ? (nav.sea?.strait[cell] ?? 0) : 0;
  return s > 0 ? nav.sea!.straits[s - 1]! : null;
}

/** Dove attraccano le navi nella provincia, o null se la provincia non tocca il mare. */
export function harborOf(nav: NavData, province: ProvinceId): LngLat | null {
  const i = nav.provinceIds.indexOf(province);
  const cell = i >= 0 ? (nav.sea?.harbor[i] ?? -1) : -1;
  return cell >= 0 ? cellCenter(nav, cell) : null;
}

/** Cella navigabile più vicina al punto, entro `maxCells` celle (-1 se non c'è). */
export function nearestNavigable(nav: NavData, at: LngLat, maxCells = 2): number {
  const home = cellAt(nav, at);
  if (isNavigable(nav, home)) return home;
  if (home < 0) return -1;
  const { width, height } = nav.grid;
  const c0 = home % width;
  const r0 = Math.floor(home / width);
  let best = -1;
  let bestKm = Infinity;
  for (let r = Math.max(0, r0 - maxCells); r <= Math.min(height - 1, r0 + maxCells); r++)
    for (let c = Math.max(0, c0 - maxCells); c <= Math.min(width - 1, c0 + maxCells); c++) {
      const cell = r * width + c;
      if (!isNavigable(nav, cell)) continue;
      const km = flatKm(at, cellCenter(nav, cell));
      if (km < bestKm) [best, bestKm] = [cell, km];
    }
  return best;
}

/** Rotta più breve per mare tra due punti (ciascuno su una cella navigabile o accanto). */
export function findSeaRoute(nav: NavData, from: LngLat, to: LngLat, options: SeaRouteOptions = {}): SeaRoute | null {
  if (!nav.sea) return null;
  const closed = options.closedStraits;
  const open = (cell: number) => {
    if (!isNavigable(nav, cell)) return false;
    const s = nav.sea!.strait[cell]!;
    return s === 0 || !closed?.has(s - 1);
  };
  const start = nearestNavigable(nav, from);
  const goal = nearestNavigable(nav, to);
  if (start < 0 || goal < 0 || !open(start) || !open(goal)) return null;

  const { width, height } = nav.grid;
  const goalAt = cellCenter(nav, goal);
  const cost = new Float64Array(width * height).fill(Infinity);
  const prev = new Int32Array(width * height).fill(-1);
  const done = new Uint8Array(width * height);
  const heap = new MinHeap();
  cost[start] = 0;
  heap.push(start, flatKm(cellCenter(nav, start), goalAt));
  while (heap.size) {
    const cell = heap.pop();
    if (done[cell]) continue;
    done[cell] = 1;
    if (cell === goal) break;
    const c = cell % width;
    const r = Math.floor(cell / width);
    const here = cellCenter(nav, cell);
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dc && !dr) continue;
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= width || nr >= height) continue;
        const next = nr * width + nc;
        if (done[next] || !open(next)) continue;
        if (dc && dr && (!open(r * width + nc) || !open(nr * width + c))) continue;
        const there = cellCenter(nav, next);
        const g = cost[cell]! + flatKm(here, there);
        if (g >= cost[next]!) continue;
        cost[next] = g;
        prev[next] = cell;
        heap.push(next, g + flatKm(there, goalAt));
      }
  }
  if (!done[goal]) return null;

  const cells: number[] = [];
  for (let cell = goal; cell >= 0; cell = prev[cell]!) cells.push(cell);
  cells.reverse();
  const raw: LngLat[] = [from, ...cells.slice(1, -1).map((cell) => cellCenter(nav, cell)), to];
  // Linee rette dove il mare lo permette (si tiene un punto solo quando serve a girare intorno alla terra).
  const points: LngLat[] = [raw[0]!];
  let i = 0;
  while (i < raw.length - 1) {
    let j = i + 1;
    while (j + 1 < raw.length && seaLineClear(nav, raw[i]!, raw[j + 1]!, open)) j++;
    points.push(raw[j]!);
    i = j;
  }
  let km = 0;
  for (let k = 1; k < points.length; k++) km += flatKm(points[k - 1]!, points[k]!);
  return { points, km };
}

/** La linea retta a→b resta in mare aperto (celle ammesse da `open`, senza tagliare angoli di terra)? */
export function seaLineClear(nav: NavData, a: LngLat, b: LngLat, open: (cell: number) => boolean): boolean {
  const { width } = nav.grid;
  const samples = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (nav.grid.step / 4)));
  // Gli estremi possono stare in porto (cella di terra accanto al mare): si controlla solo la parte in mezzo.
  let prev = -1;
  for (let k = 0; k <= samples; k++) {
    const t = k / samples;
    const cell = cellAt(nav, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    if (cell === prev) continue;
    const endpoint = cell === cellAt(nav, a) || cell === cellAt(nav, b);
    if (cell < 0 || (!endpoint && !open(cell))) return false;
    if (prev >= 0) {
      const dc = (cell % width) - (prev % width);
      const dr = Math.floor(cell / width) - Math.floor(prev / width);
      if (Math.abs(dc) > 1 || Math.abs(dr) > 1) return false;
      if (dc && dr && (!open(prev + dc) || !open(prev + dr * width)) && !endpoint) return false;
    }
    prev = cell;
  }
  return true;
}
