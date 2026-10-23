import type { ResourceId } from "@waw/shared";

// useGrouping: in italiano di norma "6000" non ha il punto; lo vogliamo uguale a "18.000".
const whole = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0, useGrouping: true });
const compact = new Intl.NumberFormat("it-IT", { notation: "compact", maximumFractionDigits: 1 });

/** Numeri interi con separatore delle migliaia; oltre il milione in forma breve. */
export function formatAmount(n: number): string {
  return Math.abs(n) >= 1_000_000 ? compact.format(n) : whole.format(Math.floor(n));
}

/** Colore distintivo di ogni risorsa, per i pallini nell'interfaccia. */
export const RESOURCE_COLORS: Record<ResourceId, string> = {
  food: "#6a9f3a",
  goods: "#a0703c",
  metal: "#6f8496",
  oil: "#2b2b2b",
  rare: "#8a5bb5",
  money: "#d1a41f",
  manpower: "#c0564b",
};

/** Durata reale in "mm:ss" o "h:mm:ss". */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** "30 min", "2 h", "1 h 30". */
export function formatDelay(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m}`;
}
