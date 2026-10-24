import { COMBAT } from "../data/combat.js";
import { DIPLOMACY } from "../data/diplomacy.js";
import type { NationId } from "../map/types.js";
import type { AgreementKind, GameState, Proposal, ProposalKind, Relation } from "./state.js";

// Rapporti tra nazioni: guerra, tregua, pace, accordi (passaggio, visione condivisa, alleanza), embargo.
// La guerra si dichiara da soli; pace, tregua e accordi si propongono e l'altro accetta o rifiuta;
// gli accordi si revocano da soli, l'embargo si decide da soli.

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

/** Tregua in corso tra le due nazioni. */
export function inTruce(state: GameState, a: NationId, b: NationId): boolean {
  const until = relationOf(state, a, b).truceUntil;
  return until !== undefined && until > state.time;
}

/** Le due nazioni hanno l'accordo (l'alleanza vale come passaggio e visione condivisa). */
export function hasAgreement(state: GameState, a: NationId, b: NationId, kind: AgreementKind): boolean {
  const r = relationOf(state, a, b);
  return r.alliance === true || (kind !== "alliance" && r[kind]);
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
 * Sì se è suo, se sono già in guerra, se tra le due c'è un accordo (passaggio, visione condivisa, alleanza)
 * o se è appena finita una guerra e le armate si stanno ritirando.
 */
export function mayEnter(state: GameState, nation: NationId, owner: NationId): boolean {
  if (owner === nation) return true;
  const r = relationOf(state, nation, owner);
  return r.war || r.passage || r.sharedVision || r.alliance === true || (r.withdrawUntil ?? 0) > state.time;
}

/** `by` ha messo `against` sotto embargo. */
export function hasEmbargo(state: GameState, by: NationId, against: NationId): boolean {
  return state.nations[by]?.embargo?.includes(against) ?? false;
}

/** Tra le due nazioni non si commercia: guerra o embargo, in un verso o nell'altro. */
export function tradeBlocked(state: GameState, a: NationId, b: NationId): boolean {
  return atWar(state, a, b) || hasEmbargo(state, a, b) || hasEmbargo(state, b, a);
}

/** La nazione è guidata da un giocatore (per ora solo quello della partita locale); le altre sono bot. */
export function isHuman(state: GameState, nation: NationId): boolean {
  return nation === state.playerNation;
}

/**
 * Dichiarazione di guerra di `by` contro `against`, al minuto `time`: cadono tregua e accordi.
 * Modifica `state` (una copia di lavoro).
 */
export function startWar(state: GameState, by: NationId, against: NationId, time: number): void {
  if (by === against || atWar(state, by, against)) return;
  state.relations[pairKey(by, against)] = { war: true, warSince: time, passage: false, sharedVision: false };
  logEvent(state, { time, type: "war", by, against });
}

/** Perché `from` non può proporre `kind` a `to` adesso (null = può). */
export function proposalMissing(state: GameState, from: NationId, to: NationId, kind: ProposalKind): string | null {
  if (from === to || !state.nations[to]) return "Nazione non valida.";
  const r = relationOf(state, from, to);
  const pending = state.proposals.some(
    (p) => p.status === "pending" && p.kind === kind && ((p.from === from && p.to === to) || (p.from === to && p.to === from)),
  );
  if (pending) return "C'è già una proposta uguale in attesa.";
  switch (kind) {
    case "peace":
      return r.war || inTruce(state, from, to) ? null : "Siete già in pace.";
    case "truce":
      return r.war ? null : "La tregua si propone solo in guerra.";
    default:
      if (r.war) return "Prima serve la pace.";
      return hasAgreement(state, from, to, kind) ? "L'accordo c'è già." : null;
  }
}

/** Risposta di un bot a una proposta: il motivo serve per la chat. */
export function botAnswer(state: GameState, bot: NationId, from: NationId, kind: ProposalKind): { accept: boolean; reason: string } {
  const r = relationOf(state, bot, from);
  const warHours = r.war && r.warSince !== undefined ? (state.time - r.warSince) / 60 : 0;
  switch (kind) {
    case "truce":
      return warHours >= DIPLOMACY.bot.truceAfterHours
        ? { accept: true, reason: "Accettiamo la tregua." }
        : { accept: false, reason: "È troppo presto per una tregua." };
    case "peace":
      return !r.war || warHours >= DIPLOMACY.bot.peaceAfterDays * 24
        ? { accept: true, reason: "Accettiamo la pace." }
        : { accept: false, reason: "Non siamo ancora pronti a fare la pace." };
    case "sharedVision":
      return { accept: true, reason: "Condividiamo volentieri le nostre mappe." };
    case "passage":
      return r.alliance
        ? { accept: true, reason: "Il passaggio è concesso." }
        : { accept: false, reason: "Il passaggio lo concediamo solo ai nostri alleati." };
    case "alliance": {
      const theirs = new Set(enemiesOf(state, from));
      return enemiesOf(state, bot).some((e) => theirs.has(e))
        ? { accept: true, reason: "Contro il nemico comune, siamo con voi." }
        : { accept: false, reason: "Non vediamo motivi per un'alleanza." };
    }
  }
}

/** Effetti di una proposta accettata. Modifica `state` (una copia di lavoro). */
export function applyAgreement(state: GameState, a: NationId, b: NationId, kind: ProposalKind, time: number): void {
  const key = pairKey(a, b);
  const r = { ...relationOf(state, a, b) };
  const withdraw = time + DIPLOMACY.withdrawHours * 60;
  switch (kind) {
    case "peace":
      state.relations[key] = { war: false, passage: false, sharedVision: false, withdrawUntil: withdraw };
      break;
    case "truce":
      state.relations[key] = { war: false, passage: false, sharedVision: false, truceUntil: time + DIPLOMACY.truceDays * 1440, withdrawUntil: withdraw };
      break;
    case "alliance":
      state.relations[key] = { ...r, alliance: true };
      break;
    default:
      state.relations[key] = { ...r, [kind]: true };
  }
  logEvent(state, { time, type: "agreement", kind, nations: [a, b] });
}

/** Chiude una proposta in attesa (copia l'elenco). */
export function closeProposal(state: GameState, id: string, status: Proposal["status"], time: number): void {
  state.proposals = state.proposals.map((p) => (p.id === id ? { ...p, status, closedAt: time } : p));
  trimProposals(state);
}

/** Tiene tutte le proposte in attesa e solo le più recenti di quelle chiuse. */
export function trimProposals(state: GameState): void {
  const closed = state.proposals.filter((p) => p.status !== "pending").length;
  let drop = closed - DIPLOMACY.proposalsKept;
  if (drop > 0) state.proposals = state.proposals.filter((p) => p.status === "pending" || drop-- <= 0);
}

/** Aggiunge un messaggio alla chat della coppia (copia la chat). */
export function addChatMessage(state: GameState, from: NationId, to: NationId, text: string, time: number): void {
  const key = pairKey(from, to);
  const chat = [...(state.chats[key] ?? []), { time, from, text }];
  state.chats = { ...state.chats, [key]: chat.slice(-DIPLOMACY.chatKept) };
}

/**
 * Scadenze al minuto `t`: tregue finite (la guerra riprende) e proposte senza risposta.
 * Modifica `state` (una copia di lavoro); true se è cambiato qualcosa che conta per la produzione.
 */
export function expireDiplomacy(state: GameState, t: number): boolean {
  let changed = false;
  for (const [key, r] of Object.entries(state.relations)) {
    if (r.truceUntil === undefined || r.truceUntil > t) continue;
    const [a, b] = key.split("|") as [NationId, NationId];
    const { truceUntil: _, ...rest } = r;
    state.relations[key] = { ...rest, war: true, warSince: t };
    logEvent(state, { time: t, type: "truceEnded", nations: [a, b] });
    changed = true;
  }
  if (state.proposals.some((p) => p.status === "pending" && p.expiresAt <= t)) {
    state.proposals = state.proposals.map((p) => (p.status === "pending" && p.expiresAt <= t ? { ...p, status: "expired", closedAt: p.expiresAt } : p));
    trimProposals(state);
  }
  return changed;
}

/** Aggiunge un evento al registro, scartando i più vecchi oltre il limite. Modifica `state`. */
export function logEvent(state: GameState, event: GameState["events"][number]): void {
  state.events.push(event);
  if (state.events.length > COMBAT.maxEvents) state.events.splice(0, state.events.length - COMBAT.maxEvents);
}
