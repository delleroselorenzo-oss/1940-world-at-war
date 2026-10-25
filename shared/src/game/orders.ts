import { BUILDING_TYPES, type BuildingId } from "../data/buildings.js";
import { DIPLOMACY } from "../data/diplomacy.js";
import { TRADE } from "../data/economy.js";
import { isAircraftType, productionType, type ProducibleId } from "../data/air.js";
import { UNIT_TYPES } from "../data/units.js";
import type { LngLat, MainResourceId, MapData, NationId, ProvinceId, ResourceId } from "../map/types.js";
import { provinceIdAt } from "../nav/grid.js";
import type { NavData } from "../nav/types.js";
import {
  addChatMessage,
  applyAgreement,
  atWar,
  botAnswer,
  closeProposal,
  hasEmbargo,
  isHuman,
  logEvent,
  mayEnter,
  pairKey,
  proposalMissing,
  relationOf,
  startWar,
} from "./diplomacy.js";
import { abortStrike, planStrike, startStrike, startTransfer, transferMissing } from "./air.js";
import { buildOptions, recruitMinutes, recruitMissing } from "./buildings.js";
import { canAfford, pay, refund } from "./economy.js";
import { mapIndex } from "./mapIndex.js";
import { cancelMarketOrder, marketOrderMissing, placeMarketOrder, roundPrice } from "./market.js";
import { armyPosition, moverOf, scheduleRoute } from "./movement.js";
import { planRoute } from "./routing.js";
import type { AgreementKind, Army, ArmyId, GameState, ProposalKind, SquadronId, WorkType } from "./state.js";
import { importCapacityPerDay } from "./trade.js";
import { availableWorks } from "./works.js";

// Ordini dei giocatori. Ogni ordine viene validato qui: oggi lo usa il browser,
// domani il server, che non dovrà mai fidarsi del client.

export type Order =
  /** Arruola un'unità o costruisce un aereo in una città (gli aerei escono in una squadriglia alla base della città). */
  | { type: "recruit"; province: ProvinceId; unitType: ProducibleId }
  /** Trasferisce una squadriglia a terra in un'altra base entro la portata. */
  | { type: "fly"; squadron: SquadronId; base: ProvinceId }
  /** Attacco aereo a un'armata nemica (anche a una squadriglia in volo: cambia rotta). */
  | { type: "airStrike"; squadron: SquadronId; target: ArmyId }
  /** Annulla l'attacco: la squadriglia rientra (o atterra allo scalo verso cui volava). */
  | { type: "cancelStrike"; squadron: SquadronId }
  /**
   * Marcia verso un punto. `attack`: al contatto va all'assalto ("Attacca") invece di difendersi ("Muovi").
   * `delayMinutes`: parte dopo questo tempo ("Ritarda"); intanto resta ferma dov'è.
   * `rail`: può prendere il treno dove fa guadagnare tempo.
   */
  | { type: "move"; army: ArmyId; target: LngLat; attack?: boolean; delayMinutes?: number; rail?: boolean }
  | { type: "stop"; army: ArmyId }
  | { type: "declareWar"; against: NationId }
  | { type: "work"; army: ArmyId; work: WorkType }
  | { type: "cancelWork"; army: ArmyId }
  /** Costruisce il prossimo livello di un edificio nella provincia (non quelli del genio). */
  | { type: "build"; province: ProvinceId; building: BuildingId }
  /** Annulla la costruzione in corso: le risorse tornano indietro. */
  | { type: "cancelBuild"; province: ProvinceId }
  /** Contratto con il mercato estero: quanto comprare al giorno (0 = nessun contratto). */
  | { type: "setImport"; resource: ResourceId; perDay: number }
  /** Proposta diplomatica: un bot risponde subito, un giocatore entro la scadenza. */
  | { type: "propose"; to: NationId; kind: ProposalKind }
  | { type: "answerProposal"; id: string; accept: boolean }
  | { type: "withdrawProposal"; id: string }
  /** Revoca un accordo (passaggio, visione condivisa, alleanza): non serve il consenso dell'altro. */
  | { type: "revokeAgreement"; with: NationId; kind: AgreementKind }
  | { type: "setEmbargo"; against: NationId; on: boolean }
  | { type: "sendMessage"; to: NationId; text: string }
  /** Ordine in borsa: vendere o comprare `amount` unità a `price` di denaro l'una. */
  | { type: "placeMarketOrder"; side: "buy" | "sell"; resource: MainResourceId; amount: number; price: number }
  | { type: "cancelMarketOrder"; id: string };

export type OrderResult = { ok: true; state: GameState } | { ok: false; error: string };

export interface World {
  map: MapData;
  nav: NavData;
}

/**
 * Applica un ordine della nazione `nation` al minuto `state.time`
 * (chi chiama deve prima portare la partita all'ora attuale con `advance`).
 */
export function applyOrder(state: GameState, world: World, nation: NationId, order: Order): OrderResult {
  switch (order.type) {
    case "recruit":
      return recruit(state, world.map, nation, order.province, order.unitType);
    case "move":
      return move(state, world.nav, nation, order.army, order.target, order.attack ?? false, order.delayMinutes ?? 0, order.rail ?? false);
    case "fly":
      return flyTo(state, world.map, nation, order.squadron, order.base);
    case "airStrike":
      return airStrike(state, world.map, nation, order.squadron, order.target);
    case "cancelStrike":
      return cancelStrike(state, world.map, nation, order.squadron);
    case "stop":
      return stop(state, nation, order.army);
    case "declareWar":
      return declareWar(state, world.map, nation, order.against);
    case "work":
      return work(state, world, nation, order.army, order.work);
    case "cancelWork":
      return cancelWork(state, nation, order.army);
    case "build":
      return build(state, world.map, nation, order.province, order.building);
    case "cancelBuild":
      return cancelBuild(state, nation, order.province);
    case "setImport":
      return setImport(state, world.map, nation, order.resource, order.perDay);
    case "propose":
      return propose(state, nation, order.to, order.kind);
    case "answerProposal":
      return answerProposal(state, nation, order.id, order.accept);
    case "withdrawProposal":
      return withdrawProposal(state, nation, order.id);
    case "revokeAgreement":
      return revokeAgreement(state, nation, order.with, order.kind);
    case "setEmbargo":
      return setEmbargo(state, world.map, nation, order.against, order.on);
    case "sendMessage":
      return sendMessage(state, nation, order.to, order.text);
    case "placeMarketOrder":
      return marketOrder(state, nation, order.side, order.resource, order.amount, order.price);
    case "cancelMarketOrder":
      return cancelOrder(state, nation, order.id);
  }
}

function recruit(state: GameState, map: MapData, nation: NationId, provinceId: ProvinceId, unitType: ProducibleId): OrderResult {
  const province = mapIndex(map).provinces.get(provinceId);
  const type = isProducible(unitType) ? productionType(unitType) : null;
  if (!province || !type) return fail("Provincia o unità sconosciuta.");
  if (state.provinces[provinceId]?.owner !== nation) return fail("Puoi arruolare solo nelle tue province.");
  if (province.type !== "urban") return fail("Si arruola solo nelle città.");
  const missing = recruitMissing(state, provinceId, unitType);
  if (missing) return fail(missing);
  const stock = state.nations[nation]!.stock;
  if (!canAfford(stock, type.cost)) return fail("Risorse insufficienti.");

  const nextStock = { ...stock };
  pay(nextStock, type.cost);
  const queue = state.production[provinceId] ?? [];
  const durationMinutes = recruitMinutes(state, provinceId, unitType);
  const item = { unitType, durationMinutes, finishesAt: queue.length === 0 ? state.time + durationMinutes : null };
  return ok({
    ...state,
    nations: { ...state.nations, [nation]: { ...state.nations[nation]!, stock: nextStock } },
    production: { ...state.production, [provinceId]: [...queue, item] },
  });
}

/** Accetta solo identificativi di unità o aerei esistenti (l'ordine può arrivare da un client non affidabile). */
function isProducible(id: string): id is ProducibleId {
  return isAircraftType(id) || id in UNIT_TYPES;
}

function flyTo(state: GameState, map: MapData, nation: NationId, id: SquadronId, base: ProvinceId): OrderResult {
  const current = state.squadrons[id];
  if (!current || current.owner !== nation) return fail("Squadriglia sconosciuta.");
  const missing = transferMissing(state, map, current, base);
  if (missing) return fail(missing);
  const sq = { ...current };
  startTransfer(sq, map, base, state.time);
  return ok({ ...state, squadrons: { ...state.squadrons, [id]: sq } });
}

function airStrike(state: GameState, map: MapData, nation: NationId, id: SquadronId, target: ArmyId): OrderResult {
  const current = state.squadrons[id];
  if (!current || current.owner !== nation) return fail("Squadriglia sconosciuta.");
  const plan = planStrike(state, map, current, target, state.time);
  if (typeof plan === "string") return fail(plan);
  const sq = { ...current };
  startStrike(state, map, sq, plan, state.time);
  return ok({ ...state, squadrons: { ...state.squadrons, [id]: sq } });
}

function cancelStrike(state: GameState, map: MapData, nation: NationId, id: SquadronId): OrderResult {
  const current = state.squadrons[id];
  if (!current || current.owner !== nation) return fail("Squadriglia sconosciuta.");
  if (!current.mission) return fail("Nessun attacco da annullare.");
  const next = { ...state, squadrons: { ...state.squadrons }, events: [...state.events] };
  const sq = { ...current };
  next.squadrons[id] = sq;
  abortStrike(next, map, sq, state.time);
  return ok(next);
}

/**
 * Se un'armata di `nation` marcia verso `target`, con chi entra in guerra?
 * Restituisce la nazione padrona del punto se oggi non c'è guerra né accordo, altrimenti null.
 * Serve all'interfaccia per chiedere conferma prima di dare l'ordine.
 */
export function wouldStartWar(state: GameState, nav: NavData, nation: NationId, target: LngLat): NationId | null {
  const id = provinceIdAt(nav, target);
  const owner = id ? state.provinces[id]?.owner : undefined;
  return owner && !mayEnter(state, nation, owner) ? owner : null;
}

/** Ritardo massimo di una partenza. */
const MAX_DELAY_MINUTES = 48 * 60;

function move(
  state: GameState,
  nav: NavData,
  nation: NationId,
  armyId: ArmyId,
  target: LngLat,
  attack: boolean,
  delayMinutes: number,
  useRail: boolean,
): OrderResult {
  const army = state.armies[armyId];
  if (!army || army.owner !== nation) return fail("Armata non tua.");
  if (!(delayMinutes >= 0 && delayMinutes <= MAX_DELAY_MINUTES)) return fail("Ritardo non valido.");

  // Un'armata in marcia (anche se sta combattendo: è una ritirata) riparte dal punto in cui si trova adesso.
  const from = armyPosition(army, state.time);
  const mover = moverOf(army, useRail);
  const route = planRoute(state, nav, nation, from, target, mover);
  if (!route) return fail("Punto non raggiungibile via terra (senza attraversare paesi terzi).");
  if (route.km < 0.5) return fail("L'armata è già lì.");
  const base = { ...army, position: from, halted: null, task: null, assault: attack, useRail };
  const refunded = refundTask(state, army);
  // Con il ritardo si ferma subito; il percorso si ricalcola alla partenza (nel frattempo la mappa può cambiare).
  const next =
    delayMinutes > 0
      ? { ...base, move: null, departure: { at: state.time + delayMinutes, target }, settledAt: army.move ? state.time : army.settledAt }
      : { ...base, move: scheduleRoute(route, mover, state.time), departure: null };
  return ok({ ...refunded, armies: { ...state.armies, [armyId]: next } });
}

/** Lo stato con le risorse del lavoro in corso dell'armata restituite (se ne aveva pagate). */
function refundTask(state: GameState, army: Army): GameState {
  const cost = army.task?.cost;
  if (!cost) return state;
  const stock = { ...state.nations[army.owner]!.stock };
  refund(stock, cost);
  return { ...state, nations: { ...state.nations, [army.owner]: { ...state.nations[army.owner]!, stock } } };
}

function declareWar(state: GameState, map: MapData, nation: NationId, against: NationId): OrderResult {
  if (against === nation || !map.nations.some((n) => n.id === against)) return fail("Nazione non valida.");
  if (atWar(state, nation, against)) return fail("Siete già in guerra.");
  const next = { ...state, relations: { ...state.relations }, events: [...state.events] };
  startWar(next, nation, against, state.time);
  return ok(next);
}

function stop(state: GameState, nation: NationId, armyId: ArmyId): OrderResult {
  const army = state.armies[armyId];
  if (!army || army.owner !== nation) return fail("Armata non tua.");
  if (!army.move && !army.halted && !army.task && !army.departure) return fail("L'armata è già ferma.");
  // Si ferma dove si trova in questo momento (e non riprenderà la marcia dopo un combattimento).
  return ok({
    ...refundTask(state, army),
    armies: {
      ...state.armies,
      [armyId]: {
        ...army,
        position: armyPosition(army, state.time),
        move: null,
        halted: null,
        task: null,
        departure: null,
        settledAt: army.move ? state.time : army.settledAt,
      },
    },
  });
}

/** Avvia un lavoro sul bersaglio più vicino (ponte, fiume, il punto dov'è l'armata o la sua provincia). */
function work(state: GameState, world: World, nation: NationId, armyId: ArmyId, type: WorkType): OrderResult {
  const army = state.armies[armyId];
  if (!army || army.owner !== nation) return fail("Armata non tua.");
  const option = availableWorks(state, world, army, state.time).find((o) => o.work === type);
  if (!option) return fail("Lavoro sconosciuto.");
  if (option.missing || !option.target) return fail(option.missing ?? "Niente su cui lavorare qui.");
  const task = { work: type, target: option.target, startedAt: state.time, finishesAt: state.time + option.minutes, ...(option.cost ? { cost: option.cost } : {}) };
  let nations = state.nations;
  if (option.cost) {
    const stock = { ...state.nations[nation]!.stock };
    pay(stock, option.cost);
    nations = { ...nations, [nation]: { ...nations[nation]!, stock } };
  }
  return ok({ ...state, nations, armies: { ...state.armies, [armyId]: { ...army, task } } });
}

function cancelWork(state: GameState, nation: NationId, armyId: ArmyId): OrderResult {
  const army = state.armies[armyId];
  if (!army || army.owner !== nation) return fail("Armata non tua.");
  if (!army.task) return fail("L'armata non sta lavorando.");
  return ok({ ...refundTask(state, army), armies: { ...state.armies, [armyId]: { ...army, task: null } } });
}

function build(state: GameState, map: MapData, nation: NationId, provinceId: ProvinceId, building: BuildingId): OrderResult {
  const province = mapIndex(map).provinces.get(provinceId);
  if (!province || !BUILDING_TYPES[building]) return fail("Provincia o edificio sconosciuto.");
  if (BUILDING_TYPES[building].byEngineers) return fail("Questo edificio lo costruisce il genio sul posto.");
  const option = buildOptions(state, province, nation).find((o) => o.building === building);
  if (!option) return fail("Qui non si può costruire.");
  if (option.missing) return fail(option.missing);
  const stock = { ...state.nations[nation]!.stock };
  pay(stock, option.cost);
  const construction = { building, level: option.level, startedAt: state.time, finishesAt: state.time + option.minutes, cost: option.cost };
  return ok({
    ...state,
    nations: { ...state.nations, [nation]: { ...state.nations[nation]!, stock } },
    construction: { ...state.construction, [provinceId]: construction },
  });
}

function cancelBuild(state: GameState, nation: NationId, provinceId: ProvinceId): OrderResult {
  const construction = state.construction[provinceId];
  if (state.provinces[provinceId]?.owner !== nation) return fail("Non è una tua provincia.");
  if (!construction) return fail("Nessuna costruzione in corso.");
  const stock = { ...state.nations[nation]!.stock };
  refund(stock, construction.cost);
  const { [provinceId]: _, ...rest } = state.construction;
  return ok({ ...state, nations: { ...state.nations, [nation]: { ...state.nations[nation]!, stock } }, construction: rest });
}

function setImport(state: GameState, map: MapData, nation: NationId, resource: ResourceId, perDay: number): OrderResult {
  if (TRADE.prices[resource] === undefined) return fail("Questa risorsa non si compra all'estero.");
  if (!Number.isFinite(perDay) || perDay < 0 || perDay > TRADE.maxContractPerDay) return fail("Quantità non valida.");
  const n = state.nations[nation]!;
  // Tutti i contratti insieme non possono superare la capacità di importazione di adesso.
  const contracted = Object.entries(n.imports ?? {}).reduce((sum, [r, v]) => (r === resource ? sum : sum + (v ?? 0)), 0);
  const capacity = importCapacityPerDay(map, state, nation).total;
  if (perDay > 0 && contracted + Math.round(perDay) > capacity)
    return fail(`Supera la capacità di importazione: restano ${Math.max(0, Math.floor(capacity - contracted))} al giorno.`);
  const { [resource]: _, ...others } = n.imports ?? {};
  const imports = perDay > 0 ? { ...others, [resource]: Math.round(perDay) } : others;
  return ok({ ...state, nations: { ...state.nations, [nation]: { ...n, imports } } });
}

function propose(state: GameState, nation: NationId, to: NationId, kind: ProposalKind): OrderResult {
  const missing = proposalMissing(state, nation, to, kind);
  if (missing) return fail(missing);
  const next: GameState = { ...state, relations: { ...state.relations }, events: [...state.events] };
  const proposal = { id: `p${next.nextId++}`, from: nation, to, kind, time: state.time, expiresAt: state.time + DIPLOMACY.proposalHours * 60, status: "pending" as const };
  next.proposals = [...state.proposals, proposal];
  // I bot rispondono subito, con due parole nella chat.
  if (!isHuman(state, to)) {
    const answer = botAnswer(state, to, nation, kind);
    if (answer.accept) applyAgreement(next, nation, to, kind, state.time);
    closeProposal(next, proposal.id, answer.accept ? "accepted" : "rejected", state.time);
    addChatMessage(next, to, nation, answer.reason, state.time);
  }
  return ok(next);
}

function answerProposal(state: GameState, nation: NationId, id: string, accept: boolean): OrderResult {
  const p = state.proposals.find((x) => x.id === id);
  if (!p || p.to !== nation) return fail("Proposta sconosciuta.");
  if (p.status !== "pending" || p.expiresAt <= state.time) return fail("La proposta non è più valida.");
  const next: GameState = { ...state, relations: { ...state.relations }, events: [...state.events] };
  if (accept) {
    // Nel frattempo le cose possono essere cambiate (per esempio la pace è già fatta).
    const others = { ...next, proposals: state.proposals.filter((x) => x.id !== id) };
    const missing = proposalMissing(others, p.from, p.to, p.kind);
    if (missing) return fail(missing);
    applyAgreement(next, p.from, p.to, p.kind, state.time);
  }
  closeProposal(next, id, accept ? "accepted" : "rejected", state.time);
  return ok(next);
}

function withdrawProposal(state: GameState, nation: NationId, id: string): OrderResult {
  const p = state.proposals.find((x) => x.id === id);
  if (!p || p.from !== nation || p.status !== "pending") return fail("Proposta sconosciuta.");
  const next = { ...state };
  closeProposal(next, id, "withdrawn", state.time);
  return ok(next);
}

function revokeAgreement(state: GameState, nation: NationId, other: NationId, kind: AgreementKind): OrderResult {
  const r = relationOf(state, nation, other);
  if (kind === "alliance" ? !r.alliance : !r[kind]) return fail("Non c'è questo accordo.");
  const next: GameState = { ...state, relations: { ...state.relations, [pairKey(nation, other)]: { ...r, [kind]: false } }, events: [...state.events] };
  logEvent(next, { time: state.time, type: "revoked", kind, by: nation, against: other });
  return ok(next);
}

function setEmbargo(state: GameState, map: MapData, nation: NationId, against: NationId, on: boolean): OrderResult {
  if (against === nation || !map.nations.some((n) => n.id === against)) return fail("Nazione non valida.");
  if (hasEmbargo(state, nation, against) === on) return fail(on ? "L'embargo c'è già." : "Non c'è nessun embargo.");
  const n = state.nations[nation]!;
  const embargo = on ? [...(n.embargo ?? []), against].sort() : (n.embargo ?? []).filter((x) => x !== against);
  const next: GameState = { ...state, nations: { ...state.nations, [nation]: { ...n, embargo } }, events: [...state.events] };
  logEvent(next, { time: state.time, type: "embargo", by: nation, against, on });
  return ok(next);
}

function sendMessage(state: GameState, nation: NationId, to: NationId, text: string): OrderResult {
  const clean = text.trim();
  if (to === nation || !state.nations[to]) return fail("Nazione non valida.");
  if (!clean) return fail("Messaggio vuoto.");
  if (clean.length > DIPLOMACY.messageMaxLength) return fail(`Al massimo ${DIPLOMACY.messageMaxLength} caratteri.`);
  const next = { ...state };
  addChatMessage(next, nation, to, clean, state.time);
  return ok(next);
}

function marketOrder(state: GameState, nation: NationId, side: "buy" | "sell", resource: MainResourceId, amount: number, price: number): OrderResult {
  const qty = Math.round(amount);
  const p = roundPrice(price);
  const missing = marketOrderMissing(state, nation, side, resource, qty, p);
  if (missing) return fail(missing);
  const next = { ...state };
  placeMarketOrder(next, { id: `m${next.nextId++}`, nation, side, resource, amount: qty, price: p, time: state.time });
  return ok(next);
}

function cancelOrder(state: GameState, nation: NationId, id: string): OrderResult {
  const order = state.market.orders.find((o) => o.id === id);
  if (!order || order.nation !== nation) return fail("Ordine sconosciuto.");
  const next = { ...state };
  cancelMarketOrder(next, id);
  return ok(next);
}

const ok = (state: GameState): OrderResult => ({ ok: true, state });
const fail = (error: string): OrderResult => ({ ok: false, error });
