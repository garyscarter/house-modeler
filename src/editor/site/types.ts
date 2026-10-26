import type { WPt } from "../../types";

/** Plot: select and building. Garden: select, rectangle ("surface"), circle, polygon, add ("place" a normal entry, "run" a two-end one). */
export type Tool = "select" | "surface" | "neighbour" | "circle" | "polygon" | "place" | "run";

/** What the site editor shows, the survey (Plot) or the garden. */
export type SiteMode = "plot" | "garden";

/** A selected polygon: the boundary, a surface or a neighbouring building. */
export type Item =
  | { type: "boundary"; edge: number | null; vertex: number | null }
  | { type: "surface" | "neighbour"; id: string; vertex: number | null };
/** What is selected: a polygon, or garden items (ids; kept in the store as `gardenSel`). */
export type Sel = Item | { type: "item"; ids: string[] } | null;

export const sameItem = (a: Item, b: Item) => a.type === b.type && (a.type === "boundary" || (b.type !== "boundary" && a.id === b.id));

/** The core target key for a selected polygon. */
export const keyOf = (s: Item) => (s.type === "boundary" ? "boundary" : `${s.type}:${s.id}`);

/** The rubber band while drawing: a rectangle (corners a, b) or a circle (centre a, through b). */
export type Draft = { a: WPt; b: WPt; circle?: boolean } | null;
