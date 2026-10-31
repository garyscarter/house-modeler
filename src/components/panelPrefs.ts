import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ViewMode } from "../store";
import { isWheelMode, type WheelMode } from "../lib/wheelGesture";

const COMPARE_MODES: ViewMode[] = ["wipe", "side-by-side", "overlay"];

/**
 * Per-browser panel layout: which sections are open, the furniture category,
 * the sun panel, the collapsed inspector and the last compare style. Kept out of the main
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
  /** The compare style the layout switch's Compare segment returns to. */
  compareMode: Exclude<ViewMode, "single">;
  /** Quiet canvas: matte grey neighbours, a ground that fades into the page, neutral room fills and handles only on the selected room. */
  quiet: boolean;
  /** The one-time three-step coach strip after the first load has been dismissed. */
  coachDone: boolean;
  /** What a plain scroll wheel does on the plan and in 3D: "auto" tells a mouse from a trackpad by the event, else always zoom or always pan. */
  wheel: WheelMode;
  setPrefs: (p: Partial<Pick<PanelPrefs, "addCategory" | "sunOpen" | "inspectorCollapsed" | "compareMode" | "quiet" | "coachDone" | "wheel">>) => void;
}

export const usePanelPrefs = create<PanelPrefs>()(
  persist(
    (set) => ({
      open: {},
      setOpen: (id, v) => set((s) => (s.open[id] === v ? s : { open: { ...s.open, [id]: v } })),
      addCategory: "All",
      sunOpen: false,
      inspectorCollapsed: false,
      compareMode: "wipe",
      quiet: true,
      coachDone: false,
      wheel: "auto",
      setPrefs: (p) => set(p),
    }),
    {
      name: "house-modeler-panels",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ open: s.open, addCategory: s.addCategory, sunOpen: s.sunOpen, inspectorCollapsed: s.inspectorCollapsed, compareMode: s.compareMode, quiet: s.quiet, coachDone: s.coachDone, wheel: s.wheel }),
      merge: (persisted, current) => {
        const merged = { ...current, ...((persisted ?? {}) as Partial<PanelPrefs>) };
        if (!COMPARE_MODES.includes(merged.compareMode)) merged.compareMode = "wipe";
        if (!isWheelMode(merged.wheel)) merged.wheel = "auto";
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
