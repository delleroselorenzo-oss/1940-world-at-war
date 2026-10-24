import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calendarDate, LEADER_TERMS, leaderAt } from "@waw/shared";

const assets = new URL("../assets/leaders/", import.meta.url);
const map = JSON.parse(readFileSync(new URL("../../../data/maps/europe-1933/map.json", import.meta.url), "utf8")) as {
  nations: { id: string }[];
};

describe("capi delle nazioni", () => {
  it("ogni nazione della mappa ha i suoi capi, in ordine di data", () => {
    for (const { id } of map.nations) {
      const terms = LEADER_TERMS[id] ?? [];
      expect(terms.length, id).toBeGreaterThan(0);
      const dates = terms.map((t) => t.from);
      expect(dates, id).toEqual([...dates].sort());
    }
  });

  it("ogni capo ha il suo ritratto", () => {
    for (const terms of Object.values(LEADER_TERMS)) {
      for (const t of terms) expect(existsSync(new URL(`${t.portrait}.jpg`, assets)), t.portrait).toBe(true);
    }
  });

  it("sceglie il capo in carica nella data della partita", () => {
    expect(leaderAt("GBR", "1933-06-01")?.name).toBe("Ramsay MacDonald");
    expect(leaderAt("GBR", "1940-05-09")?.name).toBe("Neville Chamberlain");
    expect(leaderAt("GBR", "1940-05-10")?.name).toBe("Winston Churchill");
    expect(leaderAt("DAN", "1933-06-01")?.name).toBe("Ernst Ziehm");
    expect(leaderAt("XXX", "1933-06-01")).toBeUndefined();
  });

  it("conta i giorni del calendario dal 1 giugno 1933", () => {
    expect(calendarDate(0)).toBe("1933-06-01");
    expect(calendarDate(1439)).toBe("1933-06-01");
    expect(calendarDate(30 * 1440)).toBe("1933-07-01");
  });
});
