import { describe, expect, it } from "vitest";
import { MOVEMENT } from "../data/movement.js";
import { UNIT_TYPES } from "../data/units.js";
import { flatKm } from "../nav/grid.js";
import { advance, createGame } from "./engine.js";
import { armyPosition, arrivalTime } from "./movement.js";
import { applyOrder, type Order } from "./orders.js";
import type { GameState } from "./state.js";
import { cell, testWorld } from "./testMaps.js";

const world = testWorld();
const { map } = world;

/** Partita di prova con scorte abbondanti, così l'arruolamento non dipende dalla produzione. */
function newGame() {
  const game = createGame(map, { playerNation: "AAA", realNowMs: 0 });
  for (const n of Object.values(game.nations)) for (const r of Object.keys(n.stock)) n.stock[r as keyof typeof n.stock] = 100_000;
  return game;
}

function order(state: GameState, o: Order): GameState {
  const r = applyOrder(state, world, "AAA", o);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

/** L'armata iniziale di AAA nella capitale A1. */
function capitalArmy(state: GameState) {
  const center = map.provinces.find((p) => p.id === "A1")!.center;
  return Object.values(state.armies).find((a) => a.owner === "AAA" && !a.move && flatKm(a.position, center) < 1)!;
}

// L'armata della capitale ha fanteria e artiglieria: va alla velocità dell'artiglieria.
const speed = UNIT_TYPES.artillery.speedKmh;

describe("movimento", () => {
  it("si può fermare in qualsiasi punto, non solo nei centri delle province", () => {
    let game = newGame();
    const army = capitalArmy(game);
    const target = cell(3, 0); // un angolo qualsiasi di A1
    game = order(game, { type: "move", army: army.id, target });
    const end = advance(game, map, arrivalTime(game.armies[army.id]!)!);
    expect(end.armies[army.id]!.position).toEqual(target);
    expect(end.armies[army.id]!.move).toBeNull();
  });

  it("fuori strada va a metà velocità", () => {
    let game = newGame();
    const army = capitalArmy(game);
    const from = army.position;
    const target = cell(2, 0); // due celle a nord, senza strada
    game = order(game, { type: "move", army: army.id, target });
    const minutes = arrivalTime(game.armies[army.id]!)!;
    expect(minutes).toBeCloseTo((flatKm(from, target) / (speed * MOVEMENT.offRoadFactor)) * 60, 5);
  });

  it("durante la marcia la posizione scorre lungo il percorso", () => {
    let game = newGame();
    const army = capitalArmy(game);
    game = order(game, { type: "move", army: army.id, target: cell(8, 2) });
    const moving = game.armies[army.id]!;
    const half = arrivalTime(moving)! / 2;
    const [lng] = armyPosition(moving, half);
    expect(lng).toBeGreaterThan(army.position[0]);
    expect(lng).toBeLessThan(cell(8, 2)[0]);
  });

  it("fermata: si ferma subito dov'è", () => {
    let game = newGame();
    const army = capitalArmy(game);
    game = order(game, { type: "move", army: army.id, target: cell(8, 2) });
    game = advance(game, map, 60);
    const here = armyPosition(game.armies[army.id]!, 60);
    game = order(game, { type: "stop", army: army.id });
    expect(game.armies[army.id]!.move).toBeNull();
    expect(game.armies[army.id]!.position).toEqual(here);
  });

  it("il fiume si attraversa sul ponte: la strada fa un giro più lungo della linea retta", () => {
    let game = newGame();
    const army = capitalArmy(game);
    game = order(game, { type: "move", army: army.id, target: cell(11, 0) });
    const path = game.armies[army.id]!.move!.points;
    // Passa per la riga della strada (la 2) per attraversare il fiume.
    expect(path.some((p) => Math.abs(p[1] - cell(0, 2)[1]) < 1e-9 && Math.abs(p[0] - cell(10, 2)[0]) < 1e-9)).toBe(true);
  });

  it("rifiuta punti fuori dal proprio territorio, in mare e armate altrui", () => {
    const game = newGame();
    const army = capitalArmy(game);
    expect(applyOrder(game, world, "AAA", { type: "move", army: army.id, target: cell(17, 2) }).ok).toBe(false);
    expect(applyOrder(game, world, "AAA", { type: "move", army: army.id, target: cell(21, 2) }).ok).toBe(false);
    expect(applyOrder(game, world, "BBB", { type: "move", army: army.id, target: cell(3, 0) }).ok).toBe(false);
  });

  it("due armate ferme nello stesso punto si uniscono", () => {
    let game = newGame();
    const first = capitalArmy(game);
    const size = first.units.length;
    const meeting = cell(7, 1);
    game = order(game, { type: "move", army: first.id, target: meeting });
    game = order(game, { type: "recruit", province: "A1", unitType: "infantry" });
    game = advance(game, map, UNIT_TYPES.infantry.productionHours * 60);
    const recruit = capitalArmy(game);
    game = order(game, { type: "move", army: recruit.id, target: meeting });
    game = advance(game, map, game.time + 3000);
    const there = Object.values(game.armies).filter((a) => flatKm(a.position, meeting) < 1);
    expect(there).toHaveLength(1);
    expect(there[0]!.units).toHaveLength(size + 1);
  });

  it("muovere a passi o in un colpo dà lo stesso risultato", () => {
    let game = newGame();
    game = order(game, { type: "move", army: capitalArmy(game).id, target: cell(13, 4) });
    game = order(game, { type: "recruit", province: "A1", unitType: "lightTank" });
    let stepped = game;
    for (let t = 0; t <= 2000; t += 13) stepped = advance(stepped, map, t);
    stepped = advance(stepped, map, 2000);
    const once = advance(game, map, 2000);
    expect(stepped.armies).toEqual(once.armies);
    for (const [id, n] of Object.entries(once.nations))
      for (const [r, v] of Object.entries(n.stock)) expect(stepped.nations[id]!.stock[r as keyof typeof n.stock]).toBeCloseTo(v, 6);
  });
});

describe("arruolamento", () => {
  it("paga subito e l'unità compare in città dopo il tempo di produzione", () => {
    let game = newGame();
    const before = game.nations.AAA!.stock.manpower;
    const size = capitalArmy(game).units.length;
    game = order(game, { type: "recruit", province: "A1", unitType: "infantry" });
    expect(game.nations.AAA!.stock.manpower).toBe(before - UNIT_TYPES.infantry.cost.manpower!);
    const hours = UNIT_TYPES.infantry.productionHours * 60;
    expect(capitalArmy(advance(game, map, hours - 1)).units).toHaveLength(size);
    expect(capitalArmy(advance(game, map, hours)).units).toHaveLength(size + 1);
  });

  it("la coda produce un'unità dopo l'altra", () => {
    let game = newGame();
    const size = capitalArmy(game).units.length;
    game = order(game, { type: "recruit", province: "A1", unitType: "infantry" });
    game = order(game, { type: "recruit", province: "A1", unitType: "infantry" });
    const hours = UNIT_TYPES.infantry.productionHours * 60;
    expect(capitalArmy(advance(game, map, hours)).units).toHaveLength(size + 1);
    const done = advance(game, map, 2 * hours);
    expect(capitalArmy(done).units).toHaveLength(size + 2);
    expect(done.production.A1).toBeUndefined();
  });

  it("solo nelle proprie città e con risorse sufficienti", () => {
    const game = newGame();
    expect(applyOrder(game, world, "AAA", { type: "recruit", province: "A2", unitType: "infantry" }).ok).toBe(false);
    expect(applyOrder(game, world, "AAA", { type: "recruit", province: "B1", unitType: "infantry" }).ok).toBe(false);
    const poor = { ...game, nations: { ...game.nations, AAA: { stock: { ...game.nations.AAA!.stock, manpower: 0 } } } };
    expect(applyOrder(poor, world, "AAA", { type: "recruit", province: "A1", unitType: "infantry" }).ok).toBe(false);
  });

  it("le unità consumano risorse ogni giorno", () => {
    const game = newGame();
    const day = advance(game, map, 1440);
    // AAA non produce cibo e la fanteria ne consuma.
    expect(day.nations.AAA!.stock.food).toBeLessThan(game.nations.AAA!.stock.food);
  });
});
