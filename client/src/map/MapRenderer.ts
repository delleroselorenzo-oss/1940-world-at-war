import { Application, Container, Graphics, Text, type TextStyleOptions } from "pixi.js";
import type { Army, Squadron } from "@waw/shared";
import type { LngLat } from "@waw/shared";
import { ArmyLayer } from "./ArmyLayer.js";
import { SquadronLayer } from "./SquadronLayer.js";
import { TerrainLayer, type MapWorks } from "./TerrainLayer.js";
import { clampToBounds, centerOn, fitBounds, pan, screenToWorld, zoomAt, type Camera, type Viewport } from "./camera.js";
import { HitIndex, type ProjectedShape } from "./geometry.js";
import { placeLabels, type LabelCandidate } from "./labels.js";
import type { LoadedMap } from "./loadMap.js";
import { project, unproject } from "./projection.js";

// Disegno della mappa con PixiJS e gestione di mouse, rotella e tocco.
// Non dipende da React: il componente MapView lo crea e gli passa i callback.

export interface MapRendererCallbacks {
  /** Clic sulla mappa: la provincia (null = sul mare) e il punto esatto. */
  onSelect(id: string | null, at: LngLat): void;
  /** Clic su un'armata. */
  onSelectArmy(id: string): void;
  /** Clic su una squadriglia. */
  onSelectSquadron(id: string): void;
  /** Minuto di gioco attuale, letto a ogni fotogramma per far scorrere le armate. */
  now(): number;
  onHover(id: string | null): void;
  /** Posizione del puntatore sullo schermo, per il tooltip. */
  onPointerMove(x: number, y: number): void;
}

const SEA_COLOR = "#a9c4d4";
const BORDER_COLOR = "#2a2a2a";
const SELECT_COLOR = "#ffd23f";
/** Province evidenziate da un pannello (es. dove si può costruire un porto). */
const HIGHLIGHT_COLOR = "#ffffff";
/** Spostamento in pixel oltre il quale un tocco è un trascinamento e non un clic. */
const DRAG_THRESHOLD = 5;
/** Limiti di zoom rispetto alla vista d'insieme. */
const MIN_ZOOM = 0.7;
const MAX_ZOOM = 30;
/**
 * Scala (pixel per km) oltre la quale compaiono capitali, città e province rurali.
 * È assoluta e non relativa alla vista d'insieme, così funziona uguale su telefono e computer.
 */
const CAPITAL_LABEL_SCALE = 0.17;
const CITY_LABEL_SCALE = 0.3;
const RURAL_LABEL_SCALE = 0.45;
/** Su schermi verticali (telefono) la vista iniziale è ingrandita sull'Europa centrale. */
const PORTRAIT_START_ZOOM = 2.2;
const PORTRAIT_START_CENTER: [number, number] = [14, 50];

interface Marker {
  graphic: Graphics;
  kind: "capital" | "city";
}

interface Label {
  text: Text;
  shape: ProjectedShape;
  kind: "capital" | "city" | "rural";
}

export class MapRenderer {
  private readonly app = new Application();
  private readonly world = new Container();
  private readonly overlay = new Graphics();
  private readonly fills = new Graphics();
  /** Proprietario attuale di ogni provincia; se manca vale la nazione iniziale. */
  private owners: Record<string, string> = {};
  private readonly markers = new Container();
  private readonly labels: Label[] = [];
  private readonly cityMarkers: Marker[] = [];
  private readonly hit: HitIndex;
  private readonly armyLayer: ArmyLayer;
  private readonly squadronLayer: SquadronLayer;
  private readonly terrain: TerrainLayer;
  private view: Viewport = { width: 1, height: 1 };
  private cam: Camera = { x: 0, y: 0, scale: 1 };
  private fitScale = 1;
  private hovered: string | null = null;
  private selected: string | null = null;
  private highlighted: ReadonlySet<string> = new Set();
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private dragDistance = 0;
  private animation: { from: Camera; to: Camera; start: number; duration: number } | null = null;
  private mounted = false;
  private destroyed = false;
  private readonly cleanup: (() => void)[] = [];

  constructor(
    private readonly map: LoadedMap,
    private readonly callbacks: MapRendererCallbacks,
  ) {
    this.hit = new HitIndex(map.shapes);
    this.armyLayer = new ArmyLayer(map);
    this.squadronLayer = new SquadronLayer(map);
    this.terrain = new TerrainLayer(map.nav);
  }

  async mount(host: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: host,
      background: SEA_COLOR,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    });
    if (this.destroyed) {
      this.app.destroy(true);
      return;
    }
    this.mounted = true;
    host.appendChild(this.app.canvas);
    this.app.canvas.style.touchAction = "none";
    this.app.canvas.style.display = "block";

    this.drawProvinces();
    this.world.addChild(this.terrain.container, this.overlay, this.markers, this.squadronLayer.path, this.armyLayer.path, this.armyLayer.container, this.squadronLayer.container);
    this.drawMarkersAndLabels();
    this.app.stage.addChild(this.world);

    this.view = { width: this.app.screen.width, height: this.app.screen.height };
    this.fit(false);
    if (this.view.height > this.view.width * 1.2) {
      const [wx, wy] = project(PORTRAIT_START_CENTER);
      this.setCamera(centerOn(this.fitScale * PORTRAIT_START_ZOOM, wx, wy, this.view));
    }
    this.bindInput(this.app.canvas);

    const onResize = () => {
      const [cx, cy] = screenToWorld(this.cam, this.view.width / 2, this.view.height / 2);
      this.view = { width: this.app.screen.width, height: this.app.screen.height };
      this.fitScale = fitBounds(this.map.bounds, this.view).scale;
      this.setCamera(centerOn(this.cam.scale, cx, cy, this.view));
    };
    this.app.renderer.on("resize", onResize);
    this.cleanup.push(() => this.app.renderer.off("resize", onResize));
    this.app.ticker.add(() => {
      this.stepAnimation();
      this.armyLayer.update(this.cam, this.callbacks.now());
      this.squadronLayer.update(this.cam, this.callbacks.now());
    });
  }

  destroy(): void {
    this.destroyed = true;
    if (!this.mounted) return; // mount() distruggerà l'app quando init() termina
    for (const fn of this.cleanup) fn();
    this.app.destroy(true, { children: true });
  }

  setSelected(id: string | null): void {
    this.selected = id;
    if (this.mounted) this.drawOverlay();
  }

  setHighlighted(ids: ReadonlySet<string>): void {
    this.highlighted = ids;
    if (this.mounted) this.drawOverlay();
  }

  setArmies(armies: Army[], playerNation: string | null, engaged: ReadonlySet<string>): void {
    this.armyLayer.setArmies(armies, playerNation, engaged);
  }

  setWorks(works: MapWorks): void {
    this.terrain.setWorks(works);
  }

  setSelectedArmy(id: string | null): void {
    this.armyLayer.setSelected(id);
  }

  setSquadrons(squadrons: Squadron[], playerNation: string | null): void {
    this.squadronLayer.setSquadrons(squadrons, playerNation);
  }

  setSelectedSquadron(id: string | null): void {
    this.squadronLayer.setSelected(id);
  }

  zoomBy(factor: number): void {
    const target = zoomAt(this.cam, this.view.width / 2, this.view.height / 2, factor, this.fitScale * MIN_ZOOM, this.fitScale * MAX_ZOOM);
    this.animateTo(target);
  }

  fit(animate = true): void {
    const target = fitBounds(this.map.bounds, this.view);
    this.fitScale = target.scale;
    if (animate) this.animateTo(target);
    else this.setCamera(target);
  }

  /**
   * Centra la vista su una provincia, avvicinandosi se si è troppo lontani.
   * `cover` è lo spazio in pixel coperto da pannelli a destra e in basso: si centra nella parte visibile.
   */
  focus(id: string, cover: { right: number; bottom: number } = { right: 0, bottom: 0 }): void {
    const p = this.map.provinces.get(id);
    if (!p) return;
    const [wx, wy] = project(p.center);
    const scale = Math.max(this.cam.scale, this.fitScale * 3);
    const centered = centerOn(scale, wx, wy, this.view);
    this.animateTo({ ...centered, x: centered.x - cover.right / 2, y: centered.y - cover.bottom / 2 });
  }

  // --- Disegno ------------------------------------------------------------

  /** Aggiorna i colori quando cambiano i proprietari delle province (es. conquiste). */
  setOwners(owners: Record<string, string>): void {
    this.owners = owners;
    if (this.mounted) this.drawFills();
  }

  private drawProvinces(): void {
    const borders = new Graphics();
    for (const shape of this.map.shapes)
      for (const rings of shape.polygons)
        for (const ring of rings) borders.poly(ring).stroke({ width: 1, color: BORDER_COLOR, alpha: 0.8, pixelLine: true });
    this.drawFills();
    this.world.addChild(this.fills, borders);
  }

  private drawFills(): void {
    const fills = this.fills.clear();
    // Dalle più grandi alle più piccole: un'enclave viene disegnata sopra chi la contiene.
    const ordered = [...this.map.shapes].sort((a, b) => b.area - a.area);
    for (const shape of ordered) {
      const owner = this.owners[shape.id] ?? this.map.provinces.get(shape.id)?.nation;
      const color = (owner && this.map.nations.get(owner)?.color) ?? "#cccccc";
      for (const rings of shape.polygons) fills.poly(rings[0]!).fill(color);
    }
  }

  private drawMarkersAndLabels(): void {
    const resolution = (window.devicePixelRatio || 1) * 2;
    const base: TextStyleOptions = {
      fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
      fill: "#1b1b1b",
      stroke: { color: "#ffffff", width: 3, join: "round" },
    };
    for (const shape of this.map.shapes) {
      const p = this.map.provinces.get(shape.id)!;
      const [x, y] = project(p.center);
      const kind: Label["kind"] = p.isCapital ? "capital" : p.type === "urban" ? "city" : "rural";

      if (kind !== "rural") {
        const marker = new Graphics();
        if (kind === "capital") marker.star(0, 0, 5, 7, 3).fill(SELECT_COLOR).stroke({ width: 1.2, color: "#222" });
        else marker.rect(-3.5, -3.5, 7, 7).fill("#ffffff").stroke({ width: 1.2, color: "#222" });
        marker.position.set(x, y);
        this.markers.addChild(marker);
        this.cityMarkers.push({ graphic: marker, kind });
      }

      const text = new Text({
        text: p.name,
        resolution,
        style: {
          ...base,
          fontSize: kind === "rural" ? 11 : 12.5,
          fontWeight: kind === "rural" ? "400" : "600",
          fill: kind === "rural" ? "#333333" : "#111111",
        },
      });
      text.anchor.set(0.5, kind === "rural" ? 0.5 : -0.45);
      text.position.set(x, y);
      this.markers.addChild(text);
      this.labels.push({ text, shape, kind });
    }
  }

  private drawOverlay(): void {
    const g = this.overlay.clear();
    const px = 1 / this.cam.scale; // un pixel dello schermo in km
    const outline = (id: string, fill: string, alpha: number, stroke?: { color: string; width: number }) => {
      const shape = this.map.shapeById.get(id);
      if (!shape) return;
      for (const rings of shape.polygons) {
        g.poly(rings[0]!).fill({ color: fill, alpha });
        if (stroke) g.poly(rings[0]!).stroke({ color: stroke.color, width: stroke.width * px, join: "round" });
      }
    };
    for (const id of this.highlighted) if (id !== this.selected) outline(id, HIGHLIGHT_COLOR, 0.4, { color: "#1b1b1b", width: 2 });
    if (this.hovered && this.hovered !== this.selected) outline(this.hovered, "#ffffff", 0.28);
    if (this.selected) outline(this.selected, "#ffffff", 0.3, { color: SELECT_COLOR, width: 3 });
  }

  private updateScaleDependent(): void {
    const scale = this.cam.scale;
    this.terrain.update(this.cam);
    for (const m of this.markers.children) m.scale.set(1 / scale);
    // Lontano si vedono solo le capitali, per non affollare la mappa.
    for (const m of this.cityMarkers) m.graphic.visible = m.kind === "capital" || scale >= CAPITAL_LABEL_SCALE;

    // Candidati: le etichette abbastanza "vicine"; poi si tolgono quelle che si sovrappongono.
    const candidates: LabelCandidate[] = [];
    const owners: Label[] = [];
    for (const l of this.labels) {
      l.text.visible = false;
      const w = l.text.width * scale; // dimensioni in pixel (il testo è scalato di 1/scale)
      const h = l.text.height * scale;
      if (l.kind === "capital" && scale < CAPITAL_LABEL_SCALE) continue;
      if (l.kind === "city" && scale < CITY_LABEL_SCALE) continue;
      if (l.kind === "rural") {
        // Il nome di una provincia rurale compare solo se ci sta dentro.
        const widthPx = (l.shape.bounds.maxX - l.shape.bounds.minX) * scale;
        if (scale < RURAL_LABEL_SCALE || widthPx < w * 1.3) continue;
      }
      const sx = l.text.x * scale + this.cam.x;
      const sy = l.text.y * scale + this.cam.y;
      if (sx < -w || sx > this.view.width + w || sy < -h || sy > this.view.height + h) continue;
      const top = l.kind === "rural" ? sy - h / 2 : sy + 0.45 * h;
      candidates.push({ priority: l.kind === "capital" ? 0 : l.kind === "city" ? 1 : 2, left: sx - w / 2, top, width: w, height: h });
      owners.push(l);
    }
    for (const i of placeLabels(candidates)) owners[i]!.text.visible = true;
    this.drawOverlay();
  }

  // --- Camera -------------------------------------------------------------

  private setCamera(cam: Camera): void {
    this.cam = clampToBounds(cam, this.map.bounds, this.view);
    this.world.position.set(this.cam.x, this.cam.y);
    this.world.scale.set(this.cam.scale);
    this.updateScaleDependent();
  }

  private animateTo(to: Camera, duration = 280): void {
    this.animation = { from: this.cam, to, start: performance.now(), duration };
  }

  private stepAnimation(): void {
    const a = this.animation;
    if (!a) return;
    const t = Math.min(1, (performance.now() - a.start) / a.duration);
    const e = 1 - (1 - t) ** 3;
    // Interpolazione della scala in logaritmo: lo zoom appare uniforme.
    const scale = Math.exp(Math.log(a.from.scale) + (Math.log(a.to.scale) - Math.log(a.from.scale)) * e);
    const [fx, fy] = screenToWorld(a.from, this.view.width / 2, this.view.height / 2);
    const [tx, ty] = screenToWorld(a.to, this.view.width / 2, this.view.height / 2);
    this.setCamera(centerOn(scale, fx + (tx - fx) * e, fy + (ty - fy) * e, this.view));
    if (t >= 1) this.animation = null;
  }

  // --- Input --------------------------------------------------------------

  private bindInput(canvas: HTMLCanvasElement): void {
    const local = (e: PointerEvent | WheelEvent | MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const limits = () => [this.fitScale * MIN_ZOOM, this.fitScale * MAX_ZOOM] as const;

    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, local(e));
      if (this.pointers.size === 1) this.dragDistance = 0;
      this.animation = null;
    };

    const onMove = (e: PointerEvent) => {
      const pos = local(e);
      this.callbacks.onPointerMove(pos.x, pos.y);
      const prev = this.pointers.get(e.pointerId);
      if (!prev) {
        if (e.pointerType === "mouse") this.setHovered(this.provinceAt(pos.x, pos.y));
        return;
      }
      if (this.pointers.size === 1) {
        const dx = pos.x - prev.x;
        const dy = pos.y - prev.y;
        this.dragDistance += Math.hypot(dx, dy);
        if (this.dragDistance > DRAG_THRESHOLD) {
          this.setCamera(pan(this.cam, dx, dy));
          canvas.style.cursor = "grabbing";
        }
      } else if (this.pointers.size === 2) {
        // Pizzico: zoom sul punto medio e spostamento del punto medio.
        const [a, b] = [...this.pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
        const other = a === prev ? b : a;
        const oldDist = Math.hypot(prev.x - other.x, prev.y - other.y);
        const newDist = Math.hypot(pos.x - other.x, pos.y - other.y);
        const mid = { x: (pos.x + other.x) / 2, y: (pos.y + other.y) / 2 };
        const oldMid = { x: (prev.x + other.x) / 2, y: (prev.y + other.y) / 2 };
        const [min, max] = limits();
        const zoomed = zoomAt(this.cam, mid.x, mid.y, oldDist > 0 ? newDist / oldDist : 1, min, max);
        this.setCamera(pan(zoomed, mid.x - oldMid.x, mid.y - oldMid.y));
        this.dragDistance = Infinity; // un pizzico non è mai un clic
      }
      this.pointers.set(e.pointerId, pos);
    };

    const onUp = (e: PointerEvent) => {
      const wasClick = this.pointers.size === 1 && this.dragDistance <= DRAG_THRESHOLD;
      this.pointers.delete(e.pointerId);
      canvas.style.cursor = this.hovered ? "pointer" : "default";
      if (wasClick) {
        const pos = local(e);
        // Squadriglie e armate stanno sopra le province: hanno la precedenza.
        const squadron = this.squadronLayer.squadronAt(this.cam, pos.x, pos.y);
        const army = squadron ? null : this.armyLayer.armyAt(this.cam, pos.x, pos.y);
        if (squadron) this.callbacks.onSelectSquadron(squadron);
        else if (army) this.callbacks.onSelectArmy(army);
        else this.callbacks.onSelect(this.provinceAt(pos.x, pos.y), unproject(screenToWorld(this.cam, pos.x, pos.y)));
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      this.animation = null;
      const pos = local(e);
      // Le rotelle "a righe" (deltaMode 1) hanno valori molto più piccoli dei trackpad.
      const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      const [min, max] = limits();
      this.setCamera(zoomAt(this.cam, pos.x, pos.y, Math.exp(-delta * 0.0015), min, max));
    };

    const onDoubleClick = (e: MouseEvent) => {
      const pos = local(e);
      const [min, max] = limits();
      this.animateTo(zoomAt(this.cam, pos.x, pos.y, 2, min, max));
    };

    const onLeave = () => this.setHovered(null);

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("dblclick", onDoubleClick);
    this.cleanup.push(() => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("dblclick", onDoubleClick);
    });
  }

  private provinceAt(sx: number, sy: number): string | null {
    const [wx, wy] = screenToWorld(this.cam, sx, sy);
    return this.hit.find(wx, wy)?.id ?? null;
  }

  private setHovered(id: string | null): void {
    if (id === this.hovered) return;
    this.hovered = id;
    this.app.canvas.style.cursor = id ? "pointer" : "default";
    this.drawOverlay();
    this.callbacks.onHover(id);
  }
}
