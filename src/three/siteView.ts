import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Per-browser display options for the site. Kept out of the main store so
 * toggling them doesn't add undo steps or travel with exported projects.
 */
interface SiteView {
  /** Draw neighbouring buildings see-through so the garden behind them shows. */
  ghostNeighbours: boolean;
  /** Overlay hours of direct sun on the garden for the sun study's day. */
  sunHours: boolean;
  setSiteView: (p: Partial<Pick<SiteView, "ghostNeighbours" | "sunHours">>) => void;
}

export const useSiteView = create<SiteView>()(
  persist(
    (set) => ({
      ghostNeighbours: false,
      sunHours: false,
      setSiteView: (p) => set(p),
    }),
    {
      name: "house-modeler-site-view",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ ghostNeighbours: s.ghostNeighbours, sunHours: s.sunHours }),
    },
  ),
);
