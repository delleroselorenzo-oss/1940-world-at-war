import { BUILDING_TYPES, type BuildingId } from "../data/buildings.js";
import { ENGINEERING } from "../data/engineering.js";
import { UNIT_TYPES } from "../data/units.js";
import type { LngLat, MapData, ResourceId } from "../map/types.js";
import { cellAt, cellCenter, flatKm, isBlocked, passageKey, provinceIdAt } from "../nav/grid.js";
import type { NavData } from "../nav/types.js";
import { allowedIn, buildingCost, buildingLevel, buildingMinutes } from "./buildings.js";
import { segmentDistanceKm } from "./combat.js";
import { canAfford } from "./economy.js";
import { mapIndex } from "./mapIndex.js";
import { armyPosition } from "./movement.js";
import { bridgeIndex } from "./routing.js";
import type { Army, GameState, WorkTarget, WorkType } from "./state.js";

// Lavori sul campo: distruggere ponti (o ponti di barche), ripararli, gettare ponti di barche,
// costruire ospedali da campo, fortificare la provincia, costruire aeroporti e porti, sabotare e riparare i pozzi di petrolio.
// Qui si decide cosa può fare un'armata e quanto ci mette; il motore applica il risultato quando il lavoro finisce.

export const WORK_TYPES: readonly WorkType[] = [
  "demolish",
  "repair",
  "pontoon",
  "hospital",
  "fortify",
  "airfield",
  "port",
  "sabotageWells",
  "repairWells",
];

export const WORK_NAMES: Record<WorkType, string> = {
  demolish: "Distruggi il ponte",
  repair: "Ripara il ponte",
  pontoon: "Ponte di barche",
  hospital: "Ospedale da campo",
  fortify: "Fortifica la provincia",
  airfield: "Costruisci l'aeroporto",
  port: "Costruisci il porto",
  sabotageWells: "Sabota i pozzi di petrolio",
  repairWells: "Ripara i pozzi di petrolio",
};

/** Edificio costruito da un lavoro del genio. */
export const WORK_BUILDINGS: Partial<Record<WorkType, BuildingId>> = {
  fortify: "fortifications",
  airfield: "airfield",
  port: "port",
};

export interface WorkOption {
  work: WorkType;
  /** Su cosa si lavorerebbe (null se non c'è niente a portata). */
  target: WorkTarget | null;
  /** Durata in minuti di gioco con l'armata attuale. */
  minutes: number;
  /** Perché non si può fare adesso (null = si può). */
  missing: string | null;
  /** Fiume interessato, se c'è. */
  river: string | null;
  /** Risorse da pagare all'inizio (solo per gli edifici). */
  cost: Partial<Record<ResourceId, number>> | null;
  /** Livello che avrà l'edificio a fine lavoro. */
  level: number | null;
}

/** Quante unità dell'armata hanno il ruolo indicato. */
export function countRole(army: Army, role: "engineer" | "medic"): number {
  return army.units.filter((u) => UNIT_TYPES[u.type].role === role).length;
}

/**
 * Durata di un lavoro: il genio lavora più in fretta se è più numeroso (fino a un limite).
 * Per gli edifici conta il livello da costruire.
 */
export function workMinutes(work: WorkType, engineers: number, level = 1): number {
  if (work === "demolish") return ENGINEERING.demolishMinutes;
  if (work === "sabotageWells") return ENGINEERING.sabotageWellsMinutes;
  const building = WORK_BUILDINGS[work];
  const base = building
    ? buildingMinutes(building, level)
    : work === "repair"
      ? ENGINEERING.repairMinutes
      : work === "pontoon"
        ? ENGINEERING.pontoonMinutes
        : ENGINEERING.hospitalMinutes;
  return base / Math.max(1, Math.min(engineers, ENGINEERING.maxEngineers));
}

/** Tutti i lavori, ciascuno con il bersaglio più vicino e il motivo per cui non si può fare (se c'è). */
export function availableWorks(state: GameState, world: { map: MapData; nav: NavData }, army: Army, now: number): WorkOption[] {
  const { nav } = world;
  const at = armyPosition(army, now);
  const engineers = countRole(army, "engineer");
  const moving = army.move !== null || army.halted !== null;
  const busy = army.task !== null;
  const general = moving ? "L'armata deve essere ferma." : busy ? "L'armata sta già lavorando." : null;
  const noEngineer = engineers === 0 ? "Serve il genio." : null;

  const options: WorkOption[] = [];

  // Distruggere: il ponte o il ponte di barche più vicino entro il raggio. Lo può fare chiunque.
  const intact = nearestBridge(state, nav, at, false);
  const pontoon = nearestPontoon(state, at);
  const demolish =
    pontoon && (!intact || pontoon.km < intact.km)
      ? { target: { kind: "pontoon", id: pontoon.id, at: pontoon.at } as WorkTarget, river: pontoon.river }
      : intact
        ? { target: { kind: "bridge", id: intact.id, at: intact.at } as WorkTarget, river: intact.river }
        : null;
  options.push({
    work: "demolish",
    target: demolish?.target ?? null,
    minutes: workMinutes("demolish", engineers),
    missing: general ?? (demolish ? null : `Nessun ponte entro ${ENGINEERING.bridgeRadiusKm} km.`),
    river: demolish?.river ?? null,
    cost: null,
    level: null,
  });

  const broken = nearestBridge(state, nav, at, true);
  options.push({
    work: "repair",
    target: broken ? { kind: "bridge", id: broken.id, at: broken.at } : null,
    minutes: workMinutes("repair", engineers),
    missing: general ?? noEngineer ?? (broken ? null : `Nessun ponte distrutto entro ${ENGINEERING.bridgeRadiusKm} km.`),
    river: broken?.river ?? null,
    cost: null,
    level: null,
  });

  const crossing = nearestRiverCrossing(state, nav, at);
  options.push({
    work: "pontoon",
    target: crossing ? { kind: "river", cells: crossing.cells, at: crossing.at, river: crossing.river } : null,
    minutes: workMinutes("pontoon", engineers),
    missing: general ?? noEngineer ?? (crossing ? null : `Nessun fiume da attraversare entro ${ENGINEERING.riverRadiusKm} km.`),
    river: crossing?.river ?? null,
    cost: null,
    level: null,
  });

  const hospitalNear = Object.values(state.hospitals).some(
    (h) => h.owner === army.owner && flatKm(h.at, at) <= ENGINEERING.hospitalRadiusKm,
  );
  options.push({
    work: "hospital",
    target: { kind: "here", at },
    minutes: workMinutes("hospital", engineers),
    missing:
      general ??
      noEngineer ??
      (countRole(army, "medic") === 0 ? "Serve la sanità." : hospitalNear ? "C'è già un tuo ospedale qui vicino." : null),
    river: null,
    cost: null,
    level: null,
  });

  // Edifici del genio nella provincia in cui si trova l'armata (solo nelle proprie).
  const provinceId = provinceIdAt(nav, at);
  const province = provinceId ? mapIndex(world.map).provinces.get(provinceId) : undefined;
  const own = province && state.provinces[province.id]?.owner === army.owner;
  const stock = state.nations[army.owner]?.stock;
  for (const work of ["fortify", "airfield", "port"] as const) {
    const building = WORK_BUILDINGS[work]!;
    const type = BUILDING_TYPES[building];
    const current = province ? buildingLevel(state, province.id, building) : 0;
    const level = Math.min(current + 1, type.maxLevel);
    const cost = buildingCost(building, level);
    const sameWork = Object.values(state.armies).some(
      (a) => a.id !== army.id && a.owner === army.owner && a.task?.work === work && a.task.target.kind === "province" && a.task.target.id === province?.id,
    );
    options.push({
      work,
      target: province ? { kind: "province", id: province.id, at } : null,
      minutes: workMinutes(work, engineers, level),
      missing:
        general ??
        noEngineer ??
        (!own
          ? "Solo nelle tue province."
          : !allowedIn(building, province)
            ? "Solo nelle province costiere."
            : current >= type.maxLevel
              ? type.maxLevel > 1
                ? "Livello massimo."
                : "C'è già."
              : sameWork
                ? "Un'altra tua armata ci sta già lavorando."
                : !stock || !canAfford(stock, cost)
                  ? "Risorse insufficienti."
                  : null),
      river: null,
      cost,
      level,
    });
  }

  // Pozzi di petrolio della provincia: chi si ritira li sabota, chi li possiede (anche conquistati) li ripara col genio.
  const wells = province?.oilMtPerYear ? province : undefined;
  const sabotaged = wells ? state.provinces[wells.id]?.wellsSabotaged === true : false;
  const sameTask = (work: WorkType) =>
    Object.values(state.armies).some(
      (a) => a.id !== army.id && a.owner === army.owner && a.task?.work === work && a.task.target.kind === "province" && a.task.target.id === wells?.id,
    );
  options.push({
    work: "sabotageWells",
    target: wells ? { kind: "province", id: wells.id, at } : null,
    minutes: workMinutes("sabotageWells", engineers),
    missing:
      general ??
      (!wells
        ? "Nessun giacimento di petrolio qui."
        : !own
          ? "Solo nelle tue province."
          : sabotaged
            ? "I pozzi sono già fuori uso."
            : sameTask("sabotageWells")
              ? "Un'altra tua armata ci sta già lavorando."
              : null),
    river: null,
    cost: null,
    level: null,
  });
  options.push({
    work: "repairWells",
    target: wells ? { kind: "province", id: wells.id, at } : null,
    minutes: workMinutes("repairWells", engineers),
    missing:
      general ??
      noEngineer ??
      (!wells
        ? "Nessun giacimento di petrolio qui."
        : !own
          ? "Solo nelle tue province."
          : !sabotaged
            ? "I pozzi funzionano."
            : sameTask("repairWells")
              ? "Un'altra tua armata ci sta già lavorando."
              : null),
    river: null,
    cost: null,
    level: null,
  });
  return options;
}

/** Ponte (intatto o distrutto) più vicino entro il raggio di lavoro. */
function nearestBridge(state: GameState, nav: NavData, at: LngLat, destroyed: boolean) {
  const down = new Set(state.destroyedBridges);
  let best: { id: string; at: LngLat; river: string; km: number } | null = null;
  for (const b of nav.bridges) {
    if (down.has(b.id) !== destroyed) continue;
    const km = flatKm(b.at, at);
    if (km <= ENGINEERING.bridgeRadiusKm && (!best || km < best.km)) best = { ...b, km };
  }
  return best;
}

function nearestPontoon(state: GameState, at: LngLat) {
  let best: { id: string; at: LngLat; river: string | null; km: number } | null = null;
  for (const p of Object.values(state.pontoons)) {
    const km = flatKm(p.at, at);
    if (km <= ENGINEERING.bridgeRadiusKm && (!best || km < best.km)) best = { id: p.id, at: p.at, river: p.river, km };
  }
  return best;
}

/** Passaggi da una cella verso le vicine che il controllo dei fiumi considera (est, sud e diagonali in basso). */
const FORWARD: [number, number][] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [-1, 1],
];

/**
 * Il passaggio sul fiume più vicino all'armata entro il raggio: due celle di terra adiacenti
 * separate da un fiume e non già collegate da un ponte di barche.
 */
export function nearestRiverCrossing(
  state: GameState,
  nav: NavData,
  at: LngLat,
): { cells: [number, number]; at: LngLat; river: string | null } | null {
  const { width, height, province } = nav.grid;
  const here = cellAt(nav, at);
  if (here < 0) return null;
  const open = new Set(Object.values(state.pontoons).map((p) => passageKey(nav, p.cells[0], p.cells[1])));
  const c0 = here % width;
  const r0 = Math.floor(here / width);
  const reach = 2;
  let best: { cells: [number, number]; mid: LngLat; km: number } | null = null;
  for (let r = r0 - reach; r <= r0 + reach; r++)
    for (let c = c0 - reach; c <= c0 + reach; c++) {
      if (r < 0 || c < 0 || r >= height || c >= width) continue;
      const a = r * width + c;
      if (province[a] === 0) continue;
      for (const [dc, dr] of FORWARD) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr >= height || nc >= width) continue;
        const b = nr * width + nc;
        if (province[b] === 0 || !isBlocked(nav, a, b) || open.has(passageKey(nav, a, b))) continue;
        const pa = cellCenter(nav, a);
        const pb = cellCenter(nav, b);
        const mid: LngLat = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
        const km = flatKm(mid, at);
        if (km <= ENGINEERING.riverRadiusKm && (!best || km < best.km)) best = { cells: [a, b], mid, km };
      }
    }
  if (!best) return null;
  const river = riverAt(nav, best.mid);
  return { cells: best.cells, at: river?.at ?? best.mid, river: river?.name ?? null };
}

/** Punto del fiume più vicino (entro qualche km) e il suo nome. */
function riverAt(nav: NavData, at: LngLat): { name: string; at: LngLat } | null {
  const maxKm = ENGINEERING.riverRadiusKm;
  const margin = maxKm / 50; // in gradi, abbondante
  let best: { name: string; at: LngLat; km: number } | null = null;
  for (const river of nav.rivers)
    for (const line of river.lines)
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1]!;
        const b = line[i]!;
        if (Math.min(a[0], b[0]) > at[0] + margin || Math.max(a[0], b[0]) < at[0] - margin) continue;
        if (Math.min(a[1], b[1]) > at[1] + margin || Math.max(a[1], b[1]) < at[1] - margin) continue;
        const km = segmentDistanceKm(a, b, at);
        if (km > maxKm || (best && km >= best.km)) continue;
        best = { name: river.name, at: closestOnSegment(a, b, at), km };
      }
  return best ? { name: best.name, at: best.at } : null;
}

function closestOnSegment(a: LngLat, b: LngLat, p: LngLat): LngLat {
  const k = Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  const dx = (b[0] - a[0]) * k;
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, (((p[0] - a[0]) * k) * dx + (p[1] - a[1]) * dy) / len));
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Il bersaglio è ancora valido? (es. il ponte non è stato già distrutto da altri, la provincia è ancora sua) */
export function targetStillValid(state: GameState, nav: NavData, army: Army, work: WorkType, target: WorkTarget): boolean {
  switch (target.kind) {
    case "bridge": {
      if (bridgeIndex(nav, target.id) < 0) return false;
      const down = state.destroyedBridges.includes(target.id);
      return work === "repair" ? down : !down;
    }
    case "pontoon":
      return state.pontoons[target.id] !== undefined;
    case "river": {
      const [a, b] = target.cells;
      const key = passageKey(nav, a, b);
      return isBlocked(nav, a, b) && !Object.values(state.pontoons).some((p) => passageKey(nav, p.cells[0], p.cells[1]) === key);
    }
    case "here":
      return true;
    case "province": {
      const ps = state.provinces[target.id];
      if (work === "sabotageWells") return ps?.owner === army.owner && !ps.wellsSabotaged;
      if (work === "repairWells") return ps?.owner === army.owner && ps.wellsSabotaged === true;
      const building = WORK_BUILDINGS[work];
      return (
        building !== undefined &&
        state.provinces[target.id]?.owner === army.owner &&
        buildingLevel(state, target.id, building) < BUILDING_TYPES[building].maxLevel
      );
    }
  }
}
