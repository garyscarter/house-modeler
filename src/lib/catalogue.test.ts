import { describe, expect, it } from "vitest";
import { CATALOGUE, CATEGORIES, byId, hasWorktop, radiatorPanels, sideBySideSplit, wardrobeDoorCount } from "./catalogue";

describe("radiators", () => {
  it("offers wall-hung single and double panels, a column and a vertical radiator under Heating", () => {
    const heating = CATALOGUE.filter((c) => c.category === "Heating");
    expect(CATEGORIES).toContain("Heating");
    expect(heating.map((c) => c.symbol)).toEqual(expect.arrayContaining(["radiator", "column-radiator"]));
    for (const c of heating) {
      expect(c.mount, c.id).toBeGreaterThan(0.05);
      expect(c.mount, c.id).toBeLessThan(0.2);
    }
    // Depth is the type: a single panel is about 70 mm deep, a double about 100 mm.
    expect(radiatorPanels(byId("radiator-single-600")!.d)).toBe(1);
    expect(radiatorPanels(byId("radiator-double-1000")!.d)).toBe(2);
    expect(heating.filter((c) => c.symbol === "radiator").map((c) => radiatorPanels(c.d))).toEqual(expect.arrayContaining([1, 2]));
  });
});

describe("fitted wardrobes", () => {
  it("gives the shaker style about seven doors across the listing's 3.15 m run", () => {
    expect(byId("wardrobe-shaker")?.symbol).toBe("shaker-wardrobe");
    expect(wardrobeDoorCount("shaker-wardrobe", 3.15)).toBe(7);
  });

  it("keeps the flat-door pitch of the plain fitted wardrobe, and always has a door", () => {
    expect(wardrobeDoorCount("fitted-wardrobe", 2.2)).toBe(4);
    expect(wardrobeDoorCount("shaker-wardrobe", 0.2)).toBe(1);
  });
});

describe("modern kitchen", () => {
  it("offers an American fridge freezer at a typical side-by-side size, freezer door the narrower", () => {
    const f = byId("american-fridge")!;
    expect(f.category).toBe("Kitchen");
    expect(f.w).toBeGreaterThan(0.85);
    expect(f.w).toBeLessThan(0.95);
    expect(f.h).toBeGreaterThan(1.7);
    const split = sideBySideSplit(f.w);
    expect(split + f.w / 2).toBeLessThan(f.w / 2 - split);
    expect(hasWorktop(f)).toBe(false);
  });

  it("puts a worktop on the new base units and the waterfall island, and keeps ids unique", () => {
    for (const id of ["handleless-unit", "handleless-run", "pan-drawers", "wine-cooler", "island-waterfall"]) expect(hasWorktop(byId(id)!), id).toBe(true);
    expect(new Set(CATALOGUE.map((c) => c.id)).size).toBe(CATALOGUE.length);
  });

  it("hangs the chimney extractor and floating shelf on the wall", () => {
    expect(byId("chimney-hood")!.mount).toBeGreaterThan(1.4);
    expect(byId("floating-shelf")!.mount).toBeGreaterThan(1.2);
  });
});
