import { useCallback, useEffect, useRef, useState } from "react";
import {
  advance,
  applyOrder,
  createGame,
  ECONOMY,
  gameMinutesAt,
  RESOURCE_IDS,
  withSpeed,
  type GameState,
  type NationId,
  type Order,
  type ResourceAmounts,
} from "@waw/shared";
import type { LoadedMap } from "../map/loadMap.js";
import { deleteGame, loadGame, saveGame } from "./storage.js";

/** Risorse maturate mentre il giocatore era via, mostrate al rientro. */
export interface OfflineReport {
  minutes: number;
  gained: ResourceAmounts;
}

export interface LocalGame {
  state: GameState | null;
  /** Minuti di gioco "adesso" (anche a metà tick), aggiornati ogni secondo. */
  now: number;
  offline: OfflineReport | null;
  dismissOffline(): void;
  start(nation: NationId): void;
  reset(): void;
  setSpeed(speed: number): void;
  /** Invia un ordine del giocatore; restituisce il messaggio d'errore se non è valido. */
  order(order: Order): string | null;
  /** Minuto di gioco esatto in questo istante (per le animazioni). */
  nowExact(): number;
}

/**
 * Partita locale nel browser: il motore di /shared fa i conti, qui si gestiscono
 * il passare del tempo reale e il salvataggio. Più avanti lo stesso ruolo lo avrà il server.
 */
export function useLocalGame(map: LoadedMap): LocalGame {
  const [state, setState] = useState<GameState | null>(null);
  const [now, setNow] = useState(0);
  const [offline, setOffline] = useState<OfflineReport | null>(null);

  // Al caricamento: riprende la partita salvata e recupera il tempo trascorso offline.
  useEffect(() => {
    const saved = loadGame(map.data.id);
    if (!saved) return;
    const minutes = gameMinutesAt(saved.clock, Date.now());
    const caught = advance(saved, map.data, minutes);
    // L'avviso ha senso solo se nel frattempo c'è stato almeno un accredito.
    if (Math.floor(caught.time / ECONOMY.tickMinutes) > Math.floor(saved.time / ECONOMY.tickMinutes)) {
      const before = saved.nations[saved.playerNation]!.stock;
      const after = caught.nations[caught.playerNation]!.stock;
      const gained = Object.fromEntries(RESOURCE_IDS.map((r) => [r, after[r] - before[r]])) as ResourceAmounts;
      setOffline({ minutes: Math.round(caught.time - saved.time), gained });
      saveGame(caught);
    }
    setState(caught);
    setNow(minutes);
  }, [map]);

  // Mentre si gioca: ogni secondo la partita avanza (arrivi, arruolamenti, tick di produzione).
  const stateRef = useRef(state);
  stateRef.current = state;
  const playing = state !== null;
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const current = stateRef.current;
      if (!current) return;
      const minutes = gameMinutesAt(current.clock, Date.now());
      setNow(minutes);
      const next = advance(current, map.data, minutes);
      saveGame(next);
      setState(next);
    }, 1000);
    return () => clearInterval(id);
  }, [playing, map]);

  const start = useCallback(
    (nation: NationId) => {
      const game = createGame(map.data, { playerNation: nation, realNowMs: Date.now() });
      saveGame(game);
      setState(game);
      setNow(0);
      setOffline(null);
    },
    [map],
  );

  const reset = useCallback(() => {
    deleteGame(map.data.id);
    setState(null);
    setOffline(null);
  }, [map]);

  const setSpeed = useCallback((speed: number) => {
    setState((s) => {
      if (!s) return s;
      const next = { ...s, clock: withSpeed(s.clock, Date.now(), speed) };
      saveGame(next);
      return next;
    });
  }, []);

  const order = useCallback(
    (o: Order): string | null => {
      const current = stateRef.current;
      if (!current) return "Nessuna partita in corso.";
      // L'ordine vale "adesso": prima si porta la partita all'ora attuale.
      const caught = advance(current, map.data, gameMinutesAt(current.clock, Date.now()));
      const result = applyOrder(caught, { map: map.data, nav: map.nav }, caught.playerNation, o);
      if (!result.ok) return result.error;
      saveGame(result.state);
      stateRef.current = result.state;
      setState(result.state);
      return null;
    },
    [map],
  );

  const nowExact = useCallback(() => {
    const current = stateRef.current;
    return current ? gameMinutesAt(current.clock, Date.now()) : 0;
  }, []);

  return { state, now, offline, dismissOffline: () => setOffline(null), start, reset, setSpeed, order, nowExact };
}
