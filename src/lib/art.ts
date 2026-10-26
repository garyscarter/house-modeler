import type { CatalogueItem } from "./catalogue";

/**
 * Framed prints hung on walls: the sample designs, the standard sizes and the
 * frame styles a Picture fixture can have. The designs themselves are drawn
 * in three/artTextures.ts; this is the pure part the inspector and tests share.
 */

export interface PrintDesign {
  id: string;
  name: string;
}

/** The sample prints, drawn to fit any frame. */
export const PRINTS: readonly PrintDesign[] = [
  { id: "blocks", name: "Abstract blocks" },
  { id: "arches", name: "Arches" },
  { id: "line", name: "Line drawing" },
  { id: "hills", name: "Hills at dusk" },
  { id: "botanical", name: "Botanical" },
  { id: "ink", name: "Ink wash" },
];
export const DEFAULT_PRINT = "blocks";

export type PictureFrame = "black" | "oak" | "white" | "none";
export const FRAME_LABEL: Record<PictureFrame, string> = { black: "Thin black frame", oak: "Oak frame", white: "White frame", none: "Canvas (no frame)" };
export const FRAME_COLOUR: Record<PictureFrame, string> = { black: "#1b1b1b", oak: "#c9a26b", white: "#f4f1ea", none: "#f4f1ea" };
export const DEFAULT_FRAME: PictureFrame = "black";
/** Width of the frame moulding, metres (none: the canvas wraps its edge). */
export const FRAME_W: Record<PictureFrame, number> = { black: 0.02, oak: 0.03, white: 0.025, none: 0 };

/** Standard sizes, short side × long side, metres. */
export const PICTURE_SIZES: readonly { id: string; name: string; short: number; long: number }[] = [
  { id: "a4", name: "A4 (21 × 30)", short: 0.21, long: 0.297 },
  { id: "a3", name: "A3 (30 × 42)", short: 0.297, long: 0.42 },
  { id: "a2", name: "A2 (42 × 59)", short: 0.42, long: 0.594 },
  { id: "50x70", name: "50 × 70", short: 0.5, long: 0.7 },
  { id: "70x100", name: "70 × 100", short: 0.7, long: 1.0 },
  { id: "100x150", name: "100 × 150 canvas", short: 1.0, long: 1.5 },
];

export type Orientation = "portrait" | "landscape";

/** Width and height of a picture of a standard size, hung the given way up. */
export function pictureSize(id: string, orientation: Orientation): { w: number; h: number } | undefined {
  const s = PICTURE_SIZES.find((p) => p.id === id);
  if (!s) return undefined;
  return orientation === "portrait" ? { w: s.short, h: s.long } : { w: s.long, h: s.short };
}

/** The standard size and orientation a picture of w × h metres is, if it is one (within 5 mm). */
export function pictureSizeOf(w: number, h: number): { id: string; orientation: Orientation } | undefined {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.005;
  for (const s of PICTURE_SIZES) {
    if (near(w, s.short) && near(h, s.long)) return { id: s.id, orientation: "portrait" };
    if (near(w, s.long) && near(h, s.short)) return { id: s.id, orientation: "landscape" };
  }
  return undefined;
}

/** Whether an item is a framed print. */
export function isPicture(item: Pick<CatalogueItem, "symbol">): boolean {
  return item.symbol === "picture";
}
