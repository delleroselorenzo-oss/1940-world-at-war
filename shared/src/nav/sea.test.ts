import { describe, expect, it } from "vitest";
import { decodeNav, encodeNav } from "./codec.js";
import { cellCenter } from "./grid.js";
import { findSeaRoute, harborOf, seaZoneAt, straitAt } from "./sea.js";
import type { NavData } from "./types.js";

// Mare di prova da 12×7 celle da 0,1°: un'isola lunga (colonne 5-6, righe 0-4) lo divide a metà;
// si passa solo dallo stretto in basso (colonne 5-6, righe 5-6). Due zone: ovest (colonne 0-5) ed est.
// La provincia P è la cella di terra (5, 2), sull'isola; attracca dal lato ovest.
const W = 12;
const H = 7;

function seaWorld(): NavData {
  const zone = new Uint8Array(W * H);
  const strait = new Uint8Array(W * H);
  const province = new Uint16Array(W * H);
  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
      const i = r * W + c;
      const island = (c === 5 || c === 6) && r <= 4;
      if (island) province[i] = 1;
      else zone[i] = c <= 5 ? 1 : 2;
      if ((c === 5 || c === 6) && r >= 5) strait[i] = 1;
    }
  const harbor = Int32Array.from([2 * W + 4]);
  return {
    mapId: "sea",
    provinceIds: ["P"],
    grid: { bbox: [0, 0, W * 0.1, H * 0.1], step: 0.1, width: W, height: H, province, blocked: new Uint8Array(W * H) },
    roads: { nodes: new Float64Array(), nodeCell: new Int32Array(), edgeA: new Int32Array(), edgeB: new Int32Array(), edgeKind: new Uint8Array(), edgeBridge: new Int32Array() },
    bridges: [],
    rivers: [],
    sea: {
      zone,
      strait,
      zones: [
        { id: "west", name: "Ovest", label: [0.2, 0.3] },
        { id: "east", name: "Est", label: [1, 0.3] },
      ],
      straits: [{ id: "s", name: "Stretto", at: [0.6, 0.1], provinces: ["P"] }],
      harbor,
      borders: [],
    },
  };
}

const at = (nav: NavData, c: number, r: number) => cellCenter(nav, r * W + c);

describe("navigazione", () => {
  it("riconosce zone di mare, stretti e approdi", () => {
    const nav = seaWorld();
    expect(seaZoneAt(nav, at(nav, 1, 1))?.name).toBe("Ovest");
    expect(seaZoneAt(nav, at(nav, 9, 1))?.name).toBe("Est");
    expect(seaZoneAt(nav, at(nav, 5, 2))).toBeNull(); // terra
    expect(straitAt(nav, at(nav, 6, 6))?.name).toBe("Stretto");
    expect(harborOf(nav, "P")).toEqual(at(nav, 4, 2));
  });

  it("gira intorno alla terra passando dallo stretto", () => {
    const nav = seaWorld();
    const route = findSeaRoute(nav, at(nav, 3, 0), at(nav, 8, 0))!;
    expect(route).not.toBeNull();
    // Deve scendere fino alle righe dello stretto (latitudine sotto 0,2°) e tornare su.
    expect(Math.min(...route.points.map((p) => p[1]))).toBeLessThan(0.2);
    expect(route.km).toBeGreaterThan(80);
    // I punti sono pochi: linee rette dove il mare lo permette.
    expect(route.points.length).toBeLessThan(6);
  });

  it("con lo stretto chiuso non si passa", () => {
    const nav = seaWorld();
    expect(findSeaRoute(nav, at(nav, 3, 0), at(nav, 8, 0), { closedStraits: new Set([0]) })).toBeNull();
    expect(findSeaRoute(nav, at(nav, 0, 0), at(nav, 3, 6), { closedStraits: new Set([0]) })).not.toBeNull();
  });

  it("non taglia gli angoli di terra in diagonale", () => {
    const nav = seaWorld();
    // Chiude il passaggio dritto lasciando solo una diagonale tra (4,5)-(5,6): terra in (5,5) e (4,6).
    for (const [c, r] of [[5, 5], [6, 5], [4, 6]] as const) nav.sea!.zone[r * W + c] = 0;
    expect(findSeaRoute(nav, at(nav, 3, 0), at(nav, 8, 0))).toBeNull();
  });

  it("codifica e decodifica il mare senza perdite", () => {
    const nav = seaWorld();
    const back = decodeNav(JSON.parse(JSON.stringify(encodeNav(nav))));
    expect(Array.from(back.sea!.zone)).toEqual(Array.from(nav.sea!.zone));
    expect(Array.from(back.sea!.harbor)).toEqual([2 * W + 4]);
  });
});
