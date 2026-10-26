import { useEffect, useMemo, useState } from "react";
import {
  AIRCRAFT_TYPE_IDS,
  AIRCRAFT_TYPES,
  doctrineOf,
  isAircraftType,
  BUILDING_TYPES,
  canAfford,
  PLANNED_UNITS,
  productionType,
  recruitMinutes,
  recruitMissing,
  UNIT_TYPE_IDS,
  type BuildingId,
  type GameState,
  type Order,
  type ProducibleId,
} from "@waw/shared";
import type { LoadedMap } from "./map/loadMap.js";
import { CategoryIcon, type CategoryIconId } from "./ui/CategoryIcon.js";
import { ClockIcon } from "./ui/ClockIcon.js";
import { CostList } from "./ui/CostList.js";
import { formatCountdown, formatDelay } from "./ui/format.js";
import { UnitSheet } from "./UnitSheet.js";
import { UnitThumb, unitImageUrl } from "./ui/unitImages.js";

// Produzione: una striscia con le categorie, poi una riga per unità (immagine, costi, tempo, Arruola).
// Toccando la riga si apre la scheda con tutte le caratteristiche; Arruola elenca le città dove si può
// (evidenziate anche sulla mappa).

/** Categorie di unità: una per edificio che le produce. */
const CATEGORIES: { building: BuildingId; name: string; icon: CategoryIconId }[] = [
  { building: "barracks", name: "Fanteria", icon: "infantry" },
  { building: "tankFactory", name: "Corazzati", icon: "armor" },
  { building: "artilleryFactory", name: "Artiglieria", icon: "artillery" },
  { building: "aircraftFactory", name: "Aeronautica", icon: "air" },
  { building: "shipyard", name: "Marina", icon: "navy" },
];

const PRODUCIBLE: ProducibleId[] = [...UNIT_TYPE_IDS, ...AIRCRAFT_TYPE_IDS];

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
  const doctrine = doctrineOf(me);
  const [category, setCategory] = useState<BuildingId>("barracks");
  const [unit, setUnit] = useState<ProducibleId | null>(null);
  const [info, setInfo] = useState<ProducibleId | null>(null);
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
  const producible = PRODUCIBLE.filter((t) => productionType(t).building === category);

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
            <div className="category-strip" role="tablist" aria-label="Categoria">
              {CATEGORIES.map((c) => (
                <button
                  key={c.building}
                  role="tab"
                  aria-selected={c.building === category}
                  className={c.building === category ? "category-tile active" : "category-tile"}
                  onClick={() => setCategory(c.building)}
                >
                  <CategoryIcon icon={c.icon} />
                  <span>{c.name}</span>
                </button>
              ))}
            </div>
            <ul className="unit-rows">
              {producible.map((t) => {
                const u = productionType(t);
                return (
                  <li key={t} className="unit-row">
                    <button className="unit-row-info" onClick={() => setInfo(t)} aria-label={`Caratteristiche: ${u.name}`}>
                      <UnitThumb src={unitImageUrl(doctrine, t)} />
                      <span className="unit-row-text">
                        <strong>{u.name}</strong>
                        <CostList cost={u.cost} stock={stock} />
                        <span className="muted small time">
                          <ClockIcon /> {formatDelay(u.productionHours * 60)}
                        </span>
                      </span>
                    </button>
                    <button className="button small" onClick={() => setUnit(t)}>
                      {isAircraftType(t) ? "Costruisci" : "Arruola"}
                    </button>
                  </li>
                );
              })}
              {PLANNED_UNITS.filter((u) => u.building === category).map((u) => (
                <li key={u.id} className="unit-row planned" title={u.description}>
                  <div className="unit-row-info">
                    <UnitThumb src={unitImageUrl(doctrine, u.id)} />
                    <span className="unit-row-text">
                      <strong>{u.name}</strong>
                      <span className="muted small">{u.description}</span>
                    </span>
                  </div>
                  <span className="relation-tag">in arrivo</span>
                </li>
              ))}
            </ul>
            {category === "shipyard" && <p className="muted small">Le navi si potranno costruire quando potranno navigare.</p>}
          </>
        ) : (
          <>
            {aircraft && <p className="muted small">Esce in una squadriglia a terra nella città, che fa da base grazie alla fabbrica aeronautica.</p>}
            <p className="small">
              Costo per unità: <CostList cost={type.cost} stock={stock} />
            </p>
            <p className="small">
              <button className="link-button" onClick={() => setInfo(unit)}>
                Vedi le caratteristiche
              </button>
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
      {info && (
        <UnitSheet
          unit={info}
          image={unitImageUrl(doctrine, info)}
          stock={stock}
          onRecruit={() => {
            setUnit(info);
            setInfo(null);
          }}
          onClose={() => setInfo(null)}
        />
      )}
    </aside>
  );
}
