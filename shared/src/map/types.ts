// Tipi della mappa di gioco. Sono condivisi tra lo script che genera la mappa,
// il server (regole) e il client (rendering).

export type NationId = string;
export type ProvinceId = string;

/** Coordinate geografiche [longitudine, latitudine] in gradi. */
export type LngLat = [number, number];

export type ProvinceType = "urban" | "rural";

export type Terrain = "plains" | "hills" | "mountains" | "forest" | "urban";

/** Risorse "principali": ogni provincia ne produce al massimo una. */
export type MainResourceId = "food" | "goods" | "metal" | "oil" | "rare";

/** Tutte le risorse: le principali più denaro e manodopera, prodotte da ogni provincia. */
export type ResourceId = MainResourceId | "money" | "manpower";

export interface ProvinceNeighbor {
  id: ProvinceId;
  /** Distanza in km tra i centri delle due province. */
  distanceKm: number;
}

export interface Province {
  id: ProvinceId;
  name: string;
  /** Nazione proprietaria a inizio partita (le province iniziali sono "core"). */
  nation: NationId;
  type: ProvinceType;
  /** Nome della città, solo per le province urbane. */
  city?: string;
  isCapital: boolean;
  /** Ancora da assegnare: null nella bozza generata automaticamente. */
  terrain: Terrain | null;
  /** Risorsa principale prodotta; null per le province rurali che producono solo denaro e manodopera. */
  resource: MainResourceId | null;
  /** Centro della provincia, dove stazionano le guarnigioni. */
  center: LngLat;
  areaKm2: number;
  coastal: boolean;
  neighbors: ProvinceNeighbor[];
}

export interface Nation {
  id: NationId;
  name: string;
  color: string;
  capitalProvince: ProvinceId | null;
}

export interface MapData {
  id: string;
  name: string;
  /** Data storica dei confini (ISO, es. "1933-06-01"). */
  date: string;
  nations: Nation[];
  provinces: Province[];
}
