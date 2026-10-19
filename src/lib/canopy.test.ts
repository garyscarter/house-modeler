import { describe, expect, it } from "vitest";
import { addCanopy, canopyAt, canopySize, moveCanopy, moveCanopyCorner, rectPolygon, removeCanopy, resizeCanopy, snapShift } from "./canopy";
import { planRoofs } from "./roof";
import { floor, rect } from "./testing";
import type { HouseModel, Pt } from "../types";

// 100 px per metre, so coordinates read as centimetres.
const porch = rectPolygon({ x: 100, y: 200 }, { x: 300, y: 300 });
const other = rectPolygon({ x: 500, y: 200 }, { x: 600, y: 300 });
const tri: Pt[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 0, y: 100 },
];

describe("canopy hit-testing", () => {
  it("finds the canopy under a point, or -1", () => {
    expect(canopyAt([porch, other], { x: 150, y: 250 })).toBe(0);
    expect(canopyAt([porch, other], { x: 550, y: 250 })).toBe(1);
    expect(canopyAt([porch, other], { x: 400, y: 250 })).toBe(-1);
    expect(canopyAt([], { x: 1, y: 1 })).toBe(-1);
  });

  it("prefers the one drawn last where two overlap", () => {
    const over = rectPolygon({ x: 200, y: 250 }, { x: 400, y: 350 });
    expect(canopyAt([porch, over], { x: 250, y: 275 })).toBe(1);
  });
});

describe("adding and removing", () => {
  it("adds a rectangle whichever way the corners are given", () => {
    const next = addCanopy([porch], { x: 50, y: 80 }, { x: 10, y: 20 });
    expect(next).toHaveLength(2);
    expect(next[1]).toEqual(rectPolygon({ x: 10, y: 20 }, { x: 50, y: 80 }));
    expect(canopySize(next[1])).toEqual({ w: 40, h: 60 });
  });

  it("ignores a flat sliver", () => {
    const list = [porch];
    expect(addCanopy(list, { x: 0, y: 0 }, { x: 100, y: 0.2 })).toBe(list);
  });

  it("removes one by index and leaves the others", () => {
    expect(removeCanopy([porch, other], 0)).toEqual([other]);
    expect(removeCanopy([porch], 0)).toEqual([]);
    const list = [porch];
    expect(removeCanopy(list, 3)).toBe(list);
  });
});

describe("moving and resizing", () => {
  it("moves a whole canopy without touching the input", () => {
    const list = [porch, other];
    const next = moveCanopy(list, 0, 10, -20);
    expect(next[0][0]).toEqual({ x: 110, y: 180 });
    expect(next[1]).toBe(other);
    expect(list[0][0]).toEqual({ x: 100, y: 200 });
  });

  it("drags a corner of a rectangle and keeps it a rectangle", () => {
    // Bottom-right corner out to (400, 350): the other three follow the shared edges.
    const next = moveCanopyCorner([porch], 0, 2, { x: 400, y: 350 })[0];
    expect(next).toEqual(rectPolygon({ x: 100, y: 200 }, { x: 400, y: 350 }));
    const tl = moveCanopyCorner([porch], 0, 0, { x: 150, y: 220 })[0];
    expect(tl).toEqual(rectPolygon({ x: 150, y: 220 }, { x: 300, y: 300 }));
  });

  it("stops a dragged corner short of the opposite side", () => {
    const next = moveCanopyCorner([porch], 0, 0, { x: 900, y: 900 })[0];
    const s = canopySize(next)!;
    expect(s.w).toBeGreaterThan(0);
    expect(s.h).toBeGreaterThan(0);
  });

  it("moves a single corner of a non-rectangular canopy", () => {
    const next = moveCanopyCorner([tri], 0, 1, { x: 120, y: 10 })[0];
    expect(next).toEqual([tri[0], { x: 120, y: 10 }, tri[2]]);
  });

  it("resizes to a width and depth about a fixed corner", () => {
    const tl = resizeCanopy([porch], 0, 100, 50, "tl")[0];
    expect(tl).toEqual(rectPolygon({ x: 100, y: 200 }, { x: 200, y: 250 }));
    const br = resizeCanopy([porch], 0, 100, 50, "br")[0];
    expect(br).toEqual(rectPolygon({ x: 200, y: 250 }, { x: 300, y: 300 }));
  });

  it("leaves a non-rectangular canopy and bad sizes alone", () => {
    expect(resizeCanopy([tri], 0, 50, 50, "tl")[0]).toBe(tri);
    expect(resizeCanopy([porch], 0, 0, 50, "tl")[0]).toBe(porch);
    expect(canopySize(tri)).toBeNull();
  });
});

describe("snapping a move", () => {
  const targets: Pt[] = [{ x: 500, y: 300 }];
  it("pulls a corner onto a nearby target", () => {
    // The bottom-right corner (300, 300) shifted by 195 lands 5 px from the target.
    expect(snapShift(porch, 195, 2, targets, 10)).toEqual({ dx: 200, dy: 0 });
  });
  it("leaves the move alone when nothing is near", () => {
    expect(snapShift(porch, 50, 50, targets, 10)).toEqual({ dx: 50, dy: 50 });
  });
});

describe("roofs follow the canopies", () => {
  const model = (canopies: Pt[][] | undefined): HouseModel =>
    ({
      name: "t",
      ceilingHeight: 2.4,
      slabThickness: 0.2,
      floors: [floor([rect("a", 0, 0, 400, 300)], [], { canopies })],
    }) as unknown as HouseModel;
  const wideCanopy = rectPolygon({ x: 0, y: 300 }, { x: 300, y: 450 });
  const area = (p: ReturnType<typeof planRoofs>) => p.flats.reduce((s, r) => s + (r.x1 - r.x0) * (r.z1 - r.z0), 0);

  it("shrinks the roof and pillars when narrowed", () => {
    const wide = planRoofs(model([wideCanopy]));
    const narrow = planRoofs(model(resizeCanopy([wideCanopy], 0, 150, 150, "tl")));
    expect(wide.pillars.length).toBeGreaterThan(0);
    expect(area(narrow)).toBeLessThan(area(wide));
  });

  it("leaves no canopy geometry when the only canopy is deleted", () => {
    for (const none of [removeCanopy([wideCanopy], 0), undefined]) {
      const p = planRoofs(model(none));
      expect(p.pillars).toEqual([]);
      expect(p.leanTos).toEqual([]);
    }
  });
});
