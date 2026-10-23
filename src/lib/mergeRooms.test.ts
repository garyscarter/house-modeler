import { describe, expect, it } from "vitest";
import type { Opening, Room } from "../types";
import { polygonArea } from "./geometry";
import { knockThroughNeighbours, mergeRooms } from "./mergeRooms";
import { floor, rect } from "./testing";

const area = (r: Room) => Math.abs(polygonArea(r.polygon));
const op = (id: string, kind: Opening["kind"], x: number, y: number, orientation: "h" | "v", widthM = 0.9): Opening => ({ id, kind, x, y, orientation, widthM });
const pts = (r: Room) => r.polygon.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`);

describe("mergeRooms", () => {
  it("joins two rooms side by side into one rectangle", () => {
    const f = floor([rect("A", 0, 0, 200, 300), rect("B", 200, 0, 450, 300)]);
    const r = mergeRooms(f, "A", "B", "a");
    if (!r.ok) throw new Error(r.reason);
    expect(r.floor.rooms.map((x) => x.id)).toEqual(["A"]);
    expect(r.room.polygon).toHaveLength(4);
    expect(area(r.room)).toBeCloseTo(450 * 300);
    expect(r.sharedM).toBeCloseTo(3);
  });

  it("makes an L when one room's shared edge is longer (galley beside the kitchen)", () => {
    const f = floor([rect("Galley", 530, 22, 730, 160), rect("Kitchen", 730, 22, 975, 345)]);
    const r = mergeRooms(f, "Galley", "Kitchen", "b");
    if (!r.ok) throw new Error(r.reason);
    expect(r.room.id).toBe("Kitchen");
    expect(r.room.polygon).toHaveLength(6);
    expect(area(r.room)).toBeCloseTo(200 * 138 + 245 * 323);
    expect(pts(r.room)).not.toContain("730,22");
    expect(pts(r.room)).toContain("730,160");
  });

  it("makes a T when the shared wall is only part of each edge", () => {
    const f = floor([rect("Bar", 0, 0, 300, 100), rect("Stem", 100, 100, 200, 300), rect("Wing", 250, 100, 300, 160)]);
    const r = mergeRooms(f, "Bar", "Stem", "a");
    if (!r.ok) throw new Error(r.reason);
    expect(r.room.polygon).toHaveLength(8);
    expect(area(r.room)).toBeCloseTo(300 * 100 + 100 * 200);
    // The wing is still there and still touches the merged room.
    expect(r.floor.rooms.map((x) => x.id)).toEqual(["Bar", "Wing"]);
  });

  it("handles a shared wall that is offset between the two rooms", () => {
    const f = floor([rect("A", 0, 0, 200, 200), rect("B", 200, 100, 400, 300)]);
    const r = mergeRooms(f, "A", "B", "a");
    if (!r.ok) throw new Error(r.reason);
    expect(r.room.polygon).toHaveLength(8);
    expect(area(r.room)).toBeCloseTo(200 * 200 + 200 * 200);
  });

  it("copes with a hand-traced wall a few pixels out and cleans the outline", () => {
    const f = floor([rect("A", 0, 0, 200, 300), { ...rect("B", 203, 2, 450, 297) }]);
    const r = mergeRooms(f, "A", "B", "a");
    if (!r.ok) throw new Error(r.reason);
    expect(r.room.polygon).toHaveLength(4);
    expect(Math.abs(area(r.room) - (200 * 300 + 247 * 295))).toBeLessThan(0.05 * 450 * 300);
    // No zero-length edges.
    r.room.polygon.forEach((p, i) => {
      const q = r.room.polygon[(i + 1) % 4];
      expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeGreaterThan(50);
    });
  });

  it("doesn't mind which way round the rooms were traced", () => {
    const b = rect("B", 200, 0, 450, 300);
    const f = floor([rect("A", 0, 0, 200, 300), { ...b, polygon: [...b.polygon].reverse() }]);
    const r = mergeRooms(f, "A", "B", "a");
    if (!r.ok) throw new Error(r.reason);
    expect(r.room.polygon).toHaveLength(4);
    expect(area(r.room)).toBeCloseTo(450 * 300);
    // Wound like the kept room.
    expect(polygonArea(r.room.polygon) > 0).toBe(polygonArea(f.rooms[0].polygon) > 0);
    const rb = mergeRooms(f, "A", "B", "b");
    if (!rb.ok) throw new Error(rb.reason);
    expect(polygonArea(rb.room.polygon) > 0).toBe(polygonArea(f.rooms[1].polygon) > 0);
  });

  it("removes openings in the shared wall and keeps the rest", () => {
    const f = floor(
      [rect("A", 0, 0, 200, 300), rect("B", 200, 0, 450, 300)],
      [
        op("gap", "gap", 200, 90, "v", 1.8),
        op("door", "door", 201, 250, "v"),
        op("win", "window", 0, 150, "v"),
        op("front", "front", 300, 300, "h"),
        // A door on a wall that runs the other way, through the same point.
        op("cross", "door", 200, 0, "h"),
      ],
    );
    const r = mergeRooms(f, "A", "B", "a");
    if (!r.ok) throw new Error(r.reason);
    expect(r.removedOpenings.map((o) => o.id).sort()).toEqual(["door", "gap"]);
    expect(r.floor.openings.map((o) => o.id)).toEqual(["win", "front", "cross"]);
  });

  it("removes only openings along the shared stretch of a longer wall", () => {
    const f = floor(
      [rect("Galley", 530, 22, 730, 160), rect("Kitchen", 730, 22, 975, 345)],
      [op("gap", "gap", 730, 91, "v", 1.8), op("hall", "door", 730, 250, "v")],
    );
    const r = mergeRooms(f, "Galley", "Kitchen", "a");
    if (!r.ok) throw new Error(r.reason);
    expect(r.removedOpenings.map((o) => o.id)).toEqual(["gap"]);
    expect(r.floor.openings.map((o) => o.id)).toEqual(["hall"]);
  });

  it("keeps the chosen room's fields, whichever way round", () => {
    const a = { ...rect("Kitchen", 0, 0, 200, 300), color: "#111111", wallPaint: "#aa0000", roofGroup: "extension", dims: { w: 2, h: 3 } };
    const b = { ...rect("Dining", 200, 0, 450, 300), color: "#222222", wallPaint: "#00aa00", dims: { w: 2.5, h: 3 } };
    const f = floor([a, b]);
    const ra = mergeRooms(f, "Kitchen", "Dining", "a");
    const rb = mergeRooms(f, "Kitchen", "Dining", "b");
    if (!ra.ok || !rb.ok) throw new Error("merge failed");
    expect(ra.room).toMatchObject({ id: "Kitchen", name: "Kitchen", color: "#111111", wallPaint: "#aa0000", roofGroup: "extension" });
    expect(ra.room.dims).toBeUndefined();
    expect(rb.room).toMatchObject({ id: "Dining", name: "Dining", color: "#222222", wallPaint: "#00aa00" });
    expect(rb.room.roofGroup).toBeUndefined();
    expect(rb.floor.rooms.map((x) => x.id)).toEqual(["Dining"]);
  });

  it("joins notes rather than dropping the other room's", () => {
    const f = floor([
      { ...rect("A", 0, 0, 200, 300), notes: "damp" },
      { ...rect("B", 200, 0, 450, 300), notes: "radiator" },
    ]);
    const r = mergeRooms(f, "A", "B", "a");
    if (!r.ok) throw new Error(r.reason);
    expect(r.room.notes).toBe("damp\n\nB: radiator");
  });

  it("moves wall finishes onto the matching edges of the merged outline", () => {
    // Rect edges: 0 top, 1 right, 2 bottom, 3 left. A's right (1) and B's left (3) are the shared wall.
    const a = { ...rect("A", 0, 0, 200, 300), wallFinishes: { 0: { paint: "#a00" }, 1: { paint: "#a01" }, 3: { paint: "#a03" } } };
    const b = { ...rect("B", 200, 0, 450, 300), wallFinishes: { 0: { paint: "#b00" }, 1: { paint: "#b01" }, 2: { paint: "#b02" }, 3: { paint: "#b03" } } };
    const f = floor([a, b]);
    const r = mergeRooms(f, "A", "B", "a");
    if (!r.ok) throw new Error(r.reason);
    const poly = r.room.polygon;
    const fin = (r.room.wallFinishes ?? {}) as Record<number, { paint?: string }>;
    const at = (x0: number, y0: number, x1: number, y1: number) => {
      const i = poly.findIndex((p, k) => {
        const q = poly[(k + 1) % poly.length];
        return Math.min(p.x, q.x) === x0 && Math.min(p.y, q.y) === y0 && Math.max(p.x, q.x) === x1 && Math.max(p.y, q.y) === y1;
      });
      return fin[i]?.paint;
    };
    expect(at(0, 0, 450, 0)).toBe("#a00"); // top: A's wins over B's
    expect(at(0, 300, 450, 300)).toBe("#b02"); // bottom: only B has one
    expect(at(0, 0, 0, 300)).toBe("#a03"); // A's left wall
    expect(at(450, 0, 450, 300)).toBe("#b01"); // B's right wall
    expect(Object.keys(fin)).toHaveLength(4);
    // The shared wall's own finishes are gone, not left on some other edge.
    expect(Object.values(fin).map((o) => o.paint)).not.toContain("#a01");
    expect(Object.values(fin).map((o) => o.paint)).not.toContain("#b03");
  });

  it("leaves fixtures and standalone walls alone", () => {
    const fx = [{ id: "fx1" }] as never;
    const walls = [{ id: "w1", a: { x: 10, y: 10 }, b: { x: 50, y: 10 } }] as never;
    const f = floor([rect("A", 0, 0, 200, 300), rect("B", 200, 0, 450, 300)], [], { fixtures: fx, walls });
    const r = mergeRooms(f, "A", "B", "a");
    if (!r.ok) throw new Error(r.reason);
    expect(r.floor.fixtures).toBe(fx);
    expect(r.floor.walls).toBe(walls);
  });

  it("refuses rooms that don't share a wall", () => {
    const f = floor([rect("A", 0, 0, 200, 300), rect("B", 300, 0, 450, 300), rect("C", 200, 300, 300, 400)]);
    expect(mergeRooms(f, "A", "B", "a")).toMatchObject({ ok: false, code: "no-wall", reason: "These rooms don't share a wall." });
    // Touching at a corner only is not a wall.
    expect(mergeRooms(f, "A", "C", "a")).toMatchObject({ ok: false, code: "no-wall" });
    expect(mergeRooms(f, "A", "A", "a").ok).toBe(false);
    expect(mergeRooms(f, "A", "nope", "a").ok).toBe(false);
  });

  it("refuses a merge that would leave a hole", () => {
    const c: Room = {
      id: "C",
      name: "C",
      polygon: [
        { x: 0, y: 0 },
        { x: 300, y: 0 },
        { x: 300, y: 100 },
        { x: 100, y: 100 },
        { x: 100, y: 200 },
        { x: 300, y: 200 },
        { x: 300, y: 300 },
        { x: 0, y: 300 },
      ],
    };
    const f = floor([c, rect("Plug", 200, 100, 300, 200)]);
    expect(mergeRooms(f, "C", "Plug", "a")).toMatchObject({ ok: false, code: "hole" });
  });

  it("refuses rooms drawn on top of each other", () => {
    const f = floor([rect("A", 0, 0, 200, 300), rect("B", 100, 0, 400, 300)]);
    expect(mergeRooms(f, "A", "B", "a").ok).toBe(false);
  });

  it("lists only the rooms that share a wall", () => {
    const f = floor([rect("A", 0, 0, 200, 300), rect("B", 200, 0, 450, 300), rect("C", 600, 0, 700, 300), rect("D", 0, 300, 200, 400)]);
    expect(knockThroughNeighbours(f, "A").map((r) => r.id)).toEqual(["B", "D"]);
    expect(knockThroughNeighbours(f, "C")).toEqual([]);
  });
});
