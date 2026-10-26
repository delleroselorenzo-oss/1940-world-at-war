import type { Ref } from "react";
import {
  AIRCRAFT_TYPES,
  carrierCapacity,
  fleetHealth,
  fleetPosition,
  fleetSightKm,
  fleetSpeedKmh,
  flatKm,
  atWar,
  fleetReachKm,
  harborOf,
  isSubmerged,
  mayDock,
  NAVAL,
  provinceIdAt,
  UNIT_TYPE_IDS,
  UNIT_TYPES,
  seaZoneAt,
  SHIP_TYPE_IDS,
  SHIP_TYPES,
  straitAt,
  voyageArrival,
  type Fleet,
  type GameState,
  type LngLat,
} from "@waw/shared";
import type { LoadedMap } from "./map/loadMap.js";
import { CostList } from "./ui/CostList.js";
import { formatAmount, formatCountdown } from "./ui/format.js";

// Pannello della flotta: dove si trova (porto, zona di mare, rotta), "Naviga" (il prossimo tocco sulla mappa dà la meta:
// un punto di mare o una provincia costiera, dove la flotta va al suo approdo), "Ferma", porti vicini, composizione, mantenimento.

/** Cosa farà il prossimo tocco sulla mappa. */
export type FleetMode = "sail" | null;

/** Porti amici più vicini mostrati nell'elenco. */
const NEAR_PORTS = 6;

interface FleetPanelProps {
  map: LoadedMap;
  fleet: Fleet;
  game: GameState;
  now: number;
  error: string | null;
  mode: FleetMode;
  onMode(mode: FleetMode): void;
  onSail(to: LngLat): void;
  onStop(): void;
  onSelectSquadron(id: string): void;
  onSelectProvince(id: string): void;
  onClose(): void;
  ref?: Ref<HTMLElement>;
}

export function FleetPanel(props: FleetPanelProps) {
  return props.fleet.transport ? <TransportPanel {...props} /> : <WarFleetPanel {...props} />;
}

/** Trasporto delle truppe: segue da solo imbarco, navigazione e sbarco; qui si vede a che punto è e chi porta. */
function TransportPanel({ map, fleet, game, now, onSelectProvince, onClose, ref }: FleetPanelProps) {
  const tr = fleet.transport!;
  const nation = map.nations.get(fleet.owner);
  const mine = fleet.owner === game.playerNation;
  const countdown = (t: number) => formatCountdown(((t - now) * 60) / game.clock.speed);
  const link = (id: string) => (
    <button className="link" onClick={() => onSelectProvince(id)}>
      {map.provinces.get(id)?.name ?? id}
    </button>
  );
  const landProvince = provinceIdAt(map.nav, tr.landPoint);
  const where = seaZoneAt(map.nav, fleetPosition(fleet, now))?.name;
  const units = UNIT_TYPE_IDS.map((t) => ({ type: t, n: tr.army.units.filter((u) => u.type === t).length })).filter((g) => g.n > 0);
  return (
    <aside className="panel army-panel" aria-label="Dettagli trasporto" ref={ref}>
      <header className="panel-header">
        <div>
          <p className="panel-kicker">
            <span className="swatch" style={{ background: nation?.color }} />
            {nation?.name ?? fleet.owner}
            {mine && <span className="tag">il tuo trasporto</span>}
          </p>
          <h2>Trasporto · {tr.army.units.length} unità</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Chiudi">
          ×
        </button>
      </header>
      <div className="panel-body">
        <div className="army-status">
          <p>
            {tr.phase === "boarding" ? (
              <>
                Imbarco nel porto di {link(tr.embark)} · parte tra {countdown(tr.until)}
              </>
            ) : tr.phase === "sailing" ? (
              <>
                In navigazione{where ? ` · ${where}` : ""} · sbarca {landProvince ? <>presso {link(landProvince)}</> : "sulla costa"}, arriva tra{" "}
                {countdown(tr.until)}
              </>
            ) : (
              <>
                Sbarco in corso {landProvince ? <>presso {link(landProvince)}</> : ""} · a terra tra {countdown(tr.until)}
              </>
            )}
          </p>
          <p className="muted small">
            {NAVAL.transportKmh} km/h. Il trasporto non spara: in mare lo colpiscono navi e aerei nemici, durante l'imbarco e lo sbarco anche le
            armate nemiche vicine alla costa. Una scorta di navi da guerra vicina combatte per lui.
          </p>
        </div>
        <h3>A bordo</h3>
        <ul className="plain-list">
          {units.map(({ type, n }) => (
            <li key={type}>
              {n}× {UNIT_TYPES[type].name}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

function WarFleetPanel({ map, fleet, game, now, error, mode, onMode, onSail, onStop, onSelectSquadron, onSelectProvince, onClose, ref }: FleetPanelProps) {
  const nation = map.nations.get(fleet.owner);
  const mine = fleet.owner === game.playerNation;
  const speed = fleetSpeedKmh(fleet);
  const health = fleetHealth(fleet);
  const countdown = (t: number) => formatCountdown(((t - now) * 60) / game.clock.speed);
  const link = (id: string) => (
    <button className="link" onClick={() => onSelectProvince(id)}>
      {map.provinces.get(id)?.name ?? id}
    </button>
  );
  const here = fleetPosition(fleet, now);
  const where = (at: LngLat) => straitAt(map.nav, at)?.name ?? seaZoneAt(map.nav, at)?.name ?? "in mare";
  const arrival = voyageArrival(fleet);
  const destination = fleet.voyage ? fleet.voyage.points[fleet.voyage.points.length - 1]! : null;
  const destinationPort = destination ? harborProvince(map, game, fleet, destination) : null;

  // Flotte nemiche a tiro in questo momento (il combattimento è automatico).
  const inBattle = Object.values(game.fleets).some(
    (f) => atWar(game, fleet.owner, f.owner) && flatKm(fleetPosition(f, now), here) <= Math.max(fleetReachKm(fleet), fleetReachKm(f)),
  );
  const capacity = carrierCapacity(fleet);
  const aboard = Object.values(game.squadrons).filter((sq) => sq.base === fleet.id && !sq.flight);
  const groups = SHIP_TYPE_IDS.map((t) => ({ type: t, ships: fleet.ships.filter((s) => s.type === t) })).filter((g) => g.ships.length > 0);
  const upkeep: Record<string, number> = {};
  for (const s of fleet.ships) for (const [r, n] of Object.entries(SHIP_TYPES[s.type].upkeepPerDay)) upkeep[r] = (upkeep[r] ?? 0) + n;

  // Porti amici più vicini in linea d'aria (la rotta vera può essere più lunga).
  const ports = mine
    ? map.data.provinces
        .filter((p) => p.id !== fleet.port && mayDock(game, fleet.owner, game.provinces[p.id]?.owner ?? ""))
        .map((p) => ({ province: p, at: harborOf(map.nav, p.id) }))
        .filter((p): p is { province: typeof p.province; at: LngLat } => p.at !== null)
        .map((p) => ({ ...p, km: flatKm(here, p.at) }))
        .sort((a, b) => a.km - b.km)
        .slice(0, NEAR_PORTS)
    : [];

  return (
    <aside className="panel army-panel" aria-label="Dettagli flotta" ref={ref}>
      <header className="panel-header">
        <div>
          <p className="panel-kicker">
            <span className="swatch" style={{ background: nation?.color }} />
            {nation?.name ?? fleet.owner}
            {mine && <span className="tag">la tua flotta</span>}
          </p>
          <h2>Flotta · {fleet.ships.length} {fleet.ships.length === 1 ? "nave" : "navi"}</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Chiudi">
          ×
        </button>
      </header>

      <div className="panel-body">
        <div className="army-status">
          <p>
            {fleet.voyage && arrival !== null ? (
              <>
                In navigazione · {where(here)} · verso {destinationPort ? link(destinationPort) : where(destination!)}, arriva tra {countdown(arrival)}
              </>
            ) : fleet.port ? (
              <>Ormeggiata nel porto di {link(fleet.port)}</>
            ) : (
              <>Ferma in mare · {where(here)}</>
            )}
          </p>
          <span className="progress health" aria-hidden>
            <span style={{ width: `${health * 100}%` }} />
          </span>
          {inBattle && <p className="error-text">In combattimento con una flotta nemica</p>}
          {mine && isSubmerged(fleet) && (
            <p className="small">
              {(fleet.revealedUntil ?? 0) > now
                ? `Scoperta dopo l'attacco: il nemico la vede ancora per ${countdown(fleet.revealedUntil!)}.`
                : "In immersione: il nemico non la vede finché non la scopre un cacciatorpediniere vicino o un aereo, o finché non attacca."}
            </p>
          )}
          <p className="muted">
            Salute {Math.round(health * 100)}% · {speed} km/h · vista {fleetSightKm(fleet)} km
          </p>
        </div>

        {mine && (
          <div className="map-actions" role="group" aria-label="Azione sulla mappa">
            <button className={mode === "sail" ? "action active" : "action"} aria-pressed={mode === "sail"} onClick={() => onMode(mode === "sail" ? null : "sail")}>
              Naviga
            </button>
            {fleet.voyage && (
              <button className="action" onClick={onStop}>
                Ferma
              </button>
            )}
          </div>
        )}
        {mine && mode === "sail" && (
          <p className="targeting">
            Tocca un punto di mare, o una provincia costiera: la flotta va al suo approdo e, se il porto è tuo o di chi ti concede il passaggio, si
            ormeggia. Gli stretti tenuti da un nemico sono chiusi.
          </p>
        )}

        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}

        {mine && ports.length > 0 && (
          <section className="army-actions" aria-label="Porti vicini">
            <h3>Porti vicini</h3>
            <ul className="place-list">
              {ports.map(({ province, at, km }) => (
                <li key={province.id}>
                  <div className="recruit-head">
                    {link(province.id)}
                    <span className="muted small">
                      {formatAmount(km)} km in linea d'aria
                      {game.provinces[province.id]?.owner !== fleet.owner && " · amico"}
                    </span>
                    <button className="button small" onClick={() => onSail(at)}>
                      Naviga
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <h3>Composizione</h3>
        <table className="composition">
          <thead>
            <tr>
              <th>Navi</th>
              <th>Salute</th>
              <th title="Velocità in km/h">km/h</th>
              <th title="Vista in km">Vista</th>
              <th title="Gittata in km">Gitt.</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(({ type, ships }) => {
              const t = SHIP_TYPES[type];
              const h = ships.reduce((n, s) => n + s.hp, 0) / (ships.length * t.hp);
              return (
                <tr key={type}>
                  <td>
                    {ships.length}× {t.name}
                  </td>
                  <td>
                    <span className="progress health mini" title={`${Math.round(h * 100)}%`}>
                      <span style={{ width: `${h * 100}%` }} />
                    </span>
                  </td>
                  <td className={groups.length > 1 && t.speedKmh === speed ? "slowest" : undefined}>{t.speedKmh}</td>
                  <td>{t.sightKm}</td>
                  <td>{t.rangeKm || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {groups.length > 1 && <p className="muted small-print">In evidenza il limite della flotta: naviga alla velocità della nave più lenta.</p>}

        {capacity > 0 && (
          <>
            <h3>
              Aerei a bordo · {aboard.reduce((n, sq) => n + sq.aircraft.length, 0)}/{capacity}
            </h3>
            {aboard.length === 0 ? (
              <p className="muted small">
                Nessuno. Caccia, bombardieri tattici e aerosiluranti possono trasferirsi qui da una base entro la loro portata (dal pannello della
                squadriglia, "Vola").
              </p>
            ) : (
              <ul className="neighbors">
                {aboard.map((sq) => (
                  <li key={sq.id}>
                    <button onClick={() => onSelectSquadron(sq.id)}>
                      <span className="neighbor-name">
                        {[...new Set(sq.aircraft.map((a) => a.type))].map((t) => `${sq.aircraft.filter((a) => a.type === t).length}× ${AIRCRAFT_TYPES[t].name}`).join(", ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        <h3>Mantenimento al giorno</h3>
        <CostList cost={upkeep} />
      </div>
    </aside>
  );
}

/** Provincia amica il cui approdo è la meta della flotta, se c'è. */
function harborProvince(map: LoadedMap, game: GameState, fleet: Fleet, at: LngLat): string | null {
  for (const p of map.data.provinces) {
    const h = harborOf(map.nav, p.id);
    if (h && h[0] === at[0] && h[1] === at[1] && mayDock(game, fleet.owner, game.provinces[p.id]?.owner ?? "")) return p.id;
  }
  return null;
}
