import type { WPt } from "../../types";

export type Tool = "select" | "surface" | "neighbour";
export type Sel =
  | { type: "boundary"; edge: number | null; vertex: number | null }
  | { type: "surface" | "neighbour"; id: string; vertex: number | null }
  | null;
export type Item = NonNullable<Sel>;

export const sameItem = (a: Item, b: Item) => a.type === b.type && (a.type === "boundary" || (b.type !== "boundary" && a.id === b.id));

/** The core target key for a selected polygon. */
export const keyOf = (s: Item) => (s.type === "boundary" ? "boundary" : `${s.type}:${s.id}`);

export type Draft = { a: WPt; b: WPt } | null;
