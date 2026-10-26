import { SHIP_TYPES, type ShipTypeId } from "../data/naval.js";
import type { LngLat, MapData, NationId, ProvinceId } from "../map/types.js";
import { cellAt, cellCenter, flatKm } from "../nav/grid.js";
import { findSeaRoute, nearestNavigable } from "../nav/sea.js";
import type { NavData } from "../nav/types.js";
import { atWar, hasAgreement } from "./diplomacy.js";
import { mapIndex } from "./mapIndex.js";
import type { Fleet, GameState, Ship, Voyage } from "./state.js";

// Marina (docs/game-design.md, §8 "Marina"): flotte, navigazione, porti.
//  - Una flotta va alla velocità della nave più lenta, per la rotta navale più breve (nav/sea.ts).
//  - Gli stretti sono chiusi a chi è in guerra con il padrone di una delle rive.
//  - Arrivata all'approdo di una provincia propria (o di chi ha concesso il passaggio, o di un alleato) si ormeggia
//    nel porto; nello stesso porto le flotte della stessa nazione si uniscono.
//  - Le navi nuove escono nel porto della città con il cantiere navale.

export function fleetSpeedKmh(fleet: Fleet): number {
  return Math.min(...fleet.ships.map((s) => SHIP_TYPES[s.type].speedKmh));
}

export function fleetSightKm(fleet: Fleet): number {
  return Math.max(0, ...fleet.ships.map((s) => SHIP_TYPES[s.type].sightKm));
}

/** Salute media della flotta (0–1). */
export function fleetHealth(fleet: Fleet): number {
  let hp = 0;
  let max = 0;
  for (const s of fleet.ships) {
    hp += s.hp;
    max += SHIP_TYPES[s.type].hp;
  }
  return max > 0 ? hp / max : 0;
}

/** Dove si trova la flotta al minuto `t`. */
export function fleetPosition(fleet: Fleet, t: number): LngLat {
  const v = fleet.voyage;
  if (!v) return fleet.position;
  if (t <= v.times[0]!) return v.points[0]!;
  const last = v.times.length - 1;
  if (t >= v.times[last]!) return v.points[last]!;
  let i = 1;
  while (v.times[i]! < t) i++;
  const f = (t - v.times[i - 1]!) / (v.times[i]! - v.times[i - 1]! || 1);
  const a = v.points[i - 1]!;
  const b = v.points[i]!;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

export function voyageArrival(fleet: Fleet): number | null {
  return fleet.voyage ? fleet.voyage.times[fleet.voyage.times.length - 1]! : null;
}

/** Si può ormeggiare nei porti di `owner`: i propri, di chi ha concesso il passaggio, degli alleati. */
export function mayDock(state: GameState, nation: NationId, owner: NationId): boolean {
  return owner === nation || hasAgreement(state, nation, owner, "passage");
}

/** Stretti chiusi a `nation` (indici in `nav.sea.straits`): chi tiene una delle rive è in guerra con lei. */
export function closedStraits(state: GameState, nav: NavData, nation: NationId): Set<number> {
  const closed = new Set<number>();
  nav.sea?.straits.forEach((s, i) => {
    if (s.provinces.some((p) => atWar(state, nation, state.provinces[p]?.owner ?? nation))) closed.add(i);
  });
  return closed;
}

/** Provincia (propria o amica) il cui approdo è nel punto `at`, se c'è. */
export function portAt(state: GameState, nav: NavData, nation: NationId, at: LngLat): ProvinceId | null {
  const cell = cellAt(nav, at);
  const harbor = nav.sea?.harbor;
  if (cell < 0 || !harbor) return null;
  for (let i = 0; i < harbor.length; i++) {
    if (harbor[i] !== cell) continue;
    const id = nav.provinceIds[i]!;
    if (mayDock(state, nation, state.provinces[id]?.owner ?? "")) return id;
  }
  return null;
}

/** Approdo della provincia (dove escono le navi nuove e dove si ormeggia): la sua cella di mare, o il centro se non ce l'ha. */
export function harborPoint(map: MapData, nav: NavData | undefined, province: ProvinceId): LngLat {
  const i = nav ? nav.provinceIds.indexOf(province) : -1;
  const cell = i >= 0 ? (nav!.sea?.harbor[i] ?? -1) : -1;
  return cell >= 0 ? cellCenter(nav!, cell) : mapIndex(map).provinces.get(province)!.center;
}

/**
 * Rotta per portare la flotta a `target` partendo dal minuto `t`: un punto di mare (o accanto alla costa).
 * Restituisce la navigazione con gli orari, oppure il motivo per cui non si può.
 */
export function planVoyage(state: GameState, nav: NavData, fleet: Fleet, target: LngLat, t: number): Voyage | string {
  if (fleet.ships.length === 0) return "La flotta non ha navi.";
  if (nearestNavigable(nav, target) < 0) return "Le navi vanno solo per mare.";
  const from = fleetPosition(fleet, t);
  const route = findSeaRoute(nav, from, target, { closedStraits: closedStraits(state, nav, fleet.owner) });
  if (!route) return "Nessuna rotta per mare fin lì (o uno stretto è chiuso dal nemico).";
  const speed = fleetSpeedKmh(fleet);
  const times = [t];
  for (let i = 1; i < route.points.length; i++) times.push(times[i - 1]! + (flatKm(route.points[i - 1]!, route.points[i]!) / speed) * 60);
  return { points: route.points, times };
}

/** Avvia la navigazione (la flotta lascia il porto). Modifica `fleet`. */
export function startVoyage(fleet: Fleet, voyage: Voyage): void {
  fleet.position = voyage.points[0]!;
  fleet.voyage = voyage;
  fleet.port = null;
}

/** Ferma la flotta dov'è al minuto `t`. Modifica `fleet`. */
export function haltFleet(fleet: Fleet, t: number): void {
  fleet.position = fleetPosition(fleet, t);
  fleet.voyage = null;
}

export function newFleet(s: GameState, owner: NationId, position: LngLat, port: ProvinceId | null): Fleet {
  const fleet: Fleet = { id: `f${s.nextId++}`, owner, ships: [], position, voyage: null, port };
  s.fleets[fleet.id] = fleet;
  return fleet;
}

export function newShip(s: GameState, type: ShipTypeId): Ship {
  return { id: `u${s.nextId++}`, type, hp: SHIP_TYPES[type].hp };
}

/** Flotta ferma nel porto della provincia (per unirsi a lei). */
export function dockedFleet(s: GameState, owner: NationId, port: ProvinceId, except?: string): Fleet | undefined {
  return Object.values(s.fleets).find((f) => f.owner === owner && f.port === port && !f.voyage && f.id !== except);
}

/**
 * Operazioni navali al minuto `t`: arrivi (ormeggio nel porto se c'è, unione con la flotta già ormeggiata)
 * e flotte che perdono il porto (la provincia è passata a un'altra nazione): restano in rada. Modifica `s`.
 */
export function navalOps(s: GameState, world: { nav?: NavData }, t: number): boolean {
  let changed = false;
  for (const id of Object.keys(s.fleets)) {
    const fleet = s.fleets[id];
    if (!fleet) continue;
    const arrival = voyageArrival(fleet);
    if (arrival !== null && arrival <= t) {
      fleet.position = fleet.voyage!.points[fleet.voyage!.points.length - 1]!;
      fleet.voyage = null;
      fleet.port = world.nav ? portAt(s, world.nav, fleet.owner, fleet.position) : null;
      const host = fleet.port ? dockedFleet(s, fleet.owner, fleet.port, fleet.id) : undefined;
      if (host) {
        host.ships.push(...fleet.ships);
        delete s.fleets[id];
        changed = true;
      }
    }
    if (fleet.port && !mayDock(s, fleet.owner, s.provinces[fleet.port]?.owner ?? "")) fleet.port = null;
  }
  return changed;
}

/** Prossimo arrivo di una flotta. */
export function nextNavalEvent(s: GameState): number {
  let next = Infinity;
  for (const f of Object.values(s.fleets)) {
    const arrival = voyageArrival(f);
    if (arrival !== null && arrival > s.time) next = Math.min(next, arrival);
  }
  return next;
}
