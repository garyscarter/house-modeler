import { pointInPolygon, type V2 } from "./geometry";
import type { NavWorld } from "./walkTypes";
import type { DoorStates } from "./walkTypes";

/**
 * Walk-through logic (docs/walkthrough-plan.md, Chunk B), the API the walk controller and HUD use:
 * the walkable world (walkNav), moving and the stairs (walkMove), routes, taps and goals (walkRoute) and
 * the guided tour (walkTour).
 */
export { WALKER_R, MAX_STEP, buildNav } from "./walkNav";
export { startPose, stepWalker, settle } from "./walkMove";
export { pickTarget, goalPoint, routeTo } from "./walkRoute";
export { planTour } from "./walkTour";

/** Every door's starting state (open or shut), by doorKey. */
export function initialDoors(nav: NavWorld): DoorStates {
  return Object.fromEntries(nav.doors.map((d) => [d.key, d.initial]));
}

/** The room at a plan point on a storey, or null. */
export function roomAt(nav: NavWorld, level: number, p: V2): { id: string; name: string } | null {
  const r = nav.levels.find((l) => l.level === level)?.rooms.find((x) => pointInPolygon(p, x.poly));
  return r ? { id: r.id, name: r.name } : null;
}
