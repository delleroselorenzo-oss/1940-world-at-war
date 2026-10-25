import { Container, Graphics, Text } from "pixi.js";
import { squadronPosition, squadronRangeKm, type Squadron } from "@waw/shared";
import type { Camera } from "./camera.js";
import type { LoadedMap } from "./loadMap.js";
import { project } from "./projection.js";

// Squadriglie sulla mappa: un gettone tondo col colore della nazione, la sagoma di un aereo e il numero di aerei.
// A terra sta accanto al centro della base (a destra, per non coprire le armate); in volo scorre lungo la rotta.
// Per la squadriglia selezionata: la rotta fino alla base d'arrivo e, a terra, il cerchio della portata.
// Le dimensioni sono in pixel dello schermo (indipendenti dallo zoom).

const RADIUS = 11;
/** Spostamento a destra del centro della base, per stare accanto alle armate. */
const GROUND_OFFSET_X = 26;
/** Distanza verticale tra più squadriglie nella stessa base. */
const STACK_GAP = 24;
const SELECT_COLOR = "#ffd23f";
const RANGE_COLOR = "#2f6fb0";
const HIT_RADIUS = 14;

interface Badge {
  container: Container;
  bg: Graphics;
  label: Text;
  look: string;
  x: number;
  y: number;
}

export class SquadronLayer {
  readonly container = new Container();
  readonly path = new Graphics();
  private readonly badges = new Map<string, Badge>();
  private squadrons: Squadron[] = [];
  private playerNation: string | null = null;
  private selected: string | null = null;

  constructor(private readonly map: LoadedMap) {
    this.container.sortableChildren = true;
  }

  setSquadrons(squadrons: Squadron[], playerNation: string | null): void {
    this.squadrons = squadrons;
    this.playerNation = playerNation;
    const alive = new Set(squadrons.map((s) => s.id));
    for (const [id, badge] of this.badges) {
      if (alive.has(id)) continue;
      badge.container.destroy({ children: true });
      this.badges.delete(id);
    }
  }

  setSelected(id: string | null): void {
    this.selected = id;
  }

  /** Da chiamare a ogni fotogramma: aggiorna posizioni, rotta e portata. */
  update(cam: Camera, now: number): void {
    const inv = 1 / cam.scale;
    const stacked = new Map<string, number>(); // base -> squadriglie a terra già piazzate lì
    for (const sq of this.squadrons) {
      const badge = this.badgeFor(sq);
      const [x, y] = project(squadronPosition(sq, this.map.data, now));
      let dx = 0;
      let dy = 0;
      if (!sq.flight) {
        const k = stacked.get(sq.base) ?? 0;
        stacked.set(sq.base, k + 1);
        dx = GROUND_OFFSET_X;
        dy = -k * STACK_GAP;
      }
      badge.x = x + dx * inv;
      badge.y = y + dy * inv;
      badge.container.position.set(badge.x, badge.y);
      badge.container.scale.set(inv);
    }
    this.drawSelected(cam, now);
  }

  /** Squadriglia sotto il punto dello schermo (sx, sy), la più vicina. */
  squadronAt(cam: Camera, sx: number, sy: number): string | null {
    let best: string | null = null;
    let bestDist = HIT_RADIUS;
    for (const [id, b] of this.badges) {
      const d = Math.hypot(b.x * cam.scale + cam.x - sx, b.y * cam.scale + cam.y - sy);
      if (d < bestDist) [best, bestDist] = [id, d];
    }
    return best;
  }

  private badgeFor(sq: Squadron): Badge {
    let badge = this.badges.get(sq.id);
    if (!badge) {
      const container = new Container();
      const bg = new Graphics();
      const label = new Text({
        text: "",
        resolution: (window.devicePixelRatio || 1) * 2,
        style: { fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif", fontSize: 10, fontWeight: "700", fill: "#ffffff" },
      });
      label.anchor.set(0.5);
      label.position.set(RADIUS * 0.75, RADIUS * 0.75);
      container.addChild(bg, label);
      this.container.addChild(container);
      badge = { container, bg, label, look: "", x: 0, y: 0 };
      this.badges.set(sq.id, badge);
    }
    const color = this.map.nations.get(sq.owner)?.color ?? "#888888";
    const mine = sq.owner === this.playerNation;
    const selected = sq.id === this.selected;
    const flying = sq.flight !== null;
    const look = `${color}|${mine}|${selected}|${flying}|${sq.aircraft.length}`;
    if (look !== badge.look) {
      badge.look = look;
      const border = selected ? SELECT_COLOR : mine ? "#ffffff" : "#1b1b1b";
      const g = badge.bg.clear();
      g.circle(0, 0, RADIUS)
        .fill(color)
        .stroke({ width: selected ? 3 : mine ? 2 : 1.2, color: border });
      drawPlane(g);
      // Numero di aerei in un cerchietto in basso a destra.
      g.circle(RADIUS * 0.75, RADIUS * 0.75, 6).fill("#1b1b1b");
      badge.label.text = String(sq.aircraft.length);
      badge.container.zIndex = selected ? 3 : flying ? 2 : mine ? 1 : 0;
    }
    return badge;
  }

  /** Squadriglia selezionata: in volo la rotta fino all'arrivo, a terra il cerchio della portata. */
  private drawSelected(cam: Camera, now: number): void {
    const g = this.path.clear();
    const sq = this.squadrons.find((s) => s.id === this.selected);
    if (!sq) return;
    const px = 1 / cam.scale;
    const [x, y] = project(squadronPosition(sq, this.map.data, now));
    if (sq.flight) {
      const [ex, ey] = project(sq.flight.to);
      g.moveTo(x, y)
        .lineTo(ex, ey)
        .stroke({ width: 2.5 * px, color: SELECT_COLOR, alpha: 0.9, cap: "round" });
      g.circle(ex, ey, 6 * px)
        .fill({ color: SELECT_COLOR, alpha: 0.35 })
        .stroke({ width: 2 * px, color: SELECT_COLOR });
      return;
    }
    // Le coordinate proiettate sono in km: il raggio del cerchio è la portata.
    g.circle(x, y, squadronRangeKm(sq))
      .fill({ color: RANGE_COLOR, alpha: 0.06 })
      .stroke({ width: 1.5 * px, color: RANGE_COLOR, alpha: 0.7 });
  }
}

/** Sagoma stilizzata di un aereo visto dall'alto, al centro del gettone. */
function drawPlane(g: Graphics): void {
  g.poly([0, -7, 1.3, -2, 7, 1, 7, 2.5, 1.3, 1.2, 1, 5, 3, 6.5, 3, 7.5, 0, 6.8, -3, 7.5, -3, 6.5, -1, 5, -1.3, 1.2, -7, 2.5, -7, 1, -1.3, -2])
    .fill("#ffffff")
    .stroke({ width: 0.8, color: "#1b1b1b", alpha: 0.6 });
}
