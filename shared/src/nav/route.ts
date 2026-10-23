import { MOVEMENT } from "../data/movement.js";
import type { LngLat } from "../map/types.js";
import { cellAt, cellCenter, flatKm, isBlocked, segmentClear } from "./grid.js";
import type { NavData } from "./types.js";

// Ricerca del percorso più rapido tra due punti qualsiasi della terraferma.
//
// Il grafo ha due tipi di nodi: le celle della griglia (fuori strada, lente) e i nodi
// della rete stradale (veloci). Da una cella si sale sulla strada nei nodi collegati a
// quella cella e viceversa. I fiumi bloccano i passaggi tra celle: si attraversano solo
// lungo un tratto di strada o ferrovia, cioè su un ponte.

export interface Route {
  /** Punti da percorrere, dal punto di partenza a quello d'arrivo. */
  points: LngLat[];
  /** Per ogni tratto (points[i] → points[i+1]): true se è su strada o ferrovia. */
  onRoad: boolean[];
  /** Lunghezza totale in km. */
  km: number;
}

export interface RouteOptions {
  /** La cella si può attraversare? (es. solo territorio proprio) */
  canEnter(cell: number): boolean;
  /** Ponti non percorribili (es. distrutti), per indice. */
  closedBridges?: ReadonlySet<number>;
  offRoadFactor?: number;
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
 * Percorso più rapido da `from` a `to` (costo = km / fattore di velocità).
 * Restituisce null se l'arrivo non è raggiungibile.
 */
export function findRoute(nav: NavData, from: LngLat, to: LngLat, options: RouteOptions): Route | null {
  const g = graphOf(nav);
  const { width } = nav.grid;
  const offRoad = options.offRoadFactor ?? MOVEMENT.offRoadFactor;
  const { canEnter } = options;
  const land = (cell: number) => cell >= 0 && nav.grid.province[cell]! > 0 && canEnter(cell);

  const startCell = cellAt(nav, from);
  const goalCell = cellAt(nav, to);
  if (!land(startCell) || !land(goalCell)) return null;
  if (startCell === goalCell) return { points: [from, to], onRoad: [false], km: flatKm(from, to) };

  const nodePos = (id: number): LngLat =>
    id < g.cellCount ? cellCenter(nav, id) : [nav.roads.nodes[(id - g.cellCount) * 2]!, nav.roads.nodes[(id - g.cellCount) * 2 + 1]!];
  const goalPos = cellCenter(nav, goalCell);
  const heuristic = (id: number) => flatKm(nodePos(id), goalPos); // la strada è il modo più veloce: stima ottimista

  const cost = new Map<number, number>([[startCell, 0]]);
  const cameFrom = new Map<number, number>();
  const viaRoad = new Set<number>(); // nodi raggiunti percorrendo un tratto di strada
  const closed = new Set<number>();
  const heap = new MinHeap();
  heap.push(startCell, heuristic(startCell));

  const relax = (from: number, to: number, step: number, road: boolean) => {
    const c = cost.get(from)! + step;
    if (c >= (cost.get(to) ?? Infinity)) return;
    cost.set(to, c);
    cameFrom.set(to, from);
    if (road) viaRoad.add(to);
    else viaRoad.delete(to);
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
          if (closed.has(next) || !land(next) || isBlocked(nav, current, next)) continue;
          relax(current, next, flatKm(here, cellCenter(nav, next)) / offRoad, false);
        }
      // Salita sulla strada nei nodi collegati alla cella.
      for (let i = g.cellRoadStart[current]!; i < g.cellRoadStart[current + 1]!; i++) {
        const node = g.cellCount + g.cellRoadNode[i]!;
        if (!closed.has(node)) relax(current, node, flatKm(here, nodePos(node)) / offRoad, false);
      }
    } else {
      const n = current - g.cellCount;
      // Lungo la strada.
      for (let i = g.adjStart[n]!; i < g.adjStart[n + 1]!; i++) {
        const other = g.adjNode[i]!;
        const edge = g.adjEdge[i]!;
        const node = g.cellCount + other;
        if (closed.has(node)) continue;
        const bridge = nav.roads.edgeBridge[edge]!;
        if (bridge >= 0 && options.closedBridges?.has(bridge)) continue;
        const pos = nodePos(node);
        if (!land(cellAt(nav, pos))) continue;
        const factor = nav.roads.edgeKind[edge] === 1 ? MOVEMENT.railFactor : MOVEMENT.roadFactor;
        relax(current, node, flatKm(here, pos) / factor, true);
      }
      // Discesa dalla strada nella cella collegata.
      const cell = nav.roads.nodeCell[n]!;
      if (cell >= 0 && !closed.has(cell) && land(cell)) relax(current, cell, flatKm(here, cellCenter(nav, cell)) / offRoad, false);
    }
  }
  if (!found) return null;

  // Ricostruzione: dal traguardo indietro fino alla partenza.
  const ids: number[] = [];
  for (let id: number | undefined = goalCell; id !== undefined; id = cameFrom.get(id)) ids.unshift(id);
  const points: LngLat[] = ids.map(nodePos);
  const onRoad: boolean[] = ids.slice(1).map((id) => viaRoad.has(id));
  points[0] = from;
  points[points.length - 1] = to;
  return smooth(nav, { points, onRoad, km: 0 }, land);
}

/**
 * Accorcia i tratti fuori strada: da un punto si salta direttamente al più lontano
 * raggiungibile in linea retta senza attraversare fiumi o celle vietate.
 */
function smooth(nav: NavData, route: Route, land: (cell: number) => boolean): Route {
  const { points, onRoad } = route;
  const outPoints: LngLat[] = [points[0]!];
  const outRoad: boolean[] = [];
  let i = 0;
  while (i < points.length - 1) {
    if (onRoad[i]) {
      outPoints.push(points[i + 1]!);
      outRoad.push(true);
      i++;
      continue;
    }
    // Fine del tratto fuori strada consecutivo.
    let end = i;
    while (end < onRoad.length && !onRoad[end]) end++;
    let j = end;
    while (j > i + 1 && !segmentClear(nav, points[i]!, points[j]!, land)) j--;
    outPoints.push(points[j]!);
    outRoad.push(false);
    i = j;
  }
  let km = 0;
  for (let k = 1; k < outPoints.length; k++) km += flatKm(outPoints[k - 1]!, outPoints[k]!);
  return { points: outPoints, onRoad: outRoad, km };
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
