import type { MultiPolygon, Polygon } from "geojson";
import type { LngLat } from "@waw/shared";
import type { Bounds } from "./camera.js";

/** Forma di una provincia già proiettata: anelli come array piatti [x0, y0, x1, y1, …] in km. */
export interface ProjectedShape {
  id: string;
  /** Per ogni poligono: il primo anello è il contorno esterno, gli altri sono buchi. */
  polygons: number[][][];
  bounds: Bounds;
  /** Area approssimata in km² proiettati, usata per l'ordine di disegno. */
  area: number;
}

export function projectShape(id: string, geometry: Polygon | MultiPolygon, project: (p: LngLat) => [number, number]): ProjectedShape {
  const source = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const bounds: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  let area = 0;
  const polygons = source.map((rings) =>
    rings.map((ring, ringIndex) => {
      const flat: number[] = [];
      for (const p of ring) {
        const [x, y] = project(p as LngLat);
        flat.push(x, y);
        if (x < bounds.minX) bounds.minX = x;
        if (y < bounds.minY) bounds.minY = y;
        if (x > bounds.maxX) bounds.maxX = x;
        if (y > bounds.maxY) bounds.maxY = y;
      }
      const a = Math.abs(ringArea(flat));
      area += ringIndex === 0 ? a : -a;
      return flat;
    }),
  );
  return { id, polygons, bounds, area };
}

function ringArea(flat: number[]): number {
  let sum = 0;
  for (let i = 0, j = flat.length - 2; i < flat.length; j = i, i += 2) sum += flat[j]! * flat[i + 1]! - flat[i]! * flat[j + 1]!;
  return sum / 2;
}

/** Il punto è dentro la forma? Regola pari/dispari, così i buchi sono esclusi. */
export function pointInShape(shape: ProjectedShape, x: number, y: number): boolean {
  const b = shape.bounds;
  if (x < b.minX || x > b.maxX || y < b.minY || y > b.maxY) return false;
  for (const rings of shape.polygons) {
    let inside = false;
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
        const xi = ring[i]!;
        const yi = ring[i + 1]!;
        const xj = ring[j]!;
        const yj = ring[j + 1]!;
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
    if (inside) return true;
  }
  return false;
}

export function unionBounds(list: Bounds[]): Bounds {
  return list.reduce(
    (a, b) => ({ minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

/**
 * Indice spaziale a griglia per trovare velocemente la provincia sotto un punto.
 * Ogni cella conosce le forme il cui rettangolo la tocca.
 */
export class HitIndex {
  private readonly cells = new Map<number, ProjectedShape[]>();
  private readonly bounds: Bounds;

  constructor(
    shapes: ProjectedShape[],
    private readonly cellSize = 100,
  ) {
    this.bounds = unionBounds(shapes.map((s) => s.bounds));
    // Le forme piccole prima: così una provincia dentro un'altra (es. un'enclave) vince.
    const ordered = [...shapes].sort((a, b) => a.area - b.area);
    for (const s of ordered) {
      for (let cx = this.col(s.bounds.minX); cx <= this.col(s.bounds.maxX); cx++)
        for (let cy = this.row(s.bounds.minY); cy <= this.row(s.bounds.maxY); cy++) {
          const key = this.key(cx, cy);
          const list = this.cells.get(key);
          if (list) list.push(s);
          else this.cells.set(key, [s]);
        }
    }
  }

  find(x: number, y: number): ProjectedShape | null {
    const list = this.cells.get(this.key(this.col(x), this.row(y)));
    return list?.find((s) => pointInShape(s, x, y)) ?? null;
  }

  private col(x: number) {
    return Math.floor((x - this.bounds.minX) / this.cellSize);
  }
  private row(y: number) {
    return Math.floor((y - this.bounds.minY) / this.cellSize);
  }
  private key(cx: number, cy: number) {
    return cx * 100_000 + cy;
  }
}
