import { describe, expect, it } from "vitest";
import type { EdgeLink } from "../types";
import { circleControls, closedSpline, curvesAfterInsert, curvesAfterRemove, edgeCurved, linkCandidate, linkEdge, linksAfterInsert, linksAfterRemove, mixedOutline, outlinePath, relinkAfterInsert, relinkAfterRemove, resolvedPoints, setEdgeCurved, surfaceArea, surfaceOutline, surfacePerimeter, unlinkEdge } from "./surfaceCurve";

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
    expect(surfaceOutline({ polygon: sq, curves: [0] }, undefined, 4)).toEqual(o);
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

describe("linked edges", () => {
  // Two squares side by side: A's right edge (1) runs up x = 2; B's left edge (3) runs down it.
  type S = { id: string; polygon: { x: number; y: number }[]; curves?: number[]; links?: EdgeLink[]; smooth?: boolean };
  const A: S = { id: "a", polygon: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }], curves: [1] };
  const B: S = { id: "b", polygon: [{ x: 2.1, y: 0.05 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 2, y: 2.1 }] };

  it("find the neighbour's edge along a selected edge, either way round", () => {
    const c = linkCandidate(B, 3, [A, B]);
    expect(c).toMatchObject({ surface: "a", theirEdge: 1, reversed: true });
    expect(linkCandidate(B, 1, [A, B])).toBeUndefined();
    expect(linkCandidate(A, 1, [A, B])).toMatchObject({ surface: "b", theirEdge: 3, reversed: true });
  });

  it("draw a linked edge as the other surface's curve, reversed, with its ends snapped", () => {
    const c = linkCandidate(B, 3, [A, B])!;
    const b2 = linkEdge(B, 3, c, [A, B]);
    expect(b2.polygon[3]).toEqual({ x: 2, y: 2 });
    expect(b2.polygon[0]).toEqual({ x: 2, y: 0 });
    expect(resolvedPoints(b2, [A, b2])[3]).toEqual({ x: 2, y: 2 });
    const oa = surfaceOutline(A, [A, b2], 4);
    const ob = surfaceOutline(b2, [A, b2], 4);
    // A's edge 1 interior points (3 of them) appear in B's outline in reverse order.
    const spanA = oa.slice(2, 5);
    const spanB = ob.slice(ob.indexOf(ob.find((p) => p.x === 2 && p.y === 2)!) + 1);
    expect(spanB.map((p) => [+p.x.toFixed(6), +p.y.toFixed(6)])).toEqual([...spanA].reverse().map((p) => [+p.x.toFixed(6), +p.y.toFixed(6)]));
    // Without the site's surfaces the link is ignored and B keeps its own straight edge.
    expect(surfaceOutline(b2)).toBe(b2.polygon);
    // Moving A's corner moves B's end with it.
    const A2 = { ...A, polygon: A.polygon.map((p, i) => (i === 2 ? { x: 2.5, y: 2.2 } : p)) };
    expect(resolvedPoints(b2, [A2, b2])[3]).toEqual({ x: 2.5, y: 2.2 });
    expect(surfaceArea(b2, [A2, b2])).not.toBeCloseTo(surfaceArea(b2, [A, b2]), 3);
  });

  it("unlink keeps the curve as the surface's own", () => {
    const b2 = linkEdge(B, 3, linkCandidate(B, 3, [A, B])!, [A, B]);
    const b3 = unlinkEdge(b2, 3, [A, b2]);
    expect(b3.links).toBeUndefined();
    expect(b3.curves).toEqual([3]);
    expect(surfaceOutline(b3, [A, b3]).length).toBeGreaterThan(4);
  });

  it("keep link indices through corner edits on either surface", () => {
    const links = [{ edge: 3, surface: "a", theirEdge: 1, reversed: true }, { edge: 1, surface: "c", theirEdge: 0, reversed: false }];
    expect(linksAfterInsert(links, 1)).toEqual([{ edge: 4, surface: "a", theirEdge: 1, reversed: true }]);
    expect(linksAfterRemove(links, 2, 4)).toEqual([{ edge: 2, surface: "a", theirEdge: 1, reversed: true }]);
    const bl: S = { ...B, links };
    expect(relinkAfterInsert([A, bl], "a", 1)[1].links).toEqual([{ edge: 1, surface: "c", theirEdge: 0, reversed: false }]);
    expect(relinkAfterInsert([A, bl], "a", 0)[1].links).toEqual([{ edge: 3, surface: "a", theirEdge: 2, reversed: true }, { edge: 1, surface: "c", theirEdge: 0, reversed: false }]);
    // Removing A's corner 3 merges its edges 2 and 3; the link to edge 1 is untouched.
    expect(relinkAfterRemove([A, bl], "a", 3, 4)[1].links).toEqual(links);
    expect(relinkAfterRemove([A, bl], "a", 2, 4)[1].links).toEqual([{ edge: 1, surface: "c", theirEdge: 0, reversed: false }]);
  });
});
