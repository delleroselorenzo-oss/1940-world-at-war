import { describe, expect, it } from "vitest";
import { MOVEMENT } from "../data/movement.js";
import { UNIT_TYPES, type UnitTypeId } from "../data/units.js";
import type { LngLat } from "../map/types.js";
import { flatKm } from "../nav/grid.js";
import { advance, createGame } from "./engine.js";
import { arrivalTime, boardMinutes } from "./movement.js";
import { applyOrder, type Order, type World } from "./orders.js";
import type { Army, GameState } from "./state.js";
import { cell, testWorld } from "./testMaps.js";

// Treno, partenze ritardate e differenza tra "Muovi" e "Attacca".

const railWorld = testWorld({ railway: true });

function newGame(w: World) {
  const game = createGame(w.map, { playerNation: "AAA", realNowMs: 0 });
  // Solo le armate di prova: si tolgono quelle iniziali.
  return { ...game, armies: {} };
}

function order(state: GameState, o: Order, w: World): GameState {
  const r = applyOrder(state, w, "AAA", o);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

function place(state: GameState, at: LngLat, units: UnitTypeId[]): GameState {
  const army: Army = {
    id: "x",
    owner: "AAA",
    position: at,
    move: null,
    attacking: false,
    halted: null,
    assault: false,
    useRail: false,
    departure: null,
    task: null,
    units: units.map((type, i) => ({ id: `u${i}`, type, hp: UNIT_TYPES[type].hp })),
  };
  return { ...state, armies: { x: army } };
}

describe("treno", () => {
  const trip = (game: GameState, target: LngLat, rail: boolean) => order(game, { type: "move", army: "x", target, rail }, railWorld);

  it("salire e scendere dura 15 minuti per unità, al massimo 2 ore", () => {
    expect(boardMinutes(1)).toBe(15);
    expect(boardMinutes(4)).toBe(60);
    expect(boardMinutes(8)).toBe(120);
    expect(boardMinutes(15)).toBe(120);
  });

  it("si prende solo se il giocatore lo sceglie", () => {
    const game = place(newGame(railWorld), cell(0, 2), ["infantry"]);
    expect(trip(game, cell(14, 2), false).armies.x!.move!.rail.some((k) => k > 0)).toBe(false);
    expect(trip(game, cell(14, 2), true).armies.x!.move!.rail.some((k) => k > 0)).toBe(true);
  });

  it("nel proprio territorio con il morale alto va a 55 km/h, più salita e discesa", () => {
    const game = trip(place(newGame(railWorld), cell(0, 2), ["infantry"]), cell(14, 2), true);
    const km = flatKm(cell(0, 2), cell(14, 2));
    expect(arrivalTime(game.armies.x!)).toBeCloseTo(2 * boardMinutes(1) + (km / MOVEMENT.railHomeSpeedKmh) * 60, 3);
  });

  it("con il morale basso va a 35 km/h", () => {
    let game = place(newGame(railWorld), cell(0, 2), ["infantry"]);
    const provinces = Object.fromEntries(Object.entries(game.provinces).map(([id, p]) => [id, { ...p, morale: 40 }]));
    game = trip({ ...game, provinces }, cell(14, 2), true);
    const km = flatKm(cell(0, 2), cell(14, 2));
    expect(arrivalTime(game.armies.x!)).toBeCloseTo(2 * boardMinutes(1) + (km / MOVEMENT.railSpeedKmh) * 60, 3);
  });

  it("anche se scelto, sui tragitti brevi non conviene salire", () => {
    const game = trip(place(newGame(railWorld), cell(0, 2), ["infantry"]), cell(1, 2), true);
    expect(game.armies.x!.move!.rail.some((k) => k > 0)).toBe(false);
  });

  it("un'armata numerosa ci mette di più a salire e scendere", () => {
    const small = trip(place(newGame(railWorld), cell(0, 2), ["infantry"]), cell(14, 2), true);
    const big = trip(place(newGame(railWorld), cell(0, 2), Array<UnitTypeId>(8).fill("infantry")), cell(14, 2), true);
    expect(arrivalTime(big.armies.x!)! - arrivalTime(small.armies.x!)!).toBeCloseTo(2 * (boardMinutes(8) - boardMinutes(1)), 3);
  });

  it("in territorio straniero senza diritto di passaggio si scende dal treno", () => {
    const game = trip(place(newGame(railWorld), cell(0, 2), ["infantry"]), cell(18, 2), true);
    const { points, rail } = game.armies.x!.move!;
    const border = cell(14, 2)[0];
    rail.forEach((k, i) => {
      if (k > 0) expect(points[i + 1]![0]).toBeLessThanOrEqual(border + 1e-9);
    });
  });
});

describe("partenza ritardata", () => {
  const world = testWorld();

  it("l'armata resta ferma fino all'ora di partenza, poi marcia", () => {
    let game = place(newGame(world), cell(0, 2), ["infantry"]);
    game = order(game, { type: "move", army: "x", target: cell(6, 2), delayMinutes: 120 }, world);
    expect(game.armies.x!.move).toBeNull();
    expect(game.armies.x!.departure).toEqual({ at: 120, target: cell(6, 2) });

    game = advance(game, world, 119);
    expect(game.armies.x!.move).toBeNull();
    game = advance(game, world, 120);
    expect(game.armies.x!.departure).toBeNull();
    expect(game.armies.x!.move?.times[0]).toBe(120);
  });

  it("partendo si lascia il lavoro in corso", () => {
    let game = place(newGame(world), [10 * 0.1 - 0.01, cell(0, 2)[1]], ["infantry"]);
    game = order(game, { type: "move", army: "x", target: cell(6, 2), delayMinutes: 30 }, world);
    game = order(game, { type: "work", army: "x", work: "demolish" }, world);
    game = advance(game, world, 90);
    expect(game.destroyedBridges).toEqual([]);
    expect(game.armies.x!.task).toBeNull();
  });

  it("si annulla fermando l'armata", () => {
    let game = place(newGame(world), cell(0, 2), ["infantry"]);
    game = order(game, { type: "move", army: "x", target: cell(6, 2), delayMinutes: 120 }, world);
    game = order(game, { type: "stop", army: "x" }, world);
    game = advance(game, world, 200);
    expect(game.armies.x!.move).toBeNull();
    expect(game.armies.x!.position).toEqual(cell(0, 2));
  });
});

describe("Muovi e Attacca", () => {
  const world = testWorld();
  const b1 = world.map.provinces.find((p) => p.id === "B1")!.center;

  /** Marcia verso B1 (difesa da un'armata nemica) e restituisce l'armata appena fermata dal contatto. */
  function haltedAt(attack: boolean): Army {
    const start = createGame(world.map, { playerNation: "AAA", realNowMs: 0 });
    const enemy = Object.values(start.armies).find((a) => a.owner === "BBB")!;
    let game = place(newGame(world), cell(8, 2), ["infantry", "infantry"]);
    game = { ...game, armies: { ...game.armies, [enemy.id]: enemy } };
    game = order(game, { type: "move", army: "x", target: b1, attack }, world);
    for (let t = 30; t < 3000; t += 5) {
      game = advance(game, world, t);
      const x = game.armies.x;
      if (x?.halted) return x;
    }
    throw new Error("nessun contatto");
  }

  it("con Muovi al contatto ci si ferma e ci si difende", () => {
    expect(haltedAt(false).attacking).toBe(false);
  });

  it("con Attacca si va all'assalto", () => {
    expect(haltedAt(true).attacking).toBe(true);
  });
});
