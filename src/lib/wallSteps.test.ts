import { describe, expect, it } from "vitest";
import type { SiteSurface } from "../types";
import { listingSite } from "./houses/listing91770873";
import { edgesOf } from "./site";
import { circleControls } from "./surfaceCurve";
import { COURSE, boundaryWallSegments, groundAlong, groundAt, resolveFollow, wallAt, wallSegments, type GroundSample } from "./wallSteps";

/** Ground climbing steadily from 0 to `rise` over `len`, the same on both sides... except the far side, which stays at 0. */
function ramp(len: number, rise: number, n = 60): GroundSample[] {
  return Array.from({ length: n + 1 }, (_, k) => ({ d: (k * len) / n, plot: (rise * k) / n, low: 0 }));
}
const flat = (len: number, h = 0): GroundSample[] => [
  { d: 0, plot: h, low: h },
  { d: len, plot: h, low: h },
];

describe("wallSegments", () => {
  it("level is today's wall: one run from ground level to the height", () => {
    expect(wallSegments(3, 1, "level", ramp(3, 0.3))).toEqual([{ start: 0, end: 3, base: 0, top: 1, baseEnd: 0, topEnd: 1 }]);
  });

  it("steps up a whole course each time the ground has climbed one, back to full height above it", () => {
    // 0.3 m over 6 m: a course every 1.5 m.
    const segs = wallSegments(6, 1, "step", ramp(6, 0.3));
    expect(segs.map((s) => +s.start.toFixed(3))).toEqual([0, 1.5, 3, 4.5]);
    segs.forEach((s, k) => {
      expect(s.top).toBeCloseTo(1 + k * COURSE, 9);
      expect(s.topEnd).toBe(s.top);
      // The ground at the start of each run (the higher side of its step) is a whole course up.
      expect(s.top - (0.3 * s.start) / 6).toBeCloseTo(1, 6);
      expect(s.base).toBe(0);
    });
    // Contiguous, covering the whole wall.
    expect(segs[0].start).toBe(0);
    expect(segs[segs.length - 1].end).toBe(6);
    for (let k = 1; k < segs.length; k++) expect(segs[k].start).toBe(segs[k - 1].end);
  });

  it("never steps closer than 0.9 m: steep ground gets bigger steps of whole courses", () => {
    // 0.6 m over 3 m: a course every 0.375 m.
    const segs = wallSegments(3, 1, "step", ramp(3, 0.6));
    for (let k = 1; k < segs.length; k++) {
      expect(segs[k].start - segs[k - 1].start).toBeGreaterThanOrEqual(0.9 - 1e-9);
      const rise = (segs[k].top - segs[k - 1].top) / COURSE;
      expect(rise).toBeCloseTo(Math.round(rise), 6);
      expect(rise).toBeGreaterThanOrEqual(1);
    }
    // Never more than a course below full height on the higher side of a step.
    segs.forEach((s) => expect(s.top - (0.6 * s.start) / 3).toBeGreaterThan(1 - COURSE));
  });

  it("doesn't leave a stub shorter than 0.3 m after the last step", () => {
    // A course is reached only 0.1 m before the end.
    const segs = wallSegments(2, 1, "step", ramp(2, COURSE / 0.95));
    expect(segs).toHaveLength(1);
    expect(segs[0].top).toBe(1);
  });

  it("steps down the same way when the ground falls along the edge", () => {
    const up = wallSegments(6, 1, "step", ramp(6, 0.3));
    const down = wallSegments(
      6,
      1,
      "step",
      ramp(6, 0.3).map((g) => ({ ...g, d: 6 - g.d })).reverse(),
    );
    expect(down.map((s) => s.top)).toEqual(up.map((s) => s.top).reverse());
    expect(down.map((s) => +s.end.toFixed(6))).toEqual(up.map((s) => +(6 - s.start).toFixed(6)).reverse());
  });

  it("with stepEvery, makes level runs of that length from the lower end, rounding the step down to whole courses", () => {
    const segs = wallSegments(2.9, 1, "step", ramp(2.9, 0.16), { stepEvery: 2.45 });
    expect(segs).toHaveLength(2);
    expect(segs[1].start).toBeCloseTo(2.45, 9);
    expect(segs[0].top).toBe(1);
    expect(segs[1].top).toBeCloseTo(1 + COURSE, 9);
  });

  it("rakes the top parallel to the ground", () => {
    const segs = wallSegments(4, 1.2, "rake", ramp(4, 0.2));
    expect(segs).toHaveLength(1);
    expect(segs[0].top).toBeCloseTo(1.2, 9);
    expect(segs[0].topEnd).toBeCloseTo(1.4, 9);
    expect(segs[0].base).toBe(0);
  });

  it("stays one level run on flat ground, raised or not", () => {
    expect(wallSegments(3, 1, "step", flat(3))).toEqual([{ start: 0, end: 3, base: 0, top: 1, baseEnd: 0, topEnd: 1 }]);
    expect(wallSegments(3, 1, "step", flat(3, 0.2))).toEqual([{ start: 0, end: 3, base: 0.2, top: 1.2, baseEnd: 0.2, topEnd: 1.2 }]);
  });

  it("reaches down to the lowest ground on either side", () => {
    const g = ramp(3, 0.3).map((s) => ({ ...s, low: s.plot - 0.05 }));
    const segs = wallSegments(3, 1, "step", g);
    segs.forEach((s) => expect(s.base).toBeCloseTo((0.3 * s.start) / 3 - 0.05, 6));
  });
});

describe("wallAt", () => {
  it("gives the higher top and lower base on a step", () => {
    const segs = wallSegments(6, 1, "step", ramp(6, 0.3));
    expect(wallAt(segs, 1.5)?.top).toBeCloseTo(1 + COURSE, 9);
    expect(wallAt(segs, 0.2)?.top).toBe(1);
    expect(wallAt(segs, 7)).toBeNull();
  });
});

describe("ground along a boundary edge", () => {
  // A plot wound anticlockwise in plan, and a drive along its west edge climbing towards the back (-y).
  const plot = [
    { x: 0, y: 0 },
    { x: 0, y: 6 },
    { x: 5, y: 6 },
    { x: 5, y: 0 },
  ];
  const drive: SiteSurface = { id: "d", kind: "drive", polygon: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 6 }, { x: 0, y: 6 }], slope: { toward: "back", rise: 0.3 } };
  const bed: SiteSurface = { id: "b", kind: "bed", polygon: [{ x: 3, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 6 }, { x: 3, y: 6 }], slope: { toward: "back", rise: 0, base: 0.4 } };

  it("reads the plot side's surface, and 0 outside", () => {
    expect(groundAt([drive], { x: 1, y: 3 })).toBeCloseTo(0.15, 9);
    expect(groundAt([drive], { x: -1, y: 3 })).toBe(0);
  });

  it("leaves raised beds out", () => {
    expect(groundAt([bed], { x: 4, y: 3 })).toBe(0);
  });

  it("samples the drive on the inside of the west edge, whichever way the plot is wound", () => {
    const g = groundAlong(plot[0], plot[1], [drive], -1);
    // Edge from y 0 (high, the back) to y 6 (the street).
    expect(g[0].plot).toBeCloseTo(0.3, 2);
    expect(g[g.length - 1].plot).toBeCloseTo(0, 2);
    // Outside the plot there is no surface, so the base goes down to 0.
    g.forEach((s) => expect(s.low).toBe(0));
    const flipped = groundAlong(plot[1], plot[0], [drive], 1);
    expect(flipped[0].plot).toBeCloseTo(0, 2);
  });

  it("defaults a wall beside sloping ground to steps, and everything else to level", () => {
    const g = groundAlong(plot[0], plot[1], [drive], -1);
    expect(resolveFollow({ kind: "wall" }, g)).toBe("step");
    expect(resolveFollow({ kind: "fence" }, g)).toBe("level");
    expect(resolveFollow({ kind: "wall", follow: "level" }, g)).toBe("level");
    expect(resolveFollow({ kind: "wall" }, groundAlong(plot[2], plot[3], [drive, bed], -1))).toBe("level");
  });
});

describe("listing 91770873", () => {
  const site = listingSite();
  const edges = edgesOf(site);
  const segs = (i: number) => boundaryWallSegments(site.boundary, edges[i], i, site.surfaces);

  it("steps the drive wall up one course near the porch pier, as the photos show", () => {
    const s = segs(7);
    expect(s).toHaveLength(2);
    expect(s[0].top).toBeCloseTo(1, 9);
    expect(s[1].top).toBeCloseTo(1 + COURSE, 9);
    // The step falls about half a metre short of the pier end.
    const len = s[1].end;
    expect(len - s[1].start).toBeGreaterThan(0.3);
    expect(len - s[1].start).toBeLessThan(0.7);
    s.forEach((x) => expect(x.base).toBe(0));
  });

  it("keeps every other wall exactly as before: level from the ground", () => {
    edges.forEach((e, i) => {
      if (i === 7 || e.kind === "open") return;
      expect(segs(i)).toEqual([{ start: 0, end: expect.any(Number), base: 0, top: e.height, baseEnd: 0, topEnd: e.height }]);
    });
  });
});

describe("groundAt on a smooth surface", () => {
  it("tests a point against the curve, not the control polygon", () => {
    const patio = { kind: "patio" as const, polygon: circleControls({ x: 0, y: 0 }, 2), slope: { toward: "back" as const, rise: 0, base: 0.2 }, smooth: true };
    // Between two control points the curve bulges out past the octagon's straight edge.
    const p = { x: 1.818, y: 0.753 };
    expect(groundAt([patio], p)).toBeCloseTo(0.2);
    expect(groundAt([{ ...patio, smooth: false }], p)).toBe(0);
  });
});
