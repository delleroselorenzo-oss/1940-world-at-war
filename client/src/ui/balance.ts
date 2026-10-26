import {
  emptyAmounts,
  importFlows,
  nationProductionPerDay,
  nationUpkeepPerDay,
  syntheticPerDay,
  type GameState,
  type MapData,
  type NavData,
  type ResourceAmounts,
  type ResourceId,
} from "@waw/shared";

/** Entrate e uscite giornaliere di una risorsa, voce per voce. */
export interface ResourceBalance {
  /** Prodotto dalle province. */
  provinces: number;
  /** Comprato dal mercato estero. */
  imports: number;
  /** Petrolio dagli impianti di carburante sintetico. */
  synthetic: number;
  /** Mantenimento delle unità. */
  upkeep: number;
  /** Denaro speso per le importazioni. */
  importCost: number;
  /** Metallo consumato dagli impianti di carburante sintetico. */
  syntheticUse: number;
}

/** Con `nav` le importazioni tengono conto dei porti bloccati (i convogli ne portano la media al giorno). */
export function nationBalance(map: MapData, state: GameState, nation: string, nav?: NavData): Record<ResourceId, ResourceBalance> {
  const production = nationProductionPerDay(map, state, nation);
  const upkeep = nationUpkeepPerDay(state, nation);
  const imports = emptyAmounts();
  let importCost = 0;
  for (const flow of importFlows(map, state, nation, undefined, nav)) {
    imports[flow.resource] += flow.perDay;
    importCost += flow.cost;
  }
  let syntheticOil = 0;
  let syntheticMetal = 0;
  for (const province of map.provinces) {
    const ps = state.provinces[province.id];
    if (ps?.owner !== nation) continue;
    const s = syntheticPerDay(province, ps, state.buildings[province.id]);
    syntheticOil += s.oil;
    syntheticMetal += s.metal;
  }
  const out = {} as Record<ResourceId, ResourceBalance>;
  for (const r of Object.keys(production) as ResourceId[]) {
    out[r] = {
      provinces: production[r],
      imports: imports[r],
      synthetic: r === "oil" ? syntheticOil : 0,
      upkeep: upkeep[r],
      importCost: r === "money" ? importCost : 0,
      syntheticUse: r === "metal" ? syntheticMetal : 0,
    };
  }
  return out;
}

export const income = (b: ResourceBalance) => b.provinces + b.imports + b.synthetic;
export const expenses = (b: ResourceBalance) => b.upkeep + b.importCost + b.syntheticUse;

/** Saldo giornaliero di tutte le risorse. */
export function netAmounts(balance: Record<ResourceId, ResourceBalance>): ResourceAmounts {
  return Object.fromEntries(Object.entries(balance).map(([r, b]) => [r, income(b) - expenses(b)])) as ResourceAmounts;
}
