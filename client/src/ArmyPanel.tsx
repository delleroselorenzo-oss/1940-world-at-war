import type { ReactNode, Ref } from "react";
import {
  ARMOR_CLASSES,
  ARMOR_CLASS_NAMES,
  armyDamage,
  armyHealth,
  armyPosition,
  armySpeedKmh,
  arrivalTime,
  availableWorks,
  destination,
  formatGameTime,
  isAttacking,
  MOVEMENT,
  provinceIdAt,
  RESOURCE_IDS,
  RESOURCE_NAMES,
  UNIT_TYPES,
  WORK_NAMES,
  type Army,
  type GameState,
  type LngLat,
  type WorkType,
} from "@waw/shared";
import type { LoadedMap } from "./map/loadMap.js";
import { CostList } from "./ui/CostList.js";
import { formatAmount, formatCountdown, formatDelay } from "./ui/format.js";
import { groupUnits } from "./ui/units.js";

/** Cosa farà il prossimo tocco sulla mappa. */
export type ArmyMode = "move" | "attack" | null;

/** Ritardi proposti per "Ritarda", in minuti di gioco. */
const DELAYS = [0, 30, 60, 120, 240, 480, 720, 1440];

interface ArmyPanelProps {
  map: LoadedMap;
  army: Army;
  game: GameState;
  now: number;
  error: string | null;
  /** Armate nemiche a contatto in questo momento. */
  foes: Army[];
  mode: ArmyMode;
  delayMinutes: number;
  /** Il prossimo ordine di marcia può usare il treno. */
  useRail: boolean;
  onMode(mode: ArmyMode): void;
  onDelay(minutes: number): void;
  onUseRail(useRail: boolean): void;
  onStop(): void;
  onWork(work: WorkType): void;
  onCancelWork(): void;
  onSelectArmy(id: string): void;
  onSelectProvince(id: string): void;
  onClose(): void;
  ref?: Ref<HTMLElement>;
}

export function ArmyPanel(props: ArmyPanelProps) {
  const { map, army, game, now, error, foes, mode, delayMinutes, useRail, onMode, onDelay, onUseRail, onStop, onWork, onCancelWork, onSelectArmy, onSelectProvince, onClose, ref } =
    props;
  const nation = map.nations.get(army.owner);
  const mine = army.owner === game.playerNation;
  const health = armyHealth(army);
  const fighting = foes.length > 0;
  const speed = armySpeedKmh(army);
  // Tempo reale che manca a un minuto di gioco.
  const countdown = (t: number) => formatCountdown(((t - now) * 60) / game.clock.speed);

  // Nome della provincia sotto un punto, cliccabile.
  const place = (at: LngLat) => {
    const id = provinceIdAt(map.nav, at);
    const p = id ? map.provinces.get(id) : undefined;
    return p ? (
      <button className="link" onClick={() => onSelectProvince(p.id)}>
        {p.name}
      </button>
    ) : (
      <span className="muted">—</span>
    );
  };

  const works = mine ? availableWorks(game, { map: map.data, nav: map.nav }, army, now) : [];
  const busy = army.move !== null || army.halted !== null || army.departure !== null;

  return (
    <aside className="panel army-panel" aria-label="Dettagli armata" ref={ref}>
      <header className="panel-header">
        <div>
          <p className="panel-kicker">
            <span className="swatch" style={{ background: nation?.color }} />
            {nation?.name ?? army.owner}
            {mine && <span className="tag">la tua armata</span>}
          </p>
          <h2>Armata · {army.units.length} unità</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Chiudi">
          ×
        </button>
      </header>

      <div className="panel-body">
        {/* 1. Comandante e azioni sulla mappa */}
        <div className="commander">
          <div className="commander-card">
            <span className="commander-portrait" aria-hidden>
              ★
            </span>
            <span>
              <strong>Nessun comandante</strong>
              <span className="muted">Generali in arrivo</span>
            </span>
          </div>
          {mine && (
            <div className="map-actions" role="group" aria-label="Azione sulla mappa">
              <button className={mode === "move" ? "action active" : "action"} aria-pressed={mode === "move"} onClick={() => onMode(mode === "move" ? null : "move")}>
                Muovi
              </button>
              <button
                className={mode === "attack" ? "action attack active" : "action attack"}
                aria-pressed={mode === "attack"}
                onClick={() => onMode(mode === "attack" ? null : "attack")}
              >
                Attacca
              </button>
            </div>
          )}
        </div>

        {mine && mode && (
          <p className="targeting">
            {mode === "move" ? "Tocca sulla mappa il punto di destinazione." : "Tocca sulla mappa un'armata nemica o il punto da assaltare."}
            {useRail && <> Userà il treno dove fa guadagnare tempo.</>}
            {delayMinutes > 0 && <> Partirà tra {formatDelay(delayMinutes)}.</>}
          </p>
        )}

        {/* 2. Stato attuale */}
        <div className="army-status">
          <p>{statusLine(army, now, fighting, foes.length, place, countdown)}</p>
          <span className="progress health" aria-hidden>
            <span style={{ width: `${health * 100}%` }} />
          </span>
          <p className="muted">
            Salute {Math.round(health * 100)}% · {speed} km/h · {isAttacking(army) ? "assalto" : "difesa"}
          </p>
        </div>

        {fighting && (
          <div className="combat">
            <h3>In combattimento</h3>
            <ul className="neighbors">
              {foes.map((f) => (
                <li key={f.id}>
                  <button onClick={() => onSelectArmy(f.id)}>
                    <span className="swatch" style={{ background: map.nations.get(f.owner)?.color }} />
                    <span className="neighbor-name">
                      {map.nations.get(f.owner)?.name ?? f.owner} · {f.units.length} unità
                    </span>
                    <span className="muted">{Math.round(armyHealth(f) * 100)}%</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 3. Azioni */}
        {mine && (
          <section className="army-actions" aria-label="Azioni">
            <h3>Azioni</h3>
            <div className="action-row">
              <label className="delay">
                Ritarda
                <select value={delayMinutes} onChange={(e) => onDelay(Number(e.target.value))}>
                  {DELAYS.map((d) => (
                    <option key={d} value={d}>
                      {d === 0 ? "parti subito" : `parti tra ${formatDelay(d)}`}
                    </option>
                  ))}
                </select>
              </label>
              <label
                className="rail-toggle"
                title={`In treno: ${MOVEMENT.railHomeSpeedKmh} km/h nel tuo territorio con morale almeno ${MOVEMENT.railHomeMinMorale}%, altrimenti ${MOVEMENT.railSpeedKmh} km/h. Salire e scendere: ${MOVEMENT.railBoardMinutesPerUnit} min per unità (max ${MOVEMENT.railBoardMaxMinutes / 60} h).`}
              >
                <input type="checkbox" checked={useRail} onChange={(e) => onUseRail(e.target.checked)} />
                Treno
              </label>
              {fighting && (
                <button className="button small" onClick={() => onMode("move")} title="Scegli un punto lontano dal nemico">
                  Ritirati
                </button>
              )}
              {busy && (
                <button className="button small" onClick={onStop}>
                  {army.departure && !army.move ? "Annulla partenza" : "Fermati qui"}
                </button>
              )}
            </div>

            <h3>Lavori</h3>
            {army.task ? (
              <div className="task">
                <p>
                  {WORK_NAMES[army.task.work]} · finisce tra {countdown(army.task.finishesAt)}
                </p>
                <span className="progress" aria-hidden>
                  <span style={{ width: `${Math.min(100, ((now - army.task.startedAt) / (army.task.finishesAt - army.task.startedAt)) * 100)}%` }} />
                </span>
                <button className="button small" onClick={onCancelWork}>
                  Interrompi
                </button>
              </div>
            ) : (
              <ul className="works">
                {works.map((w) => (
                  <li key={w.work}>
                    <button className="button small" disabled={w.missing !== null} onClick={() => onWork(w.work)}>
                      {WORK_NAMES[w.work]}
                    </button>
                    <span className="muted">
                      {w.missing ?? `${formatDelay(w.minutes)}${w.river ? ` · ${w.river}` : ""}${w.level && w.level > 1 ? ` · livello ${w.level}` : ""}`}
                    </span>
                    {w.cost && w.missing === null && <CostList cost={w.cost} stock={game.nations[army.owner]?.stock} />}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}

        {/* 4. Composizione */}
        <h3>Composizione</h3>
        <table className="composition">
          <thead>
            <tr>
              <th>Unità</th>
              <th>Salute</th>
              <th title="Velocità in km/h">km/h</th>
              <th title="Attacco contro fanteria / corazzati">Att.</th>
              <th title="Difesa contro fanteria / corazzati">Dif.</th>
            </tr>
          </thead>
          <tbody>
            {groupUnits(army.units).map((g) => {
              const t = UNIT_TYPES[g.type];
              const hp = g.hp / (g.count * t.hp);
              return (
                <tr key={g.type}>
                  <td>
                    {g.count}× {g.name}
                  </td>
                  <td>
                    <span className="progress health mini" title={`${Math.round(hp * 100)}%`}>
                      <span style={{ width: `${hp * 100}%` }} />
                    </span>
                  </td>
                  <td className={t.speedKmh === speed && army.units.some((u) => UNIT_TYPES[u.type].speedKmh > speed) ? "slowest" : undefined}>
                    {t.speedKmh}
                  </td>
                  <td>
                    {t.attack.infantry}/{t.attack.armored}
                  </td>
                  <td>
                    {t.defense.infantry}/{t.defense.armored}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {army.units.some((u) => UNIT_TYPES[u.type].speedKmh > speed) && (
          <p className="muted small-print">In evidenza l'unità più lenta: l'armata va alla sua velocità.</p>
        )}

        {/* 5. Riepilogo */}
        <h3>Riepilogo</h3>
        <dl className="facts">
          {ARMOR_CLASSES.map((c) => (
            <div key={c}>
              <dt>Contro {ARMOR_CLASS_NAMES[c].toLowerCase()}</dt>
              <dd>
                att. {round1(armyDamage(army, c, true))} · dif. {round1(armyDamage(army, c, false))}
              </dd>
            </div>
          ))}
          <div className="wide">
            <dt>Mantenimento al giorno</dt>
            <dd>{upkeep(army) || "—"}</dd>
          </div>
        </dl>
      </div>
    </aside>
  );
}

/** Una frase su cosa sta facendo l'armata. */
function statusLine(
  army: Army,
  now: number,
  fighting: boolean,
  foes: number,
  place: (at: LngLat) => ReactNode,
  countdown: (t: number) => string,
): ReactNode {
  const target = destination(army);
  if (army.task) return <>Lavora: {WORK_NAMES[army.task.work].toLowerCase()}.</>;
  if (army.departure && !army.move)
    return (
      <>
        Parte tra {countdown(army.departure.at)} verso {place(army.departure.target)}.
      </>
    );
  if (fighting) return <>In combattimento con {foes === 1 ? "un'armata" : `${foes} armate`}.</>;
  if (army.halted && target) return <>Marcia verso {place(target)} sospesa: riprenderà da sola a fine scontro.</>;
  if (army.move && target) {
    const eta = arrivalTime(army)!;
    const leg = currentLeg(army, now);
    const how = leg === "boarding" ? "Sale sul treno" : leg === "unloading" ? "Scende dal treno" : leg === "rail" ? "In treno" : "In marcia";
    return (
      <>
        {how} verso {place(target)}, arrivo {formatGameTime(eta)} (tra {countdown(eta)}).
      </>
    );
  }
  return <>Ferma a {place(armyPosition(army, now))}.</>;
}

/** Tratto della marcia in corso: a piedi, in treno o in sosta per salire o scendere. */
function currentLeg(army: Army, now: number): "march" | "rail" | "boarding" | "unloading" {
  const move = army.move!;
  const i = move.times.findIndex((t) => t > now) - 1;
  if (i < 0 || !move.rail[i]) return "march";
  const [a, b] = [move.points[i]!, move.points[i + 1]!];
  if (a[0] !== b[0] || a[1] !== b[1]) return "rail";
  // Sosta: si sale se dopo si viaggia in treno, altrimenti si scende.
  return move.rail[i + 1] ? "boarding" : "unloading";
}

function upkeep(army: Army): string {
  const total = Object.fromEntries(RESOURCE_IDS.map((r) => [r, 0])) as Record<(typeof RESOURCE_IDS)[number], number>;
  for (const u of army.units) for (const [r, n] of Object.entries(UNIT_TYPES[u.type].upkeepPerDay)) total[r as keyof typeof total] += n;
  return RESOURCE_IDS.filter((r) => total[r] > 0)
    .map((r) => `${RESOURCE_NAMES[r]} ${formatAmount(total[r])}`)
    .join(" · ");
}

const round1 = (n: number) => Math.round(n * 10) / 10;
