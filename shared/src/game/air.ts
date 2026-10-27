import { AIR, AIRCRAFT_TYPES } from "../data/air.js";
import { SHIP_TYPES } from "../data/naval.js";
import { COMBAT } from "../data/combat.js";
import { TERRAIN_RULES } from "../data/terrain.js";
import { ARMOR_CLASSES, UNIT_TYPES } from "../data/units.js";
import type { LngLat, MapData, NationId, Province, ProvinceId } from "../map/types.js";
import { flatKm, provinceIdAt } from "../nav/grid.js";
import { seaZoneAt } from "../nav/sea.js";
import type { NavData } from "../nav/types.js";
import { buildingLevel, fortDamageFactor } from "./buildings.js";
import { applyDamage, armyAntiAir, efficiency, groupWeight, isAttacking, lerp, lowerMorale, moraleDamage, noDamage } from "./combat.js";
import { atWar, hasAgreement, logEvent, viewersOf } from "./diplomacy.js";
import { detected } from "./submarines.js";
import { mapIndex } from "./mapIndex.js";
import { armyPosition } from "./movement.js";
import { terrainAt } from "./terrain.js";
import { sinkConvoy } from "./convoys.js";
import { applyShipDamage, cargoDamage, shipClass } from "./navalCombat.js";
import { fleetHealth, fleetPosition } from "./navy.js";
import type { Aircraft, Army, Fleet, GameState, Squadron, StrikeMission } from "./state.js";

// Aviazione: basi, portata, voli e attacchi delle squadriglie (vedi docs/game-design.md, §9 "Aviazione").
// Ci sono il trasferimento tra basi e l'attacco alle armate e alle flotte nemiche; convoglio e pattuglia arriveranno dopo.
// Una base è una provincia (aeroporto o fabbrica aeronautica) oppure una flotta con una portaerei (la base si muove con lei:
// chi ci vola la insegue, finché la portata basta).

/** Portata della squadriglia: quella dell'aereo che arriva meno lontano. */
export function squadronRangeKm(sq: Squadron): number {
  return Math.min(...sq.aircraft.map((a) => AIRCRAFT_TYPES[a.type].rangeKm));
}

/** Velocità della squadriglia: quella dell'aereo più lento. */
export function squadronSpeedKmh(sq: Squadron): number {
  return Math.min(...sq.aircraft.map((a) => AIRCRAFT_TYPES[a.type].speedKmh));
}

/** Salute complessiva della squadriglia, da 0 a 1. */
export function squadronHealth(sq: Squadron): number {
  let hp = 0;
  let max = 0;
  for (const a of sq.aircraft) {
    hp += a.hp;
    max += AIRCRAFT_TYPES[a.type].hp;
  }
  return max > 0 ? hp / max : 0;
}

/** Aerei che una flotta può ospitare: la somma delle sue portaerei (0 se non ne ha). */
export function carrierCapacity(fleet: Fleet): number {
  return fleet.ships.reduce((n, s) => n + (SHIP_TYPES[s.type].aircraftCapacity ?? 0), 0);
}

/** Aerei che hanno la flotta come base (a bordo o in volo verso di lei), tranne la squadriglia `except`. */
export function carrierLoad(state: GameState, fleetId: string, except?: string): number {
  let n = 0;
  for (const sq of Object.values(state.squadrons)) {
    if (sq.id === except) continue;
    if ((sq.flight ? sq.flight.base : sq.base) === fleetId) n += sq.aircraft.length;
  }
  return n;
}

/** Perché la squadriglia non può avere come base la portaerei (null = può). */
export function carrierMissing(state: GameState, fleet: Fleet, sq: Squadron): string | null {
  if (carrierCapacity(fleet) === 0) return "La flotta non ha portaerei.";
  if (sq.aircraft.some((a) => !AIRCRAFT_TYPES[a.type].carrier)) return "Sulla portaerei salgono solo caccia, bombardieri tattici e aerosiluranti.";
  if (carrierLoad(state, fleet.id, sq.id) + sq.aircraft.length > carrierCapacity(fleet)) return `La portaerei è piena (al massimo ${carrierCapacity(fleet)} aerei).`;
  return null;
}

/**
 * La base (provincia o flotta) è utilizzabile dagli aerei di `nation`? Una provincia serve con un aeroporto o una fabbrica aeronautica,
 * propria o di un alleato; una flotta se ha una portaerei, è propria o di un alleato e (se si indica la squadriglia) c'è posto per lei.
 */
export function isAirBase(state: GameState, baseId: string, nation: NationId, sq?: Squadron): boolean {
  const fleet = state.fleets[baseId];
  const owner = fleet ? fleet.owner : state.provinces[baseId]?.owner;
  if (!owner || (owner !== nation && !hasAgreement(state, owner, nation, "alliance"))) return false;
  if (fleet) return sq ? carrierMissing(state, fleet, sq) === null : carrierCapacity(fleet) > 0;
  return buildingLevel(state, baseId, "airfield") > 0 || buildingLevel(state, baseId, "aircraftFactory") > 0;
}

/** Dove si trova la base al minuto `t` (una portaerei si muove); null se non esiste più. */
export function basePosition(state: Pick<GameState, "fleets">, map: MapData, baseId: string, t: number): LngLat | null {
  const fleet = state.fleets[baseId];
  if (fleet) return fleetPosition(fleet, t);
  return mapIndex(map).provinces.get(baseId)?.center ?? null;
}

/** Portaerei (flotte) dove gli aerei di `nation` possono andare. */
export function carrierBases(state: GameState, nation: NationId): Fleet[] {
  return Object.values(state.fleets).filter((f) => carrierCapacity(f) > 0 && isAirBase(state, f.id, nation));
}

/** Basi disponibili per `nation`. */
export function airBases(state: GameState, map: MapData, nation: NationId): Province[] {
  return map.provinces.filter((p) => isAirBase(state, p.id, nation));
}

/** Distanza dal punto alla base più vicina di `nation` (Infinity se non ne ha). */
function nearestBaseKm(state: GameState, map: MapData, nation: NationId, at: LngLat): number {
  let best = Infinity;
  for (const p of airBases(state, map, nation)) best = Math.min(best, flatKm(at, p.center));
  for (const f of carrierBases(state, nation)) best = Math.min(best, flatKm(at, fleetPosition(f, state.time)));
  return best;
}

/** Minuti di rifornimento alla base: quelli dell'aereo più lento a rifornirsi, accorciati dai livelli dell'aeroporto. */
export function refuelMinutes(state: GameState, sq: Squadron, base: ProvinceId): number {
  const longest = Math.max(...sq.aircraft.map((a) => AIRCRAFT_TYPES[a.type].refuelMinutes));
  const level = Math.max(1, buildingLevel(state, base, "airfield"));
  return Math.round(longest * (1 - AIR.airfieldTimeCutPerLevel * (level - 1)));
}

/** Dove si trova la squadriglia al minuto `t`: alla base (anche una portaerei in navigazione), oppure lungo il volo. */
export function squadronPosition(state: Pick<GameState, "fleets">, sq: Squadron, map: MapData, t: number): LngLat {
  const f = sq.flight;
  if (!f) return basePosition(state, map, sq.base, t) ?? [0, 0];
  if (t >= f.arriveAt) return f.to;
  return lerp(f.from, f.to, Math.max(0, (t - f.departAt) / (f.arriveAt - f.departAt)));
}

/**
 * Quota della squadriglia al minuto `t`, per il disegno: 0 a terra, 1 in quota. Sale dopo il decollo da una base
 * (non quando l'ordine arriva in volo), scende solo avvicinandosi a una base; verso un bersaglio, sopra di lui
 * e da lì verso un'altra meta resta in quota. Solo grafica: non cambia nulla nel gioco.
 */
export function squadronAltitude(state: Pick<GameState, "fleets">, sq: Squadron, map: MapData, t: number): number {
  const f = sq.flight;
  if (!f) return 0;
  const ramp = Math.max(1e-6, Math.min(AIR.climbMinutes, (f.arriveAt - f.departAt) / 2));
  let a = 1;
  const home = basePosition(state, map, sq.base, f.departAt);
  if (home && flatKm(home, f.from) <= AIR.strikeKm) a = Math.min(a, (t - f.departAt) / ramp);
  if (f.base !== null) a = Math.min(a, (f.arriveAt - t) / ramp);
  a = Math.max(0, Math.min(1, a));
  return a * a * (3 - 2 * a);
}

/** Portata che resta alla squadriglia al minuto `t`: tutta a terra; in volo quella che avrà all'arrivo più il tratto ancora da fare. */
export function squadronFuelKm(state: GameState, sq: Squadron, map: MapData, t: number): number {
  const f = sq.flight;
  return f ? f.fuelKm + flatKm(squadronPosition(state, sq, map, t), f.to) : squadronRangeKm(sq);
}

/** Perché la squadriglia non può trasferirsi alla base indicata (null = può). */
export function transferMissing(state: GameState, map: MapData, sq: Squadron, base: string): string | null {
  const to = basePosition(state, map, base, state.time);
  if (!to) return "Base sconosciuta.";
  if (sq.flight) return "La squadriglia è in volo.";
  if (sq.readyAt > state.time) return "La squadriglia si sta rifornendo.";
  if (base === sq.base) return "La squadriglia è già in questa base.";
  const fleet = state.fleets[base];
  if (fleet) {
    if (fleet.owner !== sq.owner && !hasAgreement(state, fleet.owner, sq.owner, "alliance")) return "Non è una portaerei tua o di un alleato.";
    const missing = carrierMissing(state, fleet, sq);
    if (missing) return missing;
  } else if (!isAirBase(state, base, sq.owner)) return "Non è una tua base aerea (serve un aeroporto o una fabbrica aeronautica, tua o di un alleato).";
  const km = flatKm(squadronPosition(state, sq, map, state.time), to);
  if (km > squadronRangeKm(sq)) return `Troppo lontano: ${Math.round(km)} km, la portata è di ${squadronRangeKm(sq)} km.`;
  return null;
}

/** Fa decollare la squadriglia verso la base (va chiamata dopo `transferMissing`). Annulla un attacco in attesa. Modifica `sq`. */
export function startTransfer(state: GameState, sq: Squadron, map: MapData, base: string, t: number): void {
  const from = squadronPosition(state, sq, map, t);
  const to = basePosition(state, map, base, t)!;
  sq.mission = null;
  fly(sq, from, to, base, squadronRangeKm(sq), t);
}

/** Minuti di volo in linea retta da `from` a `to`, alla velocità del più lento. */
export function flightMinutes(sq: Squadron, from: LngLat, to: LngLat): number {
  return Math.max(1, Math.round((flatKm(from, to) / squadronSpeedKmh(sq)) * 60));
}

function fly(sq: Squadron, from: LngLat, to: LngLat, base: string | null, fuelKm: number, t: number) {
  sq.flight = { from, to, base, departAt: t, arriveAt: t + flightMinutes(sq, from, to), fuelKm: fuelKm - flatKm(from, to) };
}

// --- Attacco ---

/** Bersaglio di un attacco: un'armata o una flotta. */
type Target = { kind: "army"; army: Army; owner: NationId } | { kind: "fleet"; fleet: Fleet; owner: NationId };

function targetOf(state: GameState, id: string): Target | undefined {
  const army = state.armies[id];
  if (army) return army.units.length > 0 ? { kind: "army", army, owner: army.owner } : undefined;
  const fleet = state.fleets[id];
  if (fleet) return fleet.ships.length > 0 || (fleet.transport?.army.units.length ?? 0) > 0 || (fleet.convoy?.hp ?? 0) > 0 ? { kind: "fleet", fleet, owner: fleet.owner } : undefined;
  return undefined;
}

function targetPosition(target: Target, t: number): LngLat {
  return target.kind === "army" ? armyPosition(target.army, t) : fleetPosition(target.fleet, t);
}

/** Il bersaglio si può ancora attaccare: esiste, non è distrutto, è di una nazione in guerra con chi attacca e (un sottomarino) è scoperto. */
function validTarget(state: GameState, nation: NationId, target: Target | undefined, t = state.time): target is Target {
  return !!target && atWar(state, nation, target.owner) && (target.kind === "army" || detected(state, viewersOf(state, nation), target.fleet, t));
}

/**
 * Dove incontrare il bersaglio partendo da `from` al minuto `t`: la sua posizione all'ora d'arrivo,
 * prevista lungo la marcia (o la navigazione) che sta facendo (qualche passaggio basta: gli aerei sono molto più veloci).
 */
function aimAt(sq: Squadron, from: LngLat, target: Target, t: number): LngLat {
  let at = targetPosition(target, t);
  for (let i = 0; i < 4; i++) at = targetPosition(target, t + flightMinutes(sq, from, at));
  return at;
}

export interface StrikePlan {
  mission: StrikeMission;
  /** Si va subito sul bersaglio (senza scali). */
  direct: boolean;
}

/**
 * Come attaccare l'armata `targetId` con la squadriglia al minuto `t` (o perché non si può). Il bersaglio dev'essere entro
 * il raggio d'azione (metà della portata) dalla base di decollo; se non lo è, si cercano scali in altre basi (con rifornimento)
 * fino a una base abbastanza vicina. Una squadriglia in volo va direttamente sul bersaglio se è entro il raggio d'azione da dove
 * si trova e se dopo l'attacco la portata rimasta basta per arrivare a una base: niente missioni di sola andata.
 */
export function planStrike(state: GameState, map: MapData, sq: Squadron, targetId: string, t: number): StrikePlan | string {
  const target = targetOf(state, targetId);
  if (!target) return "Bersaglio sconosciuto.";
  if (target.owner === sq.owner) return "Non puoi attaccare le tue forze.";
  if (!atWar(state, sq.owner, target.owner)) return "Puoi attaccare solo armate e flotte delle nazioni con cui sei in guerra.";
  if (!validTarget(state, sq.owner, target, t)) return "Bersaglio non visibile.";
  const range = squadronRangeKm(sq);
  const radius = range / 2;
  const here = squadronPosition(state, sq, map, t);
  const at = aimAt(sq, here, target, t);
  const fuel = squadronFuelKm(state, sq, map, t);

  const direct = sq.flight
    ? flatKm(here, at) <= radius && flatKm(here, at) + nearestBaseKm(state, map, sq.owner, at) <= fuel
    : flatKm(here, at) <= radius;
  if (direct) return { direct: true, mission: { target: targetId, anchor: here, radiusKm: radius, via: [] } };

  // Scali: il percorso più corto tra le basi (ogni tratto entro la portata) fino a una base da cui il bersaglio è nel raggio d'azione.
  const goal = targetPosition(target, t);
  const bases = airBases(state, map, sq.owner).filter((p) => sq.flight || p.id !== sq.base);
  const dist = bases.map((p) => (flatKm(here, p.center) <= fuel ? flatKm(here, p.center) : Infinity));
  const prev = bases.map(() => -1);
  const done = bases.map(() => false);
  for (;;) {
    let i = -1;
    for (let k = 0; k < bases.length; k++) if (!done[k] && dist[k]! < Infinity && (i < 0 || dist[k]! < dist[i]!)) i = k;
    if (i < 0) return "Bersaglio fuori portata: nessuna base raggiungibile da cui arrivarci entro il raggio d'azione.";
    done[i] = true;
    if (flatKm(bases[i]!.center, goal) <= radius) {
      const via: ProvinceId[] = [];
      for (let k = i; k >= 0; k = prev[k]!) via.unshift(bases[k]!.id);
      return { direct: false, mission: { target: targetId, anchor: bases[i]!.center, radiusKm: radius, via } };
    }
    for (let k = 0; k < bases.length; k++) {
      const hop = flatKm(bases[i]!.center, bases[k]!.center);
      if (!done[k] && hop <= range && dist[i]! + hop < dist[k]!) [dist[k], prev[k]] = [dist[i]! + hop, i];
    }
  }
}

/**
 * Avvia l'attacco pianificato con `planStrike` (modifica `sq`, una copia). In volo cambia subito rotta (verso il bersaglio
 * o verso il primo scalo); a terra decolla se è pronta, altrimenti a rifornimento finito.
 */
export function startStrike(state: GameState, map: MapData, sq: Squadron, plan: StrikePlan, t: number): void {
  sq.mission = plan.mission;
  if (sq.flight) {
    const here = squadronPosition(state, sq, map, t);
    const fuel = squadronFuelKm(state, sq, map, t);
    const next = plan.mission.via[0];
    if (next) fly(sq, here, mapIndex(map).provinces.get(next)!.center, next, fuel, t);
    else fly(sq, here, aimAt(sq, here, targetOf(state, plan.mission.target)!, t), null, fuel, t);
  } else if (sq.readyAt <= t) launch(state, map, sq, t);
}

/**
 * Annulla l'attacco: se la squadriglia sta volando verso il bersaglio rientra alla base più vicina,
 * se sta andando a uno scalo ci atterra e si ferma lì. Modifica `s` e la squadriglia (che dev'essere una copia).
 */
export function abortStrike(s: GameState, map: MapData, sq: Squadron, t: number): void {
  if (sq.flight?.base === null) returnToBase(s, map, sq, squadronPosition(s, sq, map, t), squadronFuelKm(s, sq, map, t), t);
  sq.mission = null;
}

/** Decollo al minuto `t` di una squadriglia a terra con un attacco in attesa: verso il prossimo scalo o verso il bersaglio. */
function launch(s: GameState, map: MapData, sq: Squadron, t: number): void {
  const m = sq.mission!;
  const target = targetOf(s, m.target);
  if (!validTarget(s, sq.owner, target)) {
    sq.mission = null;
    return;
  }
  const from = basePosition(s, map, sq.base, t)!;
  const next = m.via[0];
  if (next) {
    const to = mapIndex(map).provinces.get(next)!.center;
    if (isAirBase(s, next, sq.owner) && flatKm(from, to) <= squadronRangeKm(sq)) fly(sq, from, to, next, squadronRangeKm(sq), t);
    else sq.mission = null;
    return;
  }
  const at = aimAt(sq, from, target, t);
  const radius = squadronRangeKm(sq) / 2;
  // Il bersaglio nel frattempo si è allontanato troppo: l'attacco decade e la squadriglia resta alla base.
  if (flatKm(from, at) > radius) {
    sq.mission = null;
    return;
  }
  sq.mission = { ...m, anchor: from, radiusKm: radius };
  fly(sq, from, at, null, squadronRangeKm(sq), t);
}

/** Rientro dopo un attacco (o un attacco fallito): alla base più vicina raggiungibile. */
function returnToBase(s: GameState, map: MapData, sq: Squadron, at: LngLat, fuelKm: number, t: number) {
  sq.mission = null;
  divert(s, map, sq, at, fuelKm, t);
}

/**
 * La squadriglia arriva al punto previsto per l'attacco. Se il bersaglio è lì, l'attacco avviene; se si è spostato
 * lo insegue, ma solo finché resta nel raggio d'azione e la portata basta per tornare a una base; altrimenti rientra.
 * Restituisce true se sono cambiate unità o aerei.
 */
function strikeArrival(s: GameState, world: { map: MapData; nav?: NavData }, sq: Squadron, t: number): boolean {
  const { map } = world;
  const f = sq.flight!;
  const m = sq.mission;
  const target = m ? targetOf(s, m.target) : undefined;
  if (!m || !validTarget(s, sq.owner, target, t)) {
    returnToBase(s, map, sq, f.to, f.fuelKm, t);
    return false;
  }
  if (flatKm(f.to, targetPosition(target, t)) <= AIR.strikeKm) {
    strike(s, world, sq, target, f.to, t);
    if (s.squadrons[sq.id]) returnToBase(s, map, sq, f.to, f.fuelKm, t);
    return true;
  }
  const at = aimAt(sq, f.to, target, t);
  if (flatKm(m.anchor, at) <= m.radiusKm && flatKm(f.to, at) + nearestBaseKm(s, map, sq.owner, at) <= f.fuelKm) fly(sq, f.to, at, null, f.fuelKm, t);
  else returnToBase(s, map, sq, f.to, f.fuelKm, t);
  return false;
}

/** Un passaggio sul bersaglio, armata o flotta. Modifica `s`. */
function strike(s: GameState, world: { map: MapData; nav?: NavData }, sq: Squadron, target: Target, at: LngLat, t: number) {
  if (target.kind === "army") strikeArmy(s, world, sq, target.army, at, t);
  else strikeFleet(s, world, sq, target.fleet, at, t);
}

/**
 * Attacco a una flotta: prima spara la contraerea delle navi (della flotta e delle altre flotte della stessa nazione vicine),
 * poi gli aerei rimasti colpiscono con i valori contro le navi (contro i sottomarini quelli contro i sottomarini).
 */
function strikeFleet(s: GameState, world: { map: MapData; nav?: NavData }, sq: Squadron, target: Fleet, at: LngLat, t: number) {
  const before = { aircraft: sq.aircraft.length, ships: target.ships.length };
  let antiAir = 0;
  for (const f of Object.values(s.fleets))
    if (f.owner === target.owner && flatKm(fleetPosition(f, t), at) <= COMBAT.contactKm) antiAir += fleetAntiAir(f);
  sq.aircraft = damageAircraft(sq.aircraft, antiAir);

  const eff = efficiency(squadronHealth(sq));
  if (target.transport) return strikeTransport(s, sq, target, at, eff, before.aircraft, t);
  if (target.convoy) return strikeConvoy(s, world, sq, target, at, eff, before.aircraft, t);
  const n = target.ships.length;
  const damage = { surface: 0, sub: 0 };
  for (const c of ["surface", "sub"] as const) {
    const count = target.ships.filter((x) => shipClass(x.type) === c).length;
    if (count === 0) continue;
    const values = sq.aircraft.map((a) => (c === "sub" ? AIRCRAFT_TYPES[a.type].vsSub : AIRCRAFT_TYPES[a.type].vsShip) ?? 0).sort((x, y) => y - x);
    let total = 0;
    values.forEach((v, i) => (total += v * groupWeight(i)));
    damage[c] = total * eff * (count / n);
  }
  target.ships = applyShipDamage(target.ships, damage);

  const fleetDestroyed = target.ships.length === 0;
  const squadronDestroyed = sq.aircraft.length === 0;
  logEvent(s, {
    time: t,
    type: "airStrike",
    by: sq.owner,
    against: target.owner,
    at,
    province: null,
    aircraftLost: before.aircraft - sq.aircraft.length,
    unitsLost: before.ships - target.ships.length,
    squadronDestroyed,
    armyDestroyed: fleetDestroyed,
    naval: true,
  });
  if (fleetDestroyed) {
    logEvent(s, { time: t, type: "fleetDestroyed", fleet: target.id, owner: target.owner, by: sq.owner, at, zone: world.nav ? (seaZoneAt(world.nav, at)?.name ?? null) : null });
    delete s.fleets[target.id];
  }
  if (squadronDestroyed) delete s.squadrons[sq.id];
}

/** Attacco a un trasporto: gli aerei colpiscono le unità a bordo con i valori contro le navi. */
function strikeTransport(s: GameState, sq: Squadron, target: Fleet, at: LngLat, eff: number, aircraftBefore: number, t: number) {
  const cargo = target.transport!.army;
  const before = cargo.units.length;
  const values = sq.aircraft.map((a) => AIRCRAFT_TYPES[a.type].vsShip ?? 0).sort((x, y) => y - x);
  let total = 0;
  values.forEach((v, i) => (total += v * groupWeight(i)));
  cargo.units = applyDamage(cargo.units, cargoDamage(cargo, total * eff));
  const destroyed = cargo.units.length === 0;
  logEvent(s, {
    time: t,
    type: "airStrike",
    by: sq.owner,
    against: target.owner,
    at,
    province: null,
    aircraftLost: aircraftBefore - sq.aircraft.length,
    unitsLost: before - cargo.units.length,
    squadronDestroyed: sq.aircraft.length === 0,
    armyDestroyed: destroyed,
  });
  if (destroyed) {
    logEvent(s, { time: t, type: "armyDestroyed", owner: target.owner, by: sq.owner, at, province: null });
    delete s.fleets[target.id];
  }
  if (sq.aircraft.length === 0) delete s.squadrons[sq.id];
}

/** Attacco a un convoglio: gli aerei tolgono punti vita (e carico) con i valori contro le navi. */
function strikeConvoy(s: GameState, world: { nav?: NavData }, sq: Squadron, target: Fleet, at: LngLat, eff: number, aircraftBefore: number, t: number) {
  const convoy = target.convoy!;
  const values = sq.aircraft.map((a) => AIRCRAFT_TYPES[a.type].vsShip ?? 0).sort((x, y) => y - x);
  let total = 0;
  values.forEach((v, i) => (total += v * groupWeight(i)));
  convoy.hp -= total * eff;
  const sunk = convoy.hp <= 1e-6;
  logEvent(s, {
    time: t,
    type: "airStrike",
    by: sq.owner,
    against: target.owner,
    at,
    province: null,
    aircraftLost: aircraftBefore - sq.aircraft.length,
    unitsLost: 0,
    squadronDestroyed: sq.aircraft.length === 0,
    armyDestroyed: sunk,
    naval: true,
  });
  if (sunk) sinkConvoy(s, world.nav, target, sq.owner, t);
  if (sq.aircraft.length === 0) delete s.squadrons[sq.id];
}

/** Contraerea della flotta: come per le armate, con il limite di gruppo e l'efficienza per salute. */
export function fleetAntiAir(fleet: Fleet): number {
  const values = fleet.ships.map((x) => SHIP_TYPES[x.type].antiAir).sort((a, b) => b - a);
  let total = 0;
  values.forEach((v, i) => (total += v * groupWeight(i)));
  return total * efficiency(fleetHealth(fleet));
}

/**
 * Attacco a un'armata: prima spara la contraerea (del bersaglio e delle armate della stessa nazione vicine),
 * poi gli aerei rimasti colpiscono, con le regole del combattimento a terra (limite di gruppo, efficienza per salute,
 * fortificazioni). Niente casualità. Modifica `s`.
 */
function strikeArmy(s: GameState, world: { map: MapData; nav?: NavData }, sq: Squadron, target: Army, at: LngLat, t: number) {
  const before = { aircraft: sq.aircraft.length, units: target.units.length };
  let antiAir = 0;
  for (const a of Object.values(s.armies))
    if (a.owner === target.owner && flatKm(armyPosition(a, t), at) <= COMBAT.contactKm) antiAir += armyAntiAir(a);
  sq.aircraft = damageAircraft(sq.aircraft, antiAir);

  const eff = efficiency(squadronHealth(sq));
  const province = world.nav ? provinceIdAt(world.nav, at) : null;
  const fort = !isAttacking(target) ? fortDamageFactor(s, province, target.owner) : 1;
  // Nel bosco gli aerei vedono poco.
  const cover = terrainAt(world.nav, at) === "forest" ? TERRAIN_RULES.airVsForest : 1;
  const damage = noDamage();
  for (const c of ARMOR_CLASSES) {
    const count = target.units.filter((u) => UNIT_TYPES[u.type].armor === c).length;
    if (count === 0) continue;
    const values = sq.aircraft.map((a) => AIRCRAFT_TYPES[a.type].attack[c]).sort((x, y) => y - x);
    let total = 0;
    values.forEach((v, i) => (total += v * groupWeight(i)));
    damage[c] = total * eff * fort * cover * (count / target.units.length);
  }
  target.units = applyDamage(target.units, damage);
  // Il bombardamento abbassa il morale della provincia colpita (non sotto la soglia), se non è di chi attacca.
  if (province && s.provinces[province]?.owner !== sq.owner)
    lowerMorale(
      s,
      province,
      moraleDamage(
        sq.aircraft.map((a) => AIRCRAFT_TYPES[a.type].moraleDamage ?? 0),
        eff,
      ),
    );

  const armyDestroyed = target.units.length === 0;
  const squadronDestroyed = sq.aircraft.length === 0;
  logEvent(s, {
    time: t,
    type: "airStrike",
    by: sq.owner,
    against: target.owner,
    at,
    province,
    aircraftLost: before.aircraft - sq.aircraft.length,
    unitsLost: before.units - target.units.length,
    squadronDestroyed,
    armyDestroyed,
  });
  if (armyDestroyed) {
    logEvent(s, { time: t, type: "armyDestroyed", owner: target.owner, by: sq.owner, at, province });
    delete s.armies[target.id];
  }
  if (squadronDestroyed) delete s.squadrons[sq.id];
}

/** Danno della contraerea agli aerei: colpisce prima il più malconcio, così le perdite arrivano una alla volta. Modifica gli aerei. */
function damageAircraft(aircraft: Aircraft[], damage: number): Aircraft[] {
  let left = damage;
  for (const a of [...aircraft].sort((x, y) => x.hp - y.hp || (x.id < y.id ? -1 : 1))) {
    if (left <= 0) break;
    const hit = Math.min(a.hp, left);
    a.hp -= hit;
    left -= hit;
  }
  return aircraft.filter((a) => a.hp > 1e-6);
}

// --- Motore ---

/**
 * Operazioni aeree al minuto `t`: atterraggi (con rifornimento, e scalo di un attacco), arrivi sul bersaglio,
 * decolli degli attacchi in attesa. Se una base d'arrivo non è più utilizzabile la squadriglia ripiega sulla base più vicina
 * che raggiunge con la portata rimasta; se non ce n'è, va persa. Restituisce true se sono cambiati unità o aerei. Modifica `s`.
 */
export function airOps(s: GameState, world: { map: MapData; nav?: NavData }, t: number): boolean {
  const { map } = world;
  let changed = false;
  for (const id of Object.keys(s.squadrons)) {
    const sq = s.squadrons[id];
    if (!sq) continue;
    const f = sq.flight;
    if (f && f.arriveAt <= t) {
      const carrier = f.base !== null ? s.fleets[f.base] : undefined;
      const carrierAt = carrier ? fleetPosition(carrier, t) : null;
      if (f.base === null) changed = strikeArrival(s, world, sq, t) || changed;
      else if (carrierAt && isAirBase(s, f.base, sq.owner, sq) && flatKm(f.to, carrierAt) > AIR.strikeKm) {
        // La portaerei si è spostata: la si insegue se la portata basta, altrimenti si va alla base più vicina.
        if (flatKm(f.to, carrierAt) <= f.fuelKm) fly(sq, f.to, carrierAt, f.base, f.fuelKm, t);
        else {
          divert(s, map, sq, f.to, f.fuelKm, t);
          changed ||= !s.squadrons[id];
        }
      } else if (isAirBase(s, f.base, sq.owner, carrier ? sq : undefined)) {
        sq.base = f.base;
        sq.flight = null;
        sq.readyAt = t + refuelMinutes(s, sq, f.base);
        if (sq.mission?.via[0] === f.base) sq.mission = { ...sq.mission, via: sq.mission.via.slice(1) };
      } else {
        divert(s, map, sq, f.to, f.fuelKm, t);
        changed ||= !s.squadrons[id];
      }
    } else if (!f && sq.mission && sq.readyAt <= t) launch(s, map, sq, t);
  }
  return changed;
}

/** Prossimo minuto in cui una squadriglia ha qualcosa da fare (atterraggio, arrivo sul bersaglio, decollo per un attacco). */
export function nextAirEvent(s: GameState): number {
  let next = Infinity;
  for (const sq of Object.values(s.squadrons)) {
    if (sq.flight) next = Math.min(next, sq.flight.arriveAt);
    else if (sq.mission && sq.readyAt > s.time) next = Math.min(next, sq.readyAt);
  }
  return next;
}

/**
 * Le squadriglie a terra in una base che non è più utilizzabile decollano verso la base più vicina entro la portata;
 * se non ce n'è, vanno perse. Modifica `s`.
 */
export function evacuateBases(s: GameState, map: MapData, t: number): void {
  for (const sq of Object.values(s.squadrons)) {
    if (sq.flight || isAirBase(s, sq.base, sq.owner)) continue;
    const at = basePosition(s, map, sq.base, t);
    if (at) divert(s, map, sq, at, squadronRangeKm(sq), t);
    else {
      // La portaerei è affondata con gli aerei a bordo.
      const sunk = [...s.events].reverse().find((e) => e.type === "fleetDestroyed" && e.fleet === sq.base);
      lose(s, map, sq, sunk?.type === "fleetDestroyed" ? sunk.at : [0, 0], t);
    }
  }
}

/** La squadriglia va persa. */
function lose(s: GameState, map: MapData, sq: Squadron, at: LngLat, t: number) {
  const base = sq.flight?.base ?? sq.base;
  logEvent(s, { time: t, type: "squadronLost", owner: sq.owner, at, province: mapIndex(map).provinces.has(base) ? base : null });
  delete s.squadrons[sq.id];
}

/** Manda la squadriglia, da `at`, alla base più vicina entro `fuelKm` (l'attacco in corso decade); se non c'è, va persa. */
function divert(s: GameState, map: MapData, sq: Squadron, at: LngLat, fuelKm: number, t: number) {
  let best: { id: string; at: LngLat } | null = null;
  let bestKm = Infinity;
  const candidates = [
    ...airBases(s, map, sq.owner).map((p) => ({ id: p.id, at: p.center })),
    ...carrierBases(s, sq.owner)
      .filter((f) => isAirBase(s, f.id, sq.owner, sq))
      .map((f) => ({ id: f.id, at: fleetPosition(f, t) })),
  ];
  for (const b of candidates) {
    const km = flatKm(at, b.at);
    if (km <= fuelKm && km < bestKm) [best, bestKm] = [b, km];
  }
  sq.mission = null;
  if (!best) return lose(s, map, sq, at, t);
  fly(sq, at, best.at, best.id, fuelKm, t);
}
