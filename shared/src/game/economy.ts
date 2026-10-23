import { BUILDINGS } from "../data/buildings.js";
import { ECONOMY, RESOURCE_IDS, type EconomyConfig } from "../data/economy.js";
import { UNIT_TYPES } from "../data/units.js";
import type { MapData, NationId, Province, ResourceId } from "../map/types.js";
import type { GameState, ProvinceBuildings, ProvinceState, ResourceAmounts } from "./state.js";

export function emptyAmounts(): ResourceAmounts {
  return Object.fromEntries(RESOURCE_IDS.map((r) => [r, 0])) as ResourceAmounts;
}

function addPartial(target: ResourceAmounts, amounts: Partial<Record<ResourceId, number>>, factor = 1) {
  for (const [r, v] of Object.entries(amounts)) target[r as ResourceId] += (v ?? 0) * factor;
}

/** Produzione giornaliera di una provincia, dato il suo stato attuale e i suoi edifici. */
export function provinceProductionPerDay(
  province: Province,
  state: ProvinceState,
  buildings: ProvinceBuildings = {},
  economy: EconomyConfig = ECONOMY,
): ResourceAmounts {
  const out = emptyAmounts();
  const rates = economy.perDay;
  const people = province.population;
  const development = province.gdpPerCapita / 1000;
  out.manpower = people * rates.manpowerPerThousand;
  out.money = people * development * rates.moneyPerThousand;
  if (province.resource === "oil") out.oil = state.wellsSabotaged ? 0 : (province.oilMtPerYear ?? 0) * rates.oilPerMt;
  else if (province.resource === "food") out.food = Math.max(rates.mainMinimum, people * Math.sqrt(development) * rates.foodPerThousand);
  else if (province.resource) out[province.resource] = Math.max(rates.mainMinimum, people * development * rates.industryPerThousand);

  // Industria: più risorsa principale (o denaro); ufficio di reclutamento: più manodopera.
  out[province.resource ?? "money"] *= 1 + BUILDINGS.industryBonusPerLevel * (buildings.industry ?? 0);
  out.manpower *= 1 + BUILDINGS.recruitmentBonusPerLevel * (buildings.recruitmentOffice ?? 0);

  const factor = productionFactor(province, state, economy);
  for (const r of RESOURCE_IDS) out[r] *= factor;
  return out;
}

/** Le province conquistate rendono meno; il morale moltiplica tutto. */
export function productionFactor(province: Province, state: ProvinceState, economy: EconomyConfig = ECONOMY): number {
  const core = state.owner === province.nation;
  return (core ? 1 : economy.nonCoreFactor) * (state.morale / 100);
}

/** Produzione giornaliera totale di una nazione, sommando le province che possiede. */
export function nationProductionPerDay(map: MapData, state: GameState, nation: NationId, economy: EconomyConfig = ECONOMY): ResourceAmounts {
  const total = emptyAmounts();
  for (const province of map.provinces) {
    const ps = state.provinces[province.id];
    if (!ps || ps.owner !== nation) continue;
    addPartial(total, provinceProductionPerDay(province, ps, state.buildings[province.id], economy));
  }
  return total;
}

/** Consumo giornaliero delle unità di una nazione. */
export function nationUpkeepPerDay(state: GameState, nation: NationId): ResourceAmounts {
  const total = emptyAmounts();
  for (const army of Object.values(state.armies)) {
    if (army.owner !== nation) continue;
    for (const unit of army.units) addPartial(total, UNIT_TYPES[unit.type].upkeepPerDay);
  }
  return total;
}

/** Saldo giornaliero (produzione − mantenimento) di tutte le nazioni, in un solo passaggio. */
export function netPerDayByNation(map: MapData, state: GameState, economy: EconomyConfig = ECONOMY): Map<NationId, ResourceAmounts> {
  const out = new Map<NationId, ResourceAmounts>();
  for (const id of Object.keys(state.nations)) out.set(id, emptyAmounts());
  for (const province of map.provinces) {
    const ps = state.provinces[province.id];
    const total = ps && out.get(ps.owner);
    if (total) addPartial(total, provinceProductionPerDay(province, ps, state.buildings[province.id], economy));
  }
  for (const army of Object.values(state.armies)) {
    const total = out.get(army.owner);
    if (total) for (const unit of army.units) addPartial(total, UNIT_TYPES[unit.type].upkeepPerDay, -1);
  }
  return out;
}

export function canAfford(stock: ResourceAmounts, cost: Partial<Record<ResourceId, number>>): boolean {
  return Object.entries(cost).every(([r, v]) => stock[r as ResourceId] >= (v ?? 0));
}

export function pay(stock: ResourceAmounts, cost: Partial<Record<ResourceId, number>>): void {
  addPartial(stock, cost, -1);
}

/** Restituisce risorse già pagate (ordine annullato). */
export function refund(stock: ResourceAmounts, cost: Partial<Record<ResourceId, number>>): void {
  addPartial(stock, cost);
}
