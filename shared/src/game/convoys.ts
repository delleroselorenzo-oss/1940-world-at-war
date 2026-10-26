import { CONVOY } from "../data/naval.js";
import { RESOURCE_IDS } from "../data/economy.js";
import type { LngLat, MapData, NationId, ProvinceId, ResourceId } from "../map/types.js";
import { flatKm } from "../nav/grid.js";
import { findSeaRoute, harborOf, seaZoneAt } from "../nav/sea.js";
import type { NavData, SeaGate } from "../nav/types.js";
import { blockadedPorts, seaPorts } from "./blockade.js";
import { logEvent } from "./diplomacy.js";
import { closedStraits, fleetPosition, newFleet } from "./navy.js";
import type { Convoy, Fleet, GameState, ResourceAmounts, Voyage } from "./state.js";
import { convoysActive, importCapacityPerDay, importFlows, seaFraction } from "./trade.js";

// Convogli mercantili (docs/game-design.md, §8 "Marina", passo 6). Le importazioni dal mercato estero che non arrivano via terra
// viaggiano per mare: ogni giorno a mezzanotte parte un convoglio per ogni nazione, con il carico del giorno, pagato alla partenza.
//  - Entra dalla porta sull'oceano più vicina (`nav.sea.gates`: Atlantico, Suez, Persia) e va al porto non bloccato più vicino
//    a una porta, per la rotta più breve (gli stretti chiusi dal nemico non si passano).
//  - Naviga a 20 km/h senza sparare: lo attaccano le navi nemiche entro la loro vista (sottomarini compresi), l'artiglieria
//    della costa e gli aerei. Quello che arriva è in proporzione ai punti vita rimasti.
//  - Se il porto non è più della nazione all'arrivo, prosegue verso un altro porto; se non ce n'è, il carico va perso.

/** Punti vita di un convoglio con questo carico. */
export function convoyHp(cargo: Partial<ResourceAmounts>): number {
  const total = Object.values(cargo).reduce((sum, v) => sum + (v ?? 0), 0);
  return Math.max(CONVOY.minHp, (total / 1000) * CONVOY.hpPer1000);
}

/** Carico che arriverebbe adesso (in proporzione ai punti vita rimasti). */
export function convoyCargoLeft(convoy: Convoy): Partial<ResourceAmounts> {
  const k = convoy.maxHp > 0 ? Math.max(0, convoy.hp) / convoy.maxHp : 0;
  const out: Partial<ResourceAmounts> = {};
  for (const [r, v] of Object.entries(convoy.cargo)) out[r as ResourceId] = (v ?? 0) * k;
  return out;
}

function voyageAt(points: LngLat[], t: number): Voyage {
  const times = [t];
  for (let i = 1; i < points.length; i++) times.push(times[i - 1]! + (flatKm(points[i - 1]!, points[i]!) / CONVOY.kmh) * 60);
  return { points, times };
}

/**
 * Rotta del convoglio: porta d'ingresso (o punto di partenza `from`) → porto della nazione non bloccato.
 * Si provano i porti più vicini a una porta (in linea d'aria), fino a trovarne uno raggiungibile.
 */
function convoyRoute(
  map: MapData,
  s: GameState,
  nav: NavData,
  nation: NationId,
  from: LngLat | null,
): { gate: SeaGate | null; to: ProvinceId; points: LngLat[] } | null {
  const gates = nav.sea?.gates ?? [];
  const closed = blockadedPorts(map, s, nav, nation);
  const straits = closedStraits(s, nav, nation);
  const candidates: { to: ProvinceId; harbor: LngLat; gate: SeaGate | null; km: number }[] = [];
  for (const { province } of seaPorts(map, s, nation)) {
    if (closed.has(province)) continue;
    const harbor = harborOf(nav, province);
    if (!harbor) continue;
    if (from) candidates.push({ to: province, harbor, gate: null, km: flatKm(from, harbor) });
    else
      for (const gate of gates) candidates.push({ to: province, harbor, gate, km: flatKm(gate.at, harbor) });
  }
  candidates.sort((a, b) => a.km - b.km || (a.to < b.to ? -1 : 1));
  const tried = new Set<string>();
  for (const c of candidates) {
    if (tried.size >= 6) break;
    const key = `${c.gate?.id}|${c.to}`;
    if (tried.has(key)) continue;
    tried.add(key);
    const route = findSeaRoute(nav, from ?? c.gate!.at, c.harbor, { closedStraits: straits });
    if (route) return { gate: c.gate, to: c.to, points: route.points };
  }
  return null;
}

/** Partenza dei convogli del giorno (al minuto `t`): paga il carico via mare e lo mette in viaggio. Modifica `s`. */
export function dispatchConvoys(s: GameState, world: { map: MapData; nav?: NavData }, t: number): boolean {
  const { map, nav } = world;
  if (!nav || !convoysActive(nav)) return false;
  let changed = false;
  for (const [nation, n] of Object.entries(s.nations).sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (!n.imports) continue;
    const capacity = importCapacityPerDay(map, s, nation, nav);
    const flows = importFlows(map, s, nation, capacity);
    const part = seaFraction(flows, capacity);
    if (part <= 0) continue;
    const cost = flows.reduce((sum, f) => sum + f.cost * part, 0);
    const share = cost > 0 ? Math.min(1, n.stock.money / cost) : 1;
    if (share <= 0) continue;
    const route = convoyRoute(map, s, nav, nation, null);
    if (!route) continue;
    const cargo: Partial<ResourceAmounts> = {};
    for (const f of flows) cargo[f.resource] = (cargo[f.resource] ?? 0) + f.perDay * part * share;
    n.stock.money = Math.max(0, n.stock.money - cost * share);
    const hp = convoyHp(cargo);
    const fleet = newFleet(s, nation, route.points[0]!, null);
    fleet.convoy = { cargo, hp, maxHp: hp, to: route.to, gate: route.gate!.id };
    fleet.voyage = voyageAt(route.points, t);
    changed = true;
  }
  return changed;
}

/** Convoglio perso: notizia e via dalla mappa. */
export function sinkConvoy(s: GameState, nav: NavData | undefined, fleet: Fleet, by: NationId | null, t: number) {
  const at = fleetPosition(fleet, t);
  logEvent(s, { time: t, type: "convoySunk", owner: fleet.owner, by, at, zone: nav ? (seaZoneAt(nav, at)?.name ?? null) : null, cargo: fleet.convoy!.cargo });
  delete s.fleets[fleet.id];
}

/** Arrivi dei convogli al minuto `t`: consegna del carico (o nuova rotta se il porto è perso). Modifica `s`. */
export function convoyOps(s: GameState, world: { map: MapData; nav?: NavData }, t: number): boolean {
  const { map, nav } = world;
  let changed = false;
  for (const fleet of Object.values(s.fleets)) {
    const convoy = fleet.convoy;
    const v = fleet.voyage;
    if (!convoy || !v || v.times[v.times.length - 1]! > t) continue;
    const at = v.points[v.points.length - 1]!;
    fleet.position = at;
    fleet.voyage = null;
    if (s.provinces[convoy.to]?.owner === fleet.owner) {
      const stock = s.nations[fleet.owner]?.stock;
      if (stock) for (const [r, amount] of Object.entries(convoyCargoLeft(convoy))) stock[r as ResourceId] += amount ?? 0;
      delete s.fleets[fleet.id];
      changed = true;
      continue;
    }
    const route = nav ? convoyRoute(map, s, nav, fleet.owner, at) : null;
    if (route) {
      fleet.convoy = { ...convoy, to: route.to };
      fleet.voyage = voyageAt(route.points, t);
    } else sinkConvoy(s, nav, fleet, null, t);
    changed = true;
  }
  return changed;
}

/** Carico in mare della nazione (convogli in viaggio), per l'interfaccia. */
export function cargoAtSea(s: GameState, nation: NationId): { convoys: number; cargo: ResourceAmounts } {
  const cargo = Object.fromEntries(RESOURCE_IDS.map((r) => [r, 0])) as ResourceAmounts;
  let convoys = 0;
  for (const f of Object.values(s.fleets)) {
    if (f.owner !== nation || !f.convoy) continue;
    convoys++;
    for (const [r, v] of Object.entries(convoyCargoLeft(f.convoy))) cargo[r as ResourceId] += v ?? 0;
  }
  return { convoys, cargo };
}
