// Modalità della mappa: come si colorano le province. Le scelte e i colori stanno qui, il disegno in MapRenderer.

export type MapMode = "political" | "terrain" | "morale" | "diplomacy";

export const MAP_MODES: { id: MapMode; name: string }[] = [
  { id: "political", name: "Politica" },
  { id: "terrain", name: "Rilievo" },
  { id: "morale", name: "Morale" },
  { id: "diplomacy", name: "Diplomazia" },
];

/**
 * Opacità dei colori delle province sopra la mappa base del rilievo (che sta sempre sotto):
 * il rilievo si intuisce anche nelle altre modalità; in quella del rilievo non ci sono colori.
 */
export const FILL_ALPHA: Record<MapMode, number> = {
  political: 0.62,
  terrain: 0,
  morale: 0.66,
  diplomacy: 0.66,
};

/** Rapporto di una nazione con il giocatore, per la mappa della diplomazia. */
export type Standing = "self" | "shared" | "war" | "truce" | "neutral";

export const STANDING_COLORS: Record<Standing, string> = {
  self: "#7fa6cf",
  shared: "#a9c2b8",
  war: "#c98d80",
  truce: "#d9bd8e",
  neutral: "#dcd7cb",
};

export const STANDING_NAMES: Record<Standing, string> = {
  self: "La tua nazione",
  shared: "Mappa condivisa o alleanza",
  war: "In guerra",
  truce: "Tregua",
  neutral: "Altre nazioni",
};

/** Tappe del gradiente del morale: rosso mattone a 0, ocra a metà, verde salvia a 100. */
const MORALE_STOPS: [number, [number, number, number]][] = [
  [0, [0xb8, 0x6a, 0x55]],
  [50, [0xd9, 0xb6, 0x6a]],
  [100, [0x86, 0xab, 0x80]],
];

export function moraleColor(morale: number): string {
  const m = Math.max(0, Math.min(100, morale));
  let i = 0;
  while (i < MORALE_STOPS.length - 2 && m > MORALE_STOPS[i + 1]![0]) i++;
  const [m0, c0] = MORALE_STOPS[i]!;
  const [m1, c1] = MORALE_STOPS[i + 1]!;
  const f = (m - m0) / (m1 - m0);
  return `#${c0.map((v, k) => Math.round(v + (c1[k]! - v) * f).toString(16).padStart(2, "0")).join("")}`;
}
