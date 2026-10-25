import { describe, expect, it } from "vitest";
import { BUILDING_TYPES, BUILDINGS } from "../data/buildings.js";
import { COMBAT } from "../data/combat.js";
import { UNIT_TYPES, type UnitTypeId } from "../data/units.js";
import type { LngLat } from "../map/types.js";
import { buildOptions, buildingMinutes } from "./buildings.js";
import { provinceProductionPerDay } from "./economy.js";
import { advance, createGame } from "./engine.js";
import { applyOrder, type Order, type World } from "./orders.js";
import type { Army, GameState } from "./state.js";
import { cell, testWorld } from "./testMaps.js";
import { availableWorks } from "./works.js";

const world = testWorld();
const province = (id: string) => world.map.provinces.find((p) => p.id === id)!;
const WAR = { "AAA|BBB": { war: true, passage: false, sharedVision: false } };

function newGame(seed = 0) {
  const game = createGame(world.map, { playerNation: "AAA", realNowMs: 0, seed });
  for (const n of Object.values(game.nations)) for (const r of Object.keys(n.stock)) n.stock[r as keyof typeof n.stock] = 100_000;
  // Senza le armate iniziali, per avere province vuote.
  return { ...game, armies: {} };
}

function order(state: GameState, o: Order, nation = "AAA"): GameState {
  const r = applyOrder(state, world, nation, o);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

function tryOrder(state: GameState, o: Order, nation = "AAA") {
  return applyOrder(state, world, nation, o);
}

function place(state: GameState, id: string, owner: string, at: LngLat, units: UnitTypeId[], extra: Partial<Army> = {}): GameState {
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
    ...extra,
  };
  return { ...state, armies: { ...state.armies, [id]: army } };
}

describe("conquista per passaggio", () => {
  it("attraversare una provincia nemica senza difensori la conquista, anche lontano dal centro", () => {
    let game = place(newGame(), "x", "AAA", cell(14, 4), ["infantry"]);
    game = order(game, { type: "move", army: "x", target: cell(16, 4) });
    game = advance(game, world, 120);
    expect(game.provinces.B1).toEqual({ owner: "AAA", morale: COMBAT.conqueredMorale });
    expect(game.events.find((e) => e.type === "conquest")).toMatchObject({ province: "B1", from: "BBB", to: "AAA" });
    // Gli edifici perdono un livello: la caserma resta (era al 2), le fabbriche (al livello 1) spariscono.
    expect(game.buildings.B1).toEqual({ barracks: 1 });
  });

  it("un'armata nemica dentro la provincia, anche lontana, la difende", () => {
    let game = place(newGame(), "x", "AAA", cell(14, 4), ["infantry"]);
    game = place(game, "y", "BBB", cell(19, 0), ["infantry"]);
    game = order(game, { type: "move", army: "x", target: cell(16, 4) });
    game = advance(game, world, 120);
    expect(game.provinces.B1!.owner).toBe("BBB");
  });
});

describe("morale e rivolte", () => {
  const conquered = (game: GameState): GameState => ({ ...game, provinces: { ...game.provinces, B1: { owner: "AAA", morale: COMBAT.conqueredMorale } } });

  it("con un'armata dentro non ci sono rivolte e il morale sale di 5 punti al giorno", () => {
    let game = place(conquered(newGame()), "x", "AAA", cell(17, 2), ["infantry"]);
    game = advance(game, world, 1440);
    expect(game.provinces.B1!.morale).toBe(COMBAT.conqueredMorale + COMBAT.conqueredMoraleDailyGain);
    game = advance(game, world, 2 * 1440);
    expect(game.provinces.B1!.morale).toBe(COMBAT.conqueredMorale + 2 * COMBAT.conqueredMoraleDailyGain);
    game = advance(game, world, 100 * 1440);
    expect(game.provinces.B1!.owner).toBe("AAA");
    expect(game.events.some((e) => e.type === "revolt")).toBe(false);
  });

  /** Primo seme con cui B1, conquistata e vuota, si ribella al primo cambio giorno (circa 1 su 20). */
  const revoltSeed = (() => {
    for (let seed = 0; seed < 1000; seed++)
      if (advance(conquered(newGame(seed)), world, 1440).events.some((e) => e.type === "revolt")) return seed;
    throw new Error("nessun seme con una rivolta");
  })();

  it("senza armate e con il morale sotto il 30% può ribellarsi: torna alla nazione d'origine, gli edifici perdono un livello", () => {
    const game = advance(conquered(newGame(revoltSeed)), world, 1440);
    expect(game.events.find((e) => e.type === "revolt")).toMatchObject({ province: "B1", from: "AAA", to: "BBB" });
    expect(game.provinces.B1!.owner).toBe("BBB");
    expect(game.buildings.B1).toEqual({ barracks: 1 });
  });

  it("con il morale al 30% o più non si ribella mai", () => {
    let game = newGame(revoltSeed);
    game = { ...game, provinces: { ...game.provinces, B1: { owner: "AAA", morale: COMBAT.revoltBelowMorale } } };
    game = advance(game, world, 100 * 1440);
    expect(game.provinces.B1!.owner).toBe("AAA");
    expect(game.events.some((e) => e.type === "revolt")).toBe(false);
  });

  it("le rivolte sono decise dal seme: a passi o in un colpo dà lo stesso risultato", () => {
    const start = conquered(newGame(revoltSeed));
    let stepped = start;
    for (let t = 0; t <= 1440; t += 97) stepped = advance(stepped, world, t);
    stepped = advance(stepped, world, 1440);
    expect(stepped.provinces.B1).toEqual(advance(start, world, 1440).provinces.B1);
    expect(stepped.provinces.B1!.owner).toBe("BBB");
  });
});

describe("edifici", () => {
  it("le città partono con gli edifici militari: la capitale con caserma 2 e le fabbriche", () => {
    const game = newGame();
    expect(game.buildings.A1).toEqual({ barracks: 2, tankFactory: 1, artilleryFactory: 1 });
    expect(game.buildings.A2).toBeUndefined();
  });

  it("senza l'edificio giusto non si arruola", () => {
    const game = { ...newGame(), buildings: { ...newGame().buildings, A1: { barracks: 1 } } };
    const r = tryOrder(game, { type: "recruit", province: "A1", unitType: "lightTank" });
    expect(r).toEqual({ ok: false, error: `Serve: ${BUILDING_TYPES.tankFactory.name}.` });
    expect(tryOrder(game, { type: "recruit", province: "A1", unitType: "infantry" }).ok).toBe(true);
  });

  it("costruire paga subito, finisce dopo il tempo previsto e alza il livello", () => {
    let game = newGame();
    const before = game.nations.AAA!.stock.money;
    game = order(game, { type: "build", province: "A1", building: "tankFactory" });
    expect(game.nations.AAA!.stock.money).toBe(before - BUILDING_TYPES.tankFactory.cost.money! * 2);
    const minutes = buildingMinutes("tankFactory", 2);
    expect(tryOrder(game, { type: "build", province: "A1", building: "barracks" })).toEqual({ ok: false, error: "C'è già una costruzione in corso." });
    game = advance(game, world, minutes - 1);
    expect(game.buildings.A1!.tankFactory).toBe(1);
    game = advance(game, world, minutes);
    expect(game.buildings.A1!.tankFactory).toBe(2);
    expect(game.construction.A1).toBeUndefined();
    expect(game.events.find((e) => e.type === "built")).toMatchObject({ province: "A1", building: "tankFactory", level: 2 });
  });

  it("annullare la costruzione restituisce le risorse", () => {
    let game = newGame();
    const stock = { ...game.nations.AAA!.stock };
    game = order(game, { type: "build", province: "A2", building: "industry" });
    game = order(game, { type: "cancelBuild", province: "A2" });
    expect(game.nations.AAA!.stock).toEqual(stock);
    expect(game.construction.A2).toBeUndefined();
  });

  it("nelle province rurali solo industria e ufficio di reclutamento; il cantiere solo sulla costa", () => {
    const game = newGame();
    expect(buildOptions(game, province("A2"), "AAA").map((o) => o.building)).toEqual(["recruitmentOffice", "industry"]);
    expect(buildOptions(game, province("A1"), "AAA").map((o) => o.building)).toContain("shipyard");
    expect(buildOptions(game, province("B1"), "BBB").map((o) => o.building)).not.toContain("shipyard");
    expect(tryOrder(game, { type: "build", province: "A2", building: "barracks" }).ok).toBe(false);
    expect(tryOrder(game, { type: "build", province: "B1", building: "industry" }).ok).toBe(false);
  });

  it("industria e ufficio di reclutamento aumentano la produzione della provincia", () => {
    const ps = { owner: "AAA", morale: 100 };
    const base = provinceProductionPerDay(province("A1"), ps);
    const built = provinceProductionPerDay(province("A1"), ps, { industry: 2, recruitmentOffice: 1 });
    expect(built.goods).toBeCloseTo(base.goods * (1 + 2 * BUILDINGS.industryBonusPerLevel));
    expect(built.money).toBeCloseTo(base.money * (1 + 2 * BUILDINGS.industryMoneyPerLevel));
    expect(built.manpower).toBeCloseTo(base.manpower * (1 + BUILDINGS.recruitmentBonusPerLevel));
    // Senza risorsa principale l'industria dà denaro.
    const rural = provinceProductionPerDay(province("A2"), ps, { industry: 1 });
    expect(rural.money).toBeCloseTo(provinceProductionPerDay(province("A2"), ps).money * (1 + BUILDINGS.industryBonusPerLevel));
  });
});

describe("lavori del genio sugli edifici", () => {
  it("il genio fortifica la provincia: paga all'inizio, più genio fa prima", () => {
    let game = place(newGame(), "x", "AAA", cell(7, 0), ["engineer", "engineer"]);
    const option = availableWorks(game, world, game.armies.x!, 0).find((o) => o.work === "fortify")!;
    expect(option).toMatchObject({ missing: null, level: 1, minutes: buildingMinutes("fortifications", 1) / 2 });
    const before = game.nations.AAA!.stock.metal;
    game = order(game, { type: "work", army: "x", work: "fortify" });
    expect(game.nations.AAA!.stock.metal).toBe(before - BUILDING_TYPES.fortifications.cost.metal!);
    game = advance(game, world, option.minutes);
    expect(game.buildings.A2).toEqual({ fortifications: 1 });
    expect(availableWorks(game, world, game.armies.x!, game.time).find((o) => o.work === "fortify")!.level).toBe(2);
  });

  it("interrompere il lavoro (anche partendo) restituisce le risorse", () => {
    let game = place(newGame(), "x", "AAA", cell(7, 0), ["engineer"]);
    const stock = { ...game.nations.AAA!.stock };
    game = order(game, { type: "work", army: "x", work: "airfield" });
    game = order(game, { type: "move", army: "x", target: cell(3, 2) });
    expect(game.nations.AAA!.stock).toEqual(stock);
  });

  it("il porto solo sulla costa; niente edifici nelle province altrui; l'aeroporto fino al livello 3", () => {
    let game = place(newGame(), "x", "AAA", cell(7, 0), ["engineer"]);
    const works = (g: GameState) => Object.fromEntries(availableWorks(g, world, g.armies.x!, g.time).map((o) => [o.work, o.missing]));
    expect(works(game).port).toBe("Solo nelle province costiere.");
    game = { ...game, buildings: { ...game.buildings, A2: { airfield: 1 } } };
    expect(works(game).airfield).toBeNull();
    game = { ...game, buildings: { ...game.buildings, A2: { airfield: 3 } } };
    expect(works(game).airfield).toBe("Livello massimo.");
    game = place(game, "x", "AAA", cell(17, 0), ["engineer"]);
    expect(works(game).fortify).toBe("Solo nelle tue province.");
    game = place(game, "x", "AAA", cell(1, 0), ["engineer"]);
    expect(works(game).port).toBeNull();
  });

  it("chi difende in una provincia fortificata subisce meno danni", () => {
    const fight = (fort: number) => {
      let game: GameState = { ...newGame(), relations: WAR };
      game = { ...game, buildings: { ...game.buildings, A2: { fortifications: fort } } };
      game = place(game, "d", "AAA", cell(7, 0), ["infantry", "infantry"]);
      game = place(game, "e", "BBB", [cell(7, 0)[0] + 0.02, cell(7, 0)[1]], ["lightTank", "lightTank"], { attacking: true });
      const after = advance(game, world, 30);
      return after.armies.d!.units.reduce((sum, u) => sum + UNIT_TYPES.infantry.hp - u.hp, 0);
    };
    const open = fight(0);
    expect(open).toBeGreaterThan(0);
    expect(fight(3)).toBeCloseTo(open * (1 - 3 * BUILDINGS.fortDefensePerLevel));
  });
});
