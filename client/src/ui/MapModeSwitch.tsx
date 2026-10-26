import { MAP_MODES, moraleColor, STANDING_COLORS, STANDING_NAMES, type MapMode, type Standing } from "../map/mapModes.js";

// Scelta della modalità della mappa (in alto a sinistra, sotto lo zoom) con la legenda della modalità attiva.

const LEGEND_STANDINGS: Standing[] = ["self", "shared", "truce", "war", "neutral"];

export function MapModeSwitch({ mode, onChange }: { mode: MapMode; onChange(mode: MapMode): void }) {
  return (
    <div className="map-modes">
      <div className="map-mode-buttons" role="radiogroup" aria-label="Modalità della mappa">
        {MAP_MODES.map((m) => (
          <button key={m.id} role="radio" aria-checked={m.id === mode} className={m.id === mode ? "active" : ""} onClick={() => onChange(m.id)}>
            {m.name}
          </button>
        ))}
      </div>
      {mode === "morale" && (
        <div className="map-legend">
          <span className="morale-scale" style={{ background: `linear-gradient(to right, ${moraleColor(0)}, ${moraleColor(50)}, ${moraleColor(100)})` }} />
          <span className="morale-scale-labels">
            <span>0%</span>
            <span>Morale</span>
            <span>100%</span>
          </span>
        </div>
      )}
      {mode === "diplomacy" && (
        <ul className="map-legend">
          {LEGEND_STANDINGS.map((s) => (
            <li key={s}>
              <span className="swatch" style={{ background: STANDING_COLORS[s] }} />
              {STANDING_NAMES[s]}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
