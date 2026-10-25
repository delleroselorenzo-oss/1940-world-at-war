import { BUILDING_IDS, BUILDING_TYPES, BUILDINGS, type BuildingId } from "../data/buildings.js";
import { productionType, type ProducibleId } from "../data/air.js";
import type { NationId, Province, ProvinceId, ResourceId } from "../map/types.js";
import { canAfford } from "./economy.js";
import type { GameState, ProvinceBuildings } from "./state.js";

// Edifici delle province: cosa si può costruire, quanto costa, che effetto hanno.
// Gli edifici "del genio" (fortificazioni, aeroporto, porto) si fanno con i lavori di un'armata (works.ts).

export function buildingLevel(state: GameState, provinceId: ProvinceId, building: BuildingId): number {
  return state.buildings[provinceId]?.[building] ?? 0;
}

/** Costo del livello indicato: il livello n costa n volte il livello 1. */
export function buildingCost(building: BuildingId, level: number): Partial<Record<ResourceId, number>> {
  return Object.fromEntries(Object.entries(BUILDING_TYPES[building].cost).map(([r, v]) => [r, (v ?? 0) * level]));
}

/** Durata in minuti del livello indicato (senza il genio). */
export function buildingMinutes(building: BuildingId, level: number): number {
  return BUILDING_TYPES[building].hours * 60 * level;
}

/** L'edificio può stare in questa provincia? (città o no, costa o no) */
export function allowedIn(building: BuildingId, province: Province): boolean {
  const type = BUILDING_TYPES[building];
  return (type.where === "any" || province.type === "urban") && (!type.coastal || province.coastal);
}

export interface BuildOption {
  building: BuildingId;
  /** Livello che si costruirebbe (1 = nuovo edificio). */
  level: number;
  cost: Partial<Record<ResourceId, number>>;
  minutes: number;
  /** Perché non si può adesso (null = si può). */
  missing: string | null;
}

/** Edifici che la provincia può costruire da sé (non quelli del genio), con il prossimo livello. */
export function buildOptions(state: GameState, province: Province, nation: NationId): BuildOption[] {
  const mine = state.provinces[province.id]?.owner === nation;
  const busy = state.construction[province.id] !== undefined;
  const stock = state.nations[nation]?.stock;
  return BUILDING_IDS.filter((b) => !BUILDING_TYPES[b].byEngineers && allowedIn(b, province)).map((b) => {
    const current = buildingLevel(state, province.id, b);
    const max = current >= BUILDING_TYPES[b].maxLevel;
    const level = max ? current : current + 1;
    const cost = buildingCost(b, level);
    const missing = !mine
      ? "Non è una tua provincia."
      : max
        ? "Livello massimo."
        : busy
          ? "C'è già una costruzione in corso."
          : !stock || !canAfford(stock, cost)
            ? "Risorse insufficienti."
            : null;
    return {
      building: b,
      level,
      cost,
      minutes: buildingMinutes(b, level),
      missing,
    };
  });
}

/** Perché l'unità non si può arruolare nella provincia (null = si può). */
export function recruitMissing(state: GameState, provinceId: ProvinceId, unitType: ProducibleId): string | null {
  const building = productionType(unitType).building;
  return buildingLevel(state, provinceId, building) > 0 ? null : `Serve: ${BUILDING_TYPES[building].name}.`;
}

/** Minuti per arruolare l'unità nella provincia: ogni livello dell'edificio oltre il primo accorcia i tempi. */
export function recruitMinutes(state: GameState, provinceId: ProvinceId, unitType: ProducibleId): number {
  const type = productionType(unitType);
  const level = Math.max(1, buildingLevel(state, provinceId, type.building));
  return Math.round(type.productionHours * 60 * (1 - BUILDINGS.productionTimeCutPerLevel * (level - 1)));
}

/** Frazione del danno subito da un'armata che difende in una provincia fortificata della sua nazione. */
export function fortDamageFactor(state: GameState, provinceId: ProvinceId | null, owner: NationId): number {
  if (!provinceId || state.provinces[provinceId]?.owner !== owner) return 1;
  return 1 - BUILDINGS.fortDefensePerLevel * buildingLevel(state, provinceId, "fortifications");
}

/** Edifici dopo un cambio di padrone: ognuno perde dei livelli, chi arriva a zero è distrutto. */
export function downgradeBuildings(buildings: ProvinceBuildings | undefined): ProvinceBuildings | undefined {
  if (!buildings) return undefined;
  const out: ProvinceBuildings = {};
  for (const [b, level] of Object.entries(buildings) as [BuildingId, number][]) {
    const next = level - BUILDINGS.conquestLevelLoss;
    if (next > 0) out[b] = next;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
