import { describe, expect, it } from "vitest";
import type { HouseModel } from "../types";
import { floor, rect } from "./testing";
import { exteriorFaces, siteWalls } from "./siteWalls";

const model = (...floors: ReturnType<typeof floor>[]): HouseModel => ({ floors, ceilingHeight: 2.4, slabThickness: 0.2 });

describe("exteriorFaces", () => {
  it("offsets each side of a single room outward by 0.125 m, corners meeting", () => {
    const [lvl] = exteriorFaces(model(floor([rect("A", 0, 0, 400, 300)])));
    expect(lvl.segments).toHaveLength(4);
    const top = lvl.segments.find((s) => s.n.y < -0.9)!;
    expect(top.a.y).toBeCloseTo(-0.125, 6);
    expect(top.b.y).toBeCloseTo(-0.125, 6);
    expect(Math.min(top.a.x, top.b.x)).toBeCloseTo(-0.125, 6);
    expect(Math.max(top.a.x, top.b.x)).toBeCloseTo(4.125, 6);
    const right = lvl.segments.find((s) => s.n.x > 0.9)!;
    expect(right.a.x).toBeCloseTo(4.125, 6);
    const bottom = lvl.segments.find((s) => s.n.y > 0.9)!;
    expect(bottom.a.y).toBeCloseTo(3.125, 6);
  });

  it("gives no face along the party edge of two adjoining rooms", () => {
    const [lvl] = exteriorFaces(model(floor([rect("A", 0, 0, 300, 400), rect("B", 300, 0, 600, 400)])));
    expect(lvl.segments).toHaveLength(4);
    expect(lvl.segments.some((s) => Math.abs(s.a.x - 3) < 0.2 && Math.abs(s.b.x - 3) < 0.2)).toBe(false);
  });
});

describe("siteWalls", () => {
  it("groups wall polygons by storey", () => {
    const m = model(floor([rect("A", 0, 0, 300, 400)]), floor([rect("U", 0, 0, 300, 400)], [], { level: 1 }));
    const lv = siteWalls(m);
    expect(lv.map((l) => l.level)).toEqual([0, 1]);
    expect(lv[0].walls).toHaveLength(4);
    expect(lv[0].walls[0].thickness).toBeCloseTo(0.25, 9);
  });
});
