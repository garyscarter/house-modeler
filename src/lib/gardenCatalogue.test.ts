import { describe, expect, it } from "vitest";
import { COST_LINES } from "./report";
import { GARDEN_CATEGORIES, GARDEN_ITEMS, kerbOf } from "./gardenCatalogue";

describe("garden catalogue", () => {
  it("has unique ids, known categories and priced lines", () => {
    expect(new Set(GARDEN_ITEMS.map((g) => g.id)).size).toBe(GARDEN_ITEMS.length);
    for (const g of GARDEN_ITEMS) {
      expect(GARDEN_CATEGORIES).toContain(g.category);
      expect(COST_LINES.some((c) => c.id === g.costLine)).toBe(true);
    }
  });
  it("keeps brick round raised beds and nothing round flat ones by default", () => {
    expect(kerbOf({ kind: "bed", slope: { toward: "back", rise: 0, base: 0.3 } }).style).toBe("brick");
    expect(kerbOf({ kind: "lawn" }).style).toBe("none");
    expect(kerbOf({ kind: "patio", kerb: "sleeper" }).style).toBe("none");
    expect(kerbOf({ kind: "lawn", kerb: "sleeper" })).toEqual({ style: "sleeper", height: 0.1 });
  });
});
