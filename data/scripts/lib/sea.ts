import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { flatKm, MinHeap, type LngLat, type MapData, type SeaData, type SeaZone, type Strait } from "@waw/shared";
import { Raster } from "./raster.js";

// Mare della rete di movimento (vedi SeaData in shared/src/nav/types.ts):
//  1. terra = tutte le suddivisioni amministrative (anche fuori gioco, come l'Africa) più le province;
//  2. i canali e gli stretti troppo stretti per la griglia diventano acqua lungo la loro linea;
//  3. ogni zona cresce dai suoi punti (la più vicina via mare vince); l'acqua che nessuna zona
//     raggiunge (laghi) non è navigabile;
//  4. stretti, approdi delle province, confini tra le zone (smussati, solo per il disegno), etichette.

export interface SeaConfig {
  zones: { id: string; name: string; seeds: LngLat[]; label?: LngLat }[];
  straits: { id: string; name: string; at: LngLat; radiusKm: number; channel?: LngLat[] }[];
  /** Porte dei convogli sull'oceano: spostate sulla cella navigabile più vicina. */
  gates?: { id: string; name: string; at: LngLat }[];
}

interface Grid {
  bbox: [number, number, number, number];
  step: number;
  width: number;
  height: number;
  /** Provincia di ogni cella (indice + 1, 0 = nessuna). */
  province: Uint16Array;
}

export function buildSea(grid: Grid, map: MapData, land: FeatureCollection<Polygon | MultiPolygon>, config: SeaConfig): SeaData {
  const { bbox, step, width, height, province } = grid;
  const cells = width * height;
  const centerOf = (cell: number): LngLat => [bbox[0] + ((cell % width) + 0.5) * step, bbox[3] - (Math.floor(cell / width) + 0.5) * step];
  const cellOf = ([lng, lat]: LngLat) => {
    const c = Math.floor((lng - bbox[0]) / step);
    const r = Math.floor((bbox[3] - lat) / step);
    return c < 0 || r < 0 || c >= width || r >= height ? -1 : r * width + c;
  };

  // 1-2. Acqua.
  const raster = new Raster(bbox, step);
  for (const f of land.features) if (f.geometry) raster.fill(f.geometry, 1);
  const water = new Uint8Array(cells);
  for (let i = 0; i < cells; i++) water[i] = raster.cells[i]! > 0 || province[i]! > 0 ? 0 : 1;
  const channelCells = new Map<number, number>(); // cella -> stretto
  config.straits.forEach((s, si) => {
    for (const cell of lineCells(s.channel ?? [], cellOf, width)) {
      water[cell] = 1;
      channelCells.set(cell, si);
    }
  });

  // 3. Zone: Dijkstra da tutti i punti insieme, in km, senza tagliare angoli di terra.
  const zone = new Uint8Array(cells);
  const dist = new Float64Array(cells).fill(Infinity);
  const heap = new MinHeap();
  config.zones.forEach((z, zi) => {
    for (const seed of z.seeds) {
      const cell = nearestWater(cellOf(seed), water, width, height);
      if (cell < 0) {
        console.warn(`  ! ${z.name}: il punto ${seed} non è in mare`);
        continue;
      }
      dist[cell] = 0;
      zone[cell] = zi + 1;
      heap.push(cell, 0);
    }
  });
  const done = new Uint8Array(cells);
  while (heap.size) {
    const cell = heap.pop();
    if (done[cell]) continue;
    done[cell] = 1;
    for (const [next, diagonal] of neighbors8(cell, width, height)) {
      if (!water[next] || done[next]) continue;
      if (diagonal && (!water[cornerA(cell, next, width)] || !water[cornerB(cell, next, width)])) continue;
      const d = dist[cell]! + flatKm(centerOf(cell), centerOf(next));
      if (d >= dist[next]!) continue;
      dist[next] = d;
      zone[next] = zone[cell]!;
      heap.push(next, d);
    }
  }
  const lakes = componentSizes(water, zone, width, height).filter((c) => c.size >= 30);
  for (const c of lakes) console.log(`  acqua non navigabile (lago?): ${c.size} celle intorno a ${centerOf(c.cell).map((v) => v.toFixed(1)).join(", ")}`);

  // 4. Stretti.
  const strait = new Uint8Array(cells);
  const straits: Strait[] = config.straits.map((s, si) => {
    for (let cell = 0; cell < cells; cell++) {
      if (!zone[cell]) continue;
      if (channelCells.get(cell) === si || (s.radiusKm > 0 && flatKm(centerOf(cell), s.at) <= s.radiusKm)) strait[cell] = si + 1;
    }
    const banks = new Set<string>();
    for (let cell = 0; cell < cells; cell++) {
      if (strait[cell] !== si + 1) continue;
      const c0 = cell % width;
      const r0 = Math.floor(cell / width);
      for (let r = Math.max(0, r0 - 1); r <= Math.min(height - 1, r0 + 1); r++)
        for (let c = Math.max(0, c0 - 1); c <= Math.min(width - 1, c0 + 1); c++) {
          const p = province[r * width + c]!;
          if (p > 0) banks.add(map.provinces[p - 1]!.id);
        }
    }
    return { id: s.id, name: s.name, at: s.at, provinces: [...banks].sort() };
  });

  // Approdi: la cella di mare aperto accanto alla provincia più vicina al suo centro (la città).
  const harbor = new Int32Array(map.provinces.length).fill(-1);
  const harborKm = new Float64Array(map.provinces.length).fill(Infinity);
  for (let cell = 0; cell < cells; cell++) {
    if (!zone[cell] || strait[cell]) continue;
    for (const [next] of neighbors8(cell, width, height)) {
      const p = province[next]! - 1;
      if (p < 0) continue;
      const km = flatKm(centerOf(cell), map.provinces[p]!.center);
      if (km < harborKm[p]!) [harbor[p], harborKm[p]] = [cell, km];
    }
  }
  const withHarbor = map.provinces.filter((_, i) => harbor[i]! >= 0);
  const mismatch = map.provinces.filter((p, i) => p.coastal !== harbor[i]! >= 0).map((p) => `${p.name}${p.coastal ? " (costiera senza approdo)" : " (approdo, non costiera)"}`);
  console.log(`  ${withHarbor.length} province con un approdo${mismatch.length ? `; diverse da "costiera": ${mismatch.join(", ")}` : ""}`);

  // Etichette: la cella più lontana dai bordi della zona.
  const inner = distanceInside(zone, width, height, centerOf);
  const zones: SeaZone[] = config.zones.map((z, zi) => {
    let best = -1;
    for (let cell = 0; cell < cells; cell++) if (zone[cell] === zi + 1 && (best < 0 || inner[cell]! > inner[best]!)) best = cell;
    if (best < 0) console.warn(`  ! ${z.name}: zona vuota`);
    return { id: z.id, name: z.name, label: z.label ?? (best >= 0 ? round(centerOf(best)) : z.seeds[0]!) };
  });

  const navigable = zone.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
  console.log(`  ${navigable} celle navigabili in ${zones.length} zone, ${straits.length} stretti`);
  // 7. Porte dei convogli: la cella navigabile più vicina al punto indicato.
  const gates = (config.gates ?? []).map((g) => {
    const start = cellOf(g.at);
    let best = -1;
    let bestD = Infinity;
    const c0 = start % width;
    const r0 = Math.floor(start / width);
    for (let dr = -30; dr <= 30; dr++)
      for (let dc = -30; dc <= 30; dc++) {
        const c = c0 + dc;
        const r = r0 + dr;
        if (c < 0 || r < 0 || c >= width || r >= height || !zone[r * width + c]) continue;
        const d = dc * dc + dr * dr;
        if (d < bestD) [best, bestD] = [r * width + c, d];
      }
    if (best < 0) console.warn(`  ! porta ${g.name}: nessun mare vicino`);
    return { id: g.id, name: g.name, at: best >= 0 ? round(centerOf(best)) : g.at };
  });
  console.log(`  ${gates.length} porte dei convogli`);
  return { zone, strait, zones, straits, harbor, borders: zoneBorders(zone, width, height, bbox, step), gates };
}

// ---------------------------------------------------------------------------

function neighbors8(cell: number, width: number, height: number): [number, boolean][] {
  const c = cell % width;
  const r = Math.floor(cell / width);
  const out: [number, boolean][] = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (!dc && !dr) continue;
      const nc = c + dc;
      const nr = r + dr;
      if (nc >= 0 && nr >= 0 && nc < width && nr < height) out.push([nr * width + nc, dc !== 0 && dr !== 0]);
    }
  return out;
}

/** Le due celle a fianco di un passo in diagonale. */
const cornerA = (a: number, b: number, width: number) => Math.floor(a / width) * width + (b % width);
const cornerB = (a: number, b: number, width: number) => Math.floor(b / width) * width + (a % width);

function nearestWater(cell: number, water: Uint8Array, width: number, height: number): number {
  if (cell < 0) return -1;
  if (water[cell]) return cell;
  const c0 = cell % width;
  const r0 = Math.floor(cell / width);
  for (let d = 1; d <= 3; d++)
    for (let r = Math.max(0, r0 - d); r <= Math.min(height - 1, r0 + d); r++)
      for (let c = Math.max(0, c0 - d); c <= Math.min(width - 1, c0 + d); c++) if (water[r * width + c]) return r * width + c;
  return -1;
}

/** Celle lungo una linea, collegate di lato (mai solo per un angolo). */
function lineCells(line: LngLat[], cellOf: (p: LngLat) => number, width: number): number[] {
  const out: number[] = [];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.01));
    for (let k = 0; k <= n; k++) {
      const cell = cellOf([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
      if (cell < 0 || cell === out[out.length - 1]) continue;
      const last = out[out.length - 1];
      if (last !== undefined && last % width !== cell % width && Math.floor(last / width) !== Math.floor(cell / width)) out.push(cornerA(last, cell, width));
      out.push(cell);
    }
  }
  return out;
}

/** Componenti d'acqua che nessuna zona ha raggiunto. */
function componentSizes(water: Uint8Array, zone: Uint8Array, width: number, height: number): { cell: number; size: number }[] {
  const seen = new Uint8Array(water.length);
  const out: { cell: number; size: number }[] = [];
  for (let start = 0; start < water.length; start++) {
    if (!water[start] || zone[start] || seen[start]) continue;
    let size = 0;
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const cell = stack.pop()!;
      size++;
      for (const [next] of neighbors8(cell, width, height)) {
        if (!water[next] || zone[next] || seen[next]) continue;
        seen[next] = 1;
        stack.push(next);
      }
    }
    out.push({ cell: start, size });
  }
  return out;
}

/** Per ogni cella di mare, distanza in km dal bordo della sua zona (terra o un'altra zona). */
function distanceInside(zone: Uint8Array, width: number, height: number, centerOf: (cell: number) => LngLat): Float64Array {
  const dist = new Float64Array(zone.length).fill(Infinity);
  const heap = new MinHeap();
  for (let cell = 0; cell < zone.length; cell++) {
    if (!zone[cell]) continue;
    if (neighbors8(cell, width, height).some(([n]) => zone[n] !== zone[cell])) {
      dist[cell] = 0;
      heap.push(cell, 0);
    }
  }
  while (heap.size) {
    const cell = heap.pop();
    for (const [next] of neighbors8(cell, width, height)) {
      if (zone[next] !== zone[cell]) continue;
      const d = dist[cell]! + flatKm(centerOf(cell), centerOf(next));
      if (d >= dist[next]!) continue;
      dist[next] = d;
      heap.push(next, d);
    }
  }
  return dist;
}

/** Confini tra zone di mare: i lati di cella tra zone diverse, uniti in linee e smussati. */
function zoneBorders(zone: Uint8Array, width: number, height: number, bbox: [number, number, number, number], step: number): LngLat[][] {
  const vertex = (c: number, r: number): LngLat => [bbox[0] + c * step, bbox[3] - r * step];
  const key = (c: number, r: number) => r * (width + 1) + c;
  const segs: [number, number][] = [];
  for (let r = 0; r < height; r++)
    for (let c = 0; c < width; c++) {
      const z = zone[r * width + c]!;
      if (!z) continue;
      const east = c + 1 < width ? zone[r * width + c + 1]! : 0;
      const south = r + 1 < height ? zone[(r + 1) * width + c]! : 0;
      if (east && east !== z) segs.push([key(c + 1, r), key(c + 1, r + 1)]);
      if (south && south !== z) segs.push([key(c, r + 1), key(c + 1, r + 1)]);
    }
  const byVertex = new Map<number, number[]>();
  segs.forEach(([a, b], i) => {
    for (const v of [a, b]) byVertex.set(v, [...(byVertex.get(v) ?? []), i]);
  });
  const used = new Uint8Array(segs.length);
  const lines: number[][] = [];
  const walk = (start: number, seg: number) => {
    const line = [start];
    let v = start;
    let s = seg;
    while (s >= 0 && !used[s]) {
      used[s] = 1;
      const [a, b] = segs[s]!;
      v = a === v ? b : a;
      line.push(v);
      const next = byVertex.get(v)!;
      s = next.length === 2 ? (next[0] === s ? next[1]! : next[0]!) : -1;
    }
    lines.push(line);
  };
  // Prima dagli estremi e dagli incroci, poi gli anelli chiusi.
  for (const [v, list] of byVertex) if (list.length !== 2) for (const s of list) if (!used[s]) walk(v, s);
  segs.forEach(([a], s) => {
    if (!used[s]) walk(a, s);
  });
  return lines
    .map((line) => line.map((k) => vertex(k % (width + 1), Math.floor(k / (width + 1)))))
    .map((line) => chaikin(line, 3).map(round));
}

/** Smussa una linea tagliando gli angoli (gli estremi restano fermi). */
function chaikin(line: LngLat[], iterations: number): LngLat[] {
  let out = line;
  for (let it = 0; it < iterations; it++) {
    if (out.length < 3) return out;
    const next: LngLat[] = [out[0]!];
    for (let i = 0; i < out.length - 1; i++) {
      const [a, b] = [out[i]!, out[i + 1]!];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    next.push(out[out.length - 1]!);
    out = next;
  }
  return out;
}

const round = (p: LngLat): LngLat => [Math.round(p[0] * 1e3) / 1e3, Math.round(p[1] * 1e3) / 1e3];
