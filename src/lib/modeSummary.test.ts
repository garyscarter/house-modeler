import { describe, expect, it } from "vitest";
import {
  buildStats,
  decorateSummary,
  detailsSummary,
  eachWallSummary,
  exteriorSummary,
  floorSettingsSummary,
  floorSummary,
  furnishSummary,
  knockSummary,
  openingLookSummary,
  printedChip,
  outsideSummary,
  shapeSummary,
  gardenSummary,
  siteSummary,
  stairsSummary,
  wallsSummary,
} from "./modeSummary";
import { floor, rect } from "./testing";
import type { HouseModel, Opening, Site } from "../types";

const door = (id: string): Opening => ({ id, kind: "door", x: 100, y: 0, orientation: "h", widthM: 0.8 });

describe("floor summaries", () => {
  const f = floor(
    [
      rect("Kitchen", 0, 0, 400, 300, { floorFinish: "oak", wallFinishes: { 1: { paint: "#ff0000" } } }),
      rect("Hall", 400, 0, 600, 300, { floorFinish: "oak" }),
      rect("Study", 0, 300, 400, 600),
    ],
    [door("a"), door("b")],
    { stairs: { x: 500, y: 100 }, fixtures: [
      { id: "1", type: "bed", x: 100, y: 100, rot: 0 },
      { id: "2", type: "bed", x: 120, y: 100, rot: 0 },
      { id: "3", type: "bed", x: 500, y: 100, rot: 0 },
      { id: "4", type: "bed", x: 100, y: 400, rot: 0 },
    ] },
  );

  it("buildStats", () => {
    expect(buildStats(f)).toEqual([
      { value: "30.0", label: "m²" },
      { value: "3", label: "rooms" },
      { value: "2", label: "openings" },
    ]);
    expect(buildStats(floor([]))).toEqual([]);
    expect(buildStats(floor([rect("A", 0, 0, 100, 100)], [door("a")]))).toEqual([
      { value: "1.0", label: "m²" },
      { value: "1", label: "room" },
      { value: "1", label: "opening" },
    ]);
  });

  it("decorateSummary", () => {
    expect(decorateSummary(f)).toBe("Floors: Oak boards ×2, Plain colour ×1 · 1 feature wall");
  });

  it("furnishSummary", () => {
    expect(furnishSummary(f, 0)).toBe("4 pieces on this floor");
    expect(furnishSummary(f, 1)).toContain("1 overlap");
    expect(furnishSummary(floor([]), 0)).toBe("No furniture yet");
  });

  it("floorSettingsSummary and stairsSummary", () => {
    expect(floorSettingsSummary({ ...f, name: "Ground Floor" })).toBe("Ground floor · scale set");
    expect(floorSettingsSummary({ ...f, name: "Floor 1" })).toBe("First floor · scale set");
    expect(stairsSummary(f)).toBe("Up · 2.6 × 0.9 m");
    expect(stairsSummary(floor([]))).toBe("None");
  });
});

describe("room summaries", () => {
  const room = rect("Kitchen", 0, 0, 420, 360, {
    dims: { w: 4.2, h: 3.6 },
    floorFinish: "herringbone",
    floorAngle: 45,
    color: "#c8a97e",
    wallPaint: "#f4f1ea",
    notes: "damp?",
    exteriorFinish: "brick",
    wallFinishes: { 0: { paint: "#000000" }, 2: { covering: "tiles" }, 9: { paint: "#111111" } },
  });

  it("shapeSummary", () => {
    expect(shapeSummary(room, 100)).toBe("4.20 × 3.60 m · 15.1 m² · 163 ft² · printed 4.2 × 3.6");
    expect(shapeSummary(rect("A", 0, 0, 200, 100), 100)).toBe("2.00 × 1.00 m · 2.0 m² · 22 ft²");
  });

  it("detailsSummary", () => {
    expect(detailsSummary(room, 2)).toBe("Heated · 2 photos · has notes");
    expect(detailsSummary(rect("Garage", 0, 0, 1, 1), 0)).toBe("Not heated");
    expect(detailsSummary(rect("A", 0, 0, 1, 1), 1)).toBe("Heated · 1 photo");
  });

  it("knockSummary", () => {
    expect(knockSummary(1)).toBe("into 1 room");
    expect(knockSummary(3)).toBe("into 3 rooms");
  });

  it("floorSummary, wallsSummary", () => {
    expect(floorSummary(room)).toBe("Herringbone wood or LVT · 45° · #c8a97e");
    expect(floorSummary(rect("A", 0, 0, 1, 1))).toBe("Plain colour");
    expect(wallsSummary(room)).toBe("Paint · Warm white · skirting white");
    expect(wallsSummary({ ...room, wallCovering: "tiles", wallPaint: "#123456", skirtingColor: "#3c3e42" })).toBe("Wall tiles · #123456 · skirting Charcoal");
  });

  it("eachWallSummary ignores edges that no longer exist", () => {
    expect(eachWallSummary(room)).toBe("4 walls, 2 features");
    expect(eachWallSummary(rect("A", 0, 0, 1, 1))).toBe("4 walls");
  });

  it("outsideSummary", () => {
    expect(outsideSummary(room)).toBe("Brick");
    expect(outsideSummary(rect("A", 0, 0, 1, 1))).toBe("House default");
  });
});

describe("other summaries", () => {
  it("openingLookSummary", () => {
    expect(openingLookSummary(door("a"))).toBe("Standard look");
    expect(openingLookSummary({ ...door("a"), color: "#27364f", style: "glazed", frameColor: "#ffffff" })).toBe("Navy · Fully glazed · frame near Snow Scene");
    expect(openingLookSummary({ ...door("a"), kind: "garage", style: "up-over" })).toContain("Up-and-over");
  });

  it("gardenSummary", () => {
    expect(gardenSummary(undefined)).toBe("No plot yet");
    expect(gardenSummary({ surfaces: [] } as unknown as Site)).toBe("Nothing in the garden yet");
    const site = {
      surfaces: [{}, {}, {}],
      items: [{ type: "dining-6" }, { type: "apple-tree" }, { type: "hedge" }, { type: "bench" }, { type: "bench" }, { type: "bench" }, { type: "pot-small" }],
    } as unknown as Site;
    expect(gardenSummary(site)).toBe("3 surfaces · 7 items · 2 plants");
    expect(gardenSummary({ surfaces: [{}], items: [{ type: "bench" }] } as unknown as Site)).toBe("1 surface · 1 item · 0 plants");
  });

  it("siteSummary and exteriorSummary", () => {
    expect(siteSummary(undefined)).toBe("No plot yet");
    expect(siteSummary({ frontBearing: 171.6 } as Site)).toBe("Front faces 172°");
    const model = { floors: [], ceilingHeight: 2.4, slabThickness: 0.2 } as HouseModel;
    expect(exteriorSummary(model)).toBe("Gable roof · Smooth render");
    expect(exteriorSummary({ ...model, exterior: { roofStyle: "hip", wallFinish: "brick" } as HouseModel["exterior"] })).toBe("Hip roof · Brick");
  });
});

describe("printedChip", () => {
  it("is null within 5%", () => {
    expect(printedChip({ w: 1, h: 2, worst: 2, swapped: false }, { w: 3, h: 2 }, { w: 3, h: 2 })).toBeNull();
  });
  it("names the worse dimension", () => {
    const c = printedChip({ w: -10.2, h: 1.6, worst: 10.2, swapped: false }, { w: 2.74, h: 1.89 }, { w: 3.05, h: 1.86 });
    expect(c?.text).toBe("10% narrower than printed");
    expect(c?.tip).toContain("-10.2% / +1.6%");
    expect(printedChip({ w: 1, h: 8, worst: 8, swapped: false }, { w: 1, h: 1 }, { w: 1, h: 1 })?.text).toBe("8% deeper than printed");
  });
});
