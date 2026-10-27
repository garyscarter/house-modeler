import { describe, expect, it } from "vitest";
import type { FaceQuad } from "./walls";
import { splitFaceByLine, splitLine } from "./wallSplit";
import { splitQuadAtY } from "./wallCovering";

// A wall along x, 2 m wide and 2.4 m high, facing +z.
const quad = (): FaceQuad => ({
  v: [[0, 0, 0], [2, 0, 0], [2, 2.4, 0], [0, 2.4, 0]],
  n: [0, 0, 1],
  uv: [[0, 0], [2, 0], [2, 2.4], [0, 2.4]],
  slot: { kind: "inside", roomId: "r", edge: 0 },
});
const area = (q: FaceQuad) => {
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const a = q.v[i];
    const b = q.v[(i + 1) % 4];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
};
const total = (qs: FaceQuad[]) => qs.reduce((t, q) => t + area(q), 0);

describe("splitFaceByLine", () => {
  it("cuts a diagonal into two equal triangles", () => {
    const { below, above } = splitFaceByLine(quad(), splitLine({ kind: "diagonalUp", color: "#000" }, 0, 2, 2.4));
    expect(below).toHaveLength(1);
    expect(above).toHaveLength(1);
    expect(area(below[0])).toBeCloseTo(2.4, 5);
    expect(area(above[0])).toBeCloseTo(2.4, 5);
    // Rising to the right: the lower-right corner is below, the upper-left above.
    expect(below[0].v.some((p) => p[0] === 2 && p[1] === 0)).toBe(true);
    expect(above[0].v.some((p) => p[0] === 0 && p[1] === 2.4)).toBe(true);
  });
  it("falling diagonal puts the lower-left corner below", () => {
    const { below } = splitFaceByLine(quad(), splitLine({ kind: "diagonalDown", color: "#000" }, 0, 2, 2.4));
    expect(below[0].v.some((p) => p[0] === 0 && p[1] === 0)).toBe(true);
    expect(below[0].v.some((p) => p[0] === 2 && p[1] === 0)).toBe(true);
  });
  it("horizontal matches splitQuadAtY", () => {
    const { below, above } = splitFaceByLine(quad(), splitLine({ kind: "horizontal", color: "#000", at: 1 }, 0, 2, 2.4));
    const [lo, hi] = splitQuadAtY(quad(), 1);
    expect(total(below)).toBeCloseTo(area(lo!), 6);
    expect(total(above)).toBeCloseTo(area(hi!), 6);
  });
  it("vertical splits at a distance from the left, either way round", () => {
    const r = splitFaceByLine(quad(), splitLine({ kind: "vertical", color: "#000", at: 0.5 }, 0, 2, 2.4));
    expect(total(r.below)).toBeCloseTo(0.5 * 2.4, 6);
    expect(total(r.above)).toBeCloseTo(1.5 * 2.4, 6);
    // Left end at u = 2 (u runs against the viewer): the first 0.5 m is u in 1.5..2.
    const g = splitFaceByLine(quad(), splitLine({ kind: "vertical", color: "#000", at: 0.5 }, 2, 0, 2.4));
    expect(total(g.below)).toBeCloseTo(0.5 * 2.4, 6);
  });
  it("returns a quad wholly on one side unchanged", () => {
    const q = quad();
    const r = splitFaceByLine(q, splitLine({ kind: "horizontal", color: "#000", at: 5 }, 0, 2, 2.4));
    expect(r.below).toEqual([q]);
    expect(r.above).toEqual([]);
  });
  it("splits a pentagon into a quad and a triangle", () => {
    const { below, above } = splitFaceByLine(quad(), (u, y) => u + y - 0.5);
    expect(below.length + above.length).toBe(3);
    expect(total(below) + total(above)).toBeCloseTo(4.8, 6);
  });
});
