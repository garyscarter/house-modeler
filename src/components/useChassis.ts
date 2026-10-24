import { create } from "zustand";
import { chassisFor, type Chassis } from "../lib/chassis";

/**
 * The chassis the app is running in (see lib/chassis.ts) and whether the primary pointer is a finger.
 * Kept in a tiny store so any component can read it; `startChassisWatch` keeps it current.
 */
interface ChassisState {
  chassis: Chassis;
  touch: boolean;
  width: number;
  height: number;
}

const read = (): ChassisState => {
  if (typeof window === "undefined") return { chassis: "desktop", touch: false, width: 1440, height: 900 };
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const width = window.innerWidth;
  const height = window.innerHeight;
  return { chassis: chassisFor({ width, height, coarse }), touch: coarse, width, height };
};

export const useChassis = create<ChassisState>()(() => read());

let watching = false;
/** Follow resizes, rotations and pointer changes. Idempotent; call once from App. */
export function startChassisWatch(): void {
  if (watching || typeof window === "undefined") return;
  watching = true;
  const update = () => {
    const next = read();
    const cur = useChassis.getState();
    if (next.chassis !== cur.chassis || next.touch !== cur.touch || next.width !== cur.width || next.height !== cur.height) useChassis.setState(next);
  };
  window.addEventListener("resize", update);
  window.addEventListener("orientationchange", update);
  window.visualViewport?.addEventListener("resize", update);
  window.matchMedia?.("(pointer: coarse)").addEventListener?.("change", update);
  update();
}
