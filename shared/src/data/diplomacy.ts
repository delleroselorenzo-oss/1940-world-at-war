import type { MainResourceId } from "../map/types.js";

// Diplomazia e borsa degli scambi: valori di partenza per il bilanciamento (vedi docs/game-design.md, §11).

export const DIPLOMACY = {
  /** Ore di gioco entro cui rispondere a una proposta, poi scade. */
  proposalHours: 72,
  /** Durata di una tregua, in giorni di gioco: finita la tregua la guerra riprende. */
  truceDays: 7,
  /**
   * Ore dopo una pace o una tregua in cui le armate rimaste nel territorio dell'altro
   * possono muoversi (per ritirarsi) senza far ripartire la guerra.
   */
  withdrawHours: 24,
  /** Messaggi tenuti in ogni chat. */
  chatKept: 100,
  /** Lunghezza massima di un messaggio. */
  messageMaxLength: 500,
  /** Proposte già chiuse (accettate, rifiutate, scadute) tenute nello storico. */
  proposalsKept: 200,
  /**
   * Come rispondono i bot finché non avranno un comportamento proprio:
   * tregua dopo tante ore di guerra, pace dopo tanti giorni; visione condivisa sì;
   * passaggio solo agli alleati; alleanza solo con chi ha un nemico in comune.
   */
  bot: {
    truceAfterHours: 24,
    peaceAfterDays: 3,
  },
} as const;

export const MARKET = {
  /** Risorse che si scambiano in borsa (il denaro è la moneta di pagamento). */
  resources: ["food", "goods", "metal", "oil"] as readonly MainResourceId[],
  /** Prezzo in denaro per unità. */
  minPrice: 0.05,
  maxPrice: 50,
  /** Quantità minima e massima di un ordine. */
  minAmount: 100,
  maxAmount: 1_000_000,
  /** Ordini aperti per nazione. */
  maxOpenOrders: 12,
  /** Scambi conclusi tenuti nello storico. */
  tradesKept: 60,
} as const;
