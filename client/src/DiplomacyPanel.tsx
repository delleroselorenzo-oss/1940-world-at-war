import { useEffect, useRef, useState } from "react";
import {
  calendarDate,
  DIPLOMACY,
  formatGameTime,
  hasAgreement,
  hasEmbargo,
  inTruce,
  isHuman,
  leaderAt,
  pairKey,
  relationOf,
  type AgreementKind,
  type GameState,
  type NationId,
  type Order,
  type Proposal,
  type ProposalKind,
} from "@waw/shared";
import type { LoadedMap } from "./map/loadMap.js";
import { PROPOSAL_NAMES } from "./ui/diplomacyText.js";
import { Flag } from "./ui/Flag.js";
import { formatCountdown } from "./ui/format.js";
import { initials, portraitUrl } from "./ui/leaders.js";

// Diplomazia: elenco delle nazioni con i rapporti, e per ognuna proposte, accordi, embargo e chat.

interface DiplomacyPanelProps {
  map: LoadedMap;
  game: GameState;
  now: number;
  /** Nazione aperta (null = elenco). */
  nation: NationId | null;
  onNation(id: NationId | null): void;
  /** Invia un ordine; restituisce l'errore, se c'è. */
  order(o: Order): string | null;
  onClose(): void;
}

export function DiplomacyPanel({ map, game, now, nation, onNation, order, onClose }: DiplomacyPanelProps) {
  const other = nation ? map.nations.get(nation) : undefined;
  return (
    <aside className="panel" aria-label="Diplomazia">
      <header className="panel-header">
        <div>
          <p className="panel-kicker">
            {other ? (
              <button className="link-button" onClick={() => onNation(null)}>
                ‹ Tutte le nazioni
              </button>
            ) : (
              "Nazione"
            )}
          </p>
          <h2>{other ? other.name : "Diplomazia"}</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Chiudi">
          ×
        </button>
      </header>
      <div className="panel-body">
        {other ? (
          <NationDetail map={map} game={game} now={now} nation={other.id} order={order} />
        ) : (
          <NationList map={map} game={game} onNation={onNation} />
        )}
      </div>
    </aside>
  );
}

/** Etichette dei rapporti con una nazione: guerra, tregua, accordi, embargo. */
function relationTags(game: GameState, me: NationId, other: NationId): { text: string; tone: "war" | "good" | "neutral" }[] {
  const r = relationOf(game, me, other);
  const tags: { text: string; tone: "war" | "good" | "neutral" }[] = [];
  if (r.war) tags.push({ text: "Guerra", tone: "war" });
  else if (inTruce(game, me, other)) tags.push({ text: "Tregua", tone: "neutral" });
  if (r.alliance) tags.push({ text: "Alleanza", tone: "good" });
  else {
    if (r.passage) tags.push({ text: "Passaggio", tone: "good" });
    if (r.sharedVision) tags.push({ text: "Mappa condivisa", tone: "good" });
  }
  if (hasEmbargo(game, me, other)) tags.push({ text: "Embargo tuo", tone: "neutral" });
  if (hasEmbargo(game, other, me)) tags.push({ text: "Embargo suo", tone: "war" });
  return tags;
}

function NationList({ map, game, onNation }: { map: LoadedMap; game: GameState; onNation(id: NationId): void }) {
  const me = game.playerNation;
  const date = calendarDate(game.time);
  const waiting = (id: NationId) => game.proposals.filter((p) => p.status === "pending" && p.from === id && p.to === me).length;
  // In cima chi ha proposte in attesa, poi chi è in guerra con te, poi gli altri in ordine alfabetico.
  const nations = [...map.nations.values()]
    .filter((n) => n.id !== me)
    .sort(
      (a, b) =>
        waiting(b.id) - waiting(a.id) ||
        Number(relationOf(game, me, b.id).war) - Number(relationOf(game, me, a.id).war) ||
        a.name.localeCompare(b.name, "it"),
    );
  return (
    <ul className="nation-list">
      {nations.map((n) => {
        const leader = leaderAt(n.id, date);
        const tags = relationTags(game, me, n.id);
        const count = waiting(n.id);
        return (
          <li key={n.id}>
            <button onClick={() => onNation(n.id)}>
              <Flag nation={n.id} fallback={n.color} />
              <span className="nation-list-text">
                <strong>{n.name}</strong>
                <span className="muted small">
                  {leader?.name ?? ""} · {isHuman(game, n.id) ? "giocatore" : "computer"}
                </span>
              </span>
              <span className="tags">
                {count > 0 && <span className="relation-tag pending">{count} da leggere</span>}
                {tags.map((t) => (
                  <span key={t.text} className={`relation-tag ${t.tone}`}>
                    {t.text}
                  </span>
                ))}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const AGREEMENTS: AgreementKind[] = ["sharedVision", "passage", "alliance"];

/** Cosa fa un accordo, in breve. */
const AGREEMENT_HELP: Record<AgreementKind, string> = {
  sharedVision: "Vedete le armate l'uno dell'altro; le armate possono entrare nel territorio senza guerra.",
  passage: "Le armate attraversano il territorio dell'altro senza guerra, anche in treno.",
  alliance: "Passaggio e mappa condivisa insieme.",
};

function NationDetail({
  map,
  game,
  now,
  nation,
  order,
}: {
  map: LoadedMap;
  game: GameState;
  now: number;
  nation: NationId;
  order(o: Order): string | null;
}) {
  const me = game.playerNation;
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setError(null);
  }, [nation]);
  const send = (o: Order) => setError(order(o));
  const n = map.nations.get(nation)!;
  const leader = leaderAt(nation, calendarDate(game.time));
  const photo = leader && portraitUrl(leader.portrait);
  const r = relationOf(game, me, nation);
  const truce = inTruce(game, me, nation);
  const human = isHuman(game, nation);
  const countdown = (t: number) => formatCountdown(((t - now) * 60) / game.clock.speed);
  const pendingFor = (from: NationId, to: NationId) => game.proposals.filter((p) => p.status === "pending" && p.from === from && p.to === to);
  const incoming = pendingFor(nation, me);
  const outgoing = pendingFor(me, nation);
  const sent = (kind: ProposalKind) => outgoing.some((p) => p.kind === kind);

  const propose = (kind: ProposalKind, short = false) => (
    <button key={kind} className="button small" disabled={sent(kind)} onClick={() => send({ type: "propose", to: nation, kind })}>
      {sent(kind) ? "Inviata" : short ? "Proponi" : `Proponi ${PROPOSAL_NAMES[kind].toLowerCase()}`}
    </button>
  );

  return (
    <>
      <div className="nation-head">
        {photo ? (
          <img className="portrait large" src={photo} alt="" style={{ borderColor: n.color }} />
        ) : (
          <span className="portrait large" style={{ background: n.color, borderColor: n.color }}>
            {leader ? initials(leader.name) : n.name[0]}
          </span>
        )}
        <div>
          <strong>{leader?.name}</strong>
          <span className="muted small">{leader?.title}</span>
          <span className="leader-nation">
            <Flag nation={n.id} fallback={n.color} /> {human ? "guidata da un giocatore" : "guidata dal computer"}
          </span>
        </div>
      </div>

      <div className={r.war ? "relation war" : "relation"}>
        <span>
          {r.war
            ? "Siete in guerra."
            : truce
              ? `Tregua: la guerra riprende tra ${countdown(r.truceUntil!)}, se non fate la pace.`
              : "Siete in pace: entrare nel suo territorio senza accordi porta alla guerra."}
          {(r.withdrawUntil ?? 0) > now && (
            <span className="muted"> Le armate rimaste oltre il confine hanno {countdown(r.withdrawUntil!)} per ritirarsi.</span>
          )}
        </span>
      </div>

      {incoming.length > 0 && (
        <>
          <h3>Proposte da {n.name}</h3>
          <ul className="proposals">
            {incoming.map((p) => (
              <li key={p.id}>
                <span>
                  <strong>{PROPOSAL_NAMES[p.kind]}</strong> <span className="muted small">scade tra {countdown(p.expiresAt)}</span>
                </span>
                <span className="actions">
                  <button className="button small" onClick={() => send({ type: "answerProposal", id: p.id, accept: true })}>
                    Accetta
                  </button>
                  <button className="button small secondary" onClick={() => send({ type: "answerProposal", id: p.id, accept: false })}>
                    Rifiuta
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>Rapporti</h3>
      <div className="diplomacy-actions">
        {r.war && [propose("truce"), propose("peace")]}
        {truce && propose("peace")}
        {!r.war && (
          <button
            className="button small danger"
            onClick={() => window.confirm(`Vuoi davvero dichiarare guerra a ${n.name}?`) && send({ type: "declareWar", against: nation })}
          >
            Dichiara guerra
          </button>
        )}
      </div>

      <h3>Accordi</h3>
      <ul className="agreements">
        {AGREEMENTS.map((kind) => {
          const active = kind === "alliance" ? r.alliance === true : r[kind];
          const implied = !active && hasAgreement(game, me, nation, kind);
          return (
            <li key={kind}>
              <span>
                <strong>{PROPOSAL_NAMES[kind]}</strong>
                {active && <span className="relation-tag good">attivo</span>}
                {implied && <span className="relation-tag good">con l'alleanza</span>}
                <span className="muted small">{AGREEMENT_HELP[kind]}</span>
              </span>
              {active ? (
                <button className="button small secondary" onClick={() => send({ type: "revokeAgreement", with: nation, kind })}>
                  Revoca
                </button>
              ) : (
                !r.war && !implied && propose(kind, true)
              )}
            </li>
          );
        })}
        <li>
          <span>
            <strong>Embargo</strong>
            {hasEmbargo(game, me, nation) && <span className="relation-tag neutral">attivo</span>}
            <span className="muted small">
              Niente scambi in borsa con questa nazione e niente importazioni attraverso il suo territorio. Lo decidi da solo.
            </span>
          </span>
          <button
            className={hasEmbargo(game, me, nation) ? "button small secondary" : "button small"}
            onClick={() => send({ type: "setEmbargo", against: nation, on: !hasEmbargo(game, me, nation) })}
          >
            {hasEmbargo(game, me, nation) ? "Togli" : "Imponi"}
          </button>
        </li>
      </ul>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}

      <h3>Chat</h3>
      <Chat
        map={map}
        game={game}
        nation={nation}
        onSend={(text) => order({ type: "sendMessage", to: nation, text })}
        onWithdraw={(id) => send({ type: "withdrawProposal", id })}
      />
    </>
  );
}

type ChatItem = { time: number; from: NationId; text: string } | { time: number; from: NationId; proposal: Proposal };

const STATUS: Record<Proposal["status"], string> = {
  pending: "in attesa",
  accepted: "accettata",
  rejected: "rifiutata",
  expired: "scaduta",
  withdrawn: "ritirata",
};

function Chat({
  map,
  game,
  nation,
  onSend,
  onWithdraw,
}: {
  map: LoadedMap;
  game: GameState;
  nation: NationId;
  onSend(text: string): string | null;
  onWithdraw(id: string): void;
}) {
  const me = game.playerNation;
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLUListElement>(null);
  const messages = game.chats[pairKey(me, nation)] ?? [];
  const proposals = game.proposals.filter((p) => (p.from === me && p.to === nation) || (p.from === nation && p.to === me));
  // Messaggi e proposte nello stesso filo, in ordine di tempo (a parità, la proposta prima della risposta).
  const items: ChatItem[] = [...proposals.map((p) => ({ time: p.time, from: p.from, proposal: p })), ...messages].sort(
    (a, b) => a.time - b.time || Number("text" in a) - Number("text" in b),
  );
  const name = (id: NationId) => (id === me ? "Tu" : (map.nations.get(id)?.name ?? id));
  // La chat resta sull'ultimo messaggio (scorre solo lei, non il pannello).
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [items.length]);

  return (
    <div className="chat">
      <ul className="chat-log" ref={logRef}>
        {items.length === 0 && <li className="muted small">Nessun messaggio.</li>}
        {items.map((it, i) =>
          "text" in it ? (
            <li key={i} className={it.from === me ? "mine" : "theirs"}>
              <span className="muted small">
                {name(it.from)} · {formatGameTime(it.time)}
              </span>
              <span>{it.text}</span>
            </li>
          ) : (
            <li key={i} className="proposal-line">
              <span className="muted small">{formatGameTime(it.time)}</span>
              <span>
                {name(it.from)} {it.from === me ? "hai proposto" : "propone"}: <strong>{PROPOSAL_NAMES[it.proposal.kind].toLowerCase()}</strong> ·{" "}
                {STATUS[it.proposal.status]}
              </span>
              {it.proposal.status === "pending" && it.from === me && (
                <button className="link-button" onClick={() => onWithdraw(it.proposal.id)}>
                  Ritira
                </button>
              )}
            </li>
          ),
        )}
      </ul>
      {!isHuman(game, nation) && <p className="muted small">Nazione guidata dal computer: risponde alle proposte, non ai messaggi.</p>}
      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          const err = onSend(text);
          setError(err);
          if (!err) setText("");
        }}
      >
        <input value={text} maxLength={DIPLOMACY.messageMaxLength} placeholder="Scrivi un messaggio…" onChange={(e) => setText(e.target.value)} />
        <button className="button small" type="submit" disabled={!text.trim()}>
          Invia
        </button>
      </form>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
