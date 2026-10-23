import { describe, expect, it } from "vitest";
import { easeInOut, faceDirection, fitDistance, homeView, presetView } from "./cameraViews";

const project = (pose: ReturnType<typeof homeView>, p: { x: number; y: number; z: number }, fov: number, aspect: number) => {
  const f = { x: pose.target.x - pose.position.x, y: pose.target.y - pose.position.y, z: pose.target.z - pose.position.z };
  const fl = Math.hypot(f.x, f.y, f.z);
  f.x /= fl;
  f.y /= fl;
  f.z /= fl;
  const rl = Math.hypot(f.x, f.z);
  const right = { x: -f.z / rl, y: 0, z: f.x / rl };
  const up = { x: right.y * f.z - right.z * f.y, y: right.z * f.x - right.x * f.z, z: right.x * f.y - right.y * f.x };
  const d = { x: p.x - pose.position.x, y: p.y - pose.position.y, z: p.z - pose.position.z };
  const depth = d.x * f.x + d.y * f.y + d.z * f.z;
  const t = Math.tan((fov * Math.PI) / 360);
  return {
    nx: (d.x * right.x + d.z * right.z) / (depth * t * aspect),
    ny: Math.abs(d.x * up.x + d.y * up.y + d.z * up.z) / (depth * t),
  };
};

describe("homeView", () => {
  const box = { x0: -5, x1: 15, y0: -8, y1: 20, height: 8 };
  for (const aspect of [0.6, 1.6, 2.4]) {
    it(`fits every corner at aspect ${aspect}`, () => {
      const pose = homeView(box, 45, aspect);
      let worst = 0;
      for (const x of [box.x0, box.x1])
        for (const z of [box.y0, box.y1])
          for (const y of [0, box.height]) {
            const { nx, ny } = project(pose, { x, y, z }, 45, aspect);
            worst = Math.max(worst, Math.abs(nx), Math.abs(ny));
            expect(Math.abs(nx)).toBeLessThanOrEqual(1);
            expect(ny).toBeLessThanOrEqual(1);
          }
      expect(worst).toBeGreaterThan(0.8);
    });
  }
  it("looks from the front-right, above", () => {
    const pose = homeView(box, 45, 1.6);
    expect(pose.position.x).toBeGreaterThan(pose.target.x);
    expect(pose.position.z).toBeGreaterThan(pose.target.z);
    expect(pose.position.y).toBeGreaterThan(pose.target.y);
  });
});

describe("fitDistance", () => {
  it("is larger for a narrow canvas and more margin", () => {
    expect(fitDistance(10, 45, 0.5, 0.1)).toBeGreaterThan(fitDistance(10, 45, 2, 0.1));
    expect(fitDistance(10, 45, 1, 0.2)).toBeGreaterThan(fitDistance(10, 45, 1, 0.1));
  });
});

describe("presetView", () => {
  const bounds = { x0: 0, x1: 10, y0: 0, y1: 8 };
  const centre = { x: 5, y: 1, z: 4 };
  const lens = { height: 7, fovDeg: 45, aspect: 1.5 };
  const tanV = Math.tan((22.5 * Math.PI) / 180);
  it("stands at eye level, aims at half the height and fits the house", () => {
    const front = presetView("front", bounds, 10, centre, lens);
    expect(front.position.y).toBe(1.7);
    expect(front.target).toEqual({ x: 5, y: 3.5, z: 4 });
    // Whichever of the 7 m height and 10 m width needs more room.
    const d = Math.max((3.5 / tanV) * 1.15, (5 / (tanV * 1.5)) * 1.15);
    expect(front.position.z).toBeCloseTo(8 + d);
    expect(presetView("rear", bounds, 10, centre, lens).position.z).toBeCloseTo(-d);
    // Side views fit the 8 m depth.
    const side = Math.max((3.5 / tanV) * 1.15, (4 / (tanV * 1.5)) * 1.15);
    expect(presetView("left", bounds, 10, centre, lens).position.x).toBeCloseTo(-side);
    expect(presetView("right", bounds, 10, centre, lens).position.x).toBeCloseTo(10 + side);
  });
  it("is much closer than the old 1.6 × size street view", () => {
    expect(presetView("front", bounds, 10, centre, lens).position.z - 8).toBeLessThan(16);
  });
  it("keeps the plan view", () => {
    expect(presetView("top", bounds, 10, centre, lens).position.y).toBe(22);
    expect(presetView("top", bounds, 10, centre, lens).target).toEqual({ x: 5, y: 1.6, z: 4 });
  });
});

describe("faceDirection and easing", () => {
  it("puts the side facing the camera at the bottom", () => {
    expect(faceDirection(0, 0).y).toBeCloseTo(1);
    expect(faceDirection(90, 90).y).toBeCloseTo(1);
    expect(faceDirection(90, 0).x).toBeCloseTo(1);
    expect(faceDirection(0, 90).x).toBeCloseTo(-1);
  });
  it("eases from 0 to 1", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5);
    expect(easeInOut(0.25)).toBeLessThan(0.25);
  });
});
