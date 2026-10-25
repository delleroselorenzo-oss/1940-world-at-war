import { MOVEMENT } from "../data/movement.js";
import { roadSpeedFactor } from "../data/terrain.js";
import type { LngLat } from "../map/types.js";
import { cellAt, cellCenter, flatKm, isBlocked, segmentClear } from "./grid.js";
import type { NavData } from "./types.js";

// Ricerca del percorso più rapido tra due punti qualsiasi della terraferma.
//
// Il grafo ha due tipi di nodi: le celle della griglia (fuori strada, lente) e i nodi
// della rete stradale (veloci). Da una cella si sale sulla strada nei nodi collegati a
// quella cella e viceversa. I fiumi bloccano i passaggi tra celle: si attraversano solo
// lungo un tratto di strada o ferrovia, cioè su un ponte.
//
// Con l'opzione `rail` la ferrovia diventa un treno: velocità propria e una sosta per salire
// e una per scendere. Per tenerne conto ogni nodo stradale compare due volte, "a terra" e
// "in treno"; passare dall'uno all'altro costa il tempo di salita (o discesa).
//
// Il terreno (`terrainFactor`) rallenta fuori strada per intero e su strada a metà; il treno no.

export interface Route {
  /** Punti da percorrere, dal punto di partenza a quello d'arrivo. */
  points: LngLat[];
  /** Per ogni tratto (points[i] → points[i+1]): true se è su strada o ferrovia. */
  onRoad: boolean[];
  /** Per ogni tratto: velocità del treno in km/h, 0 se non è in treno. */
  rail: number[];
  /** Per ogni tratto: moltiplicatore medio della velocità dovuto al terreno (1 in treno). */
  terrain: number[];
  /** Lunghezza totale in km. */
  km: number;
}

export interface RouteOptions {
  /** La cella si può attraversare? (es. solo territorio proprio) */
  canEnter(cell: number): boolean;
  /** Ponti non percorribili (es. distrutti), per indice. */
  closedBridges?: ReadonlySet<number>;
  /** Passaggi tra celle riaperti dai ponti di barche (chiavi di `passageKey`). */
  openPassages?: ReadonlySet<number>;
  offRoadFactor?: number;
  /** Moltiplicatore della velocità fuori strada dovuto al terreno della cella (predefinito: 1). */
  terrainFactor?(cell: number): number;
  /** Velocità dell'unità in km/h (serve solo a confrontarla con il treno). Predefinita: 20. */
  speedKmh?: number;
  /** Trasporto in treno. Senza questa opzione la ferrovia vale come una strada. */
  rail?: {
    /** Minuti per salire (e altrettanti per scendere). */
    boardMinutes: number;
    /** Velocità del treno nella cella, 0 se lì non si può usare (es. fuori dal territorio proprio). */
    speedAt(cell: number): number;
    /** La velocità più alta che `speedAt` può dare (serve alla stima di A*). */
    maxSpeedKmh: number;
  };
}

interface Graph {
  cellCount: number;
  /** Per ogni nodo stradale: inizio delle sue adiacenze in `adjNode`/`adjEdge`. */
  adjStart: Int32Array;
  adjNode: Int32Array;
  adjEdge: Int32Array;
  /** Per ogni cella: i nodi stradali collegati (CSR). */
  cellRoadStart: Int32Array;
  cellRoadNode: Int32Array;
}

const graphs = new WeakMap<NavData, Graph>();

function graphOf(nav: NavData): Graph {
  let g = graphs.get(nav);
  if (g) return g;
  const { edgeA, edgeB, nodeCell } = nav.roads;
  const nodeCount = nav.roads.nodes.length / 2;
  const cellCount = nav.grid.width * nav.grid.height;

  const degree = new Int32Array(nodeCount + 1);
  for (let e = 0; e < edgeA.length; e++) {
    degree[edgeA[e]! + 1]!++;
    degree[edgeB[e]! + 1]!++;
  }
  const adjStart = new Int32Array(nodeCount + 1);
  for (let n = 0; n < nodeCount; n++) adjStart[n + 1] = adjStart[n]! + degree[n + 1]!;
  const fill = adjStart.slice(0, nodeCount);
  const adjNode = new Int32Array(edgeA.length * 2);
  const adjEdge = new Int32Array(edgeA.length * 2);
  for (let e = 0; e < edgeA.length; e++) {
    const a = edgeA[e]!;
    const b = edgeB[e]!;
    adjNode[fill[a]!] = b;
    adjEdge[fill[a]!++] = e;
    adjNode[fill[b]!] = a;
    adjEdge[fill[b]!++] = e;
  }

  const perCell = new Int32Array(cellCount + 1);
  for (let n = 0; n < nodeCount; n++) if (nodeCell[n]! >= 0) perCell[nodeCell[n]! + 1]!++;
  const cellRoadStart = new Int32Array(cellCount + 1);
  for (let c = 0; c < cellCount; c++) cellRoadStart[c + 1] = cellRoadStart[c]! + perCell[c + 1]!;
  const cellFill = cellRoadStart.slice(0, cellCount);
  const cellRoadNode = new Int32Array(cellRoadStart[cellCount]!);
  for (let n = 0; n < nodeCount; n++) if (nodeCell[n]! >= 0) cellRoadNode[cellFill[nodeCell[n]!]!++] = n;

  g = { cellCount, adjStart, adjNode, adjEdge, cellRoadStart, cellRoadNode };
  graphs.set(nav, g);
  return g;
}

/**
 * Percorso più rapido da `from` a `to` (costo = minuti di viaggio).
 * Restituisce null se l'arrivo non è raggiungibile.
 */
export function findRoute(nav: NavData, from: LngLat, to: LngLat, options: RouteOptions): Route | null {
  const g = graphOf(nav);
  const { width } = nav.grid;
  const offRoad = options.offRoadFactor ?? MOVEMENT.offRoadFactor;
  const speed = options.speedKmh ?? 20;
  const { canEnter, rail } = options;
  const terrain = options.terrainFactor ?? (() => 1);
  const offRoadKmh = (cell: number) => speed * offRoad * terrain(cell);
  const roadKmh = (cell: number) => speed * MOVEMENT.roadFactor * roadSpeedFactor(terrain(cell));
  const land = (cell: number) => cell >= 0 && nav.grid.province[cell]! > 0 && canEnter(cell);
  const nodeCount = nav.roads.nodes.length / 2;
  /** Primo id dei nodi "in treno". */
  const railBase = g.cellCount + nodeCount;
  const minutes = (km: number, kmh: number) => (km / kmh) * 60;

  const startCell = cellAt(nav, from);
  const goalCell = cellAt(nav, to);
  if (!land(startCell) || !land(goalCell)) return null;
  if (startCell === goalCell) return { points: [from, to], onRoad: [false], rail: [0], terrain: [terrain(startCell)], km: flatKm(from, to) };

  const roadNode = (id: number) => (id >= railBase ? id - railBase : id - g.cellCount);
  const nodePos = (id: number): LngLat => {
    if (id < g.cellCount) return cellCenter(nav, id);
    const n = roadNode(id);
    return [nav.roads.nodes[n * 2]!, nav.roads.nodes[n * 2 + 1]!];
  };
  const goalPos = cellCenter(nav, goalCell);
  // Stima ottimista: in linea retta al mezzo più veloce.
  const fastest = Math.max(speed * MOVEMENT.roadFactor, rail?.maxSpeedKmh ?? 0);
  const heuristic = (id: number) => minutes(flatKm(nodePos(id), goalPos), fastest);

  const cost = new Map<number, number>([[startCell, 0]]);
  const cameFrom = new Map<number, number>();
  const viaRoad = new Set<number>(); // nodi raggiunti percorrendo un tratto di strada (o con una sosta in stazione)
  const viaRail = new Map<number, number>(); // nodi raggiunti in treno, con la velocità del tratto
  const closed = new Set<number>();
  const heap = new MinHeap();
  heap.push(startCell, heuristic(startCell));

  const relax = (from: number, to: number, step: number, road: boolean, train = 0) => {
    const c = cost.get(from)! + step;
    if (c >= (cost.get(to) ?? Infinity)) return;
    cost.set(to, c);
    cameFrom.set(to, from);
    if (road) viaRoad.add(to);
    else viaRoad.delete(to);
    if (train) viaRail.set(to, train);
    else viaRail.delete(to);
    heap.push(to, c + heuristic(to));
  };

  let found = false;
  while (heap.size > 0) {
    const current = heap.pop();
    if (closed.has(current)) continue;
    if (current === goalCell) {
      found = true;
      break;
    }
    closed.add(current);
    const here = nodePos(current);

    if (current < g.cellCount) {
      // Fuori strada verso le 8 celle vicine.
      const c = current % width;
      const r = Math.floor(current / width);
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          if (!dc && !dr) continue;
          const nc = c + dc;
          const nr = r + dr;
          if (nc < 0 || nr < 0 || nc >= width || nr >= nav.grid.height) continue;
          const next = nr * width + nc;
          if (closed.has(next) || !land(next) || isBlocked(nav, current, next, options.openPassages)) continue;
          relax(current, next, minutes(flatKm(here, cellCenter(nav, next)), offRoadKmh(next)), false);
        }
      // Salita sulla strada nei nodi collegati alla cella.
      for (let i = g.cellRoadStart[current]!; i < g.cellRoadStart[current + 1]!; i++) {
        const node = g.cellCount + g.cellRoadNode[i]!;
        if (!closed.has(node)) relax(current, node, minutes(flatKm(here, nodePos(node)), offRoadKmh(current)), false);
      }
    } else {
      const n = roadNode(current);
      const onTrain = current >= railBase;
      const hereCell = cellAt(nav, here);
      // Lungo la rete: a terra su strade e ferrovie (marciando lungo i binari), in treno solo sulle ferrovie.
      for (let i = g.adjStart[n]!; i < g.adjStart[n + 1]!; i++) {
        const other = g.adjNode[i]!;
        const edge = g.adjEdge[i]!;
        const isRail = nav.roads.edgeKind[edge] === 1;
        if (onTrain && !isRail) continue;
        const node = (onTrain ? railBase : g.cellCount) + other;
        if (closed.has(node)) continue;
        const bridge = nav.roads.edgeBridge[edge]!;
        if (bridge >= 0 && options.closedBridges?.has(bridge)) continue;
        const pos = nodePos(node);
        const cell = cellAt(nav, pos);
        if (!land(cell)) continue;
        // In treno il tratto va alla velocità più bassa tra i suoi due estremi.
        const train = onTrain ? Math.min(rail!.speedAt(hereCell), rail!.speedAt(cell)) : 0;
        if (onTrain && train <= 0) continue;
        relax(current, node, minutes(flatKm(here, pos), train || roadKmh(cell)), true, train);
      }
      // Salita sul treno o discesa, restando nello stesso punto.
      if (rail && rail.speedAt(hereCell) > 0) {
        const other = onTrain ? g.cellCount + n : railBase + n;
        if (!closed.has(other)) relax(current, other, rail.boardMinutes, true);
      }
      // Discesa dalla strada nella cella collegata.
      const cell = nav.roads.nodeCell[n]!;
      if (!onTrain && cell >= 0 && !closed.has(cell) && land(cell))
        relax(current, cell, minutes(flatKm(here, cellCenter(nav, cell)), offRoadKmh(cell)), false);
    }
  }
  if (!found) return null;

  // Ricostruzione: dal traguardo indietro fino alla partenza.
  const ids: number[] = [];
  for (let id: number | undefined = goalCell; id !== undefined; id = cameFrom.get(id)) ids.unshift(id);
  const points: LngLat[] = ids.map(nodePos);
  const onRoad: boolean[] = ids.slice(1).map((id) => viaRoad.has(id));
  const train: number[] = ids.slice(1).map((id) => viaRail.get(id) ?? 0);
  points[0] = from;
  points[points.length - 1] = to;
  const route = smooth(nav, { points, onRoad, rail: train, terrain: [], km: 0 }, land, options.openPassages);
  route.terrain = route.onRoad.map((road, i) => (route.rail[i] ? 1 : legTerrain(nav, route.points[i]!, route.points[i + 1]!, road, terrain)));
  return route;
}

/**
 * Moltiplicatore medio della velocità su un tratto rettilineo che attraversa terreni diversi:
 * si campiona ogni ~2 km e si mediano i tempi (non le velocità).
 */
function legTerrain(nav: NavData, a: LngLat, b: LngLat, road: boolean, terrain: (cell: number) => number): number {
  const km = flatKm(a, b);
  const n = Math.max(1, Math.ceil(km / 2));
  let time = 0;
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    const f = terrain(cellAt(nav, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]));
    time += 1 / (road ? roadSpeedFactor(f) : f);
  }
  return n / time;
}

/**
 * Accorcia i tratti fuori strada: da un punto si salta direttamente al più lontano
 * raggiungibile in linea retta senza attraversare fiumi o celle vietate.
 */
function smooth(nav: NavData, route: Route, land: (cell: number) => boolean, open?: ReadonlySet<number>): Route {
  const { points, onRoad, rail } = route;
  const outPoints: LngLat[] = [points[0]!];
  const outRoad: boolean[] = [];
  const outRail: number[] = [];
  let i = 0;
  while (i < points.length - 1) {
    if (onRoad[i]) {
      // Le soste in stazione (salita e discesa) sono tratti di lunghezza zero: non servono.
      const p = points[i + 1]!;
      const prev = outPoints[outPoints.length - 1]!;
      if (p[0] !== prev[0] || p[1] !== prev[1]) {
        outPoints.push(p);
        outRoad.push(true);
        outRail.push(rail[i]!);
      }
      i++;
      continue;
    }
    // Fine del tratto fuori strada consecutivo.
    let end = i;
    while (end < onRoad.length && !onRoad[end]) end++;
    let j = end;
    while (j > i + 1 && !segmentClear(nav, points[i]!, points[j]!, land, open)) j--;
    outPoints.push(points[j]!);
    outRoad.push(false);
    outRail.push(0);
    i = j;
  }
  let km = 0;
  for (let k = 1; k < outPoints.length; k++) km += flatKm(outPoints[k - 1]!, outPoints[k]!);
  return { points: outPoints, onRoad: outRoad, rail: outRail, terrain: [], km };
}

/** Coda con priorità minima (heap binario). */
class MinHeap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size() {
    return this.ids.length;
  }
  push(id: number, key: number) {
    const { ids, keys } = this;
    let i = ids.length;
    ids.push(id);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p]! <= key) break;
      ids[i] = ids[p]!;
      keys[i] = keys[p]!;
      i = p;
    }
    ids[i] = id;
    keys[i] = key;
  }
  pop(): number {
    const { ids, keys } = this;
    const top = ids[0]!;
    const lastId = ids.pop()!;
    const lastKey = keys.pop()!;
    if (ids.length > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        let mk = lastKey;
        if (l < ids.length && keys[l]! < mk) [m, mk] = [l, keys[l]!];
        if (r < ids.length && keys[r]! < mk) m = r;
        if (m === i) break;
        ids[i] = ids[m]!;
        keys[i] = keys[m]!;
        i = m;
      }
      ids[i] = lastId;
      keys[i] = lastKey;
    }
    return top;
  }
}
