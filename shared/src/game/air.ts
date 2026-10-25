import { AIR, AIRCRAFT_TYPES } from "../data/air.js";
import { COMBAT } from "../data/combat.js";
import { TERRAIN_RULES } from "../data/terrain.js";
import { ARMOR_CLASSES, UNIT_TYPES } from "../data/units.js";
import type { LngLat, MapData, NationId, Province, ProvinceId } from "../map/types.js";
import { flatKm, provinceIdAt } from "../nav/grid.js";
import type { NavData } from "../nav/types.js";
import { buildingLevel, fortDamageFactor } from "./buildings.js";
import { applyDamage, armyAntiAir, efficiency, groupWeight, isAttacking, lerp, lowerMorale, moraleDamage, noDamage } from "./combat.js";
import { atWar, hasAgreement, logEvent } from "./diplomacy.js";
import { mapIndex } from "./mapIndex.js";
import { armyPosition } from "./movement.js";
import { terrainAt } from "./terrain.js";
import type { Aircraft, Army, ArmyId, GameState, Squadron, StrikeMission } from "./state.js";

// Aviazione: basi, portata, voli e attacchi delle squadriglie (vedi docs/game-design.md, §9 "Aviazione").
// Ci sono il trasferimento tra basi e l'attacco alle armate nemiche; convoglio e pattuglia arriveranno dopo.

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

/**
 * La provincia è una base per gli aerei di `nation`? Serve un aeroporto o una fabbrica aeronautica,
 * in una provincia propria o di un alleato.
 */
export function isAirBase(state: GameState, provinceId: ProvinceId, nation: NationId): boolean {
  const owner = state.provinces[provinceId]?.owner;
  if (!owner || (owner !== nation && !hasAgreement(state, owner, nation, "alliance"))) return false;
  return buildingLevel(state, provinceId, "airfield") > 0 || buildingLevel(state, provinceId, "aircraftFactory") > 0;
}

/** Basi disponibili per `nation`. */
export function airBases(state: GameState, map: MapData, nation: NationId): Province[] {
  return map.provinces.filter((p) => isAirBase(state, p.id, nation));
}

/** Distanza dal punto alla base più vicina di `nation` (Infinity se non ne ha). */
function nearestBaseKm(state: GameState, map: MapData, nation: NationId, at: LngLat): number {
  let best = Infinity;
  for (const p of airBases(state, map, nation)) best = Math.min(best, flatKm(at, p.center));
  return best;
}

/** Minuti di rifornimento alla base: quelli dell'aereo più lento a rifornirsi, accorciati dai livelli dell'aeroporto. */
export function refuelMinutes(state: GameState, sq: Squadron, base: ProvinceId): number {
  const longest = Math.max(...sq.aircraft.map((a) => AIRCRAFT_TYPES[a.type].refuelMinutes));
  const level = Math.max(1, buildingLevel(state, base, "airfield"));
  return Math.round(longest * (1 - AIR.airfieldTimeCutPerLevel * (level - 1)));
}

/** Dove si trova la squadriglia al minuto `t`: alla base, oppure lungo il volo. */
export function squadronPosition(sq: Squadron, map: MapData, t: number): LngLat {
  const f = sq.flight;
  if (!f) return mapIndex(map).provinces.get(sq.base)!.center;
  if (t >= f.arriveAt) return f.to;
  return lerp(f.from, f.to, Math.max(0, (t - f.departAt) / (f.arriveAt - f.departAt)));
}

/** Portata che resta alla squadriglia al minuto `t`: tutta a terra; in volo quella che avrà all'arrivo più il tratto ancora da fare. */
export function squadronFuelKm(sq: Squadron, map: MapData, t: number): number {
  const f = sq.flight;
  return f ? f.fuelKm + flatKm(squadronPosition(sq, map, t), f.to) : squadronRangeKm(sq);
}

/** Perché la squadriglia non può trasferirsi alla base indicata (null = può). */
export function transferMissing(state: GameState, map: MapData, sq: Squadron, base: ProvinceId): string | null {
  const to = mapIndex(map).provinces.get(base);
  if (!to) return "Provincia sconosciuta.";
  if (sq.flight) return "La squadriglia è in volo.";
  if (sq.readyAt > state.time) return "La squadriglia si sta rifornendo.";
  if (base === sq.base) return "La squadriglia è già in questa base.";
  if (!isAirBase(state, base, sq.owner)) return "Non è una tua base aerea (serve un aeroporto o una fabbrica aeronautica, tua o di un alleato).";
  const km = flatKm(squadronPosition(sq, map, state.time), to.center);
  if (km > squadronRangeKm(sq)) return `Troppo lontano: ${Math.round(km)} km, la portata è di ${squadronRangeKm(sq)} km.`;
  return null;
}

/** Fa decollare la squadriglia verso la base (va chiamata dopo `transferMissing`). Annulla un attacco in attesa. Modifica `sq`. */
export function startTransfer(sq: Squadron, map: MapData, base: ProvinceId, t: number): void {
  const from = squadronPosition(sq, map, t);
  const to = mapIndex(map).provinces.get(base)!.center;
  sq.mission = null;
  fly(sq, from, to, base, squadronRangeKm(sq), t);
}

/** Minuti di volo in linea retta da `from` a `to`, alla velocità del più lento. */
export function flightMinutes(sq: Squadron, from: LngLat, to: LngLat): number {
  return Math.max(1, Math.round((flatKm(from, to) / squadronSpeedKmh(sq)) * 60));
}

function fly(sq: Squadron, from: LngLat, to: LngLat, base: ProvinceId | null, fuelKm: number, t: number) {
  sq.flight = { from, to, base, departAt: t, arriveAt: t + flightMinutes(sq, from, to), fuelKm: fuelKm - flatKm(from, to) };
}

// --- Attacco ---

/** Il bersaglio si può ancora attaccare: esiste, ha unità ed è di una nazione in guerra con chi attacca. */
function validTarget(state: GameState, nation: NationId, target: Army | undefined): target is Army {
  return !!target && target.units.length > 0 && atWar(state, nation, target.owner);
}

/**
 * Dove incontrare il bersaglio partendo da `from` al minuto `t`: la sua posizione all'ora d'arrivo,
 * prevista lungo la marcia che sta facendo (qualche passaggio basta: gli aerei sono molto più veloci).
 */
function aimAt(sq: Squadron, from: LngLat, target: Army, t: number): LngLat {
  let at = armyPosition(target, t);
  for (let i = 0; i < 4; i++) at = armyPosition(target, t + flightMinutes(sq, from, at));
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
export function planStrike(state: GameState, map: MapData, sq: Squadron, targetId: ArmyId, t: number): StrikePlan | string {
  const target = state.armies[targetId];
  if (!target || target.units.length === 0) return "Bersaglio sconosciuto.";
  if (target.owner === sq.owner) return "Non puoi attaccare le tue armate.";
  if (!atWar(state, sq.owner, target.owner)) return "Puoi attaccare solo le armate delle nazioni con cui sei in guerra.";
  const range = squadronRangeKm(sq);
  const radius = range / 2;
  const here = squadronPosition(sq, map, t);
  const at = aimAt(sq, here, target, t);
  const fuel = squadronFuelKm(sq, map, t);

  const direct = sq.flight
    ? flatKm(here, at) <= radius && flatKm(here, at) + nearestBaseKm(state, map, sq.owner, at) <= fuel
    : flatKm(here, at) <= radius;
  if (direct) return { direct: true, mission: { target: targetId, anchor: here, radiusKm: radius, via: [] } };

  // Scali: il percorso più corto tra le basi (ogni tratto entro la portata) fino a una base da cui il bersaglio è nel raggio d'azione.
  const goal = armyPosition(target, t);
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
    const here = squadronPosition(sq, map, t);
    const fuel = squadronFuelKm(sq, map, t);
    const next = plan.mission.via[0];
    if (next) fly(sq, here, mapIndex(map).provinces.get(next)!.center, next, fuel, t);
    else fly(sq, here, aimAt(sq, here, state.armies[plan.mission.target]!, t), null, fuel, t);
  } else if (sq.readyAt <= t) launch(state, map, sq, t);
}

/**
 * Annulla l'attacco: se la squadriglia sta volando verso il bersaglio rientra alla base più vicina,
 * se sta andando a uno scalo ci atterra e si ferma lì. Modifica `s` e la squadriglia (che dev'essere una copia).
 */
export function abortStrike(s: GameState, map: MapData, sq: Squadron, t: number): void {
  if (sq.flight?.base === null) returnToBase(s, map, sq, squadronPosition(sq, map, t), squadronFuelKm(sq, map, t), t);
  sq.mission = null;
}

/** Decollo al minuto `t` di una squadriglia a terra con un attacco in attesa: verso il prossimo scalo o verso il bersaglio. */
function launch(s: GameState, map: MapData, sq: Squadron, t: number): void {
  const m = sq.mission!;
  const target = s.armies[m.target];
  if (!validTarget(s, sq.owner, target)) {
    sq.mission = null;
    return;
  }
  const from = mapIndex(map).provinces.get(sq.base)!.center;
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
  const target = m ? s.armies[m.target] : undefined;
  if (!m || !validTarget(s, sq.owner, target)) {
    returnToBase(s, map, sq, f.to, f.fuelKm, t);
    return false;
  }
  if (flatKm(f.to, armyPosition(target, t)) <= AIR.strikeKm) {
    strike(s, world, sq, target, f.to, t);
    if (s.squadrons[sq.id]) returnToBase(s, map, sq, f.to, f.fuelKm, t);
    return true;
  }
  const at = aimAt(sq, f.to, target, t);
  if (flatKm(m.anchor, at) <= m.radiusKm && flatKm(f.to, at) + nearestBaseKm(s, map, sq.owner, at) <= f.fuelKm) fly(sq, f.to, at, null, f.fuelKm, t);
  else returnToBase(s, map, sq, f.to, f.fuelKm, t);
  return false;
}

/**
 * Un passaggio sul bersaglio: prima spara la contraerea (del bersaglio e delle armate della stessa nazione vicine),
 * poi gli aerei rimasti colpiscono, con le regole del combattimento a terra (limite di gruppo, efficienza per salute,
 * fortificazioni). Niente casualità. Modifica `s`.
 */
function strike(s: GameState, world: { map: MapData; nav?: NavData }, sq: Squadron, target: Army, at: LngLat, t: number) {
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
      if (f.base === null) changed = strikeArrival(s, world, sq, t) || changed;
      else if (isAirBase(s, f.base, sq.owner)) {
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
    divert(s, map, sq, mapIndex(map).provinces.get(sq.base)!.center, squadronRangeKm(sq), t);
  }
}

/** Manda la squadriglia, da `at`, alla base più vicina entro `fuelKm` (l'attacco in corso decade); se non c'è, va persa. */
function divert(s: GameState, map: MapData, sq: Squadron, at: LngLat, fuelKm: number, t: number) {
  let best: Province | null = null;
  let bestKm = Infinity;
  for (const p of airBases(s, map, sq.owner)) {
    const km = flatKm(at, p.center);
    if (km <= fuelKm && km < bestKm) [best, bestKm] = [p, km];
  }
  sq.mission = null;
  if (!best) {
    logEvent(s, { time: t, type: "squadronLost", owner: sq.owner, at, province: sq.flight?.base ?? sq.base });
    delete s.squadrons[sq.id];
    return;
  }
  fly(sq, at, best.center, best.id, fuelKm, t);
}
