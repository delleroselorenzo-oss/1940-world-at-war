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
  /**
   * Per ogni tratto: velocità del treno in km/h, 0 se non è in treno.
   * Salita e discesa sono soste in treno (tratti di lunghezza zero).
   */
  rail: number[];
}

/** Percorso senza orari (una marcia sospesa o da ricalcolare). */
export interface RouteLeg {
  points: LngLat[];
  onRoad: boolean[];
  rail: number[];
}

export interface Army {
  id: ArmyId;
  owner: NationId;
  units: Unit[];
  /** Dove si trova l'armata ferma, o da dove è partita la marcia in corso. */
  position: LngLat;
  move: ArmyMove | null;
  /**
   * L'armata è andata all'assalto: è stata fermata dal contatto col nemico mentre marciava.
   * Combatte con i valori offensivi finché ha nemici a portata (o finché marcia).
   */
  attacking: boolean;
  /**
   * Resto della marcia interrotta dal contatto col nemico: finito il combattimento
   * l'armata riprende da sola. Un nuovo ordine lo cancella.
   */
  halted: RouteLeg | null;
  /**
   * Ordine di marcia: true = "Attacca" (al contatto va all'assalto),
   * false = "Muovi" (al contatto si ferma e si difende).
   */
  assault: boolean;
  /** Il giocatore ha scelto di usare il treno per questa marcia (dove conviene). */
  useRail: boolean;
  /** Partenza ritardata ("Ritarda"): l'armata resta ferma e parte all'ora indicata verso `target`. */
  departure: { at: number; target: LngLat } | null;
  /** Lavoro in corso (l'armata è ferma): un nuovo ordine di marcia lo interrompe. */
  task: ArmyTask | null;
}

/** Lavori sul campo. */
export type WorkType = "demolish" | "repair" | "pontoon" | "hospital";

/** Su cosa si lavora: un ponte, un ponte di barche, un passaggio sul fiume (tra due celle) o il punto dov'è l'armata. */
export type WorkTarget =
  | { kind: "bridge"; id: string; at: LngLat }
  | { kind: "pontoon"; id: string; at: LngLat }
  | { kind: "river"; cells: [number, number]; at: LngLat; river: string | null }
  | { kind: "here"; at: LngLat };

export interface ArmyTask {
  work: WorkType;
  target: WorkTarget;
  startedAt: number;
  finishesAt: number;
}

/** Ponte di barche: riapre il passaggio sul fiume tra due celle. Lo può usare chiunque. */
export interface Pontoon {
  id: string;
  /** Chi l'ha costruito. */
  owner: NationId;
  cells: [number, number];
  at: LngLat;
  river: string | null;
}

/** Ospedale da campo: le armate della stessa nazione ferme nel raggio guariscono più in fretta. */
export interface FieldHospital {
  id: string;
  owner: NationId;
  at: LngLat;
}

/** Rapporti tra due nazioni. Senza nessuna voce: pace, nessun accordo. */
export interface Relation {
  war: boolean;
  /** Diritto di passaggio reciproco. */
  passage: boolean;
  /** Visione condivisa della mappa. */
  sharedVision: boolean;
}

/** Fatti da raccontare al giocatore (registro della partita). */
export type GameEvent =
  | { time: number; type: "war"; by: NationId; against: NationId }
  | { time: number; type: "battle"; at: LngLat; province: ProvinceId | null; nations: [NationId, NationId] }
  | { time: number; type: "conquest"; province: ProvinceId; from: NationId; to: NationId }
  | { time: number; type: "armyDestroyed"; owner: NationId; by: NationId; at: LngLat; province: ProvinceId | null }
  | {
      time: number;
      type: "works";
      what: "bridgeDestroyed" | "bridgeRepaired" | "pontoonBuilt" | "pontoonDestroyed" | "hospitalBuilt" | "hospitalLost";
      /** Chi ha fatto il lavoro (per "hospitalLost": chi l'ha perso). */
      by: NationId;
      at: LngLat;
      province: ProvinceId | null;
      river: string | null;
    };

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
  /** Rapporti tra nazioni, per coppia (chiave di `pairKey`). */
  relations: Record<string, Relation>;
  /** Ponti distrutti (id di `nav.bridges`), in ordine. */
  destroyedBridges: string[];
  pontoons: Record<string, Pontoon>;
  hospitals: Record<string, FieldHospital>;
  /** Registro degli eventi, dal più vecchio al più recente. */
  events: GameEvent[];
  /** Code di arruolamento per provincia. */
  production: Record<ProvinceId, ProductionItem[]>;
  /** Contatore per gli identificativi di armate e unità (deterministici). */
  nextId: number;
}
