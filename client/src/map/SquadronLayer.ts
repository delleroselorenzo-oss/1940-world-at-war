import { Container, Graphics, Sprite, Text } from "pixi.js";
import { squadronPosition, squadronRangeKm, type Fleet, type Squadron } from "@waw/shared";
import type { Camera } from "./camera.js";
import type { LoadedMap } from "./loadMap.js";
import { project } from "./projection.js";
import { drawPedestal, leadAircraft, tokenTexture, tokenUrl } from "./tokens.js";

// Squadriglie sulla mappa: una pedina dipinta (l'aereo più numeroso, a parità il più costoso) su una basetta col colore
// della nazione, voltata nel senso del volo; senza la figura, un gettone tondo con la sagoma di un aereo. Accanto il numero di aerei.
// A terra sta accanto al centro della base (a destra, per non coprire le armate); in volo scorre lungo la rotta.
// Per la squadriglia selezionata: la rotta fino alla base d'arrivo e, a terra, il cerchio della portata.
// Le dimensioni sono in pixel dello schermo (indipendenti dallo zoom).

const RADIUS = 11;
/** Spostamento a destra del centro della base, per stare accanto alle armate. */
const GROUND_OFFSET_X = 26;
/** Distanza verticale tra più squadriglie nella stessa base. */
const STACK_GAP = 28;
/** Lato più lungo della figura della pedina. */
const FIGURE = 34;
/** Centro della basetta, sotto il punto della squadriglia. */
const PEDESTAL_Y = 5;
/** La pedina si tocca un po' più in alto del punto della squadriglia (dov'è l'aereo). */
const FIGURE_HIT_DY = -5;
const SELECT_COLOR = "#ffd23f";
const RANGE_COLOR = "#2f6fb0";
const HIT_RADIUS = 14;

interface Badge {
  container: Container;
  bg: Graphics;
  label: Text;
  figure: Sprite;
  hitDy: number;
  look: string;
  x: number;
  y: number;
}

export class SquadronLayer {
  readonly container = new Container();
  readonly path = new Graphics();
  private readonly badges = new Map<string, Badge>();
  private squadrons: Squadron[] = [];
  /** Flotte visibili: le squadriglie a bordo di una portaerei stanno dove sta lei. */
  private fleets: { fleets: Record<string, Fleet> } = { fleets: {} };
  private playerNation: string | null = null;
  private selected: string | null = null;

  constructor(private readonly map: LoadedMap) {
    this.container.sortableChildren = true;
  }

  setSquadrons(squadrons: Squadron[], playerNation: string | null, fleets: Fleet[] = []): void {
    this.squadrons = squadrons;
    this.fleets = { fleets: Object.fromEntries(fleets.map((f) => [f.id, f])) };
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
      const [x, y] = project(squadronPosition(this.fleets, sq, this.map.data, now));
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
      const west = sq.flight !== null && project(sq.flight.to)[0] < project(sq.flight.from)[0];
      badge.figure.scale.x = Math.abs(badge.figure.scale.x) * (west ? -1 : 1);
    }
    this.drawSelected(cam, now);
  }

  /** Squadriglia sotto il punto dello schermo (sx, sy), la più vicina. */
  squadronAt(cam: Camera, sx: number, sy: number): string | null {
    let best: string | null = null;
    let bestDist = HIT_RADIUS;
    for (const [id, b] of this.badges) {
      const d = Math.hypot(b.x * cam.scale + cam.x - sx, b.y * cam.scale + cam.y + b.hitDy - sy);
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
      const figure = new Sprite();
      figure.anchor.set(0.5, 1);
      container.addChild(bg, figure, label);
      this.container.addChild(container);
      badge = { container, bg, label, figure, hitDy: 0, look: "", x: 0, y: 0 };
      this.badges.set(sq.id, badge);
    }
    const color = this.map.nations.get(sq.owner)?.color ?? "#888888";
    const mine = sq.owner === this.playerNation;
    const selected = sq.id === this.selected;
    const flying = sq.flight !== null;
    const lead = leadAircraft(sq.aircraft);
    const texture = lead ? tokenTexture(tokenUrl(sq.owner, lead)) : null;
    const look = `${color}|${mine}|${selected}|${flying}|${sq.aircraft.length}|${lead}|${texture !== null}`;
    if (look !== badge.look) {
      badge.look = look;
      const border = selected ? SELECT_COLOR : mine ? "#ffffff" : "#1b1b1b";
      const borderWidth = selected ? 3 : mine ? 2 : 1.2;
      const g = badge.bg.clear();
      let count: [number, number] = [RADIUS * 0.75, RADIUS * 0.75];
      if (texture) {
        drawPedestal(g, PEDESTAL_Y, 15, 6.5, color, border, borderWidth);
        badge.figure.texture = texture;
        badge.figure.scale.set(FIGURE / Math.max(texture.width, texture.height));
        // In volo l'aereo si stacca dalla basetta.
        badge.figure.position.set(0, PEDESTAL_Y + (flying ? -4 : 2));
        badge.figure.visible = true;
        badge.hitDy = FIGURE_HIT_DY;
        count = [16, PEDESTAL_Y - 1];
      } else {
        g.circle(0, 0, RADIUS).fill(color).stroke({ width: borderWidth, color: border });
        drawPlane(g);
        badge.figure.visible = false;
        badge.hitDy = 0;
      }
      // Numero di aerei in un cerchietto in basso a destra.
      g.circle(count[0], count[1], 6).fill("#1b1b1b");
      badge.label.position.set(count[0], count[1]);
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
    const [x, y] = project(squadronPosition(this.fleets, sq, this.map.data, now));
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
