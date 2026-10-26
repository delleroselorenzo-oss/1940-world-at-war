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
//
// Il MARE (facoltativo) usa la stessa griglia: ogni cella navigabile sa a quale zona di mare
// appartiene; gli stretti sono gruppi di celle che si possono chiudere; ogni provincia
// costiera ha una cella dove attraccano le navi.

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

/** Zona di mare con un nome (Mare del Nord, Tirreno…): serve per i blocchi, gli eventi e per orientarsi. */
export interface SeaZone {
  id: string;
  name: string;
  /** Dove scrivere il nome sulla mappa. */
  label: LngLat;
}

/** Porta sull'oceano: da qui entrano i convogli mercantili che vengono dal resto del mondo (fuori mappa). */
export interface SeaGate {
  id: string;
  name: string;
  at: LngLat;
}

/** Stretto o canale: le navi lo attraversano passando per le sue celle, che si possono chiudere. */
export interface Strait {
  id: string;
  name: string;
  at: LngLat;
  /** Province sulle due rive (chi le tiene controlla il passaggio). */
  provinces: ProvinceId[];
}

export interface SeaData {
  /** Per cella: 0 = non navigabile, altrimenti indice della zona in `zones` + 1. */
  zone: Uint8Array;
  /** Per cella: indice dello stretto in `straits` + 1, 0 = mare aperto. */
  strait: Uint8Array;
  zones: SeaZone[];
  straits: Strait[];
  /** Per provincia (ordine di `provinceIds`): cella di mare dove attraccano le navi, -1 se non tocca il mare. */
  harbor: Int32Array;
  /** Solo per il disegno: confini tra le zone di mare. */
  borders: LngLat[][];
  /** Porte da cui arrivano i convogli (assenti = niente convogli: le importazioni via mare arrivano subito). */
  gates?: SeaGate[];
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
    /** Per cella, indice del terreno in `TERRAINS` (assente = tutto pianura). */
    terrain?: Uint8Array;
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
  sea?: SeaData;
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
  grid: { bbox: [number, number, number, number]; step: number; width: number; height: number; province: string; blocked: string; terrain?: string };
  roads: { nodes: number[]; nodeCell: string; edgeA: string; edgeB: string; edgeKind: string; edgeBridge: string };
  bridges: Bridge[];
  rivers: River[];
  sea?: { zone: string; strait: string; zones: SeaZone[]; straits: Strait[]; harbor: string; borders: LngLat[][] };
}
