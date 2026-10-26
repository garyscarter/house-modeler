import { uid, type GardenItem, type Site, type WPt } from "../../types";
import { gardenDef, isPlant, itemSize, type GardenDef } from "../../lib/gardenCatalogue";
import { itemsOf } from "../../lib/siteItems";

/** Pure edits for the Garden tools: each takes a site and returns the next one (the editor passes them to `updateSite`). */

export const ROT_STEP = 15;
const g05 = (v: number) => Math.round(v * 20) / 20;
/** Smallest size a resize handle can drag an item to, metres. */
export const MIN_SIZE = 0.1;
/** A run placed without a second click (phone, the Garden panel) is this long, metres. */
export const DEFAULT_RUN_M = 3;

/** Degrees clockwise from "up" (-y) to the direction from `c` to `p`, 0 to 360. */
export function angleToward(c: WPt, p: WPt): number {
  const a = (Math.atan2(p.x - c.x, -(p.y - c.y)) * 180) / Math.PI;
  return ((a % 360) + 360) % 360;
}

/** A turn in degrees, kept to 0..360, snapped to `step` unless `free`. */
export function snapRot(deg: number, free = false, step = ROT_STEP): number {
  const v = free ? Math.round(deg) : Math.round(deg / step) * step;
  return ((v % 360) + 360) % 360;
}

/** `p` in an item's local frame: origin at its centre, turned back by its rotation (local -y is its back). */
export function toLocal(item: Pick<GardenItem, "x" | "y" | "rot">, p: WPt): WPt {
  const a = (item.rot * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const dx = p.x - item.x;
  const dy = p.y - item.y;
  return { x: dx * c + dy * s, y: -dx * s + dy * c };
}

/** The world point of a local point (the inverse of `toLocal`). */
export function fromLocal(item: Pick<GardenItem, "x" | "y" | "rot">, l: WPt): WPt {
  const a = (item.rot * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: item.x + l.x * c - l.y * s, y: item.y + l.x * s + l.y * c };
}

/** A new item of `def` at `p`: runs get `to` (a second end, or `DEFAULT_RUN_M` along +x). */
export function newItem(def: GardenDef, p: WPt, rot = 0, to?: WPt): GardenItem {
  const item: GardenItem = { id: uid(), type: def.id, x: p.x, y: p.y, rot: def.run ? 0 : rot };
  if (def.run) item.to = to ?? { x: p.x + DEFAULT_RUN_M, y: p.y };
  return item;
}

export const addItem = (site: Site, item: GardenItem): Site => ({ ...site, items: [...itemsOf(site), item] });

/** Change fields of one item. */
export const patchItem = (site: Site, id: string, patch: Partial<GardenItem>): Site => ({ ...site, items: itemsOf(site).map((it) => (it.id === id ? { ...it, ...patch } : it)) });

/** Change fields of several items at once. */
export const patchItems = (site: Site, ids: readonly string[], patch: Partial<GardenItem>): Site => ({ ...site, items: itemsOf(site).map((it) => (ids.includes(it.id) ? { ...it, ...patch } : it)) });

export const removeItems = (site: Site, ids: readonly string[]): Site => ({ ...site, items: itemsOf(site).filter((it) => !ids.includes(it.id)) });

/** Turn items by `deg` (runs are not turned; they have no rotation). */
export function rotateItems(site: Site, ids: readonly string[], deg: number): Site {
  return { ...site, items: itemsOf(site).map((it) => (ids.includes(it.id) && !it.to ? { ...it, rot: snapRot(it.rot + deg, true) } : it)) };
}

/** Plants are rotationally symmetric; rotation does nothing visible for them. */
export const canRotate = (item: GardenItem): boolean => {
  const def = gardenDef(item.type);
  return !item.to && !!def && !isPlant(def);
};

/** What dragging the east handle (spread) or an edge handle does to an item, given the pointer in its local frame. */
export function resizePatch(item: GardenItem, handle: "spread" | "w" | "d", local: WPt): Partial<GardenItem> {
  const def = gardenDef(item.type);
  const size = itemSize(item);
  if (handle === "spread") {
    const v = Math.max(MIN_SIZE, g05(Math.hypot(local.x, local.y) * 2));
    return { w: v, d: v };
  }
  if (handle === "w") return { w: Math.max(MIN_SIZE, g05(Math.abs(local.x) * 2)), d: item.d ?? size.d };
  void def;
  return { d: Math.max(MIN_SIZE, g05(Math.abs(local.y) * 2)), w: item.w ?? size.w };
}

/** Round entries and plants have one spread handle; the rest have a width and a depth handle. */
export const resizeKind = (item: GardenItem): "none" | "spread" | "rect" => {
  const def = gardenDef(item.type);
  if (!def || item.to) return "none";
  return def.round || isPlant(def) ? "spread" : "rect";
};

/** Move one end of a run. */
export const moveRunEnd = (site: Site, id: string, end: "from" | "to", p: WPt): Site =>
  ({ ...site, items: itemsOf(site).map((it) => (it.id !== id || !it.to ? it : end === "to" ? { ...it, to: { x: p.x, y: p.y } } : { ...it, x: p.x, y: p.y })) });

/** Copies of clipboard items with new ids, offset by (dx, dy); returns the new site and the new ids. */
export function pasteItems(site: Site, clip: readonly GardenItem[], dx = 0.5, dy = 0.5): { site: Site; ids: string[] } {
  const copies = clip.map((it) => ({ ...structuredClone(it), id: uid(), x: it.x + dx, y: it.y + dy, ...(it.to ? { to: { x: it.to.x + dx, y: it.to.y + dy } } : {}) }));
  return { site: { ...site, items: [...itemsOf(site), ...copies] }, ids: copies.map((c) => c.id) };
}

/** A polygon being clicked out is closed by a click on its first point (or a repeat click on its last): within `tol` metres. */
export function closesPolygon(points: readonly WPt[], p: WPt, tol: number): boolean {
  if (points.length < 3) return false;
  const near = (q: WPt) => Math.hypot(q.x - p.x, q.y - p.y) <= tol;
  return near(points[0]) || near(points[points.length - 1]);
}

// A module-level clipboard for garden items, within the site editor (not lib/clipboard.ts, which is for the plan).
let clip: GardenItem[] = [];
export const gardenClipboard = {
  set(items: readonly GardenItem[]) {
    clip = items.map((it) => structuredClone(it));
  },
  get: (): readonly GardenItem[] => clip,
  count: () => clip.length,
};
