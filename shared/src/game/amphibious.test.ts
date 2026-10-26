import { describe, expect, it } from "vitest";
import { NAVAL } from "../data/naval.js";
import { UNIT_TYPES, type UnitTypeId } from "../data/units.js";
import type { LngLat } from "../map/types.js";
import { flatKm } from "../nav/grid.js";
import { pairKey } from "./diplomacy.js";
import { advance, createGame } from "./engine.js";
import { newFleet, newShip } from "./navy.js";
import { applyOrder } from "./orders.js";
import type { GameState } from "./state.js";
import { cell, testWorld } from "./testMaps.js";

// Trasporti e sbarchi. B1 (colonne 15-19, di BBB) ha l'approdo in (20, 2); l'isola A9 (colonna 22, di AAA) si raggiunge solo per mare.
const world = testWorld();

function newGame(): GameState {
  return { ...createGame(world.map, { playerNation: "BBB", realNowMs: 0, seed: 0 }), armies: {} };
}

function army(game: GameState, id: string, owner: string, at: LngLat, types: UnitTypeId[]) {
  game.armies[id] = {
    id,
    owner,
    units: types.map((type, i) => ({ id: `${id}-${i}`, type, hp: UNIT_TYPES[type].hp })),
    position: at,
    move: null,
    attacking: false,
    halted: null,
    assault: false,
    useRail: false,
    departure: null,
    task: null,
  };
}

function sendToIsland(game: GameState): GameState {
  const r = applyOrder(game, world, "BBB", { type: "move", army: "b", target: cell(22, 2) });
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

const transportOf = (game: GameState) => Object.values(game.fleets).find((f) => f.transport);

describe("trasporti e sbarchi", () => {
  it("una meta oltre il mare: marcia al porto, imbarco, navigazione, sbarco, poi a piedi fino alla meta", () => {
    let game = newGame();
    army(game, "b", "BBB", cell(17, 2), ["infantry", "infantry"]);
    game = sendToIsland(game);
    expect(game.armies.b!.seaPlan?.embark).toBe("B1");

    game = advance(game, world, 4 * 60); // ~22 km a piedi fino alla costa, poi l'imbarco
    const boarding = transportOf(game)!;
    expect(game.armies.b).toBeUndefined();
    expect(boarding.transport!.phase).toBe("boarding");
    expect(boarding.transport!.army.units).toHaveLength(2);

    game = advance(game, world, 12 * 60);
    expect(transportOf(game)).toBeUndefined();
    expect(game.armies.b).toBeDefined();
    expect(flatKm(game.armies.b!.position, cell(22, 2))).toBeLessThan(1);
    expect(game.events.some((e) => e.type === "landing" && e.province === "A9")).toBe(true);
  });

  it("lo sbarco su una costa difesa costa caro: i difensori sparano senza risposta", () => {
    let game = newGame();
    game.relations[pairKey("AAA", "BBB")] = { war: true, warSince: 0, passage: false, sharedVision: false };
    army(game, "b", "BBB", cell(17, 2), ["infantry", "infantry"]);
    army(game, "def", "AAA", cell(22, 2), ["infantry", "infantry", "infantry"]);
    game = sendToIsland(game);
    // Si ferma a sbarco in corso e confronta con lo stesso viaggio senza difensori.
    let free = newGame();
    army(free, "b", "BBB", cell(17, 2), ["infantry", "infantry"]);
    free = sendToIsland(free);
    for (let t = 60; t <= 16 * 60; t += 60) {
      game = advance(game, world, t);
      free = advance(free, world, t);
      if (transportOf(game)?.transport?.phase === "landing" && transportOf(game)!.transport!.until - t <= NAVAL.landMinutes - 60) break;
    }
    const hp = (g: GameState) => transportOf(g)?.transport?.army.units.reduce((n, u) => n + u.hp, 0) ?? 0;
    expect(transportOf(game)?.transport?.phase).toBe("landing");
    expect(hp(game)).toBeLessThan(hp(free));
    expect(game.armies.def!.units.reduce((n, u) => n + u.hp, 0)).toBe(3 * UNIT_TYPES.infantry.hp);
  });

  it("in mare il trasporto è vulnerabile: una flotta nemica lo affonda con le truppe a bordo", () => {
    let game = newGame();
    game.relations[pairKey("AAA", "BBB")] = { war: true, warSince: 0, passage: false, sharedVision: false };
    army(game, "b", "BBB", cell(17, 2), ["infantry"]);
    const enemy = newFleet(game, "AAA", cell(21, 0), null);
    enemy.ships.push(newShip(game, "battleship"), newShip(game, "cruiser"));
    game = sendToIsland(game);
    game = advance(game, world, 16 * 60);
    expect(game.armies.b).toBeUndefined();
    expect(transportOf(game)).toBeUndefined();
    expect(game.events.some((e) => e.type === "armyDestroyed" && e.owner === "BBB")).toBe(true);
  });

  it("senza un porto da cui partire la meta non si raggiunge", () => {
    const game = newGame();
    army(game, "a", "AAA", cell(2, 2), ["infantry"]);
    const r = applyOrder(game, world, "AAA", { type: "move", army: "a", target: cell(22, 2) });
    expect(r.ok).toBe(false);
  });
});
