import { describe, expect, it } from "vitest";
import { moraleColor } from "./mapModes.js";

describe("colori del morale", () => {
  it("vanno dal rosso mattone allo 0% al verde salvia al 100%, passando per l'ocra", () => {
    expect(moraleColor(0)).toBe("#b86a55");
    expect(moraleColor(50)).toBe("#d9b66a");
    expect(moraleColor(100)).toBe("#86ab80");
  });

  it("restano entro i limiti anche con valori fuori scala", () => {
    expect(moraleColor(-10)).toBe(moraleColor(0));
    expect(moraleColor(130)).toBe(moraleColor(100));
  });
});
