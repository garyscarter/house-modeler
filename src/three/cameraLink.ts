import type { V3 } from "../lib/cameraViews";

/**
 * A tiny module-level bus that keeps linked 3D views on one camera (side by
 * side, wipe) and remembers the last pose, so coming back from the plan, or a
 * new viewer, opens where you left off.
 */
export interface Pose {
  position: V3;
  target: V3;
}

type Listener = (from: string, p: Pose) => void;
const listeners = new Set<Listener>();
let last: Pose | null = null;

const copy = (p: Pose): Pose => ({ position: { ...p.position }, target: { ...p.target } });

/** Store `p` as the latest pose and tell every other viewer. */
export function publishPose(from: string, p: Pose): void {
  last = copy(p);
  for (const fn of [...listeners]) fn(from, copy(p));
}

export function subscribePose(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function lastPose(): Pose | null {
  return last ? copy(last) : null;
}

if (import.meta.env?.DEV && typeof window !== "undefined") Object.assign(window, { __houseCamera: { lastPose } });
