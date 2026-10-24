import { describe, expect, it } from "vitest";
import { DIPLOMACY } from "../data/diplomacy.js";
import { ECONOMY } from "../data/economy.js";
import { atWar, hasAgreement, inTruce, mayEnter, pairKey, relationOf, tradeBlocked } from "./diplomacy.js";
import { advance, createGame } from "./engine.js";
import { applyOrder, type Order, type World } from "./orders.js";
import type { GameState } from "./state.js";
import { testWorld } from "./testMaps.js";
import { importCapacityPerDay } from "./trade.js";

const world: World = testWorld();
const HOUR = 60;
const DAY = ECONOMY.dayMinutes;

/** AAA è il giocatore; BBB è un bot (risponde subito) oppure, con `bothHuman`, un altro giocatore. */
function newGame(bothHuman = false): GameState {
  const game = { ...createGame(world.map, { playerNation: "AAA", realNowMs: 0 }), armies: {} };
  return bothHuman ? { ...game, playerNation: "BBB" } : game;
}

function order(state: GameState, o: Order, nation = "AAA"): GameState {
  const r = applyOrder(state, world, nation, o);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

function error(state: GameState, o: Order, nation = "AAA"): string {
  const r = applyOrder(state, world, nation, o);
  if (r.ok) throw new Error("L'ordine doveva fallire");
  return r.error;
}

const at = (state: GameState, minutes: number) => advance(state, world, minutes);

describe("proposte ai bot", () => {
  it("il bot accetta la tregua solo dopo un giorno di guerra, e lo dice in chat", () => {
    let g = order(newGame(), { type: "declareWar", against: "BBB" });
    g = order(g, { type: "propose", to: "BBB", kind: "truce" });
    expect(atWar(g, "AAA", "BBB")).toBe(true);
    expect(g.proposals.at(-1)?.status).toBe("rejected");
    expect(g.chats[pairKey("AAA", "BBB")]?.at(-1)?.from).toBe("BBB");

    g = at(g, DAY);
    g = order(g, { type: "propose", to: "BBB", kind: "truce" });
    expect(atWar(g, "AAA", "BBB")).toBe(false);
    expect(inTruce(g, "AAA", "BBB")).toBe(true);
  });

  it("finita la tregua la guerra riprende da sola", () => {
    let g = order(newGame(), { type: "declareWar", against: "BBB" });
    g = order(at(g, DAY), { type: "propose", to: "BBB", kind: "truce" });
    g = at(g, g.time + DIPLOMACY.truceDays * DAY + HOUR);
    expect(atWar(g, "AAA", "BBB")).toBe(true);
    expect(g.events.some((e) => e.type === "truceEnded")).toBe(true);
  });

  it("dopo la pace le armate hanno un giorno per ritirarsi senza far ripartire la guerra", () => {
    let g = order(newGame(), { type: "declareWar", against: "BBB" });
    g = order(at(g, 4 * DAY), { type: "propose", to: "BBB", kind: "peace" });
    expect(atWar(g, "AAA", "BBB")).toBe(false);
    expect(mayEnter(g, "AAA", "BBB")).toBe(true);
    g = at(g, g.time + DIPLOMACY.withdrawHours * HOUR + HOUR);
    expect(mayEnter(g, "AAA", "BBB")).toBe(false);
  });

  it("il bot condivide la mappa ma il passaggio lo dà solo agli alleati", () => {
    let g = order(newGame(), { type: "propose", to: "BBB", kind: "sharedVision" });
    expect(hasAgreement(g, "AAA", "BBB", "sharedVision")).toBe(true);
    g = order(g, { type: "propose", to: "BBB", kind: "passage" });
    expect(hasAgreement(g, "AAA", "BBB", "passage")).toBe(false);
    g = order(g, { type: "propose", to: "BBB", kind: "alliance" });
    expect(hasAgreement(g, "AAA", "BBB", "alliance")).toBe(false);
  });
});

describe("proposte tra giocatori", () => {
  it("la proposta aspetta la risposta e si accetta", () => {
    let g = order(newGame(true), { type: "propose", to: "BBB", kind: "alliance" });
    const p = g.proposals.at(-1)!;
    expect(p.status).toBe("pending");
    expect(error(g, { type: "propose", to: "BBB", kind: "alliance" })).toMatch(/già una proposta/);
    expect(error(g, { type: "answerProposal", id: p.id, accept: true }, "AAA")).toMatch(/sconosciuta/);
    g = order(g, { type: "answerProposal", id: p.id, accept: true }, "BBB");
    expect(relationOf(g, "AAA", "BBB").alliance).toBe(true);
    // L'alleanza vale come passaggio: si entra senza guerra.
    expect(hasAgreement(g, "AAA", "BBB", "passage")).toBe(true);
    expect(mayEnter(g, "AAA", "BBB")).toBe(true);
  });

  it("senza risposta la proposta scade", () => {
    let g = order(newGame(true), { type: "propose", to: "BBB", kind: "sharedVision" });
    g = at(g, DIPLOMACY.proposalHours * HOUR + HOUR);
    expect(g.proposals.at(-1)?.status).toBe("expired");
  });

  it("la guerra fa cadere gli accordi, che si possono anche revocare", () => {
    let g = order(newGame(true), { type: "propose", to: "BBB", kind: "sharedVision" });
    g = order(g, { type: "answerProposal", id: g.proposals.at(-1)!.id, accept: true }, "BBB");
    g = order(g, { type: "revokeAgreement", with: "AAA", kind: "sharedVision" }, "BBB");
    expect(hasAgreement(g, "AAA", "BBB", "sharedVision")).toBe(false);

    g = order(g, { type: "propose", to: "BBB", kind: "alliance" });
    g = order(g, { type: "answerProposal", id: g.proposals.at(-1)!.id, accept: true }, "BBB");
    g = order(g, { type: "declareWar", against: "BBB" });
    expect(relationOf(g, "AAA", "BBB").alliance).toBeFalsy();
  });

  it("si scrivono in chat", () => {
    const g = order(newGame(true), { type: "sendMessage", to: "BBB", text: "  Ciao!  " });
    expect(g.chats[pairKey("AAA", "BBB")]).toEqual([{ time: 0, from: "AAA", text: "Ciao!" }]);
    expect(error(g, { type: "sendMessage", to: "BBB", text: "   " })).toMatch(/vuoto/);
  });
});

describe("embargo", () => {
  it("blocca il commercio e le importazioni via terra attraverso quella nazione", () => {
    // A2 confina con B1.
    const map = {
      ...world.map,
      provinces: world.map.provinces.map((p) =>
        p.id === "A2"
          ? { ...p, neighbors: [{ id: "B1", distanceKm: 100 }] }
          : p.id === "B1"
            ? { ...p, neighbors: [{ id: "A2", distanceKm: 100 }] }
            : p,
      ),
    };
    const base = newGame();
    const before = importCapacityPerDay(map, base, "AAA").overland;
    const g = order(base, { type: "setEmbargo", against: "BBB", on: true });
    expect(tradeBlocked(g, "BBB", "AAA")).toBe(true);
    expect(before).toBeGreaterThan(0);
    expect(importCapacityPerDay(map, g, "AAA").overland).toBe(0);
    expect(tradeBlocked(order(g, { type: "setEmbargo", against: "BBB", on: false }), "AAA", "BBB")).toBe(false);
  });
});
