import type { LngLat, ProvinceId } from "../map/types.js";

// Rete di movimento: dove si può andare e quanto velocemente.
//
//  - una GRIGLIA regolare copre la terraferma: ogni cella sa a quale provincia appartiene
//    (0 = mare o terra fuori gioco) e quali passaggi verso le celle vicine sono bloccati
//    da un grande fiume;
//  - una RETE DI STRADE E FERROVIE, fatta di nodi e tratti; un tratto che attraversa un
//    grande fiume è un PONTE.
//
// Fuori strada ci si muove di cella in cella (più lentamente), su strada lungo i tratti.

export type RoadKind = "road" | "rail";

export interface Bridge {
  id: string;
  at: LngLat;
  river: string;
}

export interface River {
  name: string;
  lines: LngLat[][];
}

export interface NavData {
  mapId: string;
  /** Id delle province nell'ordine usato dalla griglia (indice + 1 nella griglia). */
  provinceIds: ProvinceId[];
  grid: {
    bbox: [number, number, number, number];
    step: number;
    width: number;
    height: number;
    /** Per cella: 0 = non percorribile, altrimenti indice della provincia + 1. */
    province: Uint16Array;
    /** Per cella, bit dei passaggi bloccati dai fiumi (vedi BLOCK_*). */
    blocked: Uint8Array;
  };
  roads: {
    /** Coordinate dei nodi: [lng0, lat0, lng1, lat1, …]. */
    nodes: Float64Array;
    /**
     * Cella da cui si sale o si scende dalla strada in ogni nodo (-1 = nessuna).
     * Non sempre è la cella che contiene il nodo: se tra i due passa un fiume si usa
     * una cella vicina sulla stessa sponda, così non si attraversa il fiume senza ponte.
     */
    nodeCell: Int32Array;
    edgeA: Int32Array;
    edgeB: Int32Array;
    /** 0 = strada, 1 = ferrovia. */
    edgeKind: Uint8Array;
    /** Indice del ponte in `bridges`, o -1. */
    edgeBridge: Int32Array;
  };
  bridges: Bridge[];
  /** Solo per il disegno: i grandi fiumi che fanno da ostacolo. */
  rivers: River[];
}

/** Bit di `blocked`: passaggio dalla cella (c, r) verso… */
export const BLOCK_EAST = 1; // (c+1, r)
export const BLOCK_SOUTH = 2; // (c, r+1)
export const BLOCK_SOUTH_EAST = 4; // (c+1, r+1)
export const BLOCK_SOUTH_WEST = 8; // (c-1, r+1)

/** Formato su file (JSON): gli array numerici grandi sono in base64. */
export interface NavFile {
  mapId: string;
  provinceIds: ProvinceId[];
  grid: { bbox: [number, number, number, number]; step: number; width: number; height: number; province: string; blocked: string };
  roads: { nodes: number[]; nodeCell: string; edgeA: string; edgeB: string; edgeKind: string; edgeBridge: string };
  bridges: Bridge[];
  rivers: River[];
}
