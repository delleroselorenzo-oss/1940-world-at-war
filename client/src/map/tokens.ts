import { Assets, Graphics, type Texture } from "pixi.js";
import { AIRCRAFT_TYPES, SHIP_TYPES, UNIT_TYPES, doctrineOf, type Aircraft, type Ship, type ShipTypeId, type Unit } from "@waw/shared";

// Pedine dipinte della mappa (docs/pedine.md): la figura dell'unità principale sopra una basetta col colore della nazione.
// Le immagini stanno in client/src/assets/tokens/<dottrina>/<id>.png (preparate da data/scripts/build-tokens.ts);
// trasporto e convoglio mercantile, uguali per tutti, in tokens/common/. Se per una dottrina la figura manca,
// il gettone resta quello disegnato dal gioco.

const files = import.meta.glob<string>("../assets/tokens/*/*.png", { eager: true, import: "default" });

const URLS: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.slice("../assets/tokens/".length, -".png".length), url]),
);

/** Figura della pedina per la nazione (prima quella della sua dottrina, poi quella comune), se c'è. */
export function tokenUrl(nation: string, id: string): string | undefined {
  return URLS[`${doctrineOf(nation)}/${id}`] ?? URLS[`common/${id}`];
}

const textures = new Map<string, Texture | null>();

/**
 * Texture della figura, se è già caricata; altrimenti avvia il caricamento e dà null
 * (i livelli ridisegnano a ogni fotogramma, quindi la figura compare appena è pronta).
 */
export function tokenTexture(url: string | undefined): Texture | null {
  if (!url) return null;
  const known = textures.get(url);
  if (known !== undefined) return known;
  textures.set(url, null);
  Assets.load<Texture>(url).then(
    (texture) => {
      // Le figure si rimpiccioliscono molto: con le mipmap restano morbide invece che seghettate.
      texture.source.autoGenerateMipmaps = true;
      texture.source.updateMipmaps();
      textures.set(url, texture);
    },
    () => textures.delete(url),
  );
  return null;
}

/** Tipo principale di un gruppo: il più numeroso; a parità, il più costoso (carri prima della fanteria). */
function leadType<T extends string>(types: T[], money: (t: T) => number): T | undefined {
  const count = new Map<T, number>();
  for (const t of types) count.set(t, (count.get(t) ?? 0) + 1);
  let best: T | undefined;
  for (const [t, n] of count) {
    const b = best === undefined ? 0 : count.get(best)!;
    if (best === undefined || n > b || (n === b && money(t) > money(best))) best = t;
  }
  return best;
}

export const leadUnit = (units: Unit[]) => leadType(units.map((u) => u.type), (t) => UNIT_TYPES[t].cost.money ?? 0);
/** Nave della pedina: la più grande della flotta (la più costosa), anche se è una sola. */
export function leadShip(ships: Ship[]): ShipTypeId | undefined {
  const money = (t: ShipTypeId) => SHIP_TYPES[t].cost.money ?? 0;
  return ships.map((s) => s.type).reduce<ShipTypeId | undefined>((best, t) => (best === undefined || money(t) > money(best) ? t : best), undefined);
}
export const leadAircraft = (aircraft: Aircraft[]) => leadType(aircraft.map((a) => a.type), (t) => AIRCRAFT_TYPES[t].cost.money ?? 0);

/** Basetta ovale col colore della nazione, centrata in (0, cy); il bordo dice se è propria, selezionata o in battaglia. */
export function drawPedestal(g: Graphics, cy: number, rx: number, ry: number, color: string, border: string, width: number): void {
  g.ellipse(0, cy + 2, rx, ry).fill({ color: "#000000", alpha: 0.35 });
  // Il bordo sta dentro l'ovale, così le basette hanno tutte la stessa misura; un filo scuro le stacca dalla provincia dello stesso colore.
  g.ellipse(0, cy, rx, ry).fill(border);
  g.ellipse(0, cy, rx - width, ry - width).fill(color).stroke({ width: 0.8, color: "#1b1b1b", alpha: 0.5 });
}
