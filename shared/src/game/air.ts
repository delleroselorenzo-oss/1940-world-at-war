import { AIR, AIRCRAFT_TYPES } from "../data/air.js";
import type { LngLat, MapData, NationId, Province, ProvinceId } from "../map/types.js";
import { flatKm } from "../nav/grid.js";
import { buildingLevel } from "./buildings.js";
import { lerp } from "./combat.js";
import { hasAgreement, logEvent } from "./diplomacy.js";
import { mapIndex } from "./mapIndex.js";
import type { GameState, Squadron } from "./state.js";

// Aviazione: basi, portata e voli delle squadriglie (vedi docs/game-design.md, §9 "Aviazione").
// Per ora c'è il trasferimento da una base all'altra entro la portata; convoglio, attacco e pattuglia arriveranno dopo.

/** Portata della squadriglia: quella dell'aereo che arriva meno lontano. */
export function squadronRangeKm(sq: Squadron): number {
  return Math.min(...sq.aircraft.map((a) => AIRCRAFT_TYPES[a.type].rangeKm));
}

/** Velocità della squadriglia: quella dell'aereo più lento. */
export function squadronSpeedKmh(sq: Squadron): number {
  return Math.min(...sq.aircraft.map((a) => AIRCRAFT_TYPES[a.type].speedKmh));
}

/**
 * La provincia è una base per gli aerei di `nation`? Serve un aeroporto o una fabbrica aeronautica,
 * in una provincia propria o di un alleato.
 */
export function isAirBase(state: GameState, provinceId: ProvinceId, nation: NationId): boolean {
  const owner = state.provinces[provinceId]?.owner;
  if (!owner || (owner !== nation && !hasAgreement(state, owner, nation, "alliance"))) return false;
  return buildingLevel(state, provinceId, "airfield") > 0 || buildingLevel(state, provinceId, "aircraftFactory") > 0;
}

/** Basi disponibili per `nation`. */
export function airBases(state: GameState, map: MapData, nation: NationId): Province[] {
  return map.provinces.filter((p) => isAirBase(state, p.id, nation));
}

/** Minuti di rifornimento alla base: quelli dell'aereo più lento a rifornirsi, accorciati dai livelli dell'aeroporto. */
export function refuelMinutes(state: GameState, sq: Squadron, base: ProvinceId): number {
  const longest = Math.max(...sq.aircraft.map((a) => AIRCRAFT_TYPES[a.type].refuelMinutes));
  const level = Math.max(1, buildingLevel(state, base, "airfield"));
  return Math.round(longest * (1 - AIR.airfieldTimeCutPerLevel * (level - 1)));
}

/** Dove si trova la squadriglia al minuto `t`: alla base, oppure lungo il volo. */
export function squadronPosition(sq: Squadron, map: MapData, t: number): LngLat {
  const f = sq.flight;
  if (!f) return mapIndex(map).provinces.get(sq.base)!.center;
  if (t >= f.arriveAt) return f.to;
  return lerp(f.from, f.to, Math.max(0, (t - f.departAt) / (f.arriveAt - f.departAt)));
}

/** Perché la squadriglia non può trasferirsi alla base indicata (null = può). */
export function transferMissing(state: GameState, map: MapData, sq: Squadron, base: ProvinceId): string | null {
  const to = mapIndex(map).provinces.get(base);
  if (!to) return "Provincia sconosciuta.";
  if (sq.flight) return "La squadriglia è in volo.";
  if (sq.readyAt > state.time) return "La squadriglia si sta rifornendo.";
  if (base === sq.base) return "La squadriglia è già in questa base.";
  if (!isAirBase(state, base, sq.owner)) return "Non è una tua base aerea (serve un aeroporto o una fabbrica aeronautica, tua o di un alleato).";
  const km = flatKm(squadronPosition(sq, map, state.time), to.center);
  if (km > squadronRangeKm(sq)) return `Troppo lontano: ${Math.round(km)} km, la portata è di ${squadronRangeKm(sq)} km.`;
  return null;
}

/** Fa decollare la squadriglia verso la base (va chiamata dopo `transferMissing`). Modifica `sq`. */
export function startTransfer(sq: Squadron, map: MapData, base: ProvinceId, t: number): void {
  const from = squadronPosition(sq, map, t);
  const to = mapIndex(map).provinces.get(base)!.center;
  fly(sq, from, to, base, squadronRangeKm(sq), t);
}

/** Minuti di volo in linea retta da `from` a `to`, alla velocità del più lento. */
export function flightMinutes(sq: Squadron, from: LngLat, to: LngLat): number {
  return Math.max(1, Math.round((flatKm(from, to) / squadronSpeedKmh(sq)) * 60));
}

function fly(sq: Squadron, from: LngLat, to: LngLat, base: ProvinceId, fuelKm: number, t: number) {
  sq.flight = { from, to, base, departAt: t, arriveAt: t + flightMinutes(sq, from, to), fuelKm: fuelKm - flatKm(from, to) };
}

/**
 * Atterraggi al minuto `t`: la squadriglia arrivata si rifornisce alla base. Se nel frattempo la base non è più
 * utilizzabile (conquistata, alleanza finita) ripiega sulla base più vicina che può ancora raggiungere con la portata
 * rimasta; se non ce n'è, va persa. Modifica `s`.
 */
export function landSquadrons(s: GameState, map: MapData, t: number): void {
  for (const sq of Object.values(s.squadrons)) {
    const f = sq.flight;
    if (!f || f.arriveAt > t) continue;
    if (isAirBase(s, f.base, sq.owner)) {
      sq.base = f.base;
      sq.flight = null;
      sq.readyAt = t + refuelMinutes(s, sq, f.base);
      continue;
    }
    divert(s, map, sq, f.to, f.fuelKm, t);
  }
}

/**
 * Le squadriglie a terra in una base che non è più utilizzabile decollano verso la base più vicina entro la portata;
 * se non ce n'è, vanno perse. Modifica `s`.
 */
export function evacuateBases(s: GameState, map: MapData, t: number): void {
  for (const sq of Object.values(s.squadrons)) {
    if (sq.flight || isAirBase(s, sq.base, sq.owner)) continue;
    divert(s, map, sq, mapIndex(map).provinces.get(sq.base)!.center, squadronRangeKm(sq), t);
  }
}

/** Manda la squadriglia, da `at`, alla base più vicina entro `fuelKm`; se non c'è, la squadriglia va persa. */
function divert(s: GameState, map: MapData, sq: Squadron, at: LngLat, fuelKm: number, t: number) {
  let best: Province | null = null;
  let bestKm = Infinity;
  for (const p of airBases(s, map, sq.owner)) {
    const km = flatKm(at, p.center);
    if (km <= fuelKm && km < bestKm) [best, bestKm] = [p, km];
  }
  if (!best) {
    logEvent(s, {
      time: t,
      type: "squadronLost",
      owner: sq.owner,
      at,
      province: sq.flight?.base ?? sq.base,
    });
    delete s.squadrons[sq.id];
    return;
  }
  fly(sq, at, best.center, best.id, fuelKm, t);
}
