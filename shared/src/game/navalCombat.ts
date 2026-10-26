import { COMBAT } from "../data/combat.js";
import { NAVAL, SHIP_TYPES, type ShipTypeId } from "../data/naval.js";
import { ARMOR_CLASSES, UNIT_TYPES } from "../data/units.js";
import type { LngLat } from "../map/types.js";
import { flatKm, provinceIdAt } from "../nav/grid.js";
import { seaZoneAt } from "../nav/sea.js";
import type { NavData } from "../nav/types.js";
import { applyDamage, armyHealth, canFireAtRange, efficiency, groupWeight, isAttacking, noDamage } from "./combat.js";
import { atWar, logEvent, pairKey, relationOf } from "./diplomacy.js";
import { armyPosition } from "./movement.js";
import { fleetHealth, fleetPosition } from "./navy.js";
import type { Army, Fleet, GameState, Ship } from "./state.js";

// Combattimento navale (docs/game-design.md, §8 "Marina", passo 3), a ogni tick di combattimento come a terra.
// Niente casualità: limite di gruppo ed efficienza per salute come per le armate.
//  - Ogni flotta spara alla flotta nemica più vicina che raggiunge: ogni nave arriva fin dove dice la sua gittata
//    (almeno la distanza di contatto, 5 km: siluri e armi leggere). In navigazione usa i valori d'attacco, ferma quelli di difesa.
//    Contro le navi di superficie vale "Navi", contro i sottomarini "Sottomarini".
//  - Senza flotte nemiche a tiro, le navi con i cannoni colpiscono la costa: l'armata nemica più vicina entro la gittata.
//  - Le armate con gittata (artiglieria) ferme e in batteria, se non hanno un'armata nemica a tiro, sparano alla flotta nemica
//    più vicina entro la gittata (i sottomarini non si colpiscono da terra).
//  - Una flotta ormeggiata in un proprio porto e non colpita si ripara.

type ShipClass = "surface" | "sub";
const SHIP_CLASSES: readonly ShipClass[] = ["surface", "sub"];

export function shipClass(type: ShipTypeId): ShipClass {
  return type === "submarine" ? "sub" : "surface";
}

/** Fin dove arriva la nave: la gittata dei cannoni, o almeno la distanza di contatto. */
function reachKm(ship: Ship): number {
  return Math.max(SHIP_TYPES[ship.type].rangeKm, COMBAT.contactKm);
}

/** Fin dove arriva la flotta: la nave che arriva più lontano. */
export function fleetReachKm(fleet: Fleet): number {
  return Math.max(0, ...fleet.ships.map(reachKm));
}

function weighted(values: number[]): number {
  let total = 0;
  [...values].sort((a, b) => b - a).forEach((v, i) => (total += v * groupWeight(i)));
  return total;
}

/** Danno per tick della flotta a una flotta a `km` di distanza, diviso tra navi di superficie e sottomarini. */
export function fleetDamageTo(fleet: Fleet, target: Fleet, km: number): Record<ShipClass, number> {
  const out: Record<ShipClass, number> = { surface: 0, sub: 0 };
  const n = target.ships.length;
  if (n === 0) return out;
  const offensive = fleet.voyage !== null;
  const shooters = fleet.ships.filter((s) => reachKm(s) >= km);
  const eff = efficiency(fleetHealth(fleet));
  for (const c of SHIP_CLASSES) {
    const count = target.ships.filter((s) => shipClass(s.type) === c).length;
    if (count === 0) continue;
    const values = shooters.map((s) => {
      const v = c === "sub" ? SHIP_TYPES[s.type].vsSub : SHIP_TYPES[s.type].vsShip;
      return offensive ? v.attack : v.defense;
    });
    out[c] = weighted(values) * eff * (count / n);
  }
  return out;
}

/** Danno per tick dei cannoni della flotta contro un'armata a terra a `km` di distanza. */
export function shoreDamageTo(fleet: Fleet, target: Army, km: number): ReturnType<typeof noDamage> {
  const out = noDamage();
  const guns = fleet.ships.filter((s) => SHIP_TYPES[s.type].shore && SHIP_TYPES[s.type].rangeKm >= km);
  const n = target.units.length;
  if (guns.length === 0 || n === 0) return out;
  const eff = efficiency(fleetHealth(fleet));
  for (const c of ARMOR_CLASSES) {
    const count = target.units.filter((u) => UNIT_TYPES[u.type].armor === c).length;
    if (count > 0) out[c] = weighted(guns.map((s) => SHIP_TYPES[s.type].shore![c])) * eff * (count / n);
  }
  return out;
}

/** Danno per tick dell'artiglieria di un'armata contro una flotta (solo navi di superficie). */
export function artilleryDamageTo(army: Army, target: Fleet, km: number): Record<ShipClass, number> {
  const guns = army.units.filter((u) => (UNIT_TYPES[u.type].rangeKm ?? 0) >= km);
  const n = target.ships.length;
  const surface = target.ships.filter((s) => shipClass(s.type) === "surface").length;
  if (guns.length === 0 || n === 0 || surface === 0) return { surface: 0, sub: 0 };
  const total = weighted(guns.map((u) => UNIT_TYPES[u.type].vsShip?.attack ?? 0)) * efficiency(armyHealth(army));
  return { surface: total * (surface / n), sub: 0 };
}

/** Applica il danno alle navi (dentro ogni classe prima la più malconcia). Restituisce le navi rimaste a galla. */
export function applyShipDamage(ships: Ship[], damage: Record<ShipClass, number>): Ship[] {
  for (const c of SHIP_CLASSES) {
    let left = damage[c];
    for (const s of ships.filter((x) => shipClass(x.type) === c).sort((a, b) => a.hp - b.hp || (a.id < b.id ? -1 : 1))) {
      if (left <= 0) break;
      const hit = Math.min(s.hp, left);
      s.hp -= hit;
      left -= hit;
    }
  }
  return ships.filter((s) => s.hp > 1e-6);
}

type NavalHit =
  | { kind: "fleet"; by: { owner: string; at: LngLat }; target: Fleet; damage: Record<ShipClass, number> }
  | { kind: "army"; by: { owner: string; at: LngLat }; target: Army; damage: ReturnType<typeof noDamage> };

/** Combattimento navale al tick `t`. Modifica `s`; restituisce true se sono cambiate navi o unità. */
export function navalFight(s: GameState, world: { nav?: NavData }, t: number): boolean {
  const fleets = Object.values(s.fleets).filter((f) => f.ships.length > 0).sort((a, b) => (a.id < b.id ? -1 : 1));
  const armies = Object.values(s.armies).filter((a) => a.units.length > 0).sort((a, b) => (a.id < b.id ? -1 : 1));
  if (fleets.length === 0) return false;
  const fleetAt = new Map(fleets.map((f) => [f.id, fleetPosition(f, t)]));
  const armyAt = new Map(armies.map((a) => [a.id, armyPosition(a, t)]));
  const hits: NavalHit[] = [];

  for (const f of fleets) {
    const here = fleetAt.get(f.id)!;
    const reach = fleetReachKm(f);
    let target: Fleet | undefined;
    let best = Infinity;
    for (const g of fleets) {
      if (g.owner === f.owner || !atWar(s, f.owner, g.owner)) continue;
      const d = flatKm(here, fleetAt.get(g.id)!);
      if (d <= reach && d < best) [target, best] = [g, d];
    }
    if (target) {
      hits.push({ kind: "fleet", by: { owner: f.owner, at: here }, target, damage: fleetDamageTo(f, target, best) });
      continue;
    }
    // Nessuna flotta a tiro: i cannoni sulla costa.
    let shore: Army | undefined;
    let shoreKm = Infinity;
    for (const a of armies) {
      if (!atWar(s, f.owner, a.owner)) continue;
      const d = flatKm(here, armyAt.get(a.id)!);
      if (d < shoreKm && f.ships.some((x) => SHIP_TYPES[x.type].shore && SHIP_TYPES[x.type].rangeKm >= d)) [shore, shoreKm] = [a, d];
    }
    if (shore) hits.push({ kind: "army", by: { owner: f.owner, at: here }, target: shore, damage: shoreDamageTo(f, shore, shoreKm) });
  }

  // L'artiglieria a terra spara alle navi solo se non ha un'armata nemica a tiro (quella la colpisce il combattimento di terra).
  for (const a of armies) {
    if (!canFireAtRange(a, t) || isAttacking(a)) continue;
    const here = armyAt.get(a.id)!;
    const range = Math.max(...a.units.map((u) => UNIT_TYPES[u.type].rangeKm ?? 0));
    if (armies.some((b) => atWar(s, a.owner, b.owner) && flatKm(here, armyAt.get(b.id)!) <= range)) continue;
    let target: Fleet | undefined;
    let best = Infinity;
    for (const f of fleets) {
      if (!atWar(s, a.owner, f.owner)) continue;
      const d = flatKm(here, fleetAt.get(f.id)!);
      if (d <= range && d < best) [target, best] = [f, d];
    }
    if (target) hits.push({ kind: "fleet", by: { owner: a.owner, at: here }, target, damage: artilleryDamageTo(a, target, best) });
  }

  let changed = false;
  const hitFleets = new Set<string>();
  for (const h of hits) {
    if (h.kind === "fleet") {
      const f = h.target;
      if (!s.fleets[f.id]) continue;
      hitFleets.add(f.id);
      battleNews(s, world, h.by.owner, f.owner, fleetAt.get(f.id)!, t);
      const before = f.ships.length;
      f.ships = applyShipDamage(f.ships, h.damage);
      if (f.ships.length === before) continue;
      changed = true;
      if (f.ships.length > 0) continue;
      const at = fleetAt.get(f.id)!;
      logEvent(s, { time: t, type: "fleetDestroyed", fleet: f.id, owner: f.owner, by: h.by.owner, at, zone: world.nav ? (seaZoneAt(world.nav, at)?.name ?? null) : null });
      delete s.fleets[f.id];
    } else {
      const a = h.target;
      if (!s.armies[a.id]) continue;
      battleNews(s, world, h.by.owner, a.owner, h.by.at, t);
      const before = a.units.length;
      a.units = applyDamage(a.units, h.damage);
      if (a.units.length === before) continue;
      changed = true;
      if (a.units.length > 0) continue;
      const at = armyAt.get(a.id)!;
      logEvent(s, { time: t, type: "armyDestroyed", owner: a.owner, by: h.by.owner, at, province: world.nav ? provinceIdAt(world.nav, at) : null });
      delete s.armies[a.id];
    }
  }

  // Riparazioni in porto.
  for (const f of Object.values(s.fleets)) {
    if (!f.port || f.voyage || hitFleets.has(f.id) || s.provinces[f.port]?.owner !== f.owner) continue;
    for (const ship of f.ships) ship.hp = Math.min(SHIP_TYPES[ship.type].hp, ship.hp + SHIP_TYPES[ship.type].hp * NAVAL.repairPerTick);
  }
  return changed;
}

/**
 * Notizia della battaglia navale: solo quando comincia, cioè se tra le due nazioni non si è combattuto in mare
 * da almeno `NAVAL.battleNewsGapMinutes`. Modifica `s`.
 */
function battleNews(s: GameState, world: { nav?: NavData }, a: string, b: string, at: LngLat, t: number) {
  const key = pairKey(a, b);
  const relation = relationOf(s, a, b);
  const last = relation.navalCombatAt;
  s.relations[key] = { ...relation, navalCombatAt: t };
  if (last !== undefined && last < t && t - last <= NAVAL.battleNewsGapMinutes) return;
  if (last === t) return;
  logEvent(s, { time: t, type: "navalBattle", at, zone: world.nav ? (seaZoneAt(world.nav, at)?.name ?? null) : null, nations: [a, b] });
}
