import { useEffect, useMemo, useState } from "react";
import {
  AIRCRAFT_TYPE_IDS,
  AIRCRAFT_TYPES,
  ARMOR_CLASS_NAMES,
  isAircraftType,
  BUILDING_TYPES,
  canAfford,
  PLANNED_UNITS,
  productionType,
  recruitMinutes,
  recruitMissing,
  UNIT_TYPE_IDS,
  UNIT_TYPES,
  type BuildingId,
  type GameState,
  type Order,
  type ProducibleId,
} from "@waw/shared";
import type { LoadedMap } from "./map/loadMap.js";
import { CostList } from "./ui/CostList.js";
import { formatAmount, formatCountdown, formatDelay } from "./ui/format.js";

// Produzione: si sceglie il tipo di unità (o di aereo), poi la città dove arruolarla (evidenziate sulla mappa quelle che possono).

/** Categorie di unità: una per edificio che le produce. */
const CATEGORIES: { building: BuildingId; name: string }[] = [
  { building: "barracks", name: "Fanteria e supporto" },
  { building: "tankFactory", name: "Mezzi corazzati" },
  { building: "artilleryFactory", name: "Artiglieria" },
  { building: "aircraftFactory", name: "Aeronautica" },
  { building: "shipyard", name: "Marina" },
];

interface ProductionPanelProps {
  map: LoadedMap;
  game: GameState;
  now: number;
  /** Solo questa città (aperto dal pannello della provincia). */
  only?: string;
  order(o: Order): string | null;
  onFocusProvince(id: string): void;
  onHighlight(ids: ReadonlySet<string>): void;
  /** Apre gli edifici sull'edificio che manca. */
  onBuild(building: BuildingId): void;
  onClearOnly(): void;
  onClose(): void;
}

export function ProductionPanel({ map, game, now, only, order, onFocusProvince, onHighlight, onBuild, onClearOnly, onClose }: ProductionPanelProps) {
  const me = game.playerNation;
  const [category, setCategory] = useState<BuildingId>("barracks");
  const [unit, setUnit] = useState<ProducibleId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cities = useMemo(
    () => map.data.provinces.filter((p) => p.type === "urban" && game.provinces[p.id]?.owner === me && (!only || p.id === only)),
    [map, game.provinces, me, only],
  );
  const able = unit ? cities.filter((c) => recruitMissing(game, c.id, unit) === null) : [];
  const ableKey = able.map((c) => c.id).join(",");

  useEffect(() => {
    onHighlight(new Set(ableKey ? ableKey.split(",") : []));
  }, [ableKey, onHighlight]);
  useEffect(() => () => onHighlight(new Set()), [onHighlight]);

  const stock = game.nations[me]!.stock;
  const send = (o: Order) => setError(order(o));
  const countdown = (t: number) => formatCountdown(((t - now) * 60) / game.clock.speed);
  const queues = Object.entries(game.production).filter(([id, q]) => game.provinces[id]?.owner === me && q.length > 0);
  const onlyName = only ? map.provinces.get(only)?.name : null;
  const type = unit ? productionType(unit) : null;
  const aircraft = unit && isAircraftType(unit) ? AIRCRAFT_TYPES[unit] : null;
  const ground = unit && !isAircraftType(unit) ? UNIT_TYPES[unit] : null;

  return (
    <aside className="panel" aria-label="Produzione">
      <header className="panel-header">
        <div>
          <p className="panel-kicker">
            {unit ? (
              <button className="link-button" onClick={() => setUnit(null)}>
                ‹ Tutte le unità
              </button>
            ) : (
              "Nazione"
            )}
          </p>
          <h2>{type ? type.name : "Produzione"}</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Chiudi">
          ×
        </button>
      </header>
      <div className="panel-body">
        {onlyName && (
          <p className="filter">
            Solo: <strong>{onlyName}</strong>
            <button className="link-button" onClick={onClearOnly}>
              tutte le città
            </button>
          </p>
        )}

        {!unit || !type ? (
          <>
            {queues.length > 0 && (
              <>
                <h3>In arruolamento</h3>
                <ul className="plain-list">
                  {queues.map(([id, q]) => (
                    <li key={id}>
                      <button className="link-button" onClick={() => onFocusProvince(id)}>
                        {map.provinces.get(id)?.name}
                      </button>
                      : {productionType(q[0]!.unitType).name}
                      {q[0]!.finishesAt !== null && <span className="muted small"> · pronta tra {countdown(q[0]!.finishesAt)}</span>}
                      {q.length > 1 && <span className="muted small"> · altre {q.length - 1} in coda</span>}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="chips" role="tablist" aria-label="Categoria">
              {CATEGORIES.map((c) => (
                <button
                  key={c.building}
                  role="tab"
                  aria-selected={c.building === category}
                  className={c.building === category ? "chip active" : "chip"}
                  onClick={() => setCategory(c.building)}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <ul className="choice-list">
              {UNIT_TYPE_IDS.filter((t) => UNIT_TYPES[t].building === category).map((t) => {
                const u = UNIT_TYPES[t];
                const count = cities.filter((c) => recruitMissing(game, c.id, t) === null).length;
                return (
                  <li key={t}>
                    <button onClick={() => setUnit(t)}>
                      <strong>{u.name}</strong>
                      <span className="muted small">
                        classe {ARMOR_CLASS_NAMES[u.armor].toLowerCase()} · {u.speedKmh} km/h · {u.hp} punti vita
                      </span>
                      <span className="muted small">
                        {count === 0 ? `Serve: ${BUILDING_TYPES[u.building].name.toLowerCase()}` : `Si arruola in ${count} città`}
                      </span>
                      <CostList cost={u.cost} stock={stock} />
                    </button>
                  </li>
                );
              })}
              {AIRCRAFT_TYPE_IDS.filter((t) => AIRCRAFT_TYPES[t].building === category).map((t) => {
                const a = AIRCRAFT_TYPES[t];
                const count = cities.filter((c) => recruitMissing(game, c.id, t) === null).length;
                return (
                  <li key={t}>
                    <button onClick={() => setUnit(t)}>
                      <strong>{a.name}</strong>
                      <span className="muted small">{a.description}</span>
                      <span className="muted small">
                        portata {formatAmount(a.rangeKm)} km (raggio d'azione {formatAmount(a.rangeKm / 2)} km) · {a.speedKmh} km/h · {a.hp} punti vita
                      </span>
                      <span className="muted small">
                        {count === 0 ? `Serve: ${BUILDING_TYPES[a.building].name.toLowerCase()}` : `Si costruisce in ${count} città`}
                      </span>
                      <CostList cost={a.cost} stock={stock} />
                    </button>
                  </li>
                );
              })}
              {PLANNED_UNITS.filter((u) => u.building === category).map((u) => (
                <li key={u.id}>
                  <button disabled>
                    <strong>
                      {u.name} <span className="relation-tag">in arrivo</span>
                    </strong>
                    <span className="muted small">{u.description}</span>
                    <span className="muted small">
                      La produrrà: {BUILDING_TYPES[u.building].name.toLowerCase()}. Si potrà arruolare quando {u.building === "shipyard" ? "le navi potranno navigare" : "gli aerei potranno volare"}.
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            {ground && (
              <p className="muted small">
                classe {ARMOR_CLASS_NAMES[ground.armor].toLowerCase()} · {ground.speedKmh} km/h · mantenimento al giorno: <CostList cost={ground.upkeepPerDay} />
              </p>
            )}
            {aircraft && (
              <>
                <p className="muted small">{aircraft.description}</p>
                <p className="muted small">
                  portata {formatAmount(aircraft.rangeKm)} km · raggio d'azione {formatAmount(aircraft.rangeKm / 2)} km · {aircraft.speedKmh} km/h · rifornimento{" "}
                  {formatDelay(aircraft.refuelMinutes)} · mantenimento al giorno: <CostList cost={aircraft.upkeepPerDay} />
                </p>
                <p className="muted small">Esce in una squadriglia a terra nella città, che fa da base grazie alla fabbrica aeronautica.</p>
              </>
            )}
            <p className="small">
              Costo per unità: <CostList cost={type.cost} stock={stock} />
            </p>
            {able.length === 0 ? (
              <p className="muted">Nessuna città con {BUILDING_TYPES[type.building].name.toLowerCase()}.</p>
            ) : (
              <ul className="place-list">
                {able.map((c) => {
                  const queue = game.production[c.id] ?? [];
                  return (
                    <li key={c.id}>
                      <div className="recruit-head">
                        <button className="link-button" onClick={() => onFocusProvince(c.id)}>
                          {c.name}
                        </button>
                        <span className="muted small">
                          {formatDelay(recruitMinutes(game, c.id, unit))}
                          {queue.length > 0 && ` · ${queue.length} in coda`}
                        </span>
                        <button
                          className="button small"
                          disabled={!canAfford(stock, type.cost)}
                          onClick={() => send({ type: "recruit", province: c.id, unitType: unit })}
                        >
                          {aircraft ? "Costruisci" : "Arruola"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {cities.length > able.length && (
              <p className="muted small">
                {cities.length - able.length} {cities.length - able.length === 1 ? "città non ha" : "città non hanno"}{" "}
                {BUILDING_TYPES[type.building].name.toLowerCase()}.{" "}
                <button className="link-button" onClick={() => onBuild(type.building)}>
                  Costruiscila
                </button>
              </p>
            )}
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
