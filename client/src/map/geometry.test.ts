import { describe, expect, it } from "vitest";
import { HitIndex, pointInShape, projectShape } from "./geometry.js";

const identity = (p: [number, number]): [number, number] => [p[0], p[1]];

// Un quadrato 0–10 con un buco 4–6, e un quadratino dentro il buco (un'enclave).
const outer = projectShape(
  "outer",
  {
    type: "Polygon",
    coordinates: [
      [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
      [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]],
    ],
  },
  identity,
);
const enclave = projectShape("enclave", { type: "Polygon", coordinates: [[[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]] }, identity);
const island = projectShape(
  "island",
  { type: "MultiPolygon", coordinates: [[[[20, 0], [22, 0], [22, 2], [20, 2], [20, 0]]], [[[30, 0], [32, 0], [32, 2], [30, 2], [30, 0]]]] },
  identity,
);

describe("pointInShape", () => {
  it("riconosce interno, esterno e buco", () => {
    expect(pointInShape(outer, 1, 1)).toBe(true);
    expect(pointInShape(outer, 5, 5)).toBe(false);
    expect(pointInShape(outer, 11, 5)).toBe(false);
  });

  it("gestisce i poligoni multipli", () => {
    expect(pointInShape(island, 31, 1)).toBe(true);
    expect(pointInShape(island, 25, 1)).toBe(false);
  });

  it("calcola l'area togliendo i buchi", () => {
    expect(outer.area).toBeCloseTo(96);
  });
});

describe("HitIndex", () => {
  const index = new HitIndex([outer, enclave, island], 3);

  it("trova la provincia sotto il punto", () => {
    expect(index.find(1, 9)?.id).toBe("outer");
    expect(index.find(5, 5)?.id).toBe("enclave");
    expect(index.find(21, 1)?.id).toBe("island");
  });

  it("restituisce null sul mare", () => {
    expect(index.find(15, 5)).toBeNull();
    expect(index.find(-50, -50)).toBeNull();
  });
});
