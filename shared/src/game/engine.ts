import { STARTING_BUILDINGS } from "../data/buildings.js";
import { COMBAT } from "../data/combat.js";
import { ENGINEERING } from "../data/engineering.js";
import { ECONOMY, RESOURCE_IDS, type EconomyConfig } from "../data/economy.js";
import { MOVEMENT } from "../data/movement.js";
import { STARTING_ARMIES, UNIT_TYPES, type UnitTypeId } from "../data/units.js";
import type { LngLat, MapData, NationId, Province } from "../map/types.js";
import { flatKm, provinceIdAt } from "../nav/grid.js";
import type { NavData } from "../nav/types.js";
import { buildingLevel, downgradeBuildings, fortDamageFactor } from "./buildings.js";
import { applyDamage, contactFraction, damageAgainst, engagements, heal, isAttacking, lerp, segmentDistanceKm } from "./combat.js";
import { atWar, logEvent, mayEnter, startWar } from "./diplomacy.js";
import { nationProductionPerDay, netPerDayByNation, refund } from "./economy.js";
import { mapIndex } from "./mapIndex.js";
import { armyPosition, moverOf, remainingRoute, scheduleRoute } from "./movement.js";
import { planRoute } from "./routing.js";
import type { Army, ArmyId, GameState, ResourceAmounts } from "./state.js";
import { countRole, targetStillValid, WORK_BUILDINGS } from "./works.js";

// Motore della partita: funzioni pure, nessun accesso a orologio di sistema o rete.
// Chi le usa (oggi il browser, domani il server) passa il tempo dall'esterno.

export interface NewGameOptions {
  playerNation: NationId;
  /** Ora reale di inizio partita (ms). */
  realNowMs: number;
  speed?: number;
  /** Seme degli eventi casuali (rivolte); di solito l'ora di inizio. */
  seed?: number;
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
    buildings: {},
    construction: {},
    seed: options.seed ?? options.realNowMs,
    relations: {},
    destroyedBridges: [],
    pontoons: {},
    hospitals: {},
    events: [],
    nextId: 1,
  };
  for (const p of map.provinces) {
    if (p.type === "urban") state.buildings[p.id] = { ...(p.isCapital ? STARTING_BUILDINGS.capital : STARTING_BUILDINGS.city) };
  }
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

/** Cosa serve al motore: la mappa e, se c'è, la rete di movimento (per confini e territorio). */
export interface EngineWorld {
  map: MapData;
  nav?: NavData;
}

/**
 * Porta la partita fino al minuto di gioco `until`, elaborando gli eventi in ordine di tempo:
 * arruolamenti e lavori completati, partenze ritardate, controlli ogni 5 minuti (confini, contatti, conquiste, arrivi),
 * combattimenti e tick di produzione ogni 30 minuti, morale a ogni cambio giorno.
 * Il risultato dipende solo dallo stato e dal tempo, non da quante volte viene chiamata:
 * recuperare ore di assenza in un colpo equivale a giocarle passo passo.
 */
export function advance(state: GameState, world: EngineWorld, until: number, economy: EconomyConfig = ECONOMY): GameState {
  if (until <= state.time) return state;
  const { map } = world;
  const tick = economy.tickMinutes;
  const ticksPerDay = economy.dayMinutes / tick;
  const every = COMBAT.sampleMinutes;

  // Copia di lavoro delle parti che possono cambiare (lo stato ricevuto resta intatto).
  const s: GameState = {
    ...state,
    provinces: { ...state.provinces },
    nations: Object.fromEntries(Object.entries(state.nations).map(([id, n]) => [id, { ...n, stock: { ...n.stock } }])),
    armies: Object.fromEntries(
      Object.entries(state.armies).map(([id, a]) => [id, { ...a, units: a.units.map((u) => ({ ...u })) }]),
    ),
    production: Object.fromEntries(Object.entries(state.production).map(([id, q]) => [id, q.map((item) => ({ ...item }))])),
    buildings: { ...state.buildings },
    construction: { ...state.construction },
    relations: { ...state.relations },
    destroyedBridges: [...state.destroyedBridges],
    pontoons: { ...state.pontoons },
    hospitals: { ...state.hospitals },
    events: [...state.events],
  };
  let rates = netPerDayByNation(map, s, economy);

  for (;;) {
    const nextTick = (Math.floor(s.time / tick) + 1) * tick;
    const nextSample = (Math.floor(s.time / every) + 1) * every;
    let t = Math.min(nextTick, nextSample);
    for (const q of Object.values(s.production)) {
      const finishesAt = q[0]?.finishesAt;
      if (finishesAt != null && finishesAt < t) t = finishesAt;
    }
    for (const c of Object.values(s.construction)) if (c.finishesAt < t) t = c.finishesAt;
    for (const a of Object.values(s.armies)) {
      if (a.task && a.task.finishesAt < t) t = a.task.finishesAt;
      if (a.departure && a.departure.at < t) t = a.departure.at;
    }
    if (t > until) break;
    s.time = t;

    let changed = completeProduction(s, map, t);
    changed = completeConstruction(s, t) || changed;
    completeWorks(s, world, t);
    depart(s, world, t);
    if (t === nextSample) changed = sample(s, world, t) || changed;
    if (t === nextTick) changed = fight(s, world, t) || changed;
    if (changed) rates = netPerDayByNation(map, s, economy);

    if (t === nextTick) {
      for (const [id, perDay] of rates) {
        const stock = s.nations[id]!.stock;
        // Il mantenimento non porta le scorte sotto zero (le carenze avranno effetto sul morale).
        for (const r of RESOURCE_IDS) stock[r] = Math.max(0, stock[r] + perDay[r] / ticksPerDay);
      }
      if (t % economy.dayMinutes === 0 && updateMorale(s, world, t)) rates = netPerDayByNation(map, s, economy);
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

/** Edifici finiti al minuto `t`. */
function completeConstruction(s: GameState, t: number): boolean {
  let changed = false;
  for (const [provinceId, c] of Object.entries(s.construction)) {
    if (c.finishesAt > t) continue;
    delete s.construction[provinceId];
    s.buildings[provinceId] = { ...s.buildings[provinceId], [c.building]: c.level };
    logEvent(s, { time: c.finishesAt, type: "built", by: s.provinces[provinceId]!.owner, province: provinceId, building: c.building, level: c.level });
    changed = true;
  }
  return changed;
}

/**
 * La provincia passa a un'altra nazione (conquista o rivolta): morale basso, coda di arruolamento
 * e costruzione in corso perse, ogni edificio perde un livello.
 */
function transferProvince(s: GameState, provinceId: string, to: NationId) {
  s.provinces[provinceId] = { owner: to, morale: COMBAT.conqueredMorale };
  delete s.production[provinceId];
  delete s.construction[provinceId];
  const buildings = downgradeBuildings(s.buildings[provinceId]);
  if (buildings) s.buildings[provinceId] = buildings;
  else delete s.buildings[provinceId];
}

/**
 * Controllo ogni 5 minuti di quello che è successo nell'intervallo appena trascorso:
 * 1. un'armata entrata senza accordi nel territorio altrui provoca la dichiarazione di guerra;
 * 2. armate nemiche che arrivano a contatto si fermano (chi marciava va all'assalto);
 * 3. chi attraversa una provincia nemica senza difensori (nessuna armata nemica dentro) la conquista;
 * 4. chi è arrivato a destinazione si ferma e si unisce alle armate amiche lì presenti.
 * Dentro l'intervallo ogni armata si considera in moto rettilineo.
 */
function sample(s: GameState, world: EngineWorld, t: number): boolean {
  const { map, nav } = world;
  const t0 = t - COMBAT.sampleMinutes;
  const armies = Object.values(s.armies);
  const from = new Map<ArmyId, LngLat>();
  const to = new Map<ArmyId, LngLat>();
  for (const a of armies) {
    from.set(a.id, armyPosition(a, t0));
    to.set(a.id, armyPosition(a, t));
  }
  let changed = false;

  if (nav)
    for (const a of armies) {
      if (!a.move) continue;
      const id = provinceIdAt(nav, to.get(a.id)!);
      const owner = id ? s.provinces[id]?.owner : undefined;
      if (owner && !mayEnter(s, a.owner, owner)) startWar(s, owner, a.owner, t);
    }

  const stopAt = new Map<ArmyId, number>();
  for (let i = 0; i < armies.length; i++)
    for (let j = i + 1; j < armies.length; j++) {
      const a = armies[i]!;
      const b = armies[j]!;
      if ((!a.move && !b.move) || !atWar(s, a.owner, b.owner)) continue;
      const f = contactFraction(from.get(a.id)!, to.get(a.id)!, from.get(b.id)!, to.get(b.id)!, COMBAT.contactKm);
      if (f === null) continue;
      for (const x of [a, b]) if (x.move) stopAt.set(x.id, Math.min(stopAt.get(x.id) ?? 1, f));
      const at = lerp(from.get(a.id)!, to.get(a.id)!, f);
      logEvent(s, { time: t, type: "battle", at, province: nav ? provinceIdAt(nav, at) : null, nations: [a.owner, b.owner] });
    }
  for (const [id, f] of stopAt) {
    const a = s.armies[id]!;
    a.position = lerp(from.get(id)!, to.get(id)!, f);
    a.halted = remainingRoute(a.move!, t0 + f * COMBAT.sampleMinutes, a.position);
    a.move = null;
    // Con "Attacca" va all'assalto; con "Muovi" si ferma e si difende.
    a.attacking = a.assault;
    to.set(id, a.position);
  }

  const warring = new Set(Object.entries(s.relations).flatMap(([key, r]) => (r.war ? key.split("|") : [])));
  // Dove si trova ogni armata adesso (per sapere quali province sono difese).
  const inProvince = new Map<ArmyId, string | null>();
  if (nav) for (const a of armies) if (a.units.length > 0) inProvince.set(a.id, provinceIdAt(nav, to.get(a.id)!));
  for (const a of armies) {
    if (!warring.has(a.owner) || a.units.length === 0) continue;
    const p0 = from.get(a.id)!;
    const p1 = to.get(a.id)!;
    for (const id of crossedProvinces(world, p0, p1)) {
      const ps = s.provinces[id]!;
      if (!atWar(s, a.owner, ps.owner)) continue;
      const defended = nav
        ? armies.some((b) => inProvince.get(b.id) === id && atWar(s, a.owner, b.owner))
        : defendedNear(s, a.owner, mapIndex(map).provinces.get(id)!.center, t);
      if (defended) continue;
      logEvent(s, { time: t, type: "conquest", province: id, from: ps.owner, to: a.owner });
      transferProvince(s, id, a.owner);
      changed = true;
    }
  }

  for (const a of armies) {
    const move = a.move;
    if (!move || move.times[move.times.length - 1]! > t) continue;
    a.position = move.points[move.points.length - 1]!;
    a.move = null;
    const host = idleArmyNear(s, a.owner, a.position, a.id);
    if (host) {
      host.units.push(...a.units);
      host.attacking ||= a.attacking;
      delete s.armies[a.id];
    }
  }
  return changed;
}

/**
 * Province attraversate nel tratto p0→p1 (controllate ogni `CROSS_STEP_KM`).
 * Senza rete di movimento: quelle il cui centro sta vicino al tratto.
 */
function crossedProvinces(world: EngineWorld, p0: LngLat, p1: LngLat): string[] {
  const { map, nav } = world;
  if (!nav) return map.provinces.filter((p) => segmentDistanceKm(p0, p1, p.center) <= COMBAT.captureKm).map((p) => p.id);
  const ids = new Set<string>();
  const steps = Math.max(1, Math.ceil(flatKm(p0, p1) / CROSS_STEP_KM));
  for (let i = 0; i <= steps; i++) {
    const id = provinceIdAt(nav, lerp(p0, p1, i / steps));
    if (id) ids.add(id);
  }
  return [...ids];
}

const CROSS_STEP_KM = 2;

/** C'è un'armata nemica di `nation` vicino al punto? */
function defendedNear(s: GameState, nation: NationId, at: LngLat, t: number): boolean {
  return Object.values(s.armies).some(
    (b) => b.units.length > 0 && atWar(s, nation, b.owner) && flatKm(armyPosition(b, t), at) <= COMBAT.contactKm,
  );
}

/**
 * Tick di combattimento: ogni armata a contatto con nemici colpisce il più vicino.
 * I danni si calcolano tutti sullo stato di inizio tick, poi si applicano insieme.
 * Dopo: chi non ha più nemici a portata smette l'assalto e, se era stato fermato durante una marcia,
 * la riprende; chi è fermo nel proprio territorio guarisce.
 */
function fight(s: GameState, world: EngineWorld, t: number): boolean {
  const engaged = engagements(s, t);
  const pos = new Map(Object.values(s.armies).map((a) => [a.id, armyPosition(a, t)]));
  const hits: { by: Army; target: Army; damage: ReturnType<typeof damageAgainst> }[] = [];
  for (const a of Object.values(s.armies)) {
    const foes = engaged.get(a.id);
    if (!foes || a.units.length === 0) continue;
    // Bersaglio: il nemico più vicino (a parità di distanza, il primo per identificativo).
    let target: Army | undefined;
    let best = Infinity;
    for (const id of [...foes].sort()) {
      const d = flatKm(pos.get(a.id)!, pos.get(id)!);
      if (d < best) [target, best] = [s.armies[id], d];
    }
    if (!target) continue;
    const damage = damageAgainst(a, target);
    // Chi difende in una propria provincia fortificata subisce meno danni.
    if (!isAttacking(target) && world.nav) {
      const factor = fortDamageFactor(s, provinceIdAt(world.nav, pos.get(target.id)!), target.owner);
      damage.infantry *= factor;
      damage.armored *= factor;
    }
    hits.push({ by: a, target, damage });
  }

  let changed = false;
  for (const { by, target, damage } of hits) {
    if (!s.armies[target.id]) continue;
    const before = target.units.length;
    target.units = applyDamage(target.units, damage);
    if (target.units.length === before) continue;
    changed = true;
    if (target.units.length > 0) continue;
    const at = pos.get(target.id)!;
    logEvent(s, { time: t, type: "armyDestroyed", owner: target.owner, by: by.owner, at, province: world.nav ? provinceIdAt(world.nav, at) : null });
    delete s.armies[target.id];
  }

  for (const a of Object.values(s.armies)) {
    const inContact = engaged.get(a.id)?.some((id) => s.armies[id]) ?? false;
    if (inContact) continue;
    a.attacking = false;
    if (a.halted) {
      a.move = scheduleRoute(a.halted, moverOf(a), t);
      a.halted = null;
    }
    if (a.move) continue;
    const rate = healRate(s, world, a);
    if (rate > 0) heal(a.units, rate);
  }
  loseHospitals(s, world, t);
  return changed;
}

/**
 * Guarigione per tick di un'armata ferma e senza nemici a contatto: vale la più alta tra
 * territorio proprio, sanità al seguito (ovunque) e vicinanza a un proprio ospedale da campo.
 */
function healRate(s: GameState, world: EngineWorld, a: Army): number {
  let rate = 0;
  if (world.nav) {
    const id = provinceIdAt(world.nav, a.position);
    if (id && s.provinces[id]?.owner === a.owner) rate = COMBAT.healPerTick;
  }
  if (countRole(a, "medic") > 0) rate = Math.max(rate, COMBAT.medicHealPerTick);
  const hospital = Object.values(s.hospitals).some(
    (h) => h.owner === a.owner && flatKm(h.at, a.position) <= ENGINEERING.hospitalRadiusKm,
  );
  if (hospital) rate = Math.max(rate, COMBAT.hospitalHealPerTick);
  return rate;
}

/** Un ospedale da campo con nemici nel raggio e nessuna armata amica a difenderlo va perso. */
function loseHospitals(s: GameState, world: EngineWorld, t: number) {
  for (const h of Object.values(s.hospitals)) {
    let enemy = false;
    let friend = false;
    for (const a of Object.values(s.armies)) {
      if (a.units.length === 0 || flatKm(armyPosition(a, t), h.at) > ENGINEERING.hospitalRadiusKm) continue;
      if (a.owner === h.owner) friend = true;
      else if (atWar(s, a.owner, h.owner)) enemy = true;
    }
    if (!enemy || friend) continue;
    delete s.hospitals[h.id];
    logEvent(s, { time: t, type: "works", what: "hospitalLost", by: h.owner, at: h.at, province: world.nav ? provinceIdAt(world.nav, h.at) : null, river: null });
  }
}

/** Lavori finiti al minuto `t`: si applica il risultato e, se un passaggio si chiude, chi ci passava cambia strada. */
function completeWorks(s: GameState, world: EngineWorld, t: number) {
  const { nav } = world;
  for (const a of Object.values(s.armies)) {
    const task = a.task;
    if (!task || task.finishesAt > t) continue;
    a.task = null;
    if (!nav || !targetStillValid(s, nav, a, task.work, task.target)) continue;
    const target = task.target;
    const at = target.at;
    const event = { time: t, type: "works" as const, by: a.owner, at, province: provinceIdAt(nav, at) };
    if (task.work === "demolish" && target.kind === "bridge") {
      s.destroyedBridges.push(target.id);
      logEvent(s, { ...event, what: "bridgeDestroyed", river: nav.bridges.find((b) => b.id === target.id)?.river ?? null });
      reroute(s, world, at, t);
    } else if (task.work === "demolish" && target.kind === "pontoon") {
      const river = s.pontoons[target.id]!.river;
      delete s.pontoons[target.id];
      logEvent(s, { ...event, what: "pontoonDestroyed", river });
      reroute(s, world, at, t);
    } else if (task.work === "repair" && target.kind === "bridge") {
      s.destroyedBridges = s.destroyedBridges.filter((id) => id !== target.id);
      logEvent(s, { ...event, what: "bridgeRepaired", river: nav.bridges.find((b) => b.id === target.id)?.river ?? null });
    } else if (task.work === "pontoon" && target.kind === "river") {
      const id = `p${s.nextId++}`;
      s.pontoons[id] = { id, owner: a.owner, cells: target.cells, at, river: target.river };
      logEvent(s, { ...event, what: "pontoonBuilt", river: target.river });
    } else if (target.kind === "province") {
      const building = WORK_BUILDINGS[task.work]!;
      const level = buildingLevel(s, target.id, building) + 1;
      s.buildings[target.id] = { ...s.buildings[target.id], [building]: level };
      logEvent(s, { time: t, type: "built", by: a.owner, province: target.id, building, level });
    } else if (task.work === "hospital") {
      const id = `h${s.nextId++}`;
      s.hospitals[id] = { id, owner: a.owner, at };
      logEvent(s, { ...event, what: "hospitalBuilt", river: null });
    }
  }
}

/**
 * Un passaggio sul fiume vicino a `at` non c'è più: le armate il cui percorso (anche quello
 * sospeso dal combattimento) ci passava vicino lo ricalcolano; se non c'è un'altra strada si fermano.
 */
function reroute(s: GameState, world: EngineWorld, at: LngLat, t: number) {
  const nav = world.nav!;
  const near = (points: LngLat[]) => points.some((p, i) => i > 0 && segmentDistanceKm(points[i - 1]!, p, at) <= REROUTE_KM);
  for (const a of Object.values(s.armies)) {
    if (a.move) {
      const pos = armyPosition(a, t);
      const rest = remainingRoute(a.move, t, pos);
      if (!rest || !near(rest.points)) continue;
      const route = planRoute(s, nav, a.owner, pos, rest.points[rest.points.length - 1]!, moverOf(a));
      a.position = pos;
      a.move = route && route.km >= 0.5 ? scheduleRoute(route, moverOf(a), t) : null;
    } else if (a.halted && near(a.halted.points)) {
      const route = planRoute(s, nav, a.owner, a.halted.points[0]!, a.halted.points[a.halted.points.length - 1]!, moverOf(a));
      a.halted = route ? { points: route.points, onRoad: route.onRoad, rail: route.rail } : null;
    }
  }
}

/** Partenze ritardate arrivate all'ora: il percorso si calcola adesso, con la mappa di adesso. Chi parte lascia il lavoro. */
function depart(s: GameState, world: EngineWorld, t: number) {
  const { nav } = world;
  for (const a of Object.values(s.armies)) {
    const departure = a.departure;
    if (!departure || departure.at > t) continue;
    a.departure = null;
    if (!nav || a.move) continue;
    const route = planRoute(s, nav, a.owner, a.position, departure.target, moverOf(a));
    if (!route || route.km < 0.5) continue;
    a.move = scheduleRoute(route, moverOf(a), t);
    // Partendo si abbandona un eventuale lavoro in corso (le risorse tornano indietro).
    if (a.task?.cost) refund(s.nations[a.owner]!.stock, a.task.cost);
    a.task = null;
  }
}

/** Distanza entro cui un percorso si considera passante per il ponte appena distrutto. */
const REROUTE_KM = 1;

/**
 * Cambio giorno. Le province conquistate senza armate dentro e con il morale basso possono ribellarsi
 * (tornano alla nazione d'origine, come una riconquista); le altre conquistate guadagnano qualche punto di morale.
 * Le province core si avvicinano all'obiettivo.
 */
function updateMorale(s: GameState, world: EngineWorld, t: number): boolean {
  const { map, nav } = world;
  const index = mapIndex(map).provinces;
  const occupied = new Set<string | null>();
  if (nav) for (const a of Object.values(s.armies)) if (a.units.length > 0) occupied.add(provinceIdAt(nav, armyPosition(a, t)));
  const day = Math.floor(t / ECONOMY.dayMinutes);
  let changed = false;
  for (const [id, ps] of Object.entries(s.provinces)) {
    const home = index.get(id)?.nation;
    if (home && ps.owner !== home) {
      const unrest = ps.morale < COMBAT.revoltBelowMorale && nav && !occupied.has(id);
      if (unrest && chance(s.seed, day, id) < COMBAT.revoltChance) {
        logEvent(s, { time: t, type: "revolt", province: id, from: ps.owner, to: home });
        transferProvince(s, id, home);
      } else if (ps.morale < COMBAT.moraleTarget) {
        s.provinces[id] = { ...ps, morale: Math.min(COMBAT.moraleTarget, ps.morale + COMBAT.conqueredMoraleDailyGain) };
      } else continue;
      changed = true;
      continue;
    }
    const gap = COMBAT.moraleTarget - ps.morale;
    if (gap === 0) continue;
    const morale = Math.abs(gap) < 0.5 ? COMBAT.moraleTarget : ps.morale + gap * COMBAT.moraleDailyStep;
    s.provinces[id] = { ...ps, morale };
    changed = true;
  }
  return changed;
}

/** Numero pseudo-casuale in [0, 1) che dipende solo da seme, giorno e provincia (stesso risultato a ogni ricalcolo). */
function chance(seed: number, day: number, id: string): number {
  let h = 2166136261 ^ seed;
  for (const ch of `${day}|${id}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function idleArmyNear(s: GameState, owner: NationId, at: LngLat, except?: string): Army | undefined {
  return Object.values(s.armies).find(
    (a) => a.owner === owner && !a.move && a.id !== except && flatKm(a.position, at) <= MOVEMENT.mergeRadiusKm,
  );
}

function newArmy(s: GameState, owner: NationId, position: LngLat): Army {
  const army: Army = { id: `a${s.nextId++}`, owner, units: [], position, move: null, attacking: false, halted: null, assault: false, useRail: false, departure: null, task: null };
  s.armies[army.id] = army;
  return army;
}

function newUnit(s: GameState, type: UnitTypeId) {
  return { id: `u${s.nextId++}`, type, hp: UNIT_TYPES[type].hp };
}
