import { describe, expect, it } from "vitest";
import { CONVOY, type ShipTypeId } from "../data/naval.js";
import { TRADE } from "../data/economy.js";
import type { LngLat } from "../map/types.js";
import { blockadedPorts } from "./blockade.js";
import { pairKey } from "./diplomacy.js";
import { advance, createGame } from "./engine.js";
import { newFleet, newShip } from "./navy.js";
import type { GameState } from "./state.js";
import { cell, testWorld } from "./testMaps.js";
import { importCapacityPerDay } from "./trade.js";

// Mondo di prova con la porta dei convogli in fondo al mare (colonna 20, riga 4). AAA ha due porti: la città costiera A1
// (senza approdo nella griglia: non si blocca e i convogli non ci vanno) e l'isola A9 con un porto del genio (approdo nella colonna 21, riga 2).
const world = testWorld({ gates: true });
const DAY = 1440;

function newGame(war = true): GameState {
  const game = { ...createGame(world.map, { playerNation: "AAA", realNowMs: 0, seed: 0 }), armies: {} };
  game.buildings = { ...game.buildings, A9: { ...game.buildings.A9, port: 1 } };
  game.nations.AAA = { ...game.nations.AAA!, imports: { food: 1000 } };
  game.nations.AAA.stock = { ...game.nations.AAA.stock, food: 0, money: 100_000 };
  if (war) game.relations[pairKey("AAA", "BBB")] = { war: true, warSince: 0, passage: false, sharedVision: false };
  return game;
}

function fleet(game: GameState, owner: string, at: LngLat, types: ShipTypeId[]) {
  const f = newFleet(game, owner, at, null);
  f.ships.push(...types.map((t) => newShip(game, t)));
  return f;
}

const convoys = (game: GameState) => Object.values(game.fleets).filter((f) => f.convoy);

describe("convogli", () => {
  it("le importazioni via mare partono a mezzanotte con un convoglio, pagato alla partenza, e arrivano in porto", () => {
    let game = newGame(false);
    // Senza convoglio non arriva niente: i porti non ricevono più a ogni tick.
    game = advance(game, world, DAY - 30);
    expect(game.nations.AAA!.stock.food).toBeLessThan(1);
    game = advance(game, world, DAY);
    const [c] = convoys(game);
    expect(c?.convoy).toMatchObject({ to: "A9", gate: "ocean" });
    expect(c!.convoy!.cargo.food).toBeCloseTo(1000);
    expect(c!.convoy!.maxHp).toBe(CONVOY.minHp);
    // Pagato alla partenza: rispetto a una partita senza contratto mancano 1.000 × il prezzo del cibo.
    const free = newGame(false);
    free.nations.AAA = { ...free.nations.AAA!, imports: {} };
    expect(advance(free, world, DAY).nations.AAA!.stock.money - game.nations.AAA!.stock.money).toBeCloseTo(1000 * TRADE.prices.food!);
    game = advance(game, world, DAY + 6 * 60);
    expect(convoys(game)).toHaveLength(0);
    expect(game.nations.AAA!.stock.food).toBeCloseTo(1000);
  });

  it("un sottomarino nemico vicino alla rotta affonda il convoglio e il carico va perso", () => {
    let game = newGame();
    fleet(game, "BBB", cell(21, 3), ["submarine"]);
    game = advance(game, world, DAY + 6 * 60);
    expect(convoys(game)).toHaveLength(0);
    expect(game.events.some((e) => e.type === "convoySunk" && e.owner === "AAA" && e.by === "BBB")).toBe(true);
    expect(game.nations.AAA!.stock.food).toBeLessThan(500);
  });

  it("una flotta di superficie nemica blocca i porti della zona; una nave propria (o alleata) toglie il blocco", () => {
    const game = newGame();
    fleet(game, "BBB", cell(20, 0), ["submarine"]);
    expect(blockadedPorts(world.map, game, world.nav!, "AAA").size).toBe(0); // i sottomarini non bloccano
    fleet(game, "BBB", cell(21, 0), ["destroyer"]);
    expect([...blockadedPorts(world.map, game, world.nav!, "AAA")]).toEqual(["A9"]);
    const capacity = importCapacityPerDay(world.map, game, "AAA", world.nav);
    expect(capacity.sea).toBe(TRADE.portCityPerDay);
    expect(capacity.blockadedPerDay).toBe(TRADE.portPerLevel);
    // Senza guerra niente blocco.
    expect(blockadedPorts(world.map, newGame(false), world.nav!, "AAA").size).toBe(0);
    fleet(game, "AAA", cell(21, 4), ["destroyer"]);
    expect(blockadedPorts(world.map, game, world.nav!, "AAA").size).toBe(0);
  });

  it("con i porti bloccati non parte nessun convoglio", () => {
    let game = newGame();
    fleet(game, "BBB", cell(20, 0), ["battleship"]);
    game = advance(game, world, DAY);
    expect(convoys(game)).toHaveLength(0);
  });

  it("se il porto d'arrivo è perso e non ce n'è un altro, il carico va perso", () => {
    let game = newGame(false);
    game = advance(game, world, DAY);
    game.provinces = { ...game.provinces, A9: { ...game.provinces.A9!, owner: "BBB" } };
    game = advance(game, world, DAY + 6 * 60);
    expect(convoys(game)).toHaveLength(0);
    expect(game.events.some((e) => e.type === "convoySunk" && e.by === null)).toBe(true);
    expect(game.nations.AAA!.stock.food).toBeLessThan(1);
  });
});
