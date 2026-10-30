import { forwardOf, PITCH_MAX, yawOf, type NavDoor, type WalkPoint, type WalkPose, type WalkRoute } from "./walkTypes";

/** Walk-through: the pure movement maths of the first-person controller (three/walk/WalkControls). */
export const WALK_SPEED = 1.4;
export const RUN_SPEED = 2.8;
export const ROUTE_SPEED = 1.3;
export const TURN_RATE = Math.PI / 2;

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

/** A step of held keys: a plan move in metres and a turn in radians. Diagonals are no faster than straight. */
export function keyMove(keys: HeldKeys, yaw: number, dt: number): { dx: number; dy: number; dyaw: number } {
  const f = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0);
  const s = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  const turn = (keys.turnLeft ? 1 : 0) - (keys.turnRight ? 1 : 0);
  let dx = 0;
  let dy = 0;
  if (f || s) {
    const fw = forwardOf(yaw);
    const rt = { x: -fw.y, y: fw.x };
    // forwardOf(0) = (0,-1) and its right-hand side is +x: right = (-fw.y, fw.x).
    const len = Math.hypot(f, s);
    const v = (keys.fast ? RUN_SPEED : WALK_SPEED) * dt;
    dx = ((fw.x * f + rt.x * s) / len) * v;
    dy = ((fw.y * f + rt.y * s) / len) * v;
  }
  return { dx, dy, dyaw: turn * TURN_RATE * dt };
}

const ARRIVE = 0.15;
/** Next move along a route: towards points[index], advancing index within 0.15 m; yaw eases to the direction of travel. */
export function followStep(pose: WalkPose, route: WalkRoute, index: number, dt: number, speed: number = ROUTE_SPEED): { dx: number; dy: number; index: number; yaw: number; done: boolean } {
  const pts = route.points;
  let i = index;
  while (i < pts.length && Math.hypot(pts[i].x - pose.x, pts[i].y - pose.y) < ARRIVE) i++;
  if (i >= pts.length) return { dx: 0, dy: 0, index: i, yaw: route.yaw !== undefined ? easeYaw(pose.yaw, route.yaw, dt) : pose.yaw, done: true };
  const ex = pts[i].x - pose.x;
  const ey = pts[i].y - pose.y;
  const d = Math.hypot(ex, ey);
  const step = Math.min(d, speed * dt);
  return { dx: (ex / d) * step, dy: (ey / d) * step, index: i, yaw: easeYaw(pose.yaw, yawOf({ x: ex, y: ey }), dt), done: false };
}
/** Turn towards a yaw at up to 4 rad/s, easing the last of it. */
function easeYaw(from: number, to: number, dt: number): number {
  const d = wrapAngle(to - from);
  const k = 1 - Math.exp(-8 * dt);
  const step = Math.sign(d) * Math.min(Math.abs(d * k), 4 * dt) ;
  return from + (Math.abs(d * k) < 0.002 ? d : step);
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

/** Look-round at a tour stop: base ± 50° over a 4 s sine. */
export function lookSweep(baseYaw: number, t: number, period = 4, ampRad = (50 * Math.PI) / 180): number {
  return baseYaw + ampRad * Math.sin((t / period) * TAU);
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
