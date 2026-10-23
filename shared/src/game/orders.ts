import { UNIT_TYPES, type UnitTypeId } from "../data/units.js";
import type { LngLat, MapData, NationId, ProvinceId } from "../map/types.js";
import { findRoute } from "../nav/route.js";
import type { NavData } from "../nav/types.js";
import { canAfford, pay } from "./economy.js";
import { mapIndex } from "./mapIndex.js";
import { armyPosition, armySpeedKmh, scheduleRoute } from "./movement.js";
import type { ArmyId, GameState } from "./state.js";

// Ordini dei giocatori. Ogni ordine viene validato qui: oggi lo usa il browser,
// domani il server, che non dovrà mai fidarsi del client.

export type Order =
  | { type: "recruit"; province: ProvinceId; unitType: UnitTypeId }
  | { type: "move"; army: ArmyId; target: LngLat }
  | { type: "stop"; army: ArmyId };

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
      return move(state, world.nav, nation, order.army, order.target);
    case "stop":
      return stop(state, nation, order.army);
  }
}

function recruit(state: GameState, map: MapData, nation: NationId, provinceId: ProvinceId, unitType: UnitTypeId): OrderResult {
  const province = mapIndex(map).provinces.get(provinceId);
  const type = UNIT_TYPES[unitType];
  if (!province || !type) return fail("Provincia o unità sconosciuta.");
  if (state.provinces[provinceId]?.owner !== nation) return fail("Puoi arruolare solo nelle tue province.");
  if (province.type !== "urban") return fail("Si arruola solo nelle città.");
  const stock = state.nations[nation]!.stock;
  if (!canAfford(stock, type.cost)) return fail("Risorse insufficienti.");

  const nextStock = { ...stock };
  pay(nextStock, type.cost);
  const queue = state.production[provinceId] ?? [];
  const durationMinutes = type.productionHours * 60;
  const item = { unitType, durationMinutes, finishesAt: queue.length === 0 ? state.time + durationMinutes : null };
  return ok({
    ...state,
    nations: { ...state.nations, [nation]: { ...state.nations[nation]!, stock: nextStock } },
    production: { ...state.production, [provinceId]: [...queue, item] },
  });
}

/** Celle in cui la nazione può marciare: per ora (finché non c'è il combattimento) solo le sue province. */
export function ownTerritory(state: GameState, nav: NavData, nation: NationId): (cell: number) => boolean {
  const allowed = nav.provinceIds.map((id) => state.provinces[id]?.owner === nation);
  return (cell) => allowed[nav.grid.province[cell]! - 1] === true;
}

function move(state: GameState, nav: NavData, nation: NationId, armyId: ArmyId, target: LngLat): OrderResult {
  const army = state.armies[armyId];
  if (!army || army.owner !== nation) return fail("Armata non tua.");

  // Un'armata in marcia riparte dal punto in cui si trova adesso.
  const from = armyPosition(army, state.time);
  const route = findRoute(nav, from, target, { canEnter: ownTerritory(state, nav, nation) });
  if (!route) return fail("Punto non raggiungibile: per ora le armate si muovono solo nel tuo territorio e via terra.");
  if (route.km < 0.5) return fail("L'armata è già lì.");
  const nextMove = scheduleRoute(route, armySpeedKmh(army), state.time);
  return ok({ ...state, armies: { ...state.armies, [armyId]: { ...army, position: from, move: nextMove } } });
}

function stop(state: GameState, nation: NationId, armyId: ArmyId): OrderResult {
  const army = state.armies[armyId];
  if (!army || army.owner !== nation) return fail("Armata non tua.");
  if (!army.move) return fail("L'armata è già ferma.");
  // Si ferma dove si trova in questo momento.
  return ok({ ...state, armies: { ...state.armies, [armyId]: { ...army, position: armyPosition(army, state.time), move: null } } });
}

const ok = (state: GameState): OrderResult => ({ ok: true, state });
const fail = (error: string): OrderResult => ({ ok: false, error });
