import { describe, expect, it } from "vitest";
import { planTargetAt } from "./planHit";
import { floor, rect } from "./testing";
import type { Opening } from "../types";

const tol = { hit: 10, edge: 20 };
const door: Opening = { id: "d1", kind: "door", x: 200, y: 0, orientation: "h", widthM: 0.8 };
const f = floor([rect("A", 0, 0, 400, 300), rect("B", 300, 100, 600, 300)], [door], { walls: [{ id: "w1", a: { x: 700, y: 0 }, b: { x: 700, y: 200 } }] });
const solids = [
  { id: "bed", corners: [{ x: 50, y: 50 }, { x: 150, y: 50 }, { x: 150, y: 150 }, { x: 50, y: 150 }] },
  { id: "lamp", corners: [{ x: 100, y: 100 }, { x: 130, y: 100 }, { x: 130, y: 130 }, { x: 100, y: 130 }] },
];

describe("planTargetAt", () => {
  it("finds the topmost fixture in Furnish, and nothing elsewhere", () => {
    expect(planTargetAt(f, { x: 110, y: 110 }, "furnish", tol, solids)).toEqual({ kind: "fixture", id: "lamp" });
    expect(planTargetAt(f, { x: 60, y: 60 }, "furnish", tol, solids)).toEqual({ kind: "fixture", id: "bed" });
    expect(planTargetAt(f, { x: 250, y: 250 }, "furnish", tol, solids)).toEqual({ kind: "empty" });
    expect(planTargetAt(f, { x: 110, y: 110 }, "build", tol, solids)).toMatchObject({ kind: "room", id: "A" });
  });
  it("finds an opening near its centre line in Build only", () => {
    expect(planTargetAt(f, { x: 220, y: 6 }, "build", tol)).toEqual({ kind: "opening", id: "d1" });
    expect(planTargetAt(f, { x: 260, y: 6 }, "build", tol).kind).not.toBe("opening");
    expect(planTargetAt(f, { x: 220, y: 6 }, "decorate", tol).kind).not.toBe("opening");
  });
  it("finds a free wall in Build and Decorate", () => {
    expect(planTargetAt(f, { x: 704, y: 100 }, "build", tol)).toEqual({ kind: "wall", id: "w1" });
    expect(planTargetAt(f, { x: 704, y: 100 }, "decorate", tol)).toEqual({ kind: "wall", id: "w1" });
    expect(planTargetAt(f, { x: 704, y: 100 }, "furnish", tol)).toEqual({ kind: "empty" });
  });
  it("finds the last room containing the point, with the nearest edge when close", () => {
    expect(planTargetAt(f, { x: 350, y: 200 }, "build", tol)).toEqual({ kind: "room", id: "B", edge: null });
    expect(planTargetAt(f, { x: 100, y: 150 }, "build", tol)).toMatchObject({ kind: "room", id: "A" });
    // 8 px from A's left edge (edge 3: polygon[3] to polygon[0]).
    expect(planTargetAt(f, { x: 8, y: 150 }, "build", tol)).toEqual({ kind: "room", id: "A", edge: 3 });
    // 5 px below A's top edge, away from the door.
    expect(planTargetAt(f, { x: 60, y: 5 }, "decorate", tol)).toEqual({ kind: "room", id: "A", edge: 0 });
  });
  it("is empty outside everything", () => {
    expect(planTargetAt(f, { x: 900, y: 900 }, "build", tol)).toEqual({ kind: "empty" });
    expect(planTargetAt(f, { x: 100, y: 100 }, "review", tol)).toEqual({ kind: "empty" });
  });
});
