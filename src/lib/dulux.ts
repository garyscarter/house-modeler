/** Lookups over the Dulux colour range (see duluxColours.ts): families, search, nearest colour. */
import { DULUX_COLOURS } from "./duluxColours";

export type DuluxFamily = "Whites" | "Neutrals" | "Greys" | "Reds & pinks" | "Oranges & browns" | "Yellows & golds" | "Greens" | "Teals & aquas" | "Blues" | "Violets & purples";

export const DULUX_FAMILIES: readonly DuluxFamily[] = ["Whites", "Neutrals", "Greys", "Reds & pinks", "Oranges & browns", "Yellows & golds", "Greens", "Teals & aquas", "Blues", "Violets & purples"];

export interface DuluxColour {
  name: string;
  /** "#rrggbb", lowercase. */
  hex: string;
  family: DuluxFamily;
}

/** Colours this close (CIELAB ΔE76) to a Dulux colour are described as "near" it. */
export const NEAR_DELTA_E = 6;

function hsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (mx === r) h = ((g - b) / d) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function duluxFamilyOf(hex: string): DuluxFamily {
  const [r, g, b] = rgbOf(hex);
  const { h, s, l } = hsl(r / 255, g / 255, b / 255);
  if (l >= 0.88 && s <= 0.18) return "Whites";
  if (s <= 0.09) return "Greys";
  if (s <= 0.22 && l >= 0.35 && l < 0.88) return "Neutrals";
  if (h >= 330 || h < 15) return "Reds & pinks";
  if (h < 45) return "Oranges & browns";
  if (h < 70) return "Yellows & golds";
  if (h < 160) return "Greens";
  if (h < 195) return "Teals & aquas";
  if (h < 255) return "Blues";
  return "Violets & purples";
}

type Lab = readonly [number, number, number];

export function hexToLab(hex: string): Lab {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgbOf(hex).map(lin);
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

let all: readonly DuluxColour[] | undefined;
let labs: Lab[] | undefined;
let byHex: Map<string, DuluxColour> | undefined;

/** Every Dulux colour (built once, on first use). */
export function duluxColours(): readonly DuluxColour[] {
  if (!all) {
    all = DULUX_COLOURS.map(([name, h]) => {
      const hex = `#${h.toLowerCase()}`;
      return { name, hex, family: duluxFamilyOf(hex) };
    });
    labs = all.map((c) => hexToLab(c.hex));
    byHex = new Map();
    for (const c of all) if (!byHex.has(c.hex)) byHex.set(c.hex, c);
    // Some colours share a value (Polished Pebble and Goose White): the well-known name wins.
    const popular = new Set(POPULAR_DULUX);
    for (const c of all) if (popular.has(c.name)) byHex.set(c.hex, c);
  }
  return all;
}

const isHex = (s: string) => /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s.trim());
const normHex = (hex: string) => {
  const h = hex.trim().toLowerCase().replace(/^#/, "");
  return h.length === 3 ? `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}` : `#${h}`;
};

export function duluxByHex(hex: string): DuluxColour | undefined {
  duluxColours();
  return byHex!.get(normHex(hex));
}

/** The `n` colours closest to `hex`, nearest first, with their ΔE76. */
function nearestN(hex: string, n: number): { colour: DuluxColour; distance: number }[] {
  const list = duluxColours();
  const [l, a, b] = hexToLab(normHex(hex));
  const scored = list.map((colour, i) => {
    const [l2, a2, b2] = labs![i];
    return { colour, distance: Math.hypot(l - l2, a - a2, b - b2) };
  });
  scored.sort((p, q) => p.distance - q.distance);
  return scored.slice(0, n);
}

export function nearestDulux(hex: string): { colour: DuluxColour; distance: number } {
  return nearestN(hex, 1)[0];
}

/** "Polished Pebble" for an exact match, "near Polished Pebble" when close, else undefined. */
export function duluxName(hex: string): string | undefined {
  if (!isHex(hex)) return undefined;
  const exact = duluxByHex(hex);
  if (exact) return exact.name;
  const n = nearestDulux(hex);
  return n.distance <= NEAR_DELTA_E ? `near ${n.colour.name}` : undefined;
}

/** Name search (every word must appear) or, for a hex query, the 12 nearest colours. */
export function searchDulux(query: string, limit = 60): DuluxColour[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  if (isHex(q)) return nearestN(q, 12).map((r) => r.colour);
  const words = q.split(/\s+/);
  return duluxColours()
    .filter((c) => {
      const n = c.name.toLowerCase();
      return words.every((w) => n.includes(w));
    })
    .slice(0, limit);
}

export const POPULAR_DULUX: readonly string[] = [
  "Polished Pebble", "Egyptian Cotton", "Natural Hessian", "Goose Down", "Chic Shadow", "Timeless", "Jasmine White", "Pure Brilliant White",
  "Natural Calico", "Almond White", "Magnolia", "Nutmeg White", "Mellow Mocha", "Brave Ground", "Tranquil Dawn", "Wild Wonder",
  "Sweet Embrace", "Denim Drift", "Sapphire Salute", "Teal Tension", "Overtly Olive", "Heart Wood", "Spiced Honey", "Pebble Shore",
  "Frosted Steel", "Willow Tree",
];
