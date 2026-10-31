import { create } from "zustand";
import { canEdit, chassisFor, isCompact, type Chassis } from "../lib/chassis";
import type { Mode } from "../lib/modes";
import { useStore } from "../store";

/**
 * The chassis the app is running in (see lib/chassis.ts) and whether the primary pointer is a finger.
 * Kept in a tiny store so any component can read it; `startChassisWatch` keeps it current.
 */
interface ChassisState {
  chassis: Chassis;
  touch: boolean;
  width: number;
  height: number;
  /** Shortest side under 600 px: a phone. Only Decorate and Furnish edit there (lib/chassis.ts canEdit). */
  compact: boolean;
}

const read = (): ChassisState => {
  if (typeof window === "undefined") return { chassis: "desktop", touch: false, width: 1440, height: 900, compact: false };
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const width = window.innerWidth;
  const height = window.innerHeight;
  return { chassis: chassisFor({ width, height, coarse }), touch: coarse, width, height, compact: isCompact({ width, height }) };
};

export const useChassis = create<ChassisState>()(() => read());

let watching = false;
/** Follow resizes, rotations and pointer changes. Idempotent; call once from App. */
export function startChassisWatch(): void {
  if (watching || typeof window === "undefined") return;
  watching = true;
  const update = () => {
    // A soft keyboard shrinks the viewport while a field has focus; re-read once it closes (focusout) instead of flipping chassis.
    if (document.activeElement?.matches("input, textarea, select")) return;
    const next = read();
    const cur = useChassis.getState();
    if (next.chassis !== cur.chassis || next.touch !== cur.touch || next.width !== cur.width || next.height !== cur.height || next.compact !== cur.compact) useChassis.setState(next);
  };
  window.addEventListener("resize", update);
  window.addEventListener("orientationchange", update);
  document.addEventListener("focusout", () => setTimeout(update, 50));
  window.matchMedia?.("(pointer: coarse)").addEventListener?.("change", update);
  update();
}

/** Whether the model may be edited in `mode` on this screen (lib/chassis.ts canEdit); for handlers and callbacks. */
export const canEditNow = (mode: Mode): boolean => canEdit(mode, useChassis.getState().compact);
/** The same as a hook, for the current mode (or the one given). */
export function useCanEdit(mode?: Mode): boolean {
  const current = useStore((s) => s.mode);
  const compact = useChassis((s) => s.compact);
  return canEdit(mode ?? current, compact);
}
