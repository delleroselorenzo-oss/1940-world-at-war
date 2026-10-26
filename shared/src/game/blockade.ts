import { TRADE } from "../data/economy.js";
import type { MapData, NationId, ProvinceId } from "../map/types.js";
import { cellAt } from "../nav/grid.js";
import type { NavData } from "../nav/types.js";
import { atWar, hasAgreement } from "./diplomacy.js";
import { mapIndex } from "./mapIndex.js";
import { fleetPosition } from "./navy.js";
import type { Fleet, GameState } from "./state.js";

// Blocco navale (docs/game-design.md, §8 "Marina", passo 6).
//  - Un porto è bloccato quando nella zona di mare del suo approdo c'è una flotta di superficie nemica (in guerra con il padrone)
//    fuori dal porto, e nessuna nave da guerra del padrone o di un suo alleato in quella zona (in mare o in porto).
//  - I sottomarini non bloccano i porti: danno la caccia ai convogli.
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

/** Zone di mare bloccate per la nazione: flotte di superficie nemiche fuori dal porto, nessuna nave da guerra amica. */
export function blockadedZones(state: GameState, nav: NavData, nation: NationId): Set<number> {
  const enemy = new Set<number>();
  const friendly = new Set<number>();
  for (const f of Object.values(state.fleets)) {
    if (!isWarFleet(f)) continue;
    const zone = zoneOfCell(nav, cellAt(nav, fleetPosition(f, state.time)));
    if (zone < 0) continue;
    if (f.owner === nation || hasAgreement(state, nation, f.owner, "alliance")) friendly.add(zone);
    else if (f.port === null && atWar(state, nation, f.owner) && f.ships.some((x) => x.type !== "submarine")) enemy.add(zone);
  }
  for (const z of friendly) enemy.delete(z);
  return enemy;
}

/** Porti della nazione bloccati adesso. */
export function blockadedPorts(map: MapData, state: GameState, nav: NavData, nation: NationId): Set<ProvinceId> {
  const zones = blockadedZones(state, nav, nation);
  const out = new Set<ProvinceId>();
  if (zones.size === 0) return out;
  for (const { province } of seaPorts(map, state, nation)) if (zones.has(portZone(nav, province))) out.add(province);
  return out;
}
