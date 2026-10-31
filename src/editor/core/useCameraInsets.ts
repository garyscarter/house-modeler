import { SHEET_PEEK_PX, useSheet, viewOnlyNow } from "../../components/mobile/sheet";
import { useChassis } from "../../components/useChassis";
import { useStore } from "../../store";
import { canEdit } from "../../lib/chassis";

/** The dock (44 px) with its 12 px gap below, plus a 12 px breathing space above it. */
const DOCK_CLEAR = 12 + 44 + 12;
/** Fallback for the tool rail on the phone: 12 px in from the left, 54 px wide, 12 px clear. */
export const PHONE_LEFT_INSET = 12 + 54 + 12;

/** Whether the sheet takes no room at the bottom right now: hidden, or resting hidden in a view-only mode with nothing picked. */
const sheetGone = (): boolean => {
  const s = useSheet.getState();
  return s.detent === "hidden" || (viewOnlyNow() && !s.held);
};

/**
 * What covers the bottom of the canvas on the phone, measured when the camera fits: the dock and its breathing space,
 * plus the sheet at peek, or nothing when the sheet is hidden (the dock then drops to sit 12 px above the tab bar).
 */
export const phoneBottomInset = (): number => DOCK_CLEAR + (sheetGone() ? 0 : SHEET_PEEK_PX);

/**
 * The width the tool rail covers on the left of the canvas, from where it really is. A short rail (the view-only modes'
 * Select and Measure) sits in the top-left corner above the plan, so it needs no room; a tall one (Furnish) does.
 * No rail on screen (the view-only site plan) means nothing to clear.
 */
export function phoneLeftInset(): number {
  const rail = document.querySelector<HTMLElement>(".app[data-chassis='phone'] .tool-rail");
  const canvas = rail?.parentElement;
  if (!rail || !canvas) return 0;
  const r = rail.getBoundingClientRect();
  const c = canvas.getBoundingClientRect();
  // Not laid out yet: the rail's size follows from the mode, a short one for the view-only modes.
  if (!(r.width > 0 && r.height > 0)) return viewOnlyNow() ? 0 : PHONE_LEFT_INSET;
  return r.height < c.height * 0.2 ? 0 : Math.round(r.right - c.left) + 8;
}

/**
 * Camera options that depend on the chassis. On the phone the inspector is a bottom sheet, so nothing covers the
 * right and the bottom is covered instead; elsewhere the options are left out and the camera's defaults apply.
 * `fitSuffix` goes in the camera's fitKey so a rotation or resize across chassis refits, and so does moving between
 * the view-only modes (no sheet at rest, a lighter rail) and the editing ones.
 */
export function useCameraInsets(): { insetRight?: () => number; insetBottom?: () => number; insetLeft?: () => number; fitSuffix: string } {
  const chassis = useChassis((s) => s.chassis);
  const compact = useChassis((s) => s.compact);
  const viewOnly = useStore((s) => !canEdit(s.mode, compact));
  if (chassis !== "phone") return { fitSuffix: chassis };
  return { insetRight: () => 0, insetBottom: phoneBottomInset, insetLeft: phoneLeftInset, fitSuffix: `${chassis}${viewOnly ? "-view" : ""}` };
}
