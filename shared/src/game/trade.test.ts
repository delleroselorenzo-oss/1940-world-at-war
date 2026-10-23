import { describe, expect, it } from "vitest";
import { BUILDINGS } from "../data/buildings.js";
import { ECONOMY, TRADE } from "../data/economy.js";
import { ENGINEERING } from "../data/engineering.js";
import { UNIT_TYPES, type UnitTypeId } from "../data/units.js";
import type { LngLat, MapData } from "../map/types.js";
import { startWar } from "./diplomacy.js";
import { advance, createGame } from "./engine.js";
import { provinceProductionPerDay } from "./economy.js";
import { applyOrder, type Order, type World } from "./orders.js";
import type { Army, GameState } from "./state.js";
import { cell, testWorld } from "./testMaps.js";
import { importCapacityPerDay, importFlows } from "./trade.js";
import { availableWorks } from "./works.js";

// Mondo di prova: A1 è una città costiera di AAA; A2 confina con B1 (BBB) per le importazioni via terra;
// A2 ha un giacimento di petrolio.
const base = testWorld();
const map: MapData = {
  ...base.map,
  nations: base.map.nations.map((n) => (n.id === "AAA" ? { ...n, oilReserve: 5000, oilConcessionPerDay: 1000 } : n)),
  provinces: base.map.provinces.map((p) =>
    p.id === "A2"
      ? { ...p, resource: "oil", oilMtPerYear: 2, neighbors: [{ id: "B1", distanceKm: 100 }] }
      : p.id === "B1"
        ? { ...p, neighbors: [{ id: "A2", distanceKm: 100 }] }
        : p,
  ),
};
const world: World = { map, nav: base.nav };
const DAY = ECONOMY.dayMinutes;

function newGame(): GameState {
  const game = createGame(map, { playerNation: "AAA", realNowMs: 0 });
  return { ...game, armies: {} };
}

function order(state: GameState, o: Order, nation = "AAA"): GameState {
  const r = applyOrder(state, world, nation, o);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

function withStock(state: GameState, nation: string, stock: Partial<GameState["nations"][string]["stock"]>): GameState {
  const n = state.nations[nation]!;
  return { ...state, nations: { ...state.nations, [nation]: { ...n, stock: { ...n.stock, ...stock } } } };
}

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

describe("riserve iniziali", () => {
  it("chi ha una riserva storica parte con quel petrolio", () => {
    const game = newGame();
    expect(game.nations.AAA!.stock.oil).toBe(Math.max(5000, 2 * ECONOMY.perDay.oilPerMt * ECONOMY.startingStockDays));
  });
});

describe("mercato estero", () => {
  it("capacità: città costiere, porti e vicini in pace", () => {
    let game = newGame();
    expect(importCapacityPerDay(map, game, "AAA")).toEqual({ sea: TRADE.portCityPerDay, overland: TRADE.overlandPerNeighbor, total: TRADE.portCityPerDay + TRADE.overlandPerNeighbor });
    game = { ...game, buildings: { ...game.buildings, A1: { ...game.buildings.A1, port: 1 } } };
    expect(importCapacityPerDay(map, game, "AAA").sea).toBe(TRADE.portCityPerDay + TRADE.portPerLevel);
    // In guerra con l'unico vicino, la via di terra si chiude.
    game = { ...game, relations: { ...game.relations }, events: [...game.events] };
    startWar(game, "AAA", "BBB", 0);
    expect(importCapacityPerDay(map, game, "AAA").overland).toBe(0);
  });

  it("il contratto compra ogni giorno, prima la quota delle concessioni a prezzo scontato", () => {
    let game = withStock(newGame(), "AAA", { money: 100_000, oil: 0 });
    game = order(game, { type: "setImport", resource: "oil", perDay: 3000 });
    const [flow] = importFlows(map, game, "AAA");
    expect(flow).toMatchObject({ perDay: 3000, concession: 1000 });
    expect(flow!.cost).toBeCloseTo(1000 * TRADE.concessionPrice + 2000 * TRADE.prices.oil!);

    const production = provinceProductionPerDay(map.provinces.find((p) => p.id === "A2")!, game.provinces.A2!);
    const after = advance(game, world, DAY);
    expect(after.nations.AAA!.stock.oil).toBeCloseTo(3000 + production.oil);
  });

  it("non si importa più della capacità", () => {
    let game = withStock(newGame(), "AAA", { money: 1_000_000 });
    game = order(game, { type: "setImport", resource: "oil", perDay: 50_000 });
    expect(importFlows(map, game, "AAA")[0]!.perDay).toBe(TRADE.portCityPerDay + TRADE.overlandPerNeighbor);
  });

  it("senza denaro si compra solo quello che si riesce a pagare", () => {
    let game = order(newGame(), { type: "setImport", resource: "oil", perDay: 1000 });
    // Solo la quota delle concessioni: 1000 al giorno a prezzo scontato; denaro per mezza giornata, senza produzione.
    game = withStock({ ...game, provinces: Object.fromEntries(Object.entries(game.provinces).map(([id, p]) => [id, { ...p, morale: 0 }])) }, "AAA", {
      money: 250,
      oil: 0,
    });
    const after = advance(game, world, DAY);
    expect(after.nations.AAA!.stock.money).toBeCloseTo(0);
    expect(after.nations.AAA!.stock.oil).toBeCloseTo(500);
  });

  it("solo le risorse in vendita; zero annulla il contratto", () => {
    expect(applyOrder(newGame(), world, "AAA", { type: "setImport", resource: "manpower", perDay: 100 }).ok).toBe(false);
    let game = order(newGame(), { type: "setImport", resource: "oil", perDay: 100 });
    game = order(game, { type: "setImport", resource: "oil", perDay: 0 });
    expect(game.nations.AAA!.imports).toEqual({});
  });
});

describe("carburante sintetico", () => {
  it("trasforma metallo in petrolio, fin dove basta il metallo", () => {
    let game = newGame();
    game = { ...game, buildings: { ...game.buildings, A1: { ...game.buildings.A1, syntheticFuel: 2 } } };
    const metalPerDay = 2 * BUILDINGS.syntheticMetalPerLevel;
    const oilPerDay = 2 * BUILDINGS.syntheticOilPerLevel;
    // Senza altra produzione: A1 produce beni, A2 petrolio (lo spegniamo sabotando i pozzi).
    game = { ...game, provinces: { ...game.provinces, A2: { ...game.provinces.A2!, wellsSabotaged: true } } };
    game = withStock(game, "AAA", { metal: metalPerDay / 2, oil: 0 });
    const after = advance(game, world, DAY);
    expect(after.nations.AAA!.stock.metal).toBeCloseTo(0);
    expect(after.nations.AAA!.stock.oil).toBeCloseTo(oilPerDay / 2);
  });
});

describe("pozzi di petrolio", () => {
  const inA2 = cell(7, 1);

  it("chi li possiede li sabota; poi non producono finché il genio non li ripara", () => {
    let game = place(newGame(), "x", "AAA", inA2, ["infantry"]);
    const options = availableWorks(game, world, game.armies.x!, 0);
    expect(options.find((o) => o.work === "sabotageWells")!.missing).toBeNull();
    expect(options.find((o) => o.work === "repairWells")!.missing).toBe("Serve il genio.");

    game = order(game, { type: "work", army: "x", work: "sabotageWells" });
    game = advance(game, world, ENGINEERING.sabotageWellsMinutes);
    expect(game.provinces.A2!.wellsSabotaged).toBe(true);
    expect(provinceProductionPerDay(map.provinces.find((p) => p.id === "A2")!, game.provinces.A2!).oil).toBe(0);
    expect(game.events.at(-1)).toMatchObject({ what: "wellsSabotaged", province: "A2" });

    game = place(game, "y", "AAA", inA2, ["engineer", "engineer", "engineer"]);
    game = order(game, { type: "work", army: "y", work: "repairWells" });
    game = advance(game, world, game.time + ENGINEERING.repairWellsMinutes / 3);
    expect(game.provinces.A2!.wellsSabotaged).toBeUndefined();
  });

  it("niente sabotaggi nelle province altrui", () => {
    let game = place(newGame(), "z", "BBB", inA2, ["infantry"]);
    expect(availableWorks(game, world, game.armies.z!, 0).find((o) => o.work === "sabotageWells")!.missing).toBe("Solo nelle tue province.");
    game = place(game, "x", "AAA", cell(2, 1), ["infantry"]);
    expect(availableWorks(game, world, game.armies.x!, 0).find((o) => o.work === "sabotageWells")!.missing).toBe("Nessun giacimento di petrolio qui.");
  });
});
