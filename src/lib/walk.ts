import type { HouseModel, Site } from "../types";
import { areaOf, pointInPolygon, polygonCentroid, roomWorldPolygon, type V2 } from "./geometry";
import type { DoorStates, NavWorld, RouteResult, TourStop, WalkGoal, WalkHit, WalkPoint, WalkPose, WalkStart } from "./walkTypes";

/** STUB (foundation). Chunk B replaces this file; keep every exported name and signature. */
export const WALKER_R = 0.25;
export const MAX_STEP = 0.3;
const base = (m: HouseModel, level: number) => level * (m.ceilingHeight + m.slabThickness);

export function buildNav(model: HouseModel, site: Site | undefined, doorsOpen: boolean): NavWorld {
  void doorsOpen;
  const levels = model.floors.map((f) => ({
    level: f.level, floorId: f.id, baseY: base(model, f.level),
    rooms: f.rooms.map((r) => { const poly = roomWorldPolygon(f, r); return { id: r.id, name: r.name, poly, area: areaOf(poly) }; }),
  }));
  return { levels, flights: [], doors: [], plot: site?.boundary ?? null, internal: null };
}
export function initialDoors(nav: NavWorld): DoorStates {
  return Object.fromEntries(nav.doors.map((d) => [d.key, d.initial]));
}
export function startPose(nav: NavWorld, start: WalkStart): WalkPose {
  const lv = nav.levels.find((l) => l.level === (start.kind === "room" ? start.level : 0)) ?? nav.levels[0];
  const room = start.kind === "room" ? lv.rooms.find((r) => r.id === start.roomId) : undefined;
  const pts = lv.rooms.flatMap((r) => r.poly);
  const at = start.kind === "room" && start.at ? start.at : room ? polygonCentroid(room.poly)
    : { x: pts.reduce((s, p) => s + p.x, 0) / Math.max(1, pts.length), y: Math.max(...pts.map((p) => p.y)) + 2 };
  return { x: at.x, y: at.y, level: lv.level, stair: null, feetY: lv.baseY, yaw: 0, pitch: 0 };
}
export function stepWalker(nav: NavWorld, pose: WalkPose, dx: number, dy: number, doors: DoorStates): WalkPose {
  void nav; void doors;
  return { ...pose, x: pose.x + dx, y: pose.y + dy };
}
export function settle(nav: NavWorld, pose: WalkPose, doors: DoorStates): WalkPose {
  void nav; void doors;
  return pose;
}
export function pickTarget(nav: NavWorld, hit: WalkHit, from: WalkPose): WalkPoint | null {
  void from;
  const lv = [...nav.levels].sort((a, b) => Math.abs(a.baseY - hit.y) - Math.abs(b.baseY - hit.y))[0];
  return lv ? { x: hit.x, y: hit.z, level: lv.level, stair: null } : null;
}
export function goalPoint(nav: NavWorld, goal: WalkGoal): { point: WalkPoint; yaw?: number } | null {
  if (goal.kind === "point") return { point: { ...goal.at, level: goal.level, stair: null } };
  const room = nav.levels.find((l) => l.level === goal.level)?.rooms.find((r) => r.id === goal.roomId);
  return room ? { point: { ...polygonCentroid(room.poly), level: goal.level, stair: null } } : null;
}
export function routeTo(nav: NavWorld, from: WalkPose, to: WalkPoint, doors: DoorStates): RouteResult {
  void nav; void from; void doors;
  return { ok: true, route: { points: [to], doors: [] } };
}
export function planTour(nav: NavWorld, from: WalkPose, doors: DoorStates): TourStop[] {
  void from; void doors;
  return nav.levels.flatMap((l) => l.rooms.map((r) => ({ roomId: r.id, name: r.name, level: l.level, at: polygonCentroid(r.poly), yaw: 0 })));
}
export function roomAt(nav: NavWorld, level: number, p: V2): { id: string; name: string } | null {
  const r = nav.levels.find((l) => l.level === level)?.rooms.find((x) => pointInPolygon(p, x.poly));
  return r ? { id: r.id, name: r.name } : null;
}
