import { describe, expect, it } from "vitest";
import { isClick, isSloped, legCorner, measure, measureLabel, snapToVertex } from "./measure3d";

describe("measure", () => {
  it("splits a sloped line into level and plumb parts", () => {
    const m = measure({ x: 0, y: 1, z: 0 }, { x: 3, y: 5, z: 4 });
    expect(m.horizontal).toBeCloseTo(5);
    expect(m.vertical).toBeCloseTo(4);
    expect(m.distance).toBeCloseTo(Math.hypot(5, 4));
    expect(m.slope).toBeCloseTo((Math.atan2(4, 5) * 180) / Math.PI);
  });
  it("has a positive vertical part whichever end is higher", () => {
    expect(measure({ x: 0, y: 3, z: 0 }, { x: 0, y: 1, z: 0 }).vertical).toBeCloseTo(2);
  });
  it("is zero for the same point", () => {
    expect(measure({ x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: 1 })).toEqual({ distance: 0, horizontal: 0, vertical: 0, slope: 0 });
  });
});

describe("measureLabel", () => {
  it("shows only the length for a level line", () => {
    expect(measureLabel(measure({ x: 0, y: 0, z: 0 }, { x: 3.456, y: 0.002, z: 0 }))).toEqual({ main: "3.46 m", parts: null });
  });
  it("shows only the length for a plumb line", () => {
    const m = measure({ x: 0, y: 0, z: 0 }, { x: 0, y: 2.1, z: 0 });
    expect(isSloped(m)).toBe(false);
    expect(measureLabel(m).main).toBe("2.10 m");
  });
  it("adds the parts and the slope for a sloped line", () => {
    expect(measureLabel(measure({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }))).toEqual({ main: "5.00 m", parts: "↔ 3.00 m · ↕ 4.00 m · 53°" });
  });
});

describe("legCorner", () => {
  it("sits under the higher end at the lower end's height", () => {
    expect(legCorner({ x: 0, y: 2, z: 0 }, { x: 1, y: 5, z: 3 })).toEqual({ x: 1, y: 2, z: 3 });
    expect(legCorner({ x: 1, y: 5, z: 3 }, { x: 0, y: 2, z: 0 })).toEqual({ x: 1, y: 2, z: 3 });
  });
});

describe("snapToVertex", () => {
  const tri = [0, 0, 0, 1, 0, 0, 0, 1, 0];
  it("snaps to the nearest vertex within the radius", () => {
    expect(snapToVertex({ x: 0.98, y: 0.02, z: 0.01 }, tri)).toEqual({ point: { x: 1, y: 0, z: 0 }, snapped: true });
  });
  it("leaves a point that is not near a vertex", () => {
    expect(snapToVertex({ x: 0.5, y: 0.2, z: 0 }, tri)).toEqual({ point: { x: 0.5, y: 0.2, z: 0 }, snapped: false });
  });
  it("honours the radius", () => {
    expect(snapToVertex({ x: 0.9, y: 0, z: 0 }, tri, { radius: 0.2 }).snapped).toBe(true);
    expect(snapToVertex({ x: 0.9, y: 0, z: 0 }, tri, { radius: 0.05 }).snapped).toBe(false);
  });
  it("searches only the given indices", () => {
    expect(snapToVertex({ x: 0.99, y: 0, z: 0 }, tri, { indices: [0, 2] }).snapped).toBe(false);
  });
  it("takes vertices into world space with the matrix", () => {
    // Translate by (10, 2, -3), column-major.
    const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 2, -3, 1];
    expect(snapToVertex({ x: 11.01, y: 2, z: -3 }, tri, { matrix: m })).toEqual({ point: { x: 11, y: 2, z: -3 }, snapped: true });
  });
});

describe("isClick", () => {
  it("tells a click from a drag", () => {
    expect(isClick({ x: 10, y: 10 }, { x: 13, y: 13 })).toBe(true);
    expect(isClick({ x: 10, y: 10 }, { x: 20, y: 10 })).toBe(false);
  });
});
