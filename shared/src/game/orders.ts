import { BUILDING_TYPES, type BuildingId } from "../data/buildings.js";
import { UNIT_TYPES, type UnitTypeId } from "../data/units.js";
import type { LngLat, MapData, NationId, ProvinceId } from "../map/types.js";
import { provinceIdAt } from "../nav/grid.js";
import type { NavData } from "../nav/types.js";
import { atWar, mayEnter, startWar } from "./diplomacy.js";
import { buildOptions, recruitMinutes, recruitMissing } from "./buildings.js";
import { canAfford, pay, refund } from "./economy.js";
import { mapIndex } from "./mapIndex.js";
import { armyPosition, moverOf, scheduleRoute } from "./movement.js";
import { planRoute } from "./routing.js";
import type { Army, ArmyId, GameState, WorkType } from "./state.js";
import { availableWorks } from "./works.js";

// Ordini dei giocatori. Ogni ordine viene validato qui: oggi lo usa il browser,
// domani il server, che non dovrà mai fidarsi del client.

export type Order =
  | { type: "recruit"; province: ProvinceId; unitType: UnitTypeId }
  /**
   * Marcia verso un punto. `attack`: al contatto va all'assalto ("Attacca") invece di difendersi ("Muovi").
   * `delayMinutes`: parte dopo questo tempo ("Ritarda"); intanto resta ferma dov'è.
   * `rail`: può prendere il treno dove fa guadagnare tempo.
   */
  | { type: "move"; army: ArmyId; target: LngLat; attack?: boolean; delayMinutes?: number; rail?: boolean }
  | { type: "stop"; army: ArmyId }
  | { type: "declareWar"; against: NationId }
  | { type: "work"; army: ArmyId; work: WorkType }
  | { type: "cancelWork"; army: ArmyId }
  /** Costruisce il prossimo livello di un edificio nella provincia (non quelli del genio). */
  | { type: "build"; province: ProvinceId; building: BuildingId }
  /** Annulla la costruzione in corso: le risorse tornano indietro. */
  | { type: "cancelBuild"; province: ProvinceId };

export type OrderResult = { ok: true; state: GameState } | { ok: false; error: string };

export interface World {
  map: MapData;
  nav: NavData;
}

/**
 * Applica un ordine della nazione `nation` al minuto `state.time`
 * (chi chiama deve prima portare la partita all'ora attuale con `advance`).
 */
export function applyOrder(state: GameState, world: World, nation: NationId, order: Order): OrderResult {
  switch (order.type) {
    case "recruit":
      return recruit(state, world.map, nation, order.province, order.unitType);
    case "move":
      return move(state, world.nav, nation, order.army, order.target, order.attack ?? false, order.delayMinutes ?? 0, order.rail ?? false);
    case "stop":
      return stop(state, nation, order.army);
    case "declareWar":
      return declareWar(state, world.map, nation, order.against);
    case "work":
      return work(state, world, nation, order.army, order.work);
    case "cancelWork":
      return cancelWork(state, nation, order.army);
    case "build":
      return build(state, world.map, nation, order.province, order.building);
    case "cancelBuild":
      return cancelBuild(state, nation, order.province);
  }
}

function recruit(state: GameState, map: MapData, nation: NationId, provinceId: ProvinceId, unitType: UnitTypeId): OrderResult {
  const province = mapIndex(map).provinces.get(provinceId);
  const type = UNIT_TYPES[unitType];
  if (!province || !type) return fail("Provincia o unità sconosciuta.");
  if (state.provinces[provinceId]?.owner !== nation) return fail("Puoi arruolare solo nelle tue province.");
  if (province.type !== "urban") return fail("Si arruola solo nelle città.");
  const missing = recruitMissing(state, provinceId, unitType);
  if (missing) return fail(missing);
  const stock = state.nations[nation]!.stock;
  if (!canAfford(stock, type.cost)) return fail("Risorse insufficienti.");

  const nextStock = { ...stock };
  pay(nextStock, type.cost);
  const queue = state.production[provinceId] ?? [];
  const durationMinutes = recruitMinutes(state, provinceId, unitType);
  const item = { unitType, durationMinutes, finishesAt: queue.length === 0 ? state.time + durationMinutes : null };
  return ok({
    ...state,
    nations: { ...state.nations, [nation]: { ...state.nations[nation]!, stock: nextStock } },
    production: { ...state.production, [provinceId]: [...queue, item] },
  });
}

/**
 * Se un'armata di `nation` marcia verso `target`, con chi entra in guerra?
 * Restituisce la nazione padrona del punto se oggi non c'è guerra né accordo, altrimenti null.
 * Serve all'interfaccia per chiedere conferma prima di dare l'ordine.
 */
export function wouldStartWar(state: GameState, nav: NavData, nation: NationId, target: LngLat): NationId | null {
  const id = provinceIdAt(nav, target);
  const owner = id ? state.provinces[id]?.owner : undefined;
  return owner && !mayEnter(state, nation, owner) ? owner : null;
}

/** Ritardo massimo di una partenza. */
const MAX_DELAY_MINUTES = 48 * 60;

function move(
  state: GameState,
  nav: NavData,
  nation: NationId,
  armyId: ArmyId,
  target: LngLat,
  attack: boolean,
  delayMinutes: number,
  useRail: boolean,
): OrderResult {
  const army = state.armies[armyId];
  if (!army || army.owner !== nation) return fail("Armata non tua.");
  if (!(delayMinutes >= 0 && delayMinutes <= MAX_DELAY_MINUTES)) return fail("Ritardo non valido.");

  // Un'armata in marcia (anche se sta combattendo: è una ritirata) riparte dal punto in cui si trova adesso.
  const from = armyPosition(army, state.time);
  const mover = moverOf(army, useRail);
  const route = planRoute(state, nav, nation, from, target, mover);
  if (!route) return fail("Punto non raggiungibile via terra (senza attraversare paesi terzi).");
  if (route.km < 0.5) return fail("L'armata è già lì.");
  const base = { ...army, position: from, halted: null, task: null, assault: attack, useRail };
  const refunded = refundTask(state, army);
  // Con il ritardo si ferma subito; il percorso si ricalcola alla partenza (nel frattempo la mappa può cambiare).
  const next =
    delayMinutes > 0
      ? { ...base, move: null, departure: { at: state.time + delayMinutes, target } }
      : { ...base, move: scheduleRoute(route, mover, state.time), departure: null };
  return ok({ ...refunded, armies: { ...state.armies, [armyId]: next } });
}

/** Lo stato con le risorse del lavoro in corso dell'armata restituite (se ne aveva pagate). */
function refundTask(state: GameState, army: Army): GameState {
  const cost = army.task?.cost;
  if (!cost) return state;
  const stock = { ...state.nations[army.owner]!.stock };
  refund(stock, cost);
  return { ...state, nations: { ...state.nations, [army.owner]: { ...state.nations[army.owner]!, stock } } };
}

function declareWar(state: GameState, map: MapData, nation: NationId, against: NationId): OrderResult {
  if (against === nation || !map.nations.some((n) => n.id === against)) return fail("Nazione non valida.");
  if (atWar(state, nation, against)) return fail("Siete già in guerra.");
  const next = { ...state, relations: { ...state.relations }, events: [...state.events] };
  startWar(next, nation, against, state.time);
  return ok(next);
}

function stop(state: GameState, nation: NationId, armyId: ArmyId): OrderResult {
  const army = state.armies[armyId];
  if (!army || army.owner !== nation) return fail("Armata non tua.");
  if (!army.move && !army.halted && !army.task && !army.departure) return fail("L'armata è già ferma.");
  // Si ferma dove si trova in questo momento (e non riprenderà la marcia dopo un combattimento).
  return ok({
    ...refundTask(state, army),
    armies: { ...state.armies, [armyId]: { ...army, position: armyPosition(army, state.time), move: null, halted: null, task: null, departure: null } },
  });
}

/** Avvia un lavoro sul bersaglio più vicino (ponte, fiume, il punto dov'è l'armata o la sua provincia). */
function work(state: GameState, world: World, nation: NationId, armyId: ArmyId, type: WorkType): OrderResult {
  const army = state.armies[armyId];
  if (!army || army.owner !== nation) return fail("Armata non tua.");
  const option = availableWorks(state, world, army, state.time).find((o) => o.work === type);
  if (!option) return fail("Lavoro sconosciuto.");
  if (option.missing || !option.target) return fail(option.missing ?? "Niente su cui lavorare qui.");
  const task = { work: type, target: option.target, startedAt: state.time, finishesAt: state.time + option.minutes, ...(option.cost ? { cost: option.cost } : {}) };
  let nations = state.nations;
  if (option.cost) {
    const stock = { ...state.nations[nation]!.stock };
    pay(stock, option.cost);
    nations = { ...nations, [nation]: { ...nations[nation]!, stock } };
  }
  return ok({ ...state, nations, armies: { ...state.armies, [armyId]: { ...army, task } } });
}

function cancelWork(state: GameState, nation: NationId, armyId: ArmyId): OrderResult {
  const army = state.armies[armyId];
  if (!army || army.owner !== nation) return fail("Armata non tua.");
  if (!army.task) return fail("L'armata non sta lavorando.");
  return ok({ ...refundTask(state, army), armies: { ...state.armies, [armyId]: { ...army, task: null } } });
}

function build(state: GameState, map: MapData, nation: NationId, provinceId: ProvinceId, building: BuildingId): OrderResult {
  const province = mapIndex(map).provinces.get(provinceId);
  if (!province || !BUILDING_TYPES[building]) return fail("Provincia o edificio sconosciuto.");
  if (BUILDING_TYPES[building].byEngineers) return fail("Questo edificio lo costruisce il genio sul posto.");
  const option = buildOptions(state, province, nation).find((o) => o.building === building);
  if (!option) return fail("Qui non si può costruire.");
  if (option.missing) return fail(option.missing);
  const stock = { ...state.nations[nation]!.stock };
  pay(stock, option.cost);
  const construction = { building, level: option.level, startedAt: state.time, finishesAt: state.time + option.minutes, cost: option.cost };
  return ok({
    ...state,
    nations: { ...state.nations, [nation]: { ...state.nations[nation]!, stock } },
    construction: { ...state.construction, [provinceId]: construction },
  });
}

function cancelBuild(state: GameState, nation: NationId, provinceId: ProvinceId): OrderResult {
  const construction = state.construction[provinceId];
  if (state.provinces[provinceId]?.owner !== nation) return fail("Non è una tua provincia.");
  if (!construction) return fail("Nessuna costruzione in corso.");
  const stock = { ...state.nations[nation]!.stock };
  refund(stock, construction.cost);
  const { [provinceId]: _, ...rest } = state.construction;
  return ok({ ...state, nations: { ...state.nations, [nation]: { ...state.nations[nation]!, stock } }, construction: rest });
}

const ok = (state: GameState): OrderResult => ({ ok: true, state });
const fail = (error: string): OrderResult => ({ ok: false, error });
