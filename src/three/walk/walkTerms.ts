import type * as THREE from "three";
import type { NavWorld, WalkPose } from "../../lib/walkTypes";
import type { LensClass } from "../../lib/walkLens";

/**
 * The walk's busy-term registry: pieces that move the view in time (the look-round, gaze lead, start and stop ramps,
 * eye adaptation, the natural step) register a term here and WalkControls steps them every frame, so each asks for
 * another frame only while it is still converging. One term per name; the registry is global because only the main
 * chrome view mounts WalkControls.
 */

/** What every walk term sees each frame (built by WalkControls). */
export interface WalkTermCtx {
  dt: number;
  nav: NavWorld;
  pose: WalkPose | null;
  camera: THREE.PerspectiveCamera;
  /** The walker was placed, teleported (moved > 1 m in a frame) or changed level this frame: terms snap rather than ease. */
  jumped: boolean;
  /** A tour look-round is running. */
  looking: boolean;
  /** Plan speed m/s and yaw rate rad/s over the last frame. */
  speed: number;
  yawRate: number;
  lens: { cls: LensClass; aspect: number; hfov: number; vfov: number };
}
export type WalkTermName = "look" | "gaze" | "ramp" | "exposure" | "step";
export interface WalkTerm {
  /** Advance by ctx.dt; true while still converging (asks for another frame). Must return false once converged. */
  step(ctx: WalkTermCtx): boolean;
  /** A number for tests and __walk.state() (exposure: EV; step: amplitude 0..1). */
  probe?(): number;
}

const terms = new Map<WalkTermName, WalkTerm>();

/** Register a term; returns the unregister function. One term per name. */
export function registerWalkTerm(name: WalkTermName, term: WalkTerm): () => void {
  terms.set(name, term);
  return () => {
    if (terms.get(name) === term) terms.delete(name);
  };
}

/** Step every registered term; adds the busy ones' names to `busy`; true if any is busy. */
export function stepWalkTerms(ctx: WalkTermCtx, busy: Set<string>): boolean {
  let any = false;
  for (const [name, term] of terms) {
    if (term.step(ctx)) {
      busy.add(name);
      any = true;
    }
  }
  return any;
}

export function probeWalkTerm(name: WalkTermName): number | undefined {
  return terms.get(name)?.probe?.();
}

/** Walk-only frame requests, counted in dev for tests (useFrame and __walk.sim both count). */
export const walkCounters: { invalidates: number } = { invalidates: 0 };
