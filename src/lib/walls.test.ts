import { describe, expect, it } from "vitest";
import { EXT_WALL_T, WALL_T, buildWalls, cutWall, roomWorldPolygon, type WallSeg } from "./geometry";
import { outwardSign, sideSpans, wallEnds, wallFaces, wallThickness, type FaceQuad } from "./walls";
import { floor, rect } from "./testing";

/** Two 3 m x 4 m rooms side by side, 1 px = 1 cm. */
const twoRooms = (openings = [] as Parameters<typeof floor>[1]) => floor([rect("A", 0, 0, 300, 400), rect("B", 300, 0, 600, 400)], openings);
const roomsOf = (f: ReturnType<typeof floor>) => f.rooms.map((r) => ({ id: r.id, poly: roomWorldPolygon(f, r) }));
const isAt = (w: WallSeg, ax: number, ay: number, bx: number, by: number) =>
  Math.abs(w.a.x - ax) < 1e-6 && Math.abs(w.a.y - ay) < 1e-6 && Math.abs(w.b.x - bx) < 1e-6 && Math.abs(w.b.y - by) < 1e-6;

function facesFor(f: ReturnType<typeof floor>) {
  const walls = buildWalls(f);
  const thick = walls.map(wallThickness);
  const ends = wallEnds(walls, thick);
  const rooms = roomsOf(f);
  return walls.map((wall, i) => {
    const { pieces, placements } = cutWall(wall, 2.4);
    const probe = thick[i] / 2 + 0.08;
    return {
      wall,
      ends: ends[i],
      ...wallFaces({
        wall,
        thickness: thick[i],
        ends: ends[i],
        spans: [sideSpans(wall, 1, probe, rooms), sideSpans(wall, -1, probe, rooms)],
        pieces,
        bands: [],
        placements,
        top: 2.4,
        baseY: 0,
        skirting: true,
      }),
    };
  });
}
const xs = (q: FaceQuad) => q.v.map((v) => v[0]);

describe("wallEnds", () => {
  const f = twoRooms();
  const walls = buildWalls(f);
  const ends = wallEnds(walls, walls.map(wallThickness));

  it("extends external walls at corners by half the other wall so the corner closes", () => {
    const front = walls.findIndex((w) => isAt(w, 0, 4, 6, 4));
    expect(ends[front].ext).toEqual([EXT_WALL_T / 2, EXT_WALL_T / 2]);
    expect(ends[front].cap).toEqual([false, false]);
  });

  it("stops a partition that ends part-way along another wall, with no end face", () => {
    const shared = walls.findIndex((w) => isAt(w, 3, 0, 3, 4));
    expect(ends[shared].ext).toEqual([0, 0]);
    expect(ends[shared].cap).toEqual([false, false]);
  });

  it("caps a free-standing end", () => {
    const lone: WallSeg = { a: { x: 0, y: 0 }, b: { x: 2, y: 0 }, openings: [] };
    expect(wallEnds([lone], [WALL_T])[0]).toEqual({ ext: [0, 0], cap: [true, true] });
  });
});

describe("sideSpans", () => {
  it("finds where the room changes along one side of a wall", () => {
    const f = twoRooms();
    const front = buildWalls(f).find((w) => isAt(w, 0, 4, 6, 4))!;
    const rooms = roomsOf(f);
    // -n points up the plan (into the rooms) for a wall running left to right.
    const inside = sideSpans(front, -1, 0.2, rooms);
    expect(inside.map((s) => s.roomId)).toEqual(["A", "B"]);
    expect(inside[0].t1).toBeCloseTo(3, 2);
    expect(sideSpans(front, 1, 0.2, rooms)).toEqual([{ t0: 0, t1: 6, roomId: null }]);
  });
});

describe("wallFaces", () => {
  it("paints each face of a shared wall by the room on that side", () => {
    const shared = facesFor(twoRooms()).find((r) => isAt(r.wall, 3, 0, 3, 4))!;
    const sides = shared.quads.filter((q) => q.n[1] === 0);
    // Faces at x = 3 - t/2 look into A, those at x = 3 + t/2 look into B.
    for (const q of sides) {
      const x = q.v[0][0];
      expect(q.slot).toEqual({ kind: "inside", roomId: x < 3 ? "A" : "B" });
    }
    expect(sides.some((q) => q.v[0][0] < 3)).toBe(true);
    expect(sides.some((q) => q.v[0][0] > 3)).toBe(true);
  });

  it("gives an outside face the finish of the room behind it and runs it past the corners", () => {
    const front = facesFor(twoRooms()).find((r) => isAt(r.wall, 0, 4, 6, 4))!;
    const outer = front.quads.filter((q) => q.n[2] === 1);
    expect(outer.map((q) => q.slot)).toEqual([
      { kind: "outside", roomId: "A" },
      { kind: "outside", roomId: "B" },
    ]);
    const allX = outer.flatMap(xs);
    expect(Math.min(...allX)).toBeCloseTo(-EXT_WALL_T / 2);
    expect(Math.max(...allX)).toBeCloseTo(6 + EXT_WALL_T / 2);
    for (const q of outer) expect(q.v[0][2]).toBeCloseTo(4 + EXT_WALL_T / 2);
  });

  it("winds every quad to face along its normal", () => {
    for (const { quads } of facesFor(twoRooms([{ id: "w", kind: "window", x: 150, y: 400, orientation: "h", widthM: 1.2 }]))) {
      for (const q of quads) {
        const [a, b, c] = q.v;
        const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        expect(cr[0] * q.n[0] + cr[1] * q.n[1] + cr[2] * q.n[2]).toBeGreaterThan(0);
      }
    }
  });

  it("lines a window's hole with jambs, a soffit and a sill, and stops the skirting under it only at doors", () => {
    const f = twoRooms([
      { id: "w", kind: "window", x: 150, y: 400, orientation: "h", widthM: 1.2, sill: 1.5 },
      { id: "d", kind: "door", x: 450, y: 400, orientation: "h", widthM: 0.9 },
    ]);
    const front = facesFor(f).find((r) => isAt(r.wall, 0, 4, 6, 4))!;
    const jambs = front.quads.filter((q) => Math.abs(q.n[0]) === 1 && q.v.every((v) => v[0] > 0.5 && v[0] < 2.5));
    expect(jambs).toHaveLength(4); // two jambs, each split at the centre line
    expect(Math.min(...jambs.flatMap((q) => q.v.map((v) => v[1])))).toBeCloseTo(1.5);
    const sillTop = front.quads.filter((q) => q.n[1] === 1 && q.v.every((v) => Math.abs(v[1] - 1.5) < 1e-9));
    expect(sillTop).toHaveLength(2);
    // Skirting runs under the window but not across the door.
    const runs = front.skirting.map((s) => [Math.min(s.a.x, s.b.x), Math.max(s.a.x, s.b.x)]);
    expect(runs.some(([a, b]) => a < 1.5 && b > 1.5)).toBe(true);
    expect(runs.some(([a, b]) => a < 4.5 && b > 4.5)).toBe(false);
  });
});

describe("outwardSign", () => {
  it("finds the outside of an external opening", () => {
    const rooms = [roomsOf(twoRooms())[0].poly];
    // A wall along the front (y = 4) running left to right: +n points down the plan, out of the house.
    expect(outwardSign({ centre: { x: 1.5, y: 4 }, dir: { x: 1, y: 0 } }, rooms)).toBe(1);
    expect(outwardSign({ centre: { x: 1.5, y: 0 }, dir: { x: 1, y: 0 } }, rooms)).toBe(-1);
    expect(outwardSign({ centre: { x: 1.5, y: 2 }, dir: { x: 1, y: 0 } }, rooms)).toBe(0);
  });
});
