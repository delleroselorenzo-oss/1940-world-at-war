import { describe, expect, it } from "vitest";
import { haversineKm } from "@waw/shared";
import { PROJECTION_CENTER, project } from "./projection.js";

describe("project", () => {
  it("manda il centro della proiezione nell'origine", () => {
    const [x, y] = project(PROJECTION_CENTER);
    expect(x).toBeCloseTo(0, 6);
    expect(y).toBeCloseTo(0, 6);
  });

  it("mette il nord in alto e l'est a destra", () => {
    const [, yNorth] = project([10, 60]);
    const [xEast] = project([20, 52]);
    expect(yNorth).toBeLessThan(0);
    expect(xEast).toBeGreaterThan(0);
  });

  it("conserva le distanze vicino al centro (Berlino–Praga)", () => {
    const berlin: [number, number] = [13.4, 52.52];
    const prague: [number, number] = [14.42, 50.08];
    const [x1, y1] = project(berlin);
    const [x2, y2] = project(prague);
    expect(Math.hypot(x2 - x1, y2 - y1)).toBeCloseTo(haversineKm(berlin, prague), -1);
  });
});
