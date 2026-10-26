import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import type { Army, Fleet, LngLat, Squadron } from "@waw/shared";
import type { LoadedMap } from "./loadMap.js";
import { MapRenderer, type ProvinceStyle } from "./MapRenderer.js";
import type { MapWorks } from "./TerrainLayer.js";

export interface MapViewHandle {
  zoomBy(factor: number): void;
  fit(): void;
  focus(id: string, cover?: { right: number; bottom: number }): void;
}

interface MapViewProps {
  map: LoadedMap;
  selectedId: string | null;
  /** Modalità della mappa, proprietari, morale, rapporti e nebbia di guerra. */
  provinceStyle?: ProvinceStyle;
  armies: Army[];
  squadrons: Squadron[];
  fleets: Fleet[];
  /** Armate in combattimento in questo momento. */
  engaged: ReadonlySet<string>;
  playerNation: string | null;
  /** Ponti distrutti, ponti di barche, ospedali. */
  works: MapWorks | null;
  /** Si sta scegliendo un punto per un ordine: cursore a mirino. */
  targeting?: boolean;
  selectedArmyId: string | null;
  selectedSquadronId: string | null;
  selectedFleetId: string | null;
  /** Province da evidenziare (per esempio dove si può costruire quello che si è scelto). */
  highlighted?: ReadonlySet<string>;
  /** Minuto di gioco attuale (chiamato a ogni fotogramma). */
  now(): number;
  onSelect(id: string | null, at: LngLat): void;
  onSelectArmy(id: string): void;
  onSelectSquadron(id: string): void;
  onSelectFleet(id: string): void;
  ref?: Ref<MapViewHandle>;
}

export function MapView({
  map,
  selectedId,
  provinceStyle,
  armies,
  squadrons,
  fleets,
  engaged,
  playerNation,
  works,
  targeting,
  selectedArmyId,
  selectedSquadronId,
  selectedFleetId,
  highlighted,
  now,
  onSelect,
  onSelectArmy,
  onSelectSquadron,
  onSelectFleet,
  ref,
}: MapViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  // I callback cambiano a ogni render: il renderer legge sempre l'ultima versione.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onSelectArmyRef = useRef(onSelectArmy);
  onSelectArmyRef.current = onSelectArmy;
  const onSelectSquadronRef = useRef(onSelectSquadron);
  onSelectSquadronRef.current = onSelectSquadron;
  const onSelectFleetRef = useRef(onSelectFleet);
  onSelectFleetRef.current = onSelectFleet;
  const squadronsRef = useRef(squadrons);
  squadronsRef.current = squadrons;
  const fleetsRef = useRef(fleets);
  fleetsRef.current = fleets;
  const nowRef = useRef(now);
  nowRef.current = now;
  const armiesRef = useRef({ armies, playerNation, engaged });
  armiesRef.current = { armies, playerNation, engaged };
  const styleRef = useRef(provinceStyle);
  styleRef.current = provinceStyle;
  const worksRef = useRef(works);
  worksRef.current = works;

  useEffect(() => {
    const tooltip = tooltipRef.current!;
    const renderer = new MapRenderer(map, {
      onSelect: (id, at) => onSelectRef.current(id, at),
      onSelectArmy: (id) => onSelectArmyRef.current(id),
      onSelectSquadron: (id) => onSelectSquadronRef.current(id),
      onSelectFleet: (id) => onSelectFleetRef.current(id),
      now: () => nowRef.current(),
      onHover: (id) => {
        const p = id ? map.provinces.get(id) : undefined;
        if (!p) {
          tooltip.hidden = true;
          return;
        }
        const style = styleRef.current;
        const owner = style?.owners[p.id] ?? p.nation;
        const morale = style?.mode === "morale" ? style.morale[p.id] : undefined;
        tooltip.textContent = `${p.name} · ${map.nations.get(owner)?.name ?? owner}${morale !== undefined ? ` · morale ${Math.round(morale)}%` : ""}`;
        tooltip.hidden = false;
      },
      onPointerMove: (x, y) => {
        tooltip.style.transform = `translate(${x + 14}px, ${y + 14}px)`;
      },
    });
    rendererRef.current = renderer;
    if (styleRef.current) renderer.setProvinceStyle(styleRef.current);
    if (worksRef.current) renderer.setWorks(worksRef.current);
    renderer.setArmies(armiesRef.current.armies, armiesRef.current.playerNation, armiesRef.current.engaged);
    renderer.setSquadrons(squadronsRef.current, armiesRef.current.playerNation, fleetsRef.current);
    renderer.setFleets(fleetsRef.current, armiesRef.current.playerNation);
    void renderer.mount(hostRef.current!);
    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    rendererRef.current?.setSelected(selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (provinceStyle) rendererRef.current?.setProvinceStyle(provinceStyle);
  }, [provinceStyle]);

  useEffect(() => {
    rendererRef.current?.setArmies(armies, playerNation, engaged);
  }, [armies, playerNation, engaged]);

  useEffect(() => {
    rendererRef.current?.setSquadrons(squadrons, playerNation, fleets);
  }, [squadrons, playerNation, fleets]);

  useEffect(() => {
    rendererRef.current?.setSelectedSquadron(selectedSquadronId);
  }, [selectedSquadronId]);

  useEffect(() => {
    rendererRef.current?.setFleets(fleets, playerNation);
  }, [fleets, playerNation]);

  useEffect(() => {
    rendererRef.current?.setSelectedFleet(selectedFleetId);
  }, [selectedFleetId]);

  useEffect(() => {
    if (works) rendererRef.current?.setWorks(works);
  }, [works]);

  useEffect(() => {
    rendererRef.current?.setSelectedArmy(selectedArmyId);
  }, [selectedArmyId]);

  useEffect(() => {
    rendererRef.current?.setHighlighted(highlighted ?? new Set());
  }, [highlighted]);

  useImperativeHandle(ref, () => ({
    zoomBy: (f) => rendererRef.current?.zoomBy(f),
    fit: () => rendererRef.current?.fit(),
    focus: (id, cover) => rendererRef.current?.focus(id, cover),
  }));

  return (
    <div className={targeting ? "map-host targeting" : "map-host"} ref={hostRef}>
      <div className="map-tooltip" ref={tooltipRef} hidden />
    </div>
  );
}
