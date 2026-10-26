import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  airBases,
  armyPosition,
  atWar,
  hasAgreement,
  inTruce,
  knowsComposition,
  provinceIdAt,
  visionOf,
  flatKm,
  squadronPosition,
  fleetPosition,
  harborOf,
  squadronRangeKm,
  ECONOMY,
  enemiesOf,
  engagements,
  wouldStartWar,
  type Army,
  type LngLat,
  type ResourceId,
  type BuildingId,
  type WorkType,
  type GameState,
  type Vision,
} from "@waw/shared";
import { ArmyPanel, type ArmyMode } from "./ArmyPanel.js";
import { BuildingsPanel } from "./BuildingsPanel.js";
import { DiplomacyPanel } from "./DiplomacyPanel.js";
import { ProductionPanel } from "./ProductionPanel.js";
import { useLocalGame } from "./game/useLocalGame.js";
import { loadMap, type LoadedMap } from "./map/loadMap.js";
import { MapView, type MapViewHandle } from "./map/MapView.js";
import type { MapWorks } from "./map/TerrainLayer.js";
import type { ProvinceStyle } from "./map/MapRenderer.js";
import type { MapMode, Standing } from "./map/mapModes.js";
import { MapModeSwitch } from "./ui/MapModeSwitch.js";
import { ProvincePanel } from "./ProvincePanel.js";
import { SquadronPanel, type SquadronMode } from "./SquadronPanel.js";
import { FleetPanel, type FleetMode } from "./FleetPanel.js";
import { TradePanel } from "./TradePanel.js";
import { EventFeed } from "./ui/EventFeed.js";
import { formatCountdown } from "./ui/format.js";
import { NationPicker } from "./ui/NationPicker.js";
import { OfflineBanner } from "./ui/OfflineBanner.js";
import { nationBalance } from "./ui/balance.js";
import { Dock, type DockItem } from "./ui/Dock.js";
import { ResourceBar } from "./ui/ResourceBar.js";
import { DayCounter, LeaderCard } from "./ui/TopBar.js";

/** Velocità disponibili: x1 è quella vera; le altre servono solo per provare. */
const SPEEDS = [1, 60, 600];

type Selection =
  | { kind: "province"; id: string }
  | { kind: "army"; id: string }
  | { kind: "squadron"; id: string }
  | { kind: "fleet"; id: string }
  | { kind: "diplomacy"; nation: string | null }
  | { kind: "trade" }
  /** `only`: limitato a una provincia (aperto dal suo pannello); `building`: edificio già scelto. */
  | { kind: "buildings"; only?: string; building?: BuildingId }
  | { kind: "production"; only?: string }
  | null;

const NO_HIGHLIGHT: ReadonlySet<string> = new Set();
const MAP_MODE_KEY = "waw.mapMode";

/** Rapporto di ogni nazione con il giocatore, per la mappa della diplomazia. */
function standingsOf(state: GameState, nations: string[]): Record<string, Standing> {
  const me = state.playerNation;
  const standing = (n: string): Standing =>
    n === me ? "self" : hasAgreement(state, me, n, "sharedVision") ? "shared" : atWar(state, me, n) ? "war" : inTruce(state, me, n) ? "truce" : "neutral";
  return Object.fromEntries(nations.map((n) => [n, standing(n)]));
}

/** Lavori sulla mappa che il giocatore vede: i propri (e di chi condivide la mappa) e quelli nelle province visibili. */
function visibleWorks(state: GameState, vision: Vision, map: LoadedMap): MapWorks {
  const seen = (at: LngLat) => {
    const id = provinceIdAt(map.nav, at);
    return id !== null && vision.provinces.has(id);
  };
  const bridgeAt = new Map(map.nav.bridges.map((b) => [b.id, b.at]));
  return {
    destroyedBridges: state.destroyedBridges.filter((id) => {
      const at = bridgeAt.get(id);
      return at !== undefined && seen(at);
    }),
    pontoons: Object.fromEntries(Object.entries(state.pontoons).filter(([, p]) => vision.viewers.has(p.owner) || seen(p.at))),
    hospitals: Object.fromEntries(Object.entries(state.hospitals).filter(([, h]) => vision.viewers.has(h.owner) || seen(h.at))),
  };
}

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
      <header className={bar ? "topbar in-game" : "topbar"}>
        {bar ?? <h1>1940 World at War</h1>}
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
  // Azione scelta nel pannello dell'armata: il prossimo tocco sulla mappa la esegue.
  const [armyMode, setArmyMode] = useState<ArmyMode>(null);
  const [delayMinutes, setDelayMinutes] = useState(0);
  // Scelta del treno: resta impostata finché il giocatore non la cambia.
  const [useRail, setUseRail] = useState(false);
  // Pannello della squadriglia: il prossimo tocco sulla mappa sceglie la base d'arrivo ("Vola") o il bersaglio ("Attacca").
  const [squadronMode, setSquadronMode] = useState<SquadronMode>(null);
  // Pannello della flotta: il prossimo tocco sulla mappa dà la meta ("Naviga").
  const [fleetMode, setFleetMode] = useState<FleetMode>(null);
  // Province evidenziate dai pannelli Edifici e Produzione.
  const [highlighted, setHighlighted] = useState<ReadonlySet<string>>(NO_HIGHLIGHT);
  const mapRef = useRef<MapViewHandle>(null);
  const panelRef = useRef<HTMLElement>(null);

  const select = useCallback((next: Selection) => {
    setSelection(next);
    setOrderError(null);
    setArmyMode(null);
    setDelayMinutes(0);
    setSquadronMode(null);
    setFleetMode(null);
  }, []);

  // Centra la vista su una provincia tenendo conto del pannello, che copre una parte della mappa
  // (a destra su schermi larghi, in basso sul telefono).
  const focus = useCallback((id: string) => {
    const panel = (panelRef.current ?? document.querySelector<HTMLElement>(".panel"))?.getBoundingClientRect();
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
      if (e.key !== "Escape") return;
      // Prima si annulla l'azione scelta, poi si chiude il pannello.
      if (armyMode) setArmyMode(null);
      else if (squadronMode) setSquadronMode(null);
      else if (fleetMode) setFleetMode(null);
      else select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [select, armyMode, squadronMode, fleetMode]);

  const selectedArmy = selection?.kind === "army" ? state?.armies[selection.id] : undefined;
  const selectedProvince = selection?.kind === "province" ? map.provinces.get(selection.id) : undefined;
  const myArmySelected = !!selectedArmy && selectedArmy.owner === state?.playerNation;
  const selectedSquadron = selection?.kind === "squadron" ? state?.squadrons[selection.id] : undefined;
  const selectedFleet = selection?.kind === "fleet" ? state?.fleets[selection.id] : undefined;

  // Nebbia di guerra: cosa vede il giocatore (si aggiorna ogni secondo, col tempo di gioco).
  const vision = useMemo(() => (state ? visionOf(state, { map: map.data, nav: map.nav }, state.playerNation, game.now) : null), [map, state, game.now]);
  // Lo stesso insieme di province finché non cambia, così la mappa ridisegna la nebbia solo quando serve.
  const visibleRef = useRef<{ key: string; set: ReadonlySet<string> } | null>(null);
  const visibleProvinces = useMemo(() => {
    if (!vision) return null;
    const key = [...vision.provinces].sort().join(",");
    if (visibleRef.current?.key !== key) visibleRef.current = { key, set: vision.provinces };
    return visibleRef.current.set;
  }, [vision]);

  // Un'armata selezionata può essere sparita (si è unita a un'altra) o finita nella nebbia: si deseleziona.
  useEffect(() => {
    if (selection?.kind === "army" && state && (!state.armies[selection.id] || (vision && !vision.armies.has(selection.id)))) setSelection(null);
    if (selection?.kind === "squadron" && state && (!state.squadrons[selection.id] || (vision && !vision.squadrons.has(selection.id)))) setSelection(null);
    if (selection?.kind === "fleet" && state && (!state.fleets[selection.id] || (vision && !vision.fleets.has(selection.id)))) setSelection(null);
  }, [selection, state, vision]);

  const mySquadronSelected = !!selectedSquadron && selectedSquadron.owner === state?.playerNation;
  const choosingBase = mySquadronSelected && squadronMode === "fly";
  const choosingTarget = mySquadronSelected && squadronMode === "strike";
  const choosingSea = !!selectedFleet && selectedFleet.owner === state?.playerNation && fleetMode === "sail";

  const sailTo = useCallback(
    (at: LngLat) => {
      if (!selectedFleet) return;
      const error = game.order({ type: "sail", fleet: selectedFleet.id, target: at });
      setOrderError(error);
      if (!error) setFleetMode(null);
    },
    [selectedFleet, game],
  );

  // Basi dove la squadriglia selezionata può volare adesso: evidenziate sulla mappa mentre si sceglie.
  const reachableBases = useMemo(() => {
    if (!choosingBase || !state || !selectedSquadron || selectedSquadron.flight) return NO_HIGHLIGHT;
    const here = squadronPosition(state, selectedSquadron, map.data, state.time);
    const range = squadronRangeKm(selectedSquadron);
    return new Set(
      airBases(state, map.data, selectedSquadron.owner)
        .filter((p) => p.id !== selectedSquadron.base && flatKm(here, p.center) <= range)
        .map((p) => p.id),
    );
  }, [choosingBase, state, selectedSquadron, map]);

  const flyTo = useCallback(
    (base: string) => {
      if (!selectedSquadron) return;
      const error = game.order({ type: "fly", squadron: selectedSquadron.id, base });
      setOrderError(error);
      if (!error) setSquadronMode(null);
    },
    [selectedSquadron, game],
  );

  const strike = useCallback(
    (target: string) => {
      if (!selectedSquadron) return;
      const error = game.order({ type: "airStrike", squadron: selectedSquadron.id, target });
      setOrderError(error);
      if (!error) setSquadronMode(null);
    },
    [selectedSquadron, game],
  );

  // Marcia della tua armata selezionata verso un punto. Se il punto è di una nazione con cui
  // non sei in guerra e non hai accordi, entrarci vuol dire guerra: si chiede conferma.
  const marchTo = useCallback(
    (at: LngLat, attack: boolean) => {
      if (!state || !selectedArmy) return;
      const enemy = wouldStartWar(state, map.nav, state.playerNation, at);
      const name = enemy ? (map.nations.get(enemy)?.name ?? enemy) : "";
      if (enemy && !window.confirm(`${name}: entrare nel suo territorio senza accordi significa entrare in guerra. Vuoi procedere?`)) return;
      const error = game.order({ type: "move", army: selectedArmy.id, target: at, attack, delayMinutes, rail: useRail });
      setOrderError(error);
      // Il pulsante vale per un solo ordine.
      if (!error) {
        setArmyMode(null);
        setDelayMinutes(0);
      }
    },
    [state, selectedArmy, map, game, delayMinutes, useRail],
  );

  const targeting = myArmySelected && armyMode !== null;

  // Tocco sulla mappa: con un'azione scelta (Muovi, Attacca) è l'ordine; altrimenti si seleziona la provincia.
  const onMapProvince = useCallback(
    (id: string | null, at: LngLat) => {
      if (targeting) return marchTo(at, armyMode === "attack");
      if (choosingBase) {
        if (id && reachableBases.has(id)) flyTo(id);
        else setOrderError("Tocca una delle basi evidenziate.");
        return;
      }
      if (choosingTarget) return setOrderError("Tocca un'armata nemica.");
      // Toccando una provincia costiera la flotta va al suo approdo.
      if (choosingSea) return sailTo((id ? harborOf(map.nav, id) : null) ?? at);
      select(id ? { kind: "province", id } : null);
    },
    [targeting, armyMode, marchTo, choosingBase, choosingTarget, reachableBases, flyTo, choosingSea, sailTo, map, select],
  );

  // Tocco su un'armata: con un'azione scelta diventa il bersaglio (o la meta, se è tua: le armate si uniscono).
  const onMapArmy = useCallback(
    (id: string) => {
      const other = state?.armies[id];
      if (targeting && other && id !== selectedArmy?.id) return marchTo(armyPosition(other, game.nowExact()), armyMode === "attack");
      if (choosingTarget) return strike(id);
      select({ kind: "army", id });
    },
    [state, targeting, armyMode, selectedArmy, marchTo, choosingTarget, strike, game, select],
  );

  // Tocco su una squadriglia: mentre si sceglie la base, conta come tocco sulla sua base.
  const onMapSquadron = useCallback(
    (id: string) => {
      const other = state?.squadrons[id];
      if (choosingBase && other && !other.flight && id !== selectedSquadron?.id) return onMapProvince(other.base, map.provinces.get(other.base)!.center);
      select({ kind: "squadron", id });
    },
    [state, choosingBase, selectedSquadron, onMapProvince, map, select],
  );

  // Tocco su una flotta: mentre si sceglie la meta, si va dove si trova; per una squadriglia è la base (portaerei) o il bersaglio.
  const onMapFleet = useCallback(
    (id: string) => {
      const other = state?.fleets[id];
      if (choosingSea && other && id !== selectedFleet?.id) return sailTo(fleetPosition(other, game.nowExact()));
      if (choosingBase && other) return flyTo(id);
      if (choosingTarget) return strike(id);
      select({ kind: "fleet", id });
    },
    [state, choosingSea, selectedFleet, sailTo, choosingBase, flyTo, choosingTarget, strike, game, select],
  );

  const work = useCallback(
    (type: WorkType) => {
      if (selectedArmy) setOrderError(game.order({ type: "work", army: selectedArmy.id, work: type }));
    },
    [selectedArmy, game],
  );

  const declareWar = useCallback(
    (nation: string) => {
      const name = map.nations.get(nation)?.name ?? nation;
      if (window.confirm(`Vuoi davvero dichiarare guerra a ${name}?`)) setOrderError(game.order({ type: "declareWar", against: nation }));
    },
    [map, game],
  );

  const cancelBuild = useCallback(() => {
    if (selection?.kind !== "province") return;
    setOrderError(game.order({ type: "cancelBuild", province: selection.id }));
  }, [selection, game]);

  const setImport = useCallback(
    (resource: ResourceId, perDay: number) => setOrderError(game.order({ type: "setImport", resource, perDay })),
    [game],
  );

  const provinces = state?.provinces;
  const owners = useMemo(
    () => (provinces ? Object.fromEntries(Object.entries(provinces).map(([id, p]) => [id, p.owner])) : undefined),
    [provinces],
  );
  const armiesRecord = state?.armies;
  const squadronsRecord = state?.squadrons;
  // Sulla mappa solo armate e squadriglie che il giocatore vede; l'elenco cambia solo quando cambia qualcosa.
  const visibleArmyKey = vision ? [...vision.armies].sort().join(",") : "";
  const armies = useMemo(
    () => (armiesRecord ? Object.values(armiesRecord).filter((a) => !vision || vision.armies.has(a.id)) : []),
    [armiesRecord, visibleArmyKey],
  );
  const visibleSquadronKey = vision ? [...vision.squadrons].sort().join(",") : "";
  const squadrons = useMemo(
    () => (squadronsRecord ? Object.values(squadronsRecord).filter((sq) => !vision || vision.squadrons.has(sq.id)) : []),
    [squadronsRecord, visibleSquadronKey],
  );
  const fleetsRecord = state?.fleets;
  const visibleFleetKey = vision ? [...vision.fleets].sort().join(",") : "";
  const fleets = useMemo(
    () => (fleetsRecord ? Object.values(fleetsRecord).filter((f) => !vision || vision.fleets.has(f.id)) : []),
    [fleetsRecord, visibleFleetKey],
  );
  const works = useMemo(() => (state && vision ? visibleWorks(state, vision, map) : null), [state?.destroyedBridges, state?.pontoons, state?.hospitals, visibleProvinces]);

  // Modalità della mappa, ricordata nel browser.
  const [mapMode, setMapMode] = useState<MapMode>(() => {
    try {
      const saved = localStorage.getItem(MAP_MODE_KEY);
      return saved === "terrain" || saved === "morale" || saved === "diplomacy" ? saved : "political";
    } catch {
      return "political";
    }
  });
  const changeMapMode = useCallback((mode: MapMode) => {
    setMapMode(mode);
    try {
      localStorage.setItem(MAP_MODE_KEY, mode);
    } catch {
      // senza localStorage la scelta vale solo per questa visita
    }
  }, []);
  const morale = useMemo(() => (provinces ? Object.fromEntries(Object.entries(provinces).map(([id, p]) => [id, p.morale])) : {}), [provinces]);
  const relationsForStyle = state?.relations;
  const standings = useMemo(() => (state ? standingsOf(state, [...map.nations.keys()]) : {}), [map, relationsForStyle, state?.playerNation]);
  const provinceStyle = useMemo<ProvinceStyle | undefined>(
    () => (owners ? { mode: mapMode, owners, morale, standings, visible: visibleProvinces } : undefined),
    [mapMode, owners, morale, standings, visibleProvinces],
  );
  // Entrate e uscite giornaliere (produzione, mantenimento, commercio, carburante sintetico):
  // cambiano con province, armate, edifici, contratti e guerre, non a ogni tick.
  const playerNation = state?.playerNation;
  const buildingsRecord = state?.buildings;
  const imports = playerNation ? state?.nations[playerNation]?.imports : undefined;
  const relationsRecord = state?.relations;
  const balance = useMemo(
    () => (state && playerNation ? nationBalance(map.data, state, playerNation) : null),
    [map, provinces, armiesRecord, squadronsRecord, playerNation, buildingsRecord, imports, relationsRecord],
  );

  // Chi combatte con chi in questo momento (si aggiorna ogni secondo, col tempo di gioco).
  const now = game.now;
  const engaged = useMemo(() => (state ? engagements(state, now) : new Map<string, string[]>()), [state, now]);
  const engagedSet = useMemo(() => new Set(engaged.keys()), [engaged]);
  const foes: Army[] = selectedArmy && state ? (engaged.get(selectedArmy.id) ?? []).map((id) => state.armies[id]!).filter(Boolean) : [];
  const relations = state?.relations;
  const enemies = useMemo(() => (state && relations ? enemiesOf(state, state.playerNation) : []), [relations, playerNation]);

  const player = state ? map.nations.get(state.playerNation) : undefined;
  const pendingProposals = state ? state.proposals.filter((p) => p.status === "pending" && p.to === state.playerNation).length : 0;
  const dockActive: DockItem | null =
    selection?.kind === "diplomacy" || selection?.kind === "trade" || selection?.kind === "buildings" || selection?.kind === "production" ? selection.kind : null;
  const openDock = useCallback(
    (item: DockItem) => {
      if (selection?.kind === item) return select(null);
      select(item === "diplomacy" ? { kind: "diplomacy", nation: null } : { kind: item });
    },
    [selection, select],
  );
  const secondsToTick = state ? ((Math.floor(game.now / ECONOMY.tickMinutes + 1) * ECONOMY.tickMinutes - game.now) * 60) / state.clock.speed : 0;

  const bar = state && player && balance && (
    <>
      <LeaderCard nation={player} minutes={game.now} />
      <ResourceBar stock={state.nations[state.playerNation]!.stock} balance={balance} />
      <DayCounter minutes={game.now} secondsToTick={secondsToTick} />
      <div className="topbar-actions">
        {enemies.length > 0 && (
          <span className="wars" title="Nazioni con cui sei in guerra">
            ⚔ {enemies.map((id) => map.nations.get(id)?.name ?? id).join(", ")}
          </span>
        )}
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
    </>
  );

  return (
    <Shell bar={bar}>
      <MapView
        ref={mapRef}
        map={map}
        provinceStyle={provinceStyle}
        armies={armies}
        squadrons={squadrons}
        fleets={fleets}
        engaged={engagedSet}
        playerNation={state?.playerNation ?? null}
        works={works}
        targeting={targeting || choosingBase || choosingTarget || choosingSea}
        selectedId={selectedProvince?.id ?? null}
        selectedArmyId={selectedArmy?.id ?? null}
        selectedSquadronId={selectedSquadron?.id ?? null}
        selectedFleetId={selectedFleet?.id ?? null}
        highlighted={choosingBase ? reachableBases : highlighted}
        now={game.nowExact}
        onSelect={onMapProvince}
        onSelectArmy={onMapArmy}
        onSelectSquadron={onMapSquadron}
        onSelectFleet={onMapFleet}
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

      {state && <MapModeSwitch mode={mapMode} onChange={changeMapMode} />}

      {game.offline && <OfflineBanner report={game.offline} onClose={game.dismissOffline} />}

      {state && <EventFeed map={map} game={state} onSelectProvince={selectProvinceAndFocus} />}

      {selection?.kind === "trade" && state && (
        <TradePanel
          map={map}
          game={state}
          error={orderError}
          onSetImport={setImport}
          order={game.order}
          onSelectProvince={selectProvinceAndFocus}
          onClose={() => select(null)}
        />
      )}

      {selection?.kind === "diplomacy" && state && (
        <DiplomacyPanel
          map={map}
          game={state}
          now={game.now}
          nation={selection.nation}
          onNation={(nation) => select({ kind: "diplomacy", nation })}
          order={game.order}
          onClose={() => select(null)}
        />
      )}

      {selection?.kind === "buildings" && state && (
        <BuildingsPanel
          map={map}
          game={state}
          now={game.now}
          initialBuilding={selection.building}
          only={selection.only}
          order={game.order}
          onFocusProvince={focus}
          onHighlight={setHighlighted}
          onClearOnly={() => select({ kind: "buildings" })}
          onClose={() => select(null)}
        />
      )}

      {selection?.kind === "production" && state && (
        <ProductionPanel
          map={map}
          game={state}
          now={game.now}
          only={selection.only}
          order={game.order}
          onFocusProvince={focus}
          onHighlight={setHighlighted}
          onBuild={(building) => select({ kind: "buildings", building })}
          onClearOnly={() => select({ kind: "production" })}
          onClose={() => select(null)}
        />
      )}

      {state && <Dock active={dockActive} pending={pendingProposals} onOpen={openDock} />}

      {selectedProvince && (
        <ProvincePanel
          ref={panelRef}
          map={map}
          province={selectedProvince}
          game={state}
          vision={vision}
          now={game.now}
          error={orderError}
          onDeclareWar={declareWar}
          onDiplomacy={(nation) => select({ kind: "diplomacy", nation })}
          onSelectArmy={(id) => select({ kind: "army", id })}
          onSelectSquadron={(id) => select({ kind: "squadron", id })}
          onSelectFleet={(id) => select({ kind: "fleet", id })}
          onBuildings={() => select({ kind: "buildings", only: selectedProvince.id })}
          onProduction={() => select({ kind: "production", only: selectedProvince.id })}
          onCancelBuild={cancelBuild}
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
          foes={foes}
          known={!vision || knowsComposition(state, vision, selectedArmy, game.now)}
          mode={armyMode}
          delayMinutes={delayMinutes}
          onMode={(m) => {
            setArmyMode(m);
            setOrderError(null);
          }}
          onDelay={setDelayMinutes}
          useRail={useRail}
          onUseRail={setUseRail}
          onWork={work}
          onCancelWork={() => setOrderError(game.order({ type: "cancelWork", army: selectedArmy.id }))}
          onStop={() => setOrderError(game.order({ type: "stop", army: selectedArmy.id }))}
          onSelectArmy={(id) => select({ kind: "army", id })}
          onSelectProvince={selectProvinceAndFocus}
          onClose={() => select(null)}
        />
      )}

      {selectedSquadron && state && (
        <SquadronPanel
          ref={panelRef}
          map={map}
          squadron={selectedSquadron}
          game={state}
          now={game.now}
          error={orderError}
          mode={squadronMode}
          onMode={(m) => {
            setSquadronMode(m);
            setOrderError(null);
          }}
          onFly={flyTo}
          onCancelStrike={() => setOrderError(game.order({ type: "cancelStrike", squadron: selectedSquadron.id }))}
          onSelectProvince={selectProvinceAndFocus}
          onClose={() => select(null)}
        />
      )}

      {selectedFleet && state && (
        <FleetPanel
          ref={panelRef}
          map={map}
          fleet={selectedFleet}
          game={state}
          now={game.now}
          error={orderError}
          mode={fleetMode}
          onMode={(m) => {
            setFleetMode(m);
            setOrderError(null);
          }}
          onSail={sailTo}
          onStop={() => setOrderError(game.order({ type: "stopFleet", fleet: selectedFleet.id }))}
          onSelectSquadron={(id) => select({ kind: "squadron", id })}
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
