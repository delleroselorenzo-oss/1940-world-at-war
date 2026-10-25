import type { Ref } from "react";
import {
  AIRCRAFT_TYPE_IDS,
  AIRCRAFT_TYPES,
  atWar,
  BUILDING_IDS,
  BUILDING_TYPES,
  inTruce,
  productionType,
  provinceIdAt,
  provinceProductionPerDay,
  syntheticPerDay,
  RESOURCE_IDS,
  RESOURCE_NAMES,
  UNIT_TYPES,
  type GameState,
  type Province,
} from "@waw/shared";
import type { LoadedMap } from "./map/loadMap.js";
import { formatAmount, formatCountdown } from "./ui/format.js";
import { ResourceIcon } from "./ui/ResourceIcon.js";
import { groupUnits } from "./ui/units.js";

interface ProvincePanelProps {
  map: LoadedMap;
  province: Province;
  game: GameState | null;
  now: number;
  error: string | null;
  onDeclareWar(nation: string): void;
  /** Apre la diplomazia con il padrone della provincia. */
  onDiplomacy(nation: string): void;
  onSelectArmy(id: string): void;
  onSelectSquadron(id: string): void;
  /** Apre gli edifici (o l'arruolamento) limitati a questa provincia. */
  onBuildings(): void;
  onProduction(): void;
  onCancelBuild(): void;
  onClose(): void;
  ref?: Ref<HTMLElement>;
}

const km = new Intl.NumberFormat("it-IT", { useGrouping: true });
const millions = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 });

/** Popolazione in migliaia → testo ("3,7 milioni", "520.000"). */
function formatPopulation(thousands: number): string {
  return thousands >= 1000 ? `${millions.format(thousands / 1000)} milioni` : km.format(thousands * 1000);
}

/** Sviluppo a parole dal PIL pro capite (dollari del 1990). */
function developmentLabel(gdpPerCapita: number): string {
  return gdpPerCapita >= 4500 ? "alto" : gdpPerCapita >= 2500 ? "medio" : "basso";
}

export function ProvincePanel({
  map,
  province,
  game,
  now,
  error,
  onDeclareWar,
  onDiplomacy,
  onSelectArmy,
  onSelectSquadron,
  onBuildings,
  onProduction,
  onCancelBuild,
  onClose,
  ref,
}: ProvincePanelProps) {
  const ps = game?.provinces[province.id];
  const ownerId = ps?.owner ?? province.nation;
  const owner = map.nations.get(ownerId);
  const core = ownerId === province.nation;
  const isMine = game?.playerNation === ownerId;
  const production = ps ? provinceProductionPerDay(province, ps, game?.buildings[province.id]) : null;
  const synthetic = ps ? syntheticPerDay(province, ps, game?.buildings[province.id]) : null;
  const kind = province.isCapital ? "Capitale" : province.type === "urban" ? "Città" : "Provincia rurale";
  const armies = game ? Object.values(game.armies).filter((a) => !a.move && provinceIdAt(map.nav, a.position) === province.id) : [];
  const squadrons = game ? Object.values(game.squadrons).filter((s) => !s.flight && s.base === province.id) : [];
  const canRecruit = isMine && province.type === "urban";
  const queue = game?.production[province.id] ?? [];
  const war = game && !isMine ? atWar(game, game.playerNation, ownerId) : false;
  const truce = game && !isMine ? inTruce(game, game.playerNation, ownerId) : false;
  const buildings = game?.buildings[province.id] ?? {};
  const built = BUILDING_IDS.filter((b) => (buildings[b] ?? 0) > 0);
  const construction = game?.construction[province.id];
  const countdown = (t: number) => (game ? formatCountdown(((t - now) * 60) / game.clock.speed) : "");

  return (
    <aside className="panel" aria-label="Dettagli provincia" ref={ref}>
      <header className="panel-header">
        <div>
          <p className="panel-kicker">
            <span className="swatch" style={{ background: owner?.color }} />
            {owner?.name ?? ownerId}
            {isMine && <span className="tag">la tua nazione</span>}
          </p>
          <h2>{province.name}</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Chiudi">
          ×
        </button>
      </header>

      <div className="panel-body">
        <dl className="facts">
          <div>
            <dt>Tipo</dt>
            <dd>{kind}</dd>
          </div>
          <div>
            <dt>Risorsa principale</dt>
            <dd>{province.resource ? RESOURCE_NAMES[province.resource] : <span className="muted">nessuna</span>}</dd>
          </div>
          <div>
            <dt>Popolazione</dt>
            <dd>{formatPopulation(province.population)}</dd>
          </div>
          <div>
            <dt>Sviluppo</dt>
            <dd>
              {developmentLabel(province.gdpPerCapita)} <span className="muted">({km.format(province.gdpPerCapita)} $ pro capite)</span>
            </dd>
          </div>
          <div>
            <dt>Superficie</dt>
            <dd>{km.format(province.areaKm2)} km²</dd>
          </div>
          <div>
            <dt>Costa</dt>
            <dd>{province.coastal ? "Sì" : "No"}</dd>
          </div>
          {ps && (
            <>
              <div>
                <dt>Morale</dt>
                <dd>{Math.round(ps.morale)}%</dd>
              </div>
              <div>
                <dt>Provincia</dt>
                <dd>{core ? "Core" : "Conquistata"}</dd>
              </div>
            </>
          )}
        </dl>

        {game && !isMine && (
          <div className={war ? "relation war" : "relation"}>
            <span>
              {war ? "Sei in guerra con " : truce ? "Sei in tregua con " : "Sei in pace con "}
              <strong>{owner?.name ?? ownerId}</strong>
            </span>
            <span className="actions">
              <button className="button small secondary" onClick={() => onDiplomacy(ownerId)}>
                Diplomazia
              </button>
              {!war && (
                <button className="button small danger" onClick={() => onDeclareWar(ownerId)}>
                  Dichiara guerra
                </button>
              )}
            </span>
          </div>
        )}
        {isMine && (
          <div className="province-actions">
            <button className="button small" onClick={onBuildings}>
              Costruisci qui
            </button>
            {canRecruit && (
              <button className="button small" onClick={onProduction}>
                Arruola qui
              </button>
            )}
          </div>
        )}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}

        {production && (
          <>
            <h3>Produzione al giorno</h3>
            <ul className="production">
              {RESOURCE_IDS.filter((r) => production[r] > 0).map((r) => (
                <li key={r}>
                  <ResourceIcon resource={r} />
                  <span>{RESOURCE_NAMES[r]}</span>
                  <strong>+{formatAmount(production[r])}</strong>
                </li>
              ))}
              {synthetic && synthetic.oil > 0 && (
                <li>
                  <ResourceIcon resource="oil" />
                  <span>Carburante sintetico</span>
                  <strong>
                    +{formatAmount(synthetic.oil)} petrolio, −{formatAmount(synthetic.metal)} metallo
                  </strong>
                </li>
              )}
            </ul>
            {province.oilMtPerYear && (
              <p className={ps?.wellsSabotaged ? "error-text" : "muted small"}>
                {ps?.wellsSabotaged
                  ? "Pozzi di petrolio sabotati: non producono finché il genio non li ripara."
                  : `Giacimento di petrolio: ${millions.format(province.oilMtPerYear)} milioni di tonnellate all'anno nel 1938.`}
              </p>
            )}
          </>
        )}

        {armies.length > 0 && (
          <>
            <h3>Armate presenti</h3>
            <ul className="neighbors">
              {armies.map((a) => (
                <li key={a.id}>
                  <button onClick={() => onSelectArmy(a.id)}>
                    <span className="swatch" style={{ background: map.nations.get(a.owner)?.color }} />
                    <span className="neighbor-name">{groupUnits(a.units).map((g) => `${g.count}× ${g.name}`).join(", ")}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {squadrons.length > 0 && (
          <>
            <h3>Squadriglie a terra</h3>
            <ul className="neighbors">
              {squadrons.map((s) => (
                <li key={s.id}>
                  <button onClick={() => onSelectSquadron(s.id)}>
                    <span className="swatch" style={{ background: map.nations.get(s.owner)?.color }} />
                    <span className="neighbor-name">
                      {AIRCRAFT_TYPE_IDS.map((t) => [t, s.aircraft.filter((a) => a.type === t).length] as const)
                        .filter(([, n]) => n > 0)
                        .map(([t, n]) => `${n}× ${AIRCRAFT_TYPES[t].name}`)
                        .join(", ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {game && (built.length > 0 || construction || isMine) && (
          <>
            <h3>Edifici</h3>
            {built.length > 0 ? (
              <ul className="buildings">
                {built.map((b) => (
                  <li key={b}>
                    <strong>{BUILDING_TYPES[b].name}</strong>
                    {BUILDING_TYPES[b].maxLevel > 1 && <span className="level">liv. {buildings[b]}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Nessun edificio.</p>
            )}
            {construction && (
              <div className="task">
                <p>
                  In costruzione: {BUILDING_TYPES[construction.building].name}
                  {construction.level > 1 && ` (livello ${construction.level})`} · finisce tra {countdown(construction.finishesAt)}
                </p>
                <span className="progress" aria-hidden>
                  <span
                    style={{
                      width: `${Math.min(100, ((now - construction.startedAt) / (construction.finishesAt - construction.startedAt)) * 100)}%`,
                    }}
                  />
                </span>
                {isMine && (
                  <button className="button small" onClick={onCancelBuild}>
                    Annulla (rimborso)
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {game && queue.length > 0 && (
          <>
            <h3>Arruolamento</h3>
            <ul className="queue">
                {queue.map((item, i) => {
                  const done = item.finishesAt !== null ? 1 - (item.finishesAt - now) / item.durationMinutes : 0;
                  return (
                    <li key={i}>
                      <span>{productionType(item.unitType).name}</span>
                      {item.finishesAt !== null ? (
                        <span className="muted">pronta tra {formatCountdown(((item.finishesAt - now) * 60) / game.clock.speed)}</span>
                      ) : (
                        <span className="muted">in coda</span>
                      )}
                      <span className="progress">
                        <span style={{ width: `${Math.min(100, Math.max(0, done * 100))}%` }} />
                      </span>
                    </li>
                  );
                })}
            </ul>
          </>
        )}
      </div>
    </aside>
  );
}
