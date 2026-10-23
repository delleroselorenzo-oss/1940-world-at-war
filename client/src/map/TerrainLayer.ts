import { Container, Graphics } from "pixi.js";
import type { NavData } from "@waw/shared";
import type { Camera } from "./camera.js";
import { project } from "./projection.js";

// Fiumi, strade, ferrovie e ponti disegnati sopra le province.
// I fiumi si vedono sempre; strade e ferrovie solo avvicinandosi, per non coprire la mappa.

const RIVER_COLOR = "#3f7cb6";
const ROAD_COLOR = "#f3ead6";
const RAIL_COLOR = "#2f2f2f";
const BRIDGE_COLOR = "#ffffff";
/** Scala (pixel per km) oltre la quale compaiono strade/ferrovie e poi i ponti. */
const ROADS_SCALE = 0.35;
const BRIDGES_SCALE = 0.9;
/** Larghezza dei fiumi: almeno questi km (ingrandendo diventano più spessi) e almeno RIVER_MIN_PX pixel. */
const RIVER_WIDTH_KM = 1.2;
const RIVER_MIN_PX = 1.6;

export class TerrainLayer {
  readonly container = new Container();
  private readonly roads = new Graphics();
  private readonly rails = new Graphics();
  private readonly rivers = new Container();
  /** Un disegno dei fiumi per ogni fascia di zoom (mezza ottava), creato quando serve. */
  private readonly riverBands = new Map<number, Graphics>();
  private readonly bridges = new Graphics();
  private bridgeScale = 0;

  constructor(private readonly nav: NavData) {
    this.container.addChild(this.roads, this.rails, this.rivers, this.bridges);
    this.drawRoads();
  }

  update(cam: Camera): void {
    const showRoads = cam.scale >= ROADS_SCALE;
    this.roads.visible = showRoads;
    this.rails.visible = showRoads;
    const band = Math.round(Math.log2(cam.scale) * 2) / 2;
    for (const [b, g] of this.riverBands) g.visible = b === band;
    if (!this.riverBands.has(band)) this.riverBands.set(band, this.drawRivers(Math.max(RIVER_WIDTH_KM, RIVER_MIN_PX / 2 ** band)));
    const showBridges = cam.scale >= BRIDGES_SCALE;
    this.bridges.visible = showBridges;
    // I ponti hanno una dimensione fissa in pixel: si ridisegnano quando cambia lo zoom.
    if (showBridges && Math.abs(cam.scale - this.bridgeScale) / cam.scale > 0.05) this.drawBridges(cam.scale);
  }

  private drawRoads(): void {
    const { nodes, edgeA, edgeB, edgeKind } = this.nav.roads;
    const point = (n: number) => project([nodes[n * 2]!, nodes[n * 2 + 1]!]);
    for (let e = 0; e < edgeA.length; e++) {
      const g = edgeKind[e] === 1 ? this.rails : this.roads;
      const [ax, ay] = point(edgeA[e]!);
      const [bx, by] = point(edgeB[e]!);
      g.moveTo(ax, ay).lineTo(bx, by);
    }
    this.roads.stroke({ width: 1, color: ROAD_COLOR, alpha: 0.7, pixelLine: true });
    this.rails.stroke({ width: 1, color: RAIL_COLOR, alpha: 0.45, pixelLine: true });
  }

  private drawRivers(widthKm: number): Graphics {
    const g = new Graphics();
    for (const river of this.nav.rivers)
      for (const line of river.lines) {
        const pts = line.map(project);
        g.moveTo(pts[0]![0], pts[0]![1]);
        for (const [x, y] of pts.slice(1)) g.lineTo(x, y);
      }
    g.stroke({ width: widthKm, color: RIVER_COLOR, alpha: 0.9, join: "round", cap: "round" });
    this.rivers.addChild(g);
    return g;
  }

  private drawBridges(scale: number): void {
    this.bridgeScale = scale;
    const g = this.bridges.clear();
    // Cerchietti bordati col colore dei fiumi, per non confonderli con le città (quadrati).
    const r = 3.5 / scale; // raggio in km per 3,5 px
    for (const b of this.nav.bridges) {
      const [x, y] = project(b.at);
      g.circle(x, y, r);
    }
    g.fill(BRIDGE_COLOR).stroke({ width: 2 / scale, color: RIVER_COLOR });
  }
}
