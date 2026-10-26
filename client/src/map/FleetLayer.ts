import { Container, Graphics, Text } from "pixi.js";
import { fleetPosition, isSubmerged, type Fleet } from "@waw/shared";
import type { Camera } from "./camera.js";
import type { LoadedMap } from "./loadMap.js";
import { project } from "./projection.js";

// Flotte sulla mappa: un gettone allungato col colore della nazione, la sagoma di una nave (di un sottomarino se la flotta
// ne ha solo, in immersione col gettone velato; di un mercantile per un trasporto) e il numero di navi (o di unità a bordo).
// Più flotte nello stesso punto (lo stesso porto) si impilano. Per la flotta selezionata: la rotta che resta.
// Le dimensioni sono in pixel dello schermo (indipendenti dallo zoom).

const HALF_W = 15;
const HALF_H = 9;
/** Distanza verticale tra più flotte nello stesso punto. */
const STACK_GAP = 22;
const SELECT_COLOR = "#ffd23f";
const HIT_RADIUS = 16;

interface Badge {
  container: Container;
  bg: Graphics;
  label: Text;
  look: string;
  x: number;
  y: number;
}

export class FleetLayer {
  readonly container = new Container();
  readonly path = new Graphics();
  private readonly badges = new Map<string, Badge>();
  private fleets: Fleet[] = [];
  private playerNation: string | null = null;
  private selected: string | null = null;

  constructor(private readonly map: LoadedMap) {
    this.container.sortableChildren = true;
  }

  setFleets(fleets: Fleet[], playerNation: string | null): void {
    this.fleets = fleets;
    this.playerNation = playerNation;
    const alive = new Set(fleets.map((f) => f.id));
    for (const [id, badge] of this.badges) {
      if (alive.has(id)) continue;
      badge.container.destroy({ children: true });
      this.badges.delete(id);
    }
  }

  setSelected(id: string | null): void {
    this.selected = id;
  }

  /** Da chiamare a ogni fotogramma: aggiorna posizioni e rotta. */
  update(cam: Camera, now: number): void {
    const inv = 1 / cam.scale;
    const stacked = new Map<string, number>(); // punto -> flotte già piazzate lì
    for (const fleet of this.fleets) {
      const badge = this.badgeFor(fleet);
      const at = fleetPosition(fleet, now);
      const [x, y] = project(at);
      const key = fleet.voyage ? fleet.id : `${at[0].toFixed(3)},${at[1].toFixed(3)}`;
      const k = stacked.get(key) ?? 0;
      stacked.set(key, k + 1);
      badge.x = x;
      badge.y = y - k * STACK_GAP * inv;
      badge.container.position.set(badge.x, badge.y);
      badge.container.scale.set(inv);
    }
    this.drawSelected(cam, now);
  }

  /** Flotta sotto il punto dello schermo (sx, sy), la più vicina. */
  fleetAt(cam: Camera, sx: number, sy: number): string | null {
    let best: string | null = null;
    let bestDist = HIT_RADIUS;
    for (const [id, b] of this.badges) {
      const d = Math.hypot(b.x * cam.scale + cam.x - sx, b.y * cam.scale + cam.y - sy);
      if (d < bestDist) [best, bestDist] = [id, d];
    }
    return best;
  }

  private badgeFor(fleet: Fleet): Badge {
    let badge = this.badges.get(fleet.id);
    if (!badge) {
      const container = new Container();
      const bg = new Graphics();
      const label = new Text({
        text: "",
        resolution: (window.devicePixelRatio || 1) * 2,
        style: { fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif", fontSize: 10, fontWeight: "700", fill: "#ffffff" },
      });
      label.anchor.set(0.5);
      label.position.set(HALF_W, HALF_H * 0.8);
      container.addChild(bg, label);
      this.container.addChild(container);
      badge = { container, bg, label, look: "", x: 0, y: 0 };
      this.badges.set(fleet.id, badge);
    }
    const color = this.map.nations.get(fleet.owner)?.color ?? "#888888";
    const mine = fleet.owner === this.playerNation;
    const selected = fleet.id === this.selected;
    const sailing = fleet.voyage !== null;
    const cargo = fleet.transport?.army.units.length;
    const subs = !cargo && fleet.ships.every((s) => s.type === "submarine");
    const submerged = isSubmerged(fleet);
    const look = `${color}|${mine}|${selected}|${sailing}|${fleet.ships.length}|${subs}|${submerged}|${cargo}`;
    if (look !== badge.look) {
      badge.look = look;
      const border = selected ? SELECT_COLOR : mine ? "#ffffff" : "#1b1b1b";
      const g = badge.bg.clear();
      g.roundRect(-HALF_W, -HALF_H, HALF_W * 2, HALF_H * 2, HALF_H)
        .fill(color)
        .stroke({ width: selected ? 3 : mine ? 2 : 1.2, color: border });
      if (cargo) drawTransport(g);
      else if (subs) drawSubmarine(g);
      else drawShip(g);
      badge.container.alpha = submerged ? 0.7 : 1;
      // Numero di navi in un cerchietto in basso a destra.
      g.circle(HALF_W, HALF_H * 0.8, 6).fill("#1b1b1b");
      // Per un trasporto: le unità a bordo.
      badge.label.text = String(cargo ?? fleet.ships.length);
      badge.container.zIndex = selected ? 3 : sailing ? 2 : mine ? 1 : 0;
    }
    return badge;
  }

  /** Flotta selezionata in navigazione: la rotta che resta, fino all'arrivo. */
  private drawSelected(cam: Camera, now: number): void {
    const g = this.path.clear();
    const fleet = this.fleets.find((f) => f.id === this.selected);
    if (!fleet?.voyage) return;
    const px = 1 / cam.scale;
    const v = fleet.voyage;
    let i = 1;
    while (i < v.times.length - 1 && v.times[i]! <= now) i++;
    const [x, y] = project(fleetPosition(fleet, now));
    g.moveTo(x, y);
    for (let k = i; k < v.points.length; k++) {
      const [px2, py2] = project(v.points[k]!);
      g.lineTo(px2, py2);
    }
    g.stroke({ width: 2.5 * px, color: SELECT_COLOR, alpha: 0.9, cap: "round", join: "round" });
    const [ex, ey] = project(v.points[v.points.length - 1]!);
    g.circle(ex, ey, 6 * px)
      .fill({ color: SELECT_COLOR, alpha: 0.35 })
      .stroke({ width: 2 * px, color: SELECT_COLOR });
  }
}

/** Sagoma stilizzata di una nave vista di fianco: scafo, ponte e fumaiolo. */
function drawShip(g: Graphics): void {
  g.poly([-10, 1, 10, 1, 7, 5, -8, 5])
    .fill("#ffffff")
    .stroke({ width: 0.8, color: "#1b1b1b", alpha: 0.6 });
  g.rect(-4, -3, 8, 4).fill("#ffffff").stroke({ width: 0.8, color: "#1b1b1b", alpha: 0.6 });
  g.rect(-1, -6, 2.5, 3).fill("#ffffff").stroke({ width: 0.8, color: "#1b1b1b", alpha: 0.6 });
}

/** Sagoma stilizzata di un sottomarino: scafo basso e torretta. */
function drawSubmarine(g: Graphics): void {
  g.roundRect(-10, 0, 20, 4.5, 2.2).fill("#ffffff").stroke({ width: 0.8, color: "#1b1b1b", alpha: 0.6 });
  g.rect(-2.5, -3.5, 5, 4).fill("#ffffff").stroke({ width: 0.8, color: "#1b1b1b", alpha: 0.6 });
  g.rect(-0.5, -6, 1, 2.5).fill("#ffffff");
}

/** Sagoma stilizzata di un mercantile: scafo lungo con il carico a cassoni. */
function drawTransport(g: Graphics): void {
  g.poly([-10, 1, 10, 1, 8, 5, -9, 5]).fill("#ffffff").stroke({ width: 0.8, color: "#1b1b1b", alpha: 0.6 });
  g.rect(-7, -2.5, 4, 3.5).fill("#ffffff").stroke({ width: 0.8, color: "#1b1b1b", alpha: 0.6 });
  g.rect(-2.5, -2.5, 4, 3.5).fill("#ffffff").stroke({ width: 0.8, color: "#1b1b1b", alpha: 0.6 });
  g.rect(4, -5, 3, 6).fill("#ffffff").stroke({ width: 0.8, color: "#1b1b1b", alpha: 0.6 });
}
