import { describe, expect, it } from "vitest";
import type { Site } from "../types";
import { polygonArea } from "./geometry";
import { alongEvery, copyItems, festoonCurve, groundHeightAt, hitItem, itemBounds, itemFootprint, itemOccluders, itemsOf, moveItems, placeSpot, runLength, snapItem, steppingStones } from "./siteItems";

const site = (): Site => ({
  frontBearing: 180,
  latitude: 51.4,
  longitude: -2.6,
  boundary: [],
  neighbours: [],
  surfaces: [{ id: "b", kind: "bed", polygon: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 0, y: 1 }], slope: { toward: "back", rise: 0, base: 0.3 } }],
  items: [
    { id: "t", type: "dining-6", x: 5, y: 5, rot: 0 },
    { id: "f", type: "festoon", x: 0, y: 3, rot: 0, to: { x: 4, y: 3 }, h: 2.4 },
  ],
});

describe("siteItems", () => {
  it("stands an item on a raised bed", () => {
    expect(groundHeightAt(site(), { x: 1, y: 0.5 })).toBeCloseTo(0.3);
    expect(groundHeightAt(site(), { x: 5, y: 5 })).toBe(0);
  });
  it("hits items and runs", () => {
    expect(hitItem(site().items!, { x: 5.2, y: 5.2 })).toBe("t");
    expect(hitItem(site().items!, { x: 2, y: 3.05 })).toBe("f");
    expect(hitItem(site().items!, { x: 9, y: 9 })).toBeUndefined();
  });
  it("moves both ends of a run and copies with new ids", () => {
    const m = moveItems(site(), ["f"], 1, 0).items!.find((i) => i.id === "f")!;
    expect(m.to).toEqual({ x: 5, y: 3 });
    const c = copyItems(site(), ["t"]);
    expect(c.ids).toHaveLength(1);
    expect(c.site.items).toHaveLength(3);
  });
  it("sags a festoon string at mid-span", () => {
    const pts = festoonCurve({ x: 0, y: 2.4, z: 0 }, { x: 4, y: 2.4, z: 0 }, 0.3, 4);
    expect(pts[2].y).toBeCloseTo(2.1);
  });

  it("reads absent items as an empty list", () => {
    expect(itemsOf({})).toEqual([]);
  });
  it("rotates a footprint and rounds a round entry", () => {
    const rect = itemFootprint({ id: "a", type: "dining-6", x: 0, y: 0, rot: 90 });
    const b = itemBounds({ id: "a", type: "dining-6", x: 0, y: 0, rot: 90 });
    expect(rect).toHaveLength(4);
    expect(b.x1 - b.x0).toBeCloseTo(2.0); // d across after a quarter turn
    expect(b.y1 - b.y0).toBeCloseTo(2.4); // w across after a quarter turn
    const round = itemFootprint({ id: "p", type: "parasol", x: 1, y: 1, rot: 0 });
    expect(round).toHaveLength(16);
    expect(polygonArea(round)).toBeGreaterThan(Math.PI * 1.35 * 1.35 * 0.95);
  });
  it("gives a run a strip of its width", () => {
    const fp = itemFootprint({ id: "f", type: "hedge", x: 0, y: 0, rot: 0, to: { x: 3, y: 0 } });
    expect(Math.abs(polygonArea(fp))).toBeCloseTo(3 * 0.6);
    expect(runLength({ x: 0, y: 0, to: { x: 3, y: 4 } })).toBe(5);
    expect(runLength({ x: 0, y: 0 })).toBe(0);
  });
  it("hits the last drawn item first", () => {
    const items = [
      { id: "under", type: "dining-6", x: 0, y: 0, rot: 0 },
      { id: "over", type: "parasol", x: 0, y: 0, rot: 0 },
    ];
    expect(hitItem(items, { x: 0, y: 0 })).toBe("over");
    expect(hitItem(items, { x: 50, y: 50 })).toBeUndefined();
  });
  it("lays stepping stones from end to end", () => {
    const stones = steppingStones({ id: "s", type: "stepping-stones", x: 0, y: 0, rot: 0, to: { x: 3, y: 0 } });
    expect(stones).toHaveLength(6);
    expect(stones[0]).toMatchObject({ x: 0, y: 0 });
    expect(stones[5].x).toBeCloseTo(3);
    expect(steppingStones({ id: "s", type: "stepping-stones", x: 1, y: 2, rot: 30 })).toEqual([{ x: 1, y: 2, rot: 30 }]);
  });
  it("spaces points along a string", () => {
    const pts = alongEvery([{ x: 0, y: 0 }, { x: 4, y: 0 }], 0.5);
    expect(pts).toHaveLength(9);
    expect(pts[2].x).toBeCloseTo(1);
  });
  it("places a new item at the middle of the largest lawn or patio", () => {
    const s = site();
    s.surfaces.push({ id: "l", kind: "lawn", polygon: [{ x: 10, y: 10 }, { x: 14, y: 10 }, { x: 14, y: 14 }, { x: 10, y: 14 }] });
    expect(placeSpot(s)).toEqual({ x: 12, y: 12 });
    expect(placeSpot({ surfaces: [], boundary: [] })).toEqual({ x: 0, y: -6 });
  });

  describe("snapItem", () => {
    // A 10 x 10 plot: north wall y=0, east fence x=10, south hedge y=10, west open.
    const plot: Pick<Site, "boundary" | "boundaryEdges"> = {
      boundary: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
      boundaryEdges: [{ kind: "wall", height: 2 }, { kind: "fence", height: 1.8 }, { kind: "hedge", height: 2 }, { kind: "open", height: 0 }],
    };
    const bin = { id: "b", type: "bin-store", x: 0, y: 0, rot: 0 }; // 1.5 x 0.85
    it("snaps to the grid away from walls", () => {
      const r = snapItem(bin, { x: 5.03, y: 5.98 }, plot, []);
      expect(r.x).toBeCloseTo(5.05);
      expect(r.y).toBeCloseTo(6);
      expect(snapItem({ ...bin, type: "dining-6" }, { x: 0.1, y: 0.1 }, plot, [])).toEqual({ x: 0.1, y: 0.1, rot: 0 });
    });
    it("puts the back flush to a wall at 0 degrees", () => {
      const r = snapItem(bin, { x: 4, y: 0.6 }, plot, []);
      expect(r.rot).toBe(0);
      expect(r.x).toBeCloseTo(4);
      expect(r.y).toBeCloseTo(0.425);
    });
    it("turns to face away from a fence on its east side", () => {
      const r = snapItem(bin, { x: 9.5, y: 5 }, plot, []);
      expect(r.rot).toBe(90);
      expect(r.x).toBeCloseTo(10 - 0.425);
      expect(r.y).toBeCloseTo(5);
    });
    it("ignores hedges and open edges, and walls beyond reach", () => {
      expect(snapItem(bin, { x: 5, y: 9.8 }, plot, []).rot).toBe(0);
      expect(snapItem(bin, { x: 5, y: 9.8 }, plot, []).y).toBeCloseTo(9.8);
      expect(snapItem(bin, { x: 5, y: 3 }, plot, [])).toEqual({ x: 5, y: 3, rot: 0 });
    });
    it("snaps to a house wall on its outside face", () => {
      const house = [[{ x: 2, y: 2 }, { x: 6, y: 2 }, { x: 6, y: 5 }, { x: 2, y: 5 }]];
      const r = snapItem(bin, { x: 4, y: 5.6 }, plot, house);
      expect(r.rot).toBe(0);
      expect(r.y).toBeCloseTo(5.425);
    });
    it("lays both ends of a climber on the wall line", () => {
      const climber = { id: "c", type: "climber", x: 0, y: 0, rot: 0, to: { x: 3, y: 0 } };
      expect(snapItem(climber, { x: 2, y: 0.2 }, plot, [])).toMatchObject({ x: 2, y: 0 });
      expect(snapItem(climber, { x: 6, y: 0.3 }, plot, [])).toMatchObject({ x: 6, y: 0 });
    });
  });

  describe("itemOccluders", () => {
    it("raises a tree's canopy and stands a shed on the ground", () => {
      const occ = itemOccluders({
        surfaces: [],
        items: [
          { id: "t", type: "silver-birch", x: 0, y: 0, rot: 0 },
          { id: "s", type: "shed-6x4", x: 5, y: 0, rot: 0 },
          { id: "b", type: "buddleia", x: 9, y: 0, rot: 0 },
          { id: "d", type: "dining-6", x: 12, y: 0, rot: 0 },
        ],
      });
      expect(occ).toHaveLength(3);
      expect(occ[0].base).toBeCloseTo(2.1);
      expect(occ[0].height).toBe(6);
      expect(occ[1]).toMatchObject({ base: 0, height: 2.1, kind: "building" });
      expect(occ[2].base).toBe(0);
    });
    it("lifts a plant in a raised bed with its soil", () => {
      const occ = itemOccluders({ ...site(), items: [{ id: "t", type: "conifer", x: 1, y: 0.5, rot: 0 }] });
      expect(occ[0].height).toBeCloseTo(4.3);
    });
  });
});
