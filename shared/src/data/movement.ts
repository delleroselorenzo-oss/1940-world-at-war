// Valori di partenza per il movimento (vedi docs/game-design.md, §8).

export const MOVEMENT = {
  /** Fuori strada si va a questa frazione della velocità dell'unità. */
  offRoadFactor: 0.5,
  /** Su strada si va alla velocità piena dell'unità. */
  roadFactor: 1,
  /** In treno tutte le unità vanno a questa velocità fissa (media di un convoglio militare con soste e incroci). */
  railSpeedKmh: 35,
  /** Nel proprio territorio, dove il morale della provincia è almeno `railHomeMinMorale`, il treno va più veloce. */
  railHomeSpeedKmh: 55,
  railHomeMinMorale: 70,
  /** Salire o scendere dal treno: tanti minuti per unità, entro questi limiti (vale per ciascuna delle due operazioni). */
  railBoardMinutesPerUnit: 15,
  railBoardMinMinutes: 15,
  railBoardMaxMinutes: 120,
  /** Due armate della stessa nazione ferme entro questa distanza si uniscono. */
  mergeRadiusKm: 3,
} as const;
