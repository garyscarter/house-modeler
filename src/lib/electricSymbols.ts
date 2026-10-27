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

/** Symbols this module draws: every Lighting and Electrics symbol (plug-in lamps keep their furniture symbols). */
export const ELECTRIC_SYMBOLS: readonly Symbol[] = [
  "pendant", "pendant-multi", "ceiling-flush", "downlight", "downlight-grid", "spot-bar", "wall-light", "strip-light",
  "switch-1g", "switch-2g", "switch-2way", "switch-dimmer", "switch-pull",
  "socket-1", "socket-2", "socket-usb", "socket-floor", "socket-outdoor", "shaver-socket",
  "fused-spur", "cooker-switch", "cooker-outlet", "shower-point",
  "extractor-fan", "thermostat", "bell-push", "bell-chime",
  "smoke-alarm", "heat-alarm", "co-alarm", "tv-point", "data-point", "ev-charger", "consumer-unit",
];
export const hasElectricSymbol = (symbol: Symbol): boolean => ELECTRIC_SYMBOLS.includes(symbol);

const circle = (cx: number, cy: number, r: number, fill?: boolean): SymPrim => ({ k: "circle", cx, cy, r, ...(fill ? { fill } : {}) });
const line = (x1: number, y1: number, x2: number, y2: number): SymPrim => ({ k: "line", x1, y1, x2, y2 });
const rect = (x: number, y: number, w: number, h: number): SymPrim => ({ k: "rect", x, y, w, h });
const text = (x: number, y: number, size: number, t: string): SymPrim => ({ k: "text", x, y, size, text: t });
const D = Math.SQRT1_2;
/** A circle with a diagonal cross: the lighting outlet. */
const crossed = (cx: number, cy: number, r: number): SymPrim[] => [
  circle(cx, cy, r),
  line(cx - r * D, cy - r * D, cx + r * D, cy + r * D),
  line(cx - r * D, cy + r * D, cx + r * D, cy - r * D),
];
/** A semicircle with its flat side on the wall, optionally filled. */
const half = (r: number, cy: number, fill?: boolean): SymPrim => ({
  k: "path", d: `M ${-r} ${cy} A ${r} ${r} 0 0 0 ${r} ${cy} Z`, ...(fill ? { fill } : {}),
});
/** A switch: dot on the wall, stroke rising at 45 degrees, tick across its end. */
const stroke45 = (sx: number, dir: 1 | -1, len = 0.3, tick = true): SymPrim[] => {
  const ex = sx + dir * len, ey = -0.4 + len;
  return [
    line(sx, -0.4, ex, ey),
    ...(tick ? [line(ex - dir * 0.1 * D, ey - 0.1 * D, ex + dir * 0.1 * D, ey + 0.1 * D)] : []),
  ];
};
const switchBase: SymPrim[] = [circle(0, -0.4, 0.1, true)];
const plate = (): SymPrim => rect(-0.4, -0.5, 0.8, 0.8);
const socketStrokes = (xs: number[], to = 0.25): SymPrim[] =>
  xs.map((x) => line(x, -0.5 + Math.sqrt(0.16 - x * x), x, to));

const DRAW: Record<string, () => SymPrim[]> = {
  pendant: () => [...crossed(0, 0, 0.4), circle(0, 0, 0.06, true)],
  "pendant-multi": () => [line(-0.5, 0, 0.5, 0), ...[-0.33, 0, 0.33].flatMap((x) => crossed(x, 0, 0.15))],
  "ceiling-flush": () => [circle(0, 0, 0.47), ...crossed(0, 0, 0.3)],
  downlight: () => [circle(0, 0, 0.42), circle(0, 0, 0.2, true)],
  "downlight-grid": () => [
    circle(0, 0, 0.42),
    ...[-0.17, 0.17].flatMap((x) => [-0.17, 0.17].map((y) => circle(x, y, 0.1, true))),
  ],
  "spot-bar": () => [
    rect(-0.5, -0.2, 1, 0.12),
    ...[-0.3, 0, 0.3].flatMap((x) => [circle(x, 0.2, 0.14), circle(x, 0.2, 0.035, true)]),
  ],
  "wall-light": () => [line(0, -0.5, 0, -0.25), ...crossed(0, 0.05, 0.3)],
  "strip-light": () => [rect(-0.5, -0.09, 1, 0.18), line(-0.5, -0.22, -0.5, 0.22), line(0.5, -0.22, 0.5, 0.22)],
  "switch-1g": () => [...switchBase, ...stroke45(0, 1)],
  "switch-2g": () => [...switchBase, ...stroke45(0, 1), line(0.225 - 0.1 * D, -0.175 - 0.1 * D, 0.225 + 0.1 * D, -0.175 + 0.1 * D)],
  "switch-2way": () => [...switchBase, ...stroke45(0, 1), ...stroke45(0, -1)],
  "switch-dimmer": () => [
    ...switchBase, ...stroke45(0, 1),
    line(0.044, -0.144, 0.256, -0.356), line(0.256, -0.356, 0.156, -0.356), line(0.256, -0.356, 0.256, -0.256),
  ],
  "switch-pull": () => [...switchBase, ...stroke45(0, 1, 0.3, false), circle(0.357, -0.043, 0.08)],
  "socket-1": () => [half(0.4, -0.5), ...socketStrokes([0])],
  "socket-2": () => [half(0.4, -0.5), ...socketStrokes([-0.18, 0.18])],
  "socket-usb": () => [half(0.4, -0.5), ...socketStrokes([-0.18, 0.18], 0.1), text(0, 0.43, 0.3, "USB")],
  "socket-floor": () => [rect(-0.5, -0.5, 1, 1), half(0.3, -0.25), line(0, 0.05, 0, 0.35)],
  "socket-outdoor": () => [half(0.4, -0.5, true), ...socketStrokes([0], 0.12), text(0, 0.43, 0.32, "IP")],
  "shaver-socket": () => [half(0.4, -0.5), circle(-0.12, 0.2, 0.17), circle(0.12, 0.2, 0.17)],
  "fused-spur": () => [plate(), line(-0.4, -0.1, 0.4, -0.1), rect(-0.16, -0.2, 0.32, 0.2)],
  "cooker-switch": () => [
    rect(-0.45, -0.5, 0.9, 0.9), circle(-0.25, -0.3, 0.07, true), line(-0.25, -0.3, 0.05, 0), text(0.22, 0.3, 0.3, "C"),
  ],
  "cooker-outlet": () => [plate(), text(0, 0, 0.28, "CCU")],
  "shower-point": () => [rect(-0.5, -0.5, 1, 0.8), text(0, 0.04, 0.4, "ES")],
  "extractor-fan": () => [
    circle(0, -0.02, 0.48),
    { k: "path", d: "M 0 -0.02 C 0.3 -0.12 0.35 -0.32 0.1 -0.4" },
    { k: "path", d: "M 0 -0.02 C -0.3 0.08 -0.35 0.28 -0.1 0.36" },
  ],
  thermostat: () => [plate(), text(0, 0.1, 0.55, "\u03b8")],
  "bell-push": () => [circle(0, -0.2, 0.3), circle(0, -0.2, 0.08, true)],
  "bell-chime": () => [
    line(0, -0.5, 0, -0.22),
    { k: "path", d: "M -0.35 0.15 C -0.35 -0.35 0.35 -0.35 0.35 0.15 Z" },
    line(-0.45, 0.15, 0.45, 0.15), circle(0, 0.29, 0.06, true),
  ],
  "smoke-alarm": () => [circle(0, 0, 0.46), text(0, 0.17, 0.5, "S")],
  "heat-alarm": () => [circle(0, 0, 0.46), text(0, 0.17, 0.5, "H")],
  "co-alarm": () => [circle(0, -0.02, 0.48), text(0, 0.12, 0.38, "CO")],
  "tv-point": () => [plate(), text(0, 0.04, 0.4, "TV")],
  "data-point": () => [plate(), text(0, 0.08, 0.5, "D")],
  "ev-charger": () => [rect(-0.5, -0.5, 1, 0.8), text(0, 0.04, 0.45, "EV")],
  "consumer-unit": () => [
    rect(-0.5, -0.5, 1, 0.8),
    { k: "path", d: "M -0.5 0.3 L 0.5 0.3 L 0.5 -0.5 Z", fill: true },
    line(-0.5, 0.3, 0.5, -0.5),
  ],
};

/** The primitives of a symbol in the unit frame; [] for a symbol this module does not draw. */
export function electricSymbol(symbol: Symbol): SymPrim[] {
  return DRAW[symbol]?.() ?? [];
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
