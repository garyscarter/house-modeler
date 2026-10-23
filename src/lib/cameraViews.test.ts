import { describe, expect, it } from "vitest";
import { easeInOut, faceDirection, fitDistance, frameFor, homeView, isValidPose, presetView } from "./cameraViews";
import { listing91770873, listing91770873Proposed, listingSite } from "./houses/listing91770873";

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
  it("matches the elevation positions", () => {
    expect(presetView("front", bounds, 10, centre).position).toEqual({ x: 5, y: 2.2, z: 24 });
    expect(presetView("rear", bounds, 10, centre).position).toEqual({ x: 5, y: 2.2, z: -16 });
    expect(presetView("left", bounds, 10, centre).position).toEqual({ x: -16, y: 2.2, z: 4 });
    expect(presetView("right", bounds, 10, centre).position).toEqual({ x: 26, y: 2.2, z: 4 });
    expect(presetView("top", bounds, 10, centre).position.y).toBe(22);
    expect(presetView("top", bounds, 10, centre).target).toEqual({ x: 5, y: 1.6, z: 4 });
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

describe("frameFor", () => {
  const img = "data:,";
  const A = listing91770873(img);
  const B = listing91770873Proposed(img);
  const plot = listingSite().boundary;

  it("contains each model's own box", () => {
    const u = frameFor([A, B], [plot]);
    for (const m of [A, B]) {
      const f = frameFor([m], []);
      expect(u.x0).toBeLessThanOrEqual(f.x0);
      expect(u.x1).toBeGreaterThanOrEqual(f.x1);
      expect(u.y0).toBeLessThanOrEqual(f.y0);
      expect(u.y1).toBeGreaterThanOrEqual(f.y1);
      expect(u.height).toBeGreaterThanOrEqual(f.height);
    }
  });
  it("includes plot points", () => {
    const u = frameFor([A], [[{ x: -50, y: -60 }, { x: 70, y: 80 }]]);
    expect(u.x0).toBe(-50);
    expect(u.y1).toBe(80);
  });
  it("gives the listing's two layouts one pose whichever is active", () => {
    const one = homeView(frameFor([A, B], [plot, plot]), 45, 1.6);
    const two = homeView(frameFor([B, A], [plot, plot]), 45, 1.6);
    expect(two).toEqual(one);
  });
});

describe("isValidPose", () => {
  const ok = { position: { x: 1, y: 2, z: 3 }, target: { x: 0, y: 0, z: 0 } };
  it("accepts a good pose", () => expect(isValidPose(ok)).toBe(true));
  it("rejects non-finite, missing and degenerate poses", () => {
    expect(isValidPose({ ...ok, position: { x: NaN, y: 0, z: 0 } })).toBe(false);
    expect(isValidPose({ position: ok.position })).toBe(false);
    expect(isValidPose(null)).toBe(false);
    expect(isValidPose({ position: ok.target, target: ok.target })).toBe(false);
  });
});
