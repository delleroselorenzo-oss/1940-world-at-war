import { useEffect } from "react";
import {
  AIRCRAFT_TYPES,
  ARMOR_CLASS_NAMES,
  ARMOR_CLASSES,
  BUILDING_TYPES,
  COMBAT,
  isAircraftType,
  isShipType,
  SHIP_TYPES,
  TERRAIN_EFFECTS,
  TERRAIN_NAMES,
  TERRAIN_RULES,
  MOVEMENT,
  roadSpeedFactor,
  UNIT_TYPES,
  type Terrain,
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
  /** Foto dell'unità nella dottrina del giocatore. */
  image: string | undefined;
  stock: ResourceAmounts;
  onRecruit(): void;
  onClose(): void;
}

/** Riga della tabella di combattimento: bersaglio, attacco, difesa (null = non ancora definito). */
type Row = [string, number | null, number | null];

const ARMOR_LABEL = { soft: "Non corazzato", light: "Armatura leggera", heavy: "Armatura pesante" } as const;

/** Terreni nell'ordine della scheda: dal più facile al più difficile. */
const SHEET_TERRAINS: Terrain[] = ["urban", "plains", "hills", "forest", "mountains"];

const kmh = (n: number) => `${(Math.round(n * 10) / 10).toLocaleString("it-IT")} km/h`;

/** Moltiplicatore → "+25%", "−10%", "—" (nessun effetto). */
const percent = (factor: number) => {
  const p = Math.round((factor - 1) * 100);
  return p === 0 ? "—" : `${p > 0 ? "+" : "−"}${Math.abs(p)}%`;
};

export function UnitSheet({ unit, image, stock, onRecruit, onClose }: UnitSheetProps) {
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

  const air = isAircraftType(unit) ? AIRCRAFT_TYPES[unit] : null;
  const ship = isShipType(unit) ? SHIP_TYPES[unit] : null;
  const ground = air || ship ? null : UNIT_TYPES[unit as keyof typeof UNIT_TYPES];
  const type = (air ?? ship ?? ground)!;
  const ad = (x?: AttackDefense): [number | null, number | null] => [x?.attack || null, x?.defense || null];
  const rows: Row[] = ship
    ? [
        ...ARMOR_CLASSES.map((c): Row => [`${ARMOR_CLASS_NAMES[c]} (costa)`, ship.shore?.[c] ?? null, null]),
        ["Aerei (contraerea)", null, ship.antiAir || null],
        ["Navi", ...ad(ship.vsShip)],
        ["Sottomarini", ...ad(ship.vsSub)],
      ]
    : ground
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
            {image ? <img src={image} alt="" /> : "Immagine in arrivo"}
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
            {ship
              ? "Danni ogni 30 minuti di combattimento; contro la costa sono i colpi alle armate a terra entro la gittata."
              : ground
              ? "Danni ogni 30 minuti di combattimento: l'attacco vale quando marcia o va all'assalto, la difesa quando resta ferma. Contro gli aerei è la contraerea; il morale è in punti tolti a ogni colpo."
              : "Danni di un attacco (un solo passaggio sul bersaglio); il morale è in punti tolti a ogni attacco."}{" "}
            Navi e sottomarini conteranno con il combattimento navale, gli edifici con i bombardamenti. Il trattino vuol dire nessun danno.
          </p>

          <h3>Caratteristiche</h3>
          <dl className="sheet-facts">
            {(ground || ship) && (
              <>
                <dt>Classe</dt>
                <dd>{ground ? ARMOR_LABEL[ground.armor] : ship!.id === "submarine" ? "Sottomarino" : "Nave"}</dd>
              </>
            )}
            <dt>Punti vita</dt>
            <dd>{type.hp}</dd>
            <dt>Velocità</dt>
            <dd>{type.speedKmh} km/h</dd>
            <dt>Vista</dt>
            <dd>
              {type.sightKm} km{air && " · in volo"}
            </dd>
            {ground?.rangeKm && (
              <>
                <dt>Gittata</dt>
                <dd>
                  {ground.rangeKm} km · spara da ferma, dopo {COMBAT.setupMinutes} minuti di messa in batteria
                </dd>
              </>
            )}
            {ship && (
              <>
                <dt>Gittata</dt>
                <dd>{ship.rangeKm ? `${ship.rangeKm} km` : "solo da vicino"}</dd>
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

          <h3>Terreno</h3>
          {ground ? (
            <>
              <table className="stats">
                <thead>
                  <tr>
                    <th>Terreno</th>
                    <th>Su strada</th>
                    <th>Fuori strada</th>
                    <th>Forza</th>
                  </tr>
                </thead>
                <tbody>
                  {SHEET_TERRAINS.map((t) => {
                    const effect = TERRAIN_EFFECTS[ground.id][t];
                    return (
                      <tr key={t}>
                        <td>{TERRAIN_NAMES[t]}</td>
                        <td>{kmh(ground.speedKmh * MOVEMENT.roadFactor * roadSpeedFactor(effect.speed))}</td>
                        <td>{kmh(ground.speedKmh * MOVEMENT.offRoadFactor * effect.speed)}</td>
                        <td>{percent(effect.strength)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="muted small-print">
                Su strada il terreno rallenta la metà che fuori strada; in treno non conta. La forza cambia attacco e difesa. In un'armata conta
                l'unità più lenta su quel terreno.
              </p>
            </>
          ) : ship ? (
            <p className="muted small">Le navi vanno solo per mare, alla velocità della più lenta della flotta; il terreno non conta.</p>
          ) : (
            <p className="muted small">
              Gli aerei non risentono del terreno, ma contro le armate in foresta fanno il {Math.round((1 - TERRAIN_RULES.airVsForest) * 100)}% di
              danno in meno.
            </p>
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
            {air || ship ? "Costruisci" : "Arruola"}
          </button>
        </footer>
      </article>
    </div>
  );
}
