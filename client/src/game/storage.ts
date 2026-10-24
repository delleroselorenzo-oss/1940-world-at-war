import type { GameState } from "@waw/shared";

// Salvataggio della partita locale nel browser. Il salvataggio può non essere
// disponibile (navigazione privata, spazio pieno): in quel caso si gioca senza.

// Va aumentata quando cambia la forma di GameState: i salvataggi vecchi vengono ignorati.
const VERSION = 10;
const key = (mapId: string) => `waw.local-game.${mapId}.v${VERSION}`;

export function loadGame(mapId: string): GameState | null {
  try {
    const raw = localStorage.getItem(key(mapId));
    if (!raw) return null;
    const state = JSON.parse(raw) as GameState;
    return state.mapId === mapId ? state : null;
  } catch {
    return null;
  }
}

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(key(state.mapId), JSON.stringify(state));
  } catch {
    // Ignorato: la partita continua in memoria.
  }
}

export function deleteGame(mapId: string): void {
  try {
    localStorage.removeItem(key(mapId));
  } catch {
    // Ignorato.
  }
}
