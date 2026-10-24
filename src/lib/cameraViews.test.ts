import { describe, expect, it } from "vitest";
import { easeInOut, faceDirection, fitDistance, frameFor, homeView, isValidPose, poseFits, presetView, type CameraPose } from "./cameraViews";
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

describe("homeView with the inspector card open", () => {
  const box = { x0: -5, x1: 15, y0: -8, y1: 20, height: 8 };
  it("pitches down about 35 degrees", () => {
    const pose = homeView(box, 45, 1.6);
    const dy = pose.position.y - pose.target.y;
    const dh = Math.hypot(pose.position.x - pose.target.x, pose.position.z - pose.target.z);
    expect((Math.atan2(dy, dh) * 180) / Math.PI).toBeCloseTo(35, 5);
  });
  it("centres the box in the strip left of the card and keeps it in frame", () => {
    const W = 1400;
    const H = 875;
    const pose = homeView(box, 45, W / H, 35, 35, 0.15, 344, W);
    const centre = { x: (box.x0 + box.x1) / 2, y: box.height / 2, z: (box.y0 + box.y1) / 2 };
    const c = project(pose, centre, 45, W / H);
    // nx is |.| in y only; x sign is checked via the corners' extent below.
    let minX = Infinity;
    let maxX = -Infinity;
    for (const x of [box.x0, box.x1])
      for (const z of [box.y0, box.y1])
        for (const y of [0, box.height]) {
          const f = { x: pose.target.x - pose.position.x, y: pose.target.y - pose.position.y, z: pose.target.z - pose.position.z };
          const rl = Math.hypot(f.x, f.z);
          const right = { x: -f.z / rl, z: f.x / rl };
          const d = { x: x - pose.position.x, y: y - pose.position.y, z: z - pose.position.z };
          const depth = (d.x * f.x + d.y * f.y + d.z * f.z) / Math.hypot(f.x, f.y, f.z);
          const nx = (d.x * right.x + d.z * right.z) / (depth * Math.tan((45 * Math.PI) / 360) * (W / H));
          minX = Math.min(minX, nx);
          maxX = Math.max(maxX, nx);
        }
    expect(c.ny).toBeLessThan(1);
    const px = (n: number) => ((n + 1) / 2) * W;
    expect(px(minX)).toBeGreaterThanOrEqual(0);
    expect(px(maxX)).toBeLessThanOrEqual(W - 344 + 1);
    expect((px(minX) + px(maxX)) / 2).toBeLessThan(W / 2 - 100);
  });
  it("is unchanged without an inset", () => {
    expect(homeView(box, 45, 1.6, 35, 35, 0.15, 0, 1400)).toEqual(homeView(box, 45, 1.6));
  });

  it("a bottom inset for the dock lifts the box and backs the camera off", () => {
    const box = { x0: -5, x1: 5, y0: -4, y1: 4, height: 6 };
    const plain = homeView(box, 45, 1.6, 35, 35, 0.15, 0, 1280);
    const docked = homeView(box, 45, 1.6, 35, 35, 0.15, 0, 1280, 88, 800);
    const dist = (p: CameraPose) => Math.hypot(p.position.x - p.target.x, p.position.y - p.target.y, p.position.z - p.target.z);
    expect(dist(docked)).toBeGreaterThan(dist(plain));
    // The target moves down the screen's up axis, which for a 35° pitch is mostly -y and a little toward the camera.
    expect(docked.target.y).toBeLessThan(plain.target.y);
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

describe("frameFor", () => {
  const img = "data:,";
  const A = listing91770873(img);
  const B = listing91770873Proposed(img);
  const plot = listingSite().boundary;

  it("contains each model's own box", () => {
    const u = frameFor([A, B]);
    for (const m of [A, B]) {
      const f = frameFor([m]);
      expect(u.x0).toBeLessThanOrEqual(f.x0);
      expect(u.x1).toBeGreaterThanOrEqual(f.x1);
      expect(u.y0).toBeLessThanOrEqual(f.y0);
      expect(u.y1).toBeGreaterThanOrEqual(f.y1);
      expect(u.height).toBeGreaterThanOrEqual(f.height);
    }
  });
  it("frames the houses, not the plot", () => {
    const u = frameFor([A, B]);
    expect(u.x0).toBeGreaterThan(Math.min(...plot.map((p) => p.x)));
    expect(u.y1).toBeLessThan(Math.max(...plot.map((p) => p.y)));
  });
  it("gives the listing's two layouts one pose whichever is active", () => {
    const one = homeView(frameFor([A, B]), 45, 1.6);
    const two = homeView(frameFor([B, A]), 45, 1.6);
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

describe("poseFits", () => {
  const box = { x0: 0, x1: 10, y0: 0, y1: 20, height: 9 };
  const at = (t: { x: number; y: number; z: number }, d = 30) => ({ position: { x: t.x + d, y: t.y + d / 2, z: t.z }, target: t });
  it("accepts the home view and a pose panned a little off the plot", () => {
    expect(poseFits(homeView(box, 45, 1.6), box, 120)).toBe(true);
    expect(poseFits(at({ x: -4, y: 1, z: 22 }), box, 120)).toBe(true);
  });
  it("rejects invalid poses, poses aimed at another house's plot and poses beyond the zoom limit", () => {
    expect(poseFits({ position: { x: 1, y: 1, z: 1 } }, box, 120)).toBe(false);
    expect(poseFits(at({ x: 200, y: 1, z: 5 }), box, 120)).toBe(false);
    expect(poseFits(at({ x: 5, y: 1, z: -40 }), box, 120)).toBe(false);
    expect(poseFits(at({ x: 5, y: 1, z: 5 }, 200), box, 120)).toBe(false);
  });
  it("accepts the listing's home view for both layouts", () => {
    const f = frameFor([listing91770873("data:,"), listing91770873Proposed("data:,")]);
    expect(poseFits(homeView(f, 45, 1.6), f, 60)).toBe(true);
  });
});
