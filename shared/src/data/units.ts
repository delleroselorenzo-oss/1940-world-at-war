import type { ResourceId } from "../map/types.js";

// Tipi di unità e valori di partenza per il bilanciamento (vedi docs/game-design.md, §7).
// Le statistiche di combattimento arriveranno con la milestone 4.

export type UnitTypeId = "infantry" | "motorized" | "armoredCar" | "lightTank" | "artillery";

export interface UnitType {
  id: UnitTypeId;
  name: string;
  /** Velocità di marcia in km/h di gioco. */
  speedKmh: number;
  hp: number;
  cost: Partial<Record<ResourceId, number>>;
  /** Ore di gioco per arruolarla in una città. */
  productionHours: number;
  /** Consumo giornaliero, scalato a ogni tick come la produzione. */
  upkeepPerDay: Partial<Record<ResourceId, number>>;
}

export const UNIT_TYPES: Record<UnitTypeId, UnitType> = {
  infantry: {
    id: "infantry",
    name: "Fanteria",
    speedKmh: 20,
    hp: 15,
    cost: { food: 400, goods: 300, money: 600, manpower: 1000 },
    productionHours: 6,
    upkeepPerDay: { food: 60, goods: 30, money: 60 },
  },
  motorized: {
    id: "motorized",
    name: "Fanteria motorizzata",
    speedKmh: 32,
    hp: 15,
    cost: { food: 400, goods: 500, oil: 300, money: 900, manpower: 1000 },
    productionHours: 10,
    upkeepPerDay: { food: 60, oil: 50, money: 80 },
  },
  armoredCar: {
    id: "armoredCar",
    name: "Autoblindo",
    speedKmh: 40,
    hp: 12,
    cost: { goods: 400, metal: 500, oil: 300, money: 1000, manpower: 600 },
    productionHours: 10,
    upkeepPerDay: { metal: 30, oil: 60, money: 80 },
  },
  lightTank: {
    id: "lightTank",
    name: "Carro leggero",
    speedKmh: 30,
    hp: 20,
    cost: { goods: 300, metal: 900, oil: 500, money: 1300, manpower: 600 },
    productionHours: 14,
    upkeepPerDay: { metal: 50, oil: 80, money: 100 },
  },
  artillery: {
    id: "artillery",
    name: "Artiglieria",
    speedKmh: 18,
    hp: 10,
    cost: { goods: 500, metal: 700, money: 1000, manpower: 800 },
    productionHours: 12,
    upkeepPerDay: { goods: 40, metal: 40, money: 80 },
  },
};

export const UNIT_TYPE_IDS = Object.keys(UNIT_TYPES) as UnitTypeId[];

/** Armate con cui ogni nazione inizia la partita, nella capitale e nelle altre città. */
export const STARTING_ARMIES: { capital: Partial<Record<UnitTypeId, number>>; city: Partial<Record<UnitTypeId, number>> } = {
  capital: { infantry: 3, artillery: 1 },
  city: { infantry: 2 },
};
