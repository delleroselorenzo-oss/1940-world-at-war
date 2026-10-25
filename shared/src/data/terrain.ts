import type { Terrain } from "../map/types.js";
import type { UnitTypeId } from "./units.js";

// Terreni ed effetti sulle unità (docs/game-design.md, §9 "Terreno").
// Ogni provincia ha un solo terreno; nelle province urbane la zona intorno alla città è "Città".

/** Ordine dei terreni: l'indice è il valore salvato nella griglia della rete di movimento (`grid.terrain`). */
export const TERRAINS: readonly Terrain[] = ["plains", "hills", "forest", "mountains", "urban"];

export const TERRAIN_NAMES: Record<Terrain, string> = {
  urban: "Città",
  plains: "Pianura",
  hills: "Collina",
  forest: "Foresta",
  mountains: "Montagna",
};

/** Effetto di un terreno su un'unità: velocità (frazione di quella normale) e forza (moltiplica attacco e difesa). */
export interface TerrainEffect {
  speed: number;
  strength: number;
}

type Row = Record<Terrain, TerrainEffect>;

const e = (speed: number, strength: number): TerrainEffect => ({ speed, strength });

const FOOT: Row = { urban: e(1, 1.25), plains: e(1, 1), hills: e(0.85, 1.15), forest: e(0.8, 1.2), mountains: e(0.65, 1.3) };
const TOWED = { urban: 1, plains: 1, hills: 0.8, forest: 0.7, mountains: 0.55 };
const towed = (strength: Record<Terrain, number>): Row => ({
  urban: e(TOWED.urban, strength.urban),
  plains: e(TOWED.plains, strength.plains),
  hills: e(TOWED.hills, strength.hills),
  forest: e(TOWED.forest, strength.forest),
  mountains: e(TOWED.mountains, strength.mountains),
});

export const TERRAIN_EFFECTS: Record<UnitTypeId, Row> = {
  infantry: FOOT,
  engineer: FOOT,
  medic: FOOT,
  motorized: { urban: e(1, 1.1), plains: e(1, 1), hills: e(0.8, 1.1), forest: e(0.7, 1.1), mountains: e(0.55, 1.15) },
  armoredCar: { urban: e(0.9, 0.75), plains: e(1, 1.1), hills: e(0.75, 0.9), forest: e(0.55, 0.75), mountains: e(0.45, 0.65) },
  lightTank: { urban: e(0.85, 0.8), plains: e(1, 1.15), hills: e(0.8, 1), forest: e(0.6, 0.8), mountains: e(0.5, 0.7) },
  heavyTank: { urban: e(0.8, 0.8), plains: e(1, 1.1), hills: e(0.75, 1), forest: e(0.55, 0.75), mountains: e(0.4, 0.65) },
  artillery: towed({ urban: 0.85, plains: 1.1, hills: 1.1, forest: 0.85, mountains: 1 }),
  antiTank: towed({ urban: 1.15, plains: 1, hills: 1.1, forest: 1.15, mountains: 1.1 }),
  antiAircraft: towed({ urban: 1, plains: 1, hills: 1, forest: 0.9, mountains: 0.9 }),
};

export const TERRAIN_RULES = {
  /** Raggio in km della zona di città intorno al centro di una provincia urbana. */
  cityRadiusKm: 10,
  /** Su strada il calo di velocità dovuto al terreno vale solo per questa frazione (il treno non cambia). */
  roadPenaltyShare: 0.5,
  /** Gli attacchi aerei su un'armata in foresta fanno questa frazione del danno (nel bosco si vede poco). */
  airVsForest: 0.75,
} as const;

/** Moltiplicatore di velocità su strada, dato quello fuori strada. */
export function roadSpeedFactor(offRoad: number): number {
  return 1 - (1 - offRoad) * TERRAIN_RULES.roadPenaltyShare;
}
