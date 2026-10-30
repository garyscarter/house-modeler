import { describe, expect, it } from "vitest";
import { builtInHouse, builtInProposed } from "../houses/default";
import { polygonArea, roomWorldPolygon } from "./geometry";
import { buildWalls, cutWall } from "./geometry";
import { floor as mkFloor, rect } from "./testing";
import { balustrades, cutWells, stairwells, subtractRect, type Rect } from "./stairwell";

const sq = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
const total = (ps: { x: number; y: number }[][]) => ps.reduce((s, p) => s + Math.abs(polygonArea(p)), 0);

describe("subtractRect", () => {
  it("takes a hole out of the middle of a room as four pieces", () => {
    const pieces = subtractRect(sq(0, 0, 4, 4), { x0: 1, y0: 1, x1: 2, y1: 3 });
    expect(total(pieces)).toBeCloseTo(16 - 2);
    expect(pieces).toHaveLength(4);
  });

  it("trims a hole that overlaps the room's edge", () => {
    expect(total(subtractRect(sq(0, 0, 4, 4), { x0: 3.5, y0: 1, x1: 5, y1: 2 }))).toBeCloseTo(16 - 0.5);
  });

  it("leaves a room the hole misses untouched", () => {
    const room = sq(0, 0, 4, 4);
    expect(subtractRect(room, { x0: 5, y0: 0, x1: 6, y1: 1 })[0]).toBe(room);
  });

  it("works on an L-shaped room", () => {
    const L = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 4 },
      { x: 0, y: 4 },
    ];
    expect(total(cutWells(L, [{ x0: 1, y0: 1, x1: 3, y1: 1.5 }]))).toBeCloseTo(12 - 1);
  });
});

describe("the built-in house's stairwell", () => {
  const model = builtInHouse("");
  const [well] = stairwells(model);

  it("opens the floor above over the flight, in the stairs room and on through the landing's west end to the head", () => {
    expect(stairwells(model)).toHaveLength(1);
    expect(well.rects).toHaveLength(2);
    const upper = model.floors.find((f) => f.id === well.upperId)!;
    const poly = (name: string) => roomWorldPolygon(upper, upper.rooms.find((r) => r.name === name)!);
    const inside = (r: Rect, name: string) => {
      const b = poly(name);
      const xs = b.map((p) => p.x);
      const ys = b.map((p) => p.y);
      return r.x0 >= Math.min(...xs) - 1e-9 && r.x1 <= Math.max(...xs) + 1e-9 && r.y0 >= Math.min(...ys) - 1e-9 && r.y1 <= Math.max(...ys) + 1e-9;
    };
    const [stairs, landing] = ["Stairs", "Landing"].map((n) => well.rects.find((r) => inside(r, n))!);
    expect(stairs).toBeDefined();
    expect(landing).toBeDefined();
    for (const r of well.rects) expect(r.x1 - r.x0).toBeCloseTo(0.9);
    // The two meet at the stairs room's top edge; the head runs on up to the landing's north wall.
    expect(landing.y1).toBeCloseTo(stairs.y0);
    expect(landing.y0).toBeCloseTo(well.flight.centre.y - well.flight.run / 2);
    expect(stairs.y1 - landing.y0).toBeLessThanOrEqual(well.flight.run - well.flight.wellStart + 1e-9);
    // The bathroom keeps its floor over the foot (the boxed-in bulkhead).
    const bath = poly("Bathroom");
    expect(total(cutWells(bath, well.rects))).toBeCloseTo(Math.abs(polygonArea(bath)));
  });

  it("guards the open side of the flight up to the head's newel; upstairs the head opens onto the landing and the rest is walled", () => {
    const b = balustrades(model, well);
    expect(b.lower).toHaveLength(1);
    const [rail] = b.lower;
    const f = well.flight;
    // The east side (+l), from the foot's newel to the head's, where it turns onto the landing.
    expect(rail.a.x).toBeCloseTo(f.centre.x + f.width / 2);
    expect(rail.b.y).toBeCloseTo(f.centre.y - f.run / 2 + f.width);
    expect(rail.yb).toBeLessThan(f.rise);
    // The head's newel is over the kitchen, so it hangs from the flight; the foot's stands in the hall.
    expect(rail.fa ?? 0).toBe(0);
    expect(rail.fb).toBeGreaterThan(1.5);
    expect(b.upper).toHaveLength(0);
  });

  it("guards the drop beside the head when the landing is widened past it", () => {
    // Like a landing carried west over the extension: the head's outer side now faces open floor.
    const m = structuredClone(model);
    const upper = m.floors.find((f) => f.level === 1)!;
    const landing = upper.rooms.find((r) => r.name === "Landing")!;
    landing.polygon = landing.polygon.map((p) => ({ ...p, x: p.x === 610 ? 539 : p.x }));
    const [w] = stairwells(m);
    const runs = balustrades(m, w).upper;
    expect(runs).toHaveLength(1);
    const [r] = runs;
    // Along the head's west side, the full depth of the landing, at floor level.
    expect(r.a.x).toBeCloseTo(w.flight.centre.x - w.flight.width / 2);
    expect(r.b.x).toBeCloseTo(r.a.x);
    expect(Math.abs(r.b.y - r.a.y)).toBeGreaterThan(0.8);
    expect(Math.max(r.a.y, r.b.y)).toBeLessThan((1110 - 1203) / 73 + 1e-6);
  });

  it("removes the opening's area from the floor above", () => {
    const upper = model.floors.find((f) => f.id === well.upperId)!;
    const before = upper.rooms.reduce((s, r) => s + Math.abs(polygonArea(roomWorldPolygon(upper, r))), 0);
    const after = upper.rooms.reduce((s, r) => s + total(cutWells(roomWorldPolygon(upper, r), well.rects)), 0);
    const hole = well.rects.reduce((s, r) => s + (r.x1 - r.x0) * (r.y1 - r.y0), 0);
    expect(before - after).toBeGreaterThan(hole * 0.8);
    expect(before - after).toBeLessThanOrEqual(hole + 1e-6);
  });
});

const round = (n: number | undefined) => (n === undefined ? n : Math.round(n * 1e4) / 1e4);
const flat = (r: { a: { x: number; y: number }; b: { x: number; y: number }; ya: number; yb: number; fa?: number; fb?: number }) => ({
  a: [round(r.a.x), round(r.a.y)], b: [round(r.b.x), round(r.b.y)], ya: round(r.ya), yb: round(r.yb), fa: round(r.fa), fb: round(r.fb),
});

describe("balustrades at doorways", () => {
  it("leaves the listed house's runs as they were", () => {
    const m = builtInHouse("");
    const runs = stairwells(m).map((w) => balustrades(m, w));
    expect(runs).toHaveLength(1);
    expect(runs[0].upper).toEqual([]);
    expect(runs[0].lower.map(flat)).toEqual([
      { a: [0.45, 0.25], b: [0.45, -1.21], ya: 0.5654, yb: 1.8846, fa: 0, fb: 2 },
    ]);
  });

  it("stops the proposed stairwell's rail short of New Room's door", () => {
    const m = builtInProposed("");
    const well = stairwells(m)[0];
    const upper = m.floors.find((f) => f.id === well.upperId)!;
    const room = upper.rooms.find((r) => r.name === "New Room")!;
    const doors = buildWalls(upper).flatMap((w) => cutWall(w, m.ceilingHeight).placements).filter((p) => p.opening.kind === "door" && Math.abs(p.centre.x + 0.55) < 0.05 && Math.abs(p.centre.y + 1.75) < 0.05);
    expect(room).toBeTruthy();
    expect(doors).toHaveLength(1);
    const d = doors[0];
    const [lo, hi] = [d.centre.y - d.width / 2, d.centre.y + d.width / 2];
    const { lower, upper: rails } = balustrades(m, well);
    for (const r of rails) {
      const nearLine = Math.abs(r.a.x - d.centre.x) < 0.2 && Math.abs(r.b.x - d.centre.x) < 0.2;
      const [y0, y1] = [Math.min(r.a.y, r.b.y), Math.max(r.a.y, r.b.y)];
      if (nearLine) expect(y1 <= lo || y0 >= hi).toBe(true);
    }
    // The lower flight's rail is untouched.
    expect(lower.map(flat)).toEqual([{ a: [0.45, 0.25], b: [0.45, -1.21], ya: 0.5654, yb: 1.8846, fa: 0, fb: 2 }]);
    expect(rails.map(flat)).toEqual([]);
  });

  it("cuts a run with a door in the middle into two pieces", () => {
    // Flight up +y at x 1..2 (width 1, centre x = 1.5); the landing above is x 0..3, y 0..6, with a well over the flight.
    // The well's west edge (x = 1, a wall line shared with Room to the west) has a door centred at y = 3.
    const lowerF = mkFloor([rect("Hall", 100, 0, 200, 600)], [], { id: "g", level: 0 });
    const upperF = mkFloor(
      [rect("Landing", 100, 0, 300, 600), rect("Room", -300, 0, 100, 600)],
      [{ id: "d", kind: "door", x: 100, y: 300, orientation: "v", widthM: 0.8 }],
      { id: "u", level: 1 },
    );
    const model = { floors: [lowerF, upperF], ceilingHeight: 2.4 } as never;
    const flight = { centre: { x: 1.5, y: 0 }, dir: { x: 0, y: 1 }, run: 6, width: 1, rise: 2.5, lowerId: "g", upperId: "u", wellStart: 0 } as never;
    const well = { lowerId: "g", upperId: "u", flight, rects: [{ x0: 1, y0: 0, x1: 2, y1: 6 }] };
    const west = balustrades(model, well).upper.filter((r) => Math.abs(r.a.x - 1) < 0.01 && Math.abs(r.b.x - 1) < 0.01);
    expect(west).toHaveLength(2);
    const ys = west.map((r) => [Math.min(r.a.y, r.b.y), Math.max(r.a.y, r.b.y)]).sort((p, q) => p[0] - q[0]);
    expect(ys[0][1]).toBeCloseTo(3 - 0.4 - 0.05);
    expect(ys[1][0]).toBeCloseTo(3 + 0.4 + 0.05);
  });

  it("cuts for a door set back up to half a metre from the rail, not further", () => {
    // As above, but the door is in a wall parallel to the well's west edge, `back` metres further west.
    const westRail = (back: number) => {
      const wall = 100 - back * 100;
      const lowerF = mkFloor([rect("Hall", 100, 0, 200, 600)], [], { id: "g", level: 0 });
      const upperF = mkFloor(
        [rect("Landing", wall, 0, 300, 600), rect("Room", -300, 0, wall, 600)],
        [{ id: "d", kind: "door", x: wall, y: 300, orientation: "v", widthM: 0.8 }],
        { id: "u", level: 1 },
      );
      const model = { floors: [lowerF, upperF], ceilingHeight: 2.4 } as never;
      const flight = { centre: { x: 1.5, y: 0 }, dir: { x: 0, y: 1 }, run: 6, width: 1, rise: 2.5, lowerId: "g", upperId: "u", wellStart: 0 } as never;
      const well = { lowerId: "g", upperId: "u", flight, rects: [{ x0: 1, y0: 0, x1: 2, y1: 6 }] };
      return balustrades(model, well).upper.filter((r) => Math.abs(r.a.x - 1) < 0.01 && Math.abs(r.b.x - 1) < 0.01);
    };
    // 0.4 m back: no room to step out of the doorway past a rail, so the rail stops either side of it.
    const near = westRail(0.4);
    expect(near).toHaveLength(2);
    expect(near.some((r) => Math.min(r.a.y, r.b.y) < 3 && Math.max(r.a.y, r.b.y) > 3)).toBe(false);
    // 0.7 m back: a landing in front of the door, so the rail guards the well along its whole length.
    const far = westRail(0.7);
    expect(far).toHaveLength(1);
  });
});
