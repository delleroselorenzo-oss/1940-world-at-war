import type { AircraftTypeId, ProducibleId } from "../data/air.js";
import type { BuildingId } from "../data/buildings.js";
import type { ShipTypeId } from "../data/naval.js";
import type { UnitTypeId } from "../data/units.js";
import type { LngLat, MainResourceId, NationId, ProvinceId, ResourceId } from "../map/types.js";

export type ResourceAmounts = Record<ResourceId, number>;

export interface ProvinceState {
  owner: NationId;
  /** Morale 0–100: moltiplica la produzione. */
  morale: number;
  /** Pozzi di petrolio sabotati: non producono finché il genio non li ripara. */
  wellsSabotaged?: boolean;
}

export interface NationState {
  stock: ResourceAmounts;
  /** Contratti con il mercato estero: quanto comprare al giorno, per risorsa (si paga a ogni tick). */
  imports?: Partial<Record<ResourceId, number>>;
  /** Nazioni sotto embargo da parte di questa: niente scambi in borsa e niente importazioni attraverso di loro. */
  embargo?: NationId[];
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
  /** Per ogni tratto: moltiplicatore della velocità dovuto al terreno (assente nei salvataggi vecchi = 1). */
  terrain?: number[];
}

/** Percorso senza orari (una marcia sospesa o da ricalcolare). */
export interface RouteLeg {
  points: LngLat[];
  onRoad: boolean[];
  rail: number[];
  /** Per ogni tratto: moltiplicatore della velocità dovuto al terreno (assente nei salvataggi vecchi = 1). */
  terrain?: number[];
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
  /** Minuto in cui si è fermata l'ultima volta (assente = ferma da sempre): conta per la messa in batteria dell'artiglieria. */
  settledAt?: number;
}

export type SquadronId = string;

/** Aereo di una squadriglia. */
export interface Aircraft {
  id: string;
  type: AircraftTypeId;
  hp: number;
}

/** Volo in corso: in linea retta da `from` a `to`, a velocità costante. */
export interface Flight {
  from: LngLat;
  to: LngLat;
  /** Base d'arrivo; null nel tratto verso il bersaglio di un attacco. */
  base: ProvinceId | null;
  departAt: number;
  arriveAt: number;
  /** Portata che resterà all'arrivo (serve se la base d'arrivo non c'è più e bisogna ripiegare altrove). */
  fuelKm: number;
}

/**
 * Squadriglia: aerei che volano insieme (anche di tipi diversi: va alla velocità del più lento e ha la portata più corta).
 * A terra sta in una base: una provincia con l'aeroporto o una città con la fabbrica aeronautica, propria o di un alleato.
 */
export interface Squadron {
  id: SquadronId;
  owner: NationId;
  aircraft: Aircraft[];
  /** Base dove si trova a terra, o da cui è decollata. */
  base: ProvinceId;
  flight: Flight | null;
  /** A terra: pronta a decollare da questo minuto (fine del rifornimento). */
  readyAt: number;
  /** Attacco ordinato e non ancora concluso. */
  mission: StrikeMission | null;
}

/** Attacco a un'armata nemica, ordinato dal giocatore. */
export interface StrikeMission {
  target: ArmyId;
  /** Punto da cui si misura il raggio d'azione: la base di decollo per l'attacco (o dove era la squadriglia, se l'ordine è arrivato in volo). */
  anchor: LngLat;
  /** Il bersaglio si insegue finché resta entro questa distanza da `anchor`. */
  radiusKm: number;
  /** Basi dove fare scalo (con rifornimento) prima di decollare per l'attacco, in ordine. */
  via: ProvinceId[];
}

export type FleetId = string;

export interface Ship {
  id: string;
  type: ShipTypeId;
  hp: number;
}

/** Navigazione in corso: la flotta passa per `points[i]` al minuto `times[i]`, in linea retta tra due punti. */
export interface Voyage {
  points: LngLat[];
  times: number[];
}

/** Flotta: navi che navigano insieme, alla velocità della più lenta. */
export interface Fleet {
  id: FleetId;
  owner: NationId;
  ships: Ship[];
  /** Dove si trova ferma, o da dove è partita la navigazione in corso. */
  position: LngLat;
  voyage: Voyage | null;
  /** Provincia del porto dove è ormeggiata (all'approdo di una provincia propria o alleata); null in mare o in viaggio. */
  port: ProvinceId | null;
}

/** Lavori sul campo. */
export type WorkType =
  | "demolish"
  | "repair"
  | "pontoon"
  | "hospital"
  | "fortify"
  | "airfield"
  | "port"
  | "sabotageWells"
  | "repairWells";

/** Su cosa si lavora: un ponte, un ponte di barche, un passaggio sul fiume (tra due celle) o il punto dov'è l'armata. */
export type WorkTarget =
  | { kind: "bridge"; id: string; at: LngLat }
  | { kind: "pontoon"; id: string; at: LngLat }
  | { kind: "river"; cells: [number, number]; at: LngLat; river: string | null }
  | { kind: "here"; at: LngLat }
  | { kind: "province"; id: ProvinceId; at: LngLat };

export interface ArmyTask {
  work: WorkType;
  target: WorkTarget;
  startedAt: number;
  finishesAt: number;
  /** Risorse pagate all'inizio (restituite se il lavoro viene interrotto). */
  cost?: Partial<Record<ResourceId, number>>;
}

/** Livelli degli edifici di una provincia (assente = non c'è). */
export type ProvinceBuildings = Partial<Record<BuildingId, number>>;

/** Edificio in costruzione in una provincia (una costruzione alla volta). */
export interface Construction {
  building: BuildingId;
  /** Livello che avrà a fine lavori. */
  level: number;
  startedAt: number;
  finishesAt: number;
  /** Risorse pagate (restituite se si annulla). */
  cost: Partial<Record<ResourceId, number>>;
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

/** Accordi tra due nazioni in pace, che una delle due può revocare quando vuole. */
export type AgreementKind = "passage" | "sharedVision" | "alliance";

/** Cosa si può proporre a un'altra nazione (la guerra si dichiara, l'embargo si decide da soli). */
export type ProposalKind = "peace" | "truce" | AgreementKind;

/** Rapporti tra due nazioni. Senza nessuna voce: pace, nessun accordo. */
export interface Relation {
  war: boolean;
  /** Minuto d'inizio della guerra in corso. */
  warSince?: number;
  /** Tregua in corso: niente combattimenti fino a questo minuto, poi la guerra riprende. */
  truceUntil?: number;
  /**
   * Dopo una pace o una tregua: fino a questo minuto le armate rimaste nel territorio dell'altro
   * possono muoversi (per ritirarsi) senza far ripartire la guerra.
   */
  withdrawUntil?: number;
  /** Diritto di passaggio reciproco. */
  passage: boolean;
  /** Visione condivisa della mappa. */
  sharedVision: boolean;
  /** Alleanza: passaggio e visione condivisa insieme. */
  alliance?: boolean;
  /** Ultimo tick con un combattimento navale tra le due nazioni (per dare la notizia solo all'inizio di una battaglia). */
  navalCombatAt?: number;
}

/** Proposta diplomatica di `from` a `to`. */
export interface Proposal {
  id: string;
  from: NationId;
  to: NationId;
  kind: ProposalKind;
  time: number;
  expiresAt: number;
  status: "pending" | "accepted" | "rejected" | "expired" | "withdrawn";
  /** Quando è stata chiusa. */
  closedAt?: number;
}

/** Messaggio nella chat tra due nazioni. */
export interface ChatMessage {
  time: number;
  from: NationId;
  text: string;
}

/** Ordine aperto nella borsa degli scambi: le risorse (o il denaro) sono già accantonate. */
export interface MarketOrder {
  id: string;
  nation: NationId;
  side: "buy" | "sell";
  resource: MainResourceId;
  /** Quantità ancora da scambiare. */
  amount: number;
  /** Denaro per unità. */
  price: number;
  time: number;
}

/** Scambio concluso in borsa. */
export interface MarketTrade {
  time: number;
  resource: MainResourceId;
  amount: number;
  price: number;
  seller: NationId;
  buyer: NationId;
}

/** Fatti da raccontare al giocatore (registro della partita). */
export type GameEvent =
  | { time: number; type: "war"; by: NationId; against: NationId }
  /** Pace o tregua firmata, accordo stretto. */
  | { time: number; type: "agreement"; kind: ProposalKind; nations: [NationId, NationId] }
  /** Accordo revocato da `by`. */
  | { time: number; type: "revoked"; kind: AgreementKind; by: NationId; against: NationId }
  /** Fine della tregua: la guerra riprende. */
  | { time: number; type: "truceEnded"; nations: [NationId, NationId] }
  | { time: number; type: "embargo"; by: NationId; against: NationId; on: boolean }
  | { time: number; type: "battle"; at: LngLat; province: ProvinceId | null; nations: [NationId, NationId] }
  /** Battaglia navale tra flotte (o tra una flotta e le batterie della costa): `zone` è il nome della zona di mare. */
  | { time: number; type: "navalBattle"; at: LngLat; zone: string | null; nations: [NationId, NationId] }
  | { time: number; type: "fleetDestroyed"; fleet: FleetId; owner: NationId; by: NationId; at: LngLat; zone: string | null }
  | { time: number; type: "conquest"; province: ProvinceId; from: NationId; to: NationId }
  /** La provincia si è ribellata ed è tornata alla nazione d'origine. */
  | { time: number; type: "revolt"; province: ProvinceId; from: NationId; to: NationId }
  /** Edificio completato (dalla provincia o dal genio). */
  | { time: number; type: "built"; by: NationId; province: ProvinceId; building: BuildingId; level: number }
  | { time: number; type: "armyDestroyed"; owner: NationId; by: NationId; at: LngLat; province: ProvinceId | null }
  /** Attacco aereo: aerei abbattuti dalla contraerea e unità perse dal bersaglio. */
  | {
      time: number;
      type: "airStrike";
      by: NationId;
      against: NationId;
      at: LngLat;
      province: ProvinceId | null;
      aircraftLost: number;
      unitsLost: number;
      /** La squadriglia è stata abbattuta tutta / l'armata è stata distrutta. */
      squadronDestroyed: boolean;
      armyDestroyed: boolean;
      /** Il bersaglio era una flotta: `unitsLost` sono navi affondate, `armyDestroyed` la flotta distrutta. */
      naval?: boolean;
    }
  /** Squadriglia senza una base raggiungibile dove atterrare. */
  | { time: number; type: "squadronLost"; owner: NationId; at: LngLat; province: ProvinceId | null }
  | {
      time: number;
      type: "works";
      what:
        | "bridgeDestroyed"
        | "bridgeRepaired"
        | "pontoonBuilt"
        | "pontoonDestroyed"
        | "hospitalBuilt"
        | "hospitalLost"
        | "wellsSabotaged"
        | "wellsRepaired";
      /** Chi ha fatto il lavoro (per "hospitalLost": chi l'ha perso). */
      by: NationId;
      at: LngLat;
      province: ProvinceId | null;
      river: string | null;
    };

/** Unità in arruolamento in una città; la prima della coda è quella in lavorazione. */
export interface ProductionItem {
  /** Unità di terra, aereo (esce in una squadriglia) o nave (esce in una flotta nel porto della città). */
  unitType: ProducibleId;
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
  squadrons: Record<SquadronId, Squadron>;
  fleets: Record<FleetId, Fleet>;
  /** Rapporti tra nazioni, per coppia (chiave di `pairKey`). */
  relations: Record<string, Relation>;
  /** Proposte diplomatiche, dalla più vecchia (quelle chiuse restano come storico). */
  proposals: Proposal[];
  /** Chat tra nazioni, per coppia (chiave di `pairKey`). */
  chats: Record<string, ChatMessage[]>;
  /** Borsa degli scambi tra nazioni. */
  market: { orders: MarketOrder[]; trades: MarketTrade[] };
  /** Ponti distrutti (id di `nav.bridges`), in ordine. */
  destroyedBridges: string[];
  pontoons: Record<string, Pontoon>;
  hospitals: Record<string, FieldHospital>;
  /** Registro degli eventi, dal più vecchio al più recente. */
  events: GameEvent[];
  /** Code di arruolamento per provincia. */
  production: Record<ProvinceId, ProductionItem[]>;
  /** Edifici per provincia. */
  buildings: Record<ProvinceId, ProvinceBuildings>;
  /** Costruzioni in corso per provincia. */
  construction: Record<ProvinceId, Construction>;
  /** Seme per gli eventi casuali (rivolte): stessa partita, stessi esiti. */
  seed: number;
  /** Contatore per gli identificativi di armate e unità (deterministici). */
  nextId: number;
}
