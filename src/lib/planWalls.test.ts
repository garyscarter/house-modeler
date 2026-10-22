import { describe, expect, it } from "vitest";
import type { Opening, Pt } from "../types";
import { floor, rect } from "./testing";
import { planWallLines, planWalls, type PlanWall } from "./planWalls";

/** 1 px = 1 cm in the test floors, so px values read as centimetres. */
const area = (poly: Pt[]) => Math.abs(poly.reduce((s, p, i) => s + (p.x * poly[(i + 1) % poly.length].y - poly[(i + 1) % poly.length].x * p.y), 0)) / 2;
const inside = (poly: Pt[], x: number, y: number) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
};
const covered = (walls: PlanWall[], x: number, y: number) => walls.some((w) => inside(w.poly, x, y));
const door = (x: number, y: number, widthM = 0.9, orientation: "h" | "v" = "h"): Opening => ({ id: "d" + x + "," + y, kind: "door", x, y, orientation, widthM });

describe("planWalls", () => {
  it("draws external walls 25 cm and partitions 10 cm thick, in px", () => {
    const f = floor([rect("A", 0, 0, 300, 400), rect("B", 300, 0, 600, 400)]);
    const ws = planWalls(f);
    const ext = ws.filter((w) => w.exterior);
    const int = ws.filter((w) => !w.exterior);
    expect(ext.length).toBe(4);
    expect(int.length).toBe(1);
    expect(ext.every((w) => Math.abs(w.thickness - 25) < 1e-9)).toBe(true);
    expect(int[0].thickness).toBeCloseTo(10, 9);
    // The party wall between the rooms is a 10 cm strip centred on x = 300.
    expect(covered(ws, 296, 200)).toBe(true);
    expect(covered(ws, 304, 200)).toBe(true);
    expect(covered(ws, 306, 200)).toBe(false);
    expect(covered(ws, 294, 200)).toBe(false);
    // The outside wall spans 12.5 cm either side of the room edge.
    expect(covered(ws, 150, -12)).toBe(true);
    expect(covered(ws, 150, -13)).toBe(false);
    expect(covered(ws, 150, 12)).toBe(true);
    expect(covered(ws, 150, 13)).toBe(false);
  });

  it("scales with the plan's px per metre", () => {
    const f = floor([rect("A", 0, 0, 600, 800)], [], { pxPerM: 200 });
    for (const w of planWalls(f)) expect(w.thickness).toBeCloseTo(50, 9);
  });

  it("closes an L corner with no gap or overlap", () => {
    const f = floor([rect("A", 0, 0, 300, 400)]);
    const ws = planWalls(f);
    // Walls are centred on the room edge: the outer corner is filled out to (-12.5, -12.5), the inner face is 12.5 in.
    expect(covered(ws, -12, -12)).toBe(true);
    expect(covered(ws, 312, 412)).toBe(true);
    expect(covered(ws, 12, 12)).toBe(true);
    expect(covered(ws, 13, 13)).toBe(false);
    // Mitred: the walls cover the ring between the outer and inner outlines, give or take the hairline seam overlap.
    const total = ws.reduce((s, w) => s + area(w.poly), 0);
    const ring = 325 * 425 - 275 * 375;
    expect(total).toBeGreaterThan(ring - 1);
    expect(total).toBeLessThan(ring + 40);
  });

  it("joins a T cleanly: the partition ends inside the outer wall and adds nothing outside it", () => {
    const f = floor([rect("A", 0, 0, 300, 400), rect("B", 300, 0, 600, 400)]);
    const ws = planWalls(f);
    // Nothing pokes out past the outer faces.
    expect(covered(ws, 300, -13)).toBe(false);
    expect(covered(ws, 300, 413)).toBe(false);
    // And there is no gap along the partition or where it meets the outer walls.
    for (let y = -12; y <= 412; y += 4) expect(covered(ws, 300, y)).toBe(true);
    for (const x of [296, 304]) for (let y = -12; y <= 412; y += 4) if (y < 0 || y > 400 || (x > 294 && x < 306)) expect(covered(ws, x, y)).toBe(true);
  });

  it("leaves a gap of the opening's width", () => {
    const f = floor([rect("A", 0, 0, 300, 400), rect("B", 300, 0, 600, 400)], [door(300, 200, 0.9, "v")]);
    const ws = planWalls(f);
    // 90 cm door centred at y = 200: open from 155 to 245.
    expect(covered(ws, 300, 150)).toBe(true);
    expect(covered(ws, 300, 154)).toBe(true);
    expect(covered(ws, 300, 156)).toBe(false);
    expect(covered(ws, 300, 200)).toBe(false);
    expect(covered(ws, 300, 244)).toBe(false);
    expect(covered(ws, 300, 246)).toBe(true);
    // The wall is two solid pieces around it.
    expect(ws.filter((w) => !w.exterior).length).toBe(2);
  });

  it("cuts windows out of external walls too", () => {
    const f = floor([rect("A", 0, 0, 300, 400)], [{ id: "w", kind: "window", x: 150, y: 0, orientation: "h", widthM: 1.2 }]);
    const ws = planWalls(f);
    expect(covered(ws, 150, 0)).toBe(false);
    expect(covered(ws, 100, 0)).toBe(false); // open from 90 to 210
    expect(covered(ws, 85, 0)).toBe(true);
    expect(covered(ws, 215, 0)).toBe(true);
  });

  it("draws free-standing walls as partitions", () => {
    const f = floor([rect("A", 0, 0, 300, 400)], [], { walls: [{ id: "w", a: { x: 0, y: 200 }, b: { x: 150, y: 200 } }] });
    const ws = planWalls(f);
    expect(covered(ws, 75, 204)).toBe(true);
    expect(covered(ws, 75, 206)).toBe(false);
    expect(covered(ws, 175, 200)).toBe(false);
  });

  it("respects the floor's origin and offset", () => {
    const f = floor([rect("A", 1000, 1000, 1300, 1400)], [], { origin: { x: 1000, y: 1000 }, offset: { x: 5, y: 5 } });
    const ws = planWalls(f);
    expect(covered(ws, 1150, 1000)).toBe(true);
    expect(covered(ws, 1150, 1013)).toBe(false);
  });

  it("gives snapping lines that match the drawn walls", () => {
    const f = floor([rect("A", 0, 0, 300, 400), rect("B", 300, 0, 600, 400)]);
    const lines = planWallLines(f);
    const party = lines.find((l) => Math.abs(l.a.x - 300) < 1e-6 && Math.abs(l.b.x - 300) < 1e-6);
    expect(party?.halfT).toBeCloseTo(5, 9);
    expect(lines.filter((l) => Math.abs(l.halfT - 12.5) < 1e-9).length).toBe(4);
  });
});
