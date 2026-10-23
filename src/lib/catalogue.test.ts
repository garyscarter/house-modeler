import { describe, expect, it } from "vitest";
import { CATALOGUE, CATEGORIES, byId, chaiseSizes, isFloorCovering, radiatorPanels, wardrobeDoorCount } from "./catalogue";

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

describe("modern lounge furniture", () => {
  it("offers low sofas, a chaise, a lounge chair, round tables, a floating media unit, a lamp and rugs under Living", () => {
    const ids = ["sofa-low-3", "sofa-low-2", "sofa-chaise", "lounge-chair", "pouf", "coffee-table-round", "side-table-round", "media-unit", "floor-lamp", "rug-large", "rug-medium"];
    for (const id of ids) expect(byId(id)?.category, id).toBe("Living");
    expect(byId("media-unit")!.mount).toBeGreaterThan(0);
    expect(new Set(CATALOGUE.map((c) => c.id)).size).toBe(CATALOGUE.length);
  });

  it("treats only rugs as floor coverings", () => {
    expect(CATALOGUE.filter(isFloorCovering).map((c) => c.id)).toEqual(["rug-large", "rug-medium"]);
  });

  it("keeps the chaise inside the footprint and wider than the arm", () => {
    const { s, c, back, arm } = chaiseSizes(2.7, 1.65);
    expect(s).toBeLessThan(1.65);
    expect(c).toBeLessThan(2.7 / 2);
    expect(c).toBeGreaterThan(arm);
    expect(back).toBeLessThan(s);
  });
});
