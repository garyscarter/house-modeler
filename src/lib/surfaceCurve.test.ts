import { describe, expect, it } from "vitest";
import { circleControls, closedSpline, surfaceArea, surfaceOutline } from "./surfaceCurve";

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
});
