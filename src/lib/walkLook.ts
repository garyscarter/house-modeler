import { pointInPolygon, type V2 } from "./geometry";
import type { DoorwayRegion } from "./walkDoorway";
import { yawCapDeg, type LensClass } from "./walkLens";
import { wrapAngle } from "./walkMotion";
import { yawOf, type NavWorld, type WalkPoint, type WalkRoute } from "./walkTypes";

/**
 * The tour's look-round at a stop: glance at the things in the room one after another and hold on each, the way a
 * person takes a room in, instead of a continuous sweep. Targets come from the room's data (windows and glazed doors,
 * the far corner, the biggest wall, the door just used, the door to leave by); the plan orders them from the arrival
 * yaw, times the moves under the view's turning-rate cap, and fits the holds to the stop's length. All angles in radians.
 */

const DEG = Math.PI / 180;

export type LookKind = "window" | "glazed-door" | "far" | "wall" | "entry" | "exit";
export interface LookTarget {
  yaw: number;
  kind: LookKind;
  priority: number;
  at: V2;
  hero?: boolean;
}
export interface LookView {
  /** Peak automatic turning rate, rad/s. */
  yawCap: number;
  /** A phone held upright: smaller turns. */
  portrait: boolean;
}
export interface LookKey {
  /** The yaw this key's move ends at (unwrapped, continuing from the previous key). */
  yaw: number;
  moveS: number;
  holdS: number;
  /** Yaw drift toward the next key during the hold, radians. */
  drift: number;
  /** Index into plan.targets; -1 for a split waypoint. */
  target: number;
}
export interface LookPlan {
  startYaw: number;
  pitch: number;
  targets: LookTarget[];
  keys: LookKey[];
  total: number;
}

export const LOOK_MERGE = 25 * DEG; // targets closer than this merge
export const LOOK_MERGE_PORTRAIT = 15 * DEG;
export const LOOK_HOLD = 1.0; // s, nominal hold
export const LOOK_HOLD_HERO = 1.4; // s, the hero target
export const LOOK_HOLD_EXIT = 0.5; // s, fixed, before walking on
export const LOOK_HOLD_SPLIT = 0.3; // s, fixed, between the parts of a split turn
export const LOOK_HOLD_MIN = 0.6; // s, holds never shorter after fitting
export const LOOK_HOLD_MAX = 2.5; // s, holds never longer after fitting
export const LOOK_DRIFT = 1.5 * DEG; // drift toward the next target during a 1 s hold (scaled by hold / 1 s, at most this)
export const LOOK_BEHIND = 135 * DEG; // non-exit targets further than this from startYaw are dropped
const FIRST_NEAR = 6 * DEG; // a first target this close to the arrival yaw is already being looked at
export const LOOK_EXIT_BEHIND = 100 * DEG; // an exit further round than this is not turned to: the walk's own turn faces it once you move on
const LOOK_TAIL_MAX = 6.5; // s, the longest a hold may be stretched to use up spare time
const SLACK_S = 1; // a plan may run this far over its budget before targets are dropped

export function lookViewOf(cls: LensClass, aspect: number): LookView {
  return { yawCap: yawCapDeg(cls, aspect) * DEG, portrait: cls === "small" && aspect < 1 };
}
/** How many targets a room of this floor area gets, counting the exit when there is one. */
export function lookCount(areaM2: number): number {
  return areaM2 < 6 ? 2 : areaM2 <= 14 ? 3 : 4;
}
/** Minimum-jerk blend 0..1: zero velocity and acceleration at both ends. */
export const minJerk = (u: number): number => 10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5;
const smoothstep = (u: number): number => u * u * (3 - 2 * u);
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

// ---- targets ----

/** Where the walk leaves the region by on the way to the next stop, or null if the route never does (or the region is the garden). */
export function exitPoint(nav: NavWorld, route: WalkRoute, from: WalkPoint, region: DoorwayRegion): V2 | null {
  const room = region.roomId === null ? null : nav.levels.find((l) => l.level === region.level)?.rooms.find((r) => r.id === region.roomId);
  if (!room) return null;
  const here = (p: WalkPoint): boolean => p.stair === null && p.level === region.level && pointInPolygon(p, room.poly);
  const poly: WalkPoint[] = [from, ...route.points];
  for (let k = 1; k < poly.length; k++) {
    const a = poly[k - 1];
    const b = poly[k];
    if (!here(a) || here(b)) continue;
    let lo = 0; // inside
    let hi = 1; // outside
    for (let n = 0; n < 24; n++) {
      const m = (lo + hi) / 2;
      if (pointInPolygon({ x: a.x + (b.x - a.x) * m, y: a.y + (b.y - a.y) * m }, room.poly)) lo = m;
      else hi = m;
    }
    const m = (lo + hi) / 2;
    return { x: a.x + (b.x - a.x) * m, y: a.y + (b.y - a.y) * m };
  }
  return null;
}

/** What is worth a glance from `stand` in the region's room, most important first. */
export function lookTargets(nav: NavWorld, stand: WalkPoint, region: DoorwayRegion, entry: V2 | null, exit: V2 | null): LookTarget[] {
  const room = region.roomId === null ? null : nav.levels.find((l) => l.level === region.level)?.rooms.find((r) => r.id === region.roomId);
  if (!room) return exit ? [{ yaw: yawFrom(stand, exit), kind: "exit", priority: Infinity, at: exit }] : [];
  const poly = room.poly;
  const yawAt = (p: V2): number => yawFrom(stand, p);
  const seen = (p: V2): boolean => {
    for (let k = 1; k <= 19; k++) {
      const u = (k / 20) * 0.95;
      if (!pointInPolygon({ x: stand.x + (p.x - stand.x) * u, y: stand.y + (p.y - stand.y) * u }, poly)) return false;
    }
    return true;
  };
  const out: LookTarget[] = [];

  // Windows and glazed doors in this room; the biggest pane is the hero.
  const glass = nav.glazing.filter((g) => g.level === region.level && g.roomId === region.roomId);
  let hero = -1;
  let best = 0;
  glass.forEach((g, i) => {
    const area = g.width * (g.head - g.sill);
    if (area > best) {
      best = area;
      hero = i;
    }
  });
  glass.forEach((g, i) => {
    const area = g.width * (g.head - g.sill);
    const isHero = i === hero;
    out.push({ yaw: yawAt(g.centre), kind: g.kind === "window" || g.kind === "bay" ? "window" : "glazed-door", priority: isHero ? 100 : 60 + 10 * area, at: g.centre, ...(isHero ? { hero: true } : {}) });
  });

  // The far corner: the longest sightline.
  let far: V2 | null = null;
  let farD = -1;
  for (const v of poly) {
    const d = Math.hypot(v.x - stand.x, v.y - stand.y);
    if (d > farD && seen(v)) {
      far = v;
      farD = d;
    }
  }
  if (far) out.push({ yaw: yawAt(far), kind: "far", priority: 80, at: far, ...(glass.length ? {} : { hero: true }) });

  // The largest wall that can be seen whole from here.
  let wall: V2 | null = null;
  let wallLen = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len <= wallLen || len < 1e-6) continue;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
    const pulled = [1, -1].map((s) => ({ x: mid.x + n.x * 0.1 * s, y: mid.y + n.y * 0.1 * s })).find((p) => pointInPolygon(p, poly));
    if (!pulled || !seen(pulled) || Math.hypot(mid.x - stand.x, mid.y - stand.y) <= 1.0) continue;
    if (entry && Math.hypot(mid.x - entry.x, mid.y - entry.y) < 0.4) continue;
    wall = mid;
    wallLen = len;
  }
  if (wall) out.push({ yaw: yawAt(wall), kind: "wall", priority: 40, at: wall });

  // The door just used, when there is no door to leave by (a dead end: you go out the way you came).
  if (entry && !exit) out.push({ yaw: yawAt(entry), kind: "entry", priority: 20, at: entry });
  if (exit) out.push({ yaw: yawAt(exit), kind: "exit", priority: Infinity, at: exit });
  return out.sort((a, b) => b.priority - a.priority);
}
const yawFrom = (stand: V2, p: V2): number => yawOf({ x: p.x - stand.x, y: p.y - stand.y });

/** Targets for a room with no usable data (the garden, a room you were already in): both ends of today's sweep, then the exit or back to where you began. */
export function fallbackTargets(startYaw: number, left: number, right: number, exitYaw: number | null): LookTarget[] {
  const at = { x: NaN, y: NaN };
  return [
    { yaw: startYaw + left, kind: "far", priority: 80, at, hero: true },
    { yaw: startYaw - right, kind: "far", priority: 70, at },
    { yaw: exitYaw ?? startYaw, kind: "exit", priority: Infinity, at },
  ];
}

// ---- the plan ----

interface Built {
  /** The targets in the order the keys visit them. */
  order: LookTarget[];
  keys: LookKey[];
  total: number;
}

/** Order, time and fit the kept targets (exit last, if any); keys carry yaw, move and hold, with drift. */
function build(kept: LookTarget[], view: LookView, startYaw: number, budgetS: number): Built {
  const capDeg = view.yawCap / DEG;
  const maxStep = (view.portrait ? 40 : Math.min(70, 0.8 * capDeg)) * DEG;
  const exit = kept.find((t) => t.kind === "exit");
  const rest = kept.filter((t) => t.kind !== "exit");
  const rel = (t: LookTarget): number => wrapAngle(t.yaw - startYaw);
  const left = rest.filter((t) => rel(t) > 0).sort((a, b) => rel(a) - rel(b));
  const right = rest.filter((t) => rel(t) <= 0).sort((a, b) => rel(b) - rel(a));
  const cost = (seq: LookTarget[]): number => {
    let y = startYaw;
    let c = 0;
    for (const t of seq) {
      const d = wrapAngle(t.yaw - y);
      c += Math.abs(d);
      y += d;
    }
    return c;
  };
  const a = [...left, ...right, ...(exit ? [exit] : [])];
  const b = [...right, ...left, ...(exit ? [exit] : [])];
  const seq = cost(b) < cost(a) ? b : a;

  // Moves: split big turns, time each under the rate cap.
  interface Part { yaw: number; moveS: number; target: number; fixed: number | null; nominal: number }
  const parts: Part[] = [];
  let y = startYaw;
  seq.forEach((t, i) => {
    const delta = wrapAngle(t.yaw - y);
    if (i === 0 && Math.abs(delta) < FIRST_NEAR) {
      // Already looking at the first target: no move, and the gaze stays where it is.
      parts.push({ yaw: startYaw, moveS: 0, target: 0, fixed: t.kind === "exit" ? LOOK_HOLD_EXIT : null, nominal: t.kind === "exit" ? LOOK_HOLD_EXIT : t.hero ? LOOK_HOLD_HERO : LOOK_HOLD });
      return;
    }
    const amp = Math.abs(delta);
    const n = Math.max(1, Math.ceil(amp / maxStep - 1e-9));
    for (let k = 1; k <= n; k++) {
      const pa = (amp / n) / DEG;
      const last = k === n;
      const yaw = y + (delta * k) / n;
      const moveS = Math.max(0.45 + pa / 120, (1.875 * pa) / capDeg);
      const nominal = t.kind === "exit" ? LOOK_HOLD_EXIT : t.hero ? LOOK_HOLD_HERO : LOOK_HOLD;
      parts.push({ yaw, moveS, target: last ? i : -1, fixed: !last ? LOOK_HOLD_SPLIT : t.kind === "exit" ? LOOK_HOLD_EXIT : null, nominal });
    }
    y += delta;
  });
  const M = parts.reduce((s, p) => s + p.moveS, 0);
  const F = parts.reduce((s, p) => s + (p.fixed ?? 0), 0);
  const H = parts.reduce((s, p) => s + (p.fixed === null ? p.nominal : 0), 0);
  const k = H > 0 ? (budgetS - M - F) / H : 1;
  const holds = parts.map((p) => (p.fixed !== null ? p.fixed : clamp(p.nominal * k, LOOK_HOLD_MIN, LOOK_HOLD_MAX)));

  // Drift toward the next key during a scalable hold.
  const keys: LookKey[] = parts.map((p, i) => {
    let drift = 0;
    if (parts[i].fixed === null && i + 1 < parts.length) {
      const delta = parts[i + 1].yaw - p.yaw;
      drift = Math.sign(delta) * Math.min(LOOK_DRIFT * Math.min(1, holds[i] / 1.0), 0.5 * Math.abs(delta));
    }
    return { yaw: p.yaw, moveS: p.moveS, holdS: holds[i], drift, target: p.target };
  });
  return { order: seq, keys, total: keys.reduce((s, kk) => s + kk.moveS + kk.holdS, 0) };
}

/**
 * Plan a look-round of about `budgetS` seconds: drop what is behind you, merge targets too close to tell apart, order
 * them from where you face so the turning is least, time the moves under the view's rate cap and fit the holds. `count`
 * is how many targets to visit, the exit included.
 */
export function lookPlan(targets: LookTarget[], view: LookView, startYaw: number, budgetS: number, pitch: number, count: number): LookPlan {
  const merge = view.portrait ? LOOK_MERGE_PORTRAIT : LOOK_MERGE;
  const exitAll = targets.find((t) => t.kind === "exit");
  // An exit well behind you is not turned to: that turn would eat the stop's time, and walking on faces it anyway.
  const cands = targets.filter((t) => t.kind !== "exit" && Math.abs(wrapAngle(t.yaw - startYaw)) <= LOOK_BEHIND).sort((x, y) => y.priority - x.priority);
  const exit = exitAll && (!cands.length || Math.abs(wrapAngle(exitAll.yaw - startYaw)) <= LOOK_EXIT_BEHIND) ? exitAll : undefined;
  const accepted: LookTarget[] = exit ? [exit] : [];
  const maxRest = Math.max(1, count - (exit ? 1 : 0));
  let nonExit = 0;
  for (const t of cands) {
    if (nonExit >= maxRest) break;
    if (accepted.every((x) => Math.abs(wrapAngle(t.yaw - x.yaw)) >= merge)) {
      accepted.push(t);
      nonExit++;
    }
  }
  if (!accepted.length) return { startYaw, pitch, targets: [], keys: [], total: 0 };

  let kept = accepted;
  let built = build(kept, view, startYaw, budgetS);
  // The last leg to the exit is not worth a long turn either: from the final glance, walking on faces it anyway.
  if (exit && built.order.length > 1) {
    const last = built.order[built.order.length - 2];
    if (Math.abs(wrapAngle(exit.yaw - last.yaw)) > LOOK_EXIT_BEHIND) {
      kept = kept.filter((t) => t !== exit);
      built = build(kept, view, startYaw, budgetS);
    }
  }
  while (built.total > budgetS + SLACK_S) {
    const rest = kept.filter((t) => t.kind !== "exit");
    if (rest.length > 1) {
      const drop = rest.reduce((lo, t) => (t.priority < lo.priority ? t : lo));
      kept = kept.filter((t) => t !== drop);
    } else if (kept.some((t) => t.kind === "exit") && rest.length) {
      kept = rest; // one glance and the turn to leave will not fit: keep the glance
    } else break;
    built = build(kept, view, startYaw, budgetS);
  }
  // Spare time (the holds hit their ceiling): linger on the best view rather than finish early.
  const spare = budgetS - SLACK_S * 0.5 - built.total;
  if (spare > 0 && built.keys.length) {
    const heroIdx = built.order.findIndex((t) => t.hero);
    let ki = built.keys.findIndex((kk) => kk.target === (heroIdx >= 0 ? heroIdx : -2));
    if (ki < 0) ki = built.keys.length - 1;
    const kk = built.keys[ki];
    const add = Math.min(spare, Math.max(0, LOOK_TAIL_MAX - kk.holdS));
    kk.holdS += add;
    built = { ...built, total: built.total + add };
  }
  return { startYaw, pitch, targets: built.order, keys: built.keys, total: built.total };
}

/** Where the gaze is, `t` seconds into the plan (before 0 it waits at the arrival yaw). */
export function lookPose(plan: LookPlan, t: number): { yaw: number; pitch: number; done: boolean } {
  const done = t >= plan.total;
  let yaw = plan.startYaw;
  if (t > 0) {
    let t0 = 0;
    let from = plan.startYaw;
    yaw = from;
    for (const k of plan.keys) {
      if (t < t0 + k.moveS) {
        yaw = from + (k.yaw - from) * minJerk((t - t0) / k.moveS);
        return { yaw, pitch: plan.pitch, done };
      }
      t0 += k.moveS;
      if (t < t0 + k.holdS) {
        yaw = k.yaw + k.drift * smoothstep((t - t0) / k.holdS);
        return { yaw, pitch: plan.pitch, done };
      }
      t0 += k.holdS;
      from = k.yaw + k.drift;
      yaw = from;
    }
  }
  return { yaw, pitch: plan.pitch, done };
}

/** Re-plan from where the gaze is now (after an interruption): the targets not yet looked at, then the exit, in what is left of the time. */
export function lookResume(plan: LookPlan, t: number, yaw: number, view: LookView): LookPlan {
  const seen = new Set<number>();
  let t0 = 0;
  for (const k of plan.keys) {
    t0 += k.moveS;
    if (k.target >= 0 && t0 <= t) seen.add(k.target);
    t0 += k.holdS;
  }
  const remaining = plan.targets.filter((tg, i) => tg.kind === "exit" || !seen.has(i));
  const exit = remaining.some((tg) => tg.kind === "exit");
  return lookPlan(remaining, view, yaw, Math.max(2, plan.total - t), plan.pitch, remaining.length || (exit ? 1 : 0));
}
