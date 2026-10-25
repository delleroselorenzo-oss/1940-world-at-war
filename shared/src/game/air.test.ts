import { describe, expect, it } from "vitest";
import { AIR, AIRCRAFT_TYPES, type AircraftTypeId } from "../data/air.js";
import type { MapData } from "../map/types.js";
import { flatKm } from "../nav/grid.js";
import { isAirBase, refuelMinutes, squadronPosition } from "./air.js";
import { nationUpkeepPerDay } from "./economy.js";
import { advance, createGame } from "./engine.js";
import { mapIndex } from "./mapIndex.js";
import { applyOrder, type Order, type World } from "./orders.js";
import type { GameState, Squadron } from "./state.js";
import { cell, testWorld } from "./testMaps.js";

// Distanze tra i centri delle province di prova: A1–A2 55 km, A1–B1 167 km, A1–A9 222 km.
const world = testWorld();
const center = (id: string, w: World = world) => mapIndex(w.map).provinces.get(id)!.center;

function newGame(): GameState {
  const game = createGame(world.map, { playerNation: "AAA", realNowMs: 0, seed: 0 });
  for (const n of Object.values(game.nations)) for (const r of Object.keys(n.stock)) n.stock[r as keyof typeof n.stock] = 100_000;
  // Fabbrica aeronautica nella capitale A1, aeroporto in A2; senza armate, per non avere altro in gioco.
  return { ...game, armies: {}, buildings: { ...game.buildings, A1: { ...game.buildings.A1, aircraftFactory: 1 }, A2: { airfield: 1 } } };
}

function order(state: GameState, o: Order, nation = "AAA", w: World = world): GameState {
  const r = applyOrder(state, w, nation, o);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

function error(state: GameState, o: Order, nation = "AAA", w: World = world): string {
  const r = applyOrder(state, w, nation, o);
  return r.ok ? "" : r.error;
}

/** Squadriglia a terra già pronta nella base indicata. */
function squadron(state: GameState, base: string, types: AircraftTypeId[], owner = "AAA", id = "s"): GameState {
  const sq: Squadron = {
    id,
    owner,
    base,
    flight: null,
    readyAt: 0,
    aircraft: types.map((t, i) => ({ id: `${id}${i}`, type: t, hp: AIRCRAFT_TYPES[t].hp })),
  };
  return { ...state, squadrons: { ...state.squadrons, [id]: sq } };
}

describe("aviazione: produzione e basi", () => {
  it("gli aerei si costruiscono nelle città con la fabbrica aeronautica ed escono in una squadriglia lì", () => {
    let game = newGame();
    expect(error(game, { type: "recruit", province: "B1", unitType: "fighter" }, "BBB")).toBe("Serve: Fabbrica aeronautica.");
    expect(error(game, { type: "recruit", province: "A1", unitType: "zeppelin" as AircraftTypeId })).toBe("Provincia o unità sconosciuta.");
    game = order(game, { type: "recruit", province: "A1", unitType: "fighter" });
    game = order(game, { type: "recruit", province: "A1", unitType: "tacticalBomber" });
    const hours = AIRCRAFT_TYPES.fighter.productionHours + AIRCRAFT_TYPES.tacticalBomber.productionHours;
    game = advance(game, world, hours * 60);
    const squadrons = Object.values(game.squadrons);
    expect(squadrons).toHaveLength(1);
    expect(squadrons[0]).toMatchObject({ owner: "AAA", base: "A1", flight: null });
    expect(squadrons[0]!.aircraft.map((a) => a.type)).toEqual(["fighter", "tacticalBomber"]);
    expect(Object.keys(game.armies)).toHaveLength(0);
    // Il mantenimento degli aerei comprende il petrolio.
    expect(nationUpkeepPerDay(game, "AAA").oil).toBe(AIRCRAFT_TYPES.fighter.upkeepPerDay.oil! + AIRCRAFT_TYPES.tacticalBomber.upkeepPerDay.oil!);
  });

  it("basi: aeroporto o fabbrica aeronautica, propri o di un alleato", () => {
    let game = newGame();
    expect(isAirBase(game, "A1", "AAA")).toBe(true);
    expect(isAirBase(game, "A2", "AAA")).toBe(true);
    expect(isAirBase(game, "A3", "AAA")).toBe(false);
    game = { ...game, buildings: { ...game.buildings, B1: { airfield: 1 } } };
    expect(isAirBase(game, "B1", "AAA")).toBe(false);
    game = { ...game, relations: { "AAA|BBB": { war: false, passage: false, sharedVision: false, alliance: true } } };
    expect(isAirBase(game, "B1", "AAA")).toBe(true);
  });
});

describe("aviazione: trasferimento", () => {
  it("vola in linea retta alla velocità del più lento, poi si rifornisce alla base", () => {
    let game = squadron(newGame(), "A1", ["fighter", "tacticalBomber"]);
    game = order(game, { type: "fly", squadron: "s", base: "A2" });
    const minutes = Math.round((flatKm(center("A1"), center("A2")) / AIRCRAFT_TYPES.tacticalBomber.speedKmh) * 60);
    expect(game.squadrons.s!.flight).toMatchObject({ base: "A2", departAt: 0, arriveAt: minutes });
    expect(error(game, { type: "fly", squadron: "s", base: "A1" })).toBe("La squadriglia è in volo.");
    // A metà volo è a metà strada.
    const half = squadronPosition(game.squadrons.s!, world.map, minutes / 2);
    expect(flatKm(half, center("A1"))).toBeCloseTo(flatKm(center("A1"), center("A2")) / 2, 0);

    game = advance(game, world, minutes);
    expect(game.squadrons.s).toMatchObject({ base: "A2", flight: null, readyAt: minutes + AIRCRAFT_TYPES.tacticalBomber.refuelMinutes });
    expect(error(game, { type: "fly", squadron: "s", base: "A1" })).toBe("La squadriglia si sta rifornendo.");
    game = advance(game, world, minutes + AIRCRAFT_TYPES.tacticalBomber.refuelMinutes);
    expect(error(game, { type: "fly", squadron: "s", base: "A1" })).toBe("");
  });

  it("i livelli dell'aeroporto accorciano il rifornimento", () => {
    const game = squadron({ ...newGame(), buildings: { ...newGame().buildings, A2: { airfield: 3 } } }, "A2", ["strategicBomber"]);
    const base = AIRCRAFT_TYPES.strategicBomber.refuelMinutes;
    expect(refuelMinutes(game, game.squadrons.s!, "A2")).toBe(Math.round(base * (1 - 2 * AIR.airfieldTimeCutPerLevel)));
    expect(refuelMinutes(game, game.squadrons.s!, "A1")).toBe(base);
  });

  it("solo verso una propria base entro la portata (quella più corta della squadriglia)", () => {
    // L'isola A9 spostata a circa 1.000 km: oltre la portata del caccia, entro quella del bombardiere strategico.
    const far = testWorld();
    const map: MapData = { ...far.map, provinces: far.map.provinces.map((p) => (p.id === "A9" ? { ...p, center: [9.2, cell(0, 2)[1]] } : p)) };
    const w = { map, nav: far.nav };
    let game: GameState = { ...newGame(), buildings: { ...newGame().buildings, A9: { airfield: 1 } } };
    expect(error(squadron(game, "A1", ["fighter"]), { type: "fly", squadron: "s", base: "A3" }, "AAA", w)).toMatch(/Non è una tua base/);
    expect(error(squadron(game, "A1", ["strategicBomber", "fighter"]), { type: "fly", squadron: "s", base: "A9" }, "AAA", w)).toMatch(
      /Troppo lontano: \d+ km, la portata è di 630 km/,
    );
    game = order(squadron(game, "A1", ["strategicBomber"]), { type: "fly", squadron: "s", base: "A9" }, "AAA", w);
    expect(game.squadrons.s!.flight!.base).toBe("A9");
    expect(error(game, { type: "fly", squadron: "s", base: "A2" }, "BBB", w)).toBe("Squadriglia sconosciuta.");
  });

  it("se la base d'arrivo si perde durante il volo, ripiega sulla base più vicina raggiungibile", () => {
    let game = squadron({ ...newGame(), buildings: { ...newGame().buildings, A9: { airfield: 1 } } }, "A1", ["fighter"]);
    game = order(game, { type: "fly", squadron: "s", base: "A9" });
    const arrive = game.squadrons.s!.flight!.arriveAt;
    // L'aeroporto di A9 viene distrutto prima dell'arrivo.
    game = advance(game, world, arrive - 1);
    game = { ...game, buildings: { ...game.buildings, A9: {} } };
    game = advance(game, world, arrive);
    expect(game.squadrons.s!.flight).toMatchObject({ from: center("A9"), base: "A2" });
  });

  it("senza una base raggiungibile la squadriglia va persa", () => {
    let game = squadron({ ...newGame(), buildings: { ...newGame().buildings, A1: {}, A9: { airfield: 1 } } }, "A2", ["fighter"]);
    game = order(game, { type: "fly", squadron: "s", base: "A9" });
    // Con tutte le basi perse non c'è dove atterrare.
    game = { ...game, buildings: { ...game.buildings, A2: {}, A9: {} } };
    game = advance(game, world, game.squadrons.s!.flight!.arriveAt);
    expect(game.squadrons.s).toBeUndefined();
    expect(game.events.at(-1)).toMatchObject({ type: "squadronLost", owner: "AAA", province: "A9" });
  });

  it("gli aerei a terra in una base conquistata dal nemico ripiegano sulla base più vicina", () => {
    let game = squadron(newGame(), "A2", ["fighter"]);
    game = { ...game, provinces: { ...game.provinces, A2: { owner: "BBB", morale: 25 } } };
    game = advance(game, world, 5);
    expect(game.squadrons.s!.flight).toMatchObject({ base: "A1", departAt: 5 });
  });
});
