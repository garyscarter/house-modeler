import { describe, expect, it } from "vitest";
import { dragLook, followStep, isTap, keyIntent, keyMove, lookSweep, NO_KEYS, RUN_SPEED, WALK_SPEED, wrapAngle } from "./walkMotion";
import { PITCH_MAX, type WalkPose, type WalkRoute } from "./walkTypes";

const pose = (over: Partial<WalkPose> = {}): WalkPose => ({ x: 0, y: 0, level: 0, stair: null, feetY: 0, yaw: 0, pitch: 0, ...over });

describe("keys", () => {
  it("maps codes", () => {
    expect(keyIntent("KeyW")).toBe("forward");
    expect(keyIntent("ArrowDown")).toBe("back");
    expect(keyIntent("KeyA")).toBe("left");
    expect(keyIntent("KeyD")).toBe("right");
    expect(keyIntent("KeyQ")).toBe("turnLeft");
    expect(keyIntent("ArrowRight")).toBe("turnRight");
    expect(keyIntent("ShiftLeft")).toBe("fast");
    expect(keyIntent("Digit1")).toBeNull();
  });
  it("forward at yaw 0 goes to -z; strafe right goes +x", () => {
    const f = keyMove({ ...NO_KEYS, forward: true }, 0, 1);
    expect(f.dx).toBeCloseTo(0);
    expect(f.dy).toBeCloseTo(-WALK_SPEED);
    const r = keyMove({ ...NO_KEYS, right: true }, 0, 1);
    expect(r.dx).toBeCloseTo(WALK_SPEED);
    expect(r.dy).toBeCloseTo(0);
  });
  it("turned left 90 degrees, forward goes -x", () => {
    const m = keyMove({ ...NO_KEYS, forward: true }, Math.PI / 2, 1);
    expect(m.dx).toBeCloseTo(-WALK_SPEED);
  });
  it("diagonals are no faster; shift runs; opposite keys cancel", () => {
    const d = keyMove({ ...NO_KEYS, forward: true, right: true }, 0.7, 1);
    expect(Math.hypot(d.dx, d.dy)).toBeCloseTo(WALK_SPEED);
    const r = keyMove({ ...NO_KEYS, forward: true, fast: true }, 0, 1);
    expect(Math.hypot(r.dx, r.dy)).toBeCloseTo(RUN_SPEED);
    expect(keyMove({ ...NO_KEYS, forward: true, back: true }, 0, 1)).toEqual({ dx: 0, dy: 0, dyaw: 0 });
  });
  it("turning left raises yaw", () => {
    expect(keyMove({ ...NO_KEYS, turnLeft: true }, 0, 1).dyaw).toBeGreaterThan(0);
    expect(keyMove({ ...NO_KEYS, turnRight: true }, 0, 1).dyaw).toBeLessThan(0);
  });
});

describe("wrapAngle", () => {
  it("wraps into (-pi, pi]", () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-3.5 * Math.PI)).toBeCloseTo(0.5 * Math.PI);
    expect(wrapAngle(0.3)).toBeCloseTo(0.3);
  });
});

describe("followStep", () => {
  const route: WalkRoute = { points: [{ x: 0, y: -1, level: 0, stair: null }, { x: 1, y: -1, level: 0, stair: null }], doors: [] };
  it("heads for the next point at route speed and turns towards it", () => {
    const s = followStep(pose({ yaw: 1 }), route, 0, 0.1);
    expect(s.done).toBe(false);
    expect(s.dy).toBeLessThan(0);
    expect(Math.abs(s.dx)).toBeLessThan(1e-9);
    expect(Math.abs(s.yaw)).toBeLessThan(1);
  });
  it("reaches done", () => {
    let p = pose();
    let index = 0;
    let done = false;
    for (let i = 0; i < 400 && !done; i++) {
      const s = followStep(p, route, index, 1 / 30);
      p = { ...p, x: p.x + s.dx, y: p.y + s.dy, yaw: s.yaw };
      index = s.index;
      done = s.done;
    }
    expect(done).toBe(true);
    expect(Math.hypot(p.x - 1, p.y + 1)).toBeLessThan(0.16);
  });
  it("never overshoots a point", () => {
    const s = followStep(pose({ y: -0.9 }), route, 0, 1);
    expect(pose().y + s.dy).toBeGreaterThanOrEqual(-1 - 1e-9);
  });
  it("an empty route is done", () => {
    expect(followStep(pose(), { points: [], doors: [] }, 0, 0.1).done).toBe(true);
  });
});

describe("lookSweep", () => {
  it("swings 50 degrees either side over 4 s", () => {
    expect(lookSweep(1, 0)).toBeCloseTo(1);
    expect(lookSweep(1, 1) - 1).toBeCloseTo((50 * Math.PI) / 180);
    expect(lookSweep(1, 3) - 1).toBeCloseTo(-(50 * Math.PI) / 180);
    expect(lookSweep(1, 4)).toBeCloseTo(1);
  });
});

describe("dragLook", () => {
  const fov = Math.PI / 3;
  it("dragging right turns left, down looks up", () => {
    const r = dragLook(0, 0, 100, 0, fov, 800);
    expect(r.yaw).toBeGreaterThan(0);
    expect(dragLook(0, 0, 0, 100, fov, 800).pitch).toBeGreaterThan(0);
  });
  it("a drag the canvas height turns by the vertical FOV", () => {
    expect(dragLook(0, 0, 0, 800, fov, 800).pitch).toBeCloseTo(fov);
  });
  it("clamps pitch and wraps yaw", () => {
    expect(dragLook(0, 0, 0, 5000, fov, 800).pitch).toBe(PITCH_MAX);
    expect(dragLook(0, 0, 0, -5000, fov, 800).pitch).toBe(-PITCH_MAX);
    expect(Math.abs(dragLook(3, 0, 5000, 0, fov, 800).yaw)).toBeLessThanOrEqual(Math.PI);
  });
});

describe("isTap", () => {
  it("is short and still", () => {
    expect(isTap({ x: 0, y: 0, t: 0 }, { x: 3, y: 2, t: 200 })).toBe(true);
    expect(isTap({ x: 0, y: 0, t: 0 }, { x: 9, y: 0, t: 200 })).toBe(false);
    expect(isTap({ x: 0, y: 0, t: 0 }, { x: 0, y: 0, t: 600 })).toBe(false);
  });
});
