import { describe, expect, it } from "vitest";
import { placeLabels } from "./labels.js";

const box = (priority: number, left: number, top: number) => ({ priority, left, top, width: 50, height: 12 });

describe("placeLabels", () => {
  it("mostra le etichette che non si toccano", () => {
    expect(placeLabels([box(1, 0, 0), box(1, 100, 0)])).toEqual(new Set([0, 1]));
  });

  it("in caso di sovrapposizione vince la priorità più alta", () => {
    const visible = placeLabels([box(2, 0, 0), box(0, 20, 5)]);
    expect(visible).toEqual(new Set([1]));
  });

  it("a parità di priorità vince la prima", () => {
    expect(placeLabels([box(1, 0, 0), box(1, 10, 0)])).toEqual(new Set([0]));
  });
});
