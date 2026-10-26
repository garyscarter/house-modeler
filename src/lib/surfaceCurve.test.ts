import { describe, expect, it } from "vitest";
import { circleControls, closedSpline, curvesAfterInsert, curvesAfterRemove, edgeCurved, mixedOutline, outlinePath, setEdgeCurved, surfaceArea, surfaceOutline, surfacePerimeter } from "./surfaceCurve";

const signed = (p: { x: number; y: number }[]) => p.reduce((a, q, i) => a + (q.x * p[(i + 1) % p.length].y - p[(i + 1) % p.length].x * q.y), 0) / 2;

describe("surfaceCurve", () => {
  const sq = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }];
  it("passes through every control point", () => {
    const c = closedSpline(sq, 4);
    expect(c).toHaveLength(16);
    sq.forEach((p, i) => expect(c[i * 4]).toEqual(p));
  });
  it("leaves a straight surface as drawn", () => {
    expect(surfaceOutline({ polygon: sq })).toBe(sq);
  });
  it("draws an 8-point circle close to a true circle's area", () => {
    const a = surfaceArea({ polygon: circleControls({ x: 0, y: 0 }, 2), smooth: true });
    expect(a).toBeGreaterThan(Math.PI * 4 * 0.97);
    expect(a).toBeLessThan(Math.PI * 4 * 1.03);
  });
  it("keeps the winding of the control polygon", () => {
    const ccw = [...sq].reverse();
    const sign = (poly: { x: number; y: number }[]) => Math.sign(signed(poly));
    expect(sign(closedSpline(sq, 8))).toBe(sign(sq));
    expect(sign(closedSpline(ccw, 8))).toBe(sign(ccw));
  });
  it("draws an ellipse within 3% of its area", () => {
    const pts = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ x: 3 * Math.cos((i / 8) * Math.PI * 2), y: 1.5 * Math.sin((i / 8) * Math.PI * 2) }));
    const a = surfaceArea({ polygon: pts, smooth: true });
    expect(Math.abs(a - Math.PI * 3 * 1.5) / (Math.PI * 4.5)).toBeLessThan(0.03);
  });
  it("measures a smooth circle's perimeter within 2%", () => {
    expect(Math.abs(surfacePerimeter({ polygon: circleControls({ x: 0, y: 0 }, 2), smooth: true }) / (2 * Math.PI * 2) - 1)).toBeLessThan(0.02);
  });
  it("closes the path with Z", () => {
    expect(outlinePath({ polygon: sq, smooth: true }, (p) => p).trim().endsWith("Z")).toBe(true);
  });
});

describe("curved edges", () => {
  const sq = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }];
  it("bulge only the edges asked for and leave the rest straight", () => {
    const o = mixedOutline(sq, [0], 4);
    expect(o).toHaveLength(4 + 3);
    expect(o[0]).toEqual({ x: 0, y: 0 });
    expect(o[4]).toEqual({ x: 2, y: 0 });
    // The curved span leaves the straight line between its ends; the straight edges are untouched.
    expect(o.slice(1, 4).some((p) => Math.abs(p.y) > 1e-6)).toBe(true);
    expect(surfaceOutline({ polygon: sq, curves: [0] }, 4)).toEqual(o);
    expect(surfaceOutline({ polygon: sq, curves: [] })).toBe(sq);
    expect(mixedOutline(sq, [], 4)).toEqual(sq);
  });

  it("toggle per edge, folding all-curved into smooth and none into nothing", () => {
    const s = { polygon: sq, curves: [1] };
    expect(edgeCurved(s, 1)).toBe(true);
    expect(edgeCurved(s, 0)).toBe(false);
    expect(edgeCurved({ polygon: sq, smooth: true }, 3)).toBe(true);
    expect(setEdgeCurved(s, 0, true)).toEqual({ smooth: false, curves: [0, 1] });
    expect(setEdgeCurved(s, 1, false)).toEqual({ smooth: false, curves: undefined });
    expect(setEdgeCurved({ polygon: sq, curves: [0, 1, 2] }, 3, true)).toEqual({ smooth: true, curves: undefined });
    expect(setEdgeCurved({ polygon: sq, smooth: true }, 2, false)).toEqual({ smooth: false, curves: [0, 1, 3] });
  });

  it("keep their edge indices through corner inserts and removals", () => {
    expect(curvesAfterInsert([0, 2], 0)).toEqual([0, 1, 3]);
    expect(curvesAfterInsert([1], 2)).toEqual([1]);
    expect(curvesAfterInsert(undefined, 1)).toBeUndefined();
    // Removing corner 2 of a square merges edges 1 and 2 into edge 1; edge 3 becomes edge 2.
    expect(curvesAfterRemove([2, 3], 2, 4)).toEqual([1, 2]);
    expect(curvesAfterRemove([0], 2, 4)).toEqual([0]);
    // Removing corner 0 merges edges 3 and 0 into the new last edge.
    expect(curvesAfterRemove([0, 1], 0, 4)).toEqual([0, 2]);
    expect(curvesAfterRemove([1], 1, 3)).toBeUndefined();
  });
});
