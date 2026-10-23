import { MOVEMENT } from "../data/movement.js";
import { UNIT_TYPES } from "../data/units.js";
import type { LngLat } from "../map/types.js";
import { flatKm } from "../nav/grid.js";
import type { Route } from "../nav/route.js";
import type { Army, ArmyMove } from "./state.js";

/** Un'armata va alla velocità della sua unità più lenta. */
export function armySpeedKmh(army: Army): number {
  return Math.min(...army.units.map((u) => UNIT_TYPES[u.type].speedKmh));
}

/** Trasforma un percorso in una marcia con gli orari di passaggio, partendo al minuto `start`. */
export function scheduleRoute(route: Route, speedKmh: number, start: number): ArmyMove {
  const times = [start];
  for (let i = 1; i < route.points.length; i++) {
    const factor = route.onRoad[i - 1] ? MOVEMENT.roadFactor : MOVEMENT.offRoadFactor;
    times.push(times[i - 1]! + (flatKm(route.points[i - 1]!, route.points[i]!) / (speedKmh * factor)) * 60);
  }
  return { points: route.points, times, onRoad: route.onRoad };
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

/** Minuto di gioco in cui l'armata arriverà a destinazione, o null se è ferma. */
export function arrivalTime(army: Army): number | null {
  return army.move ? army.move.times[army.move.times.length - 1]! : null;
}

/** Destinazione della marcia in corso, o null se l'armata è ferma. */
export function destination(army: Army): LngLat | null {
  return army.move ? army.move.points[army.move.points.length - 1]! : null;
}
