import type { UnitTypeId } from "../data/units.js";
import type { LngLat, NationId, ProvinceId, ResourceId } from "../map/types.js";

export type ResourceAmounts = Record<ResourceId, number>;

export interface ProvinceState {
  owner: NationId;
  /** Morale 0–100: moltiplica la produzione. Per ora resta al valore iniziale. */
  morale: number;
}

export interface NationState {
  stock: ResourceAmounts;
}

export type ArmyId = string;

export interface Unit {
  id: string;
  type: UnitTypeId;
  hp: number;
}

/**
 * Marcia in corso: l'armata passa per `points[i]` al minuto `times[i]`.
 * `points[0]` è il punto di partenza, l'ultimo è la destinazione; tra due punti
 * consecutivi si muove in linea retta a velocità costante.
 */
export interface ArmyMove {
  points: LngLat[];
  times: number[];
  /** Per ogni tratto: true se su strada o ferrovia (serve al disegno). */
  onRoad: boolean[];
}

export interface Army {
  id: ArmyId;
  owner: NationId;
  units: Unit[];
  /** Dove si trova l'armata ferma, o da dove è partita la marcia in corso. */
  position: LngLat;
  move: ArmyMove | null;
}

/** Unità in arruolamento in una città; la prima della coda è quella in lavorazione. */
export interface ProductionItem {
  unitType: UnitTypeId;
  durationMinutes: number;
  /** Solo per la prima della coda: quando sarà pronta. */
  finishesAt: number | null;
}

/**
 * Orologio della partita. Il tempo di gioco si misura in minuti dall'inizio:
 *   minuti = gameAnchor + (oraReale − realAnchor) × speed
 * Cambiando velocità si sposta l'ancora, così il tempo già trascorso non cambia.
 */
export interface GameClock {
  realAnchorMs: number;
  gameAnchorMinutes: number;
  speed: number;
}

export interface GameState {
  mapId: string;
  clock: GameClock;
  /** Minuti di gioco già elaborati. */
  time: number;
  playerNation: NationId;
  provinces: Record<ProvinceId, ProvinceState>;
  nations: Record<NationId, NationState>;
  armies: Record<ArmyId, Army>;
  /** Code di arruolamento per provincia. */
  production: Record<ProvinceId, ProductionItem[]>;
  /** Contatore per gli identificativi di armate e unità (deterministici). */
  nextId: number;
}
