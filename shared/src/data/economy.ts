import type { ResourceId } from "../map/types.js";

// Valori di partenza per il bilanciamento dell'economia (vedi docs/game-design.md, §3).
// Si ritoccano qui, giocando.

export const RESOURCE_IDS: readonly ResourceId[] = ["food", "goods", "metal", "oil", "money", "manpower"];

export const RESOURCE_NAMES: Record<ResourceId, string> = {
  food: "Cibo",
  goods: "Beni",
  metal: "Metallo",
  oil: "Petrolio",
  money: "Denaro",
  manpower: "Manodopera",
};

export const ECONOMY = {
  /** Le risorse vengono accreditate a ogni tick, cioè ogni 30 minuti di gioco. */
  tickMinutes: 30,
  dayMinutes: 24 * 60,

  /**
   * Produzione giornaliera di una provincia core con morale al 100%, ricavata da popolazione (migliaia di abitanti)
   * e sviluppo (PIL pro capite in migliaia di dollari del 1990). Vedi docs/game-design.md, §3.
   */
  perDay: {
    /** Manodopera per migliaio di abitanti. */
    manpowerPerThousand: 0.38,
    /** Denaro per migliaio di abitanti, per ogni 1000 $ di PIL pro capite. */
    moneyPerThousand: 0.085,
    /** Beni o metallo (risorsa principale) per migliaio di abitanti, per ogni 1000 $ di PIL pro capite. */
    industryPerThousand: 0.27,
    /** Cibo (risorsa principale) per migliaio di abitanti, per la radice del PIL pro capite in migliaia: le campagne povere rendono comunque. */
    foodPerThousand: 0.8,
    /** Petrolio per ogni milione di tonnellate estratte nel 1938 dal giacimento. */
    oilPerMt: 2000,
    /** Minimo di risorsa principale (beni, metallo, cibo) anche nelle province poco abitate: miniere e campi isolati. */
    mainMinimum: 600,
  },
  /** Le province conquistate (non core) producono solo questa frazione. */
  nonCoreFactor: 0.25,

  /** Scorte iniziali: pari a questi giorni di produzione della nazione (per il petrolio, almeno la riserva storica). */
  startingStockDays: 3,
} as const;

export type EconomyConfig = typeof ECONOMY;

/**
 * Mercato estero: il resto del mondo (Stati Uniti, Venezuela, Medio Oriente, colonie) non è sulla mappa,
 * ma vende risorse a chi può farle arrivare. Vedi docs/game-design.md, §3.
 */
export const TRADE = {
  /** Risorse in vendita e prezzo in denaro di ogni unità. */
  prices: { oil: 1.2 } as Partial<Record<ResourceId, number>>,
  /** Prezzo del petrolio delle concessioni (fino alla quota della nazione). */
  concessionPrice: 0.5,
  /** Capacità di importazione al giorno di ogni città costiera posseduta (porto commerciale). */
  portCityPerDay: 2500,
  /** Capacità in più per ogni livello di porto costruito dal genio. */
  portPerLevel: 1500,
  /** Importazioni via terra: per ogni nazione confinante con cui non si è in guerra... */
  overlandPerNeighbor: 800,
  /** ...fino a questo massimo. */
  overlandMax: 2400,
  /** Massimo che si può chiedere in un contratto, al giorno. */
  maxContractPerDay: 100_000,
};
