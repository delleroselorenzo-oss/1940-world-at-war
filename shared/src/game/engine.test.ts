import { describe, expect, it } from "vitest";
import { ECONOMY } from "../data/economy.js";
import type { MapData, Province } from "../map/types.js";
import { gameMinutesAt, formatGameTime, withSpeed } from "./clock.js";
import { nationProductionPerDay, provinceProductionPerDay } from "./economy.js";
import { advance, createGame } from "./engine.js";

function province(id: string, nation: string, type: Province["type"], resource: Province["resource"]): Province {
  return { id, name: id, nation, type, resource, isCapital: false, terrain: null, center: [0, 0], areaKm2: 1000, coastal: false, neighbors: [] };
}

const map: MapData = {
  id: "test",
  name: "Test",
  date: "1933-06-01",
  nations: [
    { id: "AAA", name: "A", color: "#f00", capitalProvince: "a_city" },
    { id: "BBB", name: "B", color: "#00f", capitalProvince: "b_city" },
  ],
  provinces: [
    province("a_city", "AAA", "urban", "metal"),
    province("a_farm", "AAA", "rural", "food"),
    province("a_plain", "AAA", "rural", null),
    province("b_city", "BBB", "urban", "oil"),
  ],
};

const start = Date.UTC(2026, 0, 1);

describe("produzione", () => {
  it("città: risorsa principale, denaro e manodopera", () => {
    const p = provinceProductionPerDay(map.provinces[0]!, { owner: "AAA", morale: 100 });
    expect(p.metal).toBe(6000);
    expect(p.money).toBe(3000);
    expect(p.manpower).toBe(1500);
    expect(p.oil).toBe(0);
  });

  it("provincia rurale senza risorsa: più manodopera", () => {
    const p = provinceProductionPerDay(map.provinces[2]!, { owner: "AAA", morale: 100 });
    expect(p.manpower).toBe(ECONOMY.ruralManpowerWithoutResource);
    expect(p.food).toBe(0);
  });

  it("provincia conquistata: un quarto; morale: in proporzione", () => {
    const conquered = provinceProductionPerDay(map.provinces[0]!, { owner: "BBB", morale: 100 });
    expect(conquered.metal).toBe(1500);
    const unhappy = provinceProductionPerDay(map.provinces[0]!, { owner: "AAA", morale: 50 });
    expect(unhappy.metal).toBe(3000);
  });

  it("la nazione somma solo le province che possiede", () => {
    const game = createGame(map, { playerNation: "AAA", realNowMs: start });
    const a = nationProductionPerDay(map, game, "AAA");
    expect(a.metal).toBe(6000);
    expect(a.food).toBe(1500);
    expect(a.oil).toBe(0);
  });
});

describe("createGame", () => {
  it("ogni città ha un'armata iniziale, più grande nella capitale", () => {
    const game = createGame(map, { playerNation: "AAA", realNowMs: start });
    const armies = Object.values(game.armies);
    expect(armies.map((a) => a.owner).sort()).toEqual(["AAA", "BBB"]);
    expect(armies.every((a) => a.position === map.provinces.find((p) => p.nation === a.owner && p.type === "urban")!.center)).toBe(true);
    expect(armies.every((a) => a.units.length > 0 && !a.move)).toBe(true);
  });

  it("ogni provincia appartiene alla sua nazione e le scorte iniziali valgono alcuni giorni", () => {
    const game = createGame(map, { playerNation: "AAA", realNowMs: start });
    expect(game.provinces.b_city!.owner).toBe("BBB");
    expect(game.nations.AAA!.stock.metal).toBe(6000 * ECONOMY.startingStockDays);
    expect(game.time).toBe(0);
  });

  it("rifiuta una nazione inesistente", () => {
    expect(() => createGame(map, { playerNation: "ZZZ", realNowMs: start })).toThrow();
  });
});

describe("advance", () => {
  const game = createGame(map, { playerNation: "AAA", realNowMs: start });

  it("accredita la produzione solo a tick completi", () => {
    const early = advance(game, map, 29);
    expect(early.time).toBe(29);
    expect(early.nations.AAA!.stock.metal).toBe(game.nations.AAA!.stock.metal);
    const after = advance(game, map, 30);
    expect(after.time).toBe(30);
    expect(after.nations.AAA!.stock.metal - game.nations.AAA!.stock.metal).toBeCloseTo(6000 / 48);
  });

  it("un giorno intero aggiunge la produzione giornaliera", () => {
    const after = advance(game, map, 1440);
    expect(after.nations.BBB!.stock.oil - game.nations.BBB!.stock.oil).toBeCloseTo(6000);
  });

  it("non modifica lo stato di partenza", () => {
    const before = game.nations.AAA!.stock.metal;
    advance(game, map, 600);
    expect(game.nations.AAA!.stock.metal).toBe(before);
  });

  it("recuperare in un colpo solo equivale a giocare tick per tick", () => {
    let stepped = game;
    for (let t = 0; t <= 3000; t += 7) stepped = advance(stepped, map, t);
    stepped = advance(stepped, map, 3000);
    const once = advance(game, map, 3000);
    expect(stepped.time).toBe(once.time);
    for (const [id, n] of Object.entries(once.nations))
      for (const [r, v] of Object.entries(n.stock)) expect(stepped.nations[id]!.stock[r as keyof typeof n.stock]).toBeCloseTo(v, 6);
  });

});

describe("orologio", () => {
  const clock = { realAnchorMs: start, gameAnchorMinutes: 0, speed: 1 };

  it("a velocità x1 un minuto reale è un minuto di gioco", () => {
    expect(gameMinutesAt(clock, start + 90 * 60_000)).toBe(90);
  });

  it("cambiare velocità non fa saltare il tempo", () => {
    const later = start + 60 * 60_000;
    const fast = withSpeed(clock, later, 10);
    expect(gameMinutesAt(fast, later)).toBe(60);
    expect(gameMinutesAt(fast, later + 60_000)).toBe(70);
  });

  it("formatta giorno e ora", () => {
    expect(formatGameTime(0)).toBe("Giorno 1, 00:00");
    expect(formatGameTime(1440 + 14 * 60 + 30)).toBe("Giorno 2, 14:30");
  });
});
