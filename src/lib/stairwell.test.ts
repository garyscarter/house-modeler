import { describe, expect, it } from "vitest";
import { listing91770873 } from "./houses/listing91770873";
import { polygonArea, roomWorldPolygon } from "./geometry";
import { balustrades, cutWells, stairwells, subtractRect } from "./stairwell";

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

  it("opens the floor above over the flight, within the stairs room upstairs", () => {
    expect(stairwells(model)).toHaveLength(1);
    expect(well.rects).toHaveLength(1);
    const [r] = well.rects;
    const w = r.x1 - r.x0;
    const d = r.y1 - r.y0;
    expect(Math.min(w, d)).toBeCloseTo(0.9);
    expect(Math.max(w, d)).toBeGreaterThan(1.2);
    expect(Math.max(w, d)).toBeLessThanOrEqual(2.3 + 1e-9);
    const upper = model.floors.find((f) => f.id === well.upperId)!;
    const bath = upper.rooms.find((r) => r.name === "Bathroom")!;
    expect(total(cutWells(roomWorldPolygon(upper, bath), well.rects))).toBeCloseTo(Math.abs(polygonArea(roomWorldPolygon(upper, bath))));
  });

  it("guards the open side of the flight; upstairs the opening is walled except at the landing", () => {
    const b = balustrades(model, well);
    expect(b.lower).toHaveLength(1);
    expect(b.upper).toHaveLength(0);
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
