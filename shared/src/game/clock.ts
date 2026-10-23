import type { GameClock } from "./state.js";

export function gameMinutesAt(clock: GameClock, realMs: number): number {
  return clock.gameAnchorMinutes + ((realMs - clock.realAnchorMs) / 60_000) * clock.speed;
}

/** Nuovo orologio con un'altra velocità, senza salti nel tempo di gioco. */
export function withSpeed(clock: GameClock, realMs: number, speed: number): GameClock {
  return { realAnchorMs: realMs, gameAnchorMinutes: gameMinutesAt(clock, realMs), speed };
}

/** "Giorno 3, 14:30": il giorno 1 è il primo giorno di partita. */
export function formatGameTime(minutes: number): string {
  const day = Math.floor(minutes / 1440) + 1;
  const inDay = Math.floor(minutes % 1440);
  const hh = String(Math.floor(inDay / 60)).padStart(2, "0");
  const mm = String(inDay % 60).padStart(2, "0");
  return `Giorno ${day}, ${hh}:${mm}`;
}
