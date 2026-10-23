import type { ResourceId } from "../map/types.js";

// Valori di partenza per il bilanciamento dell'economia (vedi docs/game-design.md, §3).
// Si ritoccano qui, giocando.

export const RESOURCE_IDS: readonly ResourceId[] = ["food", "goods", "metal", "oil", "rare", "money", "manpower"];

export const RESOURCE_NAMES: Record<ResourceId, string> = {
  food: "Cibo",
  goods: "Beni",
  metal: "Metallo",
  oil: "Petrolio",
  rare: "Materiali rari",
  money: "Denaro",
  manpower: "Manodopera",
};

export const ECONOMY = {
  /** Le risorse vengono accreditate a ogni tick, cioè ogni 30 minuti di gioco. */
  tickMinutes: 30,
  dayMinutes: 24 * 60,

  /** Produzione giornaliera di una provincia core con morale al 100%. */
  perDay: {
    urban: { main: 6000, money: 3000, manpower: 1500 },
    rural: { main: 1500, money: 1000, manpower: 800 },
  },
  /** Una provincia rurale senza risorsa principale produce più manodopera. */
  ruralManpowerWithoutResource: 2400,
  /** Le province conquistate (non core) producono solo questa frazione. */
  nonCoreFactor: 0.25,

  /** Scorte iniziali: pari a questi giorni di produzione della nazione. */
  startingStockDays: 3,
} as const;

export type EconomyConfig = typeof ECONOMY;
