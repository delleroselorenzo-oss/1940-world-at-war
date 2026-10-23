import { describe, expect, it } from "vitest";
import { COMBAT } from "../data/combat.js";
import { UNIT_TYPES } from "../data/units.js";
import { flatKm } from "../nav/grid.js";
import { applyDamage, armyDamage, armyHealth, contactFraction, engagements, lerp } from "./combat.js";
import { atWar } from "./diplomacy.js";
import { advance, createGame } from "./engine.js";
import { armyPosition } from "./movement.js";
import { applyOrder, wouldStartWar, type Order, type World } from "./orders.js";
import type { Army, GameState } from "./state.js";
import { cell, testWorld } from "./testMaps.js";

const world = testWorld();
const { map } = world;
const center = (id: string) => map.provinces.find((p) => p.id === id)!.center;

function newGame(w: World = world) {
  const game = createGame(w.map, { playerNation: "AAA", realNowMs: 0 });
  for (const n of Object.values(game.nations)) for (const r of Object.keys(n.stock)) n.stock[r as keyof typeof n.stock] = 100_000;
  return game;
}

function order(state: GameState, o: Order, nation = "AAA", w: World = world): GameState {
  const r = applyOrder(state, w, nation, o);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

/** L'armata ferma nel centro della provincia `id`. */
function armyAt(state: GameState, id: string): Army | undefined {
  return Object.values(state.armies).find((a) => !a.move && flatKm(a.position, center(id)) < 1);
}

function withoutArmy(state: GameState, id: string): GameState {
  const armies = { ...state.armies };
  delete armies[id];
  return { ...state, armies };
}

function army(owner: string, units: (keyof typeof UNIT_TYPES)[], hp?: number): Army {
  return {
    id: "x",
    owner,
    position: [0, 0],
    move: null,
    attacking: false,
    halted: null,
    assault: false,
    useRail: false,
    departure: null,
    task: null,
    units: units.map((type, i) => ({ id: `u${i}`, type, hp: hp ?? UNIT_TYPES[type].hp })),
  };
}

describe("guerra", () => {
  it("entrare senza accordi nel territorio altrui fa dichiarare guerra al padrone di casa", () => {
    let game = withoutArmy(newGame(), armyAt(newGame(), "B1")!.id);
    const mine = armyAt(game, "A1")!;
    expect(wouldStartWar(game, world.nav, "AAA", cell(16, 2))).toBe("BBB");
    game = order(game, { type: "move", army: mine.id, target: cell(16, 2) });
    expect(atWar(game, "AAA", "BBB")).toBe(false);
    game = advance(game, world, 2000);
    expect(atWar(game, "AAA", "BBB")).toBe(true);
    expect(game.events.find((e) => e.type === "war")).toMatchObject({ by: "BBB", against: "AAA" });
  });

  it("si può dichiarare guerra prima, ma una volta sola", () => {
    let game = newGame();
    game = order(game, { type: "declareWar", against: "BBB" });
    expect(atWar(game, "BBB", "AAA")).toBe(true);
    expect(applyOrder(game, world, "AAA", { type: "declareWar", against: "BBB" }).ok).toBe(false);
    expect(applyOrder(game, world, "AAA", { type: "declareWar", against: "AAA" }).ok).toBe(false);
  });

  it("con un accordo (diritto di passaggio) non succede nulla", () => {
    let game = withoutArmy(newGame(), armyAt(newGame(), "B1")!.id);
    game = { ...game, relations: { "AAA|BBB": { war: false, passage: true, sharedVision: false } } };
    expect(wouldStartWar(game, world.nav, "AAA", cell(16, 2))).toBeNull();
    game = order(game, { type: "move", army: armyAt(game, "A1")!.id, target: cell(16, 2) });
    game = advance(game, world, 2000);
    expect(atWar(game, "AAA", "BBB")).toBe(false);
  });

  it("il percorso non attraversa paesi terzi", () => {
    const w = testWorld({ neutralBetween: true });
    const game = newGame(w);
    const mine = armyAt(game, "A1")!;
    // Per arrivare in B1 bisognerebbe passare per A3, che è di CCC: non si può.
    expect(applyOrder(game, w, "AAA", { type: "move", army: mine.id, target: cell(16, 2) }).ok).toBe(false);
    // Verso A3 sì: è lì che si va (e si entrerà in guerra con CCC).
    expect(applyOrder(game, w, "AAA", { type: "move", army: mine.id, target: cell(12, 2) }).ok).toBe(true);
  });
});

describe("combattimento", () => {
  it("armate nemiche a contatto si fermano a 5 km e combattono", () => {
    let game = newGame();
    const mine = armyAt(game, "A1")!;
    const theirs = armyAt(game, "B1")!;
    game = order(game, { type: "move", army: mine.id, target: center("B1"), attack: true });
    game = advance(game, world, 2000);
    const a = game.armies[mine.id];
    // Chi marciava si è fermato al contatto, è andato all'assalto ed è stato respinto: chi difende è avvantaggiato.
    expect(game.events.some((e) => e.type === "battle")).toBe(true);
    expect(a).toBeUndefined();
    expect(game.events.find((e) => e.type === "armyDestroyed")).toMatchObject({ owner: "AAA", by: "BBB" });
    expect(game.armies[theirs.id]!.units.length).toBeGreaterThan(0);
    expect(game.provinces.B1!.owner).toBe("BBB");
  });

  it("al contatto l'attaccante si ferma alla distanza d'ingaggio", () => {
    let game = newGame();
    const mine = armyAt(game, "A1")!;
    game = order(game, { type: "move", army: mine.id, target: center("B1"), attack: true });
    // Si fa avanzare a piccoli passi finché l'armata non si ferma.
    while (game.armies[mine.id]!.move && game.time < 2000) game = advance(game, world, game.time + COMBAT.sampleMinutes);
    const a = game.armies[mine.id]!;
    expect(a.attacking).toBe(true);
    expect(flatKm(a.position, center("B1"))).toBeCloseTo(COMBAT.contactKm, 1);
  });

  it("vinto lo scontro, l'attaccante riprende la marcia e conquista la città", () => {
    let game = newGame();
    const mine = armyAt(game, "A1")!;
    const theirs = armyAt(game, "B1")!;
    // Difensori indeboliti: una sola fanteria malconcia.
    game = { ...game, armies: { ...game.armies, [theirs.id]: { ...theirs, units: [{ ...theirs.units[0]!, hp: 3 }] } } };
    game = order(game, { type: "move", army: mine.id, target: center("B1") });
    game = advance(game, world, 2000);
    expect(game.armies[theirs.id]).toBeUndefined();
    const a = game.armies[mine.id]!;
    expect(a.halted).toBeNull();
    expect(flatKm(a.position, center("B1"))).toBeLessThan(0.01);
    expect(game.provinces.B1!.owner).toBe("AAA");
  });

  it("ci si può ritirare: allontanandosi il combattimento finisce", () => {
    let game = newGame();
    const mine = armyAt(game, "A1")!;
    game = order(game, { type: "move", army: mine.id, target: center("B1") });
    while (game.armies[mine.id]!.move) game = advance(game, world, game.time + COMBAT.sampleMinutes);
    game = advance(game, world, game.time + 60); // un paio di tick di battaglia
    const hurt = armyHealth(game.armies[mine.id]!);
    expect(hurt).toBeLessThan(1);
    game = order(game, { type: "move", army: mine.id, target: center("A3") });
    game = advance(game, world, game.time + 600);
    const a = game.armies[mine.id]!;
    expect(a.units.length).toBeGreaterThan(0);
    expect(a.attacking).toBe(false);
    expect(flatKm(armyPosition(a, game.time), center("B1"))).toBeGreaterThan(COMBAT.contactKm);
  });

  it("danno: pieno fino a 10 unità, poi cala, oltre 20 non cresce", () => {
    const inf = (n: number) => armyDamage(army("AAA", Array(n).fill("infantry")), "infantry", true);
    expect(inf(10)).toBeCloseTo(10 * UNIT_TYPES.infantry.attack.infantry);
    expect(inf(15) - inf(10)).toBeLessThan(5 * UNIT_TYPES.infantry.attack.infantry);
    expect(inf(15)).toBeGreaterThan(inf(10));
    expect(inf(30)).toBeCloseTo(inf(20));
  });

  it("efficienza: a metà salute il danno è il 60%", () => {
    const full = armyDamage(army("AAA", ["infantry", "infantry"]), "infantry", false);
    const half = armyDamage(army("AAA", ["infantry", "infantry"], UNIT_TYPES.infantry.hp / 2), "infantry", false);
    expect(half / full).toBeCloseTo(0.6);
  });

  it("il danno colpisce prima l'unità più malconcia, così le perdite arrivano una alla volta", () => {
    const units = army("AAA", ["infantry", "infantry", "lightTank"]).units;
    units[1]!.hp = 5;
    const left = applyDamage(units, { infantry: 8, armored: 0 });
    expect(left).toHaveLength(2);
    expect(left[0]!.hp).toBe(12);
    expect(left[1]!.type).toBe("lightTank");
  });

  it("un'armata fermata al contatto resta a contatto anche alle latitudini europee", () => {
    // Marce da varie direzioni verso un nemico fermo, dal Mediterraneo alla Scandinavia.
    const base = newGame();
    const relations = { "AAA|BBB": { war: true, passage: false, sharedVision: false } };
    for (const lat of [38, 45, 52.4, 60, 66])
      for (let deg = 0; deg < 360; deg += 15) {
        const foe: [number, number] = [16.9, lat];
        const rad = (deg * Math.PI) / 180;
        const a0: [number, number] = [16.9 + 0.2 * Math.cos(rad), lat + 0.1 * Math.sin(rad) + 0.01];
        const f = contactFraction(a0, foe, foe, foe, COMBAT.contactKm)!;
        const mine = { ...army("AAA", ["infantry"]), id: "m", position: lerp(a0, foe, f) };
        const theirs = { ...army("BBB", ["infantry"]), id: "t", position: foe };
        const game = { ...base, armies: { m: mine, t: theirs }, relations };
        expect(engagements(game, 0).get("m"), `lat ${lat}, ${deg}°`).toEqual(["t"]);
      }
  });

  it("contatto tra due armate che si vengono incontro", () => {
    // Distanti 20 km lungo l'equatore, ognuna fa 10 km verso l'altra: si toccano a 5 km, cioè a 3/4 del tragitto.
    const km = 1 / 111.32;
    const f = contactFraction([0, 0], [10 * km, 0], [20 * km, 0], [10 * km, 0], 5);
    expect(f).toBeCloseTo(0.75, 3);
    expect(contactFraction([0, 0], [0, 0], [3 * km, 0], [3 * km, 0], 5)).toBeNull(); // già vicine: nessun nuovo contatto
  });
});

describe("conquista", () => {
  it("passando dal centro di una provincia senza difensori la si conquista", () => {
    let game = withoutArmy(newGame(), armyAt(newGame(), "B1")!.id);
    game = { ...game, production: { B1: [{ unitType: "infantry", durationMinutes: 1500, finishesAt: 1500 }] } };
    game = order(game, { type: "move", army: armyAt(game, "A1")!.id, target: cell(19, 2) });
    game = advance(game, world, 1400); // prima del cambio giorno, quando il morale risale
    expect(game.provinces.B1).toEqual({ owner: "AAA", morale: COMBAT.conqueredMorale });
    expect(game.production.B1).toBeUndefined();
    expect(game.events.find((e) => e.type === "conquest")).toMatchObject({ province: "B1", from: "BBB", to: "AAA" });
    // Le province rurali attraversate senza passare dal loro centro restano a chi le aveva.
    expect(game.provinces.A3!.owner).toBe("AAA");
  });

  it("dopo la conquista il morale risale ogni giorno", () => {
    let game = withoutArmy(newGame(), armyAt(newGame(), "B1")!.id);
    game = order(game, { type: "move", army: armyAt(game, "A1")!.id, target: cell(19, 2) });
    game = advance(game, world, 1440 * 4);
    const morale = game.provinces.B1!.morale;
    expect(morale).toBeGreaterThan(COMBAT.conqueredMorale);
    expect(morale).toBeLessThan(100);
  });

  it("un'armata ferma nel proprio territorio guarisce", () => {
    let game = newGame();
    const mine = armyAt(game, "A1")!;
    game = { ...game, armies: { ...game.armies, [mine.id]: { ...mine, units: mine.units.map((u) => ({ ...u, hp: 5 })) } } };
    const before = armyHealth(game.armies[mine.id]!);
    game = advance(game, world, 300);
    expect(armyHealth(game.armies[mine.id]!)).toBeGreaterThan(before);
  });

  it("combattere a passi o in un colpo dà lo stesso risultato", () => {
    let game = newGame();
    game = order(game, { type: "move", army: armyAt(game, "A1")!.id, target: center("B1") });
    game = order(game, { type: "recruit", province: "A1", unitType: "lightTank" });
    let stepped = game;
    for (let t = 0; t <= 2500; t += 11) stepped = advance(stepped, world, t);
    stepped = advance(stepped, world, 2500);
    const once = advance(game, world, 2500);
    expect(stepped.armies).toEqual(once.armies);
    expect(stepped.provinces).toEqual(once.provinces);
    expect(stepped.events).toEqual(once.events);
  });
});
