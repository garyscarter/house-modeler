import { describe, expect, it } from "vitest";
import { boundsOf, fitTransform, pathFor } from "./footprint";

const sq = (x: number, y: number, s: number) => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
];

describe("footprint", () => {
  it("finds bounds", () => {
    expect(boundsOf([])).toBeNull();
    expect(boundsOf([sq(1, 2, 3), sq(5, 0, 1)])).toEqual({ x0: 1, y0: 0, x1: 6, y1: 5 });
  });
  it("scales to fit and centres", () => {
    const t = fitTransform([sq(0, 0, 10), sq(10, 0, 10)], 240, 160, 10); // 20 × 10 m
    expect(t.scale).toBeCloseTo(11); // width limits: 220 / 20
    expect(t.tx).toBeCloseTo(10);
    expect(t.ty).toBeCloseTo((160 - 10 * 11) / 2);
  });
  it("reserves an inset", () => {
    const t = fitTransform([sq(0, 0, 10)], 240, 160, 0, 20);
    expect(t.scale).toBeCloseTo(14); // height limits: 140 / 10
    expect(t.tx + 10 * t.scale).toBeLessThanOrEqual(220);
  });
  it("copes with nothing", () => {
    expect(fitTransform([], 100, 100).scale).toBe(1);
  });
  it("writes a closed path", () => {
    expect(pathFor(sq(0, 0, 1), { scale: 10, tx: 5, ty: 5 }, 2, 0)).toBe("M7 5L17 5L17 15L7 15Z");
  });
});
