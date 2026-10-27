import { Container, Graphics, Text } from "pixi.js";
import { armyHealth, fleetHealth, fleetPosition, isSubmerged, type Fleet } from "@waw/shared";
import type { Camera } from "./camera.js";
import type { LoadedMap } from "./loadMap.js";
import { project } from "./projection.js";
import { armyTagRows, Figure, leadShip, placeTag, tagBorder, tagIconsReady, tokenScale, tokenTexture, tokenUrl, UnitTag, type TagRow } from "./tokens.js";

// Flotte sulla mappa: una pedina dipinta (la nave più grande della flotta; il trasporto truppe o il convoglio
// mercantile, uguali per tutti) con la sua stazza e l'ombra morbida, voltata nel senso di navigazione, e accanto il
// cartellino (navi, o truppe a bordo di un trasporto; salute; colore della nazione). Senza la figura, un gettone allungato
// con la sagoma di una nave (di un sottomarino se la flotta ne ha solo; di un mercantile per un trasporto).
// In immersione la pedina è velata.
// Più flotte nello stesso punto (lo stesso porto) si impilano. Per la flotta selezionata: la rotta che resta.
// Le dimensioni sono in pixel dello schermo (indipendenti dallo zoom).

const HALF_W = 15;
const HALF_H = 9;
/** Distanza verticale tra più flotte nello stesso punto. */
const STACK_GAP = 46;
const SELECT_COLOR = "#ffd23f";
const HIT_RADIUS = 16;

interface Badge {
  container: Container;
  bg: Graphics;
  /** Cartellino accanto alla figura: navi (o truppe a bordo), numeri, salute. */
  tag: UnitTag;
  label: Text;
  fig: Figure;
  hitDy: number;
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
  private size = 1;

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
  update(cam: Camera, now: number, zoom: number): void {
    const size = tokenScale(zoom);
    this.size = size;
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
      badge.y = y - k * STACK_GAP * size * inv;
      badge.container.position.set(badge.x, badge.y);
      badge.container.scale.set(inv * size);
      badge.fig.setFlip(sailingWest(fleet, x, now));
    }
    this.drawSelected(cam, now);
  }

  /** Flotta sotto il punto dello schermo (sx, sy), la più vicina. */
  fleetAt(cam: Camera, sx: number, sy: number): string | null {
    let best: string | null = null;
    let bestDist = HIT_RADIUS * this.size;
    for (const [id, b] of this.badges) {
      const d = Math.hypot(b.x * cam.scale + cam.x - sx, b.y * cam.scale + cam.y + b.hitDy * this.size - sy);
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
      const fig = new Figure();
      const tag = new UnitTag();
      container.addChild(fig.shadow, bg, fig.outline, fig.sprite, tag.container, label);
      this.container.addChild(container);
      badge = { container, bg, tag, label, fig, hitDy: 0, look: "", x: 0, y: 0 };
      this.badges.set(fleet.id, badge);
    }
    const color = this.map.nations.get(fleet.owner)?.color ?? "#888888";
    const mine = fleet.owner === this.playerNation;
    const selected = fleet.id === this.selected;
    const sailing = fleet.voyage !== null;
    const cargo = fleet.transport?.army.units.length;
    const convoy = fleet.convoy !== undefined;
    const subs = !cargo && !convoy && fleet.ships.every((s) => s.type === "submarine");
    const submerged = isSubmerged(fleet);
    const lead = convoy ? "convoy" : fleet.transport ? "transport" : leadShip(fleet.ships);
    const texture = lead ? tokenTexture(tokenUrl(fleet.owner, lead)) : null;
    // Cartellino: le truppe a bordo di un trasporto, le navi di una flotta, solo l'icona per il convoglio.
    const rows: TagRow[] = fleet.transport ? armyTagRows(fleet.transport.army.units) : [{ icon: "navy", count: convoy ? null : fleet.ships.length }];
    const health = Math.round((fleet.transport ? armyHealth(fleet.transport.army) : fleetHealth(fleet)) * 20) / 20;
    const rowsKey = rows.map((r) => `${r.icon}${r.count}`).join();
    const look = `${color}|${mine}|${selected}|${sailing}|${rowsKey}|${health}|${subs}|${submerged}|${cargo}|${convoy}|${lead}|${texture !== null}|${tagIconsReady()}`;
    if (look !== badge.look) {
      badge.look = look;
      const g = badge.bg.clear();
      if (texture) {
        badge.fig.show(texture, lead!, "sea", selected ? SELECT_COLOR : null);
        badge.tag.draw(rows, color, health, tagBorder(selected, false, mine));
        placeTag(badge.tag, badge.fig);
        badge.tag.container.visible = true;
        badge.label.visible = false;
        badge.hitDy = -badge.fig.height / 2;
      } else {
        const border = selected ? SELECT_COLOR : mine ? "#ffffff" : "#1b1b1b";
        g.roundRect(-HALF_W, -HALF_H, HALF_W * 2, HALF_H * 2, HALF_H)
          .fill(color)
          .stroke({ width: selected ? 3 : mine ? 2 : 1.2, color: border });
        if (cargo) drawTransport(g);
        else if (convoy) drawConvoy(g);
        else if (subs) drawSubmarine(g);
        else drawShip(g);
        badge.fig.hide();
        badge.tag.container.visible = false;
        badge.label.visible = true;
        badge.hitDy = 0;
        // Numero di navi in un cerchietto in basso a destra (per un trasporto: le unità a bordo; il convoglio non ne ha).
        if (!convoy) g.circle(HALF_W, HALF_H * 0.8, 6).fill("#1b1b1b");
        badge.label.position.set(HALF_W, HALF_H * 0.8);
      }
      badge.container.alpha = submerged ? 0.7 : 1;
      badge.label.text = convoy ? "" : String(cargo ?? fleet.ships.length);
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

/** Convoglio: due piccoli mercantili in fila. */
function drawConvoy(g: Graphics): void {
  for (const [dx, dy] of [[-5, -2.5], [4, 2]] as const) {
    g.poly([dx - 5, dy, dx + 5, dy, dx + 4, dy + 3, dx - 4.5, dy + 3]).fill("#ffffff").stroke({ width: 0.7, color: "#1b1b1b", alpha: 0.6 });
    g.rect(dx - 3, dy - 2.5, 3.5, 2.5).fill("#ffffff").stroke({ width: 0.7, color: "#1b1b1b", alpha: 0.6 });
  }
}

/** Sagoma stilizzata di un mercantile: scafo lungo con il carico a cassoni. */
function drawTransport(g: Graphics): void {
  g.poly([-10, 1, 10, 1, 8, 5, -9, 5]).fill("#ffffff").stroke({ width: 0.8, color: "#1b1b1b", alpha: 0.6 });
  g.rect(-7, -2.5, 4, 3.5).fill("#ffffff").stroke({ width: 0.8, color: "#1b1b1b", alpha: 0.6 });
  g.rect(-2.5, -2.5, 4, 3.5).fill("#ffffff").stroke({ width: 0.8, color: "#1b1b1b", alpha: 0.6 });
  g.rect(4, -5, 3, 6).fill("#ffffff").stroke({ width: 0.8, color: "#1b1b1b", alpha: 0.6 });
}

/** La flotta naviga verso ovest (la figura, con la prua a destra, va voltata)? */
function sailingWest(fleet: Fleet, x: number, now: number): boolean {
  const v = fleet.voyage;
  if (!v) return false;
  const i = v.times.findIndex((t) => t > now);
  if (i < 0) return false;
  return project(v.points[i]!)[0] < x - 1e-6;
}
