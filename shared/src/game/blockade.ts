import { TRADE } from "../data/economy.js";
import type { MapData, NationId, ProvinceId } from "../map/types.js";
import { cellAt } from "../nav/grid.js";
import type { NavData } from "../nav/types.js";
import { CONVOY } from "../data/naval.js";
import { atWar, hasAgreement, hasEmbargo } from "./diplomacy.js";
import { mapIndex } from "./mapIndex.js";
import { fleetPosition } from "./navy.js";
import type { Fleet, GameState } from "./state.js";

// Blocco navale (docs/game-design.md, §8 "Marina", passo 6).
//  - Un porto è bloccato quando nella zona di mare del suo approdo ci sono almeno 2 navi di superficie fuori dal porto
//    di nazioni in guerra con il padrone o che lo hanno messo sotto embargo (l'embargo blocca senza guerra: niente spari).
//  - Il blocco si rompe quando le navi di superficie del padrone e dei suoi alleati nella zona (in mare o in porto)
//    sono più di quelle che bloccano, oppure affondando o cacciando le navi che bloccano.
//  - I sottomarini non bloccano i porti e non rompono il blocco: danno la caccia ai convogli.
//  - Un porto bloccato non dà capacità di importazione e i convogli non ci vanno.

/** Flotta con navi da guerra (non un trasporto, non un convoglio). */
export function isWarFleet(f: Fleet): boolean {
  return f.ships.length > 0 && !f.transport && !f.convoy;
}

/** Zona di mare (indice in `nav.sea.zones`) della cella, -1 se non è mare. */
function zoneOfCell(nav: NavData, cell: number): number {
  return cell >= 0 ? (nav.sea?.zone[cell] ?? 0) - 1 : -1;
}

/** Zona di mare dell'approdo della provincia, -1 se non tocca il mare. */
export function portZone(nav: NavData, province: ProvinceId): number {
  const i = nav.provinceIds.indexOf(province);
  return i >= 0 ? zoneOfCell(nav, nav.sea?.harbor[i] ?? -1) : -1;
}

/** Porti commerciali della nazione con la loro capacità di importazione al giorno (città costiere e porti del genio). */
export function seaPorts(map: MapData, state: GameState, nation: NationId): { province: ProvinceId; perDay: number }[] {
  const index = mapIndex(map);
  const out: { province: ProvinceId; perDay: number }[] = [];
  for (const [id, ps] of Object.entries(state.provinces)) {
    if (ps.owner !== nation) continue;
    const province = index.provinces.get(id);
    if (!province) continue;
    const perDay = (province.coastal && province.type === "urban" ? TRADE.portCityPerDay : 0) + (state.buildings[id]?.port ?? 0) * TRADE.portPerLevel;
    if (perDay > 0) out.push({ province: id, perDay });
  }
  return out;
}

/** Chi può bloccare i porti della nazione: chi è in guerra con lei o l'ha messa sotto embargo. */
export function mayBlockade(state: GameState, by: NationId, nation: NationId): boolean {
  return by !== nation && (atWar(state, by, nation) || hasEmbargo(state, by, nation));
}

export interface ZoneBlockade {
  /** Navi di superficie che bloccano (fuori dal porto). */
  blockers: number;
  /** Navi di superficie della nazione e dei suoi alleati nella zona. */
  defenders: number;
}

/** Navi di superficie che bloccano e che difendono, per zona di mare (solo le zone dove c'è qualcuno). */
export function zoneForces(state: GameState, nav: NavData, nation: NationId): Map<number, ZoneBlockade> {
  const out = new Map<number, ZoneBlockade>();
  for (const f of Object.values(state.fleets)) {
    if (!isWarFleet(f)) continue;
    const surface = f.ships.filter((x) => x.type !== "submarine").length;
    if (surface === 0) continue;
    const zone = zoneOfCell(nav, cellAt(nav, fleetPosition(f, state.time)));
    if (zone < 0) continue;
    const z = out.get(zone) ?? { blockers: 0, defenders: 0 };
    if (f.owner === nation || hasAgreement(state, nation, f.owner, "alliance")) z.defenders += surface;
    else if (f.port === null && mayBlockade(state, f.owner, nation)) z.blockers += surface;
    out.set(zone, z);
  }
  return out;
}

/** Il blocco tiene: abbastanza navi che bloccano e non più difensori che bloccanti. */
export function blockadeHolds(z: ZoneBlockade): boolean {
  return z.blockers >= CONVOY.blockadeMinShips && z.defenders <= z.blockers;
}

/** Zone di mare bloccate per la nazione. */
export function blockadedZones(state: GameState, nav: NavData, nation: NationId): Set<number> {
  const out = new Set<number>();
  for (const [zone, z] of zoneForces(state, nav, nation)) if (blockadeHolds(z)) out.add(zone);
  return out;
}

/** Porti della nazione bloccati adesso. */
export function blockadedPorts(map: MapData, state: GameState, nav: NavData, nation: NationId): Set<ProvinceId> {
  const zones = blockadedZones(state, nav, nation);
  const out = new Set<ProvinceId>();
  if (zones.size === 0) return out;
  for (const { province } of seaPorts(map, state, nation)) if (zones.has(portZone(nav, province))) out.add(province);
  return out;
}
