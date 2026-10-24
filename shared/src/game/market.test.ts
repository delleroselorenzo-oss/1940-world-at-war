import { describe, expect, it } from "vitest";
import { createGame } from "./engine.js";
import { marketBook } from "./market.js";
import { applyOrder, type Order, type World } from "./orders.js";
import type { GameState } from "./state.js";
import { testWorld } from "./testMaps.js";

const world: World = testWorld();

function newGame(): GameState {
  const game = createGame(world.map, { playerNation: "AAA", realNowMs: 0 });
  const stock = { food: 10_000, goods: 10_000, metal: 10_000, oil: 10_000, money: 100_000, manpower: 0 };
  return { ...game, armies: {}, nations: { AAA: { stock: { ...stock } }, BBB: { stock: { ...stock } } } };
}

function order(state: GameState, o: Order, nation: string): GameState {
  const r = applyOrder(state, world, nation, o);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

const sell = (amount: number, price: number): Order => ({ type: "placeMarketOrder", side: "sell", resource: "metal", amount, price });
const buy = (amount: number, price: number): Order => ({ type: "placeMarketOrder", side: "buy", resource: "metal", amount, price });

describe("borsa degli scambi", () => {
  it("un'offerta resta in borsa con la merce accantonata finché qualcuno non la prende", () => {
    const g = order(newGame(), sell(1000, 2), "AAA");
    expect(g.nations.AAA!.stock.metal).toBe(9000);
    expect(marketBook(g, "metal").sell).toEqual([{ price: 2, amount: 1000 }]);
    expect(g.market.trades).toEqual([]);
  });

  it("una richiesta a prezzo uguale o più alto compra al prezzo dell'offerta", () => {
    let g = order(newGame(), sell(1000, 2), "AAA");
    g = order(g, buy(600, 3), "BBB");
    expect(g.market.trades).toMatchObject([{ amount: 600, price: 2, seller: "AAA", buyer: "BBB" }]);
    expect(g.nations.BBB!.stock.metal).toBe(10_600);
    // Ha pagato 600 × 2, non 600 × 3.
    expect(g.nations.BBB!.stock.money).toBe(100_000 - 1200);
    expect(g.nations.AAA!.stock.money).toBe(100_000 + 1200);
    expect(marketBook(g, "metal").sell).toEqual([{ price: 2, amount: 400 }]);
  });

  it("una richiesta troppo bassa resta in borsa, e si ritira con il rimborso", () => {
    let g = order(newGame(), sell(1000, 2), "AAA");
    g = order(g, buy(500, 1.5), "BBB");
    expect(g.market.trades).toEqual([]);
    expect(g.nations.BBB!.stock.money).toBe(100_000 - 750);
    const id = g.market.orders.find((o) => o.nation === "BBB")!.id;
    g = order(g, { type: "cancelMarketOrder", id }, "BBB");
    expect(g.nations.BBB!.stock.money).toBe(100_000);
  });

  it("niente scambi con chi è sotto embargo", () => {
    let g = order(newGame(), sell(1000, 2), "AAA");
    g = order(g, { type: "setEmbargo", against: "AAA", on: true }, "BBB");
    g = order(g, buy(500, 3), "BBB");
    expect(g.market.trades).toEqual([]);
  });

  it("non si vende quello che non si ha", () => {
    const r = applyOrder(newGame(), world, "AAA", sell(50_000, 2));
    expect(r.ok).toBe(false);
  });
});
