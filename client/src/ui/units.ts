import { UNIT_TYPES, type Unit, type UnitTypeId } from "@waw/shared";

/** "3× Fanteria, 1× Artiglieria", nell'ordine dei tipi di unità, con i punti salute sommati. */
export function groupUnits(units: Unit[]): { type: UnitTypeId; name: string; count: number; hp: number }[] {
  const groups = new Map<UnitTypeId, { count: number; hp: number }>();
  for (const u of units) {
    const g = groups.get(u.type) ?? { count: 0, hp: 0 };
    g.count++;
    g.hp += u.hp;
    groups.set(u.type, g);
  }
  return (Object.keys(UNIT_TYPES) as UnitTypeId[])
    .filter((t) => groups.has(t))
    .map((t) => ({ type: t, name: UNIT_TYPES[t].name, ...groups.get(t)! }));
}
