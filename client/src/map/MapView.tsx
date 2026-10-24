import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import type { Army, LngLat } from "@waw/shared";
import type { LoadedMap } from "./loadMap.js";
import { MapRenderer } from "./MapRenderer.js";
import type { MapWorks } from "./TerrainLayer.js";

export interface MapViewHandle {
  zoomBy(factor: number): void;
  fit(): void;
  focus(id: string, cover?: { right: number; bottom: number }): void;
}

interface MapViewProps {
  map: LoadedMap;
  selectedId: string | null;
  /** Proprietario attuale di ogni provincia (dallo stato di gioco). */
  owners?: Record<string, string>;
  armies: Army[];
  /** Armate in combattimento in questo momento. */
  engaged: ReadonlySet<string>;
  playerNation: string | null;
  /** Ponti distrutti, ponti di barche, ospedali. */
  works: MapWorks | null;
  /** Si sta scegliendo un punto per un ordine: cursore a mirino. */
  targeting?: boolean;
  selectedArmyId: string | null;
  /** Province da evidenziare (per esempio dove si può costruire quello che si è scelto). */
  highlighted?: ReadonlySet<string>;
  /** Minuto di gioco attuale (chiamato a ogni fotogramma). */
  now(): number;
  onSelect(id: string | null, at: LngLat): void;
  onSelectArmy(id: string): void;
  ref?: Ref<MapViewHandle>;
}

export function MapView({ map, selectedId, owners, armies, engaged, playerNation, works, targeting, selectedArmyId, highlighted, now, onSelect, onSelectArmy, ref }: MapViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  // I callback cambiano a ogni render: il renderer legge sempre l'ultima versione.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onSelectArmyRef = useRef(onSelectArmy);
  onSelectArmyRef.current = onSelectArmy;
  const nowRef = useRef(now);
  nowRef.current = now;
  const armiesRef = useRef({ armies, playerNation, engaged });
  armiesRef.current = { armies, playerNation, engaged };
  const ownersRef = useRef(owners);
  ownersRef.current = owners;
  const worksRef = useRef(works);
  worksRef.current = works;

  useEffect(() => {
    const tooltip = tooltipRef.current!;
    const renderer = new MapRenderer(map, {
      onSelect: (id, at) => onSelectRef.current(id, at),
      onSelectArmy: (id) => onSelectArmyRef.current(id),
      now: () => nowRef.current(),
      onHover: (id) => {
        const p = id ? map.provinces.get(id) : undefined;
        if (!p) {
          tooltip.hidden = true;
          return;
        }
        const owner = ownersRef.current?.[p.id] ?? p.nation;
        tooltip.textContent = `${p.name} · ${map.nations.get(owner)?.name ?? owner}`;
        tooltip.hidden = false;
      },
      onPointerMove: (x, y) => {
        tooltip.style.transform = `translate(${x + 14}px, ${y + 14}px)`;
      },
    });
    rendererRef.current = renderer;
    if (ownersRef.current) renderer.setOwners(ownersRef.current);
    if (worksRef.current) renderer.setWorks(worksRef.current);
    renderer.setArmies(armiesRef.current.armies, armiesRef.current.playerNation, armiesRef.current.engaged);
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
    if (owners) rendererRef.current?.setOwners(owners);
  }, [owners]);

  useEffect(() => {
    rendererRef.current?.setArmies(armies, playerNation, engaged);
  }, [armies, playerNation, engaged]);

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
