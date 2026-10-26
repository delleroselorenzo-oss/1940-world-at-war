import { pointInShape, type ProjectedShape } from "./geometry.js";

// Confini tra stati: per ogni lato del contorno di una provincia si guarda chi c'è appena fuori.
// Le forme delle province non condividono i vertici lungo i confini, quindi non basta confrontare i lati:
// si prova un punto poco fuori dal lato, tra le province confinanti. Si calcola una volta sola, all'avvio;
// a ogni cambio di proprietario si disegnano i lati tra province di nazioni diverse.

/** Lato del contorno di una provincia che tocca un'altra provincia: [x1, y1, x2, y2] in km proiettati. */
export interface BorderEdge {
  province: string;
  neighbor: string;
  coords: [number, number, number, number];
}

/** Distanze (km) a cui si cerca la provincia oltre il lato: la seconda copre le piccole fessure tra le forme. */
const PROBES_KM = [1.5, 5];

export function borderEdges(shapes: ProjectedShape[], neighbors: (id: string) => string[]): BorderEdge[] {
  const byId = new Map(shapes.map((s) => [s.id, s]));
  const edges: BorderEdge[] = [];
  for (const shape of shapes) {
    const candidates = neighbors(shape.id)
      .map((id) => byId.get(id))
      .filter((s): s is ProjectedShape => !!s);
    if (candidates.length === 0) continue;
    let last: ProjectedShape | null = null;
    // Chi c'è nel punto: si prova prima la provincia trovata per il lato precedente (di solito è la stessa).
    const across = (x: number, y: number) => {
      if (last && pointInShape(last, x, y)) return last;
      const found = candidates.find((c) => c !== last && pointInShape(c, x, y)) ?? null;
      if (found) last = found;
      return found;
    };
    for (const rings of shape.polygons) {
      const ring = rings[0]!;
      for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
        const x1 = ring[j]!;
        const y1 = ring[j + 1]!;
        const x2 = ring[i]!;
        const y2 = ring[i + 1]!;
        const len = Math.hypot(x2 - x1, y2 - y1);
        if (len === 0) continue;
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const nx = -(y2 - y1) / len;
        const ny = (x2 - x1) / len;
        let other: ProjectedShape | null = null;
        for (const d of PROBES_KM) {
          // Il lato "fuori" è quello dove il punto non cade nella provincia stessa.
          for (const s of [1, -1]) {
            const px = mx + nx * d * s;
            const py = my + ny * d * s;
            if (pointInShape(shape, px, py)) continue;
            other = across(px, py);
            if (other) break;
          }
          if (other) break;
        }
        if (other) edges.push({ province: shape.id, neighbor: other.id, coords: [x1, y1, x2, y2] });
      }
    }
  }
  return edges;
}
