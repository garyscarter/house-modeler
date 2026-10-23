// The Storey brand in one place: the name, colours and the stacked-floors mark (roof, first floor, ground floor).
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

/** File-name prefix for downloads: "storey-listing-91770873" style, from a slug of the house name. */
export const downloadPrefix = (houseSlug: string) => (houseSlug ? `storey-${houseSlug}` : "storey");
