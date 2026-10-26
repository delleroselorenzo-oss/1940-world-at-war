import { describe, expect, it } from "vitest";
import { SHIP_TYPES, type ShipTypeId } from "../data/naval.js";
import { UNIT_TYPES, type UnitTypeId } from "../data/units.js";
import type { LngLat } from "../map/types.js";
import { pairKey } from "./diplomacy.js";
import { advance, createGame } from "./engine.js";
import { newFleet, newShip } from "./navy.js";
import type { Fleet, GameState } from "./state.js";
import { cell, testWorld } from "./testMaps.js";

// Mondo di prova: il mare sono le colonne 20-21 (celle da circa 11 km); B1 (colonne 15-19) è di BBB.
const world = testWorld();

function newGame(war = true): GameState {
  const game = { ...createGame(world.map, { playerNation: "AAA", realNowMs: 0, seed: 0 }), armies: {} };
  if (war) game.relations[pairKey("AAA", "BBB")] = { war: true, warSince: 0, passage: false, sharedVision: false };
  return game;
}

function fleet(game: GameState, owner: string, at: LngLat, types: ShipTypeId[], port: string | null = null): Fleet {
  const f = newFleet(game, owner, at, port);
  f.ships.push(...types.map((t) => newShip(game, t)));
  return f;
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

const hp = (game: GameState, id: string) => game.fleets[id]?.ships.reduce((n, s) => n + s.hp, 0) ?? 0;

describe("combattimento navale", () => {
  it("le flotte in guerra si colpiscono entro la gittata; la nave da battaglia affonda il cacciatorpediniere", () => {
    let game = newGame();
    const big = fleet(game, "AAA", cell(20, 0), ["battleship"]);
    const small = fleet(game, "BBB", cell(20, 2), ["destroyer"]); // a circa 22 km: il cacciatorpediniere (12 km) non arriva
    game = advance(game, world, 30);
    expect(hp(game, small.id)).toBeLessThan(SHIP_TYPES.destroyer.hp);
    expect(hp(game, big.id)).toBe(SHIP_TYPES.battleship.hp);
    game = advance(game, world, 6 * 60);
    expect(game.fleets[small.id]).toBeUndefined();
    expect(game.events.some((e) => e.type === "fleetDestroyed" && e.owner === "BBB")).toBe(true);
    expect(game.events.filter((e) => e.type === "navalBattle")).toHaveLength(1);
  });

  it("senza guerra non si spara", () => {
    let game = newGame(false);
    const a = fleet(game, "AAA", cell(20, 0), ["battleship"]);
    const b = fleet(game, "BBB", cell(20, 1), ["destroyer"]);
    game = advance(game, world, 3 * 60);
    expect(hp(game, a.id)).toBe(SHIP_TYPES.battleship.hp);
    expect(hp(game, b.id)).toBe(SHIP_TYPES.destroyer.hp);
  });

  it("il cacciatorpediniere è il cacciatore dei sottomarini", () => {
    let game = newGame();
    const sub = fleet(game, "AAA", cell(20, 1), ["submarine"]);
    const dd = fleet(game, "BBB", cell(21, 1), ["destroyer"]); // a circa 11 km: il sottomarino arriva solo a 5
    game = advance(game, world, 30);
    expect(hp(game, sub.id)).toBeCloseTo(SHIP_TYPES.submarine.hp - SHIP_TYPES.destroyer.vsSub.defense);
    expect(hp(game, dd.id)).toBe(SHIP_TYPES.destroyer.hp);
  });

  it("le navi bombardano le armate sulla costa e l'artiglieria risponde, ma non ai sottomarini", () => {
    let game = newGame();
    const big = fleet(game, "AAA", cell(20, 2), ["battleship", "submarine"]);
    army(game, "guns", "BBB", cell(19, 2), ["artillery", "infantry"]); // a circa 11 km
    game.armies.guns!.settledAt = -1000;
    game = advance(game, world, 30);
    const units = game.armies.guns!.units.reduce((n, u) => n + u.hp, 0);
    expect(units).toBeLessThan(UNIT_TYPES.artillery.hp + UNIT_TYPES.infantry.hp);
    const ships = game.fleets[big.id]!.ships;
    expect(ships.find((s) => s.type === "battleship")!.hp).toBeLessThan(SHIP_TYPES.battleship.hp);
    expect(ships.find((s) => s.type === "submarine")!.hp).toBe(SHIP_TYPES.submarine.hp);
  });

  it("in un porto proprio le navi si riparano", () => {
    let game = newGame(false);
    const f = fleet(game, "BBB", cell(20, 2), ["cruiser"], "B1");
    f.ships[0]!.hp = 30;
    game = advance(game, world, 30);
    expect(hp(game, f.id)).toBeCloseTo(30 + SHIP_TYPES.cruiser.hp * 0.03);
  });
});
