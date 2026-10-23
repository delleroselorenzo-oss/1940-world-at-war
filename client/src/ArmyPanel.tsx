import type { Ref } from "react";
import {
  armyPosition,
  armySpeedKmh,
  arrivalTime,
  destination,
  formatGameTime,
  provinceIdAt,
  UNIT_TYPES,
  type Army,
  type GameState,
  type LngLat,
} from "@waw/shared";
import type { LoadedMap } from "./map/loadMap.js";
import { formatCountdown } from "./ui/format.js";
import { groupUnits } from "./ui/units.js";

interface ArmyPanelProps {
  map: LoadedMap;
  army: Army;
  game: GameState;
  now: number;
  error: string | null;
  onStop(): void;
  onSelectProvince(id: string): void;
  onClose(): void;
  ref?: Ref<HTMLElement>;
}

export function ArmyPanel({ map, army, game, now, error, onStop, onSelectProvince, onClose, ref }: ArmyPanelProps) {
  const nation = map.nations.get(army.owner);
  const mine = army.owner === game.playerNation;
  const eta = arrivalTime(army);
  const target = destination(army);
  const hp = army.units.reduce((s, u) => s + u.hp, 0);
  const maxHp = army.units.reduce((s, u) => s + UNIT_TYPES[u.type].hp, 0);

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

  return (
    <aside className="panel" aria-label="Dettagli armata" ref={ref}>
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
        <dl className="facts">
          <div>
            <dt>{army.move ? "Ora in" : "Posizione"}</dt>
            <dd>{place(armyPosition(army, now))}</dd>
          </div>
          <div>
            <dt>Velocità</dt>
            <dd>{armySpeedKmh(army)} km/h</dd>
          </div>
          <div>
            <dt>Salute</dt>
            <dd>{Math.round((hp / maxHp) * 100)}%</dd>
          </div>
          {target && (
            <div>
              <dt>Destinazione</dt>
              <dd>{place(target)}</dd>
            </div>
          )}
        </dl>

        {eta !== null && (
          <p className="eta">
            Arrivo: <strong>{formatGameTime(eta)}</strong>
            <span className="muted"> · tra {formatCountdown(((eta - now) * 60) / game.clock.speed)}</span>
          </p>
        )}

        {mine && (
          <div className="hint">
            <p>
              {army.move ? "Tocca un altro punto della mappa per cambiare destinazione." : "Tocca un punto qualsiasi della mappa per mandarci l'armata."}{" "}
              <span className="muted">Su strada e ferrovia si va a piena velocità, fuori strada a metà; i grandi fiumi si passano solo sui ponti.</span>
            </p>
            {army.move && (
              <button className="button" onClick={onStop}>
                Fermati qui
              </button>
            )}
          </div>
        )}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}

        <h3>Unità</h3>
        <ul className="production">
          {groupUnits(army.units).map((g) => (
            <li key={g.type}>
              <span>
                {g.count}× {g.name}
              </span>
              <span className="muted">{UNIT_TYPES[g.type].speedKmh} km/h</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
