import { describe, expect, it } from "vitest";
import {
  SNAP_PX,
  edgeOffset,
  insertVertex,
  lockToAxis,
  lockToNormal,
  midpointOf,
  moveVertex,
  outwardNormal,
  removeVertex,
  slideEdge,
  snapEdgeOffset,
  snapPoint,
} from "./polygonEdit";

const area = (p: { x: number; y: number }[]) => {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    s += p[i].x * q.y - q.x * p[i].y;
  }
  return Math.abs(s / 2);
};

// Clockwise on screen (y down) and anticlockwise versions of one rectangle.
const cw = [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 400 }, { x: 0, y: 400 }];
const ccw = [...cw].reverse();

describe("snapPoint", () => {
  const corners = [{ x: 0, y: 0 }, { x: 300, y: 400 }];
  it("keeps the plan's existing cases", () => {
    expect(snapPoint({ x: 4, y: -3 }, corners, 10)).toEqual({ p: { x: 0, y: 0 }, kind: "corner" });
    expect(snapPoint({ x: 296, y: 200 }, corners, 10)).toEqual({ p: { x: 300, y: 200 }, kind: "axis" });
    expect(snapPoint({ x: 150, y: 200 }, corners, 10).kind).toBe("none");
  });
  it("prefers a corner over an axis", () => {
    expect(snapPoint({ x: 298, y: 396 }, corners, 10).kind).toBe("corner");
  });
  it("snaps x and y separately to different targets", () => {
    const r = snapPoint({ x: 3, y: 397 }, [{ x: 0, y: 100 }, { x: 200, y: 400 }], 5);
    expect(r).toEqual({ p: { x: 0, y: 400 }, kind: "axis" });
  });
  it("does nothing outside tol", () => {
    expect(snapPoint({ x: 50, y: 50 }, corners, 10)).toEqual({ p: { x: 50, y: 50 }, kind: "none" });
  });
  it("axis: false gives corner or none only (the site's rule)", () => {
    expect(snapPoint({ x: 296, y: 200 }, corners, 10, { axis: false }).kind).toBe("none");
    expect(snapPoint({ x: 4, y: -3 }, corners, 10, { axis: false }).kind).toBe("corner");
  });
  it("skip drops targets", () => {
    const r = snapPoint({ x: 4, y: -3 }, corners, 10, { skip: (q) => q.x === 0 && q.y === 0 });
    expect(r.kind).toBe("none");
    const byIndex = snapPoint({ x: 4, y: -3 }, corners, 10, { skip: (_q, k) => k === 0 });
    expect(byIndex.kind).toBe("none");
  });
  it("first target wins a tie", () => {
    const r = snapPoint({ x: 5, y: 0 }, [{ x: 0, y: 0 }, { x: 10, y: 0 }], 10);
    expect(r.p).toEqual({ x: 0, y: 0 });
  });
  it("exports the 10 px tolerance", () => {
    expect(SNAP_PX).toBe(10);
  });
});

describe("outwardNormal", () => {
  it("points out for clockwise and anticlockwise squares", () => {
    expect(outwardNormal(cw, 0)).toEqual({ x: 0, y: -1 });
    expect(outwardNormal(cw, 1)).toEqual({ x: 1, y: 0 });
    // ccw runs 0,400 -> 300,400 -> 300,0 -> 0,0: edge 0 is the bottom edge.
    expect(outwardNormal(ccw, 0)).toEqual({ x: 0, y: 1 });
    expect(outwardNormal(ccw, 1)).toEqual({ x: 1, y: 0 });
  });
  it("points out for a triangle's sloping edge", () => {
    const tri = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 0, y: 300 }];
    const n = outwardNormal(tri, 1)!;
    expect(n.x).toBeCloseTo(0.6);
    expect(n.y).toBeCloseTo(0.8);
  });
  it("is null for a zero-length edge", () => {
    expect(outwardNormal([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 5 }], 0)).toBeNull();
  });
});

describe("edgeOffset", () => {
  it("projects onto the outward normal", () => {
    expect(edgeOffset(cw, 1, { x: 30, y: 99 })).toBeCloseTo(30);
    expect(edgeOffset(cw, 0, { x: 99, y: -20 })).toBeCloseTo(20);
    expect(edgeOffset(ccw, 1, { x: -7, y: 0 })).toBeCloseTo(-7);
  });
  it("is 0 for a zero-length edge", () => {
    expect(edgeOffset([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 5 }], 0, { x: 3, y: 3 })).toBe(0);
  });
});

describe("slideEdge", () => {
  it("moves exactly i and i+1", () => {
    const out = slideEdge(cw, 1, 50);
    expect(out[1]).toEqual({ x: 350, y: 0 });
    expect(out[2]).toEqual({ x: 350, y: 400 });
    expect(out[0]).toEqual(cw[0]);
    expect(out[3]).toEqual(cw[3]);
  });
  it("wraps for the last edge", () => {
    const out = slideEdge(cw, 3, 10); // left edge, outward is -x
    expect(out[3]).toEqual({ x: -10, y: 400 });
    expect(out[0]).toEqual({ x: -10, y: 0 });
  });
  it("a positive offset grows the area for both windings", () => {
    for (const poly of [cw, ccw]) {
      for (let i = 0; i < 4; i++) expect(area(slideEdge(poly, i, 10))).toBeGreaterThan(area(poly));
    }
    expect(area(slideEdge(cw, 1, 50)) - area(cw)).toBeCloseTo(50 * 400);
  });
  it("copies, keeps extra fields, and does not mutate", () => {
    const withExtra = [{ x: 0, y: 0, tag: "a" }, { x: 4, y: 0, tag: "b" }, { x: 4, y: 4, tag: "c" }, { x: 0, y: 4, tag: "d" }];
    const snap = JSON.stringify(withExtra);
    const out = slideEdge(withExtra, 0, 1);
    expect(JSON.stringify(withExtra)).toBe(snap);
    expect(out.map((p) => p.tag)).toEqual(["a", "b", "c", "d"]);
    expect(out[2]).not.toBe(withExtra[2]);
  });
  it("returns an unchanged copy for a zero-length edge and for fewer than 3 points", () => {
    const z = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 5 }];
    expect(slideEdge(z, 0, 9)).toEqual(z);
    expect(slideEdge(z, 0, 9)).not.toBe(z);
    const two = [{ x: 0, y: 0 }, { x: 5, y: 0 }];
    expect(slideEdge(two, 0, 9)).toEqual(two);
  });
  it("keeps the direction of a sloping edge", () => {
    const tri = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 0, y: 300 }];
    const out = slideEdge(tri, 1, 30);
    const d0 = { x: tri[2].x - tri[1].x, y: tri[2].y - tri[1].y };
    const d1 = { x: out[2].x - out[1].x, y: out[2].y - out[1].y };
    expect(d0.x * d1.y - d0.y * d1.x).toBeCloseTo(0);
    expect(edgeOffset(tri, 1, { x: out[1].x - tri[1].x, y: out[1].y - tri[1].y })).toBeCloseTo(30);
  });
});

describe("snapEdgeOffset", () => {
  // Ports of planMath.test.ts (edge 1 of a 300x400 rectangle, outward +x) and site.test.ts (sign flipped for outward).
  it("snaps the moved line to a target within tolerance (plan caller)", () => {
    expect(snapEdgeOffset(cw, 1, 48, [{ x: 355, y: 90 }], 10)).toBe(55);
    expect(snapEdgeOffset(cw, 1, 30, [{ x: 355, y: 90 }], 10)).toBe(30);
  });
  it("snaps in metres too (site caller, edge 1 outward)", () => {
    const rect = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }];
    expect(snapEdgeOffset(rect, 1, 1.95, [{ x: 12, y: 3 }], 0.2)).toBeCloseTo(2);
    expect(snapEdgeOffset(rect, 1, 1.5, [{ x: 12, y: 3 }], 0.2)).toBe(1.5);
  });
  it("the first target wins a tie", () => {
    expect(snapEdgeOffset(cw, 1, 50, [{ x: 350, y: 0 }, { x: 360, y: 0 }], 20)).toBe(50);
    expect(snapEdgeOffset(cw, 1, 55, [{ x: 350, y: 0 }, { x: 360, y: 0 }], 20)).toBe(50);
  });
  it("leaves a zero-length edge alone", () => {
    expect(snapEdgeOffset([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 5 }], 0, 3, [{ x: 4, y: 4 }], 10)).toBe(3);
  });
});

describe("insert, remove and move vertex", () => {
  it("midpointOf wraps", () => {
    expect(midpointOf(cw, 3)).toEqual({ x: 0, y: 200 });
  });
  it("inserts after i, including after the last", () => {
    expect(insertVertex(cw, 0, { x: 150, y: 0 })[1]).toEqual({ x: 150, y: 0 });
    const last = insertVertex(cw, 3, { x: 0, y: 200 });
    expect(last.length).toBe(5);
    expect(last[4]).toEqual({ x: 0, y: 200 });
  });
  it("removes, and returns null at min", () => {
    expect(removeVertex(cw, 1)!.length).toBe(3);
    expect(removeVertex(cw, 1)!.map((p) => p.x)).toEqual([0, 300, 0]);
    expect(removeVertex(cw.slice(0, 3), 0)).toBeNull();
    expect(removeVertex(cw, 0, 4)).toBeNull();
    expect(removeVertex(cw, 9)).toBeNull();
  });
  it("moves one vertex and keeps the rest and extra fields", () => {
    const poly = [{ x: 0, y: 0, k: 1 }, { x: 4, y: 0, k: 2 }, { x: 4, y: 4, k: 3 }];
    const out = moveVertex(poly, 1, { x: 9, y: 9 });
    expect(out[1]).toEqual({ x: 9, y: 9, k: 2 });
    expect(out[0]).toBe(poly[0]);
    expect(poly[1].x).toBe(4);
  });
});

describe("shift locks", () => {
  it("lockToAxis keeps the dominant axis", () => {
    expect(lockToAxis({ x: 5, y: -2 })).toEqual({ x: 5, y: 0 });
    expect(lockToAxis({ x: 1, y: -7 })).toEqual({ x: 0, y: -7 });
  });
  it("lockToNormal projects onto a diagonal wall's normal", () => {
    const r = lockToNormal({ x: 10, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 10 });
    // normal (-1, 1)/sqrt2: k = -10/sqrt2
    expect(r.x).toBeCloseTo(5);
    expect(r.y).toBeCloseTo(-5);
    expect(lockToNormal({ x: 3, y: 4 }, { x: 1, y: 1 }, { x: 1, y: 1 })).toEqual({ x: 3, y: 4 });
  });
});
