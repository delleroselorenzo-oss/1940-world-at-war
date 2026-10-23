// Genera la rete di movimento della mappa "Europa 1933" (vedi shared/src/nav/types.ts):
//  1. griglia della terraferma con la provincia di ogni cella;
//  2. grandi fiumi (Natural Earth) che bloccano il passaggio tra celle;
//  3. strade e ferrovie principali (Natural Earth) come rete di nodi e tratti;
//  4. ponti: i tratti di strada o ferrovia che attraversano un grande fiume.
//
// Va eseguito dopo build-europe-1933.ts (usa map.json e provinces.geojson).
// Uso: npm run map:build   (dalla radice del progetto)

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FeatureCollection, LineString, MultiLineString, MultiPolygon, Polygon } from "geojson";
import {
  BLOCK_EAST,
  BLOCK_SOUTH,
  BLOCK_SOUTH_EAST,
  BLOCK_SOUTH_WEST,
  encodeNav,
  type Bridge,
  type LngLat,
  type MapData,
  type NavData,
  type River,
} from "@waw/shared";
import { Raster } from "./lib/raster.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAW = join(ROOT, "raw");
const OUT = join(ROOT, "maps", "europe-1933");

interface NavConfig {
  gridStepDeg: number;
  rivers: { maxScalerank: number; include: string[]; exclude: string[] };
  roads: { maxScalerank: number; types: string[] };
  rails: { maxScalerank: number };
  riverNames: Record<string, string>;
}

type Line = LngLat[];
type Seg = { a: LngLat; b: LngLat; river: number };

function main() {
  const config = JSON.parse(readFileSync(join(OUT, "nav.config.json"), "utf8")) as NavConfig;
  const mapConfig = JSON.parse(readFileSync(join(OUT, "config.json"), "utf8")) as { bbox: [number, number, number, number] };
  const map = JSON.parse(readFileSync(join(OUT, "map.json"), "utf8")) as MapData;
  const shapes = JSON.parse(readFileSync(join(OUT, "provinces.geojson"), "utf8")) as FeatureCollection<Polygon | MultiPolygon, { id: string }>;
  const bbox = mapConfig.bbox;
  const step = config.gridStepDeg;

  // 1. Griglia: ogni cella prende la provincia che ne contiene il centro.
  console.log("· Griglia della terraferma");
  const provinceIds = map.provinces.map((p) => p.id);
  const indexOf = new Map(provinceIds.map((id, i) => [id, i + 1]));
  const raster = new Raster(bbox, step);
  // Dalle più grandi alle più piccole: le enclavi restano visibili.
  const ordered = [...shapes.features].sort((a, b) => roughArea(b.geometry) - roughArea(a.geometry));
  for (const f of ordered) raster.fill(f.geometry, indexOf.get(f.properties.id)!);
  const { width, height } = raster;
  const province = new Uint16Array(width * height);
  for (let i = 0; i < province.length; i++) province[i] = Math.max(0, raster.cells[i]!);
  const landCells = province.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
  console.log(`  ${width}×${height} celle da ${step}°, ${landCells} di terraferma`);

  const cellOf = ([lng, lat]: LngLat) => {
    const c = Math.floor((lng - bbox[0]) / step);
    const r = Math.floor((bbox[3] - lat) / step);
    return c < 0 || r < 0 || c >= width || r >= height ? -1 : r * width + c;
  };
  const centerOf = (cell: number): LngLat => [bbox[0] + ((cell % width) + 0.5) * step, bbox[3] - (Math.floor(cell / width) + 0.5) * step];
  const isLand = (cell: number) => cell >= 0 && province[cell]! > 0;

  // 2. Fiumi.
  console.log("· Grandi fiumi");
  const riversRaw = readJson<FeatureCollection<LineString | MultiLineString, Record<string, any>>>("ne_10m_rivers_lake_centerlines.geojson");
  const riverByName = new Map<string, Line[]>();
  for (const f of riversRaw.features) {
    if (!f.geometry) continue;
    const p = f.properties;
    const en = String(p.name_en ?? p.name ?? "");
    const keep = (p.scalerank <= config.rivers.maxScalerank || config.rivers.include.includes(en)) && !config.rivers.exclude.includes(en);
    if (!keep) continue;
    const lines = linesOf(f.geometry).map((l) => clipLine(l, bbox)).flat().filter((l) => l.length > 1);
    if (!lines.length) continue;
    const name = config.riverNames[en] ?? config.riverNames[String(p.name)] ?? en;
    riverByName.set(name, [...(riverByName.get(name) ?? []), ...lines]);
  }
  const rivers: River[] = [...riverByName].map(([name, lines]) => ({ name, lines: lines.map((l) => l.map(round)) }));
  // Segmenti dei fiumi, indicizzati in una griglia grossolana per cercarli in fretta.
  const segs: Seg[] = [];
  rivers.forEach((r, ri) => {
    for (const line of r.lines) for (let i = 1; i < line.length; i++) segs.push({ a: line[i - 1]!, b: line[i]!, river: ri });
  });
  const segIndex = new SegmentIndex(segs, 0.5);
  console.log(`  ${rivers.length} fiumi, ${segs.length} segmenti`);

  // Passaggi bloccati: il tratto tra i centri di due celle vicine attraversa un fiume.
  const blocked = new Uint8Array(width * height);
  const dirs: [number, number, number][] = [
    [1, 0, BLOCK_EAST],
    [0, 1, BLOCK_SOUTH],
    [1, 1, BLOCK_SOUTH_EAST],
    [-1, 1, BLOCK_SOUTH_WEST],
  ];
  for (const s of segs) {
    const c0 = Math.floor((Math.min(s.a[0], s.b[0]) - bbox[0]) / step) - 1;
    const c1 = Math.floor((Math.max(s.a[0], s.b[0]) - bbox[0]) / step) + 1;
    const r0 = Math.floor((bbox[3] - Math.max(s.a[1], s.b[1])) / step) - 1;
    const r1 = Math.floor((bbox[3] - Math.min(s.a[1], s.b[1])) / step) + 1;
    for (let r = Math.max(0, r0); r <= Math.min(height - 1, r1); r++)
      for (let c = Math.max(0, c0); c <= Math.min(width - 1, c1); c++) {
        const cell = r * width + c;
        for (const [dc, dr, bit] of dirs) {
          const nc = c + dc;
          const nr = r + dr;
          if (nc < 0 || nc >= width || nr >= height) continue;
          if (segmentsIntersect(centerOf(cell), centerOf(nr * width + nc), s.a, s.b)) blocked[cell]! |= bit;
        }
      }
  }

  // 3. Strade e ferrovie: nodi condivisi dove le linee si toccano, tratti al massimo lunghi una cella.
  console.log("· Strade e ferrovie");
  const nodes: number[] = [];
  const nodeKey = new Map<string, number>();
  const nodeAt = (p: LngLat) => {
    const key = vertexKey(p);
    let id = nodeKey.get(key);
    if (id === undefined) {
      id = nodes.length / 2;
      nodes.push(p[0], p[1]);
      nodeKey.set(key, id);
    }
    return id;
  };
  const edgeA: number[] = [];
  const edgeB: number[] = [];
  const edgeKind: number[] = [];
  const edgeSeen = new Set<string>();
  const addLine = (line: Line, kind: number) => {
    for (const piece of densify(decimate(line, step * 0.5, junctions), step * 0.75)) {
      for (let i = 1; i < piece.length; i++) {
        const a = piece[i - 1]!;
        const b = piece[i]!;
        // Solo tratti con entrambi gli estremi sulla terraferma del gioco.
        if (!isLand(cellOf(a)) || !isLand(cellOf(b))) continue;
        const na = nodeAt(a);
        const nb = nodeAt(b);
        if (na === nb) continue;
        const key = na < nb ? `${na}-${nb}-${kind}` : `${nb}-${na}-${kind}`;
        if (edgeSeen.has(key)) continue;
        edgeSeen.add(key);
        edgeA.push(na);
        edgeB.push(nb);
        edgeKind.push(kind);
      }
    }
  };
  const roadsRaw = readJson<FeatureCollection<LineString | MultiLineString, Record<string, any>>>("ne_10m_roads.geojson");
  const roadLines = roadsRaw.features
    .filter((f) => f.geometry && f.properties.scalerank <= config.roads.maxScalerank && config.roads.types.includes(f.properties.type))
    .flatMap((f) => linesOf(f.geometry).flatMap((l) => clipLine(l, bbox)));
  const railsRaw = readJson<FeatureCollection<LineString | MultiLineString, Record<string, any>>>("ne_10m_railroads.geojson");
  const railLines = railsRaw.features
    .filter((f) => f.geometry && (f.properties.scalerank ?? 99) <= config.rails.maxScalerank)
    .flatMap((f) => linesOf(f.geometry).flatMap((l) => clipLine(l, bbox)));
  // Incroci: vertici usati da più linee (o più volte). Restano anche dopo la semplificazione.
  const uses = new Map<string, number>();
  for (const line of [...roadLines, ...railLines])
    for (const p of line) uses.set(vertexKey(p), (uses.get(vertexKey(p)) ?? 0) + 1);
  const junctions = new Set([...uses].filter(([, n]) => n > 1).map(([k]) => k));
  for (const l of roadLines) addLine(l, 0);
  for (const l of railLines) addLine(l, 1);
  const roadCount = roadLines.length;
  const railCount = railLines.length;
  console.log(`  ${roadCount} strade e ${railCount} ferrovie → ${nodes.length / 2} nodi, ${edgeA.length} tratti`);

  // 4. Ponti.
  const bridges: Bridge[] = [];
  const edgeBridge = new Int32Array(edgeA.length).fill(-1);
  const nodePos = (n: number): LngLat => [nodes[n * 2]!, nodes[n * 2 + 1]!];
  for (let e = 0; e < edgeA.length; e++) {
    const a = nodePos(edgeA[e]!);
    const b = nodePos(edgeB[e]!);
    for (const s of segIndex.near(a, b)) {
      const at = intersection(a, b, s.a, s.b);
      if (!at) continue;
      edgeBridge[e] = bridges.length;
      bridges.push({ id: `br${bridges.length + 1}`, at: round(at), river: rivers[s.river]!.name });
      break;
    }
  }
  console.log(`  ${bridges.length} ponti`);

  // Ogni nodo si collega alla sua cella solo se tra i due non passa un fiume;
  // altrimenti a una cella vicina sulla stessa sponda, o a nessuna.
  const nodeCell = new Int32Array(nodes.length / 2).fill(-1);
  let unlinked = 0;
  for (let n = 0; n < nodeCell.length; n++) {
    const p = nodePos(n);
    const home = cellOf(p);
    const candidates = [home, ...neighbors(home, width, height)].filter(isLand);
    const ok = candidates.find((c) => !segIndex.near(p, centerOf(c)).some((s) => segmentsIntersect(p, centerOf(c), s.a, s.b)));
    if (ok === undefined) unlinked++;
    else nodeCell[n] = ok;
  }

  const nav: NavData = {
    mapId: map.id,
    provinceIds,
    grid: { bbox, step, width, height, province, blocked },
    roads: {
      nodes: Float64Array.from(nodes),
      nodeCell,
      edgeA: Int32Array.from(edgeA),
      edgeB: Int32Array.from(edgeB),
      edgeKind: Uint8Array.from(edgeKind),
      edgeBridge,
    },
    bridges,
    rivers,
  };
  const json = JSON.stringify(encodeNav(nav));
  writeFileSync(join(OUT, "nav.json"), json + "\n");
  console.log(`  nodi senza cella (isolati da un fiume): ${unlinked}`);
  console.log(`\nRete di movimento: data/maps/europe-1933/nav.json (${(json.length / 1e6).toFixed(1)} MB)`);
}

// ---------------------------------------------------------------------------

class SegmentIndex {
  private readonly cells = new Map<string, Seg[]>();
  constructor(
    segs: Seg[],
    private readonly size: number,
  ) {
    for (const s of segs) for (const key of this.keys(s.a, s.b)) this.cells.set(key, [...(this.cells.get(key) ?? []), s]);
  }
  near(a: LngLat, b: LngLat): Seg[] {
    const out = new Set<Seg>();
    for (const key of this.keys(a, b)) for (const s of this.cells.get(key) ?? []) out.add(s);
    return [...out];
  }
  private keys(a: LngLat, b: LngLat): string[] {
    const keys: string[] = [];
    for (let x = Math.floor(Math.min(a[0], b[0]) / this.size); x <= Math.floor(Math.max(a[0], b[0]) / this.size); x++)
      for (let y = Math.floor(Math.min(a[1], b[1]) / this.size); y <= Math.floor(Math.max(a[1], b[1]) / this.size); y++) keys.push(`${x},${y}`);
    return keys;
  }
}

function neighbors(cell: number, width: number, height: number): number[] {
  const c = cell % width;
  const r = Math.floor(cell / width);
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (!dc && !dr) continue;
      const nc = c + dc;
      const nr = r + dr;
      if (nc >= 0 && nr >= 0 && nc < width && nr < height) out.push(nr * width + nc);
    }
  return out;
}

function orient(a: LngLat, b: LngLat, c: LngLat): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function segmentsIntersect(p1: LngLat, p2: LngLat, q1: LngLat, q2: LngLat): boolean {
  const d1 = orient(q1, q2, p1);
  const d2 = orient(q1, q2, p2);
  const d3 = orient(p1, p2, q1);
  const d4 = orient(p1, p2, q2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function intersection(p1: LngLat, p2: LngLat, q1: LngLat, q2: LngLat): LngLat | null {
  if (!segmentsIntersect(p1, p2, q1, q2)) return null;
  const d = (p2[0] - p1[0]) * (q2[1] - q1[1]) - (p2[1] - p1[1]) * (q2[0] - q1[0]);
  const t = ((q1[0] - p1[0]) * (q2[1] - q1[1]) - (q1[1] - p1[1]) * (q2[0] - q1[0])) / d;
  return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
}

function linesOf(g: LineString | MultiLineString): Line[] {
  return (g.type === "LineString" ? [g.coordinates] : g.coordinates) as Line[];
}

/** Spezza una linea tenendo solo le parti dentro il riquadro. */
function clipLine(line: Line, bbox: [number, number, number, number]): Line[] {
  const inside = ([x, y]: LngLat) => x >= bbox[0] && x <= bbox[2] && y >= bbox[1] && y <= bbox[3];
  const out: Line[] = [];
  let current: Line = [];
  for (const p of line) {
    if (inside(p)) current.push([p[0], p[1]]);
    else if (current.length) {
      out.push(current);
      current = [];
    }
  }
  if (current.length) out.push(current);
  return out;
}

const vertexKey = (p: LngLat) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;

/** Semplifica una linea tenendo un vertice ogni `minDeg` circa, più estremi e incroci. */
function decimate(line: Line, minDeg: number, junctions: Set<string>): Line {
  const out: Line = [line[0]!];
  for (let i = 1; i < line.length - 1; i++) {
    const p = line[i]!;
    const last = out[out.length - 1]!;
    if (junctions.has(vertexKey(p)) || Math.hypot(p[0] - last[0], p[1] - last[1]) >= minDeg) out.push(p);
  }
  if (line.length > 1) out.push(line[line.length - 1]!);
  return out;
}

/** Inserisce punti intermedi così che nessun tratto superi `maxDeg`. */
function densify(line: Line, maxDeg: number): Line[] {
  const out: Line = [line[0]!];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / maxDeg);
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return [out];
}

function roughArea(g: Polygon | MultiPolygon): number {
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  let area = 0;
  for (const rings of polys) {
    const ring = rings[0]!;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) area += ring[j]![0]! * ring[i]![1]! - ring[i]![0]! * ring[j]![1]!;
  }
  return Math.abs(area / 2);
}

const round = (p: LngLat): LngLat => [Math.round(p[0] * 1e4) / 1e4, Math.round(p[1] * 1e4) / 1e4];

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(join(RAW, file), "utf8")) as T;
}

main();
