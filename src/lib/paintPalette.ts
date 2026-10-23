/**
 * A short palette of modern interior colours for quick picking. Names are
 * plain descriptions of the colour, never paint-maker names.
 */
export interface PaintSwatch {
  name: string;
  hex: string;
}

export const PAINT_PALETTE: readonly PaintSwatch[] = [
  { name: "Warm white", hex: "#f4f1ea" },
  { name: "Pale stone", hex: "#e2dacb" },
  { name: "Soft greige", hex: "#c9c1b3" },
  { name: "Mushroom", hex: "#a89a89" },
  { name: "Sage green", hex: "#9aad93" },
  { name: "Deep green", hex: "#2f4a3c" },
  { name: "Dusty blue", hex: "#8fa4b4" },
  { name: "Navy", hex: "#27364f" },
  { name: "Terracotta", hex: "#b8654a" },
  { name: "Dusty pink", hex: "#d6b0a6" },
  { name: "Charcoal", hex: "#3c3e42" },
];

/** The palette's name for a colour, if it is one of the swatches (case-insensitive). */
export function swatchName(hex: string): string | undefined {
  const h = hex.toLowerCase();
  return PAINT_PALETTE.find((s) => s.hex === h)?.name;
}
