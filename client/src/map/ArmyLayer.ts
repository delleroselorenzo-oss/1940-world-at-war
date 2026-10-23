import { Container, Graphics, Text } from "pixi.js";
import { armyHealth, armyPosition, type Army } from "@waw/shared";
import type { Camera } from "./camera.js";
import type { LoadedMap } from "./loadMap.js";
import { project } from "./projection.js";

// Armate sulla mappa: un "gettone" col colore della nazione e il numero di unità,
// che scorre lungo il percorso mentre l'armata marcia. Sotto, la barra della salute;
// il bordo rosso indica che è in combattimento. Le dimensioni sono in pixel
// dello schermo (indipendenti dallo zoom).

const BADGE_W = 28;
const BADGE_H = 18;
/** Spostamento verso l'alto rispetto al centro della provincia, per non coprire la città. */
const BADGE_OFFSET_Y = -16;
/** Distanza verticale tra più armate ferme nello stesso punto. */
const STACK_GAP = 26;
const SELECT_COLOR = "#ffd23f";
const COMBAT_COLOR = "#e5322d";
const HEALTH_H = 3;
const HIT_RADIUS = 16;

interface Badge {
  container: Container;
  bg: Graphics;
  label: Text;
  /** Aspetto disegnato l'ultima volta, per ridisegnare solo quando cambia. */
  look: string;
  /** Posizione nel mondo (km) all'ultimo aggiornamento. */
  x: number;
  y: number;
}

export class ArmyLayer {
  readonly container = new Container();
  readonly path = new Graphics();
  private readonly badges = new Map<string, Badge>();
  private armies: Army[] = [];
  private playerNation: string | null = null;
  private engaged: ReadonlySet<string> = new Set();
  private selected: string | null = null;

  constructor(private readonly map: LoadedMap) {}

  setArmies(armies: Army[], playerNation: string | null, engaged: ReadonlySet<string>): void {
    this.armies = armies;
    this.playerNation = playerNation;
    this.engaged = engaged;
    const alive = new Set(armies.map((a) => a.id));
    for (const [id, badge] of this.badges) {
      if (alive.has(id)) continue;
      badge.container.destroy({ children: true });
      this.badges.delete(id);
    }
  }

  setSelected(id: string | null): void {
    this.selected = id;
  }

  /** Da chiamare a ogni fotogramma: aggiorna posizioni e percorso. */
  update(cam: Camera, now: number): void {
    const inv = 1 / cam.scale;
    const stacked = new Map<string, number>(); // punto -> armate ferme già piazzate lì
    for (const army of this.armies) {
      const badge = this.badgeFor(army);
      const [x, y] = project(armyPosition(army, now));
      let offset = BADGE_OFFSET_Y;
      if (!army.move) {
        const key = `${army.position[0].toFixed(2)},${army.position[1].toFixed(2)}`;
        const k = stacked.get(key) ?? 0;
        stacked.set(key, k + 1);
        offset -= k * STACK_GAP;
      }
      badge.x = x;
      badge.y = y + offset * inv;
      badge.container.position.set(badge.x, badge.y);
      badge.container.scale.set(inv);
    }
    this.drawPath(cam, now);
  }

  /** Armata sotto il punto dello schermo (sx, sy), la più vicina. */
  armyAt(cam: Camera, sx: number, sy: number): string | null {
    let best: string | null = null;
    let bestDist = HIT_RADIUS;
    for (const [id, b] of this.badges) {
      const d = Math.hypot(b.x * cam.scale + cam.x - sx, b.y * cam.scale + cam.y - sy);
      if (d < bestDist) [best, bestDist] = [id, d];
    }
    return best;
  }

  private badgeFor(army: Army): Badge {
    let badge = this.badges.get(army.id);
    if (!badge) {
      const container = new Container();
      const bg = new Graphics();
      const label = new Text({
        text: "",
        resolution: (window.devicePixelRatio || 1) * 2,
        style: { fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif", fontSize: 12, fontWeight: "700", fill: "#ffffff" },
      });
      label.anchor.set(0.5);
      container.addChild(bg, label);
      this.container.addChild(container);
      badge = { container, bg, label, look: "", x: 0, y: 0 };
      this.badges.set(army.id, badge);
    }
    const color = this.map.nations.get(army.owner)?.color ?? "#888888";
    const mine = army.owner === this.playerNation;
    const selected = army.id === this.selected;
    const fighting = this.engaged.has(army.id);
    const health = Math.round(armyHealth(army) * 20) / 20;
    const look = `${color}|${mine}|${selected}|${fighting}|${health}|${army.units.length}`;
    if (look !== badge.look) {
      badge.look = look;
      const border = selected ? SELECT_COLOR : fighting ? COMBAT_COLOR : mine ? "#ffffff" : "#1b1b1b";
      const barY = BADGE_H / 2 + 2;
      badge.bg
        .clear()
        .roundRect(-BADGE_W / 2, -BADGE_H / 2, BADGE_W, BADGE_H, 5)
        .fill(color)
        .stroke({ width: selected || fighting ? 3 : mine ? 2 : 1.2, color: border })
        .rect(-BADGE_W / 2, barY, BADGE_W, HEALTH_H)
        .fill("#1b1b1b")
        .rect(-BADGE_W / 2, barY, BADGE_W * health, HEALTH_H)
        .fill(health > 0.6 ? "#5fbf4a" : health > 0.3 ? "#e8b730" : COMBAT_COLOR);
      badge.label.text = String(army.units.length);
      badge.label.style.stroke = { color: "#1b1b1b", width: 2.5, join: "round" };
      // In cima le armate selezionate e quelle del giocatore.
      badge.container.zIndex = selected ? 3 : fighting ? 2 : mine ? 1 : 0;
      this.container.sortableChildren = true;
    }
    return badge;
  }

  /** Percorso dell'armata selezionata: linea dalla posizione attuale fino alla destinazione. */
  private drawPath(cam: Camera, now: number): void {
    const g = this.path.clear();
    const army = this.armies.find((a) => a.id === this.selected);
    if (!army?.move) return;
    const px = 1 / cam.scale;
    // Dalla posizione attuale ai punti non ancora raggiunti.
    const { points: route, times } = army.move;
    const points = [project(armyPosition(army, now))];
    for (let i = 0; i < route.length; i++) if (times[i]! > now) points.push(project(route[i]!));
    g.moveTo(points[0]![0], points[0]![1]);
    for (const [x, y] of points.slice(1)) g.lineTo(x, y);
    g.stroke({ width: 3 * px, color: SELECT_COLOR, alpha: 0.9, join: "round", cap: "round" });
    const [ex, ey] = points[points.length - 1]!;
    g.circle(ex, ey, 6 * px).fill({ color: SELECT_COLOR, alpha: 0.35 }).stroke({ width: 2 * px, color: SELECT_COLOR });
  }
}
