import { describe, expect, it } from "vitest";
import { buildWalls, coveredIntervals, cutWall, diffWalls, estimatePxPerM, polygonArea, snapRooms } from "./geometry";
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
  it("leaves a lintel above a door and a sill and head around a window", () => {
    const wall = { a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, openings: [] as { opening: never; t: number }[] };
    const door = { id: "d", kind: "door" as const, x: 0, y: 0, orientation: "h" as const, widthM: 1 };
    const win = { id: "w", kind: "window" as const, x: 0, y: 0, orientation: "h" as const, widthM: 1 };
    const { pieces, placements } = cutWall({ ...wall, openings: [{ opening: door, t: 1 }, { opening: win, t: 3 }] }, 2.4);
    expect(placements).toHaveLength(2);
    const lintel = pieces.find((p) => p.a.x === 0.5 && p.y0 > 0);
    expect(lintel?.y0).toBeCloseTo(2.05);
    const sill = pieces.find((p) => p.a.x === 2.5 && p.y0 === 0);
    expect(sill?.y1).toBeCloseTo(0.9);
  });
});

describe("diffWalls", () => {
  it("returns the part of a wall the other variant does not have", () => {
    const a = [{ a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, openings: [] }];
    const b = [{ a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, openings: [] }];
    const d = diffWalls(a, b);
    expect(d).toHaveLength(1);
    expect(d[0].a.x).toBeCloseTo(1);
    expect(d[0].b.x).toBeCloseTo(4);
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

  it("snaps nearly shared edges together", () => {
    const [a, b] = snapRooms([rect("A", 0, 0, 300, 400), rect("B", 303, 0, 600, 400)], 10);
    expect(a.polygon[1].x).toBeCloseTo(b.polygon[0].x);
    expect(Math.abs(polygonArea(a.polygon))).toBeGreaterThan(0);
  });
});
