import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import type { LoadedMap } from "./loadMap.js";
import { MapRenderer } from "./MapRenderer.js";

export interface MapViewHandle {
  zoomBy(factor: number): void;
  fit(): void;
  focus(id: string, cover?: { right: number; bottom: number }): void;
}

interface MapViewProps {
  map: LoadedMap;
  selectedId: string | null;
  onSelect(id: string | null): void;
  ref?: Ref<MapViewHandle>;
}

export function MapView({ map, selectedId, onSelect, ref }: MapViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  // I callback cambiano a ogni render: il renderer legge sempre l'ultima versione.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const tooltip = tooltipRef.current!;
    const renderer = new MapRenderer(map, {
      onSelect: (id) => onSelectRef.current(id),
      onHover: (id) => {
        const p = id ? map.provinces.get(id) : undefined;
        if (!p) {
          tooltip.hidden = true;
          return;
        }
        tooltip.textContent = `${p.name} · ${map.nations.get(p.nation)?.name ?? p.nation}`;
        tooltip.hidden = false;
      },
      onPointerMove: (x, y) => {
        tooltip.style.transform = `translate(${x + 14}px, ${y + 14}px)`;
      },
    });
    rendererRef.current = renderer;
    void renderer.mount(hostRef.current!);
    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    rendererRef.current?.setSelected(selectedId);
  }, [selectedId]);

  useImperativeHandle(ref, () => ({
    zoomBy: (f) => rendererRef.current?.zoomBy(f),
    fit: () => rendererRef.current?.fit(),
    focus: (id, cover) => rendererRef.current?.focus(id, cover),
  }));

  return (
    <div className="map-host" ref={hostRef}>
      <div className="map-tooltip" ref={tooltipRef} hidden />
    </div>
  );
}
