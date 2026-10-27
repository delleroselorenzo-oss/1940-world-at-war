import { Assets, Container, Graphics, Sprite, Texture } from "pixi.js";
import { AIRCRAFT_TYPES, SHIP_TYPES, UNIT_TYPES, doctrineOf, type Aircraft, type Ship, type ShipTypeId, type Unit } from "@waw/shared";

// Pedine dipinte della mappa (docs/pedine.md): la figura dell'unità principale, senza basetta, con l'ombra della sua sagoma
// e il numero in un cerchietto col colore della nazione.
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
/** Sagoma bianca di ogni figura: colorata diventa l'ombra o il contorno, di un colore pieno. */
const silhouettes = new WeakMap<Texture, Texture>();

function makeSilhouette(texture: Texture): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = texture.width;
  canvas.height = texture.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(texture.source.resource as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const out = Texture.from(canvas);
  out.source.autoGenerateMipmaps = true;
  out.source.updateMipmaps();
  return out;
}

/**
 * Texture della figura, se è già caricata; altrimenti avvia il caricamento e dà null
 * (i livelli ridisegnano a ogni fotogramma, quindi la figura compare appena è pronta).
 */
export function tokenTexture(url: string | undefined): Texture | null {
  if (!url) return null;
  const known = textures.get(url);
  if (known !== undefined) return known;
  textures.set(url, null);
  Assets.load<Texture>(url)
    .then((texture) => {
      // Le figure si rimpiccioliscono molto: con le mipmap restano morbide invece che seghettate.
      texture.source.autoGenerateMipmaps = true;
      texture.source.updateMipmaps();
      silhouettes.set(texture, makeSilhouette(texture));
      textures.set(url, texture);
    })
    .catch((error) => console.warn("Pedina non caricata:", url, error));
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

/** Dove sta la figura: decide la sua ombra (a terra, sull'acqua, sul suolo sotto l'aereo). */
export type FigureKind = "land" | "sea" | "air";

/** Direzioni delle copie colorate che fanno il contorno della sagoma. */
const OUTLINE_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]] as const;
const OUTLINE_PX = 1.8;
/** Ombra: colore, opacità e spostamento (luce da sinistra in alto, come nelle figure). */
const SHADOWS: Record<FigureKind, { tint: number; alpha: number; dx: number; dy: number }> = {
  land: { tint: 0x000000, alpha: 0.32, dx: 2.5, dy: 2 },
  // Sull'acqua l'ombra è un blu scuro: lo scafo "affonda" nel mare.
  sea: { tint: 0x0b2236, alpha: 0.45, dx: 2, dy: 2.5 },
  air: { tint: 0x000000, alpha: 0.28, dx: 2.5, dy: 3 },
};

/**
 * Figura dipinta senza basetta: niente si mette tra la figura e la mappa. Ha la sua ombra, della stessa sagoma
 * (`shadow`, sotto tutto; per un aereo in volo resta a terra mentre la figura si alza), il contorno della sagoma
 * per la selezione o la battaglia (`outline`), la figura (`sprite`) e, per le navi in navigazione, la scia (`wake`).
 * Il punto della pedina è dove la figura poggia: i piedi, le ruote, la linea di galleggiamento.
 */
export class Figure {
  readonly shadow = new Sprite();
  readonly wake = new Graphics();
  readonly outline = new Container();
  readonly sprite = new Sprite();
  width = 0;
  height = 0;
  private k = 1;
  private shadowAlpha = 0;

  constructor() {
    this.shadow.anchor.set(0.5, 1);
    this.sprite.anchor.set(0.5, 1);
    for (const [dx, dy] of OUTLINE_DIRS) {
      const s = new Sprite();
      s.anchor.set(0.5, 1);
      s.position.set(dx * OUTLINE_PX, dy * OUTLINE_PX);
      this.outline.addChild(s);
    }
    this.hide();
  }

  hide(): void {
    for (const part of [this.shadow, this.wake, this.outline, this.sprite]) part.visible = false;
  }

  /** Mostra la figura `id` con la sua stazza; `ring` colora il contorno (null = nessuno). */
  show(texture: Texture, id: string, kind: FigureKind, ring: string | null): void {
    this.k = (TOKEN_SIZE[id] ?? 36) / Math.max(texture.width, texture.height);
    this.width = texture.width * this.k;
    this.height = texture.height * this.k;
    const shade = SHADOWS[kind];
    const silhouette = silhouettes.get(texture) ?? texture;
    this.shadow.texture = silhouette;
    this.shadow.tint = shade.tint;
    this.shadow.alpha = this.shadowAlpha = shade.alpha;
    this.shadow.position.set(shade.dx, shade.dy);
    this.sprite.texture = texture;
    for (const s of this.outline.children as Sprite[]) {
      s.texture = silhouette;
      if (ring) s.tint = ring;
    }
    this.shadow.visible = this.sprite.visible = true;
    this.outline.visible = ring !== null;
    this.setFlip(false);
  }

  /** Schiarisce l'ombra (1 = piena): un aereo più è in alto, più la sua ombra è leggera. */
  fadeShadow(k: number): void {
    this.shadow.alpha = this.shadowAlpha * k;
  }

  /** Volta la figura (guarda a destra; `west` = verso sinistra). */
  setFlip(west: boolean): void {
    const sx = west ? -this.k : this.k;
    this.sprite.scale.set(sx, this.k);
    this.shadow.scale.set(sx, this.k);
    for (const s of this.outline.children as Sprite[]) s.scale.set(sx, this.k);
    this.wake.scale.x = west ? -1 : 1;
  }

  /**
   * Scia della nave in navigazione: schiuma a prua e due solchi che si allargano dietro la poppa.
   * Le figure delle navi sono di tre quarti con la prua in basso a destra e la poppa in alto a sinistra.
   */
  setWake(sailing: boolean): void {
    const g = this.wake.clear();
    this.wake.visible = sailing;
    if (!sailing) return;
    const w = this.width;
    const h = this.height;
    const foam = { color: "#ffffff", alpha: 0.75, width: 1.4, cap: "round" as const };
    // Prua (in basso a destra): un baffo d'acqua lungo lo scafo.
    g.moveTo(w * 0.3, -h * 0.06).quadraticCurveTo(w * 0.44, h * 0.02, w * 0.5, -h * 0.08).stroke(foam);
    // Poppa (a sinistra, più in alto): due solchi che proseguono la linea dello scafo all'indietro e si aprono.
    const sx = -w * 0.44;
    const sy = -h * 0.5;
    g.moveTo(sx, sy - h * 0.04).quadraticCurveTo(sx - w * 0.12, sy - h * 0.14, sx - w * 0.3, sy - h * 0.3).stroke({ ...foam, alpha: 0.6 });
    g.moveTo(sx + w * 0.02, sy + h * 0.06).quadraticCurveTo(sx - w * 0.14, sy - h * 0.02, sx - w * 0.34, sy - h * 0.1).stroke({ ...foam, alpha: 0.5 });
  }
}

export interface FigureLook {
  /** Colore della nazione: riempie il cerchietto del numero. */
  color: string;
  mine: boolean;
  /** Numero da mostrare; null = solo un pallino col colore della nazione (il convoglio mercantile). */
  count: number | null;
}

/** Cerchietto del numero col colore della nazione (bordo bianco se è tua), in basso a destra della figura. Dà il suo centro. */
export function drawCountChip(g: Graphics, figure: Figure, look: FigureLook): [number, number] {
  const at: [number, number] = [figure.width / 2 - 2, -4];
  const r = look.count === null ? 4.5 : 7.5;
  g.circle(at[0], at[1], r).fill(look.color).stroke({ width: look.mine ? 2 : 1.2, color: look.mine ? "#ffffff" : "#1b1b1b" });
  return at;
}
