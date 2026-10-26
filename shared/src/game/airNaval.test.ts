import { describe, expect, it } from "vitest";
import { AIRCRAFT_TYPES, type AircraftTypeId } from "../data/air.js";
import { SHIP_TYPES, type ShipTypeId } from "../data/naval.js";
import type { LngLat } from "../map/types.js";
import { squadronPosition } from "./air.js";
import { pairKey } from "./diplomacy.js";
import { advance, createGame } from "./engine.js";
import { fleetPosition, newFleet, newShip } from "./navy.js";
import { applyOrder, type Order } from "./orders.js";
import type { Fleet, GameState } from "./state.js";
import { cell, testWorld } from "./testMaps.js";

// Aerei contro navi e portaerei. Il mare sono le colonne 20-21; A1 (fabbrica aeronautica) è a circa 200 km.
const world = testWorld();

function newGame(): GameState {
  const game = { ...createGame(world.map, { playerNation: "AAA", realNowMs: 0, seed: 0 }), armies: {} };
  game.buildings.A1 = { ...game.buildings.A1, aircraftFactory: 1 };
  game.relations[pairKey("AAA", "BBB")] = { war: true, warSince: 0, passage: false, sharedVision: false };
  return game;
}

function fleet(game: GameState, owner: string, at: LngLat, types: ShipTypeId[]): Fleet {
  const f = newFleet(game, owner, at, null);
  f.ships.push(...types.map((t) => newShip(game, t)));
  return f;
}

function squadron(game: GameState, base: string, types: AircraftTypeId[], id = "s") {
  game.squadrons[id] = { id, owner: "AAA", base, flight: null, readyAt: 0, mission: null, aircraft: types.map((t, i) => ({ id: `${id}${i}`, type: t, hp: AIRCRAFT_TYPES[t].hp })) };
}

function order(state: GameState, o: Order): GameState {
  const r = applyOrder(state, world, "AAA", o);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

const error = (state: GameState, o: Order) => {
  const r = applyOrder(state, world, "AAA", o);
  return r.ok ? "" : r.error;
};

describe("aerei contro navi", () => {
  it("gli aerosiluranti colpiscono una flotta nemica; la contraerea delle navi spara prima", () => {
    let game = newGame();
    const enemy = fleet(game, "BBB", cell(20, 2), ["cruiser"]);
    squadron(game, "A1", ["torpedoBomber", "torpedoBomber"]);
    game = order(game, { type: "airStrike", squadron: "s", target: enemy.id });
    game = advance(game, world, 3 * 60);
    const strike = game.events.find((e) => e.type === "airStrike");
    expect(strike).toMatchObject({ naval: true, against: "BBB" });
    const left = game.fleets[enemy.id]?.ships[0]?.hp ?? 0;
    expect(left).toBeLessThan(SHIP_TYPES.cruiser.hp);
    // La contraerea dell'incrociatore (3) ha colpito gli aerei.
    const aircraftHp = game.squadrons.s?.aircraft.reduce((n, a) => n + a.hp, 0) ?? 0;
    expect(aircraftHp).toBeLessThan(2 * AIRCRAFT_TYPES.torpedoBomber.hp);
  });
});

describe("portaerei", () => {
  it("una squadriglia si trasferisce sulla portaerei e naviga con lei", () => {
    let game = newGame();
    const carrier = fleet(game, "AAA", cell(21, 0), ["carrier"]);
    squadron(game, "A1", ["fighter", "torpedoBomber"]);
    game = order(game, { type: "fly", squadron: "s", base: carrier.id });
    game = advance(game, world, 2 * 60);
    expect(game.squadrons.s).toMatchObject({ base: carrier.id, flight: null });
    game = order(game, { type: "sail", fleet: carrier.id, target: cell(21, 4) });
    game = advance(game, world, game.time + 30);
    expect(squadronPosition(game, game.squadrons.s!, world.map, game.time)).toEqual(fleetPosition(game.fleets[carrier.id]!, game.time));
  });

  it("dopo l'attacco la squadriglia torna sulla sua portaerei", () => {
    let game = newGame();
    const carrier = fleet(game, "AAA", cell(21, 0), ["carrier"]);
    const enemy = fleet(game, "BBB", cell(20, 4), ["destroyer"]); // a circa 45 km: fuori tiro dei cannoni
    squadron(game, carrier.id, ["torpedoBomber"]);
    game = order(game, { type: "airStrike", squadron: "s", target: enemy.id });
    game = advance(game, world, 2 * 60);
    expect(game.events.some((e) => e.type === "airStrike")).toBe(true);
    expect(game.squadrons.s).toMatchObject({ base: carrier.id, flight: null });
  });

  it("solo aerei imbarcabili, e non più di quanti ne porta", () => {
    const game = newGame();
    const carrier = fleet(game, "AAA", cell(21, 0), ["carrier"]);
    squadron(game, "A1", ["strategicBomber"], "big");
    squadron(game, "A1", Array(9).fill("fighter"), "many");
    expect(error(game, { type: "fly", squadron: "big", base: carrier.id })).toMatch(/solo caccia/);
    expect(error(game, { type: "fly", squadron: "many", base: carrier.id })).toMatch(/piena/);
  });

  it("se la portaerei si sposta durante il volo la squadriglia la insegue", () => {
    let game = newGame();
    const carrier = fleet(game, "AAA", cell(21, 0), ["carrier"]);
    squadron(game, "A1", ["fighter"]);
    game = order(game, { type: "fly", squadron: "s", base: carrier.id });
    game = order(game, { type: "sail", fleet: carrier.id, target: cell(21, 4) });
    game = advance(game, world, 3 * 60);
    expect(game.squadrons.s).toMatchObject({ base: carrier.id, flight: null });
  });

  it("se la portaerei affonda gli aerei a bordo vanno persi", () => {
    let game = newGame();
    const carrier = fleet(game, "AAA", cell(21, 0), ["carrier"]);
    squadron(game, carrier.id, ["fighter"]);
    fleet(game, "BBB", cell(21, 1), ["battleship", "battleship", "battleship"]);
    game = advance(game, world, 24 * 60);
    expect(game.fleets[carrier.id]).toBeUndefined();
    expect(game.squadrons.s).toBeUndefined();
    expect(game.events.some((e) => e.type === "squadronLost")).toBe(true);
  });
});
