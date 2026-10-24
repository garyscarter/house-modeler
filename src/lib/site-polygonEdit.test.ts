import { describe, expect, it } from "vitest";
import { slideEdge, snapEdgeOffset } from "./polygonEdit";

// The site's edge slide, now on the shared outward normal (it was left-hand in lib/site.ts, so the signs flipped).
describe("site edge slide", () => {
  const rect = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }];
  const area = (p: { x: number; y: number }[]) => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a.x * b.y - b.x * a.y; }, 0) / 2;
  it("moves a rectangle edge along its normal and stays parallel", () => {
    const r = slideEdge(rect, 1, 2); // right edge, outward normal +x, so +2 moves it out
    expect(r[1]).toEqual({ x: 12, y: 0 });
    expect(r[2]).toEqual({ x: 12, y: 6 });
    expect(r[0]).toEqual(rect[0]);
    expect(r[3]).toEqual(rect[3]);
  });
  it("keeps the direction of a non-axis edge and the winding", () => {
    const tri = [{ x: 0, y: 0 }, { x: 8, y: 6 }, { x: 0, y: 10 }, { x: -4, y: 5 }];
    const r = slideEdge(tri, 0, 1);
    const d0 = { x: 8, y: 6 };
    const d1 = { x: r[1].x - r[0].x, y: r[1].y - r[0].y };
    expect(d1.x * d0.y - d1.y * d0.x).toBeCloseTo(0);
    expect(Math.hypot(r[0].x - tri[0].x, r[0].y - tri[0].y)).toBeCloseTo(1);
    expect(Math.sign(area(r))).toBe(Math.sign(area(tri)));
  });
  it("snaps the slid line through a nearby target", () => {
    expect(snapEdgeOffset(rect, 1, 1.95, [{ x: 12, y: 3 }], 0.2)).toBeCloseTo(2);
    expect(snapEdgeOffset(rect, 1, 1.5, [{ x: 12, y: 3 }], 0.2)).toBe(1.5);
  });
});
