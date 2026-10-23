import type { Polygon, MultiPolygon, Position } from "geojson";

// Griglia regolare in gradi su cui "dipingiamo" i poligoni.
// Serve a trovare in modo robusto quali province confinano: due fonti diverse
// (CShapes e Natural Earth) non hanno vertici identici, quindi tra i poligoni
// restano piccole fessure che un confronto geometrico esatto non vedrebbe.

/** Cella senza nulla sopra: mare (o fessure tra poligoni). */
export const EMPTY = 0;
/** Terra che non appartiene a nessuna provincia del gioco (es. Iran, Siria). */
export const FOREIGN_LAND = -1;
/** Mare aperto (vedi `markSea`). */
export const SEA = -2;

export class Raster {
  readonly width: number;
  readonly height: number;
  readonly cells: Int32Array;

  constructor(
    readonly bbox: [number, number, number, number],
    readonly step: number,
  ) {
    this.width = Math.round((bbox[2] - bbox[0]) / step);
    this.height = Math.round((bbox[3] - bbox[1]) / step);
    this.cells = new Int32Array(this.width * this.height);
  }

  /** Indice della cella che contiene il punto, oppure -1 se fuori dalla griglia. */
  indexOf(lng: number, lat: number): number {
    const col = Math.floor((lng - this.bbox[0]) / this.step);
    const row = Math.floor((this.bbox[3] - lat) / this.step);
    if (col < 0 || row < 0 || col >= this.width || row >= this.height) return -1;
    return row * this.width + col;
  }

  valueAt(lng: number, lat: number): number {
    const i = this.indexOf(lng, lat);
    return i < 0 ? FOREIGN_LAND : (this.cells[i] ?? FOREIGN_LAND);
  }

  /** Riempie con `value` le celle il cui centro cade dentro la geometria (regola pari/dispari). */
  fill(geometry: Polygon | MultiPolygon, value: number): number {
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
    let filled = 0;
    for (const rings of polygons) filled += this.fillPolygon(rings, value);
    return filled;
  }

  private fillPolygon(rings: Position[][], value: number): number {
    let minLat = Infinity;
    let maxLat = -Infinity;
    for (const ring of rings)
      for (const p of ring) {
        const lat = p[1]!;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    const [lng0, , , lat1] = this.bbox;
    const rowStart = Math.max(0, Math.floor((lat1 - maxLat) / this.step));
    const rowEnd = Math.min(this.height - 1, Math.ceil((lat1 - minLat) / this.step));
    let filled = 0;
    const xs: number[] = [];
    for (let row = rowStart; row <= rowEnd; row++) {
      const lat = lat1 - (row + 0.5) * this.step;
      xs.length = 0;
      for (const ring of rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [xi, yi] = ring[i] as [number, number];
          const [xj, yj] = ring[j] as [number, number];
          if (yi > lat !== yj > lat) xs.push(xi + ((lat - yi) * (xj - xi)) / (yj - yi));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const colStart = Math.max(0, Math.ceil((xs[k]! - lng0) / this.step - 0.5));
        const colEnd = Math.min(this.width - 1, Math.floor((xs[k + 1]! - lng0) / this.step - 0.5));
        for (let col = colStart; col <= colEnd; col++) {
          this.cells[row * this.width + col] = value;
          filled++;
        }
      }
    }
    return filled;
  }

  /**
   * Distingue il mare dalle zone vuote piccole (laghi, fessure tra poligoni):
   * le aree vuote connesse di almeno `minCells` celle diventano SEA.
   */
  markSea(minCells: number): void {
    const { width, height, cells } = this;
    const seen = new Uint8Array(cells.length);
    const stack: number[] = [];
    const component: number[] = [];
    for (let start = 0; start < cells.length; start++) {
      if (seen[start] || cells[start] !== EMPTY) continue;
      component.length = 0;
      stack.push(start);
      seen[start] = 1;
      while (stack.length) {
        const i = stack.pop()!;
        component.push(i);
        const col = i % width;
        const neighbors = [col > 0 ? i - 1 : -1, col < width - 1 ? i + 1 : -1, i - width, i + width];
        for (const n of neighbors) {
          if (n < 0 || n >= width * height || seen[n] || cells[n] !== EMPTY) continue;
          seen[n] = 1;
          stack.push(n);
        }
      }
      if (component.length >= minCells) for (const i of component) cells[i] = SEA;
    }
  }

  /**
   * Conta i contatti tra valori diversi, guardando le celle vicine fino a `reach` passi
   * a destra e in basso (reach 2 scavalca le fessure larghe una cella).
   * Restituisce una mappa "a|b" -> numero di contatti, con a < b.
   */
  contacts(reach = 2): Map<string, number> {
    const out = new Map<string, number>();
    const { width, height, cells } = this;
    const add = (a: number, b: number) => {
      if (a === b) return;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      out.set(key, (out.get(key) ?? 0) + 1);
    };
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const v = cells[row * width + col]!;
        for (let d = 1; d <= reach; d++) {
          if (col + d < width) {
            const r = cells[row * width + col + d]!;
            // Oltre la prima cella contiamo solo i salti sopra una fessura vuota.
            if (d === 1 || cells[row * width + col + 1] === EMPTY) add(v, r);
          }
          if (row + d < height) {
            const b = cells[(row + d) * width + col]!;
            if (d === 1 || cells[(row + 1) * width + col] === EMPTY) add(v, b);
          }
        }
      }
    }
    return out;
  }
}
