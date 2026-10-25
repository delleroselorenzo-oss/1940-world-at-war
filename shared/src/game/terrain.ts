import { TERRAIN_EFFECTS, TERRAINS } from "../data/terrain.js";
import { UNIT_TYPES, type UnitTypeId } from "../data/units.js";
import type { LngLat, Terrain } from "../map/types.js";
import { cellAt } from "../nav/grid.js";
import type { NavData } from "../nav/types.js";
import type { Army } from "./state.js";

// Terreno sotto le armate: rallenta la marcia e cambia la forza in combattimento (valori in data/terrain.ts).

/** Terreno della cella, o null se la rete non ha il terreno (mappe di prova) o la cella è fuori mappa: nessun effetto. */
export function cellTerrain(nav: NavData, cell: number): Terrain | null {
  const t = cell >= 0 ? nav.grid.terrain?.[cell] : undefined;
  return t === undefined ? null : (TERRAINS[t] ?? null);
}

/** Terreno nel punto (null = sconosciuto, nessun effetto). */
export function terrainAt(nav: NavData | undefined, at: LngLat): Terrain | null {
  return nav ? cellTerrain(nav, cellAt(nav, at)) : null;
}

/** Moltiplicatore della forza (attacco e difesa) di un'unità sul terreno. */
export function terrainStrength(type: UnitTypeId, terrain: Terrain | null): number {
  return terrain ? TERRAIN_EFFECTS[type][terrain].strength : 1;
}

/**
 * Velocità dell'armata su ogni terreno, come frazione di quella in pianura: su ogni terreno
 * conta l'unità più lenta lì (in montagna un carro può rallentare più della fanteria).
 */
export function armyTerrainSpeeds(army: Army): Record<Terrain, number> {
  return terrainSpeeds(army.units.map((u) => u.type));
}

export function terrainSpeeds(types: UnitTypeId[]): Record<Terrain, number> {
  const out = {} as Record<Terrain, number>;
  if (types.length === 0) {
    for (const t of TERRAINS) out[t] = 1;
    return out;
  }
  const base = Math.min(...types.map((u) => UNIT_TYPES[u].speedKmh));
  for (const t of TERRAINS) out[t] = Math.min(...types.map((u) => UNIT_TYPES[u].speedKmh * TERRAIN_EFFECTS[u][t].speed)) / base;
  return out;
}
