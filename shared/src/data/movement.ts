// Valori di partenza per il movimento (vedi docs/game-design.md, §8).

export const MOVEMENT = {
  /** Fuori strada si va a questa frazione della velocità dell'unità. */
  offRoadFactor: 0.5,
  /** Su strada e ferrovia si va alla velocità piena (il trasporto su rotaia arriverà più avanti). */
  roadFactor: 1,
  railFactor: 1,
  /** Due armate della stessa nazione ferme entro questa distanza si uniscono. */
  mergeRadiusKm: 3,
} as const;
