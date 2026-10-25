import { describe, expect, it } from "vitest";
import { CATALOGUE, CATEGORIES, byId, chaiseSizes, cornerArm, filterCatalogue, hasWorktop, isFloorCovering, isHandleless, peninsulaOverhang, radiatorPanels, sideBySideSplit, wardrobeDoorCount } from "./catalogue";

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

describe("filterCatalogue", () => {
  const first = CATALOGUE[0];
  it("returns everything for an empty query and All", () => {
    expect(filterCatalogue("", "All")).toHaveLength(CATALOGUE.length);
    expect(filterCatalogue("   ", "All")).toHaveLength(CATALOGUE.length);
  });
  it("ignores case", () => {
    expect(filterCatalogue(first.name.toUpperCase(), "All").map((c) => c.id)).toContain(first.id);
  });
  it("needs every word to match, in any order", () => {
    const words = first.name.split(/\s+/);
    const reversed = [...words].reverse().join("  ");
    expect(filterCatalogue(reversed, "All").map((c) => c.id)).toContain(first.id);
    expect(filterCatalogue(`${words[0]} zzzznothing`, "All")).toEqual([]);
  });
  it("restricts to a category and matches the category name", () => {
    const cat = CATEGORIES[0];
    const inCat = filterCatalogue("", cat);
    expect(inCat.length).toBeGreaterThan(0);
    expect(inCat.every((c) => c.category === cat)).toBe(true);
    expect(filterCatalogue("", "No such category")).toEqual([]);
    expect(filterCatalogue(cat.toLowerCase(), "All").length).toBeGreaterThanOrEqual(inCat.length);
  });
  it("matches the note", () => {
    const withNote = CATALOGUE.find((c) => c.note)!;
    const word = withNote.note!.split(/\s+/).find((w) => w.length > 3)!;
    expect(filterCatalogue(word, "All").map((c) => c.id)).toContain(withNote.id);
  });
  it("finds nothing for a nonsense query", () => {
    expect(filterCatalogue("qqqqxx", "All")).toEqual([]);
  });
});

describe("joinery", () => {
  it("offers built-ins, window seats, shelf stacks and wall boxes under Joinery, after Living", () => {
    for (const id of ["built-in-alcove", "built-in-cupboard", "built-in-shelves", "window-seat", "banquette", "floating-shelves", "wall-cube", "wall-cupboard"]) expect(byId(id)?.category, id).toBe("Joinery");
    expect(CATEGORIES.indexOf("Joinery")).toBe(CATEGORIES.indexOf("Living") + 1);
    for (const id of ["built-in-alcove", "built-in-cupboard", "built-in-shelves"]) expect(byId(id)!.toCeiling, id).toBe(true);
    expect(byId("wall-cube")!.mount).toBeGreaterThan(1);
  });
});

describe("corner units and peninsulas", () => {
  it("lists L and diagonal corner units and a peninsula in both front styles, all with worktops", () => {
    const ids = ["corner-unit", "corner-unit-handleless", "corner-diagonal", "corner-diagonal-handleless", "peninsula", "peninsula-handleless"];
    for (const id of ids) {
      const item = byId(id);
      expect(item?.category).toBe("Kitchen");
      expect(item && hasWorktop(item)).toBe(true);
      expect(item && isHandleless(item.symbol)).toBe(id.endsWith("-handleless"));
    }
    expect(isHandleless("cabinet")).toBe(false);
    expect(isHandleless("waterfall")).toBe(true);
  });

  it("gives a corner unit 600 arms, shallower when the unit is small", () => {
    expect(cornerArm(0.9, 0.9)).toBe(0.6);
    expect(cornerArm(1.2, 1.0)).toBe(0.6);
    expect(cornerArm(0.7, 0.7)).toBeCloseTo(0.5);
    expect(cornerArm(0.3, 0.3)).toBe(0.2);
  });

  it("gives a peninsula a stool overhang only when it is deeper than a run", () => {
    expect(peninsulaOverhang(0.6)).toBe(0);
    expect(peninsulaOverhang(0.75)).toBe(0);
    expect(peninsulaOverhang(0.8)).toBeCloseTo(0.2);
    expect(peninsulaOverhang(0.9)).toBeCloseTo(0.3);
    expect(peninsulaOverhang(1.2)).toBe(0.3);
  });
});
