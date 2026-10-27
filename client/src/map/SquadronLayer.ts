import { Container, Graphics, Text } from "pixi.js";
import { squadronAltitude, squadronHealth, squadronPosition, squadronRangeKm, type Fleet, type Squadron } from "@waw/shared";
import type { Camera } from "./camera.js";
import type { LoadedMap } from "./loadMap.js";
import { project } from "./projection.js";
import { COMPACT_ZOOM, CompactMarker, Figure, leadAircraft, Pin, placeTag, tagBorder, tagIconsReady, tokenScale, tokenTexture, tokenUrl, UnitTag } from "./tokens.js";

// Squadriglie sulla mappa: una pedina dipinta (l'aereo più numeroso, a parità il più costoso, con la sua stazza) voltata
// nel senso del volo, con accanto il cartellino (aerei, salute, colore della nazione); senza la figura, un gettone tondo
// con la sagoma di un aereo. A terra sta accanto al centro della base (a destra, per non coprire le armate); in volo
// scorre lungo la rotta e si alza sopra la sua ombra: sale dopo il decollo, resta in quota verso il bersaglio e sopra
// di lui, scende solo arrivando a una base (`squadronAltitude`).
// Per la squadriglia selezionata: la rotta fino alla base d'arrivo e, a terra, il cerchio della portata.
// Le dimensioni sono in pixel dello schermo, un po' più grandi avvicinandosi (`tokenScale`).

const RADIUS = 11;
/** Spostamento a destra del centro della base, per stare accanto alle armate. */
const GROUND_OFFSET_X = 26;
/** Distanza verticale tra più squadriglie nella stessa base. */
const STACK_GAP = 40;
/** Distanza tra i segnalini piccoli impilati (vista da lontano). */
const COMPACT_GAP = 22;
/** Altezza in quota della figura sopra la sua ombra. */
const CRUISE_PX = 30;
const SELECT_COLOR = "#ffd23f";
const RANGE_COLOR = "#2f6fb0";
const HIT_RADIUS = 14;

interface Badge {
  container: Container;
  /** Gettone disegnato, se manca la figura. */
  bg: Graphics;
  /** Ciò che vola: figura e cartellino; si alza con la quota. */
  body: Container;
  /** Cartellino accanto all'aereo: numero di aerei e salute. */
  tag: UnitTag;
  label: Text;
  fig: Figure;
  /** Figura, ombra e cartellino (vista da vicino). */
  full: Container;
  /** Segnalino della vista da lontano. */
  marker: CompactMarker;
  /** Segnaposto sul punto esatto e linea fino alla pedina. */
  pin: Pin;
  /** C'è la figura dipinta (altrimenti il gettone disegnato, uguale a ogni zoom). */
  hasFigure: boolean;
  /** Mostra il segnalino piccolo adesso. */
  small: boolean;
  /** Punto da toccare a terra; in volo si alza con la figura. */
  hitDy: number;
  lift: number;
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
  private size = 1;

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
  update(cam: Camera, now: number, zoom: number): void {
    const size = tokenScale(zoom);
    this.size = size;
    const compact = zoom < COMPACT_ZOOM;
    const inv = 1 / cam.scale;
    const stacked = new Map<string, number>(); // base -> squadriglie a terra già piazzate lì
    for (const sq of this.squadrons) {
      const badge = this.badgeFor(sq);
      badge.small = compact && badge.hasFigure;
      badge.full.visible = !badge.small;
      badge.marker.container.visible = badge.small;
      const [x, y] = project(squadronPosition(this.fleets, sq, this.map.data, now));
      let dx = 0;
      let dy = 0;
      if (!sq.flight) {
        const k = stacked.get(sq.base) ?? 0;
        stacked.set(sq.base, k + 1);
        dx = badge.small ? GROUND_OFFSET_X * 0.6 : GROUND_OFFSET_X;
        dy = -k * (badge.small ? COMPACT_GAP : STACK_GAP);
      }
      badge.x = x + dx * size * inv;
      badge.y = y + dy * size * inv;
      // A terra la squadriglia sta accanto alla base: il segnaposto è sulla base.
      badge.pin.set(-dx, -dy, this.map.nations.get(sq.owner)?.color ?? "#888888", sq.owner === this.playerNation);
      badge.container.position.set(badge.x, badge.y);
      badge.container.scale.set(inv * size);
      const altitude = badge.hasFigure && !badge.small ? squadronAltitude(this.fleets, sq, this.map.data, now) : 0;
      badge.lift = altitude * CRUISE_PX;
      badge.body.y = -badge.lift;
      badge.fig.fadeShadow(1 - 0.45 * altitude);
      badge.fig.setFlip(sq.flight !== null && project(sq.flight.to)[0] < project(sq.flight.from)[0]);
    }
    this.drawSelected(cam, now);
  }

  /** Squadriglia sotto il punto dello schermo (sx, sy), la più vicina. */
  squadronAt(cam: Camera, sx: number, sy: number): string | null {
    let best: string | null = null;
    let bestDist = HIT_RADIUS * this.size;
    for (const [id, b] of this.badges) {
      const d = Math.hypot(b.x * cam.scale + cam.x - sx, b.y * cam.scale + cam.y + (b.small ? 0 : b.hitDy - b.lift) * this.size - sy);
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
      const fig = new Figure();
      const tag = new UnitTag();
      const body = new Container();
      body.addChild(fig.outline, fig.sprite, tag.container, label);
      // L'ombra resta a terra mentre la figura si alza.
      const full = new Container();
      full.addChild(fig.shadow, bg, body);
      const marker = new CompactMarker();
      const pin = new Pin();
      container.addChild(pin.graphics, full, marker.container);
      this.container.addChild(container);
      badge = { container, bg, body, tag, label, fig, full, marker, pin, hasFigure: false, small: false, hitDy: 0, lift: 0, look: "", x: 0, y: 0 };
      this.badges.set(sq.id, badge);
    }
    const color = this.map.nations.get(sq.owner)?.color ?? "#888888";
    const mine = sq.owner === this.playerNation;
    const selected = sq.id === this.selected;
    const flying = sq.flight !== null;
    const lead = leadAircraft(sq.aircraft);
    const texture = lead ? tokenTexture(tokenUrl(sq.owner, lead)) : null;
    const health = Math.round(squadronHealth(sq) * 20) / 20;
    const look = `${color}|${mine}|${selected}|${flying}|${sq.aircraft.length}|${health}|${lead}|${texture !== null}|${tagIconsReady()}`;
    if (look !== badge.look) {
      badge.look = look;
      const g = badge.bg.clear();
      if (texture) {
        badge.fig.show(texture, lead!, "air", selected ? SELECT_COLOR : null);
        badge.marker.draw("air", sq.aircraft.length, color, selected ? SELECT_COLOR : null);
        badge.hasFigure = true;
        badge.tag.draw([{ icon: "air", count: sq.aircraft.length }], color, health, tagBorder(selected, false, mine));
        placeTag(badge.tag, badge.fig);
        badge.tag.container.visible = true;
        badge.label.visible = false;
        badge.hitDy = -badge.fig.height / 2;
      } else {
        const border = selected ? SELECT_COLOR : mine ? "#ffffff" : "#1b1b1b";
        g.circle(0, 0, RADIUS)
          .fill(color)
          .stroke({ width: selected ? 3 : mine ? 2 : 1.2, color: border });
        drawPlane(g);
        badge.fig.hide();
        badge.hasFigure = false;
        badge.tag.container.visible = false;
        badge.label.visible = true;
        badge.hitDy = 0;
        // Numero di aerei in un cerchietto in basso a destra.
        g.circle(RADIUS * 0.75, RADIUS * 0.75, 6).fill("#1b1b1b");
        badge.label.position.set(RADIUS * 0.75, RADIUS * 0.75);
      }
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
