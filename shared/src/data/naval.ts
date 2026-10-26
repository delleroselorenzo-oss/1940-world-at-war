import type { ResourceId } from "../map/types.js";
import type { ArmorClass, AttackDefense } from "./units.js";

// Marina: tipi di nave (vedi docs/game-design.md, §8 "Marina").
// Velocità di crociera (non la massima): una traversata da Odessa a Londra dura circa 9 giorni, come allora.
// I valori di combattimento sono di partenza e conteranno dal passo 3 (combattimento navale).

export type ShipTypeId = "submarine" | "destroyer" | "cruiser" | "battleship" | "carrier";

export interface ShipType {
  id: ShipTypeId;
  name: string;
  /** Edificio della città che la costruisce. */
  building: "shipyard";
  description: string;
  /** Velocità di crociera in km/h di gioco. */
  speedKmh: number;
  /** Vista: vede navi e armate entro questa distanza. */
  sightKm: number;
  hp: number;
  /** Contro le navi di superficie e contro i sottomarini. */
  vsShip: AttackDefense;
  vsSub: AttackDefense;
  /** Contraerea: danno agli aerei che attaccano la flotta. */
  antiAir: number;
  /** Tiro contro la costa (armate a terra entro la gittata), per classe di armatura. Assente = nessuno. */
  shore?: Record<ArmorClass, number>;
  /** Gittata dei cannoni in km (0 = solo da vicino, come i siluri). */
  rangeKm: number;
  cost: Partial<Record<ResourceId, number>>;
  /** Ore di gioco per costruirla in una città con il cantiere navale. */
  productionHours: number;
  upkeepPerDay: Partial<Record<ResourceId, number>>;
  /** Scopre i sottomarini nemici entro questa distanza (sonar e cariche di profondità). */
  subDetectKm?: number;
  /** Solo portaerei: quanti aerei può ospitare (squadriglie con base sulla nave). */
  aircraftCapacity?: number;
}

export const SHIP_TYPES: Record<ShipTypeId, ShipType> = {
  submarine: {
    id: "submarine",
    name: "Sottomarino",
    building: "shipyard",
    description: "Invisibile in immersione: lo scoprono solo i cacciatorpediniere vicini e gli aerei, oppure quando attacca. Affonda le navi e i convogli e taglia le importazioni via mare. Come i Type VII e i classe Ščuka.",
    speedKmh: 25,
    sightKm: 15,
    hp: 25,
    vsShip: { attack: 6, defense: 1 },
    vsSub: { attack: 1, defense: 1 },
    antiAir: 0.2,
    rangeKm: 0,
    cost: { goods: 800, metal: 1800, oil: 600, money: 2500, manpower: 600 },
    productionHours: 30,
    upkeepPerDay: { metal: 60, oil: 80, money: 120 },
  },
  destroyer: {
    id: "destroyer",
    name: "Cacciatorpediniere",
    building: "shipyard",
    description: "Nave veloce di scorta: scopre i sottomarini entro 15 km, dà loro la caccia e protegge i convogli. Come i classe Tribal e i Z1.",
    speedKmh: 40,
    sightKm: 25,
    hp: 35,
    vsShip: { attack: 3, defense: 3 },
    vsSub: { attack: 6, defense: 5 },
    subDetectKm: 15,
    antiAir: 2,
    shore: { soft: 1, light: 0.5, heavy: 0.25 },
    rangeKm: 12,
    cost: { goods: 800, metal: 2000, oil: 800, money: 2800, manpower: 800 },
    productionHours: 30,
    upkeepPerDay: { metal: 70, oil: 120, money: 140 },
  },
  cruiser: {
    id: "cruiser",
    name: "Incrociatore",
    building: "shipyard",
    description: "Cannoni medi e buona velocità: caccia le navi leggere, scorta le flotte e appoggia gli sbarchi. Come i classe Town e il Kirov.",
    speedKmh: 35,
    sightKm: 30,
    hp: 60,
    vsShip: { attack: 6, defense: 6 },
    vsSub: { attack: 1, defense: 2 },
    antiAir: 3,
    shore: { soft: 3, light: 2, heavy: 1 },
    rangeKm: 20,
    cost: { goods: 1500, metal: 4000, oil: 1500, money: 5000, manpower: 1500 },
    productionHours: 60,
    upkeepPerDay: { metal: 120, oil: 220, money: 250 },
  },
  battleship: {
    id: "battleship",
    name: "Nave da battaglia",
    building: "shipyard",
    description: "Grandi cannoni contro le navi nemiche e le difese costiere; lenta e costosissima. Come la King George V e la Bismarck.",
    speedKmh: 30,
    sightKm: 30,
    hp: 120,
    vsShip: { attack: 12, defense: 12 },
    vsSub: { attack: 0, defense: 1 },
    antiAir: 3,
    shore: { soft: 6, light: 4, heavy: 3 },
    rangeKm: 30,
    cost: { goods: 3000, metal: 9000, oil: 3000, money: 10000, manpower: 3000 },
    productionHours: 120,
    upkeepPerDay: { metal: 250, oil: 450, money: 500 },
  },
  carrier: {
    id: "carrier",
    name: "Portaerei",
    building: "shipyard",
    description: "Porta caccia e bombardieri in mare aperto: i suoi aerei vedono e colpiscono lontano. Come l'Ark Royal.",
    speedKmh: 32,
    sightKm: 40,
    hp: 80,
    vsShip: { attack: 0.5, defense: 2 },
    vsSub: { attack: 0, defense: 1 },
    antiAir: 2,
    rangeKm: 0,
    cost: { goods: 3000, metal: 7000, oil: 2500, money: 9000, manpower: 2500 },
    productionHours: 120,
    upkeepPerDay: { metal: 200, oil: 400, money: 450 },
    aircraftCapacity: 8,
  },
};

export const SHIP_TYPE_IDS = Object.keys(SHIP_TYPES) as ShipTypeId[];

export function isShipType(id: string): id is ShipTypeId {
  return id in SHIP_TYPES;
}

export const NAVAL = {
  /** Riparazione per tick (frazione dei punti vita massimi) di una flotta ormeggiata in un porto proprio e non sotto il fuoco. */
  repairPerTick: 0.03,
  /** Una nuova notizia di battaglia navale tra le stesse due nazioni solo se in mare non si combatteva da più di questi minuti. */
  battleNewsGapMinutes: 120,
  /** Un sottomarino che attacca si scopre: resta visibile al nemico per questi minuti. */
  subRevealMinutes: 60,
  /** Trasporti delle truppe: velocità, imbarco e sbarco (più rapidi dove c'è un porto o un cantiere navale). */
  transportKmh: 25,
  boardMinutes: 180,
  boardPortMinutes: 120,
  landMinutes: 240,
  landPortMinutes: 120,
  /** Lo sbarco si cerca entro questo numero di celle (0,1°) dalla meta. */
  landingSearchCells: 40,
} as const;
