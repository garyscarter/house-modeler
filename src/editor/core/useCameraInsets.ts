import { SHEET_PEEK_PX } from "../../components/mobile/sheet";
import { useChassis } from "../../components/useChassis";

/** On the phone the sheet at peek (64) plus the dock (12 gap + 44) plus a 12 px breathing space cover the bottom. */
export const PHONE_BOTTOM_INSET = SHEET_PEEK_PX + 12 + 44 + 12;
/** On the phone the 54 px tool rail sits 12 px in from the left; keep the plan 12 px clear of it. */
export const PHONE_LEFT_INSET = 12 + 54 + 12;

/**
 * Camera options that depend on the chassis. On the phone the inspector is a bottom sheet, so nothing covers the
 * right and the bottom is covered instead; elsewhere the options are left out and the camera's defaults apply.
 * `fitSuffix` goes in the camera's fitKey so a rotation or resize across chassis refits.
 */
export function useCameraInsets(): { insetRight?: () => number; insetBottom?: () => number; insetLeft?: () => number; fitSuffix: string } {
  const chassis = useChassis((s) => s.chassis);
  if (chassis !== "phone") return { fitSuffix: chassis };
  return { insetRight: () => 0, insetBottom: () => PHONE_BOTTOM_INSET, insetLeft: () => PHONE_LEFT_INSET, fitSuffix: chassis };
}
