import { describe, expect, it } from "vitest";
import { MOVEMENT } from "../data/movement.js";
import { roadSpeedFactor, TERRAIN_EFFECTS, TERRAINS } from "../data/terrain.js";
import { UNIT_TYPES } from "../data/units.js";
import type { Terrain } from "../map/types.js";
import { flatKm } from "../nav/grid.js";
import { armyDamage } from "./combat.js";
import { createGame } from "./engine.js";
import { arrivalTime } from "./movement.js";
import { applyOrder } from "./orders.js";
import type { Army } from "./state.js";
import { terrainAt, terrainSpeeds } from "./terrain.js";
import { cell, testWorld } from "./testMaps.js";

/** Mondo di prova con tutto il terreno uguale a `terrain`. */
function worldOn(terrain: Terrain) {
  const world = testWorld();
  world.nav!.grid.terrain = new Uint8Array(world.nav!.grid.province.length).fill(TERRAINS.indexOf(terrain));
  return world;
}

/** Minuti che l'armata della capitale di AAA (fanteria e artiglieria) impiega ad andare a `target`. */
function marchMinutes(terrain: Terrain, target: [number, number]) {
  const world = worldOn(terrain);
  const game = createGame(world.map, { playerNation: "AAA", realNowMs: 0 });
  const center = world.map.provinces.find((p) => p.id === "A1")!.center;
  const army = Object.values(game.armies).find((a) => a.owner === "AAA" && flatKm(a.position, center) < 1)!;
  const r = applyOrder(game, world, "AAA", { type: "move", army: army.id, target });
  if (!r.ok) throw new Error(r.error);
  return { minutes: arrivalTime(r.state.armies[army.id]!)!, km: flatKm(army.position, target), army };
}

describe("terreno", () => {
  it("l'armata va alla velocità dell'unità più lenta su quel terreno", () => {
    // In montagna la fanteria (20 × 0,65 = 13 km/h) è più veloce dell'artiglieria (18 × 0,55 = 9,9 km/h).
    const speeds = terrainSpeeds(["infantry", "artillery"]);
    expect(speeds.mountains).toBeCloseTo((UNIT_TYPES.artillery.speedKmh * TERRAIN_EFFECTS.artillery.mountains.speed) / UNIT_TYPES.artillery.speedKmh);
    // Un carro leggero con la fanteria: in pianura conta la fanteria (20 km/h), in foresta la più lenta lì.
    const mixed = terrainSpeeds(["infantry", "lightTank"]);
    expect(mixed.plains).toBe(1);
    expect(mixed.forest).toBeCloseTo(Math.min(20 * 0.8, 30 * 0.6) / 20);
  });

  it("fuori strada il terreno rallenta per intero", () => {
    const target = cell(2, 0); // due celle a nord della capitale, senza strada
    const plains = marchMinutes("plains", target);
    const mountains = marchMinutes("mountains", target);
    const speed = UNIT_TYPES.artillery.speedKmh * MOVEMENT.offRoadFactor;
    expect(plains.minutes).toBeCloseTo((plains.km / speed) * 60, 5);
    expect(mountains.minutes).toBeCloseTo((mountains.km / (speed * TERRAIN_EFFECTS.artillery.mountains.speed)) * 60, 5);
  });

  it("su strada il calo è a metà", () => {
    const target = cell(4, 2); // lungo la strada della riga 2
    const plains = marchMinutes("plains", target);
    const mountains = marchMinutes("mountains", target);
    expect(mountains.minutes / plains.minutes).toBeCloseTo(1 / roadSpeedFactor(TERRAIN_EFFECTS.artillery.mountains.speed), 5);
  });

  it("la forza dell'unità cambia con il terreno; senza dati sul terreno non cambia", () => {
    const army: Army = {
      ...Object.values(createGame(testWorld().map, { playerNation: "AAA", realNowMs: 0 }).armies)[0]!,
      units: [{ id: "u", type: "infantry", hp: 10 }],
    };
    const base = armyDamage(army, "soft", false);
    expect(armyDamage(army, "soft", false, "mountains")).toBeCloseTo(base * TERRAIN_EFFECTS.infantry.mountains.strength);
    expect(armyDamage(army, "soft", false, "urban")).toBeCloseTo(base * 1.25);
    expect(terrainAt(testWorld().nav, cell(1, 1))).toBeNull();
    expect(terrainAt(worldOn("forest").nav, cell(1, 1))).toBe("forest");
  });
});
