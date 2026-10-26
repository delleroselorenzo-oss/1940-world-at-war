import { describe, expect, it } from "vitest";
import { SHIP_TYPES } from "../data/naval.js";
import { flatKm } from "../nav/grid.js";
import { pairKey } from "./diplomacy.js";
import { nationUpkeepPerDay } from "./economy.js";
import { advance, createGame } from "./engine.js";
import { fleetPosition, newFleet, newShip } from "./navy.js";
import { applyOrder } from "./orders.js";
import type { GameState } from "./state.js";
import { cell, testWorld } from "./testMaps.js";
import { visionOf } from "./vision.js";

// Mondo di prova: il mare sono le colonne 20-21; approdi di B1 (20, 2) e di A9 (21, 2).
const world = testWorld();

function newGame(player = "BBB"): GameState {
  const game = { ...createGame(world.map, { playerNation: player, realNowMs: 0, seed: 0 }), armies: {} };
  game.nations.BBB!.stock = { food: 1e6, goods: 1e6, metal: 1e6, oil: 1e6, money: 1e6, manpower: 1e6 };
  return game;
}

function order(state: GameState, nation: string, o: Parameters<typeof applyOrder>[3]): GameState {
  const r = applyOrder(state, world, nation, o);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

describe("marina", () => {
  it("le navi si costruiscono nel cantiere navale ed escono nel porto della città", () => {
    let game = newGame();
    expect(applyOrder(game, world, "BBB", { type: "recruit", province: "B1", unitType: "destroyer" }).ok).toBe(false); // manca il cantiere
    game.buildings.B1 = { ...game.buildings.B1, shipyard: 1 };
    game = order(game, "BBB", { type: "recruit", province: "B1", unitType: "destroyer" });
    game = order(game, "BBB", { type: "recruit", province: "B1", unitType: "submarine" });
    game = advance(game, world, 60 * 60);
    const fleets = Object.values(game.fleets);
    expect(fleets).toHaveLength(1);
    expect(fleets[0]!.port).toBe("B1");
    expect(fleets[0]!.position).toEqual(cell(20, 2));
    expect(fleets[0]!.ships.map((s) => s.type)).toEqual(["destroyer", "submarine"]);
  });

  it("naviga alla velocità della nave più lenta e si ormeggia solo nei porti amici", () => {
    let game = newGame();
    const fleet = newFleet(game, "BBB", cell(20, 0), null);
    fleet.ships.push(newShip(game, "destroyer"), newShip(game, "battleship"));
    game = order(game, "BBB", { type: "sail", fleet: fleet.id, target: cell(21, 2) });
    const minutes = (flatKm(cell(20, 0), cell(21, 2)) / SHIP_TYPES.battleship.speedKmh) * 60;
    expect(fleetPosition(game.fleets[fleet.id]!, minutes / 2)[1]).toBeLessThan(cell(20, 0)[1]);
    game = advance(game, world, Math.ceil(minutes));
    expect(game.fleets[fleet.id]!.voyage).toBeNull();
    expect(game.fleets[fleet.id]!.position).toEqual(cell(21, 2));
    expect(game.fleets[fleet.id]!.port).toBeNull(); // A9 è di AAA, senza accordi

    game.relations[pairKey("AAA", "BBB")] = { war: false, passage: true, sharedVision: false };
    game = order(game, "BBB", { type: "sail", fleet: fleet.id, target: cell(21, 2) });
    game = advance(game, world, game.time + 5);
    expect(game.fleets[fleet.id]!.port).toBe("A9");
  });

  it("le flotte nello stesso porto si uniscono", () => {
    let game = newGame();
    const a = newFleet(game, "BBB", cell(20, 2), "B1");
    a.ships.push(newShip(game, "cruiser"));
    const b = newFleet(game, "BBB", cell(21, 4), null);
    b.ships.push(newShip(game, "destroyer"));
    game = order(game, "BBB", { type: "sail", fleet: b.id, target: cell(20, 2) });
    game = advance(game, world, 24 * 60);
    expect(Object.keys(game.fleets)).toEqual([a.id]);
    expect(game.fleets[a.id]!.ships).toHaveLength(2);
  });

  it("in mare aperto si unisce alla flotta ferma entro 5 km", () => {
    let game = newGame();
    const a = newFleet(game, "BBB", cell(20, 0), null);
    a.ships.push(newShip(game, "cruiser"));
    const b = newFleet(game, "BBB", cell(21, 4), null);
    b.ships.push(newShip(game, "destroyer"));
    game = order(game, "BBB", { type: "sail", fleet: b.id, target: [cell(20, 0)[0] + 0.02, cell(20, 0)[1]] }); // a circa 2 km
    game = advance(game, world, 24 * 60);
    expect(Object.keys(game.fleets)).toEqual([a.id]);
    expect(game.fleets[a.id]!.ships).toHaveLength(2);
  });

  it("non va per terra e si ferma a comando", () => {
    let game = newGame();
    const fleet = newFleet(game, "BBB", cell(20, 0), null);
    fleet.ships.push(newShip(game, "submarine"));
    expect(applyOrder(game, world, "BBB", { type: "sail", fleet: fleet.id, target: cell(5, 2) }).ok).toBe(false);
    game = order(game, "BBB", { type: "sail", fleet: fleet.id, target: cell(20, 4) });
    game = advance(game, world, 20);
    game = order(game, "BBB", { type: "stopFleet", fleet: fleet.id });
    const stopped = game.fleets[fleet.id]!;
    expect(stopped.voyage).toBeNull();
    expect(stopped.position[1]).toBeLessThan(cell(20, 0)[1]);
    expect(stopped.position[1]).toBeGreaterThan(cell(20, 4)[1]);
  });

  it("costa il mantenimento e vede intorno a sé", () => {
    const game = newGame("AAA");
    const mine = newFleet(game, "AAA", cell(21, 0), null);
    mine.ships.push(newShip(game, "cruiser")); // vede 30 km
    const enemy = newFleet(game, "BBB", cell(20, 4), null); // a circa 45 km
    enemy.ships.push(newShip(game, "destroyer"));
    expect(nationUpkeepPerDay(game, "AAA").oil).toBe(SHIP_TYPES.cruiser.upkeepPerDay.oil);
    expect(visionOf(game, world, "AAA").fleets.has(enemy.id)).toBe(false);
    enemy.position = cell(20, 2); // a circa 25 km
    expect(visionOf(game, world, "AAA").fleets.has(enemy.id)).toBe(true);
  });
});
