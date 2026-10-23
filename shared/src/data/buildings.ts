import type { ResourceId } from "../map/types.js";

// Edifici delle province e valori di partenza per il bilanciamento (vedi docs/game-design.md, §5).

export type BuildingId =
  | "barracks"
  | "tankFactory"
  | "artilleryFactory"
  | "aircraftFactory"
  | "shipyard"
  | "recruitmentOffice"
  | "industry"
  | "fortifications"
  | "airfield"
  | "port";

export interface BuildingType {
  id: BuildingId;
  name: string;
  /** Cosa permette, in breve (per l'interfaccia). */
  description: string;
  /** "urban": solo nelle città; "any": in qualsiasi provincia. */
  where: "urban" | "any";
  /** Solo nelle province costiere. */
  coastal?: boolean;
  /** Lo costruisce il genio sul posto (lavoro di un'armata) invece della provincia. */
  byEngineers?: boolean;
  maxLevel: number;
  /** Costo del livello 1: il livello n costa n volte tanto. */
  cost: Partial<Record<ResourceId, number>>;
  /** Ore di gioco per il livello 1: il livello n ci mette n volte tanto (il genio divide per il proprio numero). */
  hours: number;
}

export const BUILDING_TYPES: Record<BuildingId, BuildingType> = {
  barracks: {
    id: "barracks",
    name: "Caserma",
    description: "Arruola fanteria, genio e sanità.",
    where: "urban",
    maxLevel: 3,
    cost: { goods: 1200, metal: 400, money: 1500 },
    hours: 12,
  },
  tankFactory: {
    id: "tankFactory",
    name: "Fabbrica di mezzi corazzati",
    description: "Costruisce carri, autoblindo e fanteria motorizzata, già con l'equipaggio.",
    where: "urban",
    maxLevel: 3,
    cost: { goods: 1500, metal: 1500, money: 2500 },
    hours: 24,
  },
  artilleryFactory: {
    id: "artilleryFactory",
    name: "Fabbrica di artiglieria",
    description: "Costruisce l'artiglieria.",
    where: "urban",
    maxLevel: 3,
    cost: { goods: 1500, metal: 1200, money: 2000 },
    hours: 18,
  },
  aircraftFactory: {
    id: "aircraftFactory",
    name: "Fabbrica aeronautica",
    description: "Costruirà gli aerei (in arrivo con l'aviazione).",
    where: "urban",
    maxLevel: 3,
    cost: { goods: 2000, metal: 1500, oil: 500, money: 3000 },
    hours: 24,
  },
  shipyard: {
    id: "shipyard",
    name: "Cantiere navale",
    description: "Costruirà le navi (in arrivo con la marina).",
    where: "urban",
    coastal: true,
    maxLevel: 3,
    cost: { goods: 2000, metal: 2000, money: 3000 },
    hours: 24,
  },
  recruitmentOffice: {
    id: "recruitmentOffice",
    name: "Ufficio di reclutamento",
    description: "Più manodopera dalla provincia.",
    where: "any",
    maxLevel: 3,
    cost: { goods: 800, money: 1500 },
    hours: 12,
  },
  industry: {
    id: "industry",
    name: "Industria",
    description: "Più produzione della risorsa principale (o di denaro, se la provincia non ne ha).",
    where: "any",
    maxLevel: 3,
    cost: { goods: 1500, metal: 800, money: 2000 },
    hours: 18,
  },
  fortifications: {
    id: "fortifications",
    name: "Fortificazioni",
    description: "Meno danni alle tue armate che difendono nella provincia.",
    where: "any",
    byEngineers: true,
    maxLevel: 3,
    cost: { goods: 800, metal: 600, money: 800 },
    hours: 8,
  },
  airfield: {
    id: "airfield",
    name: "Aeroporto",
    description: "Base per decollo e atterraggio degli aerei (in arrivo con l'aviazione).",
    where: "any",
    byEngineers: true,
    maxLevel: 1,
    cost: { goods: 1000, metal: 500, oil: 300, money: 1200 },
    hours: 12,
  },
  port: {
    id: "port",
    name: "Porto",
    description: "Imbarco e sbarco delle truppe (in arrivo con la marina).",
    where: "any",
    coastal: true,
    byEngineers: true,
    maxLevel: 1,
    cost: { goods: 1500, metal: 800, money: 1500 },
    hours: 16,
  },
};

export const BUILDING_IDS = Object.keys(BUILDING_TYPES) as BuildingId[];

export const BUILDINGS = {
  /** Ogni livello oltre il primo riduce di questa frazione i tempi di arruolamento nella provincia. */
  productionTimeCutPerLevel: 0.15,
  /** Industria: + produzione della risorsa principale (o del denaro) per livello. */
  industryBonusPerLevel: 0.25,
  /** Ufficio di reclutamento: + manodopera per livello. */
  recruitmentBonusPerLevel: 0.25,
  /** Fortificazioni: danno subito in meno, per livello, da chi difende nella provincia. */
  fortDefensePerLevel: 0.15,
  /** Livelli persi da ogni edificio quando la provincia cambia padrone (conquista o rivolta). */
  conquestLevelLoss: 1,
} as const;

/** Edifici con cui iniziano le città. */
export const STARTING_BUILDINGS: { capital: Partial<Record<BuildingId, number>>; city: Partial<Record<BuildingId, number>> } = {
  capital: { barracks: 2, tankFactory: 1, artilleryFactory: 1 },
  city: { barracks: 1 },
};
