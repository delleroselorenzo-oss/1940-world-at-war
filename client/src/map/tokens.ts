import { Assets, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CategoryIcon } from "../ui/CategoryIcon.js";
import { AIRCRAFT_TYPES, SHIP_TYPES, UNIT_TYPES, doctrineOf, type Aircraft, type Ship, type ShipTypeId, type Unit } from "@waw/shared";

// Pedine dipinte della mappa (docs/pedine.md): la figura dell'unità principale, senza basetta, con l'ombra morbida della sua
// sagoma, e accanto il cartellino con le truppe, la salute e il colore della nazione.
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
/** Margine dell'ombra sfumata, in pixel della figura (128 px sul lato lungo). */
const SHADOW_PAD = 14;
/** Sagoma bianca (per il contorno, che si colora con `tint`) e ombra sfumata di ogni figura. */
const figureExtras = new WeakMap<Texture, { silhouette: Texture; shadow: Texture }>();

function makeExtras(texture: Texture): { silhouette: Texture; shadow: Texture } {
  const w = texture.width;
  const h = texture.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(texture.source.resource as CanvasImageSource, 0, 0, w, h);
  const alpha = ctx.getImageData(0, 0, w, h).data;
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  // Ombra: la sagoma con un margine, sfumata con tre passate di media mobile (in orizzontale e in verticale).
  const sw = w + 2 * SHADOW_PAD;
  const sh = h + 2 * SHADOW_PAD;
  let a = new Float32Array(sw * sh);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[(y + SHADOW_PAD) * sw + x + SHADOW_PAD] = alpha[(y * w + x) * 4 + 3]!;
  const r = 4;
  for (let pass = 0; pass < 3; pass++) {
    const tmp = new Float32Array(sw * sh);
    for (let y = 0; y < sh; y++) {
      let sum = 0;
      for (let x = -r; x <= r; x++) sum += x >= 0 && x < sw ? a[y * sw + x]! : 0;
      for (let x = 0; x < sw; x++) {
        tmp[y * sw + x] = sum / (2 * r + 1);
        const add = x + r + 1;
        const drop = x - r;
        if (add < sw) sum += a[y * sw + add]!;
        if (drop >= 0) sum -= a[y * sw + drop]!;
      }
    }
    for (let x = 0; x < sw; x++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += y >= 0 && y < sh ? tmp[y * sw + x]! : 0;
      for (let y = 0; y < sh; y++) {
        a[y * sw + x] = sum / (2 * r + 1);
        const add = y + r + 1;
        const drop = y - r;
        if (add < sh) sum += tmp[add * sw + x]!;
        if (drop >= 0) sum -= tmp[drop * sw + x]!;
      }
    }
  }
  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = sw;
  shadowCanvas.height = sh;
  const sctx = shadowCanvas.getContext("2d")!;
  const img = sctx.createImageData(sw, sh);
  for (let i = 0; i < sw * sh; i++) {
    img.data[i * 4 + 3] = Math.round(a[i]!);
  }
  sctx.putImageData(img, 0, 0);
  const out = { silhouette: Texture.from(canvas), shadow: Texture.from(shadowCanvas) };
  for (const t of [out.silhouette, out.shadow]) {
    t.source.autoGenerateMipmaps = true;
    t.source.updateMipmaps();
  }
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
      figureExtras.set(texture, makeExtras(texture));
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
  infantry: 40,
  engineer: 40,
  medic: 40,
  antiTank: 44,
  antiAircraft: 46,
  armoredCar: 50,
  motorized: 52,
  artillery: 52,
  lightTank: 52,
  heavyTank: 62,
  fighter: 46,
  recon: 48,
  tacticalBomber: 52,
  torpedoBomber: 54,
  strategicBomber: 66,
  airConvoy: 62,
  submarine: 56,
  destroyer: 64,
  transport: 72,
  convoy: 74,
  cruiser: 74,
  carrier: 84,
  battleship: 84,
};

/** Ingrandimento delle pedine con lo zoom della mappa (`zoom` = 1 con l'Europa intera): più grandi da vicino (fino al doppio), per vedere i dettagli. */
export function tokenScale(zoom: number): number {
  return Math.min(2, Math.max(0.8, 0.8 + 0.3 * Math.log2(Math.max(zoom, 1e-3))));
}

/** Dove sta la figura: un aereo in volo ha l'ombra a terra, lontana da lui. */
export type FigureKind = "land" | "sea" | "air";

/** Direzioni delle copie colorate che fanno il contorno della sagoma. */
const OUTLINE_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]] as const;
const OUTLINE_PX = 1.8;
/** Ombra morbida (luce da sinistra in alto, come nelle figure): opacità e spostamento in pixel dello schermo. */
const SHADOWS: Record<FigureKind, { alpha: number; dx: number; dy: number }> = {
  land: { alpha: 0.55, dx: 5, dy: 4 },
  sea: { alpha: 0.45, dx: 5, dy: 4 },
  air: { alpha: 0.4, dx: 4, dy: 5 },
};

/**
 * Figura dipinta senza basetta: niente si mette tra la figura e la mappa. Ha un'ombra morbida della sua sagoma
 * (`shadow`, sotto tutto; per un aereo in volo resta a terra mentre la figura si alza), il contorno della sagoma
 * per la selezione o la battaglia (`outline`) e la figura (`sprite`).
 * Il punto della pedina è dove la figura poggia: i piedi, le ruote, la linea di galleggiamento.
 */
export class Figure {
  readonly shadow = new Sprite();
  readonly outline = new Container();
  readonly sprite = new Sprite();
  width = 0;
  height = 0;
  private k = 1;
  private shadowAlpha = 0;
  private shadowDx = 0;

  constructor() {
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
    for (const part of [this.shadow, this.outline, this.sprite]) part.visible = false;
  }

  /** Mostra la figura `id` con la sua stazza; `ring` colora il contorno (null = nessuno). */
  show(texture: Texture, id: string, kind: FigureKind, ring: string | null): void {
    this.k = (TOKEN_SIZE[id] ?? 36) / Math.max(texture.width, texture.height);
    this.width = texture.width * this.k;
    this.height = texture.height * this.k;
    const extra = figureExtras.get(texture);
    const shade = SHADOWS[kind];
    if (extra) {
      this.shadow.texture = extra.shadow;
      // L'ombra ha un margine intorno per la sfumatura: l'ancora resta sul piede della figura.
      this.shadow.anchor.set((SHADOW_PAD + texture.width / 2) / extra.shadow.width, (SHADOW_PAD + texture.height) / extra.shadow.height);
    }
    this.shadow.tint = 0x000000;
    this.shadow.alpha = this.shadowAlpha = shade.alpha;
    this.shadowDx = shade.dx;
    this.shadow.position.set(shade.dx, shade.dy);
    this.sprite.texture = texture;
    for (const s of this.outline.children as Sprite[]) {
      s.texture = extra?.silhouette ?? texture;
      if (ring) s.tint = ring;
    }
    this.shadow.visible = extra !== undefined;
    this.sprite.visible = true;
    this.outline.visible = ring !== null;
    this.setFlip(false);
  }

  /** Schiarisce l'ombra (1 = piena): un aereo più è in alto, più la sua ombra è leggera. */
  fadeShadow(k: number): void {
    this.shadow.alpha = this.shadowAlpha * k;
  }

  /** Volta la figura (guarda a destra; `west` = verso sinistra). L'ombra resta in basso a destra. */
  setFlip(west: boolean): void {
    const sx = west ? -this.k : this.k;
    this.sprite.scale.set(sx, this.k);
    this.shadow.scale.set(sx, this.k);
    this.shadow.x = this.shadowDx;
    for (const s of this.outline.children as Sprite[]) s.scale.set(sx, this.k);
  }
}

/** Bordo del cartellino: giallo se selezionata, rosso in battaglia, bianco se è tua, scuro altrimenti. */
export function tagBorder(selected: boolean, fighting: boolean, mine: boolean): { color: string; width: number } {
  if (selected) return { color: "#ffd23f", width: 2.5 };
  if (fighting) return { color: "#e5322d", width: 2.5 };
  return mine ? { color: "#ffffff", width: 1.6 } : { color: "#2b2a26", width: 1 };
}

/** Mette il cartellino a destra della figura, all'altezza del suo centro. */
export function placeTag(tag: UnitTag, figure: Figure): void {
  tag.container.position.set(figure.width / 2 + 1, -figure.height / 2 - tag.height / 2);
}

/** Icone del cartellino (le stesse delle categorie di Produzione). */
export type TagIcon = "infantry" | "armor" | "artillery" | "air" | "navy";

export interface TagRow {
  icon: TagIcon;
  /** null = solo l'icona (il convoglio mercantile). */
  count: number | null;
}

/** Riga del cartellino di ogni unità di terra: dall'edificio che la produce, come le categorie di Produzione. */
export function armyTagRows(units: Unit[]): TagRow[] {
  const icon: Record<string, TagIcon> = { barracks: "infantry", tankFactory: "armor", artilleryFactory: "artillery" };
  const order: TagIcon[] = ["infantry", "armor", "artillery"];
  const count = new Map<TagIcon, number>();
  for (const u of units) {
    const i = icon[UNIT_TYPES[u.type].building] ?? "infantry";
    count.set(i, (count.get(i) ?? 0) + 1);
  }
  return order.filter((i) => count.has(i)).map((i) => ({ icon: i, count: count.get(i)! }));
}

const TAG_ROW_H = 14;
const TAG_W = 34;
const TAG_STRIPE = 3;
const TAG_BAR = 4;
const TAG_INK = "#2b2a26";

/**
 * Cartellino accanto alla figura: una riga per tipo di truppa (icona e numero), a sinistra una striscia col colore
 * della nazione, a destra la salute in verticale (verde, gialla, rossa). Bordo giallo se selezionata, rosso in battaglia,
 * bianco se è tua. Si mette con l'angolo in alto a sinistra sul punto `(x, y)` del contenitore.
 */
export class UnitTag {
  readonly container = new Container();
  private readonly bg = new Graphics();
  private readonly icons: Sprite[] = [];
  private readonly labels: Text[] = [];
  height = 0;

  constructor() {
    this.container.addChild(this.bg);
  }

  draw(rows: TagRow[], color: string, health: number, border: { color: string; width: number }): void {
    const h = Math.max(1, rows.length) * TAG_ROW_H + 2;
    this.height = h;
    const g = this.bg.clear();
    g.roundRect(0, 0, TAG_W, h, 3).fill({ color: "#f4f0e6", alpha: 0.94 }).stroke({ width: border.width, color: border.color });
    g.rect(0.5, 0.5, TAG_STRIPE, h - 1).fill(color);
    const barX = TAG_W - TAG_BAR - 1;
    g.rect(barX, 1.5, TAG_BAR, h - 3).fill("#3b3a36");
    const filled = (h - 3) * Math.max(0, Math.min(1, health));
    g.rect(barX, 1.5 + (h - 3) - filled, TAG_BAR, filled).fill(health > 0.6 ? "#5fbf4a" : health > 0.3 ? "#e8b730" : "#e5322d");
    rows.forEach((row, i) => {
      const cy = 1 + i * TAG_ROW_H + TAG_ROW_H / 2;
      const icon = this.icons[i] ?? this.addIcon();
      const tex = tagIconTexture(row.icon);
      icon.visible = tex !== null;
      if (tex) {
        icon.texture = tex;
        icon.width = icon.height = 11;
      }
      icon.position.set(TAG_STRIPE + 7.5, cy);
      const label = this.labels[i] ?? this.addLabel();
      label.visible = row.count !== null;
      label.text = row.count === null ? "" : String(row.count);
      label.position.set(barX - 2, cy);
      if (i > 0) g.moveTo(TAG_STRIPE + 2, cy - TAG_ROW_H / 2).lineTo(barX - 2, cy - TAG_ROW_H / 2).stroke({ width: 0.6, color: TAG_INK, alpha: 0.25 });
    });
    for (let i = rows.length; i < this.icons.length; i++) this.icons[i]!.visible = false;
    for (let i = rows.length; i < this.labels.length; i++) this.labels[i]!.visible = false;
  }

  private addIcon(): Sprite {
    const s = new Sprite();
    s.anchor.set(0.5);
    this.icons.push(s);
    this.container.addChild(s);
    return s;
  }

  private addLabel(): Text {
    const t = new Text({
      text: "",
      resolution: (window.devicePixelRatio || 1) * 2,
      style: { fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif", fontSize: 10, fontWeight: "700", fill: TAG_INK },
    });
    t.anchor.set(1, 0.5);
    this.labels.push(t);
    this.container.addChild(t);
    return t;
  }
}

// Icone del cartellino: le icone SVG delle categorie (ui/CategoryIcon.tsx) disegnate una volta in una texture.
const tagIcons = new Map<TagIcon, Texture | null>();
let tagIconsLoaded = 0;

/** Quante icone del cartellino sono pronte: va nell'aspetto dei gettoni, così si ridisegnano quando arrivano. */
export function tagIconsReady(): number {
  return tagIconsLoaded;
}

function tagIconTexture(icon: TagIcon): Texture | null {
  const known = tagIcons.get(icon);
  if (known !== undefined) return known;
  tagIcons.set(icon, null);
  const svg = renderToStaticMarkup(createElement(CategoryIcon, { icon }))
    .replace("<svg", `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" color="${TAG_INK}"`);
  const img = new Image();
  img.onload = () => {
    tagIcons.set(icon, Texture.from(img));
    tagIconsLoaded++;
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return null;
}
