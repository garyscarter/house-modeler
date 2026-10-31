import type { Cam, Rect, Size } from "./planMath";

/** Screen pixels kept clear between a revealed selection and the edge of the free area. */
export const VISIBLE_MARGIN = 16;

/**
 * The camera moved just far enough up or down that `rect` (model units) sits inside the area the bottom chrome leaves
 * free: the canvas minus `insetBottom` screen px. A selection taller than the free area keeps its top in view.
 * Returns the same camera when nothing needs to move. Pure; a camera maps model units to screen by (p - cam) / cam.s.
 */
export function camToShow(cam: Cam, size: Size, rect: Rect, insetBottom: number, margin = VISIBLE_MARGIN): Cam {
  const free = size.h - Math.max(0, insetBottom);
  const top = (rect.y0 - cam.y) / cam.s;
  const bottom = (rect.y1 - cam.y) / cam.s;
  let dy = 0; // screen px the content must move up
  if (bottom > free - margin) dy = Math.min(bottom - (free - margin), top - margin);
  else if (top < margin) dy = Math.max(top - margin, bottom - (free - margin) > 0 ? 0 : top - margin);
  if (Math.abs(dy) < 1) return cam;
  return { ...cam, y: cam.y + dy * cam.s };
}
