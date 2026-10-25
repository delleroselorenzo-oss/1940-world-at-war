import type { Ref } from "react";
import {
  AIRCRAFT_TYPES,
  AIRCRAFT_TYPE_IDS,
  airBases,
  flatKm,
  flightMinutes,
  squadronPosition,
  squadronRangeKm,
  squadronSpeedKmh,
  transferMissing,
  type GameState,
  type Squadron,
} from "@waw/shared";
import type { LoadedMap } from "./map/loadMap.js";
import { CostList } from "./ui/CostList.js";
import { formatAmount, formatCountdown, formatDelay } from "./ui/format.js";

// Pannello della squadriglia: stato (a terra, in rifornimento, in volo), trasferimento a un'altra base
// (dall'elenco o toccando sulla mappa una delle basi evidenziate), composizione e mantenimento.

interface SquadronPanelProps {
  map: LoadedMap;
  squadron: Squadron;
  game: GameState;
  now: number;
  error: string | null;
  /** Il prossimo tocco sulla mappa sceglie la base d'arrivo. */
  choosing: boolean;
  onChoose(choosing: boolean): void;
  onFly(base: string): void;
  onSelectProvince(id: string): void;
  onClose(): void;
  ref?: Ref<HTMLElement>;
}

export function SquadronPanel({
  map,
  squadron: sq,
  game,
  now,
  error,
  choosing,
  onChoose,
  onFly,
  onSelectProvince,
  onClose,
  ref,
}: SquadronPanelProps) {
  const nation = map.nations.get(sq.owner);
  const mine = sq.owner === game.playerNation;
  const range = squadronRangeKm(sq);
  const speed = squadronSpeedKmh(sq);
  const countdown = (t: number) => formatCountdown(((t - now) * 60) / game.clock.speed);
  const name = (id: string) => map.provinces.get(id)?.name ?? id;
  const link = (id: string) => (
    <button className="link" onClick={() => onSelectProvince(id)}>
      {name(id)}
    </button>
  );
  const groups = AIRCRAFT_TYPE_IDS.map((t) => ({ type: t, aircraft: sq.aircraft.filter((a) => a.type === t) })).filter((g) => g.aircraft.length > 0);
  const hp = sq.aircraft.reduce((n, a) => n + a.hp, 0) / sq.aircraft.reduce((n, a) => n + AIRCRAFT_TYPES[a.type].hp, 0);
  const upkeep: Record<string, number> = {};
  for (const a of sq.aircraft) for (const [r, n] of Object.entries(AIRCRAFT_TYPES[a.type].upkeepPerDay)) upkeep[r] = (upkeep[r] ?? 0) + n;

  // Basi raggiungibili dalla posizione attuale, dalla più vicina.
  const here = squadronPosition(sq, map.data, now);
  const bases = mine
    ? airBases(game, map.data, sq.owner)
        .filter((p) => p.id !== sq.base)
        .map((p) => ({ province: p, km: flatKm(here, p.center) }))
        .filter((b) => b.km <= range)
        .sort((a, b) => a.km - b.km)
    : [];
  const refueling = !sq.flight && sq.readyAt > now;

  return (
    <aside className="panel army-panel" aria-label="Dettagli squadriglia" ref={ref}>
      <header className="panel-header">
        <div>
          <p className="panel-kicker">
            <span className="swatch" style={{ background: nation?.color }} />
            {nation?.name ?? sq.owner}
            {mine && <span className="tag">la tua squadriglia</span>}
          </p>
          <h2>Squadriglia · {sq.aircraft.length} aerei</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Chiudi">
          ×
        </button>
      </header>

      <div className="panel-body">
        <div className="army-status">
          <p>
            {sq.flight ? (
              <>
                In volo verso {link(sq.flight.base)} · atterra tra {countdown(sq.flight.arriveAt)}
              </>
            ) : refueling ? (
              <>
                A terra a {link(sq.base)} · in rifornimento, pronta tra {countdown(sq.readyAt)}
              </>
            ) : (
              <>A terra a {link(sq.base)} · pronta al decollo</>
            )}
          </p>
          <span className="progress health" aria-hidden>
            <span style={{ width: `${hp * 100}%` }} />
          </span>
          <p className="muted">
            Salute {Math.round(hp * 100)}% · {speed} km/h · portata {formatAmount(range)} km (raggio d'azione {formatAmount(range / 2)} km)
          </p>
        </div>

        {mine && !sq.flight && (
          <section className="army-actions" aria-label="Trasferimento">
            <h3>Trasferisci</h3>
            <div className="map-actions" role="group" aria-label="Azione sulla mappa">
              <button
                className={choosing ? "action active" : "action"}
                aria-pressed={choosing}
                disabled={refueling}
                onClick={() => onChoose(!choosing)}
              >
                Vola
              </button>
            </div>
            {choosing && <p className="targeting">Tocca sulla mappa una delle basi evidenziate, entro il cerchio della portata.</p>}
            {refueling && <p className="muted small">Potrà decollare a rifornimento finito.</p>}
            {bases.length === 0 ? (
              <p className="muted small">Nessuna altra base entro la portata. Il genio può costruire un aeroporto in qualsiasi tua provincia.</p>
            ) : (
              <ul className="place-list">
                {bases.map(({ province, km }) => {
                  const missing = transferMissing({ ...game, time: now }, map.data, sq, province.id);
                  return (
                    <li key={province.id}>
                      <div className="recruit-head">
                        {link(province.id)}
                        <span className="muted small">
                          {formatAmount(km)} km · {formatDelay(flightMinutes(sq, here, province.center))}
                          {game.provinces[province.id]?.owner !== sq.owner && " · alleato"}
                        </span>
                        <button className="button small" disabled={missing !== null} title={missing ?? undefined} onClick={() => onFly(province.id)}>
                          Vola
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}

        <h3>Composizione</h3>
        <table className="composition">
          <thead>
            <tr>
              <th>Aerei</th>
              <th>Salute</th>
              <th title="Velocità in km/h">km/h</th>
              <th title="Portata in km">Portata</th>
              <th title="Rifornimento a terra">Rif.</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(({ type, aircraft }) => {
              const t = AIRCRAFT_TYPES[type];
              const health = aircraft.reduce((n, a) => n + a.hp, 0) / (aircraft.length * t.hp);
              return (
                <tr key={type}>
                  <td>
                    {aircraft.length}× {t.name}
                  </td>
                  <td>
                    <span className="progress health mini" title={`${Math.round(health * 100)}%`}>
                      <span style={{ width: `${health * 100}%` }} />
                    </span>
                  </td>
                  <td className={groups.length > 1 && t.speedKmh === speed ? "slowest" : undefined}>{t.speedKmh}</td>
                  <td className={groups.length > 1 && t.rangeKm === range ? "slowest" : undefined}>{formatAmount(t.rangeKm)}</td>
                  <td>{formatDelay(t.refuelMinutes)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {groups.length > 1 && (
          <p className="muted small-print">
            In evidenza i limiti della squadriglia: vola alla velocità del più lento, fin dove arriva quello con meno portata.
          </p>
        )}

        <h3>Mantenimento al giorno</h3>
        <CostList cost={upkeep} />
        <p className="muted small-print">Il rifornimento non costa altro: è compreso nel mantenimento.</p>
      </div>
    </aside>
  );
}
