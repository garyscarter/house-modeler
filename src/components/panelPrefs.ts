import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { isLook, type Look } from "../lib/studio";

/**
 * Per-browser panel layout: which sections are open, the furniture category,
 * the sun panel, the collapsed inspector and the look. Kept out of the main
 * store so it adds no undo steps and never travels with exported or synced projects.
 */
interface PanelPrefs {
  /** Section id to open (true) or closed (false); a section not listed uses its own default. */
  open: Record<string, boolean>;
  setOpen: (id: string, v: boolean) => void;
  /** Last furniture category chosen in the Add picker ("All" = none). */
  addCategory: string;
  /** The sun study panel is open (toggled from the dock). */
  sunOpen: boolean;
  /** The floating inspector card shows only its header. */
  inspectorCollapsed: boolean;
  /** Studio (solid) or Glass (translucent floating cards). Per browser, not synced. */
  look: Look;
  setPrefs: (p: Partial<Pick<PanelPrefs, "addCategory" | "sunOpen" | "inspectorCollapsed" | "look">>) => void;
}

export const usePanelPrefs = create<PanelPrefs>()(
  persist(
    (set) => ({
      open: {},
      setOpen: (id, v) => set((s) => (s.open[id] === v ? s : { open: { ...s.open, [id]: v } })),
      addCategory: "All",
      sunOpen: false,
      inspectorCollapsed: false,
      look: "studio",
      setPrefs: (p) => set(p),
    }),
    {
      name: "house-modeler-panels",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ open: s.open, addCategory: s.addCategory, sunOpen: s.sunOpen, inspectorCollapsed: s.inspectorCollapsed, look: s.look }),
      merge: (persisted, current) => {
        const merged = { ...current, ...((persisted ?? {}) as Partial<PanelPrefs>) };
        if (!isLook(merged.look)) merged.look = "studio";
        return merged;
      },
    },
  ),
);

/** Open state of a section: the person's choice, else the default. */
export function useSectionOpen(id: string, defaultOpen: boolean): [boolean, (v: boolean) => void] {
  const open = usePanelPrefs((s) => s.open[id] ?? defaultOpen);
  const setOpen = usePanelPrefs((s) => s.setOpen);
  return [open, (v) => setOpen(id, v)];
}
