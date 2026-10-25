// Valori di partenza per combattimento e conquista (vedi docs/game-design.md, §9 e §10).
// I danni delle singole unità stanno in units.ts.

export const COMBAT = {
  /** Due armate nemiche entro questa distanza combattono. */
  contactKm: 5,
  /**
   * Ogni quanti minuti di gioco si controllano contatti, confini e conquiste.
   * Gli orari sono fissi (multipli di questo valore), così il risultato non dipende
   * da quante volte si fa avanzare la partita.
   */
  sampleMinutes: 5,
  /**
   * Senza rete di movimento (solo nei test) la provincia si conquista passando entro questa distanza dal centro.
   * Con la rete basta attraversarla.
   */
  captureKm: 3,
  /** Limite di gruppo: le prime `groupFull` unità colpiscono in pieno, poi il contributo cala fino a zero a `groupMax`. */
  groupFull: 10,
  groupMax: 20,
  /** Efficienza = minEfficiency + (1 − minEfficiency) × salute: 100% a piena salute, 60% a metà. */
  minEfficiency: 0.2,
  /** Guarigione per tick (frazione dei punti salute massimi) di un'armata ferma, nel proprio territorio e lontana dai nemici. */
  healPerTick: 0.03,
  /** Con la sanità nell'armata: guarigione più rapida, anche fuori dal proprio territorio. */
  medicHealPerTick: 0.06,
  /** Entro il raggio di un proprio ospedale da campo. */
  hospitalHealPerTick: 0.1,
  /** Messa in batteria: minuti da fermo prima che le unità con gittata (artiglieria) possano sparare da lontano. */
  setupMinutes: 30,
  /** Artiglieria e aerei da soli non portano il morale di una provincia sotto questa soglia: il resto lo fanno conquista e accerchiamento. */
  moraleFloor: 20,
  /** Morale di una provincia appena conquistata. */
  conqueredMorale: 25,
  /** A ogni cambio giorno il morale delle province core si sposta di questa frazione della distanza dall'obiettivo. */
  moraleDailyStep: 0.22,
  /** Province conquistate: il morale sale di questi punti a ogni cambio giorno senza rivolte. */
  conqueredMoraleDailyGain: 5,
  /** Province conquistate senza armate dentro e con il morale sotto `revoltBelowMorale`: probabilità di rivolta a ogni cambio giorno. */
  revoltChance: 0.05,
  revoltBelowMorale: 30,
  moraleTarget: 100,
  /** Eventi conservati nel registro della partita (i più vecchi si scartano). */
  maxEvents: 200,
} as const;
