import { describe, expect, it } from "vitest";
import { haversineKm } from "./geo.js";

describe("haversineKm", () => {
  it("è zero per lo stesso punto", () => {
    expect(haversineKm([12.5, 41.9], [12.5, 41.9])).toBe(0);
  });

  it("calcola Roma–Parigi in circa 1.105 km", () => {
    expect(haversineKm([12.4964, 41.9028], [2.3522, 48.8566])).toBeCloseTo(1105, -1);
  });

  it("è simmetrica", () => {
    const a: [number, number] = [13.4, 52.5];
    const b: [number, number] = [37.6, 55.75];
    expect(haversineKm(a, b)).toBe(haversineKm(b, a));
  });
});
