import { describe, expect, it } from "vitest";
import { byId } from "./catalogue";
import { BULKHEAD_REACH, floorBulkheads, growConvex, isBulkhead, splitConvex, subtractConvex } from "./bulkhead";
import { polygonArea, type V2 } from "./geometry";
import type { Floor } from "../types";

const sq = (x0: number, y0: number, x1: number, y1: number): V2[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
const area = (p: V2[]) => Math.abs(polygonArea(p));

describe("convex pieces", () => {
  it("splits a square by a square across it: the overlap inside, the rest outside, nothing lost", () => {
    const a = sq(0, 0, 2, 1);
    const { inside, outside } = splitConvex(a, sq(1, -1, 3, 2));
    expect(area(inside!)).toBeCloseTo(1);
    expect(outside.reduce((s, p) => s + area(p), 0)).toBeCloseTo(1);
    // Either winding of the cut.
    const r = splitConvex(a, [...sq(1, -1, 3, 2)].reverse());
    expect(area(r.inside!)).toBeCloseTo(1);
  });

  it("leaves a polygon whole when the cut misses it, and drops slivers", () => {
    expect(splitConvex(sq(0, 0, 1, 1), sq(2, 2, 3, 3)).inside).toBeNull();
    expect(splitConvex(sq(0, 0, 1, 1), sq(2, 2, 3, 3)).outside.reduce((s, p) => s + area(p), 0)).toBeCloseTo(1);
    expect(splitConvex(sq(0, 0, 1, 1), sq(0.999999, 0, 2, 1)).inside).toBeNull();
  });

  it("subtracts a flight's footprint from a bulkhead that it passes through, leaving the box either side", () => {
    const pieces = subtractConvex(sq(0, 0, 3, 1), [sq(1, -0.5, 2, 3)]);
    expect(pieces.reduce((s, p) => s + area(p), 0)).toBeCloseTo(2);
    expect(pieces).toHaveLength(2);
  });

  it("grows a rectangle by d on every side, whichever way it winds", () => {
    expect(area(growConvex(sq(0, 0, 2, 1), 0.1))).toBeCloseTo(2.2 * 1.2);
    expect(area(growConvex([...sq(0, 0, 2, 1)].reverse(), 0.1))).toBeCloseTo(2.2 * 1.2);
  });
});

describe("the catalogue's bulkhead", () => {
  it("hangs flush from the ceiling in the ceiling white and is drawn as a bulkhead", () => {
    const item = byId("bulkhead")!;
    expect(item).toMatchObject({ ceiling: true, color: "#f3f3f0", symbol: "bulkhead", category: "Joinery" });
    expect(item.drop ?? 0).toBe(0);
    expect(isBulkhead(item)).toBe(true);
    expect(BULKHEAD_REACH).toBeCloseTo(0.06);
  });

  it("lists a floor's bulkheads in world metres, their underside the ceiling less their height", () => {
    const floor = {
      id: "g",
      name: "G",
      level: 0,
      image: "",
      imageW: 100,
      imageH: 100,
      pxPerM: 100,
      origin: { x: 0, y: 0 },
      offset: { x: 0, y: 0 },
      rooms: [],
      openings: [],
      fixtures: [
        { id: "b", type: "bulkhead", x: 150, y: 50, rot: 90, w: 2, d: 0.5, h: 0.3 },
        { id: "p", type: "pendant", x: 0, y: 0, rot: 0 },
      ],
    } as unknown as Floor;
    const [b, ...rest] = floorBulkheads(floor, 2.4);
    expect(rest).toHaveLength(0);
    expect(b.bottom).toBeCloseTo(2.1);
    // Turned a quarter: 0.5 m across x, 2 m along y.
    const xs = b.pts.map((p) => p.x);
    const ys = b.pts.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0.5);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(2);
  });
});
