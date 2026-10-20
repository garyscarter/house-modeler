import { describe, expect, it } from "vitest";
import { effectiveSlope, slopeGradient, slopeHeight, surfaceHeightAt } from "./surfaceSlope";

// A drive 3 m wide running from the pavement (y 5.5) back to the garage (y 1.5).
const drive = [
  { x: 0, y: 1.5 },
  { x: 3, y: 1.5 },
  { x: 3, y: 5.5 },
  { x: 0, y: 5.5 },
];

describe("slopeHeight", () => {
  it("is zero for a flat surface", () => {
    expect(slopeHeight(drive, undefined, { x: 1, y: 3 })).toBe(0);
    expect(slopeHeight(drive, { toward: "back", rise: 0 }, { x: 1, y: 3 })).toBe(0);
  });

  it("climbs from ground level at the street to the rise at the back", () => {
    const s = { toward: "back" as const, rise: 0.2 };
    expect(slopeHeight(drive, s, { x: 1, y: 5.5 })).toBeCloseTo(0, 9);
    expect(slopeHeight(drive, s, { x: 1, y: 1.5 })).toBeCloseTo(0.2, 9);
    expect(slopeHeight(drive, s, { x: 2.5, y: 3.5 })).toBeCloseTo(0.1, 9);
  });

  it("does not depend on the cross position for a slope along y", () => {
    const s = { toward: "back" as const, rise: 0.2 };
    expect(slopeHeight(drive, s, { x: 0, y: 4 })).toBeCloseTo(slopeHeight(drive, s, { x: 3, y: 4 }), 9);
  });

  it("climbs the other ways", () => {
    expect(slopeHeight(drive, { toward: "front", rise: 0.3 }, { x: 1, y: 5.5 })).toBeCloseTo(0.3, 9);
    expect(slopeHeight(drive, { toward: "right", rise: 0.3 }, { x: 3, y: 3 })).toBeCloseTo(0.3, 9);
    expect(slopeHeight(drive, { toward: "left", rise: 0.3 }, { x: 3, y: 3 })).toBeCloseTo(0, 9);
  });

  it("adds the base height, and a zero rise with a base is a flat raised surface", () => {
    expect(slopeHeight(drive, { toward: "back", rise: 0.1, base: 0.05 }, { x: 1, y: 5.5 })).toBeCloseTo(0.05, 9);
    expect(slopeHeight(drive, { toward: "back", rise: 0.1, base: 0.05 }, { x: 1, y: 1.5 })).toBeCloseTo(0.15, 9);
    expect(slopeHeight(drive, { toward: "back", rise: 0, base: 0.13 }, { x: 1, y: 3 })).toBeCloseTo(0.13, 9);
  });

  it("clamps outside the surface's extent", () => {
    const s = { toward: "back" as const, rise: 0.2 };
    expect(slopeHeight(drive, s, { x: 1, y: 0 })).toBeCloseTo(0.2, 9);
    expect(slopeHeight(drive, s, { x: 1, y: 9 })).toBeCloseTo(0, 9);
  });

  it("uses the polygon's extent, not its shape", () => {
    const tri = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 0, y: 4 },
    ];
    expect(slopeHeight(tri, { toward: "front", rise: 0.4 }, { x: 0, y: 4 })).toBeCloseTo(0.4, 9);
    expect(slopeHeight(tri, { toward: "front", rise: 0.4 }, { x: 4, y: 0 })).toBeCloseTo(0, 9);
  });

  it("copes with degenerate polygons", () => {
    expect(slopeHeight([], { toward: "back", rise: 1, base: 0.2 }, { x: 0, y: 0 })).toBeCloseTo(0.2, 9);
    const line = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];
    expect(slopeHeight(line, { toward: "back", rise: 1 }, { x: 0, y: 0 })).toBe(0);
  });
});

describe("surface helpers", () => {
  it("surfaceHeightAt reads the surface's own slope", () => {
    const s = { polygon: drive, slope: { toward: "back" as const, rise: 0.2 } };
    expect(surfaceHeightAt(s, { x: 1, y: 3.5 })).toBeCloseTo(0.1, 9);
    expect(surfaceHeightAt({ polygon: drive }, { x: 1, y: 3.5 })).toBe(0);
  });

  it("slopeGradient is rise over run", () => {
    expect(slopeGradient(drive, { toward: "back", rise: 0.2 })).toBeCloseTo(0.05, 9);
    expect(slopeGradient(drive, { toward: "right", rise: 0.3 })).toBeCloseTo(0.1, 9);
    expect(slopeGradient(drive, undefined)).toBe(0);
  });

  it("effectiveSlope drops a slope that does nothing", () => {
    expect(effectiveSlope({ toward: "back", rise: 0 })).toBeUndefined();
    expect(effectiveSlope({ toward: "back", rise: 0.1 })).toEqual({ toward: "back", rise: 0.1, base: 0 });
    expect(effectiveSlope({ toward: "back", rise: Number.NaN })).toBeUndefined();
  });
});
