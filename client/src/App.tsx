import { useCallback, useEffect, useRef, useState } from "react";
import { loadMap, type LoadedMap } from "./map/loadMap.js";
import { MapView, type MapViewHandle } from "./map/MapView.js";
import { ProvincePanel } from "./ProvincePanel.js";

export function App() {
  const [map, setMap] = useState<LoadedMap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const mapRef = useRef<MapViewHandle>(null);

  useEffect(() => {
    loadMap().then(setMap, (e: unknown) => setError(String(e)));
  }, []);

  // Selezione da un elenco (es. i confinanti): oltre a selezionare, centra la vista.
  const panelRef = useRef<HTMLElement>(null);
  const selectAndFocus = useCallback((id: string) => {
    setSelectedId(id);
    // Il pannello copre una parte della mappa: a destra su schermi larghi, in basso sul telefono.
    const panel = panelRef.current?.getBoundingClientRect();
    const narrow = window.matchMedia("(max-width: 640px)").matches;
    const cover = panel ? (narrow ? { right: 0, bottom: panel.height } : { right: panel.width + 16, bottom: 0 }) : undefined;
    mapRef.current?.focus(id, cover);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const selected = selectedId ? map?.provinces.get(selectedId) : undefined;

  return (
    <div className="app">
      <header className="topbar">
        <h1>1940 World at War</h1>
        {map && <span className="map-name">{map.data.name}</span>}
      </header>

      <main className="stage">
        {error && <p className="status error">Errore nel caricamento della mappa: {error}</p>}
        {!map && !error && <p className="status">Caricamento della mappa…</p>}
        {map && <MapView ref={mapRef} map={map} selectedId={selectedId} onSelect={setSelectedId} />}

        {map && (
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
        )}

        {map && selected && (
          <ProvincePanel ref={panelRef} map={map} province={selected} onSelect={selectAndFocus} onClose={() => setSelectedId(null)} />
        )}
      </main>
    </div>
  );
}
