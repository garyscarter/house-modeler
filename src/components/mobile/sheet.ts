import { create } from "zustand";
import { canEdit } from "../../lib/chassis";
import { useStore } from "../../store";
import { useChassis } from "../useChassis";

/**
 * The inspector's bottom sheet on the phone chassis. Four detents: hidden (out of sight, only in the view-only modes with
 * nothing selected), peek (the header only), half and full.
 * Selecting something on the canvas raises it; dragging the handle or tapping the header moves it.
 */
export type SheetDetent = "hidden" | "peek" | "half" | "full";

/** Height of the sheet at peek: the handle and the title row. Matches --sheet-peek in styles.css. */
export const SHEET_PEEK_PX = 64;
/** Height of the mode tab bar, before the safe-area inset. Matches --tabbar-h in styles.css. */
export const TAB_BAR_PX = 56;

/** The view-only modes (a phone in Build, Electrics, Garden, Plot, Review): nothing there can be changed, so the sheet rests hidden. */
export const viewOnlyNow = (): boolean => !canEdit(useStore.getState().mode, useChassis.getState().compact);

/** Where the sheet rests: hidden in a view-only mode with nothing selected, else at peek. */
export const restingDetent = (viewOnly: boolean, held: boolean): SheetDetent => (viewOnly && !held ? "hidden" : "peek");

interface SheetState {
  detent: SheetDetent;
  /** Something is selected, so the sheet stays on screen (at peek in the view-only modes). */
  held: boolean;
  set: (d: SheetDetent) => void;
  /** A selection was made: peek in the view-only modes (its one line names the pick), half in Decorate and Furnish. */
  raise: () => void;
  /** The selection was cleared or the canvas was tapped: back to rest. */
  lower: () => void;
  /** The mode (or the screen) changed: rest the sheet, keeping a half or full one open only where it can still help. */
  rest: () => void;
  /** Tapping the active tab: open the panel (half), or close it back to rest when already open. */
  toggle: () => void;
}

export const useSheet = create<SheetState>()((set, get) => ({
  detent: "peek",
  held: false,
  set: (detent) => set({ detent }),
  raise: () => {
    const viewOnly = viewOnlyNow();
    set((s) => {
      if (viewOnly) return { held: true, detent: s.detent === "hidden" ? "peek" : s.detent };
      return { held: true, detent: s.detent === "peek" || s.detent === "hidden" ? "half" : s.detent };
    });
  },
  lower: () => set({ held: false, detent: restingDetent(viewOnlyNow(), false) }),
  rest: () => {
    const viewOnly = viewOnlyNow();
    set((s) => ({ held: false, detent: viewOnly ? "hidden" : s.detent === "hidden" ? "peek" : s.detent === "full" ? "half" : s.detent }));
  },
  toggle: () => {
    const s = get();
    if (s.detent === "half" || s.detent === "full") set({ detent: restingDetent(viewOnlyNow(), s.held) });
    else set({ detent: "half" });
  },
}));
