import { describe, expect, it } from "vitest";
import { clampToBounds, fitBounds, pan, screenToWorld, worldToScreen, zoomAt } from "./camera.js";

const view = { width: 800, height: 600 };
const bounds = { minX: -1000, minY: -500, maxX: 1000, maxY: 500 };

describe("camera", () => {
  it("fitBounds inquadra tutto e centra", () => {
    const cam = fitBounds(bounds, view, 0);
    expect(cam.scale).toBeCloseTo(0.4);
    expect(worldToScreen(cam, 0, 0)).toEqual([400, 300]);
  });

  it("screenToWorld è l'inverso di worldToScreen", () => {
    const cam = { x: 12, y: -40, scale: 2.5 };
    const [sx, sy] = worldToScreen(cam, 123, -45);
    const [wx, wy] = screenToWorld(cam, sx, sy);
    expect(wx).toBeCloseTo(123);
    expect(wy).toBeCloseTo(-45);
  });

  it("zoomAt tiene fermo il punto sotto il cursore", () => {
    const cam = fitBounds(bounds, view);
    const before = screenToWorld(cam, 600, 150);
    const zoomed = zoomAt(cam, 600, 150, 3, 0.1, 100);
    const after = screenToWorld(zoomed, 600, 150);
    expect(after[0]).toBeCloseTo(before[0]);
    expect(after[1]).toBeCloseTo(before[1]);
    expect(zoomed.scale).toBeCloseTo(cam.scale * 3);
  });

  it("zoomAt rispetta i limiti di scala", () => {
    const cam = { x: 0, y: 0, scale: 1 };
    expect(zoomAt(cam, 0, 0, 100, 0.5, 4).scale).toBe(4);
    expect(zoomAt(cam, 0, 0, 0.01, 0.5, 4).scale).toBe(0.5);
  });

  it("clampToBounds riporta la mappa sullo schermo", () => {
    const cam = pan(fitBounds(bounds, view), 10_000, 0);
    const clamped = clampToBounds(cam, bounds, view);
    const [cx] = screenToWorld(clamped, 400, 300);
    expect(cx).toBeCloseTo(bounds.minX);
  });
});
