import { useEffect } from "react";
import { useStore } from "../store";
import { keyBelongsElsewhere } from "../lib/nudge";
import { dockFloorPick, floorForKey, spaceKeyApplies, tabKeyApplies, tabSwitchPatch } from "../lib/studio";

const isTextField = (t: EventTarget | null) => {
  const tag = (t as HTMLElement | null)?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
};

/**
 * The app-wide keys: undo and redo, Tab (Plan / 3D), 1-9 and 0 (floors) and holding Space to peek at the other layout.
 * Used once, in App. Text fields, dialogs and Review keep their own keys.
 */
export function useStudioKeys() {
  useEffect(() => {
    const st = () => useStore.getState();

    const onKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl+Y redo. Text fields keep their own undo.
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        if (isTextField(e.target)) return;
        const k = e.key.toLowerCase();
        if (k === "z" && !e.shiftKey) {
          e.preventDefault();
          st().undo();
        } else if ((k === "z" && e.shiftKey) || k === "y") {
          e.preventDefault();
          st().redo();
        }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const s = st();
      const model = s.variants[s.activeVariant];
      if (!model || s.mode === "review" || keyBelongsElsewhere(e.target, document)) return;

      if (e.key === "Tab") {
        if (e.shiftKey || !tabKeyApplies(e.target)) return;
        e.preventDefault();
        s.setUi(tabSwitchPatch(s, model.floors, s.tab === "3d" ? "plan" : "3d"));
        return;
      }
      if (e.key === " " || e.code === "Space") {
        if (!spaceKeyApplies(e.target)) return;
        if (s.peek) {
          e.preventDefault(); // held: repeats keep the page from scrolling
          return;
        }
        if (e.repeat) return;
        s.setPeek(true);
        if (st().peek) e.preventDefault();
        return;
      }
      if (s.peek) return; // the floor shown is the one you left; digits wait for release
      if (e.shiftKey || !/^[0-9]$/.test(e.key)) return;
      if (s.tab === "plan" && s.mode === "plot") return;
      const pick = floorForKey(model.floors, e.key);
      if (pick === null || (pick === "all" && s.tab !== "3d")) return;
      e.preventDefault();
      s.setUi(dockFloorPick(s, model.floors, pick));
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== " " && e.code !== "Space") return;
      if (!st().peek) return;
      e.preventDefault(); // a focused button would otherwise be clicked on release
      st().setPeek(false);
    };
    const onBlur = () => st().setPeek(false);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
}
