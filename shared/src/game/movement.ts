import { MOVEMENT } from "../data/movement.js";
import { UNIT_TYPES } from "../data/units.js";
import type { LngLat, Terrain } from "../map/types.js";
import { flatKm } from "../nav/grid.js";
import type { Army, ArmyMove, RouteLeg } from "./state.js";
import { armyTerrainSpeeds } from "./terrain.js";

/** Un'armata va alla velocità della sua unità più lenta (in pianura; sugli altri terreni vedi `armyTerrainSpeeds`). */
export function armySpeedKmh(army: Army): number {
  return Math.min(...army.units.map((u) => UNIT_TYPES[u.type].speedKmh));
}

/** Minuti per salire (o scendere) dal treno: dipendono solo da quante unità ha l'armata. */
export function boardMinutes(unitCount: number): number {
  const m = unitCount * MOVEMENT.railBoardMinutesPerUnit;
  return Math.min(MOVEMENT.railBoardMaxMinutes, Math.max(MOVEMENT.railBoardMinMinutes, m));
}

/** Come si muove un'armata: velocità a piedi (o su mezzi propri) e tempi di salita sul treno. */
export interface Mover {
  speedKmh: number;
  boardMinutes: number;
  /** Può prendere il treno? (scelta del giocatore) */
  useRail: boolean;
  /** Velocità su ogni terreno come frazione di `speedKmh` (fuori strada; su strada il calo è a metà). */
  terrain: Record<Terrain, number>;
}

export function moverOf(army: Army, useRail = army.useRail): Mover {
  return { speedKmh: armySpeedKmh(army), boardMinutes: boardMinutes(army.units.length), useRail, terrain: armyTerrainSpeeds(army) };
}

/**
 * Trasforma un percorso in una marcia con gli orari di passaggio, partendo al minuto `start`.
 * In treno si va alla velocità del treno; prima del primo tratto in treno e dopo l'ultimo c'è una sosta
 * per salire e scendere (un tratto di lunghezza zero nella marcia).
 */
export function scheduleRoute(route: RouteLeg, mover: Mover, start: number): ArmyMove {
  // Le soste di una marcia precedente si tolgono: si ricalcolano qui.
  const legs: { to: LngLat; onRoad: boolean; rail: number; terrain: number }[] = [];
  for (let i = 1; i < route.points.length; i++) {
    const to = route.points[i]!;
    const prev = route.points[i - 1]!;
    if (to[0] === prev[0] && to[1] === prev[1]) continue;
    legs.push({ to, onRoad: route.onRoad[i - 1]!, rail: route.rail[i - 1] ?? 0, terrain: route.terrain?.[i - 1] ?? 1 });
  }
  const points = [route.points[0]!];
  const times = [start];
  const onRoad: boolean[] = [];
  const rail: number[] = [];
  const terrain: number[] = [];
  const pause = (kmh: number) => {
    points.push(points[points.length - 1]!);
    times.push(times[times.length - 1]! + mover.boardMinutes);
    onRoad.push(true);
    rail.push(kmh);
    terrain.push(1);
  };
  legs.forEach((leg, i) => {
    const before = i > 0 ? legs[i - 1]!.rail : 0;
    if (leg.rail > 0 && before === 0) pause(leg.rail); // sale
    if (leg.rail === 0 && before > 0) pause(before); // scende
    const kmh = leg.rail || mover.speedKmh * (leg.onRoad ? MOVEMENT.roadFactor : MOVEMENT.offRoadFactor) * leg.terrain;
    times.push(times[times.length - 1]! + (flatKm(points[points.length - 1]!, leg.to) / kmh) * 60);
    points.push(leg.to);
    onRoad.push(leg.onRoad);
    rail.push(leg.rail);
    terrain.push(leg.terrain);
  });
  const last = legs.at(-1)?.rail ?? 0;
  if (last > 0) pause(last);
  return { points, times, onRoad, rail, terrain };
}

/** Posizione dell'armata al minuto `now`. */
export function armyPosition(army: Army, now: number): LngLat {
  const move = army.move;
  if (!move) return army.position;
  const { points, times } = move;
  if (now <= times[0]!) return points[0]!;
  const last = times.length - 1;
  if (now >= times[last]!) return points[last]!;
  // Ricerca binaria del tratto in corso.
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid]! <= now) lo = mid;
    else hi = mid;
  }
  const t = (now - times[lo]!) / (times[hi]! - times[lo]! || 1);
  const a = points[lo]!;
  const b = points[hi]!;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * Resto di una marcia interrotta al minuto `at` nel punto `from`: da lì ai punti non ancora raggiunti.
 * Null se a quell'ora la marcia era già finita.
 */
export function remainingRoute(move: ArmyMove, at: number, from: LngLat): RouteLeg | null {
  const { points, times, onRoad, rail, terrain } = move;
  const next = times.findIndex((t) => t > at);
  if (next <= 0) return null;
  return { points: [from, ...points.slice(next)], onRoad: onRoad.slice(next - 1), rail: rail.slice(next - 1), terrain: terrain?.slice(next - 1) };
}

/** Lunghezza in km di un percorso. */
export function routeKm(route: RouteLeg): number {
  let km = 0;
  for (let i = 1; i < route.points.length; i++) km += flatKm(route.points[i - 1]!, route.points[i]!);
  return km;
}

/** Minuto di gioco in cui l'armata arriverà a destinazione, o null se è ferma. */
export function arrivalTime(army: Army): number | null {
  return army.move ? army.move.times[army.move.times.length - 1]! : null;
}

/** Destinazione della marcia in corso (o di quella interrotta dal combattimento), o null se l'armata è ferma. */
export function destination(army: Army): LngLat | null {
  const points = army.move?.points ?? army.halted?.points;
  return points ? points[points.length - 1]! : null;
}
