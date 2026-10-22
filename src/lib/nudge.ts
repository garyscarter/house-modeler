import type { Fixture, Opening, Pt } from "../types";

/** One arrow-key press moves this far (metres); Shift makes it ten times that. */
export const NUDGE_M = 0.01;
export const NUDGE_SHIFT_M = 0.1;

const ARROWS: Record<string, Pt> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

/**
 * Screen direction of an arrow key in metres, or null for other keys. Both
 * editors draw with x to the right and y down the screen (neither view
 * rotates), so up is -y.
 */
export function arrowDelta(key: string, shift: boolean): Pt | null {
  const a = ARROWS[key];
  if (!a) return null;
  const m = shift ? NUDGE_SHIFT_M : NUDGE_M;
  return { x: a.x * m, y: a.y * m };
}

/**
 * True when a key press belongs to something else: a text field, a
 * contenteditable under focus, or an open dialog. Duck-typed so it also works
 * with plain objects in tests.
 */
export function keyBelongsElsewhere(target: EventTarget | null, doc?: { querySelector(s: string): unknown }): boolean {
  const t = target as { tagName?: string; isContentEditable?: boolean; closest?: (s: string) => unknown } | null;
  const tag = t?.tagName?.toUpperCase();
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return true;
  if (t?.isContentEditable) return true;
  if (t?.closest?.('[contenteditable="true"], [contenteditable=""], [role="dialog"]')) return true;
  return !!doc?.querySelector('[role="dialog"]');
}

export const shiftPts = (pts: Pt[], dx: number, dy: number): Pt[] => pts.map((p) => ({ x: p.x + dx, y: p.y + dy }));

/**
 * Slide an opening along the wall segment [a, b] by (dx, dy) in px. Only the
 * movement along the opening's orientation counts ("h" walls run left-right,
 * so only dx; "v" only dy). The centre stays at least half the opening's width
 * from each end of the wall (centred if the wall is shorter than the opening).
 */
export function slideOpening(o: Pick<Opening, "x" | "y" | "orientation" | "widthM">, wall: [Pt, Pt], dx: number, dy: number, pxPerM: number): Pt {
  const h = o.orientation === "h";
  const cur = h ? o.x : o.y;
  const lo = h ? Math.min(wall[0].x, wall[1].x) : Math.min(wall[0].y, wall[1].y);
  const hi = h ? Math.max(wall[0].x, wall[1].x) : Math.max(wall[0].y, wall[1].y);
  const half = (o.widthM * pxPerM) / 2;
  const next = cur + (h ? dx : dy);
  const v = hi - lo <= 2 * half ? (lo + hi) / 2 : Math.min(hi - half, Math.max(lo + half, next));
  return h ? { x: v, y: o.y } : { x: o.x, y: v };
}

/** Paste offset (metres) when the copy would sit exactly on an existing one. */
export const PASTE_OFFSET_M = 0.3;

/**
 * Where a pasted fixture goes: its own x / y when that is inside the image,
 * else the view centre; then stepped by 0.3 m (down and right) while another
 * fixture of the same type already sits there, so the copy is visible.
 */
export function pasteAt(src: Pick<Fixture, "type" | "x" | "y">, existing: Pick<Fixture, "type" | "x" | "y">[], image: { w: number; h: number }, viewCentre: Pt, pxPerM: number): Pt {
  const inside = src.x >= 0 && src.y >= 0 && src.x <= image.w && src.y <= image.h;
  let p = inside ? { x: src.x, y: src.y } : { ...viewCentre };
  const tol = 0.02 * pxPerM;
  const step = PASTE_OFFSET_M * pxPerM;
  for (let i = 0; i < 100 && existing.some((f) => f.type === src.type && Math.abs(f.x - p.x) < tol && Math.abs(f.y - p.y) < tol); i++) p = { x: p.x + step, y: p.y + step };
  return p;
}
