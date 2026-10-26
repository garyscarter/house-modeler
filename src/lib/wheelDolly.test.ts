import { describe, expect, it } from "vitest";
import { depthOf, dollyStep } from "./wheelDolly";

const F = { x: 0, y: 0, z: -1 };
const dist = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

describe("depthOf", () => {
  it("measures along the view axis, not the straight line", () => {
    expect(depthOf({ x: 0, y: 0, z: 10 }, F, { x: 3, y: 0, z: 0 })).toBe(10);
    expect(depthOf({ x: 0, y: 0, z: 10 }, F, { x: 0, y: 0, z: 14 })).toBe(-4);
  });
});

describe("dollyStep", () => {
  const cam = { x: 0, y: 0, z: 20 };
  it("moves straight at a point on the view axis by the radius change, and puts the target at the new radius", () => {
    const r = dollyStep(cam, F, F, 20, 2, 1.5, 100);
    expect(r.position).toEqual({ x: 0, y: 0, z: 10 });
    expect(r.target).toEqual({ x: 0, y: 0, z: 0 });
  });
  it("moves along the cursor ray when the point is off axis, keeping the target on the view axis", () => {
    const dir = { x: Math.SQRT1_2, y: 0, z: -Math.SQRT1_2 };
    const r = dollyStep(cam, F, dir, 20, 2, 1.5, 100);
    expect(r.position.x).toBeCloseTo(10 * Math.SQRT1_2);
    expect(r.position.z).toBeCloseTo(20 - 10 * Math.SQRT1_2);
    expect(r.target).toEqual({ x: r.position.x, y: 0, z: r.position.z - 10 });
  });
  it("stops minDistance short of what is under the cursor, however many steps follow", () => {
    let p = cam;
    for (let i = 0; i < 50; i++) p = dollyStep(p, F, F, depthOf(p, F, { x: 0, y: 0, z: 0 }), 1.2, 1.5, 100).position;
    expect(p.z).toBeCloseTo(1.5);
  });
  it("zooms out from a point by the same factor, no further than maxDistance", () => {
    expect(dollyStep(cam, F, F, 20, 0.5, 1.5, 100).position.z).toBeCloseTo(40);
    expect(dollyStep(cam, F, F, 20, 0.1, 1.5, 60).position.z).toBeCloseTo(60);
  });
  it("closer than minDistance already: zooming in holds still and zooming out backs away", () => {
    const near = dollyStep(cam, F, F, 0.5, 1.2, 1.5, 100);
    expect(near.position).toEqual(cam);
    expect(dist(near.position, near.target)).toBeCloseTo(1.5);
    const out = dollyStep(cam, F, F, 0.5, 1 / 1.2, 1.5, 100);
    expect(out.position.z).toBeCloseTo(20 + 1.5 * 0.2);
  });
  it("treats a point beyond maxDistance, or none, as maxDistance away", () => {
    expect(dollyStep(cam, F, F, 500, 2, 1.5, 60).position.z).toBeCloseTo(20 - 30);
    expect(dollyStep(cam, F, F, NaN, 2, 1.5, 60).position).toEqual(cam);
  });
});
