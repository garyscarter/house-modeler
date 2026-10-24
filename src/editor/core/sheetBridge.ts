import { useChassis } from "../../components/useChassis";
import { useSheet } from "../../components/mobile/sheet";

/**
 * The editors and the phone's inspector sheet: a tap that selects something brings the sheet up from peek, and a
 * tap on empty canvas that clears the selection drops it back. Both do nothing off the phone chassis.
 */
export const raiseSheet = (): void => {
  if (useChassis.getState().chassis === "phone") useSheet.getState().raise();
};
export const lowerSheet = (): void => {
  if (useChassis.getState().chassis === "phone") useSheet.getState().lower();
};
