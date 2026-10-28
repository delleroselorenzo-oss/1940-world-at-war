import { Container, Graphics } from "pixi.js";
import { TERRAIN_RULES } from "@waw/shared";
import type { LoadedMap } from "./loadMap.js";
import { project } from "./projection.js";

// Città sulla mappa: contano per la vittoria, quindi si devono notare.
//  - Stemma: un medaglione chiaro con l'anello del colore di chi la possiede e la sagoma di tre palazzi (capitali: anello
//    dorato e stella). Ha una misura fissa in pixel e cambia colore quando la città cambia padrone.
//  - Abitato: da vicino, gli isolati del centro abitato, in km come le province. È solo grafica: almeno grande quanto la
//    zona di città del gioco (`cityRadiusKm`), di più nelle province più popolose, sennò sparirebbe sotto lo stemma.
//    Gli isolati sono sempre gli stessi per ogni città (generati dal suo id), così non cambiano a ogni ridisegno.

const GOLD = "#ffd23f";
const INK = "#1b1b1b";
/** Fondo chiaro dello stemma, lo stesso dei cartellini delle pedine. */
const PAPER = "#f4f0e6";
/** Raggio dello stemma in pixel. */
const EMBLEM_R = 8;
const CAPITAL_R = 9;
/** Sotto questa scala (pixel per km, mappa intera) lo stemma è più piccolo e senza palazzi. */
const SMALL_SCALE = 0.3;
/** L'abitato compare tra queste scale (sfumando): da lontano sarebbe solo una macchia. */
const BLOCKS_FROM = 0.6;
const BLOCKS_FULL = 1.1;
/** Isolati: passo della griglia delle strade e lato di un isolato, in km. */
const BLOCK_STEP = 2;
const BLOCK_SIZE = 1.4;
/** Raggio massimo dell'abitato disegnato, in km. */
const MAX_TOWN_KM = 22;
const BLOCK_COLOR = "#4a3d33";

interface City {
  id: string;
  capital: boolean;
  emblem: Graphics;
  /** Colore e misura con cui è disegnato lo stemma (per ridisegnarlo solo quando cambiano). */
  look: string;
}

/** Spazio libero in pixel sopra il centro di una città: lì una pedina ferma in città appoggia i piedi, senza coprire lo stemma. */
export function cityClearance(capital: boolean): number {
  return capital ? CAPITAL_R + 3 + 11 : EMBLEM_R + 3 + 2;
}

export class CityLayer {
  /** Isolati, nello spazio della mappa (km): vanno sopra i colori delle province e sotto confini ed etichette. */
  readonly blocks = new Graphics();
  /** Stemmi, a misura fissa sullo schermo. */
  readonly emblems = new Container();
  private readonly cities: City[] = [];
  private owners: Record<string, string> = {};
  private small = false;

  constructor(private readonly map: LoadedMap) {
    for (const p of map.data.provinces) {
      if (!p.isCapital && p.type !== "urban") continue;
      const [x, y] = project(p.center);
      const emblem = new Graphics();
      emblem.position.set(x, y);
      this.emblems.addChild(emblem);
      this.cities.push({ id: p.id, capital: p.isCapital, emblem, look: "" });
      drawBlocks(this.blocks, x, y, p.id, p.isCapital, townRadius(p.population));
    }
    this.blocks.visible = false;
    this.redraw();
  }

  setOwners(owners: Record<string, string>): void {
    this.owners = owners;
    this.redraw();
  }

  update(scale: number): void {
    for (const c of this.cities) c.emblem.scale.set(1 / scale);
    const small = scale < SMALL_SCALE;
    if (small !== this.small) {
      this.small = small;
      this.redraw();
    }
    const t = (scale - BLOCKS_FROM) / (BLOCKS_FULL - BLOCKS_FROM);
    this.blocks.visible = t > 0;
    this.blocks.alpha = Math.min(1, Math.max(0, t));
  }

  private colorOf(id: string): string {
    const owner = this.owners[id] ?? this.map.provinces.get(id)?.nation;
    return (owner && this.map.nations.get(owner)?.color) ?? "#cccccc";
  }

  private redraw(): void {
    for (const c of this.cities) {
      const color = this.colorOf(c.id);
      const look = `${color}|${this.small}`;
      if (look === c.look) continue;
      c.look = look;
      drawEmblem(c.emblem.clear(), color, c.capital, this.small);
    }
  }
}

/** Medaglione chiaro con l'anello del colore del padrone e la sagoma scura dei palazzi; capitali con un anello dorato in più e la stella sopra. */
function drawEmblem(g: Graphics, color: string, capital: boolean, small: boolean): void {
  const r = (capital ? CAPITAL_R : EMBLEM_R) * (small ? 0.6 : 1);
  const ring = small ? 2 : 3;
  // Alone scuro morbido: stacca lo stemma da qualsiasi colore di provincia.
  g.circle(0, 1, r + ring + 3).fill({ color: INK, alpha: 0.18 });
  if (capital) g.circle(0, 0, r + ring + 1.6).fill(GOLD).stroke({ width: 1, color: INK });
  g.circle(0, 0, r + ring).fill(color).stroke({ width: 1, color: INK });
  g.circle(0, 0, r).fill(PAPER).stroke({ width: 0.8, color: INK, alpha: 0.6 });
  if (small) {
    if (capital) g.star(0, 0, 5, r * 0.75, r * 0.32).fill(GOLD).stroke({ width: 0.8, color: INK });
    else g.circle(0, 0, r * 0.35).fill(INK);
    return;
  }
  // Tre palazzi di altezze diverse sulla stessa linea di terra.
  const s = r / 8;
  const ground = 3.8 * s;
  const houses: [number, number, number][] = [
    [-5, 3, 5],
    [-1.7, 3.4, 8.4],
    [2, 3, 6.4],
  ];
  for (const [x, w, h] of houses) g.rect(x * s, ground - h * s, w * s, h * s);
  g.fill(INK);
  // Finestre chiare.
  for (const [x, w, h] of houses)
    for (let wy = ground - h * s + 1.3 * s; wy < ground - 1.4 * s; wy += 2 * s) g.rect(x * s + w * s * 0.3, wy, w * s * 0.4, 0.9 * s);
  g.fill(PAPER);
  if (capital) g.star(0, -r - ring - 4, 5, 5, 2.2).fill(GOLD).stroke({ width: 1, color: INK });
}

/** Isolati di una città su una griglia di strade un po' ruotata: fitti al centro, radi verso il bordo della zona di città. */
function drawBlocks(g: Graphics, cx: number, cy: number, id: string, capital: boolean, radius: number): void {
  const rand = mulberry32(hash(id));
  const angle = rand() * Math.PI;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const n = Math.ceil(radius / BLOCK_STEP);
  // Il centro storico occupa una parte della zona di città; le capitali sono più grandi.
  const core = radius * (capital ? 0.55 : 0.4);
  for (let i = -n; i <= n; i++)
    for (let j = -n; j <= n; j++) {
      const u = i * BLOCK_STEP;
      const v = j * BLOCK_STEP;
      const d = Math.hypot(u, v);
      if (d > radius) continue;
      // Probabilità che ci sia un isolato: piena nel centro, poi cala fino al bordo (i sobborghi).
      const p = d <= core ? 0.95 : 0.75 * (1 - (d - core) / (radius - core)) ** 1.6;
      if (rand() > p) continue;
      // Isolati di misure un po' diverse, qualche volta allungati.
      const w = BLOCK_SIZE * (0.7 + rand() * 0.45) * (rand() < 0.25 ? 1.6 : 1);
      const h = BLOCK_SIZE * (0.7 + rand() * 0.45);
      const corners: number[] = [];
      for (const [a, b] of [
        [-w / 2, -h / 2],
        [w / 2, -h / 2],
        [w / 2, h / 2],
        [-w / 2, h / 2],
      ] as const) {
        const x = u + a;
        const y = v + b;
        corners.push(cx + x * cos - y * sin, cy + x * sin + y * cos);
      }
      g.poly(corners);
    }
  g.fill({ color: BLOCK_COLOR, alpha: 0.5 });
}

/** Raggio dell'abitato disegnato, dalla popolazione della provincia (migliaia di abitanti). */
function townRadius(population: number): number {
  return Math.min(MAX_TOWN_KM, TERRAIN_RULES.cityRadiusKm + 4 * Math.sqrt(population / 1000));
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Numeri pseudo-casuali ripetibili da un seme (solo grafica). */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
