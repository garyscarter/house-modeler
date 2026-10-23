import { describe, expect, it } from "vitest";
import { alignGuides, alignSnap, wallClearances } from "./planGuides";
import type { WallLine } from "./planMath";

const ppm = 100;
const halfT = 12.5;
// A 4 x 3 m room whose wall faces sit at x = 0 / 400 and y = 0 / 300.
const room: WallLine[] = [
  { a: { x: -halfT, y: -halfT }, b: { x: 400 + halfT, y: -halfT }, halfT },
  { a: { x: 400 + halfT, y: -halfT }, b: { x: 400 + halfT, y: 300 + halfT }, halfT },
  { a: { x: 400 + halfT, y: 300 + halfT }, b: { x: -halfT, y: 300 + halfT }, halfT },
  { a: { x: -halfT, y: 300 + halfT }, b: { x: -halfT, y: -halfT }, halfT },
];

describe("wallClearances", () => {
  it("gives the four face gaps for a centred box", () => {
    const out = wallClearances({ c: { x: 200, y: 150 }, w: 100, d: 60, rot: 0 }, room, 6 * ppm);
    const by = Object.fromEntries(out.map((c) => [c.dir, c.px]));
    expect(by.left).toBeCloseTo(150);
    expect(by.right).toBeCloseTo(150);
    expect(by.up).toBeCloseTo(120);
    expect(by.down).toBeCloseTo(120);
    const left = out.find((c) => c.dir === "left")!;
    expect(left.from.x).toBeCloseTo(150);
    expect(left.to.x).toBeCloseTo(0);
  });
  it("still finds the walls at 30 degrees", () => {
    const out = wallClearances({ c: { x: 200, y: 150 }, w: 100, d: 60, rot: 30 }, room, 6 * ppm);
    expect(out).toHaveLength(4);
    for (const c of out) expect(c.px).toBeGreaterThan(0);
  });
  it("reports 0 against a wall", () => {
    const out = wallClearances({ c: { x: 50, y: 150 }, w: 100, d: 60, rot: 0 }, room, 600);
    expect(out.find((c) => c.dir === "left")!.px).toBeCloseTo(0);
  });
  it("ignores a stub that does not span the box edge", () => {
    const stub: WallLine = { a: { x: 300, y: 0 }, b: { x: 300, y: 50 }, halfT: 5 };
    expect(wallClearances({ c: { x: 200, y: 150 }, w: 100, d: 60, rot: 0 }, [stub], 600)).toHaveLength(0);
  });
  it("omits sides beyond maxPx", () => {
    const out = wallClearances({ c: { x: 200, y: 150 }, w: 100, d: 60, rot: 0 }, room, 130);
    expect(out.map((c) => c.dir).sort()).toEqual(["down", "up"]);
  });
});

const r = (x0: number, y0: number, x1: number, y1: number) => ({ x0, y0, x1, y1 });

describe("alignSnap", () => {
  it("snaps left to left within tol and not beyond", () => {
    expect(alignSnap(r(103, 0, 150, 10), [r(100, 200, 180, 240)], 5, { x: true, y: true }).dx).toBeCloseTo(-3);
    expect(alignSnap(r(110, 0, 150, 10), [r(100, 200, 180, 240)], 5, { x: true, y: true }).dx).toBe(0);
  });
  it("respects the axes flags", () => {
    const s = alignSnap(r(103, 202, 150, 210), [r(100, 200, 180, 240)], 5, { x: false, y: true });
    expect(s.dx).toBe(0);
    expect(s.dy).toBeCloseTo(-2);
  });
});

describe("alignGuides", () => {
  it("finds centre matches and merges duplicates", () => {
    const g = alignGuides(r(0, 0, 100, 50), [r(0, 100, 100, 150), r(40, 200, 60, 220)]);
    const xs = g.filter((x) => x.axis === "x");
    expect(xs.find((x) => x.at === 50)).toBeTruthy();
    expect(xs.filter((x) => x.at === 0)).toHaveLength(1);
    expect(xs.find((x) => x.at === 50)!.to).toBe(220);
  });
  it("ignores near misses", () => {
    expect(alignGuides(r(0, 0, 10, 10), [r(3, 20, 13, 30)])).toHaveLength(0);
  });
});
