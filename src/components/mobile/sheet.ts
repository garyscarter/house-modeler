import { create } from "zustand";

/**
 * The inspector's bottom sheet on the phone chassis. Three detents: peek (the header only), half and full.
 * Selecting something on the canvas raises it to half; dragging the handle or tapping the header moves it.
 */
export type SheetDetent = "peek" | "half" | "full";

/** Height of the sheet at peek: the handle and the title row. Matches --sheet-peek in styles.css. */
export const SHEET_PEEK_PX = 64;
/** Height of the mode tab bar, before the safe-area inset. Matches --tabbar-h in styles.css. */
export const TAB_BAR_PX = 56;

interface SheetState {
  detent: SheetDetent;
  set: (d: SheetDetent) => void;
  /** Bring the sheet up to half if it is at peek (a selection was made). */
  raise: () => void;
  /** Drop the sheet to peek (the selection was cleared or the canvas was tapped). */
  lower: () => void;
}

export const useSheet = create<SheetState>()((set) => ({
  detent: "peek",
  set: (detent) => set({ detent }),
  raise: () => set((s) => (s.detent === "peek" ? { detent: "half" } : s)),
  lower: () => set({ detent: "peek" }),
}));
