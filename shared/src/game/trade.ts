import { BUILDINGS } from "../data/buildings.js";
import { ECONOMY, RESOURCE_IDS, TRADE, type EconomyConfig } from "../data/economy.js";
import type { MapData, NationId, Province, ResourceId } from "../map/types.js";
import { tradeBlocked } from "./diplomacy.js";
import { emptyAmounts, productionFactor } from "./economy.js";
import { mapIndex } from "./mapIndex.js";
import type { GameState, ProvinceBuildings, ProvinceState, ResourceAmounts } from "./state.js";

// Mercato estero e carburante sintetico. Il resto del mondo non è sulla mappa ma vende risorse
// a chi può farle arrivare: via mare dalle città costiere e dai porti, via terra attraverso i vicini in pace.
// Il carburante sintetico trasforma metallo in petrolio. Entrambi agiscono a ogni tick, solo se ci sono
// le risorse per pagare (denaro) o da trasformare (metallo).

export interface ImportCapacity {
  /** Città costiere e porti. */
  sea: number;
  /** Attraverso le nazioni confinanti con cui non si è in guerra. */
  overland: number;
  total: number;
}

/** Quanto può arrivare dall'estero ogni giorno. */
export function importCapacityPerDay(map: MapData, state: GameState, nation: NationId): ImportCapacity {
  const index = mapIndex(map);
  let sea = 0;
  const neighbors = new Set<NationId>();
  for (const [id, ps] of Object.entries(state.provinces)) {
    if (ps.owner !== nation) continue;
    const province = index.provinces.get(id);
    if (!province) continue;
    if (province.coastal && province.type === "urban") sea += TRADE.portCityPerDay;
    sea += (state.buildings[id]?.port ?? 0) * TRADE.portPerLevel;
    for (const n of province.neighbors) {
      const owner = state.provinces[n.id]?.owner;
      if (owner && owner !== nation) neighbors.add(owner);
    }
  }
  const peaceful = [...neighbors].filter((other) => !tradeBlocked(state, nation, other)).length;
  const overland = Math.min(TRADE.overlandMax, peaceful * TRADE.overlandPerNeighbor);
  return { sea, overland, total: sea + overland };
}

export interface ImportFlow {
  resource: ResourceId;
  /** Quanto si è chiesto nel contratto. */
  requested: number;
  /** Quanto arriva davvero (limitato dalla capacità). */
  perDay: number;
  /** Parte a prezzo scontato (concessioni). */
  concession: number;
  /** Denaro al giorno. */
  cost: number;
}

/**
 * Importazioni di una nazione al giorno, con la capacità di adesso (prima di vedere se c'è il denaro).
 * I contratti si dividono la capacità: se non basta per tutti, ognuno arriva nella stessa proporzione.
 */
export function importFlows(map: MapData, state: GameState, nation: NationId, capacity?: ImportCapacity): ImportFlow[] {
  const contracts = state.nations[nation]?.imports ?? {};
  const requested = RESOURCE_IDS.filter((r) => (contracts[r] ?? 0) > 0 && TRADE.prices[r] !== undefined).map((r) => [r, contracts[r]!] as const);
  if (requested.length === 0) return [];
  const room = (capacity ?? importCapacityPerDay(map, state, nation)).total;
  const total = requested.reduce((sum, [, v]) => sum + v, 0);
  const share = total > room ? room / total : 1;
  const quota = map.nations.find((n) => n.id === nation)?.oilConcessionPerDay ?? 0;
  return requested.map(([resource, v]) => {
    const perDay = v * share;
    const concession = resource === "oil" ? Math.min(perDay, quota) : 0;
    const cost = concession * TRADE.concessionPrice + (perDay - concession) * TRADE.prices[resource]!;
    return { resource, requested: v, perDay, concession, cost };
  });
}

/** Carburante sintetico di una provincia al giorno: metallo consumato e petrolio prodotto. */
export function syntheticPerDay(
  province: Province,
  state: ProvinceState,
  buildings: ProvinceBuildings = {},
  economy: EconomyConfig = ECONOMY,
): { metal: number; oil: number } {
  const level = buildings.syntheticFuel ?? 0;
  if (level === 0) return { metal: 0, oil: 0 };
  const factor = productionFactor(province, state, economy);
  return { metal: level * BUILDINGS.syntheticMetalPerLevel * factor, oil: level * BUILDINGS.syntheticOilPerLevel * factor };
}

/** Saldo al giorno di importazioni e carburante sintetico (se ci sono denaro e metallo a sufficienza). */
export function tradePerDay(map: MapData, state: GameState, nation: NationId, economy: EconomyConfig = ECONOMY): ResourceAmounts {
  const out = emptyAmounts();
  for (const flow of importFlows(map, state, nation)) {
    out[flow.resource] += flow.perDay;
    out.money -= flow.cost;
  }
  for (const province of map.provinces) {
    const ps = state.provinces[province.id];
    if (ps?.owner !== nation) continue;
    const s = syntheticPerDay(province, ps, state.buildings[province.id], economy);
    out.metal -= s.metal;
    out.oil += s.oil;
  }
  return out;
}

/**
 * Un tick di commercio e trasformazioni per tutte le nazioni (modifica `s` sul posto):
 * prima il carburante sintetico (fin dove basta il metallo), poi le importazioni (fin dove basta il denaro).
 */
export function applyTradeTick(s: GameState, map: MapData, ticksPerDay: number, economy: EconomyConfig = ECONOMY) {
  const synthetic = new Map<NationId, { metal: number; oil: number }>();
  for (const province of map.provinces) {
    const ps = s.provinces[province.id];
    const level = s.buildings[province.id]?.syntheticFuel;
    if (!ps || !level) continue;
    const d = syntheticPerDay(province, ps, s.buildings[province.id], economy);
    const total = synthetic.get(ps.owner) ?? { metal: 0, oil: 0 };
    synthetic.set(ps.owner, { metal: total.metal + d.metal, oil: total.oil + d.oil });
  }
  for (const [nation, d] of synthetic) {
    const stock = s.nations[nation]?.stock;
    if (!stock || d.metal <= 0) continue;
    const share = Math.min(1, stock.metal / (d.metal / ticksPerDay));
    stock.metal -= (d.metal / ticksPerDay) * share;
    stock.oil += (d.oil / ticksPerDay) * share;
  }

  for (const [nation, n] of Object.entries(s.nations)) {
    if (!n.imports) continue;
    for (const flow of importFlows(map, s, nation)) {
      const cost = flow.cost / ticksPerDay;
      if (cost <= 0) continue;
      const share = Math.min(1, n.stock.money / cost);
      n.stock.money = Math.max(0, n.stock.money - cost * share);
      n.stock[flow.resource] += (flow.perDay / ticksPerDay) * share;
    }
  }
}

/** Le risorse che si possono comprare all'estero. */
export const TRADABLE: readonly ResourceId[] = RESOURCE_IDS.filter((r) => TRADE.prices[r] !== undefined);
