import { describe, expect, it } from "vitest";
import { AIR, AIRCRAFT_TYPES, type AircraftTypeId } from "../data/air.js";
import { COMBAT } from "../data/combat.js";
import { UNIT_TYPES, type UnitTypeId } from "../data/units.js";
import type { LngLat, MapData } from "../map/types.js";
import { flatKm } from "../nav/grid.js";
import { isAirBase, refuelMinutes, squadronPosition } from "./air.js";
import { nationUpkeepPerDay } from "./economy.js";
import { advance, createGame } from "./engine.js";
import { mapIndex } from "./mapIndex.js";
import { applyOrder, type Order, type World } from "./orders.js";
import type { Army, GameState, Squadron } from "./state.js";
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
    mission: null,
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
    const half = squadronPosition(game, game.squadrons.s!, world.map, minutes / 2);
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

const WAR = { "AAA|BBB": { war: true, passage: false, sharedVision: false } };

/** Armata ferma nel punto indicato. */
function place(state: GameState, id: string, owner: string, at: LngLat, units: UnitTypeId[]): GameState {
  const army: Army = {
    id,
    owner,
    position: at,
    move: null,
    attacking: false,
    halted: null,
    assault: false,
    useRail: false,
    departure: null,
    task: null,
    units: units.map((type, i) => ({ id: `${id}u${i}`, type, hp: UNIT_TYPES[type].hp })),
  };
  return { ...state, armies: { ...state.armies, [id]: army } };
}

/** Partita in guerra con BBB e un'armata nemica di due fanterie ferma al centro di B1. */
function atWarGame(units: UnitTypeId[] = ["infantry", "infantry"]): GameState {
  return place({ ...newGame(), relations: WAR }, "e", "BBB", center("B1"), units);
}

describe("aviazione: attacco", () => {
  it("si attaccano solo le armate delle nazioni in guerra", () => {
    const game = squadron(place(newGame(), "e", "BBB", center("B1"), ["infantry"]), "A1", ["tacticalBomber"]);
    expect(error(game, { type: "airStrike", squadron: "s", target: "e" })).toMatch(/in guerra/);
    expect(error(place(game, "m", "AAA", center("A2"), ["infantry"]), { type: "airStrike", squadron: "s", target: "m" })).toMatch(/tue forze/);
    expect(error(game, { type: "airStrike", squadron: "s", target: "nessuna" })).toBe("Bersaglio sconosciuto.");
  });

  it("la contraerea spara per prima, poi gli aerei colpiscono; dopo l'attacco rientrano alla base più vicina", () => {
    let game = squadron(atWarGame(), "A1", ["tacticalBomber"]);
    game = order(game, { type: "airStrike", squadron: "s", target: "e" });
    const arrive = game.squadrons.s!.flight!.arriveAt;
    expect(game.squadrons.s!.flight).toMatchObject({ base: null, to: center("B1") });
    game = advance(game, world, arrive);

    // Contraerea: due fanterie (0,5 l'una) a piena salute; poi il bombardiere colpisce con l'efficienza rimasta.
    const bomberHp = AIRCRAFT_TYPES.tacticalBomber.hp - 2 * UNIT_TYPES.infantry.antiAir;
    const efficiency = COMBAT.minEfficiency + (1 - COMBAT.minEfficiency) * (bomberHp / AIRCRAFT_TYPES.tacticalBomber.hp);
    const damage = AIRCRAFT_TYPES.tacticalBomber.attack.soft * efficiency;
    expect(game.squadrons.s!.aircraft[0]!.hp).toBeCloseTo(bomberHp);
    const left = game.armies.e!.units.reduce((n, u) => n + u.hp, 0);
    expect(left).toBeCloseTo(2 * UNIT_TYPES.infantry.hp - damage);
    // Il bombardamento abbassa il morale della provincia colpita.
    expect(game.provinces.B1!.morale).toBeCloseTo(100 - AIRCRAFT_TYPES.tacticalBomber.moraleDamage! * efficiency);
    expect(game.events.at(-1)).toMatchObject({ type: "airStrike", by: "AAA", against: "BBB", aircraftLost: 0, unitsLost: 0 });
    // Rientro: A2 è la base più vicina a B1.
    expect(game.squadrons.s).toMatchObject({ mission: null, flight: { base: "A2", from: center("B1") } });
    game = advance(game, world, game.squadrons.s!.flight!.arriveAt);
    expect(game.squadrons.s).toMatchObject({ base: "A2", flight: null });
  });

  it("la contraerea può abbattere tutta la squadriglia prima che colpisca", () => {
    let game = squadron(atWarGame(["antiAircraft", "antiAircraft", "antiAircraft"]), "A1", ["fighter"]);
    game = order(game, { type: "airStrike", squadron: "s", target: "e" });
    game = advance(game, world, game.squadrons.s!.flight!.arriveAt);
    expect(game.squadrons.s).toBeUndefined();
    expect(game.armies.e!.units.every((u) => u.hp === UNIT_TYPES.antiAircraft.hp)).toBe(true);
    expect(game.events.at(-1)).toMatchObject({ type: "airStrike", aircraftLost: 1, squadronDestroyed: true, armyDestroyed: false });
  });

  it("l'armata distrutta dall'attacco sparisce", () => {
    let game = squadron(atWarGame(["medic"]), "A1", ["tacticalBomber", "tacticalBomber"]);
    game = order(game, { type: "airStrike", squadron: "s", target: "e" });
    game = advance(game, world, game.squadrons.s!.flight!.arriveAt);
    expect(game.armies.e).toBeUndefined();
    expect(game.events.map((e) => e.type).slice(-2)).toEqual(["airStrike", "armyDestroyed"]);
  });

  it("in rifornimento accetta l'ordine e decolla appena è pronta", () => {
    let game = squadron(atWarGame(), "A1", ["fighter"]);
    game = { ...game, squadrons: { s: { ...game.squadrons.s!, readyAt: 20 } } };
    game = order(game, { type: "airStrike", squadron: "s", target: "e" });
    expect(game.squadrons.s!.flight).toBeNull();
    game = advance(game, world, 20);
    expect(game.squadrons.s!.flight).toMatchObject({ base: null, departAt: 20 });
  });

  it("in volo cambia subito rotta verso il bersaglio", () => {
    let game = squadron(atWarGame(), "A1", ["fighter"]);
    game = order(game, { type: "fly", squadron: "s", base: "A2" });
    game = advance(game, world, 3);
    game = order(game, { type: "airStrike", squadron: "s", target: "e" });
    expect(game.squadrons.s!.flight).toMatchObject({ base: null, departAt: 3, to: center("B1") });
  });

  it("se il bersaglio esce dal raggio d'azione l'attacco decade e la squadriglia rientra", () => {
    let game = squadron(atWarGame(), "A1", ["fighter"]);
    game = order(game, { type: "airStrike", squadron: "s", target: "e" });
    const arrive = game.squadrons.s!.flight!.arriveAt;
    // L'armata nemica si ritrova a 700 km, fuori dal raggio d'azione del caccia (315 km).
    game = advance(game, world, arrive - 1);
    game = { ...game, armies: { e: { ...game.armies.e!, position: [6.5, center("B1")[1]] } } };
    game = advance(game, world, arrive);
    expect(game.squadrons.s).toMatchObject({ mission: null, flight: { base: "A2" } });
    expect(game.events.some((e) => e.type === "airStrike")).toBe(false);
  });

  it("annullare l'attacco in volo fa rientrare la squadriglia", () => {
    let game = squadron(atWarGame(), "A1", ["fighter"]);
    game = order(game, { type: "airStrike", squadron: "s", target: "e" });
    game = advance(game, world, 5);
    game = order(game, { type: "cancelStrike", squadron: "s" });
    expect(game.squadrons.s).toMatchObject({ mission: null, flight: { base: "A2" } });
    expect(error(game, { type: "cancelStrike", squadron: "s" })).toBe("Nessun attacco da annullare.");
  });

  it("bersaglio lontano: scalo in una base più vicina, rifornimento, poi l'attacco", () => {
    // L'isola A9 spostata a ~580 km da A1; il bersaglio a ~280 km da A9 e ~860 km da A1.
    const far = testWorld();
    const y = cell(0, 2)[1];
    const map: MapData = { ...far.map, provinces: far.map.provinces.map((p) => (p.id === "A9" ? { ...p, center: [5.5, y] as LngLat } : p)) };
    const w = { map, nav: far.nav };
    let game: GameState = { ...newGame(), relations: WAR, buildings: { ...newGame().buildings, A9: { airfield: 1 } } };
    game = squadron(place(game, "e", "BBB", [8, y], ["infantry"]), "A1", ["fighter"]);
    expect(error(place(game, "e", "BBB", [12, y], ["infantry"]), { type: "airStrike", squadron: "s", target: "e" }, "AAA", w)).toMatch(
      /fuori portata/,
    );

    game = order(game, { type: "airStrike", squadron: "s", target: "e" }, "AAA", w);
    expect(game.squadrons.s!.mission!.via).toEqual(["A9"]);
    expect(game.squadrons.s!.flight!.base).toBe("A9");
    game = advance(game, w, game.squadrons.s!.flight!.arriveAt);
    expect(game.squadrons.s).toMatchObject({ base: "A9", flight: null, mission: { via: [] } });
    game = advance(game, w, game.squadrons.s!.readyAt);
    expect(game.squadrons.s!.flight).toMatchObject({ base: null, from: center("A9", w) });
    game = advance(game, w, game.squadrons.s!.flight!.arriveAt);
    expect(game.events.some((e) => e.type === "airStrike")).toBe(true);
  });
});
