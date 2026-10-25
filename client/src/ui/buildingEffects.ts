import {
  AIR,
  BUILDINGS,
  provinceProductionPerDay,
  RESOURCE_IDS,
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
      return `+${pct(BUILDINGS.industryBonusPerLevel)} della risorsa principale e +${pct(BUILDINGS.industryMoneyPerLevel)} di denaro per livello (solo denaro, se la provincia non ha una risorsa principale; nei giacimenti di petrolio +${pct(BUILDINGS.industryOilMoneyPerLevel)} di denaro).`;
    case "recruitmentOffice":
      return `+${pct(BUILDINGS.recruitmentBonusPerLevel)} di manodopera per livello.`;
    case "syntheticFuel":
      return `Ogni livello trasforma ${formatAmount(BUILDINGS.syntheticMetalPerLevel)} di metallo in ${formatAmount(BUILDINGS.syntheticOilPerLevel)} di petrolio al giorno.`;
    case "fortifications":
      return `−${pct(BUILDINGS.fortDefensePerLevel)} di danni alle tue armate che difendono nella provincia, per livello.`;
    case "port":
      return `+${formatAmount(TRADE.portPerLevel)} al giorno di capacità di importazione dall'estero; imbarco e sbarco delle truppe con la marina.`;
    case "airfield":
      return `Base per gli aerei, tuoi e degli alleati. Ogni livello oltre il primo: −${pct(AIR.airfieldTimeCutPerLevel)} sui tempi a terra (rifornimento, riparazioni).`;
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
      const before = provinceProductionPerDay(province, ps, buildings);
      const after = provinceProductionPerDay(province, ps, {
        ...buildings,
        [building]: next,
      });
      const resources = building === "recruitmentOffice" ? (["manpower"] as const) : RESOURCE_IDS.filter((r) => after[r] > before[r] + 1e-9);
      return resources
        .map((r) => {
          const gain = before[r] > 0 ? `, +${pct(after[r] / before[r] - 1)}` : "";
          return `${RESOURCE_NAMES[r]}: +${formatAmount(after[r] - before[r])} al giorno (da ${formatAmount(before[r])} a ${formatAmount(after[r])}${gain}).`;
        })
        .join(" ");
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
