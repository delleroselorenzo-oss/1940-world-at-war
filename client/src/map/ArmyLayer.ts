import { Container, Graphics, Sprite, Text } from "pixi.js";
import { armyHealth, armyPosition, type Army } from "@waw/shared";
import type { Camera } from "./camera.js";
import type { LoadedMap } from "./loadMap.js";
import { project } from "./projection.js";
import { drawFigure, leadUnit, tokenScale, tokenTexture, tokenUrl } from "./tokens.js";

// Armate sulla mappa: una pedina dipinta (la figura dell'unità principale, con la sua stazza, voltata nel senso di marcia)
// con il numero di unità in un cerchietto col colore della nazione, che scorre lungo il percorso mentre l'armata marcia.
// Senza la figura per la sua dottrina, un gettone col colore della nazione. Sotto, la barra della salute;
// rosso (anello o bordo) in combattimento, giallo se selezionata. Le dimensioni sono in pixel dello schermo,
// un po' più grandi avvicinandosi (`tokenScale`).

const BADGE_W = 28;
const BADGE_H = 18;
/** Spostamento verso l'alto rispetto al centro della provincia, per non coprire la città. */
const BADGE_OFFSET_Y = -16;
/** Distanza verticale tra più armate ferme nello stesso punto. */
const STACK_GAP = 36;
const SELECT_COLOR = "#ffd23f";
const COMBAT_COLOR = "#e5322d";
const HEALTH_H = 3;
const HIT_RADIUS = 16;

interface Badge {
  container: Container;
  bg: Graphics;
  /** Cerchietto del numero (sopra la figura). */
  chip: Graphics;
  label: Text;
  figure: Sprite;
  /** Spostamento verticale del punto da toccare. */
  hitDy: number;
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
  private size = 1;

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
  update(cam: Camera, now: number, zoom: number): void {
    const size = tokenScale(zoom);
    this.size = size;
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
        offset -= k * STACK_GAP * size;
      }
      badge.x = x;
      badge.y = y + offset * inv;
      badge.container.position.set(badge.x, badge.y);
      badge.container.scale.set(inv * size);
      badge.figure.scale.x = Math.abs(badge.figure.scale.x) * (headingWest(army, x, now) ? -1 : 1);
    }
    this.drawPath(cam, now);
  }

  /** Armata sotto il punto dello schermo (sx, sy), la più vicina. */
  armyAt(cam: Camera, sx: number, sy: number): string | null {
    let best: string | null = null;
    let bestDist = HIT_RADIUS * this.size;
    for (const [id, b] of this.badges) {
      const d = Math.hypot(b.x * cam.scale + cam.x - sx, b.y * cam.scale + cam.y + b.hitDy * this.size - sy);
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
      const figure = new Sprite();
      figure.anchor.set(0.5, 1);
      const chip = new Graphics();
      container.addChild(bg, figure, chip, label);
      this.container.addChild(container);
      badge = { container, bg, chip, label, figure, hitDy: 0, look: "", x: 0, y: 0 };
      this.badges.set(army.id, badge);
    }
    const color = this.map.nations.get(army.owner)?.color ?? "#888888";
    const mine = army.owner === this.playerNation;
    const selected = army.id === this.selected;
    const fighting = this.engaged.has(army.id);
    const health = Math.round(armyHealth(army) * 20) / 20;
    const lead = leadUnit(army.units);
    const texture = lead ? tokenTexture(tokenUrl(army.owner, lead)) : null;
    const look = `${color}|${mine}|${selected}|${fighting}|${health}|${army.units.length}|${lead}|${texture !== null}`;
    if (look !== badge.look) {
      badge.look = look;
      const g = badge.bg.clear();
      badge.chip.clear();
      let barY = BADGE_H / 2 + 2;
      let barW = BADGE_W;
      if (texture) {
        const ring = selected ? SELECT_COLOR : fighting ? COMBAT_COLOR : null;
        const layout = drawFigure(g, badge.chip, badge.figure, texture, lead!, { color, mine, ring, count: army.units.length });
        badge.label.position.set(...layout.count);
        badge.label.style.fontSize = 10;
        badge.hitDy = layout.hitDy;
        barY = layout.bottom;
        barW = Math.max(BADGE_W, layout.width * 0.7);
      } else {
        const border = selected ? SELECT_COLOR : fighting ? COMBAT_COLOR : mine ? "#ffffff" : "#1b1b1b";
        g.roundRect(-BADGE_W / 2, -BADGE_H / 2, BADGE_W, BADGE_H, 5)
          .fill(color)
          .stroke({ width: selected || fighting ? 3 : mine ? 2 : 1.2, color: border });
        badge.figure.visible = false;
        badge.label.position.set(0, 0);
        badge.label.style.fontSize = 12;
        badge.hitDy = 0;
      }
      g.rect(-barW / 2, barY, barW, HEALTH_H)
        .fill("#1b1b1b")
        .rect(-barW / 2, barY, barW * health, HEALTH_H)
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

/** L'armata marcia verso ovest (la figura, che guarda a destra, va voltata)? */
function headingWest(army: Army, x: number, now: number): boolean {
  const move = army.move;
  if (!move) return false;
  const i = move.times.findIndex((t) => t > now);
  if (i < 0) return false;
  return project(move.points[i]!)[0] < x - 1e-6;
}
