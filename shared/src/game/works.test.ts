import { describe, expect, it } from "vitest";
import { COMBAT } from "../data/combat.js";
import { ENGINEERING } from "../data/engineering.js";
import { UNIT_TYPES, type UnitTypeId } from "../data/units.js";
import type { LngLat } from "../map/types.js";
import { startWar } from "./diplomacy.js";
import { advance, createGame } from "./engine.js";
import { applyOrder, type Order, type World } from "./orders.js";
import { planRoute } from "./routing.js";
import type { Army, GameState } from "./state.js";
import { cell, STEP, testWorld } from "./testMaps.js";
import { availableWorks } from "./works.js";

const world = testWorld();
/** Accanto al ponte, sulla sponda ovest (il ponte è sul fiume tra la colonna 9 e la 10, riga 2). */
const BY_BRIDGE: LngLat = [10 * STEP - 0.01, cell(0, 2)[1]];
/** Sulla sponda ovest, lontano dal ponte. */
const RIVERBANK = cell(9, 0);

function newGame(w: World = world) {
  const game = createGame(w.map, { playerNation: "AAA", realNowMs: 0 });
  for (const n of Object.values(game.nations)) for (const r of Object.keys(n.stock)) n.stock[r as keyof typeof n.stock] = 100_000;
  return game;
}

function order(state: GameState, o: Order, nation = "AAA", w: World = world): GameState {
  const r = applyOrder(state, w, nation, o);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

/** Aggiunge un'armata ferma nel punto indicato. */
function place(state: GameState, id: string, owner: string, at: LngLat, units: UnitTypeId[], hp?: number): GameState {
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
    units: units.map((type, i) => ({ id: `${id}u${i}`, type, hp: hp ?? UNIT_TYPES[type].hp })),
  };
  return { ...state, armies: { ...state.armies, [id]: army } };
}

describe("ponti", () => {
  it("qualsiasi armata distrugge un ponte vicino in un'ora; poi il fiume non si passa più", () => {
    let game = place(newGame(), "x", "AAA", BY_BRIDGE, ["infantry"]);
    expect(planRoute(game, world.nav, "AAA", cell(5, 2), cell(12, 2))).not.toBeNull();
    game = order(game, { type: "work", army: "x", work: "demolish" });
    expect(game.armies.x!.task?.finishesAt).toBe(ENGINEERING.demolishMinutes);

    game = advance(game, world, ENGINEERING.demolishMinutes - 1);
    expect(game.destroyedBridges).toEqual([]);
    game = advance(game, world, ENGINEERING.demolishMinutes);
    expect(game.destroyedBridges).toEqual(["br1"]);
    expect(game.armies.x!.task).toBeNull();
    expect(game.events.at(-1)).toMatchObject({ type: "works", what: "bridgeDestroyed", river: "Fiume" });
    expect(planRoute(game, world.nav, "AAA", cell(5, 2), cell(12, 2))).toBeNull();
  });

  it("chi marciava sul ponte appena distrutto si ferma se non c'è un'altra strada", () => {
    let game = place(newGame(), "x", "AAA", BY_BRIDGE, ["infantry"]);
    game = place(game, "y", "AAA", cell(5, 2), ["infantry"]);
    game = order(game, { type: "work", army: "x", work: "demolish" });
    game = order(game, { type: "move", army: "y", target: cell(13, 2) });
    game = advance(game, world, ENGINEERING.demolishMinutes);
    const y = game.armies.y!;
    expect(y.move).toBeNull();
    expect(y.position[0]).toBeLessThan(10 * STEP); // è rimasto sulla sponda ovest
  });

  it("riparare serve il genio; più genio lavora più in fretta", () => {
    let game = { ...place(newGame(), "x", "AAA", BY_BRIDGE, ["infantry"]), destroyedBridges: ["br1"] };
    const repair = availableWorks(game, world, game.armies.x!, 0).find((o) => o.work === "repair")!;
    expect(repair.missing).toBe("Serve il genio.");

    game = place(game, "x", "AAA", BY_BRIDGE, ["engineer", "engineer"]);
    game = order(game, { type: "work", army: "x", work: "repair" });
    expect(game.armies.x!.task?.finishesAt).toBe(ENGINEERING.repairMinutes / 2);
    game = advance(game, world, ENGINEERING.repairMinutes / 2);
    expect(game.destroyedBridges).toEqual([]);
    expect(planRoute(game, world.nav, "AAA", cell(5, 2), cell(12, 2))).not.toBeNull();
  });

  it("un ordine di marcia interrompe il lavoro", () => {
    let game = place(newGame(), "x", "AAA", BY_BRIDGE, ["infantry"]);
    game = order(game, { type: "work", army: "x", work: "demolish" });
    game = order(game, { type: "move", army: "x", target: cell(5, 2) });
    game = advance(game, world, 120);
    expect(game.destroyedBridges).toEqual([]);
  });
});

describe("ponti di barche", () => {
  const noBridge = testWorld({ withBridge: false });

  it("il genio getta un ponte di barche sul fiume vicino e si può attraversare", () => {
    let game = place(newGame(noBridge), "x", "AAA", RIVERBANK, ["engineer"]);
    expect(planRoute(game, noBridge.nav, "AAA", cell(5, 2), cell(12, 2))).toBeNull();
    const option = availableWorks(game, noBridge, game.armies.x!, 0).find((o) => o.work === "pontoon")!;
    expect(option).toMatchObject({ missing: null, river: "Fiume", minutes: ENGINEERING.pontoonMinutes });

    game = order(game, { type: "work", army: "x", work: "pontoon" }, "AAA", noBridge);
    game = advance(game, noBridge, ENGINEERING.pontoonMinutes);
    expect(Object.values(game.pontoons)).toHaveLength(1);
    expect(planRoute(game, noBridge.nav, "AAA", cell(5, 2), cell(12, 2))).not.toBeNull();

    // Il passaggio già aperto non viene riproposto.
    const again = availableWorks(game, noBridge, game.armies.x!, game.time).find((o) => o.work === "pontoon")!;
    expect(again.target).not.toEqual(option.target);
  });

  it("si distrugge come un ponte", () => {
    let game = place(newGame(noBridge), "x", "AAA", RIVERBANK, ["engineer"]);
    game = order(game, { type: "work", army: "x", work: "pontoon" }, "AAA", noBridge);
    game = advance(game, noBridge, ENGINEERING.pontoonMinutes);
    const pontoon = Object.values(game.pontoons)[0]!;
    game = place(game, "z", "BBB", pontoon.at, ["infantry"]);
    game = order(game, { type: "work", army: "z", work: "demolish" }, "BBB", noBridge);
    game = advance(game, noBridge, game.time + ENGINEERING.demolishMinutes);
    expect(game.pontoons).toEqual({});
    expect(game.events.at(-1)).toMatchObject({ what: "pontoonDestroyed", by: "BBB" });
  });
});

describe("sanità e ospedali", () => {
  it("la sanità cura anche fuori dal proprio territorio", () => {
    let game = place(newGame(), "x", "AAA", cell(12, 0), ["infantry", "medic"], 5);
    game = { ...game, provinces: { ...game.provinces, A3: { owner: "BBB", morale: 100 } } };
    game = advance(game, world, 30);
    expect(game.armies.x!.units[0]!.hp).toBeCloseTo(5 + UNIT_TYPES.infantry.hp * COMBAT.medicHealPerTick);
  });

  it("genio e sanità costruiscono un ospedale da campo che cura più in fretta", () => {
    let game = place(newGame(), "x", "AAA", cell(7, 0), ["engineer", "medic"]);
    const onlyEngineer = place(game, "w", "AAA", cell(7, 0), ["engineer"]);
    expect(availableWorks(onlyEngineer, world, onlyEngineer.armies.w!, 0).find((o) => o.work === "hospital")!.missing).toBe("Serve la sanità.");
    game = order(game, { type: "work", army: "x", work: "hospital" });
    game = advance(game, world, ENGINEERING.hospitalMinutes);
    expect(Object.values(game.hospitals)).toHaveLength(1);

    game = place(game, "y", "AAA", [0.77, 0.43], ["infantry"], 5);
    game = advance(game, world, game.time + 30);
    expect(game.armies.y!.units[0]!.hp).toBeCloseTo(5 + UNIT_TYPES.infantry.hp * COMBAT.hospitalHealPerTick);
  });

  it("l'ospedale va perso se arrivano nemici e nessuno lo difende", () => {
    let game = place(newGame(), "x", "AAA", cell(7, 0), ["engineer", "medic"]);
    game = order(game, { type: "work", army: "x", work: "hospital" });
    game = advance(game, world, ENGINEERING.hospitalMinutes);
    const { x: _x, ...armies } = game.armies;
    game = { ...game, armies, relations: { ...game.relations }, events: [...game.events] };
    startWar(game, "BBB", "AAA", game.time);
    game = place(game, "z", "BBB", [0.77, 0.43], ["infantry"]);
    game = advance(game, world, game.time + 30);
    expect(game.hospitals).toEqual({});
    expect(game.events.at(-1)).toMatchObject({ what: "hospitalLost", by: "AAA" });
  });
});
