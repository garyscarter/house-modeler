import { describe, expect, it } from "vitest";
import { circleControls, closedSpline, outlinePath, surfaceArea, surfaceOutline, surfacePerimeter } from "./surfaceCurve";

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
