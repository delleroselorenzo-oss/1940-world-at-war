import type { Ref } from "react";
import {
  atWar,
  canAfford,
  provinceIdAt,
  provinceProductionPerDay,
  RESOURCE_IDS,
  RESOURCE_NAMES,
  UNIT_TYPE_IDS,
  UNIT_TYPES,
  type GameState,
  type Province,
  type UnitTypeId,
} from "@waw/shared";
import type { LoadedMap } from "./map/loadMap.js";
import { CostList } from "./ui/CostList.js";
import { formatAmount, formatCountdown, RESOURCE_COLORS } from "./ui/format.js";
import { groupUnits } from "./ui/units.js";

interface ProvincePanelProps {
  map: LoadedMap;
  province: Province;
  game: GameState | null;
  now: number;
  error: string | null;
  onSelect(id: string): void;
  onDeclareWar(nation: string): void;
  onSelectArmy(id: string): void;
  onRecruit(unitType: UnitTypeId): void;
  onClose(): void;
  ref?: Ref<HTMLElement>;
}

const km = new Intl.NumberFormat("it-IT", { useGrouping: true });

export function ProvincePanel({ map, province, game, now, error, onSelect, onDeclareWar, onSelectArmy, onRecruit, onClose, ref }: ProvincePanelProps) {
  const ps = game?.provinces[province.id];
  const ownerId = ps?.owner ?? province.nation;
  const owner = map.nations.get(ownerId);
  const core = ownerId === province.nation;
  const isMine = game?.playerNation === ownerId;
  const production = ps ? provinceProductionPerDay(province, ps) : null;
  const neighbors = [...province.neighbors].sort((a, b) => a.distanceKm - b.distanceKm);
  const kind = province.isCapital ? "Capitale" : province.type === "urban" ? "Città" : "Provincia rurale";
  const armies = game ? Object.values(game.armies).filter((a) => !a.move && provinceIdAt(map.nav, a.position) === province.id) : [];
  const canRecruit = isMine && province.type === "urban";
  const queue = game?.production[province.id] ?? [];
  const stock = game?.nations[game.playerNation]?.stock;
  const war = game && !isMine ? atWar(game, game.playerNation, ownerId) : false;

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
              {war ? "Sei in guerra con " : "Sei in pace con "}
              <strong>{owner?.name ?? ownerId}</strong>
              {!war && <span className="muted"> · entrare nel suo territorio porta alla guerra</span>}
            </span>
            {!war && (
              <button className="button small danger" onClick={() => onDeclareWar(ownerId)}>
                Dichiara guerra
              </button>
            )}
          </div>
        )}
        {!canRecruit && error && (
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
                  <span className="dot" style={{ background: RESOURCE_COLORS[r] }} />
                  <span>{RESOURCE_NAMES[r]}</span>
                  <strong>+{formatAmount(production[r])}</strong>
                </li>
              ))}
            </ul>
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

        {canRecruit && stock && game && (
          <>
            <h3>Arruolamento</h3>
            {queue.length > 0 && (
              <ul className="queue">
                {queue.map((item, i) => {
                  const done = item.finishesAt !== null ? 1 - (item.finishesAt - now) / item.durationMinutes : 0;
                  return (
                    <li key={i}>
                      <span>{UNIT_TYPES[item.unitType].name}</span>
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
            )}
            <ul className="recruit">
              {UNIT_TYPE_IDS.map((t) => {
                const type = UNIT_TYPES[t];
                const affordable = canAfford(stock, type.cost);
                return (
                  <li key={t}>
                    <div className="recruit-head">
                      <strong>{type.name}</strong>
                      <span className="muted">
                        {type.speedKmh} km/h · {type.productionHours} h
                      </span>
                      <button className="button small" disabled={!affordable} onClick={() => onRecruit(t)}>
                        Arruola
                      </button>
                    </div>
                    <CostList cost={type.cost} stock={stock} />
                  </li>
                );
              })}
            </ul>
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}
          </>
        )}

        <h3>Confinanti ({neighbors.length})</h3>
        {neighbors.length === 0 ? (
          <p className="muted">Nessun confine via terra: servirà un collegamento via mare.</p>
        ) : (
          <ul className="neighbors">
            {neighbors.map((n) => {
              const p = map.provinces.get(n.id);
              const nOwner = game?.provinces[n.id]?.owner ?? p?.nation;
              const color = nOwner ? map.nations.get(nOwner)?.color : undefined;
              return (
                <li key={n.id}>
                  <button onClick={() => onSelect(n.id)}>
                    <span className="swatch" style={{ background: color }} />
                    <span className="neighbor-name">{p?.name ?? n.id}</span>
                    <span className="muted">{km.format(n.distanceKm)} km</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
