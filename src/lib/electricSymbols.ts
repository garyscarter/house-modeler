import type { Symbol } from "./catalogue";

/**
 * Plan symbols for ceiling and wall lights and electrical points, BS EN 60617 style, as data: the plan
 * (editor/ElectricGlyph.tsx, editor/FixtureSymbol.tsx), the picker thumbnails and the printed wiring guide and its
 * legend (lib/wiringGuide.ts glyphSvg) all draw from the same primitives, so they always agree.
 *
 * Frame: a 1 × 1 square centred on (0, 0), y down as on the plan, the wall behind a wall point along y = -0.5
 * (the item's back, local -y). Strokes are drawn by the renderer at its own width; `fill` fills with the ink colour.
 * Symbols are drawn at a fixed size (ELECTRIC_GLYPH_M on the plan, GLYPH_MM in print), not at the item's footprint.
 */
export type SymPrim =
  | { k: "circle"; cx: number; cy: number; r: number; fill?: boolean }
  | { k: "line"; x1: number; y1: number; x2: number; y2: number }
  | { k: "path"; d: string; fill?: boolean }
  | { k: "rect"; x: number; y: number; w: number; h: number; fill?: boolean }
  | { k: "text"; x: number; y: number; size: number; text: string };

/** Size of a symbol on the plan, metres (a 250 mm square), whatever the point's real size. */
export const ELECTRIC_GLYPH_M = 0.25;
/** Size of a symbol in the printed guide and its legend, paper mm. */
export const GLYPH_MM = 3.5;

/** Placeholder until each symbol is drawn (Sia): a circle with the symbol's first letter. */
const fallback = (symbol: Symbol): SymPrim[] => [
  { k: "circle", cx: 0, cy: 0, r: 0.4 },
  { k: "text", x: 0, y: 0.15, size: 0.45, text: symbol.charAt(0).toUpperCase() },
];

/** Symbols this module draws: every Lighting and Electrics symbol (plug-in lamps keep their furniture symbols). */
export const ELECTRIC_SYMBOLS: readonly Symbol[] = [
  "pendant", "pendant-multi", "flush-light", "downlight", "downlight-grid", "spot-bar", "wall-light", "strip-light",
  "switch-1g", "switch-2g", "switch-2way", "switch-dimmer", "switch-pull",
  "socket-1", "socket-2", "socket-usb", "socket-floor", "socket-outdoor", "shaver-socket",
  "fused-spur", "cooker-switch", "cooker-outlet", "shower-point",
  "extractor-fan", "thermostat", "bell-push", "bell-chime",
  "smoke-alarm", "heat-alarm", "co-alarm", "tv-point", "data-point", "ev-charger", "consumer-unit",
];
export const hasElectricSymbol = (symbol: Symbol): boolean => ELECTRIC_SYMBOLS.includes(symbol);

/** The primitives of a symbol in the unit frame; [] for a symbol this module does not draw. */
export function electricSymbol(symbol: Symbol): SymPrim[] {
  if (!hasElectricSymbol(symbol)) return [];
  return fallback(symbol);
}

const n = (v: number) => (Math.round(v * 1000) / 1000).toString();

/**
 * A symbol as an SVG string `size` units across centred on (cx, cy), turned `rot` degrees clockwise (the point's
 * rotation, so the wall side faces its wall): for the printed guide and its legend.
 */
export function glyphSvg(symbol: Symbol, cx: number, cy: number, size: number, opts: { rot?: number; ink?: string; stroke?: number } = {}): string {
  const ink = opts.ink ?? "#1f2937";
  const sw = (opts.stroke ?? 0.25) / size;
  const parts = electricSymbol(symbol).map((p) => {
    switch (p.k) {
      case "circle":
        return `<circle cx="${n(p.cx)}" cy="${n(p.cy)}" r="${n(p.r)}"${p.fill ? ` fill="${ink}"` : ""}/>`;
      case "line":
        return `<line x1="${n(p.x1)}" y1="${n(p.y1)}" x2="${n(p.x2)}" y2="${n(p.y2)}"/>`;
      case "path":
        return `<path d="${p.d}"${p.fill ? ` fill="${ink}"` : ""}/>`;
      case "rect":
        return `<rect x="${n(p.x)}" y="${n(p.y)}" width="${n(p.w)}" height="${n(p.h)}"${p.fill ? ` fill="${ink}"` : ""}/>`;
      case "text":
        return `<text x="${n(p.x)}" y="${n(p.y)}" font-size="${n(p.size)}" text-anchor="middle" fill="${ink}" stroke="none" font-family="Helvetica, Arial, sans-serif">${p.text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>`;
    }
  });
  return `<g transform="translate(${n(cx)} ${n(cy)}) rotate(${n(opts.rot ?? 0)}) scale(${n(size)})" fill="#fff" stroke="${ink}" stroke-width="${n(sw)}">${parts.join("")}</g>`;
}
