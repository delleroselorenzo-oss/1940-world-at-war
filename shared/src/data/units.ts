import type { ResourceId } from "../map/types.js";
import type { BuildingId } from "./buildings.js";

// Tipi di unità e valori di partenza per il bilanciamento (vedi docs/game-design.md, §7).

export type UnitTypeId = "infantry" | "motorized" | "armoredCar" | "lightTank" | "artillery" | "engineer" | "medic";

/** Ruolo di supporto: il genio fa i lavori (ponti, ospedali), la sanità cura. */
export type UnitRole = "engineer" | "medic";

/** Classe di armatura: decide quale valore di danno si usa contro un'unità. */
export type ArmorClass = "infantry" | "armored";

export const ARMOR_CLASSES: readonly ArmorClass[] = ["infantry", "armored"];

export const ARMOR_CLASS_NAMES: Record<ArmorClass, string> = {
  infantry: "Fanteria",
  armored: "Corazzati",
};

export interface UnitType {
  id: UnitTypeId;
  name: string;
  role?: UnitRole;
  /** Edificio della città che la produce. */
  building: BuildingId;
  /** Velocità di marcia in km/h di gioco. */
  speedKmh: number;
  hp: number;
  armor: ArmorClass;
  /** Danno per tick (30 minuti) contro ciascuna classe: `attack` quando attacca o marcia, `defense` quando difende da ferma. */
  attack: Record<ArmorClass, number>;
  defense: Record<ArmorClass, number>;
  cost: Partial<Record<ResourceId, number>>;
  /** Ore di gioco per arruolarla in una città. */
  productionHours: number;
  /** Consumo giornaliero, scalato a ogni tick come la produzione. */
  upkeepPerDay: Partial<Record<ResourceId, number>>;
}

export const UNIT_TYPES: Record<UnitTypeId, UnitType> = {
  infantry: {
    id: "infantry",
    building: "barracks",
    name: "Fanteria",
    speedKmh: 20,
    hp: 15,
    armor: "infantry",
    attack: { infantry: 2, armored: 1 },
    defense: { infantry: 3, armored: 1.5 },
    cost: { food: 400, goods: 300, money: 600, manpower: 1000 },
    productionHours: 6,
    upkeepPerDay: { food: 60, goods: 30, money: 60 },
  },
  motorized: {
    id: "motorized",
    building: "tankFactory",
    name: "Fanteria motorizzata",
    speedKmh: 32,
    hp: 15,
    armor: "infantry",
    attack: { infantry: 2.5, armored: 1 },
    defense: { infantry: 3, armored: 1.5 },
    cost: { food: 400, goods: 500, oil: 300, money: 900, manpower: 1000 },
    productionHours: 10,
    upkeepPerDay: { food: 60, oil: 50, money: 80 },
  },
  armoredCar: {
    id: "armoredCar",
    building: "tankFactory",
    name: "Autoblindo",
    speedKmh: 40,
    hp: 12,
    armor: "armored",
    attack: { infantry: 2.5, armored: 1 },
    defense: { infantry: 1.5, armored: 0.75 },
    cost: { goods: 400, metal: 500, oil: 300, money: 1000, manpower: 600 },
    productionHours: 10,
    upkeepPerDay: { metal: 30, oil: 60, money: 80 },
  },
  lightTank: {
    id: "lightTank",
    building: "tankFactory",
    name: "Carro leggero",
    speedKmh: 30,
    hp: 20,
    armor: "armored",
    attack: { infantry: 3.5, armored: 2.5 },
    defense: { infantry: 2, armored: 1.5 },
    cost: { goods: 300, metal: 900, oil: 500, money: 1300, manpower: 600 },
    productionHours: 14,
    upkeepPerDay: { metal: 50, oil: 80, money: 100 },
  },
  artillery: {
    id: "artillery",
    building: "artilleryFactory",
    name: "Artiglieria",
    speedKmh: 18,
    hp: 10,
    armor: "infantry",
    attack: { infantry: 3, armored: 1.5 },
    defense: { infantry: 2, armored: 1 },
    cost: { goods: 500, metal: 700, money: 1000, manpower: 800 },
    productionHours: 12,
    upkeepPerDay: { goods: 40, metal: 40, money: 80 },
  },
  engineer: {
    id: "engineer",
    building: "barracks",
    name: "Genio",
    role: "engineer",
    speedKmh: 20,
    hp: 12,
    armor: "infantry",
    attack: { infantry: 1, armored: 0.5 },
    defense: { infantry: 1.5, armored: 0.75 },
    cost: { goods: 400, metal: 300, money: 800, manpower: 600 },
    productionHours: 8,
    upkeepPerDay: { food: 40, goods: 30, money: 60 },
  },
  medic: {
    id: "medic",
    building: "barracks",
    name: "Sanità",
    role: "medic",
    speedKmh: 20,
    hp: 10,
    armor: "infantry",
    attack: { infantry: 0.5, armored: 0.25 },
    defense: { infantry: 1, armored: 0.5 },
    cost: { food: 300, goods: 300, money: 700, manpower: 600 },
    productionHours: 8,
    upkeepPerDay: { food: 50, goods: 20, money: 60 },
  },
};

export const UNIT_TYPE_IDS = Object.keys(UNIT_TYPES) as UnitTypeId[];

/** Armate con cui ogni nazione inizia la partita, nella capitale e nelle altre città. */
export const STARTING_ARMIES: { capital: Partial<Record<UnitTypeId, number>>; city: Partial<Record<UnitTypeId, number>> } = {
  capital: { infantry: 3, artillery: 1 },
  city: { infantry: 2 },
};

/**
 * Unità della marina in arrivo: si vedono nel pannello Produzione ma non si arruolano ancora,
 * perché manca la navigazione. Statistiche e costi si decideranno insieme a quelle meccaniche.
 */
export interface PlannedUnit {
  id: string;
  name: string;
  /** Edificio che la produrrà. */
  building: "aircraftFactory" | "shipyard";
  description: string;
}

export const PLANNED_UNITS: readonly PlannedUnit[] = [
  { id: "submarine", name: "Sottomarino", building: "shipyard", description: "Nascosto finché non attacca: affonda i convogli e taglia le importazioni via mare." },
  { id: "destroyer", name: "Cacciatorpediniere", building: "shipyard", description: "Nave veloce di scorta: dà la caccia ai sottomarini e protegge i convogli." },
  { id: "battleship", name: "Nave da battaglia", building: "shipyard", description: "Grandi cannoni contro le navi nemiche e le difese costiere." },
  { id: "carrier", name: "Portaerei", building: "shipyard", description: "Porta caccia e bombardieri in mare aperto." },
];
