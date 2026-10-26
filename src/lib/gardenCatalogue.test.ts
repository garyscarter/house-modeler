import { describe, expect, it } from "vitest";
import { COST_LINES } from "./report";
import { GARDEN_CATEGORIES, GARDEN_ITEMS, gardenDef, isLight, isPlant, itemSize, kerbOf } from "./gardenCatalogue";

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
  it("has positive sizes and valid colours", () => {
    for (const g of GARDEN_ITEMS) {
      expect(g.w, g.id).toBeGreaterThan(0);
      expect(g.d, g.id).toBeGreaterThan(0);
      expect(g.h, g.id).toBeGreaterThan(0);
      expect(g.color, g.id).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
  it("gives every run a pitch and every light a glow", () => {
    for (const g of GARDEN_ITEMS) {
      if (g.run) expect(g.pitch, g.id).toBeGreaterThan(0);
      if (isLight(g)) expect(g.glow, g.id).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
  it("draws every plant round or as a run", () => {
    for (const g of GARDEN_ITEMS.filter(isPlant)) expect(g.round || g.run, g.id).toBeTruthy();
  });
  it("keeps the baseline entries and the baseline colours", () => {
    expect(gardenDef("dining-6")).toMatchObject({ seats: 6, color: "#2f3236" });
    expect(gardenDef("parasol")?.accent).toBe("#8c8f91");
    expect(itemSize({ type: "dining-6", w: 3 })).toEqual({ w: 3, d: 2, h: 0.75 });
  });
  it("uses every shape at least once", () => {
    expect(new Set(GARDEN_ITEMS.map((g) => g.shape)).size).toBe(36);
  });
});
