import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ECONOMY, formatGameTime, netPerDayByNation, type LngLat, type UnitTypeId } from "@waw/shared";
import { ArmyPanel } from "./ArmyPanel.js";
import { useLocalGame } from "./game/useLocalGame.js";
import { loadMap, type LoadedMap } from "./map/loadMap.js";
import { MapView, type MapViewHandle } from "./map/MapView.js";
import { ProvincePanel } from "./ProvincePanel.js";
import { formatCountdown } from "./ui/format.js";
import { NationPicker } from "./ui/NationPicker.js";
import { OfflineBanner } from "./ui/OfflineBanner.js";
import { ResourceBar } from "./ui/ResourceBar.js";

/** Velocità disponibili: x1 è quella vera; le altre servono solo per provare. */
const SPEEDS = [1, 60, 600];

type Selection = { kind: "province"; id: string } | { kind: "army"; id: string } | null;

export function App() {
  const [map, setMap] = useState<LoadedMap | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMap().then(setMap, (e: unknown) => setError(String(e)));
  }, []);

  if (error)
    return (
      <Shell>
        <p className="status error">Errore nel caricamento della mappa: {error}</p>
      </Shell>
    );
  if (!map)
    return (
      <Shell>
        <p className="status">Caricamento della mappa…</p>
      </Shell>
    );
  return <Game map={map} />;
}

function Shell({ children, bar }: { children: ReactNode; bar?: ReactNode }) {
  return (
    <div className="app">
      <header className="topbar">
        <h1>1940 World at War</h1>
        {bar}
      </header>
      <main className="stage">{children}</main>
    </div>
  );
}

function Game({ map }: { map: LoadedMap }) {
  const game = useLocalGame(map);
  const { state } = game;
  const [selection, setSelection] = useState<Selection>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const mapRef = useRef<MapViewHandle>(null);
  const panelRef = useRef<HTMLElement>(null);

  const select = useCallback((next: Selection) => {
    setSelection(next);
    setOrderError(null);
  }, []);

  // Centra la vista su una provincia tenendo conto del pannello, che copre una parte della mappa
  // (a destra su schermi larghi, in basso sul telefono).
  const focus = useCallback((id: string) => {
    const panel = panelRef.current?.getBoundingClientRect();
    const narrow = window.matchMedia("(max-width: 640px)").matches;
    const cover = panel ? (narrow ? { right: 0, bottom: panel.height } : { right: panel.width + 16, bottom: 0 }) : undefined;
    mapRef.current?.focus(id, cover);
  }, []);

  const selectProvinceAndFocus = useCallback(
    (id: string) => {
      select({ kind: "province", id });
      focus(id);
    },
    [select, focus],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [select]);

  const selectedArmy = selection?.kind === "army" ? state?.armies[selection.id] : undefined;
  const selectedProvince = selection?.kind === "province" ? map.provinces.get(selection.id) : undefined;
  const myArmySelected = !!selectedArmy && selectedArmy.owner === state?.playerNation;

  // Un'armata selezionata può essere sparita (si è unita a un'altra): si deseleziona.
  useEffect(() => {
    if (selection?.kind === "army" && state && !state.armies[selection.id]) setSelection(null);
  }, [selection, state]);

  // Clic sulla mappa: se è selezionata una tua armata è un ordine di marcia verso quel punto,
  // altrimenti si seleziona la provincia.
  const onMapProvince = useCallback(
    (id: string | null, at: LngLat) => {
      if (myArmySelected && selectedArmy) {
        setOrderError(game.order({ type: "move", army: selectedArmy.id, target: at }));
        return;
      }
      select(id ? { kind: "province", id } : null);
    },
    [myArmySelected, selectedArmy, game, select],
  );

  const recruit = useCallback(
    (unitType: UnitTypeId) => {
      if (selection?.kind !== "province") return;
      setOrderError(game.order({ type: "recruit", province: selection.id, unitType }));
    },
    [selection, game],
  );

  const provinces = state?.provinces;
  const owners = useMemo(
    () => (provinces ? Object.fromEntries(Object.entries(provinces).map(([id, p]) => [id, p.owner])) : undefined),
    [provinces],
  );
  const armiesRecord = state?.armies;
  const armies = useMemo(() => (armiesRecord ? Object.values(armiesRecord) : []), [armiesRecord]);
  // Saldo giornaliero (produzione − mantenimento): cambia con province e armate, non a ogni tick.
  const playerNation = state?.playerNation;
  const net = useMemo(() => {
    if (!state || !playerNation) return null;
    return netPerDayByNation(map.data, state, ECONOMY).get(playerNation) ?? null;
  }, [map, provinces, armiesRecord, playerNation]);

  const player = state ? map.nations.get(state.playerNation) : undefined;
  const secondsToTick = state ? ((Math.floor(game.now / ECONOMY.tickMinutes + 1) * ECONOMY.tickMinutes - game.now) * 60) / state.clock.speed : 0;

  const bar = state && player && net && (
    <>
      <span className="player">
        <span className="swatch" style={{ background: player.color }} />
        {player.name}
      </span>
      <span className="clock" title={`Prossimo accredito delle risorse tra ${formatCountdown(secondsToTick)}`}>
        {formatGameTime(game.now)}
        <span className="next-tick">⟳ {formatCountdown(secondsToTick)}</span>
      </span>
      <div className="topbar-actions">
        <label className="speed" title="Velocità della partita: x60 e x600 servono solo per provare">
          Velocità
          <select value={state.clock.speed} onChange={(e) => game.setSpeed(Number(e.target.value))}>
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                x{s}
                {s > 1 ? " (prova)" : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          className="text-button"
          onClick={() => {
            if (window.confirm("Vuoi davvero abbandonare questa partita e iniziarne una nuova?")) {
              select(null);
              game.reset();
            }
          }}
        >
          Nuova partita
        </button>
      </div>
      <ResourceBar stock={state.nations[state.playerNation]!.stock} perDay={net} />
    </>
  );

  return (
    <Shell bar={bar}>
      <MapView
        ref={mapRef}
        map={map}
        owners={owners}
        armies={armies}
        playerNation={state?.playerNation ?? null}
        selectedId={selectedProvince?.id ?? null}
        selectedArmyId={selectedArmy?.id ?? null}
        now={game.nowExact}
        onSelect={onMapProvince}
        onSelectArmy={(id) => select({ kind: "army", id })}
      />

      <div className="zoom-controls" role="group" aria-label="Zoom">
        <button onClick={() => mapRef.current?.zoomBy(1.6)} aria-label="Avvicina">
          +
        </button>
        <button onClick={() => mapRef.current?.zoomBy(1 / 1.6)} aria-label="Allontana">
          −
        </button>
        <button onClick={() => mapRef.current?.fit()} aria-label="Vista d'insieme" title="Vista d'insieme">
          ⤢
        </button>
      </div>

      {game.offline && <OfflineBanner report={game.offline} onClose={game.dismissOffline} />}

      {selectedProvince && (
        <ProvincePanel
          ref={panelRef}
          map={map}
          province={selectedProvince}
          game={state}
          now={game.now}
          error={orderError}
          onSelect={selectProvinceAndFocus}
          onSelectArmy={(id) => select({ kind: "army", id })}
          onRecruit={recruit}
          onClose={() => select(null)}
        />
      )}

      {selectedArmy && state && (
        <ArmyPanel
          ref={panelRef}
          map={map}
          army={selectedArmy}
          game={state}
          now={game.now}
          error={orderError}
          onStop={() => setOrderError(game.order({ type: "stop", army: selectedArmy.id }))}
          onSelectProvince={selectProvinceAndFocus}
          onClose={() => select(null)}
        />
      )}

      {!state && (
        <NationPicker
          map={map}
          onPick={(nation) => {
            game.start(nation);
            const capital = map.nations.get(nation)?.capitalProvince;
            if (capital) {
              select({ kind: "province", id: capital });
              // Si centra dopo che il pannello è comparso, per tenerne conto.
              requestAnimationFrame(() => focus(capital));
            }
          }}
        />
      )}
    </Shell>
  );
}
