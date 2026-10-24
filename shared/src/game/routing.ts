import type { LngLat, NationId } from "../map/types.js";
import { passageKey, provinceIdAt } from "../nav/grid.js";
import { findRoute, type Route } from "../nav/route.js";
import type { NavData } from "../nav/types.js";
import { MOVEMENT } from "../data/movement.js";
import { hasAgreement, mayEnter } from "./diplomacy.js";
import type { Mover } from "./movement.js";
import type { GameState } from "./state.js";

// Percorsi delle armate nello stato attuale della partita: chi possiede cosa,
// quali ponti sono distrutti e dove ci sono ponti di barche.

const bridgeIndexes = new WeakMap<NavData, Map<string, number>>();

/** Indice del ponte in `nav.bridges` dato il suo id. */
export function bridgeIndex(nav: NavData, id: string): number {
  let index = bridgeIndexes.get(nav);
  if (!index) {
    index = new Map(nav.bridges.map((b, i) => [b.id, i]));
    bridgeIndexes.set(nav, index);
  }
  return index.get(id) ?? -1;
}

/** Ponti chiusi e passaggi aperti dai ponti di barche, nel formato di `findRoute`. */
export function crossings(state: GameState, nav: NavData): { closedBridges: Set<number>; openPassages: Set<number> } {
  return {
    closedBridges: new Set(state.destroyedBridges.map((id) => bridgeIndex(nav, id)).filter((i) => i >= 0)),
    openPassages: new Set(Object.values(state.pontoons).map((p) => passageKey(nav, p.cells[0], p.cells[1]))),
  };
}

/**
 * Celle in cui un'armata di `nation` può passare: territorio proprio, di chi è già in guerra
 * con lei o di chi ha un accordo, più quello di `alsoEnter` (la nazione verso cui marcia).
 * Così il percorso non attraversa per sbaglio un paese terzo, cosa che farebbe scoppiare una guerra.
 */
export function passableTerritory(state: GameState, nav: NavData, nation: NationId, alsoEnter?: NationId): (cell: number) => boolean {
  const allowed = nav.provinceIds.map((id) => {
    const owner = state.provinces[id]?.owner;
    return owner !== undefined && (owner === alsoEnter || mayEnter(state, nation, owner));
  });
  return (cell) => allowed[nav.grid.province[cell]! - 1] === true;
}

/**
 * Velocità del treno per `nation` in ogni cella: più alta nel proprio territorio con il morale alto,
 * normale nel resto del proprio territorio e dove si ha il diritto di passaggio, 0 altrove.
 */
export function railSpeeds(state: GameState, nav: NavData, nation: NationId): (cell: number) => number {
  const speeds = nav.provinceIds.map((id) => {
    const p = state.provinces[id];
    if (!p) return 0;
    if (p.owner === nation) return p.morale >= MOVEMENT.railHomeMinMorale ? MOVEMENT.railHomeSpeedKmh : MOVEMENT.railSpeedKmh;
    return hasAgreement(state, nation, p.owner, "passage") ? MOVEMENT.railSpeedKmh : 0;
  });
  return (cell) => speeds[nav.grid.province[cell]! - 1] ?? 0;
}

/** Fanteria a piedi: serve quando non si sa chi marcia. */
const DEFAULT_MOVER: Mover = { speedKmh: 20, boardMinutes: MOVEMENT.railBoardMinMinutes, useRail: false };

/** Percorso più rapido per un'armata di `nation` da `from` a `target`, o null se non c'è. */
export function planRoute(
  state: GameState,
  nav: NavData,
  nation: NationId,
  from: LngLat,
  target: LngLat,
  mover: Mover = DEFAULT_MOVER,
): Route | null {
  const id = provinceIdAt(nav, target);
  const owner = id ? state.provinces[id]?.owner : undefined;
  if (!owner) return null;
  return findRoute(nav, from, target, {
    canEnter: passableTerritory(state, nav, nation, owner),
    ...crossings(state, nav),
    speedKmh: mover.speedKmh,
    // Senza il treno la ferrovia si percorre a piedi come una strada.
    rail: mover.useRail
      ? { boardMinutes: mover.boardMinutes, speedAt: railSpeeds(state, nav, nation), maxSpeedKmh: MOVEMENT.railHomeSpeedKmh }
      : undefined,
  });
}
