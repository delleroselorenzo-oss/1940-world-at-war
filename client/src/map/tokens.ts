import { Assets, type Graphics, type Sprite, type Texture } from "pixi.js";
import { AIRCRAFT_TYPES, SHIP_TYPES, UNIT_TYPES, doctrineOf, type Aircraft, type Ship, type ShipTypeId, type Unit } from "@waw/shared";

// Pedine dipinte della mappa (docs/pedine.md): la figura dell'unità principale, con la sua ombra e il numero in un cerchietto
// col colore della nazione.
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

/**
 * Lato più lungo della figura, in pixel dello schermo con lo zoom di partenza (poi cresce avvicinandosi, vedi `tokenScale`).
 * Non è in scala vera, ma ogni unità mostra la sua stazza: il fante è il più piccolo, i carri pesanti più dei leggeri,
 * le navi da guerra crescono dal sottomarino alla corazzata, il bombardiere strategico è il più grande degli aerei.
 */
const TOKEN_SIZE: Record<string, number> = {
  infantry: 30,
  engineer: 30,
  medic: 30,
  antiTank: 34,
  antiAircraft: 36,
  armoredCar: 38,
  motorized: 40,
  artillery: 40,
  lightTank: 40,
  heavyTank: 48,
  fighter: 36,
  recon: 38,
  tacticalBomber: 40,
  torpedoBomber: 42,
  strategicBomber: 52,
  airConvoy: 48,
  submarine: 44,
  destroyer: 50,
  transport: 56,
  convoy: 58,
  cruiser: 58,
  carrier: 66,
  battleship: 66,
};

/** Ingrandimento delle pedine con lo zoom della mappa (`zoom` = 1 con l'Europa intera): più grandi da vicino, per vedere i dettagli. */
export function tokenScale(zoom: number): number {
  return Math.min(1.6, Math.max(0.75, 0.75 + 0.25 * Math.log2(Math.max(zoom, 1e-3))));
}

export interface FigureLook {
  /** Colore della nazione: riempie il cerchietto del numero. */
  color: string;
  mine: boolean;
  /** Anello sotto la figura: giallo se selezionata, rosso in battaglia. */
  ring: string | null;
  /** Numero da mostrare; null = solo un pallino col colore della nazione (il convoglio mercantile). */
  count: number | null;
}

export interface FigureLayout {
  /** Centro del cerchietto del numero, rispetto al punto della pedina. */
  count: [number, number];
  /** Spostamento verticale del punto da toccare (il centro della figura). */
  hitDy: number;
  /** Fine dell'ombra in basso (sotto ci va la barra della salute). */
  bottom: number;
  width: number;
}

/**
 * Pedina senza basetta: ombra (e anello di selezione o battaglia) in `ground`, figura in piedi sul punto,
 * numero in un cerchietto col colore della nazione (bordo bianco se è tua) in `badge`.
 */
export function drawFigure(ground: Graphics, badge: Graphics, figure: Sprite, texture: Texture, id: string, look: FigureLook): FigureLayout {
  const k = (TOKEN_SIZE[id] ?? 36) / Math.max(texture.width, texture.height);
  const w = texture.width * k;
  const h = texture.height * k;
  const rx = w * 0.42;
  const ry = Math.max(3, Math.min(7, h * 0.14));
  if (look.ring) ground.ellipse(0, 0, rx + 3, ry + 2).fill({ color: look.ring, alpha: 0.4 }).stroke({ width: 2.5, color: look.ring });
  ground.ellipse(0, 0, rx, ry).fill({ color: "#000000", alpha: 0.3 });
  figure.texture = texture;
  figure.scale.set(k);
  figure.position.set(0, ry * 0.5);
  figure.visible = true;
  const count: [number, number] = [w / 2 - 2, -3];
  const r = look.count === null ? 4.5 : 7.5;
  badge.circle(count[0], count[1], r).fill(look.color).stroke({ width: look.mine ? 2 : 1.2, color: look.mine ? "#ffffff" : "#1b1b1b" });
  return { count, hitDy: ry * 0.5 - h / 2, bottom: ry + 2, width: w };
}
