import type { MapData, Province } from "../map/types.js";
import { BLOCK_EAST, BLOCK_SOUTH_EAST, BLOCK_SOUTH_WEST, type NavData } from "../nav/types.js";
import type { World } from "./orders.js";

// Mondo minimo per i test del motore: celle da 0,1° (circa 11 km all'equatore).
//
//   colonne  0-4   5-9   10-14  15-19
//   province A1    A2  ┊ A3     B1        (A* = nazione AAA, B1 = nazione BBB)
//                      ┊
//                      fiume tra la colonna 9 e la 10
//
// Una strada corre lungo la riga 2 da un capo all'altro e attraversa il fiume su un ponte.
// L'isola A9 (colonna 22, separata dal mare) appartiene ad AAA.
// Il mare (colonne 20-21, una sola zona) ha gli approdi di B1 (colonna 20, riga 2) e di A9 (colonna 21, riga 2).
// Con `neutralBetween` la provincia A3 appartiene invece a una terza nazione, CCC.
// Con `railway` la strada è invece una ferrovia.

export const STEP = 0.1;
const WIDTH = 23;
const HEIGHT = 5;
const ROAD_ROW = 2;
const RIVER_COL = 10;

const columns: Record<string, [number, number]> = { A1: [0, 4], A2: [5, 9], A3: [10, 14], B1: [15, 19], A9: [22, 22] };

/** Centro della cella (col, row) come [lng, lat]. */
export function cell(col: number, row: number): [number, number] {
  return [(col + 0.5) * STEP, (HEIGHT - row - 0.5) * STEP];
}

export function testWorld(options: { withBridge?: boolean; neutralBetween?: boolean; railway?: boolean } = {}): World {
  const ids = Object.keys(columns);
  const provinces: Province[] = ids.map((id) => {
    const [c0, c1] = columns[id]!;
    const urban = id === "A1" || id === "B1";
    return {
      id,
      name: id,
      nation: options.neutralBetween && id === "A3" ? "CCC" : id.startsWith("A") ? "AAA" : "BBB",
      type: urban ? "urban" : "rural",
      isCapital: urban,
      city: urban ? id : undefined,
      terrain: null,
      resource: id === "A1" ? "goods" : null,
      population: urban ? 2000 : 500,
      gdpPerCapita: 4000,
      center: cell(Math.round((c0 + c1) / 2), ROAD_ROW),
      areaKm2: 5000,
      coastal: id === "A1",
      neighbors: [],
    };
  });
  const map: MapData = {
    id: "test",
    name: "Test",
    date: "1933-06-01",
    nations: [
      { id: "AAA", name: "A", color: "#f00", capitalProvince: "A1" },
      { id: "BBB", name: "B", color: "#00f", capitalProvince: "B1" },
      ...(options.neutralBetween ? [{ id: "CCC", name: "C", color: "#0f0", capitalProvince: "A3" }] : []),
    ],
    provinces,
  };

  const province = new Uint16Array(WIDTH * HEIGHT);
  const blocked = new Uint8Array(WIDTH * HEIGHT);
  for (let r = 0; r < HEIGHT; r++)
    for (let c = 0; c < WIDTH; c++) {
      const i = ids.findIndex((id) => c >= columns[id]![0] && c <= columns[id]![1]);
      province[r * WIDTH + c] = i + 1;
    }
  // Il fiume blocca ogni passaggio fuori strada tra la colonna 9 e la 10.
  for (let r = 0; r < HEIGHT; r++) {
    blocked[r * WIDTH + RIVER_COL - 1]! |= BLOCK_EAST | BLOCK_SOUTH_EAST;
    blocked[r * WIDTH + RIVER_COL]! |= BLOCK_SOUTH_WEST;
  }

  // Strada: un nodo al centro di ogni cella della riga 2, dalla colonna 0 alla 19.
  const nodes: number[] = [];
  const nodeCell: number[] = [];
  for (let c = 0; c < 20; c++) {
    nodes.push(...cell(c, ROAD_ROW));
    nodeCell.push(ROAD_ROW * WIDTH + c);
  }
  const edgeA: number[] = [];
  const edgeB: number[] = [];
  const edgeBridge: number[] = [];
  for (let c = 1; c < 20; c++) {
    const isBridge = c === RIVER_COL;
    if (isBridge && options.withBridge === false) continue;
    edgeA.push(c - 1);
    edgeB.push(c);
    edgeBridge.push(isBridge ? 0 : -1);
  }

  const nav: NavData = {
    mapId: "test",
    provinceIds: ids,
    grid: { bbox: [0, 0, WIDTH * STEP, HEIGHT * STEP], step: STEP, width: WIDTH, height: HEIGHT, province, blocked },
    roads: {
      nodes: Float64Array.from(nodes),
      nodeCell: Int32Array.from(nodeCell),
      edgeA: Int32Array.from(edgeA),
      edgeB: Int32Array.from(edgeB),
      edgeKind: new Uint8Array(edgeA.length).fill(options.railway ? 1 : 0),
      edgeBridge: Int32Array.from(edgeBridge),
    },
    bridges: [{ id: "br1", at: [RIVER_COL * STEP, cell(0, ROAD_ROW)[1]], river: "Fiume" }],
    rivers: [{ name: "Fiume", lines: [[[RIVER_COL * STEP, 0], [RIVER_COL * STEP, HEIGHT * STEP]]] }],
    sea: {
      zone: Uint8Array.from(province, (p) => (p === 0 ? 1 : 0)),
      strait: new Uint8Array(WIDTH * HEIGHT),
      zones: [{ id: "sea", name: "Mare", label: cell(20, 2) }],
      straits: [],
      harbor: Int32Array.from(ids, (id) => (id === "B1" ? ROAD_ROW * WIDTH + 20 : id === "A9" ? ROAD_ROW * WIDTH + 21 : -1)),
      borders: [],
    },
  };
  return { map, nav };
}
