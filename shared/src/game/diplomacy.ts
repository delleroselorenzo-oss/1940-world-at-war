import { COMBAT } from "../data/combat.js";
import type { NationId } from "../map/types.js";
import type { GameState, Relation } from "./state.js";

// Rapporti tra nazioni (versione minima: guerra, diritto di passaggio, visione condivisa).
// Pace e accordi si potranno negoziare quando arriverà la diplomazia vera.

const NO_RELATION: Relation = { war: false, passage: false, sharedVision: false };

/** Chiave di una coppia di nazioni, uguale in entrambi i versi. */
export function pairKey(a: NationId, b: NationId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function relationOf(state: GameState, a: NationId, b: NationId): Relation {
  return state.relations[pairKey(a, b)] ?? NO_RELATION;
}

export function atWar(state: GameState, a: NationId, b: NationId): boolean {
  return a !== b && relationOf(state, a, b).war;
}

/** Nazioni in guerra con `nation`. */
export function enemiesOf(state: GameState, nation: NationId): NationId[] {
  const out: NationId[] = [];
  for (const [key, r] of Object.entries(state.relations)) {
    if (!r.war) continue;
    const [a, b] = key.split("|") as [NationId, NationId];
    if (a === nation) out.push(b);
    else if (b === nation) out.push(a);
  }
  return out.sort();
}

/**
 * La nazione può stare nel territorio di `owner` senza che scoppi una guerra?
 * Sì se è suo, se sono già in guerra, o se tra le due c'è un accordo (passaggio o visione condivisa).
 */
export function mayEnter(state: GameState, nation: NationId, owner: NationId): boolean {
  if (owner === nation) return true;
  const r = relationOf(state, nation, owner);
  return r.war || r.passage || r.sharedVision;
}

/** Dichiarazione di guerra di `by` contro `against`, al minuto `time`. Modifica `state` (una copia di lavoro). */
export function startWar(state: GameState, by: NationId, against: NationId, time: number): void {
  if (by === against || atWar(state, by, against)) return;
  state.relations[pairKey(by, against)] = { ...relationOf(state, by, against), war: true };
  logEvent(state, { time, type: "war", by, against });
}

/** Aggiunge un evento al registro, scartando i più vecchi oltre il limite. Modifica `state`. */
export function logEvent(state: GameState, event: GameState["events"][number]): void {
  state.events.push(event);
  if (state.events.length > COMBAT.maxEvents) state.events.splice(0, state.events.length - COMBAT.maxEvents);
}
