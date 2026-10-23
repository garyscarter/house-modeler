import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Per-browser panel layout: which sections are open, the Review tab, the
 * and the furniture category. Kept out of the main store so it
 * adds no undo steps and never travels with exported or synced projects.
 */
interface PanelPrefs {
  /** Section id to open (true) or closed (false); a section not listed uses its own default. */
  open: Record<string, boolean>;
  setOpen: (id: string, v: boolean) => void;
  reviewTab: "report" | "planning";
  /** Last furniture category chosen in the Add picker ("All" = none). */
  addCategory: string;
  setPrefs: (p: Partial<Pick<PanelPrefs, "reviewTab" | "addCategory">>) => void;
}

export const usePanelPrefs = create<PanelPrefs>()(
  persist(
    (set) => ({
      open: {},
      setOpen: (id, v) => set((s) => (s.open[id] === v ? s : { open: { ...s.open, [id]: v } })),
      reviewTab: "report",
      addCategory: "All",
      setPrefs: (p) => set(p),
    }),
    {
      name: "house-modeler-panels",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ open: s.open, reviewTab: s.reviewTab, addCategory: s.addCategory }),
    },
  ),
);

/** Chunks B and C import this name: `panelPrefs.getState().setOpen(id, true)`, or use the hook for rendering. */
export const panelPrefs = usePanelPrefs;

/** Open state of a section: the person's choice, else the default. */
export function useSectionOpen(id: string, defaultOpen: boolean): [boolean, (v: boolean) => void] {
  const open = usePanelPrefs((s) => s.open[id] ?? defaultOpen);
  const setOpen = usePanelPrefs((s) => s.setOpen);
  return [open, (v) => setOpen(id, v)];
}
