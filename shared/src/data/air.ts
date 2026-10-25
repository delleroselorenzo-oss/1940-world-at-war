import type { ResourceId } from "../map/types.js";
import type { BuildingId } from "./buildings.js";
import { UNIT_TYPES, type ArmorClass, type UnitTypeId } from "./units.js";

// Aviazione: tipi di aereo e valori di volo (vedi docs/game-design.md, §9 "Aviazione").
// Le portate partono da quelle storiche degli aerei della RAF, ridotte di circa il 10% per la mappa europea.

export type AircraftTypeId = "fighter" | "tacticalBomber" | "torpedoBomber" | "strategicBomber" | "recon";

export interface AircraftType {
  id: AircraftTypeId;
  name: string;
  /** Edificio della città che lo produce. */
  building: "aircraftFactory";
  description: string;
  /** Portata: distanza massima in linea d'aria di un volo di trasferimento. Il raggio d'azione è la metà. */
  rangeKm: number;
  /** Velocità di crociera in km/h di gioco. */
  speedKmh: number;
  /** Minuti a terra per rifornirsi dopo ogni volo (senza costi: è compreso nel mantenimento). */
  refuelMinutes: number;
  hp: number;
  /** Danno di un attacco contro ciascuna classe di bersaglio a terra (si useranno con gli ordini di attacco). */
  attack: Record<ArmorClass, number>;
  cost: Partial<Record<ResourceId, number>>;
  /** Ore di gioco per costruirlo in una città con la fabbrica aeronautica. */
  productionHours: number;
  /** Consumo giornaliero (il petrolio comprende i rifornimenti). */
  upkeepPerDay: Partial<Record<ResourceId, number>>;
}

export const AIRCRAFT_TYPES: Record<AircraftTypeId, AircraftType> = {
  fighter: {
    id: "fighter",
    name: "Caccia",
    building: "aircraftFactory",
    description: "Intercetta gli aerei nemici, scorta i bombardieri e pattuglia il cielo. Come lo Spitfire I e l'Hurricane I (~700 km).",
    rangeKm: 630,
    speedKmh: 450,
    refuelMinutes: 30,
    hp: 10,
    attack: { infantry: 1, armored: 0.5 },
    cost: { goods: 600, metal: 700, oil: 300, money: 1200, manpower: 300 },
    productionHours: 12,
    upkeepPerDay: { metal: 30, oil: 60, money: 80 },
  },
  tacticalBomber: {
    id: "tacticalBomber",
    name: "Bombardiere tattico",
    building: "aircraftFactory",
    description: "Colpisce le armate vicino al fronte. Come il Fairey Battle e il Blenheim IV (1.600–2.300 km).",
    rangeKm: 1450,
    speedKmh: 350,
    refuelMinutes: 30,
    hp: 12,
    attack: { infantry: 4, armored: 3 },
    cost: { goods: 700, metal: 900, oil: 400, money: 1500, manpower: 400 },
    productionHours: 16,
    upkeepPerDay: { metal: 40, oil: 80, money: 100 },
  },
  torpedoBomber: {
    id: "torpedoBomber",
    name: "Aerosilurante",
    building: "aircraftFactory",
    description: "Attacca le navi (con la marina). Come lo Swordfish e il Beaufort (850–2.600 km).",
    rangeKm: 1600,
    speedKmh: 300,
    refuelMinutes: 45,
    hp: 12,
    attack: { infantry: 2, armored: 1.5 },
    cost: { goods: 700, metal: 900, oil: 400, money: 1500, manpower: 400 },
    productionHours: 16,
    upkeepPerDay: { metal: 40, oil: 80, money: 100 },
  },
  strategicBomber: {
    id: "strategicBomber",
    name: "Bombardiere strategico",
    building: "aircraftFactory",
    description: "Colpisce edifici e città lontano dal fronte. Come il Wellington (~2.550 km).",
    rangeKm: 2300,
    speedKmh: 300,
    refuelMinutes: 45,
    hp: 18,
    attack: { infantry: 3, armored: 2 },
    cost: { goods: 900, metal: 1300, oil: 600, money: 2200, manpower: 600 },
    productionHours: 24,
    upkeepPerDay: { metal: 60, oil: 120, money: 150 },
  },
  recon: {
    id: "recon",
    name: "Ricognitore",
    building: "aircraftFactory",
    description: "Vede lontano e pattuglia il mare; attacca poco. Come l'Hudson e il Sunderland (~3.000 km).",
    rangeKm: 2700,
    speedKmh: 300,
    refuelMinutes: 45,
    hp: 8,
    attack: { infantry: 0.5, armored: 0.25 },
    cost: { goods: 500, metal: 500, oil: 300, money: 1000, manpower: 300 },
    productionHours: 10,
    upkeepPerDay: { metal: 20, oil: 50, money: 60 },
  },
};

export const AIRCRAFT_TYPE_IDS = Object.keys(AIRCRAFT_TYPES) as AircraftTypeId[];

export function isAircraftType(id: string): id is AircraftTypeId {
  return id in AIRCRAFT_TYPES;
}

export const AIR = {
  /** Ogni livello dell'aeroporto oltre il primo riduce di questa frazione i tempi a terra (rifornimento, riparazione). */
  airfieldTimeCutPerLevel: 0.15,
  /** Velocità del convoglio a terra quando l'aereo non può volare fino alla meta (come l'artiglieria). */
  convoyKmh: 18,
  /** Pattugliamento: raggio del cerchio e durata sul posto. */
  patrolRadiusKm: 60,
  patrolMinutes: 25,
} as const;

/** Ciò che si può arruolare o costruire in una città: un'unità di terra o un aereo. */
export type ProducibleId = UnitTypeId | AircraftTypeId;

/** Dati comuni per la produzione di un'unità o di un aereo. */
export function productionType(id: ProducibleId): {
  name: string;
  building: BuildingId;
  cost: Partial<Record<ResourceId, number>>;
  productionHours: number;
} {
  return isAircraftType(id) ? AIRCRAFT_TYPES[id] : UNIT_TYPES[id];
}
