import { describe, expect, it } from "vitest";
import { builtInHouse, listingSite } from "../houses/default";
import type { HouseModel } from "../types";
import { polygonCentroid, type V2 } from "./geometry";
import { floor, rect } from "./testing";
import { MAX_STEP, WALKER_R, buildNav, goalPoint, pickTarget, routeTo, startPose, stepWalker } from "./walk";
import { ALL_OPEN, internalOf, standable } from "./walkNav";
import type { DoorStates, NavWorld, WalkPose, WalkRoute } from "./walkTypes";

const house = builtInHouse("");
const site = listingSite();
const nav = buildNav(house, site, false);
const I = internalOf(nav)!;
const allOpen: DoorStates = Object.fromEntries(nav.doors.map((d) => [d.key, true]));
const room = (level: number, name: string) => nav.levels.find((l) => l.level === level)!.rooms.find((r) => r.name === name)!;
const largest = (level: number) => [...nav.levels.find((l) => l.level === level)!.rooms].sort((a, b) => b.area - a.area)[0];
const at = (level: number, p: V2, feetY = nav.levels.find((l) => l.level === level)!.baseY): WalkPose => ({ x: p.x, y: p.y, level, stair: null, feetY, yaw: 0, pitch: 0 });
const standIn = (level: number, name: string) => {
  const g = goalPoint(nav, { kind: "room", level, roomId: room(level, name).id })!;
  return at(level, g.point);
};

/** Follow a route the way the controller does: straight at each point in 0.05 m steps. */
function follow(n: NavWorld, start: WalkPose, route: WalkRoute, doors: DoorStates): WalkPose[] {
  const trail = [start];
  let p = start;
  for (const q of route.points) {
    for (let k = 0; k < 400; k++) {
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < 0.02) break;
      const s = Math.min(0.05, d) / d;
      const next = stepWalker(n, p, (q.x - p.x) * s, (q.y - p.y) * s, doors);
      if (Math.hypot(next.x - p.x, next.y - p.y) < 1e-5) break;
      p = next;
      trail.push(p);
    }
  }
  return trail;
}

/** Distance from p to the polyline. */
function distToPath(p: V2, pts: V2[]): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t));
  }
  return best;
}

describe("routeTo on the owner's house", () => {
  const start = startPose(nav, { kind: "front" });
  const hall = polygonCentroid(room(0, "Hallway (front)").poly);
  const front = nav.doors.find((d) => d.kind === "front")!;

  it("says the front door is shut, then walks in through it once open", () => {
    const shut = routeTo(nav, start, { ...hall, level: 0, stair: null }, {});
    expect(shut).toMatchObject({ ok: false, reason: "shut-door", door: front.key });
    const r = routeTo(nav, start, { ...hall, level: 0, stair: null }, { [front.key]: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(distToPath(front.centre, [start, ...r.route.points])).toBeLessThan(0.4);
    expect(r.route.doors.map((d) => d.key)).toEqual([front.key]);
    const last = r.route.points[r.route.points.length - 1];
    expect(Math.hypot(last.x - hall.x, last.y - hall.y)).toBeLessThan(0.3);
    // Walking it gets you there.
    const trail = follow(nav, start, r.route, { [front.key]: true });
    const end = trail[trail.length - 1];
    expect(Math.hypot(end.x - last.x, end.y - last.y)).toBeLessThan(0.3);
    expect(end.feetY).toBe(0);
  });

  it("climbs the stairs from the hall to the largest bedroom, and the walk follows", () => {
    const from = standIn(0, "Hallway (front)");
    const big = largest(1);
    const goal = goalPoint(nav, { kind: "room", level: 1, roomId: big.id })!;
    const r = routeTo(nav, from, goal.point, allOpen);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const pts = r.route.points;
    expect(pts.some((p) => p.stair !== null)).toBe(true);
    expect(pts[pts.length - 1].level).toBe(1);
    expect(pts[pts.length - 1].stair).toBeNull();
    // The stair points switch storey half way up, never back.
    const onStair = pts.filter((p) => p.stair !== null).map((p) => p.level);
    expect(onStair[0]).toBe(0);
    expect(onStair[onStair.length - 1]).toBe(1);
    expect(onStair.indexOf(1)).toBe(onStair.lastIndexOf(0) + 1);

    const trail = follow(nav, from, r.route, allOpen);
    const end = trail[trail.length - 1];
    expect(Math.hypot(end.x - goal.point.x, end.y - goal.point.y)).toBeLessThan(0.3);
    expect(end.level).toBe(1);
    expect(end.stair).toBeNull();
    expect(end.feetY).toBeCloseTo(nav.levels[1].baseY);
    for (let i = 1; i < trail.length; i++) {
      expect(Math.abs(trail[i].feetY - trail[i - 1].feetY)).toBeLessThanOrEqual(MAX_STEP);
      if (trail[i].stair !== null && trail[i - 1].stair !== null) expect(trail[i].feetY).toBeGreaterThanOrEqual(trail[i - 1].feetY - 1e-9);
    }
    expect(trail.some((p) => p.stair !== null)).toBe(true);
  });

  it("comes back down the stairs too, starting part way up them", () => {
    const from = standIn(1, "Bedroom 2");
    const r = routeTo(nav, from, { ...polygonCentroid(room(0, "Kitchen").poly), level: 0, stair: null }, allOpen);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const trail = follow(nav, from, r.route, allOpen);
    expect(trail[trail.length - 1].level).toBe(0);
    expect(trail[trail.length - 1].feetY).toBe(0);
    // From the middle of the flight.
    const mid = trail.find((p) => p.stair !== null && p.level === 1)!;
    const back = routeTo(nav, mid, { ...polygonCentroid(room(0, "Hallway (front)").poly), level: 0, stair: null }, allOpen);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    const t2 = follow(nav, mid, back.route, allOpen);
    expect(t2[t2.length - 1].level).toBe(0);
  });

  it("needs the patio or back door for the lawn, and walks out once they are open", () => {
    // Inside doors open, outside doors shut: the way out is the question.
    const outside = (key: string) => nav.doors.find((d) => d.key === key)!.kind === "front" || nav.doors.find((d) => d.key === key)!.centre.y < -5;
    const inside = Object.fromEntries(nav.doors.map((d) => [d.key, !outside(d.key)]));
    const kitchen = standIn(0, "Kitchen");
    const lawn = site.surfaces.filter((s) => s.kind === "lawn").map((s) => polygonCentroid(s.polygon)).sort((a, b) => a.y - b.y)[0];
    const to = { ...lawn, level: 0, stair: null };
    const rear = nav.doors.filter((d) => d.level === 0 && d.passage === "door" && d.centre.y < -5).map((d) => d.key);
    expect(rear).toHaveLength(2);
    const shut = routeTo(nav, kitchen, to, inside);
    expect(shut.ok).toBe(false);
    if (shut.ok || shut.reason !== "shut-door") throw new Error("expected a shut door");
    expect(rear).toContain(shut.door);
    const doors = { ...inside, ...Object.fromEntries(rear.map((k) => [k, true])) };
    const r = routeTo(nav, kitchen, to, doors);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.route.doors.some((d) => rear.includes(d.key))).toBe(true);
    const trail = follow(nav, kitchen, r.route, doors);
    const end = trail[trail.length - 1];
    expect(Math.hypot(end.x - lawn.x, end.y - lawn.y)).toBeLessThan(0.4);
    for (let i = 1; i < trail.length; i++) expect(Math.abs(trail[i].feetY - trail[i - 1].feetY)).toBeLessThanOrEqual(MAX_STEP + 1e-9);
    expect(end.feetY).toBeLessThan(0);
  });

  it("lists every door it passes, with the first point beyond it", () => {
    const r = routeTo(nav, standIn(0, "Hallway (front)"), { ...polygonCentroid(room(0, "Living Room (front)").poly), level: 0, stair: null }, allOpen);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.route.doors.length).toBeGreaterThan(0);
    for (const d of r.route.doors) expect(d.index).toBeLessThan(r.route.points.length);
  });

  it("says unreachable for the garage, which has only its garage door", () => {
    const garage = room(0, "Garage");
    expect(routeTo(nav, standIn(0, "Kitchen"), { ...polygonCentroid(garage.poly), level: 0, stair: null }, allOpen)).toEqual({ ok: false, reason: "unreachable" });
  });

  it("builds and routes in well under 300 ms", () => {
    const t = performance.now();
    const n = buildNav(builtInHouse(""), listingSite(), false);
    const s = startPose(n, { kind: "front" });
    const big = [...n.levels[1].rooms].sort((a, b) => b.area - a.area)[0];
    const g = goalPoint(n, { kind: "room", level: 1, roomId: big.id })!;
    const r = routeTo(n, s, g.point, Object.fromEntries(n.doors.map((d) => [d.key, true])));
    expect(r.ok).toBe(true);
    expect(performance.now() - t).toBeLessThan(300);
  });
});

describe("routeTo on a small floor", () => {
  const model: HouseModel = {
    floors: [floor([rect("Room", 0, 0, 500, 500)], [], { fixtures: [{ id: "t", type: "table-4", x: 250, y: 250, rot: 0, w: 1, d: 1 }] })],
    ceilingHeight: 2.4,
    slabThickness: 0.2,
  };
  const n = buildNav(model, undefined, false);

  it("goes round a table, never within WALKER_R of it", () => {
    const from = at(0, { x: 1, y: 2.5 });
    const r = routeTo(n, from, { x: 4, y: 2.5, level: 0, stair: null }, {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.route.points.length).toBeGreaterThan(1);
    const pts = [from, ...r.route.points];
    for (let i = 1; i < pts.length; i++) {
      for (let k = 0; k <= 50; k++) {
        const x = pts[i - 1].x + ((pts[i].x - pts[i - 1].x) * k) / 50;
        const y = pts[i - 1].y + ((pts[i].y - pts[i - 1].y) * k) / 50;
        const d = Math.hypot(Math.max(0, Math.abs(x - 2.5) - 0.5), Math.max(0, Math.abs(y - 2.5) - 0.5));
        expect(d).toBeGreaterThanOrEqual(WALKER_R - 1e-3);
      }
    }
    expect(r.route.points[r.route.points.length - 1]).toMatchObject({ x: 4, y: 2.5 });
  });
});

describe("pickTarget and goalPoint", () => {
  const from = startPose(nav, { kind: "front" });

  it("takes a tap on a floor to a free spot on that storey", () => {
    const c = polygonCentroid(room(1, "Bedroom 2").poly);
    const t = pickTarget(nav, { x: c.x, y: nav.levels[1].baseY + 0.01, z: c.y }, from)!;
    expect(t).toMatchObject({ level: 1, stair: null });
    expect(Math.hypot(t.x - c.x, t.y - c.y)).toBeLessThan(1);
  });

  it("takes a tap on a wall line to the nearest free spot, and a tap on nothing to null", () => {
    const t = pickTarget(nav, { x: 0.7, y: 0, z: 1.16 }, from)!;
    expect(Math.hypot(t.x - 0.7, t.y - 1.16)).toBeLessThan(1);
    expect(standable(I, 0, t, ALL_OPEN)).toBe(true);
    expect(standable(I, 0, { x: 0.7, y: 1.16 }, ALL_OPEN)).toBe(false);
    expect(pickTarget(nav, { x: 0.9, y: 1.2, z: 1.16 }, from)).toBeNull();
    expect(pickTarget(nav, { x: 40, y: 0, z: 40 }, from)).toBeNull();
  });

  it("takes a tap on the treads to the far end of the flight", () => {
    const up = pickTarget(nav, { x: 0, y: 1.2, z: -0.5 }, from)!;
    expect(up).toMatchObject({ ...nav.flights[0].headStand, level: 1 });
    const down = pickTarget(nav, { x: 0, y: 1.2, z: -0.5 }, standIn(1, "Landing"))!;
    expect(down).toMatchObject({ ...nav.flights[0].footStand, level: 0 });
  });

  it("takes a tap on the lawn to the garden", () => {
    const lawn = site.surfaces.filter((s) => s.kind === "lawn").map((s) => polygonCentroid(s.polygon)).sort((a, b) => a.y - b.y)[0];
    const t = pickTarget(nav, { x: lawn.x, y: -0.26, z: lawn.y }, from)!;
    expect(t).toMatchObject({ level: 0, stair: null });
    expect(Math.hypot(t.x - lawn.x, t.y - lawn.y)).toBeLessThan(1);
  });

  it("gives a room's stand spot and a way to face, and snaps a point", () => {
    const g = goalPoint(nav, { kind: "room", level: 0, roomId: room(0, "Kitchen").id })!;
    expect(g.point.level).toBe(0);
    expect(typeof g.yaw).toBe("number");
    expect(goalPoint(nav, { kind: "room", level: 0, roomId: "nope" })).toBeNull();
    const p = goalPoint(nav, { kind: "point", level: 0, at: { x: 0.7, y: 1.16 } })!;
    expect(standable(I, 0, p.point, ALL_OPEN)).toBe(true);
  });
});
