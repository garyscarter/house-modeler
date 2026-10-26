import { describe, expect, it } from "vitest";
import type { Site } from "../types";
import { copyItems, festoonCurve, groundHeightAt, hitItem, moveItems } from "./siteItems";

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
});
