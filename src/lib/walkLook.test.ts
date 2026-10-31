import { describe, expect, it } from "vitest";
import { builtInHouse, listingSite } from "../houses/default";
import type { V2 } from "./geometry";
import { buildNav, goalPoint, routeTo, shutStop } from "./walk";
import { exitPoint, fallbackTargets, LOOK_HOLD_MIN, lookCount, lookPlan, lookPose, lookResume, lookTargets, lookViewOf, minJerk, type LookPlan, type LookTarget, type LookView } from "./walkLook";
import { sweepDuration, wrapAngle } from "./walkMotion";
import { yawOf, type DoorStates, type NavWorld, type WalkPose, type WalkRoute } from "./walkTypes";

const D = Math.PI / 180;
const at = { x: NaN, y: NaN };
const tg = (deg: number, kind: LookTarget["kind"] = "window", priority = 60, hero = false): LookTarget => ({ yaw: deg * D, kind, priority, at, ...(hero ? { hero: true } : {}) });
const VIEWS: Record<string, LookView> = {
  large: { yawCap: 75 * D, portrait: false },
  medium: { yawCap: 85 * D, portrait: false },
  small: { yawCap: 90 * D, portrait: false },
  portrait: { yawCap: 55 * D, portrait: true },
};
const PITCH = -0.1;
const DT = 1 / 240;
/** The yaw series of a plan at 240 Hz. */
function sample(plan: LookPlan): number[] {
  const out: number[] = [];
  for (let t = 0; t <= plan.total + 0.5; t += DT) out.push(lookPose(plan, t).yaw);
  return out;
}
const peak = (ys: number[]): number => ys.slice(1).reduce((m, y, i) => Math.max(m, Math.abs(y - ys[i]) / DT), 0);

describe("minJerk", () => {
  it("runs 0 to 1 with zero velocity and acceleration at both ends", () => {
    expect(minJerk(0)).toBe(0);
    expect(minJerk(1)).toBeCloseTo(1, 12);
    const e = 1e-4;
    expect((minJerk(e) - minJerk(0)) / e).toBeLessThan(1e-6 * 1e4);
    expect((minJerk(1) - minJerk(1 - e)) / e).toBeLessThan(1e-6 * 1e4);
    expect(Math.abs(minJerk(2 * e) - 2 * minJerk(e)) / (e * e)).toBeLessThan(1e-2);
    expect(Math.abs(1 - minJerk(1 - 2 * e) - 2 * (1 - minJerk(1 - e))) / (e * e)).toBeLessThan(1e-2);
  });
});

describe("lookPlan (synthetic)", () => {
  const targets = [tg(60, "window", 100, true), tg(-50, "far", 80), tg(110, "wall", 40), tg(160, "exit", Infinity)];
  for (const [name, view] of Object.entries(VIEWS)) {
    it(`${name}: no move is faster than the cap, and yaw is continuous`, () => {
      const plan = lookPlan(targets, view, 0, 7, PITCH, 4);
      const ys = sample(plan);
      expect(peak(ys)).toBeLessThanOrEqual(view.yawCap + 1e-6);
      for (const k of plan.keys) expect(k.moveS).toBeLessThanOrEqual(1.5 + 1e-9);
    });
  }
  it("splits a 180 degree dead-end turn on large into three 60 degree moves with 0.3 s holds", () => {
    const plan = lookPlan([tg(179.99, "exit", Infinity)], VIEWS.large, 0, 5, PITCH, 1);
    expect(plan.keys).toHaveLength(3);
    const ends = plan.keys.map((k) => k.yaw / D);
    expect(ends[0]).toBeCloseTo(60, 1);
    expect(ends[1]).toBeCloseTo(120, 1);
    expect(plan.keys[0].holdS).toBe(0.3);
    expect(plan.keys[1].holdS).toBe(0.3);
    expect(plan.keys[0].target).toBe(-1);
    expect(plan.keys[2].target).toBe(0);
  });
  it("waits at the arrival yaw before it starts and ends on the exit", () => {
    const plan = lookPlan(targets, VIEWS.large, 0.3, 7, PITCH, 4);
    expect(lookPose(plan, 0).yaw).toBe(0.3);
    expect(lookPose(plan, -0.5).yaw).toBe(0.3);
    expect(Math.abs(wrapAngle(lookPose(plan, plan.total + 1).yaw - 160 * D))).toBeLessThan(5 * D);
    expect(lookPose(plan, plan.total + 1).done).toBe(true);
    expect(lookPose(plan, 0.1).done).toBe(false);
    expect(lookPose(plan, 0.1).pitch).toBe(PITCH);
  });
  it("is still (under 0.5 deg/s) within 1/240 s of every key boundary", () => {
    const plan = lookPlan(targets, VIEWS.large, 0, 7, PITCH, 4);
    let t = 0;
    for (const k of plan.keys) {
      for (const b of [t, t + k.moveS, t + k.moveS + k.holdS]) {
        if (b <= 0 || b >= plan.total) continue;
        const v = Math.abs(lookPose(plan, b + DT).yaw - lookPose(plan, b).yaw) / DT;
        const w = Math.abs(lookPose(plan, b).yaw - lookPose(plan, b - DT).yaw) / DT;
        expect(v / D).toBeLessThan(0.5);
        expect(w / D).toBeLessThan(0.5);
      }
      t += k.moveS + k.holdS;
    }
  });
  it("fits the holds to the budget", () => {
    const plan = lookPlan([tg(40, "window", 100, true), tg(-30, "far", 80), tg(100, "exit", Infinity)], VIEWS.large, 0, 6.8, PITCH, 3);
    expect(Math.abs(plan.total - 6.8)).toBeLessThanOrEqual(1);
  });
  it("keeps holds at least 0.6 s and drops targets when a short budget cannot hold them all", () => {
    const four = [tg(50, "window", 100, true), tg(100, "far", 80), tg(-50, "wall", 40), tg(-100, "window", 70)];
    const plan = lookPlan(four, VIEWS.large, 0, 4, PITCH, 4);
    for (const k of plan.keys) if (k.target >= 0) expect(k.holdS).toBeGreaterThanOrEqual(LOOK_HOLD_MIN - 1e-9);
    expect(plan.total <= 5 + 1e-9 || plan.targets.length === 1).toBe(true);
    expect(plan.targets.length).toBeLessThan(4);
  });
  it("merges close targets: large keeps 0 and 40 of 0 / 10 / 40, portrait keeps 0 and 18 of 0 / 10 / 18", () => {
    const large = lookPlan([tg(0, "window", 100), tg(10, "far", 80), tg(40, "wall", 60)], VIEWS.large, 0, 9, PITCH, 4);
    expect(large.targets.map((t) => Math.round(t.yaw / D)).sort((a, b) => a - b)).toEqual([0, 40]);
    const portrait = lookPlan([tg(0, "window", 100), tg(10, "far", 80), tg(18, "wall", 60)], VIEWS.portrait, 0, 9, PITCH, 4);
    expect(portrait.targets.map((t) => Math.round(t.yaw / D)).sort((a, b) => a - b)).toEqual([0, 18]);
  });
  it("portrait: every move is 40 degrees or less", () => {
    const plan = lookPlan([tg(80, "window", 100), tg(-70, "far", 80), tg(150, "exit", Infinity)], VIEWS.portrait, 0, 9, PITCH, 4);
    let from = plan.startYaw;
    for (const k of plan.keys) {
      if (k.moveS > 0) expect(Math.abs(k.yaw - from)).toBeLessThanOrEqual(40 * D + 4 * D); // the drift before it may add a little
      from = k.yaw + k.drift;
    }
    // Planned turns (before drift) are within the step.
    plan.keys.forEach((k, i) => {
      const prev = i ? plan.keys[i - 1].yaw : plan.startYaw;
      expect(Math.abs(k.yaw - prev)).toBeLessThanOrEqual(40 * D + 1e-9);
    });
  });
  it("drifts slowly in a hold (under 2.5 deg/s) and never in the exit hold", () => {
    const plan = lookPlan(targets, VIEWS.large, 0, 7, PITCH, 4);
    let t = 0;
    plan.keys.forEach((k, i) => {
      const t0 = t + k.moveS;
      let worst = 0;
      for (let u = t0; u < t0 + k.holdS; u += DT) worst = Math.max(worst, Math.abs(lookPose(plan, u + DT).yaw - lookPose(plan, u).yaw) / DT);
      expect(worst / D).toBeLessThan(2.5);
      if (plan.targets[k.target]?.kind === "exit" || k.target === -1) expect(k.drift).toBe(0);
      t += k.moveS + k.holdS;
      void i;
    });
  });
  it("an interrupted look resumes through the rest, ending at the exit, with no yaw jump", () => {
    const plan = lookPlan(targets, VIEWS.large, 0, 7, PITCH, 4);
    const t = plan.keys[0].moveS + plan.keys[0].holdS + plan.keys[1].moveS / 2;
    const y = lookPose(plan, t).yaw;
    const next = lookResume(plan, t, y, VIEWS.large);
    expect(next.startYaw).toBe(y);
    expect(lookPose(next, 0).yaw).toBe(y);
    expect(next.targets.at(-1)!.kind).toBe("exit");
    const visited = plan.targets.slice(0, 1);
    for (const v of visited) expect(next.targets.includes(v)).toBe(false);
    expect(Math.abs(wrapAngle(lookPose(next, next.total + 1).yaw - 160 * D))).toBeLessThan(5 * D);
    expect(peak(sample(next))).toBeLessThanOrEqual(VIEWS.large.yawCap + 1e-6);
  });
  it("fallback targets with no exit come back to the start yaw", () => {
    const plan = lookPlan(fallbackTargets(1, 0.6, 0.6, null), VIEWS.large, 1, 6, PITCH, 3);
    expect(Math.abs(wrapAngle(lookPose(plan, plan.total + 1).yaw - 1))).toBeLessThan(1e-9);
    expect(plan.targets.some((t) => t.kind === "far")).toBe(true);
  });
  it("is deterministic", () => {
    expect(lookPlan(targets, VIEWS.medium, 0.2, 7, PITCH, 4)).toEqual(lookPlan(targets, VIEWS.medium, 0.2, 7, PITCH, 4));
  });
  it("counts targets by floor area", () => {
    expect([lookCount(3.2), lookCount(6), lookCount(14), lookCount(14.8)]).toEqual([2, 3, 3, 4]);
  });
  it("maps lens class to a view", () => {
    expect(lookViewOf("small", 0.46)).toEqual({ yawCap: 55 * D, portrait: true });
    expect(lookViewOf("small", 2.16).portrait).toBe(false);
    expect(lookViewOf("large", 1.6).yawCap).toBeCloseTo(75 * D, 12);
  });
});

// ---- the built-in house ----
const nav = buildNav(builtInHouse(""), listingSite(), false);
const open = (n: NavWorld): DoorStates => Object.fromEntries(n.doors.map((d) => [d.key, true]));
const room = (n: NavWorld, level: number, name: string) => n.levels.find((l) => l.level === level)!.rooms.find((r) => r.name === name)!;
const standPose = (n: NavWorld, level: number, name: string): WalkPose => {
  const g = goalPoint(n, { kind: "room", level, roomId: room(n, level, name).id })!;
  return { x: g.point.x, y: g.point.y, level, stair: null, feetY: 0, yaw: 0, pitch: 0 };
};
function route(n: NavWorld, from: WalkPose, to: WalkPose): WalkRoute {
  const res = routeTo(n, from, { x: to.x, y: to.y, level: to.level, stair: null }, open(n));
  if (!res.ok && res.reason !== "shut-door") throw new Error("no route");
  return res.ok ? res.route : (res as { route: WalkRoute }).route;
}
/** The tour's stop in a room: where it stands, how it entered, and the look-round's budget (today's sweep). */
function stop(from: string, to: string, level: number, fromLevel = level) {
  const a = standPose(nav, fromLevel, from);
  const b = standPose(nav, level, to);
  const region = { level, roomId: room(nav, level, to).id };
  const ds = shutStop(nav, route(nav, a, b), a, region)!;
  const p = ds.route.points[ds.route.points.length - 1];
  return { ds, region, stand: { x: p.x, y: p.y, level, stair: null }, budget: sweepDuration(ds.sweep.left, ds.sweep.right) };
}

describe("look-round in the built-in house", () => {
  it("Hallway (front) to Kitchen: a glazing hero, and a plan that ends facing the way out", () => {
    const s = stop("Hallway (front)", "Kitchen", 0);
    const next = standPose(nav, 0, "Kitchen (galley)");
    const exit = exitPoint(nav, route(nav, { ...next, ...s.stand }, next), s.stand, s.region);
    expect(exit).not.toBeNull();
    const targets = lookTargets(nav, s.stand, s.region, s.ds.entry, exit);
    expect(targets.some((t) => t.hero && (t.kind === "window" || t.kind === "glazed-door"))).toBe(true);
    const k = room(nav, 0, "Kitchen");
    expect(k.area).toBeGreaterThan(14);
    const plan = lookPlan(targets, { yawCap: 75 * D, portrait: false }, s.ds.yaw, 6.55, PITCH, lookCount(k.area));
    const exitYaw = yawOf({ x: exit!.x - s.stand.x, y: exit!.y - s.stand.y });
    expect(Math.abs(wrapAngle(lookPose(plan, plan.total + 1).yaw - exitYaw))).toBeLessThan(5 * D);
    expect(Math.abs(plan.total - 6.55)).toBeLessThanOrEqual(1);
  });
  it("Landing (3.2 m2): at most one target besides the exit", () => {
    const l = room(nav, 1, "Landing");
    expect(l.area).toBeLessThan(6);
    const s = stop("Bedroom 1", "Landing", 1);
    const next = standPose(nav, 1, "Bathroom");
    const exit = exitPoint(nav, route(nav, { ...next, ...s.stand }, next), s.stand, s.region);
    expect(exit).not.toBeNull();
    const targets = lookTargets(nav, s.stand, s.region, s.ds.entry, exit);
    const plan = lookPlan(targets, { yawCap: 75 * D, portrait: false }, s.ds.yaw, s.budget, PITCH, lookCount(l.area));
    expect(plan.targets.filter((t) => t.kind !== "exit").length).toBeLessThanOrEqual(1);
  });
  it("Bedroom 1: nothing behind you, and about today's stop length", () => {
    const s = stop("Landing", "Bedroom 1", 1);
    const exit = null;
    const targets = lookTargets(nav, s.stand, s.region, s.ds.entry, exit);
    expect(targets.length).toBeGreaterThan(0);
    const b = room(nav, 1, "Bedroom 1");
    const plan = lookPlan(targets, { yawCap: 75 * D, portrait: false }, s.ds.yaw, s.budget, PITCH, lookCount(b.area));
    for (const t of plan.targets) if (t.kind !== "exit" && t.kind !== "entry") expect(Math.abs(wrapAngle(t.yaw - s.ds.yaw))).toBeLessThanOrEqual(135 * D + 1e-9);
    expect(Math.abs(plan.total - s.budget)).toBeLessThanOrEqual(1);
  });
  it("exitPoint is null when the route never leaves the room", () => {
    const k = room(nav, 0, "Kitchen");
    const p = standPose(nav, 0, "Kitchen");
    const here: V2 = { x: p.x, y: p.y };
    expect(exitPoint(nav, { points: [{ ...here, level: 0, stair: null }], doors: [] }, { ...here, level: 0, stair: null }, { level: 0, roomId: k.id })).toBeNull();
    expect(exitPoint(nav, { points: [], doors: [] }, { ...here, level: 0, stair: null }, { level: 0, roomId: null })).toBeNull();
  });
});
