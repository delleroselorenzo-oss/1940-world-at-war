import { Assets, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CategoryIcon } from "../ui/CategoryIcon.js";
import { AIRCRAFT_TYPES, SHIP_TYPES, UNIT_TYPES, doctrineOf, type Aircraft, type Ship, type ShipTypeId, type Unit, type UnitTypeId } from "@waw/shared";

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

/** Ingrandimento delle pedine con lo zoom della mappa (`zoom` = 1 con l'Europa intera): più grandi da vicino (fino al doppio), per vedere i dettagli; 0,8 appena le figure prendono il posto dei segnalini (`COMPACT_ZOOM`). */
export function tokenScale(zoom: number): number {
  return Math.min(2, Math.max(0.8, 0.8 + 0.4 * Math.log2(Math.max(zoom, 1e-3) / COMPACT_ZOOM)));
}

/** Dove sta la figura: un aereo in volo ha l'ombra a terra, lontana da lui. */
export type FigureKind = "land" | "sea" | "air";

/** Direzioni delle copie colorate che fanno il contorno della sagoma. */
const OUTLINE_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]] as const;
const OUTLINE_PX = 1.8;
/** Ombra morbida (luce da sinistra in alto, come nelle figure): opacità e spostamento in pixel dello schermo. */
const SHADOWS: Record<FigureKind, { alpha: number; dx: number; dy: number }> = {
  land: { alpha: 0.6, dx: 4, dy: 2 },
  sea: { alpha: 0.45, dx: 4, dy: 3 },
  air: { alpha: 0.4, dx: 4, dy: 5 },
};
/**
 * Figure in piedi (soldati visti di lato): l'ombra non è una copia spostata ma è proiettata sul terreno, schiacciata e
 * inclinata, che parte dai piedi e si allunga verso destra in basso. I mezzi, visti più dall'alto, hanno l'ombra spostata.
 */
const STANDING = new Set(["infantry", "engineer", "medic"]);
/** Ombra proiettata: quanto è schiacciata e quanto pende (radianti). */
const CAST_FLATTEN = 0.42;
const CAST_SKEW = 0.85;

/** Macchia sfumata per l'ombra di contatto (bianca, si colora con `tint`). */
let contactTexture: Texture | null = null;
function contactBlob(): Texture {
  if (contactTexture) return contactTexture;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.45, "rgba(255,255,255,0.6)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  contactTexture = Texture.from(canvas);
  return contactTexture;
}

/**
 * Figura dipinta senza basetta: niente si mette tra la figura e la mappa. Ha la sua ombra (`shadow`, sotto tutto; per un
 * aereo in volo resta a terra mentre la figura si alza), il contorno della sagoma per la selezione o la battaglia
 * (`outline`) e la figura (`sprite`). L'ombra è fatta di due parti: la sagoma sfumata (`cast`: proiettata sul terreno per
 * i soldati, spostata per mezzi, navi e aerei) e, per chi sta a terra, una piccola ombra di contatto sfumata proprio sotto
 * i piedi o le ruote (`contact`), che fa sembrare la figura appoggiata.
 * Il punto della pedina è dove la figura poggia: i piedi, le ruote, la linea di galleggiamento.
 */
export class Figure {
  readonly shadow = new Container();
  readonly outline = new Container();
  readonly sprite = new Sprite();
  width = 0;
  height = 0;
  private readonly cast = new Sprite();
  private readonly contact = new Sprite();
  private k = 1;
  private shadowAlpha = 0;
  private standing = false;

  constructor() {
    this.sprite.anchor.set(0.5, 1);
    this.contact.anchor.set(0.5);
    this.contact.tint = 0x000000;
    this.cast.tint = 0x000000;
    this.shadow.addChild(this.cast, this.contact);
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
    this.standing = kind === "land" && STANDING.has(id);
    const extra = figureExtras.get(texture);
    const shade = SHADOWS[kind];
    if (extra) {
      this.cast.texture = extra.shadow;
      // L'ombra ha un margine intorno per la sfumatura: l'ancora resta sul piede della figura.
      this.cast.anchor.set((SHADOW_PAD + texture.width / 2) / extra.shadow.width, (SHADOW_PAD + texture.height) / extra.shadow.height);
    }
    this.cast.visible = extra !== undefined;
    this.cast.alpha = this.standing ? 0.8 : 1;
    this.cast.position.set(this.standing ? 1 : shade.dx, this.standing ? 0 : shade.dy);
    // Ombra di contatto: stretta e sfumata, solo per chi poggia a terra.
    this.contact.visible = kind === "land";
    this.contact.texture = contactBlob();
    this.contact.width = this.width * (this.standing ? 0.55 : 0.85);
    this.contact.height = Math.max(4, this.height * (this.standing ? 0.12 : 0.22));
    this.contact.position.set(1, this.standing ? 0 : -this.height * 0.08);
    this.contact.alpha = 0.9;
    this.shadow.alpha = this.shadowAlpha = shade.alpha;
    this.sprite.texture = texture;
    for (const s of this.outline.children as Sprite[]) {
      s.texture = extra?.silhouette ?? texture;
      if (ring) s.tint = ring;
    }
    this.shadow.visible = true;
    this.sprite.visible = true;
    this.outline.visible = ring !== null;
    this.setFlip(false);
  }

  /** Schiarisce l'ombra (1 = piena): un aereo più è in alto, più la sua ombra è leggera. */
  fadeShadow(k: number): void {
    this.shadow.alpha = this.shadowAlpha * k;
  }

  /** Volta la figura (guarda a destra; `west` = verso sinistra). L'ombra cade sempre in basso a destra. */
  setFlip(west: boolean): void {
    const sx = west ? -this.k : this.k;
    this.sprite.scale.set(sx, this.k);
    for (const s of this.outline.children as Sprite[]) s.scale.set(sx, this.k);
    if (this.standing) {
      // Ribaltata in basso, schiacciata e inclinata: la sagoma stesa per terra davanti ai piedi.
      this.cast.scale.set(sx, -this.k * CAST_FLATTEN);
      this.cast.skew.set(CAST_SKEW, 0);
    } else {
      this.cast.scale.set(sx, this.k);
      this.cast.skew.set(0, 0);
    }
  }
}

/**
 * Segnaposto: un pallino col colore della nazione (bordo bianco se è tua) sul punto esatto dove si trova l'unità,
 * collegato da una linea sottile alla pedina, che sta scostata per non coprire la città o per non coprire le altre.
 * Coordinate nel gettone: la pedina poggia in (0, 0), il segnaposto in (x, y).
 */
export class Pin {
  readonly graphics = new Graphics();
  private key = "";

  set(x: number, y: number, color: string, mine: boolean): void {
    const key = `${x.toFixed(1)}|${y.toFixed(1)}|${color}|${mine}`;
    if (key === this.key) return;
    this.key = key;
    const g = this.graphics.clear();
    if (Math.hypot(x, y) < 3) return;
    g.moveTo(0, 0).lineTo(x, y).stroke({ width: 3, color: "#1b1b1b", alpha: 0.35, cap: "round" });
    g.moveTo(0, 0).lineTo(x, y).stroke({ width: 1.4, color: "#ffffff", alpha: 0.95, cap: "round" });
    g.circle(x, y, 3.6).fill(color).stroke({ width: 1.4, color: mine ? "#ffffff" : "#1b1b1b" });
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

/**
 * Sotto questo zoom (1 = Europa intera) le pedine diventano segnalini piccoli: vista da lontano la mappa resta leggibile,
 * senza figure giganti sopra intere nazioni. Avvicinandosi tornano figura e cartellino.
 */
export const COMPACT_ZOOM = 2.5;

const MARKER_R = 9;

/**
 * Segnalino della mappa vista da lontano: un rombo chiaro col bordo del colore della nazione (giallo se selezionata,
 * rosso in battaglia), l'icona del tipo principale e il numero in una linguetta scura in basso a destra.
 */
export class CompactMarker {
  readonly container = new Container();
  private readonly bg = new Graphics();
  private readonly icon = new Sprite();
  private readonly label = new Text({
    text: "",
    resolution: (window.devicePixelRatio || 1) * 2,
    style: { fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif", fontSize: 8, fontWeight: "700", fill: "#ffffff" },
  });

  constructor() {
    this.icon.anchor.set(0.5);
    this.label.anchor.set(0.5);
    this.label.position.set(MARKER_R * 0.75, MARKER_R * 0.75);
    this.container.addChild(this.bg, this.icon, this.label);
  }

  draw(icon: TagIcon, count: number | null, color: string, ring: string | null): void {
    const r = MARKER_R;
    const g = this.bg.clear();
    g.poly([0, -r - 1.5, r + 1.5, 0, 0, r + 1.5, -r - 1.5, 0]).fill({ color: "#000000", alpha: 0.25 });
    g.poly([0, -r, r, 0, 0, r, -r, 0])
      .fill("#f4f0e6")
      .stroke({ width: ring ? 2.6 : 2, color: ring ?? color, join: "round" });
    const tex = tagIconTexture(icon);
    this.icon.visible = tex !== null;
    if (tex) {
      this.icon.texture = tex;
      this.icon.width = this.icon.height = 10;
    }
    this.label.visible = count !== null;
    if (count !== null) {
      this.label.text = String(count);
      const w = Math.max(9, 4 + 5 * String(count).length);
      g.roundRect(r * 0.75 - w / 2, r * 0.75 - 4.5, w, 9, 3).fill("#2b2a26");
    }
  }
}

/** Icone del cartellino (le stesse delle categorie di Produzione). */
export type TagIcon = "infantry" | "armor" | "artillery" | "air" | "navy";

export interface TagRow {
  icon: TagIcon;
  /** null = solo l'icona (il convoglio mercantile). */
  count: number | null;
}

const BUILDING_ICONS: Record<string, TagIcon> = { barracks: "infantry", tankFactory: "armor", artilleryFactory: "artillery" };

/** Icona di un'unità di terra: dall'edificio che la produce, come le categorie di Produzione. */
export function unitTagIcon(type: UnitTypeId): TagIcon {
  return BUILDING_ICONS[UNIT_TYPES[type].building] ?? "infantry";
}

/** Righe del cartellino di un'armata: una per tipo di truppa (fanteria, corazzati, artiglieria). */
export function armyTagRows(units: Unit[]): TagRow[] {
  const order: TagIcon[] = ["infantry", "armor", "artillery"];
  const count = new Map<TagIcon, number>();
  for (const u of units) {
    const i = unitTagIcon(u.type);
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
