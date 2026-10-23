import type { Ref } from "react";
import type { Province } from "@waw/shared";
import type { LoadedMap } from "./map/loadMap.js";

interface ProvincePanelProps {
  map: LoadedMap;
  province: Province;
  onSelect(id: string): void;
  onClose(): void;
  ref?: Ref<HTMLElement>;
}

const km = new Intl.NumberFormat("it-IT");

export function ProvincePanel({ map, province, onSelect, onClose, ref }: ProvincePanelProps) {
  const nation = map.nations.get(province.nation);
  const neighbors = [...province.neighbors].sort((a, b) => a.distanceKm - b.distanceKm);
  const kind = province.isCapital ? "Capitale" : province.type === "urban" ? "Città" : "Provincia rurale";

  return (
    <aside className="panel" aria-label="Dettagli provincia" ref={ref}>
      <header className="panel-header">
        <div>
          <p className="panel-kicker">
            <span className="swatch" style={{ background: nation?.color }} />
            {nation?.name ?? province.nation}
          </p>
          <h2>{province.name}</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Chiudi">
          ×
        </button>
      </header>

      <dl className="facts">
        <div>
          <dt>Tipo</dt>
          <dd>{kind}</dd>
        </div>
        <div>
          <dt>Superficie</dt>
          <dd>{km.format(province.areaKm2)} km²</dd>
        </div>
        <div>
          <dt>Costa</dt>
          <dd>{province.coastal ? "Sì" : "No"}</dd>
        </div>
        <div>
          <dt>Terreno</dt>
          <dd className="muted">{province.terrain ?? "da definire"}</dd>
        </div>
      </dl>

      <h3>Confinanti ({neighbors.length})</h3>
      {neighbors.length === 0 ? (
        <p className="muted">Nessun confine via terra: servirà un collegamento via mare.</p>
      ) : (
        <ul className="neighbors">
          {neighbors.map((n) => {
            const p = map.provinces.get(n.id);
            const color = p ? map.nations.get(p.nation)?.color : undefined;
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
    </aside>
  );
}
