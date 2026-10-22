import { describe, expect, it } from "vitest";
import { listing91770873 } from "./houses/listing91770873";
import { polygonArea, roomWorldPolygon } from "./geometry";
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

describe("listing 91770873 stairwell", () => {
  const model = listing91770873("");
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
    expect(Math.abs(r.b.y - r.a.y)).toBeGreaterThan(0.85);
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
