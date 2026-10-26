import { NAVAL } from "../data/naval.js";
import type { LngLat, NationId, ProvinceId } from "../map/types.js";
import { cellAt, cellCenter, flatKm } from "../nav/grid.js";
import type { Route } from "../nav/route.js";
import { findSeaRoute, isNavigable } from "../nav/sea.js";
import type { NavData } from "../nav/types.js";
import { buildingLevel } from "./buildings.js";
import type { Mover } from "./movement.js";
import { closedStraits, mayDock, newFleet } from "./navy.js";
import { logEvent } from "./diplomacy.js";
import { moverOf, scheduleRoute } from "./movement.js";
import { provinceIdAt } from "../nav/grid.js";
import { passableTerritory, planRoute } from "./routing.js";
import type { Army, Fleet, GameState, SeaPlan } from "./state.js";

// Trasporti e sbarchi (docs/game-design.md, §8 "Marina", passo 5). Quando la meta di una marcia non si raggiunge via terra,
// l'armata va per mare: marcia fino al porto d'imbarco più conveniente (proprio o di chi concede il passaggio), si imbarca,
// naviga come trasporto fino al tratto di costa più vicino alla meta, sbarca e prosegue a piedi.

export interface AmphibiousPlan {
  /** Marcia fino al porto d'imbarco. */
  route: Route;
  plan: SeaPlan;
  /** Stima della durata complessiva in minuti (per scegliere il porto migliore). */
  minutes: number;
}

/**
 * Percorso di una marcia: via terra se si può, altrimenti per mare (marcia fino al porto d'imbarco con `seaPlan`).
 * Restituisce il motivo se non si può in nessun modo.
 */
export function marchPlan(
  state: GameState,
  nav: NavData,
  nation: NationId,
  from: LngLat,
  target: LngLat,
  mover: Mover,
): { route: Route; seaPlan: SeaPlan | null } | string {
  const route = planRoute(state, nav, nation, from, target, mover);
  if (route) return { route, seaPlan: null };
  const amphibious = planAmphibious(state, nav, nation, from, target, mover);
  if (typeof amphibious === "string") return amphibious === "Punto non raggiungibile via terra." ? "Punto non raggiungibile via terra (senza attraversare paesi terzi)." : amphibious;
  return { route: amphibious.route, seaPlan: amphibious.plan };
}

/** Porti d'imbarco provati (i più promettenti in linea d'aria). */
const EMBARK_CANDIDATES = 6;
/** Punti di sbarco provati (i più vicini alla meta, in territorio dove si può entrare). */
const LANDING_CANDIDATES = 4;
/** Punti di sbarco raccolti prima di scartare quelli in territorio altrui. */
const LANDING_SEARCH = 24;

/** Minuti d'imbarco nella provincia: meno con un porto o un cantiere navale. */
export function boardingMinutes(state: GameState, province: ProvinceId): number {
  return buildingLevel(state, province, "port") > 0 || buildingLevel(state, province, "shipyard") > 0 ? NAVAL.boardPortMinutes : NAVAL.boardMinutes;
}

/** Minuti di sbarco: meno nel porto (con porto o cantiere) di una provincia amica, di più su una costa aperta. */
export function landingMinutes(state: GameState, nav: NavData, nation: NationId, landAt: LngLat): number {
  const cell = cellAt(nav, landAt);
  const harbor = nav.sea?.harbor;
  if (harbor)
    for (let i = 0; i < harbor.length; i++) {
      if (harbor[i] !== cell) continue;
      const id = nav.provinceIds[i]!;
      if (mayDock(state, nation, state.provinces[id]?.owner ?? "") && boardingMinutes(state, id) === NAVAL.boardPortMinutes) return NAVAL.landPortMinutes;
    }
  return NAVAL.landMinutes;
}

/** Piano per portare un'armata di `nation` da `from` a `target` passando per il mare, o il motivo per cui non si può. */
export function planAmphibious(state: GameState, nav: NavData, nation: NationId, from: LngLat, target: LngLat, mover: Mover): AmphibiousPlan | string {
  if (!nav.sea) return "Punto non raggiungibile via terra.";
  const targetProvince = provinceIdAt(nav, target);
  const passable = passableTerritory(state, nav, nation, targetProvince ? state.provinces[targetProvince]?.owner : undefined);
  // Si sbarca solo dove si può entrare (mai in un paese terzo, come per le marce).
  const landings = landingPoints(nav, target, LANDING_SEARCH).filter((l) => passable(cellAt(nav, l.landPoint)));
  if (landings.length === 0) return "Punto non raggiungibile né via terra né dal mare.";
  // Lo sbarco più vicino alla meta da cui la meta si raggiunge a piedi.
  let landing: { landAt: LngLat; landPoint: LngLat; minutes: number } | null = null;
  for (const l of landings.slice(0, LANDING_CANDIDATES)) {
    const walk = flatKm(l.landPoint, target) < 0.5 ? { km: 0 } : planRoute(state, nav, nation, l.landPoint, target, mover);
    if (!walk) continue;
    landing = { ...l, minutes: (walk.km / mover.speedKmh) * 60 };
    break;
  }
  if (!landing) return "Nessun tratto di costa da cui raggiungere la meta.";

  const closed = closedStraits(state, nav, nation);
  const ports = nav.provinceIds
    .map((id, i) => ({ id, cell: nav.sea!.harbor[i]! }))
    .filter((p) => p.cell >= 0 && mayDock(state, nation, state.provinces[p.id]?.owner ?? ""))
    .map((p) => ({ ...p, at: cellCenter(nav, p.cell) }))
    .sort((a, b) => flatKm(from, a.at) + flatKm(a.at, landing.landAt) - (flatKm(from, b.at) + flatKm(b.at, landing.landAt)))
    .slice(0, EMBARK_CANDIDATES);
  let best: AmphibiousPlan | null = null;
  for (const p of ports) {
    const embarkPoint = shoreOf(nav, p.cell, p.id);
    if (!embarkPoint) continue;
    const route = flatKm(from, embarkPoint) < 0.5 ? { points: [from, from], onRoad: [false], rail: [0], terrain: [1], km: 0 } : planRoute(state, nav, nation, from, embarkPoint, mover);
    if (!route) continue;
    const sea = findSeaRoute(nav, p.at, landing.landAt, { closedStraits: closed });
    if (!sea) continue;
    const minutes =
      (route.km / mover.speedKmh) * 60 +
      boardingMinutes(state, p.id) +
      (sea.km / NAVAL.transportKmh) * 60 +
      landingMinutes(state, nav, nation, landing.landAt) +
      landing.minutes;
    if (!best || minutes < best.minutes) best = { route, plan: { embark: p.id, landAt: landing.landAt, landPoint: landing.landPoint, target }, minutes };
  }
  return best ?? "Nessun porto da cui imbarcarsi verso la meta (servono un porto tuo o di chi ti concede il passaggio, e una rotta libera).";
}

/** Punto a terra accanto all'approdo (dove l'armata sale a bordo): la cella della provincia vicina alla cella di mare. */
export function shoreOf(nav: NavData, seaCell: number, province: ProvinceId): LngLat | null {
  const index = nav.provinceIds.indexOf(province) + 1;
  const { width, height } = nav.grid;
  const c0 = seaCell % width;
  const r0 = Math.floor(seaCell / width);
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      const c = c0 + dc;
      const r = r0 + dr;
      if (c < 0 || r < 0 || c >= width || r >= height) continue;
      if (nav.grid.province[r * width + c] === index) return cellCenter(nav, r * width + c);
    }
  return null;
}

/**
 * Punti di sbarco vicino alla meta, dal più vicino: una cella di mare navigabile e la cella di terra accanto più vicina alla meta.
 * Si cercano ad anelli quadrati intorno alla meta, fino a `NAVAL.landingSearchCells`.
 */
export function landingPoints(nav: NavData, target: LngLat, count = LANDING_CANDIDATES): { landAt: LngLat; landPoint: LngLat }[] {
  const { width, height } = nav.grid;
  const home = cellAt(nav, target);
  if (home < 0) return [];
  const c0 = home % width;
  const r0 = Math.floor(home / width);
  const found: { landAt: LngLat; landPoint: LngLat; km: number }[] = [];
  for (let d = 1; d <= NAVAL.landingSearchCells && found.length < count; d++) {
    for (let r = r0 - d; r <= r0 + d; r++)
      for (let c = c0 - d; c <= c0 + d; c++) {
        if (Math.max(Math.abs(r - r0), Math.abs(c - c0)) !== d || c < 0 || r < 0 || c >= width || r >= height) continue;
        const cell = r * width + c;
        if (!isNavigable(nav, cell) || nav.sea!.strait[cell]) continue;
        let land = -1;
        let landKm = Infinity;
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            const nc = c + dc;
            const nr = r + dr;
            if (nc < 0 || nr < 0 || nc >= width || nr >= height) continue;
            const n = nr * width + nc;
            if (nav.grid.province[n]! === 0) continue;
            const km = flatKm(cellCenter(nav, n), target);
            if (km < landKm) [land, landKm] = [n, km];
          }
        if (land >= 0) found.push({ landAt: cellCenter(nav, cell), landPoint: cellCenter(nav, land), km: landKm });
      }
  }
  return found.sort((a, b) => a.km - b.km).map(({ landAt, landPoint }) => ({ landAt, landPoint }));
}

// --- Motore ---

/** L'armata è arrivata al porto d'imbarco: diventa un trasporto ormeggiato lì, che parte a imbarco finito. Modifica `s`. */
export function embark(s: GameState, nav: NavData, army: Army, t: number): void {
  const plan = army.seaPlan!;
  army.seaPlan = null;
  const i = nav.provinceIds.indexOf(plan.embark);
  const cell = i >= 0 ? (nav.sea?.harbor[i] ?? -1) : -1;
  // Il porto non è più utilizzabile (perso, accordo revocato): l'armata resta a terra.
  if (cell < 0 || !mayDock(s, army.owner, s.provinces[plan.embark]?.owner ?? "")) return;
  const fleet = newFleet(s, army.owner, cellCenter(nav, cell), plan.embark);
  fleet.transport = {
    ...plan,
    army: { ...army, move: null, halted: null, departure: null, task: null, seaPlan: null },
    phase: "boarding",
    until: t + boardingMinutes(s, plan.embark),
  };
  delete s.armies[army.id];
}

/** L'armata del trasporto torna a terra in `at` (e, se c'è una meta, ci marcia). Modifica `s`. */
function disembark(s: GameState, nav: NavData, fleet: Fleet, at: LngLat, target: LngLat | null, t: number): void {
  const army: Army = { ...fleet.transport!.army, position: at, settledAt: t };
  delete s.fleets[fleet.id];
  if (army.units.length === 0) return;
  s.armies[army.id] = army;
  if (!target) return;
  const mover = moverOf(army);
  const route = flatKm(at, target) < 0.5 ? null : planRoute(s, nav, army.owner, at, target, mover);
  if (route) army.move = scheduleRoute(route, mover, t);
}

/**
 * Trasporti al minuto `t`: a imbarco finito partono per lo sbarco (se la rotta è chiusa l'armata torna a terra),
 * arrivati sbarcano, a sbarco finito l'armata è a terra e prosegue verso la meta. Modifica `s`; true se sono cambiate le armate.
 */
export function transportOps(s: GameState, world: { nav?: NavData }, t: number): boolean {
  const { nav } = world;
  if (!nav) return false;
  let changed = false;
  for (const fleet of Object.values(s.fleets)) {
    const tr = fleet.transport;
    if (!tr) continue;
    if (tr.phase === "boarding" && tr.until <= t) {
      const sea = findSeaRoute(nav, fleet.position, tr.landAt, { closedStraits: closedStraits(s, nav, fleet.owner) });
      if (!sea) {
        disembark(s, nav, fleet, tr.army.position, null, t);
        changed = true;
        continue;
      }
      const times = [t];
      for (let i = 1; i < sea.points.length; i++) times.push(times[i - 1]! + (flatKm(sea.points[i - 1]!, sea.points[i]!) / NAVAL.transportKmh) * 60);
      fleet.voyage = { points: sea.points, times };
      fleet.position = sea.points[0]!;
      fleet.port = null;
      fleet.transport = { ...tr, phase: "sailing", until: times[times.length - 1]! };
    } else if (tr.phase === "sailing" && fleet.voyage && fleet.voyage.times[fleet.voyage.times.length - 1]! <= t) {
      fleet.position = fleet.voyage.points[fleet.voyage.points.length - 1]!;
      fleet.voyage = null;
      fleet.transport = { ...tr, phase: "landing", until: t + landingMinutes(s, nav, fleet.owner, tr.landAt) };
    } else if (tr.phase === "landing" && tr.until <= t) {
      const province = provinceIdAt(nav, tr.landPoint);
      logEvent(s, { time: t, type: "landing", owner: fleet.owner, at: tr.landPoint, province, provinceOwner: province ? (s.provinces[province]?.owner ?? null) : null });
      disembark(s, nav, fleet, tr.landPoint, tr.target, t);
      changed = true;
    }
  }
  return changed;
}

/** Prossimo minuto in cui un trasporto cambia fase (fine imbarco o sbarco; l'arrivo è quello della navigazione). */
export function nextTransportEvent(s: GameState): number {
  let next = Infinity;
  for (const f of Object.values(s.fleets)) {
    const tr = f.transport;
    if (tr && tr.phase !== "sailing" && tr.until > s.time) next = Math.min(next, tr.until);
  }
  return next;
}
