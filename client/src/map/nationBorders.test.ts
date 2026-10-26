import { describe, expect, it } from "vitest";
import type { ProjectedShape } from "./geometry.js";
import { borderEdges } from "./nationBorders.js";

function square(id: string, x0: number, y0: number, x1: number, y1: number): ProjectedShape {
  return { id, polygons: [[[x0, y0, x1, y0, x1, y1, x0, y1, x0, y0]]], bounds: { minX: x0, minY: y0, maxX: x1, maxY: y1 }, area: (x1 - x0) * (y1 - y0) };
}

describe("confini tra province", () => {
  it("trova i lati che toccano una provincia confinante, anche con una piccola fessura, e non le coste", () => {
    // A e B affiancate con 1 km di fessura; il resto dei loro contorni è costa.
    const a = square("A", 0, 0, 100, 100);
    const b = square("B", 101, 0, 200, 100);
    const edges = borderEdges([a, b], (id) => (id === "A" ? ["B"] : ["A"]));
    const fromA = edges.filter((e) => e.province === "A");
    expect(fromA).toHaveLength(1);
    expect(fromA[0]!.neighbor).toBe("B");
    expect(fromA[0]!.coords[0]).toBe(100); // il lato destro di A
    expect(edges.filter((e) => e.province === "B")).toHaveLength(1);
  });

  it("senza confinanti non ci sono lati di confine", () => {
    expect(borderEdges([square("A", 0, 0, 10, 10)], () => [])).toEqual([]);
  });
});
