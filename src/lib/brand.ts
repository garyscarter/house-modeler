import WORDMARK_DATA from "./wordmark.json";

// The Storey brand in one place: the name, colours, the stacked-floors mark (roof, first floor, ground floor) and the wordmark.
// The mark is drawn in a 64-unit box. server/page.mjs and scripts/make-icons.mjs keep their own copies (plain .mjs).

export const BRAND_NAME = "Storey";
/** Brand teal (the app's --brand and --accent). */
export const BRAND_TEAL = "#0f6e66";
/** Page neutral (the app's --bg) and ink (--text). */
export const BRAND_BG = "#eef0ec";
export const BRAND_INK = "#1d2422";
/** Display font stack, as in styles.css. */
export const BRAND_DISPLAY_FONT = `"Bricolage Grotesque Variable", "Bricolage Grotesque", system-ui, sans-serif`;

/** Mark parts. The roof is drawn with a 3-unit round-joined stroke as well as its fill. */
export const MARK = {
  roof: "M10 27L32 9L54 27Z",
  first: "M14 31H50Q52 31 52 33V39Q52 41 50 41H14Q12 41 12 39V33Q12 31 14 31Z",
  ground: "M14 45H50Q52 45 52 47V53Q52 55 50 55H14Q12 55 12 53V47Q12 45 14 45Z",
  roofStroke: 3,
} as const;

/** The mark as SVG elements in `color`, for SVG and HTML exports. */
export function markSvg(color: string): string {
  return (
    `<path d="${MARK.ground}" fill="${color}"/>` +
    `<path d="${MARK.first}" fill="${color}"/>` +
    `<path d="${MARK.roof}" fill="${color}" stroke="${color}" stroke-width="${MARK.roofStroke}" stroke-linejoin="round"/>`
  );
}

/**
 * The wordmark: "storey" in Bricolage Grotesque 250, letter spacing 0.05 em, as outlines (scripts/make-wordmark.py).
 * Two optical sizes: "small" for anything drawn under about 40 px tall, "large" for display. Baseline at y = 0.
 */
export type WordmarkCut = "small" | "large";
export const WORDMARK: Record<WordmarkCut, { d: string; viewBox: number[] }> = { small: WORDMARK_DATA.small, large: WORDMARK_DATA.large };
export const wordmarkCut = (height: number): WordmarkCut => (height < 40 ? "small" : "large");
/** Width of the wordmark drawn `height` tall. */
export const wordmarkWidth = (height: number, cut: WordmarkCut = wordmarkCut(height)) => (height * WORDMARK[cut].viewBox[2]) / WORDMARK[cut].viewBox[3];

/** The wordmark as a standalone SVG element, `height` tall (CSS px, or user units inside another SVG), at (x, y) top-left. */
export function wordmarkSvg(color: string, height: number, at?: { x: number; y: number }, cut: WordmarkCut = wordmarkCut(height)): string {
  const { d, viewBox } = WORDMARK[cut];
  const pos = at ? ` x="${at.x.toFixed(2)}" y="${at.y.toFixed(2)}"` : "";
  return `<svg${pos} width="${wordmarkWidth(height, cut).toFixed(2)}" height="${height}" viewBox="${viewBox.join(" ")}" role="img" aria-label="${BRAND_NAME}"><path d="${d}" fill="${color}"/></svg>`;
}

/** File-name prefix for downloads: "storey-my-house" style, from a slug of the house name. */
export const downloadPrefix = (houseSlug: string) => (houseSlug ? `storey-${houseSlug}` : "storey");
