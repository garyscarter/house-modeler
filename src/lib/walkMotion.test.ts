import { describe, expect, it } from "vitest";
import { dragLook, followRoute, isTap, keyIntent, keyMove, lookSweep, NO_KEYS, NO_KEY_MOTION, REST_PITCH, ROUTE_SPEED, routeStart, RUN_SPEED, springAngle, stopBeforeDoor, STRAFE_FACTOR, sweepDuration, TURN_RATE, walkFov, WALK_SPEED, wrapAngle, type HeldKeys, type KeyMotion } from "./walkMotion";
import { PITCH_MAX, type WalkPose, type WalkRoute } from "./walkTypes";

const pose = (over: Partial<WalkPose> = {}): WalkPose => ({ x: 0, y: 0, level: 0, stair: null, feetY: 0, yaw: 0, pitch: 0, ...over });

/** Run the keys for `secs` at 30 fps, returning each frame's speed (m/s), turn rate (rad/s) and the final state. */
function runKeys(keys: HeldKeys, secs: number, start: KeyMotion = NO_KEY_MOTION, yaw = 0) {
  let m = start;
  const speeds: number[] = [];
  const turns: number[] = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i < Math.round(secs * 30); i++) {
    const k = keyMove(keys, yaw, 1 / 30, m);
    m = k.motion;
    x += k.dx;
    y += k.dy;
    speeds.push(Math.hypot(k.dx, k.dy) * 30);
    turns.push(k.dyaw * 30);
  }
  return { m, speeds, turns, x, y };
}

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
  it("forward at yaw 0 goes to -z; strafe right goes +x at 0.7 of walking", () => {
    const f = runKeys({ ...NO_KEYS, forward: true }, 2);
    expect(f.x).toBeCloseTo(0);
    expect(f.y).toBeLessThan(-WALK_SPEED * 1.8);
    expect(f.speeds[f.speeds.length - 1]).toBeCloseTo(WALK_SPEED, 1);
    const r = runKeys({ ...NO_KEYS, right: true }, 2);
    expect(r.x).toBeGreaterThan(0);
    expect(r.y).toBeCloseTo(0);
    expect(r.speeds[r.speeds.length - 1]).toBeCloseTo(WALK_SPEED * STRAFE_FACTOR, 1);
  });
  it("turned left 90 degrees, forward goes -x", () => {
    expect(runKeys({ ...NO_KEYS, forward: true }, 1, NO_KEY_MOTION, Math.PI / 2).x).toBeLessThan(-1);
  });
  it("diagonals are no faster; shift runs; opposite keys cancel", () => {
    const d = runKeys({ ...NO_KEYS, forward: true, right: true }, 2, NO_KEY_MOTION, 0.7);
    expect(Math.max(...d.speeds)).toBeLessThanOrEqual(WALK_SPEED + 1e-6);
    const r = runKeys({ ...NO_KEYS, forward: true, fast: true }, 3);
    expect(r.speeds[r.speeds.length - 1]).toBeCloseTo(RUN_SPEED, 1);
    const c = keyMove({ ...NO_KEYS, forward: true, back: true }, 0, 1);
    expect([c.dx, c.dy, c.dyaw]).toEqual([0, 0, 0]);
  });
  it("turning left raises yaw, at up to TURN_RATE", () => {
    const l = runKeys({ ...NO_KEYS, turnLeft: true }, 1);
    expect(l.turns[l.turns.length - 1]).toBeCloseTo(TURN_RATE, 1);
    expect(runKeys({ ...NO_KEYS, turnRight: true }, 1).turns[29]).toBeLessThan(0);
  });
  it("speed ramps up over 0.15-0.3 s and down over 0.1-0.3 s, never instantly", () => {
    const up = runKeys({ ...NO_KEYS, forward: true }, 1);
    const tUp = (up.speeds.findIndex((v) => v >= 0.9 * WALK_SPEED) + 1) / 30;
    expect(tUp).toBeGreaterThanOrEqual(0.15);
    expect(tUp).toBeLessThanOrEqual(0.3);
    expect(up.speeds[0]).toBeLessThan(0.3 * WALK_SPEED);
    const down = runKeys(NO_KEYS, 1, up.m);
    const tDown = (down.speeds.findIndex((v) => v <= 0.1 * WALK_SPEED) + 1) / 30;
    expect(tDown).toBeGreaterThanOrEqual(0.1);
    expect(tDown).toBeLessThanOrEqual(0.3);
    expect(down.speeds[0]).toBeGreaterThan(0.5 * WALK_SPEED);
  });
});

describe("walkFov and springs", () => {
  it("lens: about 51 at 16:10, 47 at 16:9, 60 at 4:3, 78 on a portrait phone", () => {
    // Wide (90° across) by default.
    expect(walkFov(1.6)).toBeCloseTo(64.0, 0);
    expect(walkFov(16 / 9)).toBeCloseTo(58.7, 0);
    expect(walkFov(4 / 3)).toBeCloseTo(73.7, 0);
    expect(walkFov(0.46)).toBe(78);
    expect(walkFov(4)).toBe(45);
    // Natural and extra wide.
    expect(walkFov(1.6, 75)).toBeCloseTo(51.2, 0);
    expect(walkFov(1.6, 100)).toBeCloseTo(73.4, 0);
  });
  it("REST_PITCH is -8 degrees", () => {
    expect(REST_PITCH).toBeCloseTo((-8 * Math.PI) / 180);
  });
  it("springAngle converges without overshooting more than a degree, the short way round", () => {
    for (const [from, to] of [[0, 2], [0, -3], [3, -3], [-3, 3], [0.1, 0.12]]) {
      let a = from;
      let v = 0;
      let worst = 0;
      for (let i = 0; i < 300; i++) {
        const r = springAngle(a, v, to, 1 / 30, 4);
        a = r.angle;
        v = r.vel;
        // Signed distance past the target, in the direction of travel.
        worst = Math.max(worst, wrapAngle(a - to) * Math.sign(wrapAngle(to - from)));
      }
      expect(Math.abs(wrapAngle(a - to))).toBeLessThan(1e-3);
      expect(worst).toBeLessThan((1 * Math.PI) / 180);
    }
    // 3 -> -3 is a short turn through pi: never swings the long way.
    let a = 3;
    let v = 0;
    let minA = a;
    for (let i = 0; i < 60; i++) {
      const r = springAngle(a, v, -3, 1 / 30, 4);
      a = r.angle;
      v = r.vel;
      minA = Math.min(minA, a);
    }
    expect(minA).toBeGreaterThan(2.9);
  });
  it("limits keep the rate and its change small", () => {
    let a = 0;
    let v = 0;
    let prev = 0;
    for (let i = 0; i < 200; i++) {
      const r = springAngle(a, v, 3, 1 / 30, 4, { maxVel: 2, maxAccel: 15 });
      expect(Math.abs(r.vel)).toBeLessThanOrEqual(2 + 1e-9);
      expect(Math.abs(r.vel - prev)).toBeLessThanOrEqual(0.5 + 1e-9);
      prev = r.vel;
      a = r.angle;
      v = r.vel;
    }
    expect(a).toBeGreaterThan(2.9);
  });
});

describe("wrapAngle", () => {
  it("wraps into (-pi, pi]", () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-3.5 * Math.PI)).toBeCloseTo(0.5 * Math.PI);
    expect(wrapAngle(0.3)).toBeCloseTo(0.3);
  });
});

describe("followRoute", () => {
  const pt = (x: number, y: number) => ({ x, y, level: 0, stair: null });
  /** Run a route at 30 fps from a pose; returns per-frame poses and speeds. */
  function run(start: WalkPose, route: WalkRoute, secs = 20) {
    let p = start;
    let rs = routeStart(p, route);
    const m = { yawVel: 0, pitchVel: 0 };
    const frames: { x: number; y: number; yaw: number; speed: number }[] = [];
    let done = false;
    for (let i = 0; i < secs * 30 && !done; i++) {
      const r = followRoute(p, route, rs, m, 1 / 30);
      p = { ...p, x: p.x + r.dx, y: p.y + r.dy, yaw: r.yaw, pitch: r.pitch };
      rs = r.state;
      m.yawVel = r.yawVel;
      m.pitchVel = r.pitchVel;
      frames.push({ x: p.x, y: p.y, yaw: p.yaw, speed: Math.hypot(r.dx, r.dy) * 30 });
      done = r.done;
    }
    return { p, frames, done };
  }
  const bend: WalkRoute = { points: [pt(0, -3), pt(2, -3), pt(2, -5)], doors: [] };

  it("arrives exactly, stopped, never over ROUTE_SPEED", () => {
    const r = run(pose(), bend);
    expect(r.done).toBe(true);
    expect(Math.hypot(r.p.x - 2, r.p.y + 5)).toBeLessThan(0.03);
    expect(Math.max(...r.frames.map((f) => f.speed))).toBeLessThanOrEqual(ROUTE_SPEED + 1e-6);
  });
  it("follows the polyline: never more than 5 cm off it (corners only rounded a hair)", () => {
    const r = run(pose(), bend);
    const segDist = (f: { x: number; y: number }, ax: number, ay: number, bx: number, by: number) => {
      const t = Math.max(0, Math.min(1, ((f.x - ax) * (bx - ax) + (f.y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
      return Math.hypot(f.x - (ax + t * (bx - ax)), f.y - (ay + t * (by - ay)));
    };
    for (const f of r.frames) expect(Math.min(segDist(f, 0, 0, 0, -3), segDist(f, 0, -3, 2, -3), segDist(f, 2, -3, 2, -5))).toBeLessThan(0.05);
  });
  it("speed changes gently and slows for the corner", () => {
    const r = run(pose(), bend);
    let worst = 0;
    for (let i = 1; i < r.frames.length; i++) worst = Math.max(worst, Math.abs(r.frames[i].speed - r.frames[i - 1].speed));
    expect(worst).toBeLessThanOrEqual(0.06);
    const corner = r.frames.reduce((best, f) => (Math.hypot(f.x, f.y + 3) < Math.hypot(best.x, best.y + 3) ? f : best));
    expect(corner.speed).toBeLessThan(ROUTE_SPEED * 0.8);
  });
  it("the view turns smoothly into the corner", () => {
    const r = run(pose(), bend);
    let prevRate = 0;
    let worstStep = 0;
    let worstRate = 0;
    for (let i = 1; i < r.frames.length; i++) {
      const d = wrapAngle(r.frames[i].yaw - r.frames[i - 1].yaw);
      worstStep = Math.max(worstStep, Math.abs(d));
      worstRate = Math.max(worstRate, Math.abs(d - prevRate));
      prevRate = d;
    }
    expect(worstStep).toBeLessThanOrEqual(0.08);
    expect(worstRate).toBeLessThanOrEqual(0.03);
  });
  it("finishes facing route.yaw", () => {
    const r = run(pose(), { ...bend, yaw: 2.5 });
    expect(r.done).toBe(true);
    expect(Math.abs(wrapAngle(r.p.yaw - 2.5))).toBeLessThan(0.02);
  });
  it("is not done until it has stopped, and an empty route is done once facing", () => {
    const rs = routeStart(pose(), bend);
    expect(followRoute(pose(), bend, rs, { yawVel: 0, pitchVel: 0 }, 1 / 30).done).toBe(false);
    expect(followRoute(pose(), { points: [], doors: [] }, routeStart(pose(), { points: [], doors: [] }), { yawVel: 0, pitchVel: 0 }, 1 / 30).done).toBe(true);
  });
  it("eases pitch to REST_PITCH and honours a speed cap", () => {
    let p = pose({ pitch: 0.4 });
    let rs = routeStart(p, bend);
    const m = { yawVel: 0, pitchVel: 0 };
    let top = 0;
    for (let i = 0; i < 90; i++) {
      const r = followRoute(p, bend, rs, m, 1 / 30, 0.7);
      p = { ...p, x: p.x + r.dx, y: p.y + r.dy, yaw: r.yaw, pitch: r.pitch };
      rs = r.state;
      m.yawVel = r.yawVel;
      m.pitchVel = r.pitchVel;
      top = Math.max(top, Math.hypot(r.dx, r.dy) * 30);
    }
    expect(Math.abs(p.pitch - REST_PITCH)).toBeLessThan(0.01);
    expect(top).toBeLessThanOrEqual(0.7 + 1e-6);
  });
  it("waits for a walker that is blocked", () => {
    const rs = routeStart(pose(), bend);
    let st = rs;
    const m = { yawVel: 0, pitchVel: 0 };
    const p = pose(); // never moves
    for (let i = 0; i < 90; i++) st = followRoute(p, bend, st, m, 1 / 30).state;
    expect(st.s).toBeLessThan(1);
  });
});

describe("lookSweep", () => {
  const deg = Math.PI / 180;
  it("0, +left at 0.3 T, -right at 0.75 T, 0 at T", () => {
    const l = 40 * deg;
    const r = 20 * deg;
    const T = sweepDuration(l, r);
    expect(lookSweep(1, 0, l, r)).toBeCloseTo(1);
    expect(lookSweep(1, 0.3 * T, l, r) - 1).toBeCloseTo(l);
    expect(lookSweep(1, 0.75 * T, l, r) - 1).toBeCloseTo(-r);
    expect(lookSweep(1, T, l, r)).toBeCloseTo(1);
  });
  it("lasts 4 s plus up to 4 s for the wider side, clamped to 4-8 s", () => {
    expect(sweepDuration(0, 0)).toBe(4);
    expect(sweepDuration(37.5 * deg, 10 * deg)).toBeCloseTo(6);
    expect(sweepDuration(10 * deg, 75 * deg)).toBeCloseTo(8);
    expect(sweepDuration(120 * deg, 0)).toBe(8);
    expect(sweepDuration(35 * deg, 35 * deg)).toBeCloseTo(4 + (4 * 35) / 75);
  });
  it("starts and ends at rest with zero velocity and never jumps", () => {
    const l = 60 * deg;
    const r = 30 * deg;
    const T = sweepDuration(l, r);
    const n = Math.round(T * 30);
    const f = (i: number) => lookSweep(0, i / 30, l, r);
    let worst = 0;
    for (let i = 1; i <= n; i++) worst = Math.max(worst, Math.abs(f(i) - f(i - 1)));
    expect(worst).toBeLessThan(0.03);
    expect(Math.abs(f(1) - f(0))).toBeLessThan(0.002);
    expect(Math.abs(f(n) - f(n - 1))).toBeLessThan(0.002);
    const eps = 1e-4;
    expect(Math.abs(lookSweep(0, eps, l, r) - lookSweep(0, 0, l, r)) / eps).toBeLessThan(0.01);
    expect(Math.abs(lookSweep(0, T, l, r) - lookSweep(0, T - eps, l, r)) / eps).toBeLessThan(0.01);
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

describe("stopBeforeDoor", () => {
  // A door in a wall along x at y = 0, crossed between the second and third points.
  const door = { key: "f:d", centre: { x: 0, y: 0 }, dir: { x: 1, y: 0 } };
  const pt = (x: number, y: number) => ({ x, y, level: 0, stair: null });
  const route: WalkRoute = { points: [pt(2, 3), pt(0.2, 1), pt(0, -1), pt(-1, -3)], doors: [{ key: "f:d", index: 2 }] };

  it("stops in front of the door on the side you come from, facing it", () => {
    const r = stopBeforeDoor(route, door, pt(3, 4))!;
    expect(r.points.slice(0, 2)).toEqual(route.points.slice(0, 2));
    const stop = r.points[2];
    expect(stop.x).toBeCloseTo(0);
    expect(stop.y).toBeCloseTo(0.6);
    expect(r.points).toHaveLength(3);
    expect(r.doors).toEqual([]);
    expect(wrapAngle(r.yaw! - 0)).toBeCloseTo(0); // yaw 0 looks along -z (plan -y), towards the door
  });

  it("from the other side, and when the door is the first thing crossed", () => {
    const back: WalkRoute = { points: [pt(0, 2)], doors: [{ key: "f:d", index: 0 }] };
    const r = stopBeforeDoor(back, door, pt(0.3, -2))!;
    expect(r.points).toHaveLength(1);
    expect(r.points[0].y).toBeCloseTo(-0.6);
    expect(Math.abs(wrapAngle(r.yaw! - Math.PI))).toBeCloseTo(0);
  });

  it("null when the route does not pass the door", () => {
    expect(stopBeforeDoor({ points: [pt(1, 1)], doors: [] }, door, pt(0, 2))).toBeNull();
  });
});
