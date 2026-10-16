/**
 * Shared geometry of a bi-fold door, used by the 3D model and by the plan
 * symbols (editor and exported drawings) so they always agree.
 */

/** Jamb width taken from each side of an external bi-fold (its frame) and an internal one (its lining), metres. */
const JAMB_EXTERNAL = 0.06;
const JAMB_INTERNAL = 0.025;
/** Angle the folded panels make with the wall. */
export const BIFOLD_FOLD = (78 * Math.PI) / 180;

export interface BifoldLayout {
  /** Number of panels. */
  n: number;
  /** Clear width between the jambs, metres. */
  clear: number;
  /** Width of one panel. */
  panel: number;
  /** How far each panel advances along the wall when folded. */
  run: number;
  /** How far each panel projects from the wall line when folded. */
  throw: number;
}

/** Panels of a bi-fold door of this clear width (about 0.6-0.9 m each). */
export function bifoldPanels(clear: number): number {
  return Math.max(2, Math.round(clear / 0.8));
}

/** Layout of a bi-fold in an opening of the given width; internal ones have a slimmer lining instead of a frame. */
export function bifoldLayout(openingWidth: number, internal: boolean): BifoldLayout {
  const clear = Math.max(0.2, openingWidth - 2 * (internal ? JAMB_INTERNAL : JAMB_EXTERNAL));
  const n = bifoldPanels(clear);
  const panel = clear / n;
  return { n, clear, panel, run: panel * Math.cos(BIFOLD_FOLD), throw: panel * Math.sin(BIFOLD_FOLD) };
}

/**
 * The folded panels as a zigzag polyline in the opening's local frame (x along
 * the wall from its centre, y towards the swing side, metres): the stack sits
 * against the hinge jamb and folds out to `swing`.
 */
export function bifoldZigzag(l: BifoldLayout, hinge: 1 | -1, swing: 1 | -1): { x: number; y: number }[] {
  return Array.from({ length: l.n + 1 }, (_, i) => ({ x: hinge * (l.clear / 2 - i * l.run), y: i % 2 ? swing * l.throw : 0 }));
}
