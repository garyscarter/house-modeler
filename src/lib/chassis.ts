/**
 * Which chassis the app runs in. Pure, so the breakpoints are tested once and read everywhere.
 *
 * - phone: a bottom tab bar for the modes and the inspector as a bottom sheet (phones in either orientation, iPad portrait).
 * - tablet: the desktop skeleton (top bar, floating card, dock) with touch-sized targets (iPad landscape, any touch screen 900 px and up).
 * - desktop: the Studio skeleton as designed, mouse and keyboard, 1180 px and up.
 */
export type Chassis = "phone" | "tablet" | "desktop";

export interface Screen {
  width: number;
  height: number;
  /** The primary pointer is coarse (a finger). */
  coarse: boolean;
}

/** Below this width (or height) the phone chassis is used. iPad portrait (768–834 px) lands here on purpose. */
export const PHONE_MAX = 899;
/** From this width, with a fine pointer, the desktop skeleton is used as designed. */
export const DESKTOP_MIN = 1180;

export function chassisFor(s: Screen): Chassis {
  if (s.width <= PHONE_MAX || s.height < 480) return "phone";
  if (s.width < DESKTOP_MIN || s.coarse) return "tablet";
  return "desktop";
}

/** What each chassis offers. The rest of the app reads these rather than testing the chassis itself. */
export interface Features {
  /** Drawing tools on the plan: rectangle, room, wall, canopy, gap and calibrate. Off on phones; doors, windows and measure stay. */
  draw: boolean;
  /** Side-by-side compare (two 3D views). Wipe and overlay are always available. */
  sideBySide: boolean;
  /** The saved camera views menu in the dock. */
  savedViews: boolean;
  /** The Glass look (translucent, blurred cards). Blur is slow on phone and tablet GPUs. */
  glass: boolean;
}

export const FEATURES: Record<Chassis, Features> = {
  phone: { draw: false, sideBySide: false, savedViews: false, glass: false },
  tablet: { draw: true, sideBySide: false, savedViews: false, glass: false },
  desktop: { draw: true, sideBySide: true, savedViews: true, glass: true },
};

/** The tools the chassis cannot offer; the plan rail filters these out. */
export const DRAW_TOOLS = ["rect", "circle", "polygon", "room", "wall", "canopy", "gap", "calibrate"] as const;
export const toolAllowed = (chassis: Chassis, tool: string): boolean => FEATURES[chassis].draw || !(DRAW_TOOLS as readonly string[]).includes(tool);

/** The compare mode to show: side by side falls back to wipe where two views don't fit. */
export function effectiveCompare<M extends string>(viewMode: M, chassis: Chassis, both: boolean, single: M, wipe: M, sideBySide: M): M {
  if (!both) return single;
  if (viewMode === sideBySide && !FEATURES[chassis].sideBySide) return wipe;
  return viewMode;
}
