// Tipi della mappa di gioco. Sono condivisi tra lo script che genera la mappa,
// il server (regole) e il client (rendering).

export type NationId = string;
export type ProvinceId = string;

/** Coordinate geografiche [longitudine, latitudine] in gradi. */
export type LngLat = [number, number];

export type ProvinceType = "urban" | "rural";

export type Terrain = "plains" | "hills" | "mountains" | "forest" | "urban";

/** Risorse "principali": ogni provincia ne produce al massimo una. */
export type MainResourceId = "food" | "goods" | "metal" | "oil";

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
  /** Popolazione stimata nel 1933, in migliaia di abitanti. */
  population: number;
  /** PIL pro capite della zona a fine anni '30 (dollari internazionali del 1990): misura quanto è sviluppata. */
  gdpPerCapita: number;
  /** Solo dove c'è un giacimento di petrolio: estrazione del 1938, in milioni di tonnellate all'anno. */
  oilMtPerYear?: number;
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
  /** Scorte di petrolio a inizio partita (al posto dei giorni di produzione, se di più). */
  oilReserve?: number;
  /** Petrolio al giorno delle concessioni all'estero, comprato a prezzo scontato (arriva via mare). */
  oilConcessionPerDay?: number;
}

export interface MapData {
  id: string;
  name: string;
  /** Data storica dei confini (ISO, es. "1933-06-01"). */
  date: string;
  nations: Nation[];
  provinces: Province[];
}
