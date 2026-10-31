import { forwardOf, PITCH_MAX, yawOf, type NavDoor, type WalkPoint, type WalkPose, type WalkRoute } from "./walkTypes";

/** Walk-through: the pure movement maths of the first-person controller (three/walk/WalkControls). */
export const WALK_SPEED = 1.4;
export const RUN_SPEED = 2.8;
export const ROUTE_SPEED = 1.3;

export interface HeldKeys { forward: boolean; back: boolean; left: boolean; right: boolean; turnLeft: boolean; turnRight: boolean; fast: boolean }
export const NO_KEYS: HeldKeys = { forward: false, back: false, left: false, right: false, turnLeft: false, turnRight: false, fast: false };

const INTENT: Record<string, keyof HeldKeys> = {
  KeyW: "forward", ArrowUp: "forward", KeyS: "back", ArrowDown: "back", KeyA: "left", KeyD: "right",
  ArrowLeft: "turnLeft", KeyQ: "turnLeft", ArrowRight: "turnRight", KeyE: "turnRight", ShiftLeft: "fast", ShiftRight: "fast",
};
/** KeyW/ArrowUp forward, KeyS/ArrowDown back, KeyA left, KeyD right (strafe), ArrowLeft/KeyQ turnLeft, ArrowRight/KeyE turnRight, Shift fast. */
export function keyIntent(code: string): keyof HeldKeys | null {
  return INTENT[code] ?? null;
}
export const anyKey = (k: HeldKeys): boolean => Object.values(k).some(Boolean);

const TAU = Math.PI * 2;
/** An angle in (-π, π]. */
export const wrapAngle = (a: number): number => {
  const w = ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
  return w === -Math.PI ? Math.PI : w;
};

/** Resting gaze: a little below level (people look at the ground two steps ahead about half the time). */
export const REST_PITCH = (-8 * Math.PI) / 180;

export interface SpringLimits { maxVel?: number; maxAccel?: number }
/** A critically damped spring on a plain value (no wrap). With limits it caps the rate and how fast the rate may change. */
export function springValue(x: number, vel: number, target: number, dt: number, omega: number, lim: SpringLimits = {}): { x: number; vel: number } {
  if (dt <= 0) return { x, vel };
  const d = x - target;
  const c2 = vel + omega * d;
  const e = Math.exp(-omega * dt);
  let nv = (c2 - omega * (d + c2 * dt)) * e;
  if (lim.maxAccel === undefined && lim.maxVel === undefined) {
    const nd = (d + c2 * dt) * e;
    if (Math.abs(nd) < 1e-5 && Math.abs(nv) < 1e-4) return { x: target, vel: 0 };
    return { x: target + nd, vel: nv };
  }
  if (lim.maxAccel !== undefined) nv = vel + Math.max(-lim.maxAccel * dt, Math.min(lim.maxAccel * dt, nv - vel));
  if (lim.maxVel !== undefined) nv = Math.max(-lim.maxVel, Math.min(lim.maxVel, nv));
  const nx = x + nv * dt;
  if (Math.abs(nx - target) < 1e-5 && Math.abs(nv) < 1e-3) return { x: target, vel: 0 };
  return { x: nx, vel: nv };
}
/** The same spring for an angle: takes the short way round and keeps `angle` continuous (it is not wrapped). */
export function springAngle(angle: number, vel: number, target: number, dt: number, omega: number, lim: SpringLimits = {}): { angle: number; vel: number } {
  const r = springValue(0, vel, wrapAngle(target - angle), dt, omega, lim);
  return { angle: angle + r.x, vel: r.vel };
}

// ---- keys ----
export const TURN_RATE = 1.6;
/** Strafing is slower than walking forward. */
export const STRAFE_FACTOR = 0.7;
const KEY_UP_OMEGA = 20; // about 0.19 s to 90% of speed
const KEY_DOWN_OMEGA = 26; // about 0.15 s to stop
const KEY_TURN_OMEGA = 32; // about 0.12 s

/** The eased state of the keys: forward and sideways speed in m/s (in the walker's frame) and turn rate in rad/s, each with its rate of change. */
export interface KeyMotion { f: number; fv: number; s: number; sv: number; t: number; tv: number }
export const NO_KEY_MOTION: KeyMotion = { f: 0, fv: 0, s: 0, sv: 0, t: 0, tv: 0 };
export const keyMotionActive = (m: KeyMotion): boolean => m.f !== 0 || m.s !== 0 || m.t !== 0 || m.fv !== 0 || m.sv !== 0 || m.tv !== 0;

/**
 * A step of held keys: a plan move in metres and a turn in radians. Speed and turn rate ease towards what the keys ask for
 * (no instant start or stop). Diagonals are no faster than straight; strafing is 0.7 of walking.
 */
export function keyMove(keys: HeldKeys, yaw: number, dt: number, motion: KeyMotion = NO_KEY_MOTION): { dx: number; dy: number; dyaw: number; motion: KeyMotion } {
  const f = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0);
  const s = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  const turn = (keys.turnLeft ? 1 : 0) - (keys.turnRight ? 1 : 0);
  const len = Math.hypot(f, s) || 1;
  const top = keys.fast ? RUN_SPEED : WALK_SPEED;
  const tf = (f / len) * top;
  const ts = (s / len) * top * STRAFE_FACTOR;
  const om = (cur: number, target: number) => (Math.abs(target) > Math.abs(cur) || Math.sign(target) !== Math.sign(cur) ? (target === 0 ? KEY_DOWN_OMEGA : KEY_UP_OMEGA) : KEY_DOWN_OMEGA);
  const sf = springValue(motion.f, motion.fv, tf, dt, om(motion.f, tf));
  const ss = springValue(motion.s, motion.sv, ts, dt, om(motion.s, ts));
  const st = springValue(motion.t, motion.tv, turn * TURN_RATE, dt, KEY_TURN_OMEGA);
  const next: KeyMotion = { f: sf.x, fv: sf.vel, s: ss.x, sv: ss.vel, t: st.x, tv: st.vel };
  let dx = 0;
  let dy = 0;
  if (next.f || next.s) {
    const fw = forwardOf(yaw);
    // forwardOf(0) = (0,-1) and its right-hand side is +x: right = (-fw.y, fw.x).
    dx = (fw.x * next.f - fw.y * next.s) * dt;
    dy = (fw.y * next.f + fw.x * next.s) * dt;
  }
  return { dx, dy, dyaw: next.t * dt, motion: next };
}

// ---- routes ----
export const ROUTE_ACCEL = 1.0;
export const ROUTE_DECEL = 1.6;
export const ROUTE_BRAKE = 0.8;
const CORNER_LOOK = 0.6;
const YAW_AHEAD = 1.2;
const YAW_OMEGA = 4;
const YAW_MAX = 2;
const YAW_MAX_ACCEL = 15;
const PITCH_OMEGA = 8;
const FACE_BLEND = 0.8;

interface Poly { x: number[]; y: number[]; cum: number[]; corners: { s: number; cos: number }[]; pointS: number[] }
/** Where a route has got to: a distance along its polyline (starting at the walker's position) and the speed. */
export interface RouteState { poly: Poly; s: number; v: number; aim: number; lastDir: number }

const ROUND = 0.12; // corners are rounded over at most this far each side: a few centimetres off the vertex
const ROUND_STEPS = 4;
/**
 * Begin a route from the walker's position. The polyline runs through every route point; each corner is rounded off by a few
 * centimetres (a small curve of at most ~4 cm off the vertex) so the walker does not turn on a dime.
 */
export function routeStart(pose: Pick<WalkPose, "x" | "y" | "yaw">, route: WalkRoute): RouteState {
  const raw: { x: number; y: number; idx: number }[] = [{ x: pose.x, y: pose.y, idx: -1 }];
  route.points.forEach((p, idx) => {
    const l = raw[raw.length - 1];
    if (Math.hypot(p.x - l.x, p.y - l.y) >= 0.02) raw.push({ x: p.x, y: p.y, idx });
  });
  const x: number[] = [raw[0].x];
  const y: number[] = [raw[0].y];
  const cum = [0];
  const corners: { s: number; cos: number }[] = [];
  const pointS: number[] = new Array(route.points.length).fill(0);
  const push = (px: number, py: number) => {
    cum.push(cum[cum.length - 1] + Math.hypot(px - x[x.length - 1], py - y[y.length - 1]));
    x.push(px);
    y.push(py);
  };
  let lastIdx = -1;
  for (let i = 1; i < raw.length; i++) {
    const P = raw[i];
    const A = raw[i - 1];
    const N = raw[i + 1];
    let cos = 1;
    if (N) {
      const ax = P.x - A.x;
      const ay = P.y - A.y;
      const bx = N.x - P.x;
      const by = N.y - P.y;
      const la = Math.hypot(ax, ay);
      const lb = Math.hypot(bx, by);
      cos = (ax * bx + ay * by) / (la * lb);
      const t = Math.min(ROUND, la / 2, lb / 2);
      if (cos < 0.999 && t > 0.01) {
        // Quadratic curve from t before the vertex to t after it, controlled by the vertex.
        const sx = P.x - (ax / la) * t;
        const sy = P.y - (ay / la) * t;
        const ex = P.x + (bx / lb) * t;
        const ey = P.y + (by / lb) * t;
        push(sx, sy);
        for (let k = 1; k <= ROUND_STEPS; k++) {
          const u = k / ROUND_STEPS;
          const w = 1 - u;
          push(w * w * sx + 2 * w * u * P.x + u * u * ex, w * w * sy + 2 * w * u * P.y + u * u * ey);
          if (k === ROUND_STEPS / 2) {
            corners.push({ s: cum[cum.length - 1], cos });
            for (let q = lastIdx + 1; q <= P.idx; q++) pointS[q] = cum[cum.length - 1];
          }
        }
        lastIdx = P.idx;
        continue;
      }
    }
    push(P.x, P.y);
    if (N && cos < 0.999) corners.push({ s: cum[cum.length - 1], cos });
    for (let q = lastIdx + 1; q <= P.idx; q++) pointS[q] = cum[cum.length - 1];
    lastIdx = P.idx;
  }
  for (let q = lastIdx + 1; q < pointS.length; q++) pointS[q] = cum[cum.length - 1];
  return { poly: { x, y, cum, corners, pointS }, s: 0, v: 0, aim: pose.yaw, lastDir: pose.yaw };
}
/** Distance along the route at which route point `index` lies (a rounded corner counts from its middle). */
export function routePointS(rs: RouteState, index: number): number {
  return rs.poly.pointS[index] ?? total(rs.poly);
}
const total = (poly: Poly): number => poly.cum[poly.cum.length - 1];
function pointAt(poly: Poly, s: number): { x: number; y: number } {
  const n = poly.x.length;
  if (n === 1) return { x: poly.x[0], y: poly.y[0] };
  const ss = Math.max(0, Math.min(total(poly), s));
  let i = 1;
  while (i < n - 1 && poly.cum[i] < ss) i++;
  const u = (ss - poly.cum[i - 1]) / (poly.cum[i] - poly.cum[i - 1] || 1);
  return { x: poly.x[i - 1] + (poly.x[i] - poly.x[i - 1]) * u, y: poly.y[i - 1] + (poly.y[i] - poly.y[i - 1]) * u };
}
/** The speed ceiling from the next corner (within 0.6 m): ROUTE_SPEED * (0.45 + 0.55 cos θ), blended in as the corner nears. */
function cornerCap(poly: Poly, s: number): number {
  for (const c of poly.corners) {
    if (c.s <= s) continue;
    const ahead = c.s - s;
    if (ahead >= CORNER_LOOK) return Infinity;
    const corner = ROUTE_SPEED * Math.max(0.15, 0.45 + 0.55 * c.cos);
    return corner + (ROUTE_SPEED - corner) * (ahead / CORNER_LOOK);
  }
  return Infinity;
}

export interface RouteMotion { yawVel: number; pitchVel: number }
export interface RouteResult { dx: number; dy: number; yaw: number; pitch: number; yawVel: number; pitchVel: number; state: RouteState; done: boolean; intended: number }

/**
 * One step along a route. The walker follows the polyline exactly (no corner cutting), speeding up at 1 m/s², slowing for corners
 * and to stop at the goal. The view yaw is a spring towards a point 1.2 m further along, so it leads into turns, and in the last
 * 0.8 m turns to route.yaw. Done once stopped at the end and facing route.yaw (if set). `speedCap` caps the speed this frame.
 */
export function followRoute(pose: Pick<WalkPose, "x" | "y" | "yaw" | "pitch">, route: WalkRoute, st: RouteState, motion: RouteMotion, dt: number, speedCap = Infinity, restPitch = REST_PITCH): RouteResult {
  const { poly } = st;
  const end = total(poly);
  // Where the path says we should be; if the walker has fallen well behind (blocked), wait for it.
  const here = pointAt(poly, st.s);
  const lag = Math.hypot(here.x - pose.x, here.y - pose.y);
  let { s, v } = st;
  const remaining = Math.max(0, end - s);
  let target = Math.min(ROUTE_SPEED, speedCap, cornerCap(poly, s), Math.sqrt(2 * ROUTE_BRAKE * remaining));
  if (lag > 0.4) target = 0;
  v = target > v ? Math.min(target, v + ROUTE_ACCEL * dt) : Math.max(target, v - ROUTE_DECEL * dt);
  if (v < 1e-4) v = 0;
  s = Math.min(end, s + v * dt);
  const goal = pointAt(poly, s);
  let mx = goal.x - here.x;
  let my = goal.y - here.y;
  // Catch up gently with the path point if we are off it.
  const pull = lag > 1e-6 && lag <= 0.4 ? Math.min(lag, ROUTE_SPEED * dt * 0.5) / lag : 0;
  mx += (here.x - pose.x) * pull;
  my += (here.y - pose.y) * pull;
  const intended = Math.hypot(mx, my);
  const rem = Math.max(0, end - s);

  // View: a spring towards the path ahead.
  const ahead = pointAt(poly, s + YAW_AHEAD);
  const ex = ahead.x - (pose.x + mx);
  const ey = ahead.y - (pose.y + my);
  let dir = st.lastDir;
  if (Math.hypot(ex, ey) > 0.08) dir = yawOf({ x: ex, y: ey });
  let aim = dir;
  if (route.yaw !== undefined) {
    const w = Math.max(0, Math.min(1, (FACE_BLEND - rem) / FACE_BLEND));
    const k = w * w * (3 - 2 * w);
    aim = dir + k * wrapAngle(route.yaw - dir);
  }
  const ys = springAngle(pose.yaw, motion.yawVel, aim, dt, YAW_OMEGA, { maxVel: YAW_MAX, maxAccel: YAW_MAX_ACCEL });
  const ps = springValue(pose.pitch, motion.pitchVel, restPitch, dt, PITCH_OMEGA);

  const stopped = v < 0.03 && rem < 0.03 && lag < 0.2;
  const facing = route.yaw === undefined || Math.abs(wrapAngle(route.yaw - ys.angle)) < 0.02;
  return { dx: mx, dy: my, yaw: ys.angle, pitch: ps.x, yawVel: ys.vel, pitchVel: ps.vel, state: { poly, s, v, aim, lastDir: dir }, done: stopped && facing, intended };
}

/**
 * The part of a route that ends at a shut door: its points before the door, then a spot `gap` in front of the door on
 * the side you come from, facing it. Null when the route does not pass that door.
 */
export function stopBeforeDoor(route: WalkRoute, door: Pick<NavDoor, "key" | "centre" | "dir">, from: WalkPoint, gap = 0.6): WalkRoute | null {
  const at = route.doors.find((d) => d.key === door.key);
  if (!at) return null;
  const before = route.points.slice(0, at.index);
  const last = before[before.length - 1] ?? from;
  const n = { x: -door.dir.y, y: door.dir.x };
  const side = (last.x - door.centre.x) * n.x + (last.y - door.centre.y) * n.y >= 0 ? 1 : -1;
  const stop: WalkPoint = { x: door.centre.x + n.x * gap * side, y: door.centre.y + n.y * gap * side, level: last.level, stair: last.stair };
  return { points: [...before, stop], doors: route.doors.filter((d) => d.index < at.index), yaw: yawOf({ x: door.centre.x - stop.x, y: door.centre.y - stop.y }) };
}

/** Default look-round swing each side, radians. */
export const LOOK_AMP = (35 * Math.PI) / 180;
/** How long a look-round of this width takes: 4 s, up to 8 s at 75° each side. */
export function sweepDuration(left: number, right: number): number {
  return Math.max(4, Math.min(8, 4 + 4 * (Math.max(left, right) / ((75 * Math.PI) / 180))));
}
/**
 * Look-round at a tour stop: 0, +left at 0.3 T, -right at 0.75 T, back to 0 at T, eased between so it starts and ends at rest.
 * Positive turns left. T defaults to `sweepDuration`.
 */
export function lookSweep(baseYaw: number, t: number, left = LOOK_AMP, right = left, period = sweepDuration(left, right)): number {
  const u = Math.max(0, Math.min(1, t / period));
  const keys: [number, number][] = [[0, 0], [0.3, left], [0.75, -right], [1, 0]];
  for (let i = 1; i < keys.length; i++) {
    if (u <= keys[i][0]) {
      const k = (u - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0]);
      const e = 0.5 - 0.5 * Math.cos(Math.PI * k);
      return baseYaw + keys[i - 1][1] + (keys[i][1] - keys[i - 1][1]) * e;
    }
  }
  return baseYaw;
}

/** Grab-the-scene drag: dragging right turns left, dragging down looks up; a drag the canvas height turns by the vertical FOV. Pitch clamped to ±PITCH_MAX. */
export function dragLook(yaw: number, pitch: number, dxPx: number, dyPx: number, vfovRad: number, heightPx: number): { yaw: number; pitch: number } {
  const k = vfovRad / Math.max(1, heightPx);
  return { yaw: wrapAngle(yaw + dxPx * k), pitch: Math.max(-PITCH_MAX, Math.min(PITCH_MAX, pitch + dyPx * k)) };
}

/** A press that moved under 6 px and lasted under 500 ms. */
export function isTap(down: { x: number; y: number; t: number }, up: { x: number; y: number; t: number }): boolean {
  return Math.hypot(up.x - down.x, up.y - down.y) < 6 && up.t - down.t < 500;
}
