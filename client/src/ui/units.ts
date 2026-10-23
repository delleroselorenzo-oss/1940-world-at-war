import { UNIT_TYPES, type Unit, type UnitTypeId } from "@waw/shared";

/** "3× Fanteria, 1× Artiglieria", nell'ordine dei tipi di unità. */
export function groupUnits(units: Unit[]): { type: UnitTypeId; name: string; count: number }[] {
  const counts = new Map<UnitTypeId, number>();
  for (const u of units) counts.set(u.type, (counts.get(u.type) ?? 0) + 1);
  return (Object.keys(UNIT_TYPES) as UnitTypeId[])
    .filter((t) => counts.has(t))
    .map((t) => ({ type: t, name: UNIT_TYPES[t].name, count: counts.get(t)! }));
}
