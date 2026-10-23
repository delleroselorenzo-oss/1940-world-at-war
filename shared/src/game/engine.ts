import { ECONOMY, RESOURCE_IDS, type EconomyConfig } from "../data/economy.js";
import { MOVEMENT } from "../data/movement.js";
import { STARTING_ARMIES, UNIT_TYPES, type UnitTypeId } from "../data/units.js";
import type { LngLat, MapData, NationId } from "../map/types.js";
import { flatKm } from "../nav/grid.js";
import { nationProductionPerDay, netPerDayByNation } from "./economy.js";
import { mapIndex } from "./mapIndex.js";
import type { Army, GameState, ResourceAmounts } from "./state.js";

// Motore della partita: funzioni pure, nessun accesso a orologio di sistema o rete.
// Chi le usa (oggi il browser, domani il server) passa il tempo dall'esterno.

export interface NewGameOptions {
  playerNation: NationId;
  /** Ora reale di inizio partita (ms). */
  realNowMs: number;
  speed?: number;
}

export function createGame(map: MapData, options: NewGameOptions, economy: EconomyConfig = ECONOMY): GameState {
  if (!map.nations.some((n) => n.id === options.playerNation)) throw new Error(`Nazione sconosciuta: ${options.playerNation}`);
  const state: GameState = {
    mapId: map.id,
    clock: { realAnchorMs: options.realNowMs, gameAnchorMinutes: 0, speed: options.speed ?? 1 },
    time: 0,
    playerNation: options.playerNation,
    provinces: Object.fromEntries(map.provinces.map((p) => [p.id, { owner: p.nation, morale: 100 }])),
    nations: {},
    armies: {},
    production: {},
    nextId: 1,
  };
  for (const n of map.nations) {
    const perDay = nationProductionPerDay(map, state, n.id, economy);
    const stock = Object.fromEntries(RESOURCE_IDS.map((r) => [r, perDay[r] * economy.startingStockDays])) as ResourceAmounts;
    state.nations[n.id] = { stock };
  }
  // Armate iniziali: una nella capitale e una in ogni altra città.
  for (const p of map.provinces) {
    if (p.type !== "urban") continue;
    const units = p.isCapital ? STARTING_ARMIES.capital : STARTING_ARMIES.city;
    const army = newArmy(state, p.nation, p.center);
    for (const [type, count] of Object.entries(units) as [UnitTypeId, number][])
      for (let i = 0; i < count; i++) army.units.push(newUnit(state, type));
  }
  return state;
}

/**
 * Porta la partita fino al minuto di gioco `until`, elaborando gli eventi in ordine di tempo:
 * arruolamenti completati, arrivi delle armate e tick di produzione (ogni 30 minuti).
 * Il risultato dipende solo dallo stato e dal tempo, non da quante volte viene chiamata:
 * recuperare ore di assenza in un colpo equivale a giocarle passo passo.
 */
export function advance(state: GameState, map: MapData, until: number, economy: EconomyConfig = ECONOMY): GameState {
  if (until <= state.time) return state;
  const tick = economy.tickMinutes;
  const ticksPerDay = economy.dayMinutes / tick;

  // Copia delle parti che cambiano; le province restano le stesse (non cambiano ancora).
  const s: GameState = {
    ...state,
    nations: Object.fromEntries(Object.entries(state.nations).map(([id, n]) => [id, { ...n, stock: { ...n.stock } }])),
    armies: Object.fromEntries(
      Object.entries(state.armies).map(([id, a]) => [id, { ...a, units: [...a.units] }]),
    ),
    production: Object.fromEntries(Object.entries(state.production).map(([id, q]) => [id, q.map((item) => ({ ...item }))])),
  };
  let rates = netPerDayByNation(map, s, economy);

  for (;;) {
    const nextTick = (Math.floor(s.time / tick) + 1) * tick;
    let t = nextTick;
    for (const a of Object.values(s.armies)) {
      const arrival = a.move?.times[a.move.times.length - 1];
      if (arrival !== undefined && arrival < t) t = arrival;
    }
    for (const q of Object.values(s.production)) {
      const finishesAt = q[0]?.finishesAt;
      if (finishesAt != null && finishesAt < t) t = finishesAt;
    }
    if (t > until) break;
    s.time = t;

    if (completeProduction(s, map, t)) rates = netPerDayByNation(map, s, economy);
    if (processArrivals(s, t)) rates = netPerDayByNation(map, s, economy);

    if (t === nextTick) {
      for (const [id, perDay] of rates) {
        const stock = s.nations[id]!.stock;
        // Il mantenimento non porta le scorte sotto zero (le carenze avranno effetto sul morale).
        for (const r of RESOURCE_IDS) stock[r] = Math.max(0, stock[r] + perDay[r] / ticksPerDay);
      }
      // Qui, a ogni cambio giorno (t % dayMinutes === 0), arriveranno morale e rivolte.
    }
  }
  s.time = until;
  return s;
}

/** Unità pronte al minuto `t`: si uniscono all'armata ferma nella città o ne formano una nuova. */
function completeProduction(s: GameState, map: MapData, t: number): boolean {
  let changed = false;
  for (const [provinceId, queue] of Object.entries(s.production)) {
    const center = mapIndex(map).provinces.get(provinceId)!.center;
    for (let finishedAt = queue[0]?.finishesAt; finishedAt != null && finishedAt <= t; finishedAt = queue[0]?.finishesAt) {
      const done = queue.shift()!;
      const owner = s.provinces[provinceId]!.owner;
      const army = idleArmyNear(s, owner, center) ?? newArmy(s, owner, center);
      army.units.push(newUnit(s, done.unitType));
      if (queue[0]) queue[0].finishesAt = finishedAt + queue[0].durationMinutes;
      changed = true;
    }
    if (queue.length === 0) delete s.production[provinceId];
  }
  return changed;
}

/** Armate che arrivano a destinazione al minuto `t`: si fermano e, se c'è un'altra armata amica ferma lì, si uniscono. */
function processArrivals(s: GameState, t: number): boolean {
  let merged = false;
  for (const army of Object.values(s.armies)) {
    const move = army.move;
    if (!move || move.times[move.times.length - 1]! > t) continue;
    army.position = move.points[move.points.length - 1]!;
    army.move = null;
    const host = idleArmyNear(s, army.owner, army.position, army.id);
    if (host) {
      host.units.push(...army.units);
      delete s.armies[army.id];
      merged = true;
    }
  }
  return merged;
}

function idleArmyNear(s: GameState, owner: NationId, at: LngLat, except?: string): Army | undefined {
  return Object.values(s.armies).find(
    (a) => a.owner === owner && !a.move && a.id !== except && flatKm(a.position, at) <= MOVEMENT.mergeRadiusKm,
  );
}

function newArmy(s: GameState, owner: NationId, position: LngLat): Army {
  const army: Army = { id: `a${s.nextId++}`, owner, units: [], position, move: null };
  s.armies[army.id] = army;
  return army;
}

function newUnit(s: GameState, type: UnitTypeId) {
  return { id: `u${s.nextId++}`, type, hp: UNIT_TYPES[type].hp };
}
