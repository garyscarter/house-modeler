import { describe, expect, it } from "vitest";
import { EXT_WALL_T, WALL_T, buildWalls, coveredIntervals, cutWall, roomWorldPolygon, type WallSeg } from "./geometry";
import { bandIntervals, footprintOverlaps, outwardSign, sideSpans, wallBands, wallEnds, wallFaces, wallThickness, type FaceQuad } from "./walls";
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
    // The side walls head up the plan, to the -n side: that face stops at their inner faces.
    expect(ends[front].inner).toEqual([
      { side: 1, ext: -EXT_WALL_T / 2 },
      { side: 1, ext: -EXT_WALL_T / 2 },
    ]);
  });

  it("stops a partition that ends part-way along another wall, with no end face", () => {
    const shared = walls.findIndex((w) => isAt(w, 3, 0, 3, 4));
    expect(ends[shared].ext).toEqual([0, 0]);
    expect(ends[shared].cap).toEqual([false, false]);
  });

  it("caps a free-standing end", () => {
    const lone: WallSeg = { a: { x: 0, y: 0 }, b: { x: 2, y: 0 }, openings: [] };
    expect(wallEnds([lone], [WALL_T])[0]).toEqual({ ext: [0, 0], cap: [true, true], inner: [null, null] });
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
    // Inside, the faces stop at the side walls instead of poking through to their outer faces.
    const inner = front.quads.filter((q) => q.n[2] === -1).flatMap(xs);
    expect(Math.min(...inner)).toBeCloseTo(EXT_WALL_T / 2);
    expect(Math.max(...inner)).toBeCloseTo(6 - EXT_WALL_T / 2);
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

/** Walls of a floor with their rendered thickness, as the floor below sees them. */
const standing = (f: ReturnType<typeof floor>) => buildWalls(f).map((wall) => ({ wall, thickness: wallThickness(wall) }));
const polysOf = (f: ReturnType<typeof floor>) => f.rooms.map((r) => roomWorldPolygon(f, r));
const spansOf = (f: ReturnType<typeof floor>, w: WallSeg): [ReturnType<typeof sideSpans>, ReturnType<typeof sideSpans>] => {
  const probe = wallThickness(w) / 2 + 0.08;
  return [sideSpans(w, 1, probe, roomsOf(f)), sideSpans(w, -1, probe, roomsOf(f))];
};
/** A room with a chimney-breast notch `depth` px deep in its east side (x 600), y 200-300. */
const notched = (name: string, depth: number) => ({
  id: name,
  name,
  polygon: [
    { x: 0, y: 0 },
    { x: 600, y: 0 },
    { x: 600, y: 200 },
    { x: 600 - depth, y: 200 },
    { x: 600 - depth, y: 300 },
    { x: 600, y: 300 },
    { x: 600, y: 500 },
    { x: 0, y: 500 },
  ],
});
/** The back of the breast: a 0.1 m wall flush with the party wall's outer face (6 + 0.125 m). */
const breastBack = { id: "back", a: { x: 607.5, y: 200 }, b: { x: 607.5, y: 300 } };

describe("bandIntervals", () => {
  // A 6 m two-storey block (x 4-10) with a 4 m single-storey wing to its west
  // (x 0-4) under a flat roof, both 5 m deep; the rear wall runs along y = 0.
  const ground = floor([rect("Wing", 0, 0, 400, 500), rect("Main", 400, 0, 1000, 500)]);
  const upper = floor([rect("Bed", 400, 0, 1000, 500)], [], { level: 1 });
  const rear = buildWalls(ground).find((w) => isAt(w, 0, 0, 10, 0))!;

  it("runs the band between storeys out to the outer face of the storey above, where a lower roof meets it", () => {
    // The flat roof's fascia stops at the face of the taller wall (x 4 - 0.125),
    // so the band must start there, not at the upper room's outline (x 4).
    expect(coveredIntervals(rear, polysOf(upper))[0][0]).toBeGreaterThan(4 - 0.01);
    const iv = bandIntervals(rear, EXT_WALL_T, polysOf(upper), standing(upper));
    expect(iv).toHaveLength(1);
    expect(iv[0][0]).toBeCloseTo(4 - EXT_WALL_T / 2, 6);
    expect(iv[0][1]).toBeCloseTo(10, 6);
  });

  it("leaves the band off where nothing stands above", () => {
    const side = buildWalls(ground).find((w) => isAt(w, 0, 0, 0, 5))!;
    expect(bandIntervals(side, EXT_WALL_T, polysOf(upper), standing(upper))).toEqual([]);
    expect(bandIntervals(rear, EXT_WALL_T, [], [])).toEqual([]);
  });

  it("carries the band on under a chimney-breast notch upstairs", () => {
    // Downstairs the party wall runs straight through; upstairs the room steps in round the breast.
    const up = floor([notched("Bed", 30)], [], { level: 1, walls: [breastBack] });
    const down = floor([rect("Living", 0, 0, 600, 500)]);
    const party = buildWalls(down).find((w) => isAt(w, 6, 0, 6, 5))!;
    // The rooms alone leave a gap behind the breast, open to the room below.
    expect(coveredIntervals(party, polysOf(up)).length).toBeGreaterThan(1);
    const iv = bandIntervals(party, EXT_WALL_T, polysOf(up), standing(up));
    expect(iv).toHaveLength(1);
    expect(iv[0][0]).toBeCloseTo(0, 6);
    expect(iv[0][1]).toBeCloseTo(5, 6);
  });
});

describe("footprintOverlaps", () => {
  const wall = { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } };
  it("covers a wall where another stands on it, along it or across it", () => {
    // In line, a little off its centre line: its own length.
    const along = footprintOverlaps(wall, 0.25, [{ wall: { a: { x: 2, y: 0.04 }, b: { x: 5, y: 0.04 } }, thickness: 0.25 }]);
    expect(along).toHaveLength(1);
    expect(along[0][0]).toBeCloseTo(2, 9);
    expect(along[0][1]).toBeCloseTo(5, 9);
    // Across it: its thickness.
    const across = footprintOverlaps(wall, 0.25, [{ wall: { a: { x: 4, y: 0 }, b: { x: 4, y: 3 } }, thickness: 0.25 }]);
    expect(across).toHaveLength(1);
    expect(across[0][0]).toBeCloseTo(3.875, 9);
    expect(across[0][1]).toBeCloseTo(4.125, 9);
  });
  it("ignores walls that only touch its face or stand clear of it", () => {
    expect(footprintOverlaps(wall, 0.25, [{ wall: { a: { x: 2, y: 0.25 }, b: { x: 5, y: 0.25 } }, thickness: 0.25 }])).toEqual([]);
    expect(footprintOverlaps(wall, 0.25, [{ wall: { a: { x: 2, y: 2 }, b: { x: 5, y: 2 } }, thickness: 0.25 }])).toEqual([]);
  });
});

describe("wallBands", () => {
  const upper = floor([rect("Bed", 0, 0, 600, 500)], [], { level: 1 });
  const opts = (plinthY: number | null) => ({ ceiling: 2.4, slab: 0.25, upperPolys: polysOf(upper), upperWalls: standing(upper), plinthY });

  it("gives a free-standing wall with outside behind it a band and a plinth, as an external wall", () => {
    // Downstairs the notch is closed by the back of the breast; upstairs the room runs through.
    const ground = floor([notched("Living", 40)], [], { walls: [breastBack] });
    const back = buildWalls(ground).find((w) => !w.exterior && Math.abs(w.a.x - 6.075) < 1e-6)!;
    const bands = wallBands(back, wallThickness(back), spansOf(ground, back), opts(-0.3));
    expect(bands.map((b) => [b.y0, b.y1])).toEqual([
      [2.4, 2.65],
      [-0.3, 0],
    ]);
    expect(Math.hypot(bands[0].b.x - bands[0].a.x, bands[0].b.y - bands[0].a.y)).toBeCloseTo(1, 6);
  });

  it("gives internal partitions and walls of a set height none", () => {
    const ground = floor([rect("A", 0, 0, 300, 500), rect("B", 300, 0, 600, 500)], [], {
      walls: [{ id: "dwarf", a: { x: 0, y: 700 }, b: { x: 600, y: 700 }, height: 1 }],
    });
    const walls = buildWalls(ground);
    const partition = walls.find((w) => isAt(w, 3, 0, 3, 5))!;
    expect(wallBands(partition, WALL_T, spansOf(ground, partition), opts(-0.3))).toEqual([]);
    const dwarf = walls.find((w) => w.height === 1)!;
    expect(wallBands(dwarf, WALL_T, spansOf(ground, dwarf), opts(-0.3))).toEqual([]);
  });
});
