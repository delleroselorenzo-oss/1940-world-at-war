import { useState } from "react";
import { BUILDING_TYPES, formatGameTime, type GameEvent, type GameState, type ProvinceId } from "@waw/shared";
import type { LoadedMap } from "../map/loadMap.js";
import { PROPOSAL_NAMES } from "./diplomacyText.js";

// Notizie della partita che riguardano il giocatore: guerre, battaglie, conquiste, rivolte, armate distrutte,
// lavori del genio, edifici completati.

const SHOWN = 4;

interface Item {
  index: number;
  time: number;
  text: string;
  tone: "good" | "bad" | "neutral";
  province: ProvinceId | null;
}

/** Testo di un evento visto dal giocatore `me`, o null se non lo riguarda. */
export function describeEvent(
  e: GameEvent,
  map: LoadedMap,
  me: string,
  owners?: GameState["provinces"],
): Omit<Item, "index" | "time"> | null {
  const nation = (id: string) => map.nations.get(id)?.name ?? id;
  const province = (id: ProvinceId | null) => (id ? (map.provinces.get(id)?.name ?? id) : null);
  switch (e.type) {
    case "war":
      if (e.by === me) return { text: `Hai dichiarato guerra: ${nation(e.against)}`, tone: "neutral", province: null };
      if (e.against === me) return { text: `Dichiarazione di guerra da ${nation(e.by)}`, tone: "bad", province: null };
      return null;
    case "agreement": {
      if (!e.nations.includes(me)) return null;
      const other = nation(e.nations[0] === me ? e.nations[1] : e.nations[0]);
      const text =
        e.kind === "peace" ? `Pace con ${other}` : e.kind === "truce" ? `Tregua con ${other}` : `${PROPOSAL_NAMES[e.kind]} con ${other}`;
      return { text, tone: "good", province: null };
    }
    case "revoked":
      if (e.by === me) return { text: `Hai revocato: ${PROPOSAL_NAMES[e.kind].toLowerCase()} con ${nation(e.against)}`, tone: "neutral", province: null };
      if (e.against === me) return { text: `${nation(e.by)} ha revocato: ${PROPOSAL_NAMES[e.kind].toLowerCase()}`, tone: "bad", province: null };
      return null;
    case "truceEnded":
      if (!e.nations.includes(me)) return null;
      return { text: `Finita la tregua: di nuovo in guerra con ${nation(e.nations[0] === me ? e.nations[1] : e.nations[0])}`, tone: "bad", province: null };
    case "embargo":
      if (e.by === me) return { text: `${e.on ? "Embargo contro" : "Tolto l'embargo a"} ${nation(e.against)}`, tone: "neutral", province: null };
      if (e.against === me) return { text: `${nation(e.by)} ${e.on ? "ti ha messo sotto embargo" : "ha tolto l'embargo"}`, tone: e.on ? "bad" : "good", province: null };
      return null;
    case "battle": {
      if (!e.nations.includes(me)) return null;
      const other = e.nations[0] === me ? e.nations[1] : e.nations[0];
      const where = province(e.province);
      return { text: `Battaglia${where ? ` presso ${where}` : ""} contro ${nation(other)}`, tone: "neutral", province: e.province };
    }
    case "conquest":
      if (e.to === me) return { text: `Conquistata: ${province(e.province)} (${nation(e.from)})`, tone: "good", province: e.province };
      if (e.from === me) return { text: `Persa: ${province(e.province)}, ora di ${nation(e.to)}`, tone: "bad", province: e.province };
      return null;
    case "revolt":
      if (e.from === me) return { text: `Rivolta: ${province(e.province)} torna a ${nation(e.to)}`, tone: "bad", province: e.province };
      if (e.to === me) return { text: `Rivolta: ${province(e.province)} torna a te`, tone: "good", province: e.province };
      return null;
    case "built": {
      if (e.by !== me) return null;
      const name = BUILDING_TYPES[e.building].name;
      const level = BUILDING_TYPES[e.building].maxLevel > 1 ? ` (livello ${e.level})` : "";
      return { text: `Costruzione finita: ${name}${level}, ${province(e.province)}`, tone: "good", province: e.province };
    }
    case "armyDestroyed": {
      const where = province(e.province);
      const at = where ? ` presso ${where}` : "";
      if (e.owner === me) return { text: `Una tua armata è stata distrutta${at}`, tone: "bad", province: e.province };
      if (e.by === me) return { text: `Armata nemica distrutta${at} (${nation(e.owner)})`, tone: "good", province: e.province };
      return null;
    }
    case "airStrike": {
      const where = province(e.province);
      const at = where ? ` presso ${where}` : "";
      const losses = (n: number, none: string, one: string, many: string) => (n === 0 ? none : `${n} ${n === 1 ? one : many}`);
      if (e.by === me) {
        const result = e.armyDestroyed ? "armata nemica distrutta" : losses(e.unitsLost, "bersaglio danneggiato", "unità nemica distrutta", "unità nemiche distrutte");
        const own = e.squadronDestroyed ? "; squadriglia abbattuta" : e.aircraftLost > 0 ? `; abbattuti ${e.aircraftLost} tuoi aerei` : "";
        return { text: `Attacco aereo${at}: ${result}${own}`, tone: e.squadronDestroyed ? "bad" : "good", province: e.province };
      }
      if (e.against === me) {
        const shot = e.aircraftLost > 0 ? `; la contraerea ha abbattuto ${e.aircraftLost} aerei` : "";
        return { text: `Attacco aereo di ${nation(e.by)}${at}: ${losses(e.unitsLost, "unità danneggiate", "unità persa", "unità perse")}${shot}`, tone: "bad", province: e.province };
      }
      return null;
    }
    case "squadronLost": {
      if (e.owner !== me) return null;
      const where = province(e.province);
      return { text: `Squadriglia persa${where ? ` presso ${where}` : ""}: nessuna base raggiungibile`, tone: "bad", province: e.province };
    }
    case "works": {
      const where = province(e.province);
      const river = e.river ? ` sul ${e.river}` : "";
      const at = where ? ` presso ${where}` : "";
      const mine = e.by === me;
      // Le distruzioni altrui interessano solo se avvengono nel nostro territorio.
      if (!mine && !(e.province && owners?.[e.province]?.owner === me)) return null;
      switch (e.what) {
        case "bridgeDestroyed":
          return { text: mine ? `Ponte distrutto${river}${at}` : `${nation(e.by)} ha distrutto un ponte${river}${at}`, tone: mine ? "neutral" : "bad", province: e.province };
        case "bridgeRepaired":
          return mine ? { text: `Ponte riparato${river}${at}`, tone: "good", province: e.province } : null;
        case "pontoonBuilt":
          return mine ? { text: `Ponte di barche pronto${river}${at}`, tone: "good", province: e.province } : null;
        case "pontoonDestroyed":
          return { text: mine ? `Ponte di barche distrutto${river}${at}` : `${nation(e.by)} ha distrutto un ponte di barche${river}${at}`, tone: mine ? "neutral" : "bad", province: e.province };
        case "hospitalBuilt":
          return mine ? { text: `Ospedale da campo pronto${at}`, tone: "good", province: e.province } : null;
        case "hospitalLost":
          return mine ? { text: `Ospedale da campo perduto${at}`, tone: "bad", province: e.province } : null;
        case "wellsSabotaged":
          return mine ? { text: `Pozzi di petrolio sabotati${at}`, tone: "neutral", province: e.province } : null;
        case "wellsRepaired":
          return mine ? { text: `Pozzi di petrolio di nuovo in funzione${at}`, tone: "good", province: e.province } : null;
      }
    }
  }
}

interface EventFeedProps {
  map: LoadedMap;
  game: GameState;
  onSelectProvince(id: ProvinceId): void;
}

export function EventFeed({ map, game, onSelectProvince }: EventFeedProps) {
  // Chiudendo il riquadro si nascondono le notizie viste; ricompare con la prossima.
  const [hiddenUpTo, setHiddenUpTo] = useState(-1);
  const items: Item[] = [];
  for (let i = game.events.length - 1; i >= 0 && items.length < SHOWN; i--) {
    const e = game.events[i]!;
    const d = describeEvent(e, map, game.playerNation, game.provinces);
    if (d) items.push({ ...d, index: i, time: e.time });
  }
  // Gli indici scorrono quando il registro scarta i vecchi eventi: si confronta l'orario.
  const visible = items.filter((it) => it.time > hiddenUpTo);
  if (visible.length === 0) return null;

  return (
    <section className="event-feed" aria-label="Notizie" aria-live="polite">
      <header>
        <h3>Notizie</h3>
        <button className="icon-button small" onClick={() => setHiddenUpTo(game.time)} aria-label="Nascondi le notizie">
          ×
        </button>
      </header>
      <ul>
        {visible.map((it) => (
          <li key={`${it.index}-${it.time}`} className={it.tone}>
            <span className="muted">{formatGameTime(it.time)}</span>
            {it.province ? (
              <button className="link" onClick={() => onSelectProvince(it.province!)}>
                {it.text}
              </button>
            ) : (
              <span>{it.text}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
