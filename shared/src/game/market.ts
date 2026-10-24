import { MARKET } from "../data/diplomacy.js";
import type { MainResourceId, NationId } from "../map/types.js";
import { tradeBlocked } from "./diplomacy.js";
import type { GameState, MarketOrder, MarketTrade } from "./state.js";

// Borsa degli scambi tra nazioni: chi vende mette un'offerta (risorsa e prezzo), chi compra una richiesta.
// Uno scambio avviene solo quando una richiesta incontra un'offerta allo stesso prezzo o migliore,
// al prezzo di chi era in borsa per primo. Quando si mette un ordine le risorse (o il denaro) vengono
// accantonate; si riprendono annullando l'ordine. Niente scambi tra nazioni in guerra o sotto embargo.

/** Arrotonda un prezzo al centesimo. */
export const roundPrice = (p: number) => Math.round(p * 100) / 100;

/** Denaro accantonato da una richiesta d'acquisto. */
export const orderMoney = (o: { amount: number; price: number }) => o.amount * o.price;

/** Perché l'ordine non si può mettere (null = si può). */
export function marketOrderMissing(
  state: GameState,
  nation: NationId,
  side: "buy" | "sell",
  resource: MainResourceId,
  amount: number,
  price: number,
): string | null {
  if (!MARKET.resources.includes(resource)) return "Questa risorsa non si scambia in borsa.";
  if (!Number.isFinite(amount) || amount < MARKET.minAmount || amount > MARKET.maxAmount)
    return `Quantità tra ${MARKET.minAmount} e ${MARKET.maxAmount}.`;
  if (!Number.isFinite(price) || price < MARKET.minPrice || price > MARKET.maxPrice) return `Prezzo tra ${MARKET.minPrice} e ${MARKET.maxPrice}.`;
  if (state.market.orders.filter((o) => o.nation === nation).length >= MARKET.maxOpenOrders) return "Hai già troppi ordini aperti.";
  const stock = state.nations[nation]?.stock;
  if (!stock) return "Nazione non valida.";
  if (side === "sell" && stock[resource] < amount) return "Non hai abbastanza da vendere.";
  if (side === "buy" && stock.money < orderMoney({ amount, price })) return "Non hai abbastanza denaro.";
  return null;
}

/**
 * Mette un ordine in borsa e lo scambia subito con gli ordini opposti compatibili (i più convenienti, poi i più vecchi).
 * Va chiamata dopo `marketOrderMissing`. Modifica `state` (una copia di lavoro): stock, ordini e scambi.
 */
export function placeMarketOrder(state: GameState, order: MarketOrder): MarketTrade[] {
  const nations = { ...state.nations };
  const touch = (id: NationId) => {
    const n = nations[id]!;
    if (n === state.nations[id]) nations[id] = { ...n, stock: { ...n.stock } };
    return nations[id]!.stock;
  };
  // Accantona.
  if (order.side === "sell") touch(order.nation)[order.resource] -= order.amount;
  else touch(order.nation).money -= orderMoney(order);

  const book = state.market.orders.map((o) => ({ ...o }));
  const opposite = book
    .filter(
      (o) =>
        o.side !== order.side &&
        o.resource === order.resource &&
        o.nation !== order.nation &&
        (order.side === "buy" ? o.price <= order.price : o.price >= order.price) &&
        !tradeBlocked(state, o.nation, order.nation),
    )
    .sort((a, b) => (order.side === "buy" ? a.price - b.price : b.price - a.price) || a.time - b.time);

  const trades: MarketTrade[] = [];
  let left = order.amount;
  for (const o of opposite) {
    if (left <= 0) break;
    const amount = Math.min(left, o.amount);
    const price = o.price;
    const seller = order.side === "sell" ? order.nation : o.nation;
    const buyer = order.side === "buy" ? order.nation : o.nation;
    // Il venditore riceve il denaro, il compratore la merce (la merce e il denaro erano già accantonati).
    touch(seller).money += amount * price;
    touch(buyer)[order.resource] += amount;
    // Chi compra al prezzo di un'offerta più bassa di quanto aveva accantonato riprende la differenza.
    if (order.side === "buy") touch(buyer).money += amount * (order.price - price);
    o.amount -= amount;
    left -= amount;
    trades.push({ time: state.time, resource: order.resource, amount, price, seller, buyer });
  }

  const orders = book.filter((o) => o.amount > 0);
  if (left > 0) orders.push({ ...order, amount: left });
  state.nations = nations;
  state.market = { orders, trades: [...state.market.trades, ...trades].slice(-MARKET.tradesKept) };
  return trades;
}

/** Ritira un ordine: torna quello che era accantonato. Modifica `state` (una copia di lavoro). */
export function cancelMarketOrder(state: GameState, id: string): MarketOrder | null {
  const order = state.market.orders.find((o) => o.id === id);
  if (!order) return null;
  const n = state.nations[order.nation]!;
  const stock = { ...n.stock };
  if (order.side === "sell") stock[order.resource] += order.amount;
  else stock.money += orderMoney(order);
  state.nations = { ...state.nations, [order.nation]: { ...n, stock } };
  state.market = { ...state.market, orders: state.market.orders.filter((o) => o.id !== id) };
  return order;
}

/** Libro di una risorsa per l'interfaccia: offerte dalla più conveniente, richieste dalla più alta, raggruppate per prezzo. */
export function marketBook(
  state: GameState,
  resource: MainResourceId,
): { sell: { price: number; amount: number }[]; buy: { price: number; amount: number }[] } {
  const group = (side: "buy" | "sell") => {
    const byPrice = new Map<number, number>();
    for (const o of state.market.orders) if (o.side === side && o.resource === resource) byPrice.set(o.price, (byPrice.get(o.price) ?? 0) + o.amount);
    return [...byPrice].map(([price, amount]) => ({ price, amount })).sort((a, b) => (side === "sell" ? a.price - b.price : b.price - a.price));
  };
  return { sell: group("sell"), buy: group("buy") };
}
