import { useEffect } from "react";
import { useChassis } from "./useChassis";

/** A drag must travel this far (px) before it counts as a gesture, so a tap never flashes the chrome. */
const DRAG_PX = 8;
/** The chrome comes back this long after the last finger lifts. */
const RESTORE_MS = 400;

/**
 * Phone only: while a finger drags or pinches the 3D canvas or the plan/site drawing, the floating chrome steps back
 * (one CSS rule in mobile/mobile.css keys off `data-gesture` on `.app`). The attribute is written straight onto the
 * DOM, not through React state, so a gesture never re-renders the app.
 */
export function useGestureFade() {
  useEffect(() => {
    const down = new Map<number, { x: number; y: number }>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const app = () => document.querySelector<HTMLElement>(".app");
    const set = (on: boolean) => {
      const el = app();
      if (!el) return;
      if (on) el.setAttribute("data-gesture", "");
      else el.removeAttribute("data-gesture");
    };
    const onCanvas = (t: EventTarget | null) => {
      if (!(t instanceof Element)) return false;
      if (t.closest(".float-card, .sheet, .island, button, .popover, .tab-bar")) return false;
      if (!t.closest("main")) return false;
      return t instanceof HTMLCanvasElement || !!t.closest("svg");
    };
    const pointerDown = (e: PointerEvent) => {
      if (useChassis.getState().chassis !== "phone") return;
      if (down.size === 0 && !onCanvas(e.target)) return;
      if (down.size > 0 && !down.has(e.pointerId)) {
        // A second finger on the drawing: a pinch.
        clearTimeout(timer);
        down.set(e.pointerId, { x: e.clientX, y: e.clientY });
        set(true);
        return;
      }
      clearTimeout(timer);
      down.set(e.pointerId, { x: e.clientX, y: e.clientY });
    };
    const pointerMove = (e: PointerEvent) => {
      const start = down.get(e.pointerId);
      if (!start) return;
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > DRAG_PX) set(true);
    };
    const pointerUp = (e: PointerEvent) => {
      if (!down.delete(e.pointerId)) return;
      if (down.size > 0) return;
      clearTimeout(timer);
      timer = setTimeout(() => set(false), RESTORE_MS);
    };
    document.addEventListener("pointerdown", pointerDown, true);
    document.addEventListener("pointermove", pointerMove, true);
    document.addEventListener("pointerup", pointerUp, true);
    document.addEventListener("pointercancel", pointerUp, true);
    return () => {
      document.removeEventListener("pointerdown", pointerDown, true);
      document.removeEventListener("pointermove", pointerMove, true);
      document.removeEventListener("pointerup", pointerUp, true);
      document.removeEventListener("pointercancel", pointerUp, true);
      clearTimeout(timer);
      set(false);
    };
  }, []);
}
