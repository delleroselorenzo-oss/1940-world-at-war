import type { ResourceId } from "../map/types.js";
import type { BuildingId } from "./buildings.js";

// Tipi di unità e valori di partenza per il bilanciamento (vedi docs/game-design.md, §7).

export type UnitTypeId =
  | "infantry"
  | "motorized"
  | "armoredCar"
  | "lightTank"
  | "artillery"
  | "antiTank"
  | "antiAircraft"
  | "engineer"
  | "medic";

/** Ruolo di supporto: il genio fa i lavori (ponti, ospedali), la sanità cura. */
export type UnitRole = "engineer" | "medic";

/** Classe di armatura dei bersagli a terra: decide quale valore di danno si usa contro un'unità. */
export type ArmorClass = "soft" | "light" | "heavy";

export const ARMOR_CLASSES: readonly ArmorClass[] = ["soft", "light", "heavy"];

export const ARMOR_CLASS_NAMES: Record<ArmorClass, string> = {
  soft: "Non corazzati",
  light: "Armatura leggera",
  heavy: "Armatura pesante",
};

/** Attacco e difesa contro un tipo di bersaglio. */
export interface AttackDefense {
  attack: number;
  defense: number;
}

export interface UnitType {
  id: UnitTypeId;
  name: string;
  role?: UnitRole;
  description: string;
  /** Edificio della città che la produce. */
  building: BuildingId;
  /** Velocità di marcia in km/h di gioco. */
  speedKmh: number;
  hp: number;
  armor: ArmorClass;
  /** Danno per tick (30 minuti) contro ciascuna classe: `attack` quando attacca o marcia, `defense` quando difende da ferma. */
  attack: Record<ArmorClass, number>;
  defense: Record<ArmorClass, number>;
  /** Contraerea: danno inflitto agli aerei che attaccano l'armata (o un'armata della stessa nazione vicina). */
  antiAir: number;
  /** Contro navi e sottomarini (arriveranno con la marina). Assente = nessun danno. */
  vsShip?: AttackDefense;
  vsSub?: AttackDefense;
  /** Danno agli edifici (arriverà con i bombardamenti). Assente = nessuno. */
  vsBuilding?: number;
  /** Punti di morale tolti alla provincia del bersaglio a ogni colpo a distanza (fino a `COMBAT.moraleFloor`). */
  moraleDamage?: number;
  /**
   * Gittata in km: l'unità colpisce da lontano, ogni tick, l'armata nemica più vicina entro questa distanza,
   * senza che possa rispondere. Solo da ferma, dopo la messa in batteria (`COMBAT.setupMinutes`).
   */
  rangeKm?: number;
  cost: Partial<Record<ResourceId, number>>;
  /** Ore di gioco per arruolarla in una città. */
  productionHours: number;
  /** Consumo giornaliero, scalato a ogni tick come la produzione. */
  upkeepPerDay: Partial<Record<ResourceId, number>>;
}

export const UNIT_TYPES: Record<UnitTypeId, UnitType> = {
  infantry: {
    id: "infantry",
    description: "Il grosso di ogni esercito: tiene il terreno e difende bene, ma soffre contro i carri.",
    building: "barracks",
    name: "Fanteria",
    speedKmh: 20,
    hp: 15,
    armor: "soft",
    attack: { soft: 2, light: 1, heavy: 0.5 },
    defense: { soft: 3, light: 1.5, heavy: 0.75 },
    antiAir: 0.5,
    vsBuilding: 0.25,
    cost: { food: 400, goods: 300, money: 600, manpower: 1000 },
    productionHours: 6,
    upkeepPerDay: { food: 60, goods: 30, money: 60 },
  },
  motorized: {
    id: "motorized",
    description: "Fanteria su camion, con più armi di supporto: più veloce e più forte della fanteria, ma costa di più e consuma petrolio.",
    building: "barracks",
    name: "Fanteria motorizzata",
    speedKmh: 32,
    hp: 15,
    armor: "soft",
    attack: { soft: 2.5, light: 1.25, heavy: 0.75 },
    defense: { soft: 3.5, light: 1.75, heavy: 1 },
    antiAir: 0.5,
    vsBuilding: 0.25,
    cost: { food: 400, goods: 800, oil: 400, money: 1200, manpower: 1000 },
    productionHours: 12,
    upkeepPerDay: { food: 60, oil: 50, money: 80 },
  },
  armoredCar: {
    id: "armoredCar",
    description: "Mezzo veloce con mitragliatrici e cannoncino: schiaccia la fanteria ed esplora, ma non regge contro i carri pesanti.",
    building: "tankFactory",
    name: "Autoblindo",
    speedKmh: 40,
    hp: 12,
    armor: "light",
    attack: { soft: 4, light: 1.75, heavy: 0.75 },
    defense: { soft: 2.5, light: 1.25, heavy: 0.75 },
    antiAir: 1,
    vsBuilding: 0.25,
    cost: { goods: 400, metal: 500, oil: 300, money: 1000, manpower: 600 },
    productionHours: 10,
    upkeepPerDay: { metal: 30, oil: 60, money: 80 },
  },
  lightTank: {
    id: "lightTank",
    description: "Carro per sfondare e avanzare, come i Panzer II e gli M13/40: forte in attacco, meno in difesa.",
    building: "tankFactory",
    name: "Carro leggero",
    speedKmh: 30,
    hp: 20,
    armor: "light",
    attack: { soft: 3.5, light: 2.5, heavy: 1 },
    defense: { soft: 2, light: 2, heavy: 0.75 },
    antiAir: 0.5,
    vsBuilding: 0.5,
    cost: { goods: 300, metal: 900, oil: 500, money: 1300, manpower: 600 },
    productionHours: 14,
    upkeepPerDay: { metal: 50, oil: 80, money: 100 },
  },
  artillery: {
    id: "artillery",
    description: "Obici da campagna: colpiscono da lontano (12 km) senza risposta e in difesa spezzano gli assalti, anche dei carri. Lenti e fragili se raggiunti.",
    building: "artilleryFactory",
    name: "Artiglieria",
    speedKmh: 18,
    hp: 10,
    armor: "soft",
    attack: { soft: 3, light: 1.5, heavy: 1 },
    defense: { soft: 4, light: 3, heavy: 2 },
    antiAir: 0.5,
    vsShip: { attack: 1, defense: 1 },
    vsBuilding: 2,
    moraleDamage: 0.1,
    rangeKm: 12,
    cost: { goods: 500, metal: 700, money: 1000, manpower: 800 },
    productionHours: 12,
    upkeepPerDay: { goods: 40, metal: 40, money: 80 },
  },
  antiTank: {
    id: "antiTank",
    description: "Cannoni anticarro, come il Pak 36 e il 47/32: combattono da vicino e sono la miglior difesa contro i carri.",
    building: "artilleryFactory",
    name: "Anticarro",
    speedKmh: 20,
    hp: 10,
    armor: "soft",
    attack: { soft: 1.5, light: 2, heavy: 1.5 },
    defense: { soft: 3, light: 4, heavy: 4.5 },
    antiAir: 0.5,
    cost: { goods: 300, metal: 500, money: 800, manpower: 500 },
    productionHours: 8,
    upkeepPerDay: { goods: 30, metal: 20, money: 60 },
  },
  antiAircraft: {
    id: "antiAircraft",
    description: "Cannoni contraerei: proteggono le armate vicine dagli aerei e, in mancanza di meglio, difendono bene la posizione.",
    building: "artilleryFactory",
    name: "Antiaerea",
    speedKmh: 20,
    hp: 10,
    armor: "soft",
    attack: { soft: 1, light: 0.5, heavy: 0.5 },
    defense: { soft: 2.5, light: 2, heavy: 2 },
    antiAir: 4,
    cost: { goods: 400, metal: 600, money: 900, manpower: 600 },
    productionHours: 10,
    upkeepPerDay: { goods: 30, metal: 30, money: 70 },
  },
  engineer: {
    id: "engineer",
    description: "Costruisce e distrugge ponti, fortificazioni, aeroporti e porti.",
    building: "barracks",
    name: "Genio",
    role: "engineer",
    speedKmh: 20,
    hp: 12,
    armor: "soft",
    attack: { soft: 1, light: 0.5, heavy: 0.25 },
    defense: { soft: 1.5, light: 0.75, heavy: 0.5 },
    antiAir: 0.25,
    vsBuilding: 1,
    cost: { goods: 400, metal: 300, money: 800, manpower: 600 },
    productionHours: 8,
    upkeepPerDay: { food: 40, goods: 30, money: 60 },
  },
  medic: {
    id: "medic",
    description: "Cura le unità ferite dell'armata e allestisce gli ospedali da campo.",
    building: "barracks",
    name: "Sanità",
    role: "medic",
    speedKmh: 20,
    hp: 10,
    armor: "soft",
    attack: { soft: 0.5, light: 0.25, heavy: 0 },
    defense: { soft: 1, light: 0.5, heavy: 0.25 },
    antiAir: 0,
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
