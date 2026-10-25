import { useEffect } from "react";
import {
  AIRCRAFT_TYPES,
  ARMOR_CLASS_NAMES,
  ARMOR_CLASSES,
  BUILDING_TYPES,
  COMBAT,
  isAircraftType,
  UNIT_TYPES,
  type AttackDefense,
  type ProducibleId,
  type ResourceAmounts,
} from "@waw/shared";
import { CostList } from "./ui/CostList.js";
import { formatAmount, formatDelay } from "./ui/format.js";

// Scheda dell'unità: colonna al centro dello schermo con l'immagine e tutte le caratteristiche.
// Si chiude con la X, con Esc o toccando fuori. Le voci senza valore ("—") non sono ancora definite nel gioco.

interface UnitSheetProps {
  unit: ProducibleId;
  stock: ResourceAmounts;
  onRecruit(): void;
  onClose(): void;
}

/** Riga della tabella di combattimento: bersaglio, attacco, difesa (null = non ancora definito). */
type Row = [string, number | null, number | null];

const ARMOR_LABEL = { soft: "Non corazzato", light: "Armatura leggera", heavy: "Armatura pesante" } as const;

export function UnitSheet({ unit, stock, onRecruit, onClose }: UnitSheetProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const air = isAircraftType(unit) ? AIRCRAFT_TYPES[unit] : null;
  const ground = isAircraftType(unit) ? null : UNIT_TYPES[unit];
  const type = (air ?? ground)!;
  const ad = (x?: AttackDefense): [number | null, number | null] => [x?.attack || null, x?.defense || null];
  const rows: Row[] = ground
    ? [
        ...ARMOR_CLASSES.map((c): Row => [ARMOR_CLASS_NAMES[c], ground.attack[c], ground.defense[c]]),
        ["Aerei (contraerea)", null, ground.antiAir || null],
        ["Navi", ...ad(ground.vsShip)],
        ["Sottomarini", ...ad(ground.vsSub)],
        ["Edifici", ground.vsBuilding ?? null, null],
        ["Morale della provincia", ground.moraleDamage ?? null, null],
      ]
    : [
        ...ARMOR_CLASSES.map((c): Row => [ARMOR_CLASS_NAMES[c], air!.attack[c] || null, null]),
        ["Aerei", ...ad(air!.vsAir)],
        ["Navi", air!.vsShip ?? null, null],
        ["Sottomarini", air!.vsSub ?? null, null],
        ["Edifici", air!.vsBuilding ?? null, null],
        ["Morale della provincia", air!.moraleDamage ?? null, null],
      ];
  const value = (n: number | null) => (n ? n.toLocaleString("it-IT") : "—");

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

          <h3>Combattimento</h3>
          <table className="stats">
            <thead>
              <tr>
                <th>Contro</th>
                <th>Attacco</th>
                <th>Difesa</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, atk, def]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td>{value(atk)}</td>
                  <td>{value(def)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small-print">
            {ground
              ? "Danni ogni 30 minuti di combattimento: l'attacco vale quando marcia o va all'assalto, la difesa quando resta ferma. Contro gli aerei è la contraerea; il morale è in punti tolti a ogni colpo."
              : "Danni di un attacco (un solo passaggio sul bersaglio); il morale è in punti tolti a ogni attacco."}{" "}
            Navi, sottomarini ed edifici conteranno con la marina e i bombardamenti. Il trattino vuol dire nessun danno.
          </p>

          <h3>Caratteristiche</h3>
          <dl className="sheet-facts">
            {ground && (
              <>
                <dt>Classe</dt>
                <dd>{ARMOR_LABEL[ground.armor]}</dd>
              </>
            )}
            <dt>Punti vita</dt>
            <dd>{type.hp}</dd>
            <dt>Velocità</dt>
            <dd>{type.speedKmh} km/h</dd>
            {ground?.rangeKm && (
              <>
                <dt>Gittata</dt>
                <dd>
                  {ground.rangeKm} km · spara da ferma, dopo {COMBAT.setupMinutes} minuti di messa in batteria
                </dd>
              </>
            )}
            {air && (
              <>
                <dt>Portata</dt>
                <dd>{formatAmount(air.rangeKm)} km</dd>
                <dt>Raggio d'azione</dt>
                <dd>{formatAmount(air.rangeKm / 2)} km</dd>
                <dt>Rifornimento</dt>
                <dd>{formatDelay(air.refuelMinutes)}</dd>
              </>
            )}
          </dl>

          {ground && (
            <>
              <h3>Terreno</h3>
              <p className="muted small">In arrivo: effetti di pianura, collina e montagna su velocità e forza.</p>
            </>
          )}

          <h3>Costi</h3>
          <dl className="sheet-facts">
            <dt>Produzione</dt>
            <dd>
              <CostList cost={type.cost} stock={stock} />
            </dd>
            <dt>Tempo</dt>
            <dd>{formatDelay(type.productionHours * 60)}</dd>
            <dt>Mantenimento al giorno</dt>
            <dd>
              <CostList cost={type.upkeepPerDay} />
            </dd>
            <dt>Si produce in</dt>
            <dd>{BUILDING_TYPES[type.building].name}</dd>
          </dl>
        </div>
        <footer className="sheet-footer">
          <button className="button" onClick={onRecruit}>
            {air ? "Costruisci" : "Arruola"}
          </button>
        </footer>
      </article>
    </div>
  );
}
