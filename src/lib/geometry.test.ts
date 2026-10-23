import { describe, expect, it } from "vitest";
import type { Opening } from "../types";
import {
  buildWalls,
  coveredIntervals,
  cutWall,
  diffWalls,
  estimatePxPerM,
  openingHeights,
  type WallPiece,
  type WallSeg,
} from "./geometry";
import { floor, rect } from "./testing";

describe("buildWalls", () => {
  it("merges the shared wall between two rooms and marks outside walls", () => {
    // Two 3 m x 4 m rooms side by side.
    const f = floor([rect("A", 0, 0, 300, 400), rect("B", 300, 0, 600, 400)]);
    const walls = buildWalls(f);
    const shared = walls.filter((w) => Math.abs(w.a.x - 3) < 1e-6 && Math.abs(w.b.x - 3) < 1e-6);
    expect(shared).toHaveLength(1);
    expect(shared[0].exterior).toBe(false);
    const total = walls.reduce((s, w) => s + Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y), 0);
    // Perimeter 2 * (6 + 4) plus one 4 m shared wall.
    expect(total).toBeCloseTo(24, 5);
    expect(walls.filter((w) => w.exterior)).toHaveLength(4);
  });

  it("attaches an opening to the nearest wall with matching orientation", () => {
    const f = floor([rect("A", 0, 0, 300, 400)], [{ id: "d", kind: "door", x: 150, y: 400, orientation: "h", widthM: 0.8 }]);
    const withDoor = buildWalls(f).filter((w) => w.openings.length);
    expect(withDoor).toHaveLength(1);
    expect(withDoor[0].a.y).toBeCloseTo(4);
    expect(withDoor[0].openings[0].t).toBeCloseTo(1.5);
  });
});

describe("cutWall", () => {
  const op = (kind: Opening["kind"], extra: Partial<Opening> = {}): Opening => ({ id: kind, kind, x: 0, y: 0, orientation: "h", widthM: 1, ...extra });
  const wallWith = (...ops: [Opening, number][]): WallSeg => ({
    a: { x: 0, y: 0 },
    b: { x: 4, y: 0 },
    openings: ops.map(([opening, t]) => ({ opening, t })),
  });
  /** Wall pieces over the opening centred at x (pieces that start at its left jamb). */
  const over = (pieces: WallPiece[], x0: number) => pieces.filter((p) => Math.abs(p.a.x - x0) < 1e-9).map((p) => [p.y0, p.y1]);

  it("leaves a lintel above a door and a sill and head around a window", () => {
    const { pieces, placements } = cutWall(wallWith([op("door"), 1], [op("window"), 3]), 2.4);
    expect(placements).toHaveLength(2);
    expect(over(pieces, 0.5)).toEqual([[2.05, 2.4]]);
    expect(over(pieces, 2.5)).toEqual([
      [0, 0.9],
      [2.1, 2.4],
    ]);
    expect(placements[1]).toMatchObject({ y0: 0.9, y1: 2.1, width: 1 });
  });

  it("cuts each opening at its own sill and head", () => {
    const high = op("window", { sill: 1.5, head: 2.0 });
    const tall = op("door", { head: 2.2 });
    const { pieces, placements } = cutWall(wallWith([tall, 1], [high, 3]), 2.4);
    expect(over(pieces, 0.5)).toEqual([[2.2, 2.4]]);
    expect(over(pieces, 2.5)).toEqual([
      [0, 1.5],
      [2.0, 2.4],
    ]);
    expect(placements.map((p) => [p.y0, p.y1])).toEqual([
      [0, 2.2],
      [1.5, 2.0],
    ]);
  });

  it("leaves no lintel when the head reaches the ceiling, and none over a gap", () => {
    const { pieces } = cutWall(wallWith([op("french", { head: 2.6 }), 1], [op("gap"), 3]), 2.4);
    expect(over(pieces, 0.5)).toEqual([]);
    expect(over(pieces, 2.5)).toEqual([]);
    // The wall either side and between the openings is untouched.
    expect(pieces.map((p) => [p.a.x, p.b.x])).toEqual([
      [0, 0.5],
      [1.5, 2.5],
      [3.5, 4],
    ]);
  });

  it("opens a bay to the floor and uses kind defaults for glazed doors", () => {
    expect(openingHeights(op("bay"), 2.4)).toEqual({ y0: 0, y1: 2.1 });
    expect(openingHeights(op("bifold"), 2.4)).toEqual({ y0: 0, y1: 2.1 });
    expect(openingHeights(op("garage"), 2.4)).toEqual({ y0: 0, y1: 2.15 });
    expect(openingHeights(op("gap"), 2.4)).toEqual({ y0: 0, y1: 2.4 });
    // A sill above the head is clamped so the window keeps some glass.
    expect(openingHeights(op("window", { sill: 2.5 }), 2.4)).toEqual({ y0: 2.0, y1: 2.1 });
  });
});

describe("diffWalls", () => {
  it("returns the part of a wall the other variant does not have", () => {
    const a = [{ a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, openings: [], exterior: true }];
    const b = [{ a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, openings: [] }];
    const d = diffWalls(a, b);
    expect(d).toHaveLength(1);
    expect(d[0].a.x).toBeCloseTo(1);
    expect(d[0].b.x).toBeCloseTo(4);
    expect(d[0].exterior).toBe(true);
  });
});

describe("coveredIntervals", () => {
  it("finds the part of a wall under a floor above", () => {
    const upper = [
      [
        { x: 2, y: -3 },
        { x: 6, y: -3 },
        { x: 6, y: 0 },
        { x: 2, y: 0 },
      ],
    ];
    const iv = coveredIntervals({ a: { x: 0, y: 0 }, b: { x: 8, y: 0 } }, upper);
    expect(iv).toHaveLength(1);
    expect(iv[0][0]).toBeCloseTo(2, 1);
    expect(iv[0][1]).toBeCloseTo(6, 1);
  });

  it("is empty when nothing is above", () => {
    expect(coveredIntervals({ a: { x: 0, y: 0 }, b: { x: 8, y: 0 } }, [])).toEqual([]);
  });
});

describe("scale and snapping", () => {
  it("estimates pixels per metre from printed sizes", () => {
    const rooms = [rect("A", 0, 0, 300, 400, { dims: { w: 3, h: 4 } }), rect("B", 0, 0, 200, 200, { dims: { w: 2, h: 2 } })];
    expect(estimatePxPerM(rooms)).toBeCloseTo(100);
  });
});
