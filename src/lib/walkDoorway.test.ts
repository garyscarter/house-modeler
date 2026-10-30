import { describe, expect, it } from "vitest";
import { builtInHouse, builtInProposed, listingSite } from "../houses/default";
import { pointInPolygon, type V2 } from "./geometry";
import { buildNav, doorwayStop, goalPoint, planTour, routeTo, startPose } from "./walk";
import { wrapAngle } from "./walkMotion";
import { forwardOf, type DoorStates, type NavWorld, type WalkPose, type WalkRoute } from "./walkTypes";

const deg = Math.PI / 180;
const house = builtInHouse("");
const nav = buildNav(house, listingSite(), false);
const open = (n: NavWorld): DoorStates => Object.fromEntries(n.doors.map((d) => [d.key, true]));
const room = (n: NavWorld, level: number, name: string) => n.levels.find((l) => l.level === level)!.rooms.find((r) => r.name === name)!;
const stand = (n: NavWorld, level: number, name: string): WalkPose => {
  const g = goalPoint(n, { kind: "room", level, roomId: room(n, level, name).id })!;
  return { x: g.point.x, y: g.point.y, level, stair: null, feetY: 0, yaw: 0, pitch: 0 };
};
function go(n: NavWorld, from: WalkPose, level: number, roomId: string | null, to: WalkPose | null) {
  const target = to ?? from;
  const res = routeTo(n, from, { x: target.x, y: target.y, level: target.level, stair: null }, open(n));
  if (!res.ok && res.reason !== "shut-door") throw new Error("no route");
  const route: WalkRoute = res.ok ? res.route : (res as { route: WalkRoute }).route;
  return doorwayStop(n, route, from, { level, roomId })!;
}
const last = (r: { route: { points: { x: number; y: number }[] } }) => r.route.points[r.route.points.length - 1];
const nearestDoor = (n: NavWorld, p: V2, level: number) =>
  Math.min(...n.doors.filter((d) => d.level === level).map((d) => Math.hypot(d.centre.x - p.x, d.centre.y - p.y)));
const yawDiffs = (poly: V2[], p: V2, yaw: number) => poly.map((v) => Math.abs(wrapAngle(Math.atan2(-(v.x - p.x), -(v.y - p.y)) - yaw)));

describe("doorwayStop", () => {
  it("hall to kitchen: stands just inside the doorway and sees the room", () => {
    const k = room(nav, 0, "Kitchen");
    const r = go(nav, stand(nav, 0, "Hallway (front)"), 0, k.id, stand(nav, 0, "Kitchen"));
    const s = last(r)!;
    expect(r.fallback).toBe(false);
    expect(pointInPolygon(s, k.poly)).toBe(true);
    expect(Math.hypot(s.x - r.entry!.x, s.y - r.entry!.y)).toBeLessThan(0.7);
    expect(nearestDoor(nav, r.entry!, 0)).toBeLessThan(1.0);
    expect(nearestDoor(nav, s, 0)).toBeLessThan(1.0);
    const f = forwardOf(r.yaw);
    const c = k.poly.reduce((a, v) => ({ x: a.x + v.x / k.poly.length, y: a.y + v.y / k.poly.length }), { x: 0, y: 0 });
    expect((c.x - s.x) * f.x + (c.y - s.y) * f.y).toBeGreaterThan(0);
    const reach = Math.min(75 * deg, Math.max(r.sweep.left, r.sweep.right) + 15 * deg);
    const wide = yawDiffs(k.poly, s, r.yaw);
    // Corners behind the doorway wall cannot be seen from it; the rest lie within the swing.
    expect(wide.filter((a) => a <= 110 * deg).every((a) => a <= reach + 1e-6 || reach >= 75 * deg - 1e-6)).toBe(true);
    expect(r.sweep.left).toBeGreaterThanOrEqual(20 * deg);
    expect(r.sweep.left).toBeLessThanOrEqual(75 * deg);
  });

  it("front start to hall: just inside the front door", () => {
    const hall = room(nav, 0, "Hallway (front)");
    const from = { ...startPose(nav, { kind: "front" }) };
    const r = go(nav, from, 0, hall.id, stand(nav, 0, "Hallway (front)"));
    const s = last(r)!;
    expect(pointInPolygon(s, hall.poly)).toBe(true);
    const front = nav.doors.find((d) => d.kind === "front")!;
    expect(Math.hypot(s.x - front.centre.x, s.y - front.centre.y)).toBeLessThan(1.2);
    expect(r.route.doors.some((d) => d.key === front.key)).toBe(true);
  });

  it("kitchen to garden: just outside the door it left by, facing away from the house", () => {
    const from = stand(nav, 0, "Kitchen");
    const garden = planTour(nav, from, open(nav)).find((t) => t.roomId === null)!;
    const g = { x: garden.at.x, y: garden.at.y, level: garden.level, stair: null };
    const res = routeTo(nav, from, g, open(nav));
    const route = (res as { route: WalkRoute }).route;
    const r = doorwayStop(nav, route, from, { level: 0, roomId: null })!;
    const s = last(r)!;
    expect(r.fallback).toBe(false);
    expect(pointInPolygon(s, nav.plot!)).toBe(true);
    expect(nav.levels[0].rooms.some((rm) => pointInPolygon(s, rm.poly))).toBe(false);
    const door = nav.doors.filter((d) => d.level === 0).sort((a, b) => Math.hypot(a.centre.x - r.entry!.x, a.centre.y - r.entry!.y) - Math.hypot(b.centre.x - r.entry!.x, b.centre.y - r.entry!.y))[0];
    expect(Math.hypot(s.x - door.centre.x, s.y - door.centre.y)).toBeLessThan(1.0);
    const f = forwardOf(r.yaw);
    const out = { x: s.x - r.entry!.x, y: s.y - r.entry!.y };
    expect(out.x * f.x + out.y * f.y).toBeGreaterThan(0);
    expect(r.route.doors.some((d) => d.key === door.key)).toBe(true);
  });

  it("already in the region: stays put and faces the middle", () => {
    const k = room(nav, 0, "Kitchen");
    const from = stand(nav, 0, "Kitchen");
    const r = go(nav, from, 0, k.id, from);
    expect(r.fallback).toBe(true);
    expect(r.route.points).toHaveLength(0);
    expect(r.sweep.left).toBeCloseTo(60 * deg);
  });
});

describe("doorwayStop, proposed", () => {
  it("landing to New Room: inside it, near its door", () => {
    const pn = buildNav(builtInProposed(""), listingSite(), false);
    const nr = room(pn, 1, "New Room");
    const from = stand(pn, 1, "Landing");
    const to = stand(pn, 1, "New Room");
    const r = go(pn, from, 1, nr.id, to);
    const s = last(r)!;
    expect(r.fallback).toBe(false);
    expect(pointInPolygon(s, nr.poly)).toBe(true);
    expect(nearestDoor(pn, s, 1)).toBeLessThan(1.2);
    expect(Math.hypot(s.x - r.entry!.x, s.y - r.entry!.y)).toBeLessThan(0.7);
  });
});
