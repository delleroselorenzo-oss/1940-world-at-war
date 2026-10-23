import { Container, Graphics } from "pixi.js";
import type { FieldHospital, NavData, Pontoon } from "@waw/shared";
import type { Camera } from "./camera.js";
import { project } from "./projection.js";

// Fiumi, strade, ferrovie e ponti disegnati sopra le province.
// I fiumi si vedono sempre; strade e ferrovie solo avvicinandosi, per non coprire la mappa.
// Sopra, i lavori del genio: ponti distrutti, ponti di barche, ospedali da campo.

const RIVER_COLOR = "#3f7cb6";
const ROAD_COLOR = "#f3ead6";
const RAIL_COLOR = "#2f2f2f";
const BRIDGE_COLOR = "#ffffff";
const DESTROYED_COLOR = "#c62828";
const PONTOON_COLOR = "#8d6e4a";
const HOSPITAL_CROSS = "#c62828";
/** Scala (pixel per km) oltre la quale compaiono strade/ferrovie e poi i ponti. */
const ROADS_SCALE = 0.35;
const BRIDGES_SCALE = 0.9;

/** Stato dei lavori sulla mappa (parti di `GameState`). */
export interface MapWorks {
  destroyedBridges: readonly string[];
  pontoons: Record<string, Pontoon>;
  hospitals: Record<string, FieldHospital>;
}
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
  private readonly works = new Graphics();
  private worksState: MapWorks = { destroyedBridges: [], pontoons: {}, hospitals: {} };
  private worksKey = "";
  private worksScale = 0;

  constructor(private readonly nav: NavData) {
    this.container.addChild(this.roads, this.rails, this.rivers, this.bridges, this.works);
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
    this.works.visible = showRoads;
    if (showRoads && Math.abs(cam.scale - this.worksScale) / cam.scale > 0.05) this.drawWorks(cam.scale);
  }

  /** Aggiorna i lavori; ridisegna solo se qualcosa è cambiato. */
  setWorks(works: MapWorks): void {
    const key = `${works.destroyedBridges.join()}|${Object.keys(works.pontoons).join()}|${Object.keys(works.hospitals).join()}`;
    if (key === this.worksKey) return;
    const bridgesChanged = key.split("|")[0] !== this.worksKey.split("|")[0];
    this.worksKey = key;
    this.worksState = works;
    if (bridgesChanged && this.bridgeScale > 0) this.drawBridges(this.bridgeScale);
    if (this.worksScale > 0) this.drawWorks(this.worksScale);
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
    const down = new Set(this.worksState.destroyedBridges);
    for (const b of this.nav.bridges) {
      if (down.has(b.id)) continue;
      const [x, y] = project(b.at);
      g.circle(x, y, r);
    }
    g.fill(BRIDGE_COLOR).stroke({ width: 2 / scale, color: RIVER_COLOR });
  }

  private drawWorks(scale: number): void {
    this.worksScale = scale;
    const g = this.works.clear();
    const px = 1 / scale; // km per pixel
    const bridges = new Map(this.nav.bridges.map((b) => [b.id, b]));
    // Ponte distrutto: una croce rossa.
    for (const id of this.worksState.destroyedBridges) {
      const b = bridges.get(id);
      if (!b) continue;
      const [x, y] = project(b.at);
      const r = 4 * px;
      g.moveTo(x - r, y - r).lineTo(x + r, y + r).moveTo(x + r, y - r).lineTo(x - r, y + r);
    }
    g.stroke({ width: 2.5 * px, color: DESTROYED_COLOR, cap: "round" });
    // Ponte di barche: un rettangolo color legno.
    for (const p of Object.values(this.worksState.pontoons)) {
      const [x, y] = project(p.at);
      g.roundRect(x - 5 * px, y - 2.5 * px, 10 * px, 5 * px, 1.5 * px);
    }
    g.fill(PONTOON_COLOR).stroke({ width: 1.5 * px, color: BRIDGE_COLOR });
    // Ospedale da campo: cerchio bianco con croce rossa.
    for (const h of Object.values(this.worksState.hospitals)) {
      const [x, y] = project(h.at);
      g.circle(x, y, 6 * px).fill(BRIDGE_COLOR).stroke({ width: 1.5 * px, color: HOSPITAL_CROSS });
      g.rect(x - 3.5 * px, y - 1.2 * px, 7 * px, 2.4 * px).rect(x - 1.2 * px, y - 3.5 * px, 2.4 * px, 7 * px).fill(HOSPITAL_CROSS);
    }
  }
}
