// Valori di partenza per i lavori sul campo: ponti, ponti di barche, ospedali (docs/game-design.md, §8).

export const ENGINEERING = {
  /** Distanza massima dell'armata dal ponte da distruggere o riparare. */
  bridgeRadiusKm: 3,
  /** Distanza massima dell'armata dal tratto di fiume su cui gettare un ponte di barche. */
  riverRadiusKm: 8,
  /** Durate in minuti di gioco. Distruggere lo può fare qualsiasi armata; il resto richiede il genio. */
  demolishMinutes: 60,
  repairMinutes: 8 * 60,
  pontoonMinutes: 6 * 60,
  hospitalMinutes: 4 * 60,
  /** Più unità del genio lavorano più in fretta: la durata si divide per il loro numero, fino a questo. */
  maxEngineers: 3,
  /** Raggio d'azione di un ospedale da campo (cura e difesa). */
  hospitalRadiusKm: 5,
} as const;
