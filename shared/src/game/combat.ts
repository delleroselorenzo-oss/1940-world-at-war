import { COMBAT } from "../data/combat.js";
import { ARMOR_CLASSES, UNIT_TYPES, type ArmorClass } from "../data/units.js";
import type { LngLat } from "../map/types.js";
import { flatKm } from "../nav/grid.js";
import { atWar } from "./diplomacy.js";
import { armyPosition } from "./movement.js";
import type { Army, ArmyId, GameState, Unit } from "./state.js";

// Regole del combattimento (docs/game-design.md, §9). Nessun fattore casuale:
// a parità di armate e condizioni il risultato è sempre lo stesso.

/** Salute complessiva dell'armata, da 0 a 1. */
export function armyHealth(army: Army): number {
  let hp = 0;
  let max = 0;
  for (const u of army.units) {
    hp += u.hp;
    max += UNIT_TYPES[u.type].hp;
  }
  return max > 0 ? hp / max : 0;
}

/** Usa i valori offensivi? Sì se marcia o se è andata all'assalto; altrimenti difende. */
export function isAttacking(army: Army): boolean {
  return army.move !== null || army.attacking;
}

/**
 * Danno per tick che l'armata infligge a unità della classe `vs`: somma dei danni delle unità
 * (le più forti prima) con il limite di gruppo, moltiplicata per l'efficienza dovuta alla salute.
 */
export function armyDamage(army: Army, vs: ArmorClass, offensive = isAttacking(army)): number {
  const values = army.units.map((u) => (offensive ? UNIT_TYPES[u.type].attack : UNIT_TYPES[u.type].defense)[vs]).sort((a, b) => b - a);
  let total = 0;
  values.forEach((v, i) => (total += v * groupWeight(i)));
  return total * efficiency(armyHealth(army));
}

/** Peso dell'i-esima unità (0 = la più forte): pieno fino a groupFull, poi cala fino a zero a groupMax. */
export function groupWeight(i: number): number {
  if (i < COMBAT.groupFull) return 1;
  if (i >= COMBAT.groupMax) return 0;
  return (COMBAT.groupMax - i) / (COMBAT.groupMax - COMBAT.groupFull + 1);
}

/** Contraerea dell'armata contro gli aerei che la attaccano: come il danno, con il limite di gruppo e l'efficienza per salute. */
export function armyAntiAir(army: Army): number {
  const values = army.units.map((u) => UNIT_TYPES[u.type].antiAir).sort((a, b) => b - a);
  let total = 0;
  values.forEach((v, i) => (total += v * groupWeight(i)));
  return total * efficiency(armyHealth(army));
}

/**
 * Danno che `attacker` infligge a `target` in un tick, diviso per classe: ogni classe riceve
 * il danno contro di lei in proporzione a quante unità di quella classe ha il bersaglio.
 */
export function damageAgainst(attacker: Army, target: Army, offensive = isAttacking(attacker)): Record<ArmorClass, number> {
  const out = noDamage();
  const n = target.units.length;
  if (n === 0) return out;
  for (const c of ARMOR_CLASSES) {
    const count = target.units.filter((u) => UNIT_TYPES[u.type].armor === c).length;
    if (count > 0) out[c] = armyDamage(attacker, c, offensive) * (count / n);
  }
  return out;
}

export function noDamage(): Record<ArmorClass, number> {
  return { soft: 0, light: 0, heavy: 0 };
}

// --- Tiro a distanza (artiglieria) ---

/** Le unità con gittata dell'armata, come un'armata a sé (stessa posizione e padrone). */
export function rangedPart(army: Army): Army {
  return { ...army, units: army.units.filter((u) => UNIT_TYPES[u.type].rangeKm) };
}

/** Gittata dell'armata: la più lunga tra le sue unità (0 se non ne ha). */
export function armyRangeKm(army: Army): number {
  return Math.max(0, ...army.units.map((u) => UNIT_TYPES[u.type].rangeKm ?? 0));
}

/** L'armata può sparare da lontano al minuto `t`: ha unità con gittata ed è ferma da almeno la messa in batteria. */
export function canFireAtRange(army: Army, t: number): boolean {
  return army.move === null && armyRangeKm(army) > 0 && t - (army.settledAt ?? -Infinity) >= COMBAT.setupMinutes;
}

/**
 * Punti di morale che un gruppo toglie alla provincia del bersaglio in un colpo: somma dei valori
 * con il limite di gruppo, per l'efficienza (salute) di chi spara.
 */
export function moraleDamage(values: number[], efficiency: number): number {
  let total = 0;
  [...values].sort((a, b) => b - a).forEach((v, i) => (total += v * groupWeight(i)));
  return total * efficiency;
}

/** Efficienza dovuta alla salute: piena a salute piena, `minEfficiency` a salute zero. */
export function efficiency(health: number): number {
  return COMBAT.minEfficiency + (1 - COMBAT.minEfficiency) * health;
}

/**
 * Abbassa il morale della provincia di `amount` punti, ma non sotto `COMBAT.moraleFloor`
 * (se è già più basso resta com'è). Modifica `s`. Restituisce true se è cambiato.
 */
export function lowerMorale(s: GameState, province: string | null, amount: number): boolean {
  const ps = province ? s.provinces[province] : undefined;
  if (!ps || amount <= 0 || ps.morale <= COMBAT.moraleFloor) return false;
  s.provinces[province!] = { ...ps, morale: Math.max(COMBAT.moraleFloor, ps.morale - amount) };
  return true;
}

/**
 * Applica il danno alle unità del bersaglio (modifica `units`): dentro ogni classe colpisce prima
 * l'unità più malconcia, così le perdite arrivano una alla volta. Restituisce le unità sopravvissute.
 */
export function applyDamage(units: Unit[], damage: Record<ArmorClass, number>): Unit[] {
  for (const c of ARMOR_CLASSES) {
    let left = damage[c];
    const ofClass = units.filter((u) => UNIT_TYPES[u.type].armor === c).sort((a, b) => a.hp - b.hp || (a.id < b.id ? -1 : 1));
    for (const u of ofClass) {
      if (left <= 0) break;
      const hit = Math.min(u.hp, left);
      u.hp -= hit;
      left -= hit;
    }
  }
  // Sotto un centesimo di punto l'unità è persa (evita resti dovuti agli arrotondamenti).
  return units.filter((u) => u.hp > 1e-6);
}

/** Guarisce le unità di una frazione dei loro punti massimi (modifica `units`). */
export function heal(units: Unit[], fraction: number): boolean {
  let changed = false;
  for (const u of units) {
    const max = UNIT_TYPES[u.type].hp;
    if (u.hp >= max) continue;
    u.hp = Math.min(max, u.hp + max * fraction);
    changed = true;
  }
  return changed;
}

/**
 * Margine sulla distanza di contatto: un'armata fermata al contatto sta a 5 km "esatti", e due
 * stime diverse della distanza non devono farla risultare fuori portata per pochi metri.
 */
const CONTACT_TOLERANCE_KM = 0.05;

/** Per ogni armata, le armate nemiche (in guerra con lei) entro la distanza di contatto al minuto `now`. */
export function engagements(state: GameState, now: number): Map<ArmyId, ArmyId[]> {
  const armies = Object.values(state.armies);
  const pos = armies.map((a) => armyPosition(a, now));
  const out = new Map<ArmyId, ArmyId[]>();
  for (let i = 0; i < armies.length; i++)
    for (let j = i + 1; j < armies.length; j++) {
      const a = armies[i]!;
      const b = armies[j]!;
      if (!atWar(state, a.owner, b.owner) || flatKm(pos[i]!, pos[j]!) > COMBAT.contactKm + CONTACT_TOLERANCE_KM) continue;
      (out.get(a.id) ?? out.set(a.id, []).get(a.id)!).push(b.id);
      (out.get(b.id) ?? out.set(b.id, []).get(b.id)!).push(a.id);
    }
  return out;
}

// --- Geometria su brevi distanze (proiezione locale in km) ---

function toKm(p: LngLat, ref: LngLat): [number, number] {
  const cos = Math.cos(ref[1] * (Math.PI / 180));
  return [(p[0] - ref[0]) * 111.32 * cos, (p[1] - ref[1]) * 110.57];
}

/**
 * Due armate si muovono in linea retta da a0 a a1 e da b0 a b1 nello stesso intervallo.
 * Restituisce la frazione dell'intervallo (0–1) in cui arrivano per la prima volta entro `r` km,
 * oppure null se non succede o se erano già vicine all'inizio (contatto non nuovo).
 */
export function contactFraction(a0: LngLat, a1: LngLat, b0: LngLat, b1: LngLat, r: number): number | null {
  const [rx, ry] = toKm(b0, a0);
  const [ax, ay] = toKm(a1, a0);
  const [bx, by] = toKm(b1, b0);
  const dx = bx - ax;
  const dy = by - ay;
  const c = rx * rx + ry * ry - r * r;
  if (c <= 0) return null;
  const a = dx * dx + dy * dy;
  if (a === 0) return null;
  const b = 2 * (rx * dx + ry * dy);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const f = (-b - Math.sqrt(disc)) / (2 * a);
  return f >= 0 && f <= 1 ? f : null;
}

/** Distanza minima in km tra il punto `c` e il segmento p0→p1. */
export function segmentDistanceKm(p0: LngLat, p1: LngLat, c: LngLat): number {
  const [x, y] = toKm(p1, p0);
  const [cx, cy] = toKm(c, p0);
  const len2 = x * x + y * y;
  const t = len2 > 0 ? Math.max(0, Math.min(1, (cx * x + cy * y) / len2)) : 0;
  return Math.hypot(cx - x * t, cy - y * t);
}

export function lerp(a: LngLat, b: LngLat, t: number): LngLat {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
