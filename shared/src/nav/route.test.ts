import { describe, expect, it } from "vitest";
import { cell, testWorld } from "../game/testMaps.js";
import { encodeNav, decodeNav } from "./codec.js";
import { provinceIdAt, segmentClear } from "./grid.js";
import { findRoute } from "./route.js";

const { nav } = testWorld();
const anywhere = () => true;
const roadCrossesAt = (points: [number, number][], lng: number) =>
  points.some((p, i) => i > 0 && (points[i - 1]![0] - lng) * (p[0] - lng) <= 0 && Math.abs(p[1] - cell(0, 2)[1]) < 1e-9);

describe("griglia", () => {
  it("sa a quale provincia appartiene un punto", () => {
    expect(provinceIdAt(nav, cell(1, 0))).toBe("A1");
    expect(provinceIdAt(nav, cell(12, 4))).toBe("A3");
    expect(provinceIdAt(nav, cell(20, 1))).toBeNull(); // mare
  });

  it("il fiume blocca la linea retta fuori strada", () => {
    expect(segmentClear(nav, cell(6, 0), cell(8, 4), anywhere)).toBe(true);
    expect(segmentClear(nav, cell(8, 0), cell(11, 0), anywhere)).toBe(false);
  });

  it("codifica e decodifica senza perdite", () => {
    const back = decodeNav(JSON.parse(JSON.stringify(encodeNav(nav))));
    expect(Array.from(back.grid.province)).toEqual(Array.from(nav.grid.province));
    expect(Array.from(back.roads.edgeBridge)).toEqual(Array.from(nav.roads.edgeBridge));
    expect(Array.from(back.roads.nodeCell)).toEqual(Array.from(nav.roads.nodeCell));
  });
});

describe("findRoute", () => {
  it("fuori strada va in linea retta se nulla lo impedisce", () => {
    const route = findRoute(nav, cell(5, 0), cell(8, 0), { canEnter: anywhere })!;
    expect(route.points).toHaveLength(2);
    expect(route.onRoad).toEqual([false]);
  });

  it("per andare lontano preferisce la strada, più veloce", () => {
    const route = findRoute(nav, cell(0, 2), cell(8, 2), { canEnter: anywhere })!;
    expect(route.onRoad.filter(Boolean).length).toBeGreaterThan(0);
  });

  it("attraversa il fiume solo sul ponte", () => {
    const route = findRoute(nav, cell(7, 0), cell(12, 0), { canEnter: anywhere })!;
    expect(route).not.toBeNull();
    // Deve scendere fino alla strada (riga 2) per passare il fiume a lng = 1,0.
    expect(roadCrossesAt(route.points, 1.0)).toBe(true);
  });

  it("senza ponte (o con il ponte chiuso) l'altra sponda non è raggiungibile", () => {
    const noBridge = testWorld({ withBridge: false }).nav;
    expect(findRoute(noBridge, cell(7, 0), cell(12, 0), { canEnter: anywhere })).toBeNull();
    expect(findRoute(nav, cell(7, 0), cell(12, 0), { canEnter: anywhere, closedBridges: new Set([0]) })).toBeNull();
  });

  it("non entra in celle vietate né in mare", () => {
    const onlyA = (c: number) => nav.grid.province[c]! !== 4; // 4 = B1
    expect(findRoute(nav, cell(0, 2), cell(17, 2), { canEnter: onlyA })).toBeNull();
    expect(findRoute(nav, cell(0, 2), cell(22, 2), { canEnter: anywhere })).toBeNull(); // isola
  });
});
