import { AIRCRAFT_TYPES } from "../data/air.js";
import { NAVAL, SHIP_TYPES } from "../data/naval.js";
import type { LngLat, NationId } from "../map/types.js";
import { flatKm } from "../nav/grid.js";
import { fleetPosition } from "./navy.js";
import type { Fleet, GameState } from "./state.js";

// Sottomarini (docs/game-design.md, §8 "Marina", passo 4): una flotta di soli sottomarini è in immersione e il nemico
// non la vede né la può colpire, a meno che non la scopra:
//  - un cacciatorpediniere entro la sua distanza di scoperta (`subDetectKm`, 15 km);
//  - un aereo in volo che sa cercarli (ricognitore 30 km, aerosilurante 15, bombardiere tattico 10);
//  - per un'ora dopo che ha attaccato (`revealedUntil`).
// Una flotta mista (con navi di superficie) si vede come tutte le altre.

/** La flotta è in immersione: solo sottomarini, fuori dal porto (in porto stanno in superficie). */
export function isSubmerged(fleet: Fleet): boolean {
  return fleet.port === null && fleet.ships.length > 0 && fleet.ships.every((s) => s.type === "submarine");
}

/** Dopo un attacco il sottomarino si scopre. Modifica `fleet`. */
export function revealSubmarine(fleet: Fleet, t: number): void {
  if (isSubmerged(fleet)) fleet.revealedUntil = t + NAVAL.subRevealMinutes;
}

/** Le nazioni `viewers` scoprono la flotta al minuto `t`? (Sempre vero per una flotta che non è in immersione.) */
export function detected(state: GameState, viewers: ReadonlySet<NationId>, fleet: Fleet, t: number): boolean {
  if (!isSubmerged(fleet) || viewers.has(fleet.owner)) return true;
  if ((fleet.revealedUntil ?? -Infinity) > t) return true;
  const at = fleetPosition(fleet, t);
  for (const f of Object.values(state.fleets)) {
    if (!viewers.has(f.owner)) continue;
    const km = Math.max(0, ...f.ships.map((s) => SHIP_TYPES[s.type].subDetectKm ?? 0));
    if (km > 0 && flatKm(fleetPosition(f, t), at) <= km) return true;
  }
  for (const sq of Object.values(state.squadrons)) {
    const fl = sq.flight;
    if (!viewers.has(sq.owner) || !fl || t < fl.departAt || t >= fl.arriveAt) continue;
    const km = Math.max(0, ...sq.aircraft.map((a) => AIRCRAFT_TYPES[a.type].subDetectKm ?? 0));
    if (km > 0 && flatKm(flightPoint(fl, t), at) <= km) return true;
  }
  return false;
}

function flightPoint(f: { from: LngLat; to: LngLat; departAt: number; arriveAt: number }, t: number): LngLat {
  const k = Math.max(0, Math.min(1, (t - f.departAt) / (f.arriveAt - f.departAt || 1)));
  return [f.from[0] + (f.to[0] - f.from[0]) * k, f.from[1] + (f.to[1] - f.from[1]) * k];
}
