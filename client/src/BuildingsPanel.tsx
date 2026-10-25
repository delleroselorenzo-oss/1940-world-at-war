import { useEffect, useMemo, useState } from "react";
import {
  allowedIn,
  availableWorks,
  BUILDING_TYPES,
  buildingCost,
  buildingLevel,
  buildingMinutes,
  buildOptions,
  countRole,
  provinceIdAt,
  WORK_BUILDINGS,
  type BuildingId,
  type GameState,
  type Order,
  type Province,
  type WorkType,
} from "@waw/shared";
import { BuildingSheet } from "./BuildingSheet.js";
import type { LoadedMap } from "./map/loadMap.js";
import { buildingEffectHere } from "./ui/buildingEffects.js";
import { CategoryIcon, type CategoryIconId } from "./ui/CategoryIcon.js";
import { ClockIcon } from "./ui/ClockIcon.js";
import { CostList } from "./ui/CostList.js";
import { formatCountdown, formatDelay } from "./ui/format.js";

// Edifici: come Produzione, una striscia con le categorie e una riga per edificio (costo e tempo del livello 1,
// Costruisci). Toccando la riga si apre la scheda con effetto e livelli; Costruisci elenca le province dove si può
// (evidenziate anche sulla mappa). Fortificazioni, aeroporto e porto li costruisce il genio: si avviano da
// un'armata con il genio ferma nella provincia.

export const BUILDING_CATEGORIES: { id: string; name: string; icon: CategoryIconId; buildings: BuildingId[] }[] = [
  { id: "military", name: "Militari", icon: "barracks", buildings: ["barracks", "tankFactory", "artilleryFactory", "aircraftFactory", "shipyard"] },
  { id: "economy", name: "Economia", icon: "factory", buildings: ["industry", "recruitmentOffice", "syntheticFuel"] },
  { id: "engineers", name: "Del genio", icon: "engineer", buildings: ["fortifications", "airfield", "port"] },
];

const WORK_OF: Partial<Record<BuildingId, WorkType>> = Object.fromEntries(Object.entries(WORK_BUILDINGS).map(([w, b]) => [b, w]));

interface BuildingsPanelProps {
  map: LoadedMap;
  game: GameState;
  now: number;
  /** Edificio da mostrare all'apertura. */
  initialBuilding?: BuildingId;
  /** Solo questa provincia (aperto dal pannello della provincia). */
  only?: string;
  order(o: Order): string | null;
  onFocusProvince(id: string): void;
  onHighlight(ids: ReadonlySet<string>): void;
  onClearOnly(): void;
  onClose(): void;
}

export function BuildingsPanel({
  map,
  game,
  now,
  initialBuilding,
  only,
  order,
  onFocusProvince,
  onHighlight,
  onClearOnly,
  onClose,
}: BuildingsPanelProps) {
  const me = game.playerNation;
  const [building, setBuilding] = useState<BuildingId | null>(initialBuilding ?? null);
  const [category, setCategory] = useState(
    BUILDING_CATEGORIES.find((c) => initialBuilding && c.buildings.includes(initialBuilding))?.id ?? "military",
  );
  const [info, setInfo] = useState<BuildingId | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setBuilding(initialBuilding ?? null);
  }, [initialBuilding]);
  const mine = useMemo(
    () => map.data.provinces.filter((p) => game.provinces[p.id]?.owner === me && (!only || p.id === only)),
    [map, game.provinces, me, only],
  );
  const places = building ? mine.filter((p) => allowedIn(building, p)) : [];
  const placesKey = places.map((p) => p.id).join(",");

  // Sulla mappa si evidenziano le province dove si può costruire l'edificio scelto.
  useEffect(() => {
    onHighlight(new Set(placesKey ? placesKey.split(",") : []));
  }, [placesKey, onHighlight]);
  useEffect(() => () => onHighlight(new Set()), [onHighlight]);

  const send = (o: Order) => setError(order(o));
  const stock = game.nations[me]!.stock;
  const countdown = (t: number) => formatCountdown(((t - now) * 60) / game.clock.speed);
  const underway = Object.entries(game.construction).filter(([id]) => game.provinces[id]?.owner === me);
  const onlyName = only ? map.provinces.get(only)?.name : null;

  return (
    <aside className="panel" aria-label="Edifici">
      <header className="panel-header">
        <div>
          <p className="panel-kicker">
            {building ? (
              <button className="link-button" onClick={() => setBuilding(null)}>
                ‹ Tutti gli edifici
              </button>
            ) : (
              "Nazione"
            )}
          </p>
          <h2>{building ? BUILDING_TYPES[building].name : "Edifici"}</h2>
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
              tutte le province
            </button>
          </p>
        )}

        {!building ? (
          <>
            {underway.length > 0 && (
              <>
                <h3>In costruzione</h3>
                <ul className="plain-list">
                  {underway.map(([id, c]) => (
                    <li key={id}>
                      <button className="link-button" onClick={() => onFocusProvince(id)}>
                        {map.provinces.get(id)?.name}
                      </button>
                      : {BUILDING_TYPES[c.building].name}
                      {c.level > 1 && ` (liv. ${c.level})`} <span className="muted small">· finisce tra {countdown(c.finishesAt)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="category-strip three" role="tablist" aria-label="Categoria">
              {BUILDING_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  role="tab"
                  aria-selected={c.id === category}
                  className={c.id === category ? "category-tile active" : "category-tile"}
                  onClick={() => setCategory(c.id)}
                >
                  <CategoryIcon icon={c.icon} />
                  <span>{c.name}</span>
                </button>
              ))}
            </div>
            <ul className="unit-rows">
              {BUILDING_CATEGORIES.find((c) => c.id === category)!.buildings.map((b) => {
                const type = BUILDING_TYPES[b];
                const built = mine.filter((p) => buildingLevel(game, p.id, b) > 0).length;
                return (
                  <li key={b} className="unit-row">
                    <button className="unit-row-info" onClick={() => setInfo(b)} aria-label={`Caratteristiche: ${type.name}`}>
                      <span className="unit-thumb" aria-hidden />
                      <span className="unit-row-text">
                        <strong>{type.name}</strong>
                        <CostList cost={buildingCost(b, 1)} stock={stock} />
                        <span className="muted small time">
                          <ClockIcon /> {formatDelay(buildingMinutes(b, 1))}
                          {built > 0 && ` · già in ${built}`}
                          {type.byEngineers && " · genio"}
                        </span>
                      </span>
                    </button>
                    <button className="button small" onClick={() => setBuilding(b)}>
                      Costruisci
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <>
            <p className="small">
              <button className="link-button" onClick={() => setInfo(building)}>
                Vedi le caratteristiche
              </button>
            </p>
            {places.length === 0 ? (
              <p className="muted">Nessuna delle tue province è adatta.</p>
            ) : BUILDING_TYPES[building].byEngineers ? (
              <EngineerPlaces map={map} game={game} now={now} building={building} places={places} onFocusProvince={onFocusProvince} send={send} />
            ) : (
              <ul className="place-list">
                {places.map((p) => {
                  const option = buildOptions(game, p, me).find((o) => o.building === building)!;
                  const level = buildingLevel(game, p.id, building);
                  const max = option.missing === "Livello massimo.";
                  const effect = max ? null : buildingEffectHere(building, p, game.provinces[p.id]!, game.buildings[p.id]);
                  return (
                    <li key={p.id}>
                      <div className="recruit-head">
                        <button className="link-button" onClick={() => onFocusProvince(p.id)}>
                          {p.name}
                        </button>
                        <span className="muted small">{level > 0 ? `liv. ${level}` : "non c'è"}</span>
                        {!max && (
                          <button
                            className="button small"
                            disabled={option.missing !== null}
                            title={option.missing ?? undefined}
                            onClick={() => send({ type: "build", province: p.id, building })}
                          >
                            {level === 0 ? "Costruisci" : "Migliora"}
                          </button>
                        )}
                      </div>
                      {effect && <span className="effect small">{effect}</span>}
                      {max ? (
                        <span className="muted small">Livello massimo.</span>
                      ) : (
                        <span className="muted small">
                          {option.missing && option.missing !== "Risorse insufficienti." ? option.missing : formatDelay(option.minutes)}
                          {(!option.missing || option.missing === "Risorse insufficienti.") && <CostList cost={option.cost} stock={stock} />}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
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
        <BuildingSheet
          building={info}
          stock={stock}
          places={mine.filter((p) => allowedIn(info, p)).length}
          built={mine.filter((p) => buildingLevel(game, p.id, info) > 0).length}
          onBuild={() => {
            setBuilding(info);
            setInfo(null);
          }}
          onClose={() => setInfo(null)}
        />
      )}
    </aside>
  );
}

interface EngineerPlacesProps {
  map: LoadedMap;
  game: GameState;
  now: number;
  building: BuildingId;
  places: Province[];
  onFocusProvince(id: string): void;
  send(o: Order): void;
}

/** Province adatte a un edificio del genio, con le armate del genio ferme lì che possono avviare il lavoro. */
function EngineerPlaces({ map, game, now, building, places, onFocusProvince, send }: EngineerPlacesProps) {
  const me = game.playerNation;
  const work = WORK_OF[building]!;
  const world = { map: map.data, nav: map.nav };
  const engineers = Object.values(game.armies).filter((a) => a.owner === me && countRole(a, "engineer") > 0 && !a.move);
  return (
    <>
      <p className="muted small">Serve un'armata con il genio ferma nella provincia; più unità del genio, meno tempo.</p>
      <ul className="place-list">
        {places.map((p) => {
          const level = buildingLevel(game, p.id, building);
          const here = engineers.filter((a) => provinceIdAt(map.nav, a.position) === p.id);
          const effect = level < BUILDING_TYPES[building].maxLevel ? buildingEffectHere(building, p, game.provinces[p.id]!, game.buildings[p.id]) : null;
          return (
            <li key={p.id}>
              <div className="recruit-head">
                <button className="link-button" onClick={() => onFocusProvince(p.id)}>
                  {p.name}
                </button>
                <span className="muted small">{level > 0 ? `liv. ${level}` : "non c'è"}</span>
              </div>
              {effect && <span className="effect small">{effect}</span>}
              {level >= BUILDING_TYPES[building].maxLevel ? (
                <span className="muted small">Livello massimo.</span>
              ) : here.length === 0 ? (
                <span className="muted small">Nessuna armata con il genio qui.</span>
              ) : (
                here.map((a) => {
                  const option = availableWorks(game, world, a, now).find((o) => o.work === work);
                  if (!option) return null;
                  return (
                    <div key={a.id} className="engineer-row">
                      <span className="muted small">
                        Armata con {countRole(a, "engineer")} genio · {option.missing ?? formatDelay(option.minutes)}
                      </span>
                      {option.cost && <CostList cost={option.cost} stock={game.nations[me]!.stock} />}
                      <button className="button small" disabled={option.missing !== null} onClick={() => send({ type: "work", army: a.id, work })}>
                        Avvia
                      </button>
                    </div>
                  );
                })
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
