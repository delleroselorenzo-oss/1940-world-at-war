import {
  BUILDINGS,
  provinceProductionPerDay,
  RESOURCE_NAMES,
  TRADE,
  UNIT_TYPE_IDS,
  UNIT_TYPES,
  type BuildingId,
  type Province,
  type ProvinceBuildings,
  type ProvinceState,
} from "@waw/shared";
import { formatAmount } from "./format.js";

// Effetto di un edificio a parole, per il pannello Edifici: in generale (per livello)
// e nella provincia scelta, passando dal livello attuale al successivo.

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Unità che l'edificio permette di arruolare. */
function unlocks(building: BuildingId): string {
  return UNIT_TYPE_IDS.filter((t) => UNIT_TYPES[t].building === building)
    .map((t) => UNIT_TYPES[t].name.toLowerCase())
    .join(", ");
}

/** Effetto per livello, valido ovunque. */
export function buildingEffect(building: BuildingId): string {
  switch (building) {
    case "industry":
      return `+${pct(BUILDINGS.industryBonusPerLevel)} della risorsa principale per livello (denaro, se la provincia non ne ha).`;
    case "recruitmentOffice":
      return `+${pct(BUILDINGS.recruitmentBonusPerLevel)} di manodopera per livello.`;
    case "syntheticFuel":
      return `Ogni livello trasforma ${formatAmount(BUILDINGS.syntheticMetalPerLevel)} di metallo in ${formatAmount(BUILDINGS.syntheticOilPerLevel)} di petrolio al giorno.`;
    case "fortifications":
      return `−${pct(BUILDINGS.fortDefensePerLevel)} di danni alle tue armate che difendono nella provincia, per livello.`;
    case "port":
      return `+${formatAmount(TRADE.portPerLevel)} al giorno di capacità di importazione dall'estero; imbarco e sbarco delle truppe con la marina.`;
    case "airfield":
      return "Base per gli aerei (con l'aeronautica).";
    case "aircraftFactory":
      return "Costruirà gli aerei (con l'aeronautica).";
    case "shipyard":
      return "Costruirà le navi (con la marina).";
    default:
      return `Livello 1: arruola ${unlocks(building)}. Ogni livello in più: −${pct(BUILDINGS.productionTimeCutPerLevel)} sui tempi di arruolamento.`;
  }
}

/** Cosa cambia nella provincia passando dal livello attuale al successivo (null se non c'è niente da aggiungere). */
export function buildingEffectHere(building: BuildingId, province: Province, ps: ProvinceState, buildings: ProvinceBuildings = {}): string | null {
  const level = buildings[building] ?? 0;
  const next = level + 1;
  switch (building) {
    case "industry":
    case "recruitmentOffice": {
      const resource = building === "industry" ? (province.resource ?? "money") : "manpower";
      const before = provinceProductionPerDay(province, ps, buildings)[resource];
      const after = provinceProductionPerDay(province, ps, { ...buildings, [building]: next })[resource];
      const gain = before > 0 ? `, +${pct(after / before - 1)}` : "";
      return `${RESOURCE_NAMES[resource]}: +${formatAmount(after - before)} al giorno (da ${formatAmount(before)} a ${formatAmount(after)}${gain}).`;
    }
    case "syntheticFuel":
      return `Al giorno: −${formatAmount(next * BUILDINGS.syntheticMetalPerLevel)} metallo, +${formatAmount(next * BUILDINGS.syntheticOilPerLevel)} petrolio (in tutto, al livello ${next}).`;
    case "fortifications":
      return `Danni subiti in difesa: −${pct(level * BUILDINGS.fortDefensePerLevel)} → −${pct(next * BUILDINGS.fortDefensePerLevel)}.`;
    case "barracks":
    case "tankFactory":
    case "artilleryFactory":
      return level === 0
        ? `Potrai arruolare: ${unlocks(building)}.`
        : `Tempi di arruolamento: −${pct((level - 1) * BUILDINGS.productionTimeCutPerLevel)} → −${pct(level * BUILDINGS.productionTimeCutPerLevel)}.`;
    default:
      return null;
  }
}
