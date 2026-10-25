import { useEffect } from "react";
import { BUILDING_TYPES, buildingCost, buildingMinutes, type BuildingId, type ResourceAmounts } from "@waw/shared";
import { buildingEffect, buildingLevelEffect } from "./ui/buildingEffects.js";
import { CostList } from "./ui/CostList.js";
import { formatDelay } from "./ui/format.js";

// Scheda dell'edificio: come quella dell'unità, una colonna al centro con l'immagine, l'effetto,
// la tabella dei livelli (effetto in tutto, costo e tempo di ogni livello) e dove si può costruire.
// Si chiude con la X, con Esc o toccando fuori.

interface BuildingSheetProps {
  building: BuildingId;
  stock: ResourceAmounts;
  /** Tue province dove si può costruire. */
  places: number;
  /** Tue province dove c'è già. */
  built: number;
  onBuild(): void;
  onClose(): void;
}

export function BuildingSheet({ building, stock, places, built, onBuild, onClose }: BuildingSheetProps) {
  useEffect(() => {
    // In cattura e senza propagare: Esc chiude solo la scheda, non il pannello sotto.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const type = BUILDING_TYPES[building];
  const levels = Array.from({ length: type.maxLevel }, (_, i) => i + 1);
  const where = `${type.where === "urban" ? "Solo nelle città" : "In qualsiasi provincia"}${type.coastal ? " sul mare" : ""}`;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <article className="sheet" role="dialog" aria-modal="true" aria-label={type.name} onClick={(e) => e.stopPropagation()}>
        <header className="sheet-header">
          <h2>{type.name}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Chiudi">
            ×
          </button>
        </header>
        <div className="sheet-body">
          <div className="sheet-image" aria-hidden>
            Immagine in arrivo
          </div>
          <p>{type.description}</p>

          <h3>Effetto</h3>
          <p className="effect">{buildingEffect(building)}</p>

          <h3>Livelli</h3>
          <table className="stats levels">
            <thead>
              <tr>
                <th>Liv.</th>
                <th>In tutto</th>
                <th>Costo</th>
                <th>Tempo</th>
              </tr>
            </thead>
            <tbody>
              {levels.map((l) => (
                <tr key={l}>
                  <td>{l}</td>
                  <td>{buildingLevelEffect(building, l)}</td>
                  <td>
                    <CostList cost={buildingCost(building, l)} stock={stock} />
                  </td>
                  <td>{formatDelay(buildingMinutes(building, l))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small-print">
            Si costruisce un livello alla volta: costo e tempo sono quelli per passare a quel livello.
            {type.byEngineers && " Il tempo è quello di un'unità del genio: con più unità ci vuole meno."} Se la provincia cambia padrone, ogni
            edificio perde un livello.
          </p>

          <h3>Dove</h3>
          <dl className="sheet-facts">
            <dt>Province</dt>
            <dd>{where}</dd>
            <dt>Chi lo costruisce</dt>
            <dd>{type.byEngineers ? "Il genio, con un'armata ferma nella provincia" : "La provincia"}</dd>
            <dt>Le tue province</dt>
            <dd>
              {places === 0 ? "Nessuna adatta" : `Adatte: ${places}`}
              {built > 0 && ` · già in ${built}`}
            </dd>
          </dl>
        </div>
        <footer className="sheet-footer">
          <button className="button" onClick={onBuild} disabled={places === 0}>
            Costruisci
          </button>
        </footer>
      </article>
    </div>
  );
}
