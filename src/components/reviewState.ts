import { create } from "zustand";
import { useStore } from "../store";

export type ReviewSection = "report" | "planning";

interface ReviewState {
  /** Which section to scroll to when opening; `nonce` makes repeated opens of the same section re-scroll. */
  section?: ReviewSection;
  nonce: number;
}

export const useReview = create<ReviewState>(() => ({ nonce: 0 }));

/** Review is a mode: opening it switches to Review mode (the page below the top bar is its open state). */
export function openReview(section?: ReviewSection) {
  useStore.getState().setMode("review");
  useReview.setState((s) => ({ section, nonce: s.nonce + 1 }));
}

/** Leave Review, back to the mode it was opened from. */
export function closeReview() {
  useStore.getState().leaveReview();
  useReview.setState({ section: undefined });
}
