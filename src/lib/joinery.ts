import type { Fixture, JoineryConfig, JoineryFit, JoineryFront, SeatFront } from "../types";
import type { CatalogueItem, Symbol } from "./catalogue";

/**
 * Fitted joinery: built-in alcove units, wall boxes, floating-shelf stacks and window seats. Settings live on
 * Fixture.joinery (overrides) over CatalogueItem.joinery (defaults); joineryOf resolves them, and builtInLayout
 * splits a built-in into the bands the plan, the 3D view and the report share.
 */
export const JOINERY_SYMBOLS: readonly Symbol[] = ["built-in", "window-seat", "wall-box", "shelf"];
export const isJoinery = (item: Pick<CatalogueItem, "symbol"> | undefined): boolean => !!item && JOINERY_SYMBOLS.includes(item.symbol);

/** Kickboard height, m. */
export const PLINTH_H = 0.1;
/** Thickness of the top on a built-in's base, m. */
export const TOP_T = 0.03;
/** Window-seat cushion thickness, m, inside the item's height. */
export const CUSHION_T = 0.08;
export const DEFAULT_CUSHION = "#8f9c94";
/** Bays across a unit w metres wide when not set: about 0.6 m each. */
export const autoBays = (w: number) => Math.max(1, Math.round(w / 0.6));

/** Every setting resolved and in range. */
export interface Joinery {
  bays: number;
  baseH: number;
  baseFront: JoineryFront;
  top: boolean;
  plinth: boolean;
  shelves: number;
  upperFront: JoineryFront;
  upperD: number;
  topBox: number;
  front: JoineryFront;
  carcass: string;
  /** Shaker bead colour; undefined = a shade of the door colour (decided where it is drawn). */
  trim?: string;
  /** Shaker panel colour; undefined = the door colour. */
  panel?: string;
  topColor: string;
  shelfT: number;
  seatFront: SeatFront;
  backCushion: boolean;
  cushion: string;
  fit?: JoineryFit;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const fin = (v: number | undefined): v is number => typeof v === "number" && Number.isFinite(v);
const intIn = (v: number | undefined, lo: number, hi: number, dflt: number) => (fin(v) ? clamp(Math.round(v), lo, hi) : dflt);
const numIn = (v: number | undefined, lo: number, hi: number, dflt: number) => clamp(fin(v) ? v : dflt, lo, Math.max(lo, hi));
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** A fixture's joinery settings over its catalogue item's, for a unit of size `box` (metres; see fixtureBox). */
export function joineryOf(fx: Pick<Fixture, "joinery" | "color" | "worktop">, item: CatalogueItem, box: { w: number; d: number; h: number }): Joinery {
  const c: JoineryConfig = { ...item.joinery, ...fx.joinery };
  const color = fx.color ?? item.color;
  const s = item.symbol;
  const builtIn = s === "built-in";
  const baseH = builtIn ? numIn(c.baseH, 0, box.h - 0.2, 0) : 0;
  const shelves = intIn(c.shelves, s === "shelf" ? 1 : 0, 12, s === "shelf" ? 1 : builtIn ? 3 : 0);
  return {
    bays: intIn(c.bays, 1, 12, s === "wall-box" ? 1 : autoBays(box.w)),
    baseH,
    baseFront: c.baseFront ?? "shaker",
    top: builtIn && baseH > 0 && (c.top ?? true),
    plinth: c.plinth ?? (builtIn || s === "window-seat"),
    shelves,
    upperFront: c.upperFront ?? "open",
    upperD: numIn(c.upperD, Math.min(0.1, box.d), box.d, box.d),
    topBox: builtIn ? numIn(c.topBox, 0, box.h - baseH - 0.3, 0) : 0,
    front: c.front ?? "open",
    carcass: c.carcass ?? color,
    trim: c.trim,
    panel: c.panel,
    topColor: fx.worktop ?? color,
    // A single floating shelf (and every old one) is one board as thick as the item is high.
    shelfT: s === "shelf" && shelves === 1 ? box.h : numIn(c.shelfT, 0.01, box.h, s === "shelf" ? 0.04 : 0.025),
    seatFront: c.seatFront ?? "lid",
    backCushion: c.backCushion ?? false,
    cushion: c.cushion ?? DEFAULT_CUSHION,
    fit: c.fit,
  };
}

/** Bands of a built-in from the floor up, metres above its base, and the x of its bay divisions. */
export interface BuiltInLayout {
  plinth: [number, number] | null;
  /** Base cupboards (or open base) from the plinth to under the top. */
  base: [number, number] | null;
  top: [number, number] | null;
  /** Upper section, shelves or doors, from the base (or plinth) to under the top box. */
  upper: [number, number];
  topBox: [number, number] | null;
  /** Centre heights of the upper section's shelf boards, evenly spaced. */
  shelfYs: number[];
  /** x of the bay divisions from left side to right side (bays + 1 values, centred on 0). */
  bayXs: number[];
}

export function builtInLayout(j: Joinery, w: number, h: number): BuiltInLayout {
  const foot = j.plinth ? PLINTH_H : 0;
  const hasBase = j.baseH > foot + 0.05;
  const top: [number, number] | null = hasBase && j.top ? [j.baseH - TOP_T, j.baseH] : null;
  const base: [number, number] | null = hasBase ? [foot, top ? top[0] : j.baseH] : null;
  const topBox: [number, number] | null = j.topBox > 0 ? [h - j.topBox, h] : null;
  const upper: [number, number] = [hasBase ? j.baseH : foot, topBox ? topBox[0] : h];
  const span = upper[1] - upper[0];
  return {
    plinth: j.plinth ? [0, PLINTH_H] : null,
    base,
    top,
    upper,
    topBox,
    shelfYs: Array.from({ length: j.shelves }, (_, i) => upper[0] + ((i + 1) * span) / (j.shelves + 1)),
    bayXs: Array.from({ length: j.bays + 1 }, (_, k) => -w / 2 + (k * w) / j.bays),
  };
}

/** Front area of a built-in or wall box, m²: closed (doors, glazed or not) and open shelving. Plinth and top left out. */
export function frontAreas(item: Pick<CatalogueItem, "symbol">, j: Joinery, w: number, h: number): { closed: number; open: number } {
  if (item.symbol === "wall-box") return j.front === "open" ? { closed: 0, open: w * h } : { closed: w * h, open: 0 };
  if (item.symbol !== "built-in") return { closed: 0, open: 0 };
  const L = builtInLayout(j, w, h);
  let closed = 0;
  let open = 0;
  const add = (band: [number, number] | null, front: JoineryFront) => {
    if (!band) return;
    const a = w * Math.max(0, band[1] - band[0]);
    if (front === "open") open += a;
    else closed += a;
  };
  add(L.base, j.baseFront);
  add(L.upper, j.upperFront);
  add(L.topBox, "slab");
  return { closed, open };
}

/** A floating-shelf stack: n boards t thick, `spacing` apart bottom to bottom; the fixture's h is the whole stack. */
export function shelfStack(j: Joinery, h: number): { n: number; t: number; spacing: number; ys: number[] } {
  const n = Math.max(1, j.shelves);
  const t = n === 1 ? h : Math.min(j.shelfT, h / n);
  const spacing = n === 1 ? 0 : (h - t) / (n - 1);
  return { n, t, spacing, ys: Array.from({ length: n }, (_, i) => i * spacing) };
}

/** Drop unset fields; undefined when nothing is left. */
export function tidyJoinery(c: JoineryConfig | undefined): JoineryConfig | undefined {
  if (!c) return undefined;
  const out = Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined)) as JoineryConfig;
  return Object.keys(out).length ? out : undefined;
}

/** Fixture patch merging joinery settings; a field set to undefined goes back to the catalogue's. */
export function patchJoinery(fx: Pick<Fixture, "joinery">, p: Partial<JoineryConfig>): Partial<Fixture> {
  return { joinery: tidyJoinery({ ...fx.joinery, ...p }) };
}

/** Fixture patch for a shelf stack with a new count, spacing (bottom to bottom, m) or thickness (m). */
export function shelfStackPatch(fx: Fixture, item: CatalogueItem, p: { n?: number; spacing?: number; t?: number }): Partial<Fixture> {
  const box = { w: fx.w ?? item.w, d: fx.d ?? item.d, h: fx.h ?? item.h };
  const cur = shelfStack(joineryOf(fx, item, box), box.h);
  const n = clamp(Math.round(p.n ?? cur.n), 1, 12);
  const t = clamp(p.t ?? cur.t, 0.01, 0.2);
  const spacing = Math.max(p.spacing ?? (cur.n > 1 ? cur.spacing : 0.35), t + 0.05);
  const h = n === 1 ? t : t + (n - 1) * spacing;
  return { h: r3(h), joinery: tidyJoinery({ ...fx.joinery, shelves: n, shelfT: n === 1 ? undefined : r3(t) }) };
}
