import { describe, expect, it } from "vitest";
import type { UnitTypeId } from "../data/units.js";
import type { LngLat } from "../map/types.js";
import { pairKey } from "./diplomacy.js";
import { createGame } from "./engine.js";
import type { Army, GameState, Squadron } from "./state.js";
import { cell, testWorld } from "./testMaps.js";
import { knowsComposition, visionOf } from "./vision.js";

// Mondo di prova: province A1, A2, A3 (AAA), B1 (BBB), isola A9 (AAA); celle da circa 11 km.
const world = testWorld();

function newGame(): GameState {
  return { ...createGame(world.map, { playerNation: "AAA", realNowMs: 0, seed: 0 }), armies: {} };
}

function army(state: GameState, id: string, owner: string, at: LngLat, types: UnitTypeId[] = ["infantry"]): void {
  const a: Army = {
    id,
    owner,
    units: types.map((type, i) => ({ id: `${id}-${i}`, type, hp: 15 })),
    position: at,
    move: null,
    attacking: false,
    halted: null,
    assault: false,
    useRail: false,
    departure: null,
    task: null,
  };
  state.armies[id] = a;
}

describe("nebbia di guerra", () => {
  it("si vedono le proprie province, non quelle degli altri", () => {
    const v = visionOf(newGame(), world, "AAA");
    expect([...v.provinces].sort()).toEqual(["A1", "A2", "A3", "A9"]);
  });

  it("le province confinanti con le proprie restano nella nebbia", () => {
    const w = testWorld();
    w.map.provinces.find((p) => p.id === "A3")!.neighbors.push({ id: "B1", distanceKm: 55 });
    expect(visionOf(newGame(), w, "AAA").provinces.has("B1")).toBe(false);
  });

  it("una provincia conquistata entra nella vista", () => {
    const game = newGame();
    game.provinces.B1 = { ...game.provinces.B1!, owner: "AAA" };
    expect(visionOf(game, world, "AAA").provinces.has("B1")).toBe(true);
  });

  it("un'armata nemica nella nebbia è nascosta finché non entra nella vista di una propria armata", () => {
    const game = newGame();
    army(game, "enemy", "BBB", cell(16, 2));
    army(game, "mine", "AAA", cell(14, 2)); // a circa 22 km: la fanteria vede 15 km
    expect(visionOf(game, world, "AAA").armies.has("enemy")).toBe(false);

    army(game, "mine", "AAA", cell(14, 2), ["armoredCar"]); // l'autoblindo vede 40 km
    const v = visionOf(game, world, "AAA");
    expect(v.armies.has("enemy")).toBe(true);
    expect(v.provinces.has("B1")).toBe(true); // il centro di B1 è entro la vista
  });

  it("le armate nemiche dentro una provincia visibile si vedono", () => {
    const game = newGame();
    army(game, "enemy", "BBB", cell(2, 0)); // in A1, lontana da tutto
    expect(visionOf(game, world, "AAA").armies.has("enemy")).toBe(true);
  });

  it("con la mappa condivisa si vede quello che vede l'altra nazione", () => {
    const game = newGame();
    army(game, "enemy", "BBB", cell(17, 2));
    game.relations[pairKey("AAA", "BBB")] = { war: false, passage: false, sharedVision: true };
    const v = visionOf(game, world, "AAA");
    expect(v.provinces.has("B1")).toBe(true);
    expect(v.armies.has("enemy")).toBe(true);
    expect(v.viewers.has("BBB")).toBe(true);
  });

  it("la composizione di un'armata avvistata si conosce solo da vicino", () => {
    const game = newGame();
    army(game, "enemy", "BBB", cell(16, 2));
    army(game, "mine", "AAA", cell(14, 2), ["armoredCar"]);
    let v = visionOf(game, world, "AAA");
    expect(knowsComposition(game, v, game.armies.enemy!)).toBe(false);

    army(game, "mine", "AAA", cell(15, 2), ["armoredCar"]); // a circa 11 km
    v = visionOf(game, world, "AAA");
    expect(knowsComposition(game, v, game.armies.enemy!)).toBe(true);
  });

  it("una squadriglia in volo vede sotto di sé; a terra vede la sua base", () => {
    const game = newGame();
    army(game, "enemy", "BBB", cell(18, 2));
    const sq: Squadron = {
      id: "s",
      owner: "AAA",
      aircraft: [{ id: "s-0", type: "recon", hp: 8 }],
      base: "A1",
      flight: null,
      readyAt: 0,
      mission: null,
    };
    game.squadrons = { s: sq };
    expect(visionOf(game, world, "AAA").armies.has("enemy")).toBe(false);

    sq.flight = { from: cell(14, 2), to: cell(19, 2), base: "A3", departAt: 0, arriveAt: 600, fuelKm: 1000 };
    expect(visionOf(game, world, "AAA", 10).armies.has("enemy")).toBe(true);

    // Squadriglia nemica a terra in una base nascosta: non si vede.
    game.squadrons.e = { ...sq, id: "e", owner: "BBB", base: "B1", flight: null };
    expect(visionOf(game, world, "AAA", 10).squadrons.has("e")).toBe(true); // B1 è sotto il ricognitore
    expect(visionOf(game, world, "AAA", 700).squadrons.has("e")).toBe(false); // a volo finito B1 torna nella nebbia
  });
});
