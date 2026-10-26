import { Container, Graphics, Text } from "pixi.js";
import type { LngLat, NavData } from "@waw/shared";
import type { Camera } from "./camera.js";
import { project } from "./projection.js";

// Zone di mare: confini tratteggiati e nomi in corsivo, sotto le province.
// Linee e testo hanno una dimensione fissa in pixel: le linee si ridisegnano quando cambia lo zoom.

const BORDER_COLOR = "#6f90a6";
const BORDER_PX = 1;
const DASH_PX = 5;
const GAP_PX = 4;
const LABEL_COLOR = "#4f6f86";

export class SeaLayer {
  readonly container = new Container();
  private readonly borders = new Graphics();
  private readonly labels = new Container();
  private readonly lines: [number, number][][];
  private drawnScale = 0;

  constructor(nav: NavData) {
    this.lines = (nav.sea?.borders ?? []).map((line) => line.map((p) => project(p as LngLat)));
    this.container.addChild(this.borders, this.labels);
    for (const zone of nav.sea?.zones ?? []) {
      const text = new Text({
        text: zone.name,
        resolution: (window.devicePixelRatio || 1) * 2,
        style: { fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic", fontSize: 12, letterSpacing: 1, fill: LABEL_COLOR },
      });
      text.anchor.set(0.5);
      const [x, y] = project(zone.label);
      text.position.set(x, y);
      this.labels.addChild(text);
    }
  }

  update(cam: Camera): void {
    for (const t of this.labels.children) t.scale.set(1 / cam.scale);
    if (Math.abs(cam.scale - this.drawnScale) / cam.scale <= 0.05) return;
    this.drawnScale = cam.scale;
    const g = this.borders.clear();
    const dash = DASH_PX / cam.scale;
    const gap = GAP_PX / cam.scale;
    for (const line of this.lines) {
      // Tratteggio continuo lungo tutta la linea: si avanza di tratto in tratto tenendo il passo.
      let on = true;
      let left = dash;
      for (let i = 1; i < line.length; i++) {
        let [x0, y0] = line[i - 1]!;
        const [x1, y1] = line[i]!;
        let len = Math.hypot(x1 - x0, y1 - y0);
        while (len > 0) {
          const d = Math.min(left, len);
          const x = x0 + ((x1 - x0) * d) / len;
          const y = y0 + ((y1 - y0) * d) / len;
          if (on) g.moveTo(x0, y0).lineTo(x, y);
          [x0, y0] = [x, y];
          len -= d;
          left -= d;
          if (left <= 1e-9) {
            on = !on;
            left = on ? dash : gap;
          }
        }
      }
    }
    g.stroke({ width: BORDER_PX / cam.scale, color: BORDER_COLOR, alpha: 0.8, cap: "round" });
  }
}
