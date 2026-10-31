import "./mobile.css";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSheet, SHEET_PEEK_PX, type SheetDetent } from "./sheet";
import { useStore } from "../../store";
import { useChassis } from "../useChassis";

const ORDER: SheetDetent[] = ["peek", "half", "full"];
/** Faster than this (px per ms) a release snaps in the direction of travel, wherever the sheet is. */
const FLING = 0.5;
/** Less movement than this (px) is a tap, not a drag. */
const SLOP = 6;

/**
 * The pixel height of each detent inside a canvas of the given height. Half is half the canvas, or the content's own
 * height when that is less (`content`: the head plus the body at its natural height), so a short panel has no empty space.
 */
export const detentHeights = (canvas: number, content?: number): Record<SheetDetent, number> => ({
  hidden: 0,
  peek: SHEET_PEEK_PX,
  half: Math.max(SHEET_PEEK_PX, Math.min(Math.round(canvas / 2), content ? Math.ceil(content) : Infinity)),
  full: canvas - 8,
});

/**
 * Where a release lands: the nearest detent, or with a fling (px/ms, positive = upwards) the next detent that way.
 * Pure, so the gesture can be tested without a browser.
 */
export function settle(height: number, velocity: number, heights: Record<SheetDetent, number>): SheetDetent {
  if (Math.abs(velocity) > FLING) {
    const up = velocity > 0;
    const sorted = ORDER.map((d) => [d, heights[d]] as const);
    const next = up ? sorted.find(([, h]) => h > height + 1) : [...sorted].reverse().find(([, h]) => h < height - 1);
    return next ? next[0] : up ? "full" : "peek";
  }
  return ORDER.reduce((best, d) => (Math.abs(heights[d] - height) < Math.abs(heights[best] - height) ? d : best), "peek" as SheetDetent);
}

interface Drag {
  startY: number;
  startH: number;
  heights: Record<SheetDetent, number>;
  samples: [number, number][];
  moved: boolean;
}

/**
 * The phone's inspector: a sheet fixed to the bottom of the canvas with three detents. Drag the handle or header,
 * or tap the header to toggle peek and half. At the top of its body, pulling down lowers the sheet.
 */
export function BottomSheet({ title, subtitle, className = "", peeking, label, children }: { title: string; subtitle?: string; className?: string; peeking?: boolean; label: string; children: ReactNode }) {
  const detent = useSheet((s) => s.detent);
  const setDetent = useSheet((s) => s.set);
  const root = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const mode = useStore((s) => s.mode);
  const compact = useChassis((s) => s.compact);
  // A change of mode (or of screen) rests the sheet: hidden in a view-only mode with nothing picked, else where it was.
  useEffect(() => {
    useSheet.getState().rest();
  }, [mode, compact]);
  /** Live height in px while a finger is down; null otherwise. */
  const [dragH, setDragH] = useState<number | null>(null);
  const drag = useRef<Drag | null>(null);
  const open = detent === "half" || detent === "full";

  // Tell the chrome around the canvas (the dock) where the sheet is.
  useEffect(() => {
    const app = root.current?.closest(".app");
    app?.setAttribute("data-sheet", detent);
    return () => app?.removeAttribute("data-sheet");
  }, [detent]);

  const begin = (y: number) => {
    const el = root.current;
    const canvas = el?.parentElement?.clientHeight ?? 0;
    if (!el || !canvas) return false;
    const content = body.current ? (head.current?.offsetHeight ?? 0) + body.current.scrollHeight : undefined;
    drag.current = { startY: y, startH: el.getBoundingClientRect().height, heights: detentHeights(canvas, content), samples: [[performance.now(), y]], moved: false };
    return true;
  };
  const clampH = (d: Drag, y: number) => Math.max(d.heights.peek, Math.min(d.heights.full, d.startH + d.startY - y));
  const move = (y: number) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.abs(y - d.startY) < SLOP) return;
    d.moved = true;
    const now = performance.now();
    d.samples.push([now, y]);
    while (d.samples.length > 2 && now - d.samples[0][0] > 100) d.samples.shift();
    setDragH(clampH(d, y));
  };
  /** Settle on a detent. Returns true when the gesture was a tap (no real movement). */
  const end = (y: number): boolean => {
    const d = drag.current;
    drag.current = null;
    setDragH(null);
    if (!d) return false;
    if (!d.moved) return true;
    const [t, y0] = d.samples[0];
    const dt = performance.now() - t;
    const v = dt > 8 ? (y0 - y) / dt : 0;
    setDetent(settle(clampH(d, y), v, d.heights));
    return false;
  };

  const onHeadDown = (e: React.PointerEvent) => {
    if ((e.target as Element).closest("button:not(.sheet-title), a, input, select")) return;
    if (begin(e.clientY)) e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onHeadUp = (e: React.PointerEvent) => {
    if (!drag.current) return;
    if (end(e.clientY)) useSheet.getState().toggle();
  };

  // A pull-down that starts with the body scrolled to the top lowers the sheet; anything else scrolls. Touch events, so the
  // browser's own scroll can be cancelled (a pointer drag would be cancelled by the scroll instead).
  // The handlers are bound once (the body element is stable while the sheet is open) and reach the latest begin/move/end
  // through a ref, so a re-render mid-gesture (move() sets state) doesn't swap in a fresh closure that has forgotten the touch.
  const fns = useRef({ begin, move, end });
  fns.current = { begin, move, end };
  const touch = useRef<{ active: boolean; x0: number; y0: number; ignore: boolean } | null>(null);
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const start = (e: TouchEvent) => {
      const t = e.touches[0];
      // A slider, field or button is dragged or tapped in place; it never pulls the sheet.
      const ignore = !!(e.target as Element).closest?.("input, select, textarea, button, [role='slider']");
      touch.current = { active: false, x0: t.clientX, y0: t.clientY, ignore };
    };
    const mv = (e: TouchEvent) => {
      const s = touch.current;
      if (!s || s.ignore || e.touches.length !== 1) return;
      const { clientX: x, clientY: y } = e.touches[0];
      if (!s.active) {
        const dy = y - s.y0;
        if (el.scrollTop > 0 || dy < SLOP || Math.abs(x - s.x0) > dy) return; // scrolling, or a sideways drag
        if (!fns.current.begin(s.y0)) return;
        s.active = true;
      }
      if (e.cancelable) e.preventDefault();
      fns.current.move(y);
    };
    const fin = (e: TouchEvent) => {
      const s = touch.current;
      touch.current = null;
      if (!s?.active) return;
      fns.current.end(e.changedTouches[0]?.clientY ?? s.y0);
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", mv, { passive: false });
    el.addEventListener("touchend", fin);
    el.addEventListener("touchcancel", fin);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", mv);
      el.removeEventListener("touchend", fin);
      el.removeEventListener("touchcancel", fin);
    };
  }, [open]);

  return (
    <section
      ref={root}
      className={`sheet float-card ${className}${peeking ? " peeking" : ""}${dragH !== null ? " dragging" : ""}`.trim()}
      data-detent={detent}
      style={dragH !== null ? { height: dragH } : undefined}
      inert={peeking || detent === "hidden"}
      aria-hidden={detent === "hidden" || undefined}
      aria-label={label}
    >
      <div
        ref={head}
        className="sheet-head"
        onPointerDown={onHeadDown}
        onPointerMove={(e) => drag.current && move(e.clientY)}
        onPointerUp={onHeadUp}
        onPointerCancel={() => {
          drag.current = null;
          setDragH(null);
        }}
      >
        <span className="sheet-handle" aria-hidden="true" />
        <button type="button" className="sheet-title" aria-expanded={open} onClick={(e) => e.detail === 0 && useSheet.getState().toggle()}>
          <h2>{title}</h2>
          {subtitle && <p className="mode-sub">{subtitle}</p>}
        </button>
      </div>
      {open && (
        <div className="sheet-body" ref={body}>
          {children}
        </div>
      )}
    </section>
  );
}
