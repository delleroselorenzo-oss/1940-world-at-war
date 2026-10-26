import { AIRCRAFT_TYPES } from "../data/air.js";
import { UNIT_TYPES } from "../data/units.js";
import type { LngLat, MapData, NationId, ProvinceId } from "../map/types.js";
import { flatKm, provinceIdAt } from "../nav/grid.js";
import type { NavData } from "../nav/types.js";
import { squadronPosition } from "./air.js";
import { viewersOf } from "./diplomacy.js";
import { detected } from "./submarines.js";
import { armyPosition } from "./movement.js";
import { fleetPosition, fleetSightKm } from "./navy.js";
import type { Army, ArmyId, FleetId, GameState, Squadron, SquadronId } from "./state.js";

// Nebbia di guerra (docs/game-design.md, §9 "Nebbia di guerra"): cosa vede una nazione.
// Si vede: le proprie province, la provincia dove sta ogni propria armata o squadriglia,
// e tutto quello che sta entro la vista (`sightKm`) delle proprie armate, flotte e degli aerei in volo
// (una flotta ormeggiata vede anche la provincia del suo porto).
// Con la mappa condivisa (o l'alleanza) si vede anche quello che vede l'altra nazione.
// Proprietari e morale delle province sono sempre noti; nella nebbia restano nascosti armate, squadriglie, flotte, edifici e lavori.
// I sottomarini in immersione si vedono solo se scoperti (submarines.ts).

export { viewersOf };

export const VISION = {
  /** Un'armata nemica avvistata mostra la composizione solo entro questa distanza da una propria armata. */
  revealKm: 15,
} as const;

export interface Vision {
  /** Nazioni di cui si vede tutto (la propria e chi condivide la mappa). */
  viewers: ReadonlySet<NationId>;
  provinces: ReadonlySet<ProvinceId>;
  armies: ReadonlySet<ArmyId>;
  squadrons: ReadonlySet<SquadronId>;
  fleets: ReadonlySet<FleetId>;
}

interface VisionWorld {
  map: MapData;
  nav?: NavData;
}


/** Vista dell'armata: quella dell'unità che vede più lontano. */
export function armySightKm(army: Army): number {
  return Math.max(0, ...army.units.map((u) => UNIT_TYPES[u.type].sightKm));
}

/** Vista della squadriglia in volo: quella dell'aereo che vede più lontano. */
export function squadronSightKm(sq: Squadron): number {
  return Math.max(0, ...sq.aircraft.map((a) => AIRCRAFT_TYPES[a.type].sightKm));
}

/** Cosa vede `nation` al minuto `t`. */
export function visionOf(state: GameState, world: VisionWorld, nation: NationId, t = state.time): Vision {
  const { map, nav } = world;
  const viewers = viewersOf(state, nation);
  const provinces = new Set<ProvinceId>();
  for (const p of map.provinces) {
    if (viewers.has(state.provinces[p.id]?.owner ?? p.nation)) provinces.add(p.id);
  }

  // Occhi: punti da cui si vede, con la loro distanza di vista.
  const eyes: { at: LngLat; km: number }[] = [];
  for (const a of Object.values(state.armies)) {
    if (!viewers.has(a.owner)) continue;
    const at = armyPosition(a, t);
    eyes.push({ at, km: armySightKm(a) });
    const here = nav ? provinceIdAt(nav, at) : null;
    if (here) provinces.add(here);
  }
  for (const sq of Object.values(state.squadrons)) {
    if (!viewers.has(sq.owner)) continue;
    if (sq.flight && t < sq.flight.arriveAt) eyes.push({ at: squadronPosition(state, sq, map, t), km: squadronSightKm(sq) });
    else if (!state.fleets[sq.base]) provinces.add(sq.base);
  }
  for (const f of Object.values(state.fleets)) {
    if (!viewers.has(f.owner)) continue;
    eyes.push({ at: fleetPosition(f, t), km: fleetSightKm(f) });
    if (f.port) provinces.add(f.port);
  }
  for (const p of map.provinces) if (!provinces.has(p.id) && eyes.some((e) => flatKm(e.at, p.center) <= e.km)) provinces.add(p.id);

  const seen = (at: LngLat) => {
    const here = nav ? provinceIdAt(nav, at) : null;
    return (here !== null && provinces.has(here)) || eyes.some((e) => flatKm(e.at, at) <= e.km);
  };
  const armies = new Set<ArmyId>();
  for (const a of Object.values(state.armies)) if (viewers.has(a.owner) || seen(armyPosition(a, t))) armies.add(a.id);
  const fleets = new Set<FleetId>();
  for (const f of Object.values(state.fleets)) {
    if (viewers.has(f.owner)) fleets.add(f.id);
    else if (((f.port ? provinces.has(f.port) : false) || seen(fleetPosition(f, t))) && detected(state, viewers, f, t)) fleets.add(f.id);
  }
  const squadrons = new Set<SquadronId>();
  for (const sq of Object.values(state.squadrons)) {
    const flying = sq.flight !== null && t < sq.flight.arriveAt;
    if (viewers.has(sq.owner) || (flying ? seen(squadronPosition(state, sq, map, t)) : state.fleets[sq.base] ? fleets.has(sq.base) : provinces.has(sq.base))) squadrons.add(sq.id);
  }
  return { viewers, provinces, armies, squadrons, fleets };
}

/** Si conosce la composizione di un'armata: è propria (o di chi condivide la mappa), oppure è vicina a una propria armata. */
export function knowsComposition(state: GameState, vision: Vision, army: Army, t = state.time): boolean {
  if (vision.viewers.has(army.owner)) return true;
  if (!vision.armies.has(army.id)) return false;
  const at = armyPosition(army, t);
  return Object.values(state.armies).some((a) => vision.viewers.has(a.owner) && flatKm(armyPosition(a, t), at) <= VISION.revealKm);
}
