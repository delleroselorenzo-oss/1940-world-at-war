import { useState } from "react";
import { formatGameTime, MARKET, marketBook, orderMoney, RESOURCE_NAMES, type GameState, type MainResourceId, type Order } from "@waw/shared";
import type { LoadedMap } from "./map/loadMap.js";
import { formatAmount } from "./ui/format.js";
import { ResourceIcon } from "./ui/ResourceIcon.js";

// Borsa degli scambi tra nazioni: libro delle offerte e delle richieste, nuovo ordine, i tuoi ordini, ultimi scambi.

interface MarketSectionProps {
  map: LoadedMap;
  game: GameState;
  order(o: Order): string | null;
}

const price = new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function MarketSection({ map, game, order }: MarketSectionProps) {
  const me = game.playerNation;
  const [resource, setResource] = useState<MainResourceId>(MARKET.resources[0]!);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("1000");
  const [unitPrice, setUnitPrice] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const book = marketBook(game, resource);
  const mine = game.market.orders.filter((o) => o.nation === me);
  const trades = game.market.trades
    .filter((t) => t.resource === resource)
    .slice(-8)
    .reverse();
  const qty = Number(amount);
  const p = Number(unitPrice);
  const stock = game.nations[me]!.stock;
  const name = (id: string) => (id === me ? "tu" : (map.nations.get(id)?.name ?? id));

  return (
    <>
      <p className="muted small">
        Metti un'offerta di vendita o una richiesta d'acquisto: lo scambio avviene solo quando un'altra nazione accetta il tuo prezzo o ne propone uno
        migliore. Finché l'ordine è aperto la merce (o il denaro) resta accantonata; ritirandolo torna indietro.
      </p>

      <div className="chips" role="tablist" aria-label="Risorsa">
        {MARKET.resources.map((r) => (
          <button
            key={r}
            role="tab"
            aria-selected={r === resource}
            className={r === resource ? "chip active" : "chip"}
            onClick={() => setResource(r)}
          >
            <ResourceIcon resource={r} /> {RESOURCE_NAMES[r]}
          </button>
        ))}
      </div>

      <div className="book">
        <BookSide title="Offerte (in vendita)" rows={book.sell} empty="Nessuno vende." />
        <BookSide title="Richieste (in acquisto)" rows={book.buy} empty="Nessuno compra." />
      </div>

      <h3>Nuovo ordine</h3>
      <form
        className="market-form"
        onSubmit={(e) => {
          e.preventDefault();
          setError(order({ type: "placeMarketOrder", side, resource, amount: qty, price: p }));
        }}
      >
        <div className="segmented" role="radiogroup" aria-label="Tipo di ordine">
          <button type="button" role="radio" aria-checked={side === "buy"} className={side === "buy" ? "active" : ""} onClick={() => setSide("buy")}>
            Compra
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={side === "sell"}
            className={side === "sell" ? "active" : ""}
            onClick={() => setSide("sell")}
          >
            Vendi
          </button>
        </div>
        <label>
          Quantità
          <input type="number" min={MARKET.minAmount} step={100} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label>
          Prezzo l'uno
          <input
            type="number"
            min={MARKET.minPrice}
            max={MARKET.maxPrice}
            step={0.05}
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
          />
        </label>
        <p className="small">
          {side === "buy"
            ? `Accantoni ${formatAmount(qty * p || 0)} di denaro (ne hai ${formatAmount(stock.money)}).`
            : `Accantoni ${formatAmount(qty || 0)} di ${RESOURCE_NAMES[resource].toLowerCase()} (ne hai ${formatAmount(stock[resource])}); incassi ${formatAmount(qty * p || 0)} di denaro.`}
        </p>
        <button className="button small" type="submit">
          {side === "buy" ? "Metti la richiesta" : "Metti l'offerta"}
        </button>
      </form>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}

      <h3>I tuoi ordini</h3>
      {mine.length === 0 ? (
        <p className="muted small">Nessun ordine aperto.</p>
      ) : (
        <ul className="plain-list market-orders">
          {mine.map((o) => (
            <li key={o.id}>
              <ResourceIcon resource={o.resource} />
              <span>
                {o.side === "buy" ? "Compri" : "Vendi"} {formatAmount(o.amount)} a {price.format(o.price)}
                <span className="muted small">
                  {" "}
                  · {o.side === "buy" ? `${formatAmount(orderMoney(o))} di denaro accantonato` : "merce accantonata"}
                </span>
              </span>
              <button className="link-button" onClick={() => setError(order({ type: "cancelMarketOrder", id: o.id }))}>
                Ritira
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3>Ultimi scambi: {RESOURCE_NAMES[resource].toLowerCase()}</h3>
      {trades.length === 0 ? (
        <p className="muted small">Ancora nessuno scambio.</p>
      ) : (
        <ul className="plain-list">
          {trades.map((t, i) => (
            <li key={i} className="small">
              <span className="muted">{formatGameTime(t.time)}</span> · {formatAmount(t.amount)} a {price.format(t.price)} · {name(t.seller)} →{" "}
              {name(t.buyer)}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function BookSide({ title, rows, empty }: { title: string; rows: { price: number; amount: number }[]; empty: string }) {
  return (
    <div>
      <h4>{title}</h4>
      {rows.length === 0 ? (
        <p className="muted small">{empty}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Prezzo</th>
              <th>Quantità</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 6).map((r) => (
              <tr key={r.price}>
                <td>{price.format(r.price)}</td>
                <td>{formatAmount(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
