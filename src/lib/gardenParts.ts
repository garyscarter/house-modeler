import type { GardenItem } from "../types";
import type { GardenDef } from "./gardenCatalogue";
import { itemSize } from "./gardenCatalogue";

/**
 * Garden furniture, structures and lights as data: a list of unit shapes
 * scaled and placed in the item's local frame (origin at the centre of its
 * footprint at its base, y up, x to the item's right, its back towards -z).
 * three/SiteItems.tsx turns the parts into merged meshes; lib/plantForms.ts
 * does the same for plants and runs.
 */

/** Finishes, each one shared material in 3D (colours ride on vertex colours). */
export type GFinish = "metal" | "timber" | "plastic" | "fabric" | "stone" | "leaf" | "bark" | "soil" | "bulb";

export type GMat = { color: string; finish: GFinish; glow?: string };

/**
 * One unit shape: `box` 1 × 1 × 1; `cyl` and `cone` diameter 1, height 1 (cone apex up); `sphere` and
 * `ico` diameter 1; `prism` a 1 × 1 × 1 triangular prism, ridge along x at the top, sloping faces to ±z.
 * Scaled by `s`, turned `tilt` radians about x first (positive leans the part's top towards +z), then
 * `rotY` radians about y (positive turns +x towards -z, as three.js does), and centred at `p`:
 * Euler order "YXZ", so a grass blade is tilted and then spun round the plant's axis.
 */
export interface GPart {
  g: "box" | "cyl" | "cone" | "cone8" | "sphere" | "ico" | "prism" | "blade" | "pillow";
  p: [number, number, number];
  s: [number, number, number];
  mat: GMat;
  rotY?: number;
  tilt?: number;
}

/** Axis-aligned bounds of a part (its scaled unit box, turned), for budgets and tests. */
export function partBounds(pt: GPart): { min: [number, number, number]; max: [number, number, number] } {
  const t = pt.tilt ?? 0;
  const r = pt.rotY ?? 0;
  const ct = Math.cos(t), st = Math.sin(t), cr = Math.cos(r), sr = Math.sin(r);
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < 8; i++) {
    const x = (i & 1 ? 0.5 : -0.5) * pt.s[0];
    const y = (i & 2 ? 0.5 : -0.5) * pt.s[1];
    const z = (i & 4 ? 0.5 : -0.5) * pt.s[2] * (pt.g === "blade" ? 0.2 : 1);
    // Rx(t) then Ry(r).
    const y1 = y * ct - z * st;
    const z1 = y * st + z * ct;
    const v = [x * cr + z1 * sr + pt.p[0], y1 + pt.p[1], -x * sr + z1 * cr + pt.p[2]];
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], v[k]);
      max[k] = Math.max(max[k], v[k]);
    }
  }
  return { min, max };
}

/** Darken (k < 1) or lighten (k > 1) a #rrggbb colour. */
export function shadeColor(hex: string, k: number): string {
  const n = parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(k > 1 ? v + (255 - v) * (k - 1) : v * k))));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

const DARK = "#26282b";
const SOIL = "#4a3626";
const STONE = "#9a958b";
const FOLIAGE = "#4f7a3d";
const TIMBER = "#8b6a46";

/** A small builder: parts pushed in local metres, y = base of the part unless said otherwise. */
class Parts {
  out: GPart[] = [];
  /** Box from y0 to y1, centred at (x, z). */
  box(x: number, y0: number, y1: number, z: number, sx: number, sz: number, mat: GMat, rotY?: number, tilt?: number) {
    this.out.push({ g: "box", p: [x, (y0 + y1) / 2, z], s: [Math.max(sx, 0.002), Math.max(y1 - y0, 0.002), Math.max(sz, 0.002)], mat, ...(rotY ? { rotY } : {}), ...(tilt ? { tilt } : {}) });
  }
  /** Upright cylinder from y0 to y1. */
  cyl(x: number, y0: number, y1: number, z: number, dx: number, mat: GMat, dz = dx) {
    this.out.push({ g: "cyl", p: [x, (y0 + y1) / 2, z], s: [dx, Math.max(y1 - y0, 0.002), dz], mat });
  }
  cone(x: number, y0: number, y1: number, z: number, dia: number, mat: GMat) {
    this.out.push({ g: "cone", p: [x, (y0 + y1) / 2, z], s: [dia, y1 - y0, dia], mat });
  }
  /** A blob (ico) or ball (sphere) centred at (x, y, z) of size sx × sy × sz. */
  blob(x: number, y: number, z: number, sx: number, sy: number, sz: number, mat: GMat, g: "ico" | "sphere" = "ico") {
    this.out.push({ g, p: [x, y, z], s: [sx, sy, sz], mat });
  }
  /** A soft cushion (rounded box) from y0 to y1, centred at (x, z). */
  soft(x: number, y0: number, y1: number, z: number, sx: number, sz: number, mat: GMat, rotY?: number, tilt?: number) {
    this.out.push({ g: "pillow", p: [x, (y0 + y1) / 2, z], s: [Math.max(sx, 0.002), Math.max(y1 - y0, 0.002), Math.max(sz, 0.002)], mat, ...(rotY ? { rotY } : {}), ...(tilt ? { tilt } : {}) });
  }
  /** A square-section bar of side `t` from point a to point b (ribs, struts, spouts, handles). */
  bar(a: [number, number, number], b: [number, number, number], t: number, mat: GMat) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const hl = Math.hypot(dx, dz);
    this.out.push({ g: "box", p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], s: [t, t, Math.hypot(hl, dy)], mat, rotY: Math.atan2(dx, dz), tilt: -Math.atan2(dy, hl) });
  }
  prism(x: number, y0: number, y1: number, z: number, sx: number, sz: number, mat: GMat) {
    this.out.push({ g: "prism", p: [x, (y0 + y1) / 2, z], s: [sx, y1 - y0, sz], mat });
  }
}

const m = (color: string, finish: GFinish, glow?: string): GMat => (glow ? { color, finish, glow } : { color, finish });

/** A chair facing +z at (x, z) turned `rotY`, seat at `seat`, back up to `top`: legs, rails, an open slatted (or woven) back, optional arms. */
function chair(P: Parts, x: number, z: number, rotY: number, seat: number, top: number, frame: GMat, cushion: GMat, arms = false) {
  const c = Math.cos(rotY), s = Math.sin(rotY);
  // Local (lx, lz) in the chair's frame to the item's frame (rotation about y by rotY).
  const at = (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];
  const w = 0.46;
  const t = 0.035;
  const e = w / 2 - t / 2;
  const rails = seat - 0.085;
  // Legs at the corners; the back legs run up to the top of the back.
  for (const lx of [-e, e]) {
    const [fx, fz] = at(lx, e);
    P.box(fx, 0, seat - 0.04, fz, t, t, frame, rotY);
    const [bx, bz] = at(lx, -e);
    P.box(bx, 0, top, bz, t, t, frame, rotY);
  }
  // Seat frame: four rails just under the seat.
  for (const lx of [-e, e]) {
    const [rx, rz] = at(lx, 0);
    P.box(rx, rails, seat - 0.045, rz, t, w - 2 * t, frame, rotY);
  }
  for (const lz of [-e, e]) {
    const [rx, rz] = at(0, lz);
    P.box(rx, rails, seat - 0.045, rz, w - 2 * t, t, frame, rotY);
  }
  const [sx, sz] = at(0, 0);
  P.soft(sx, seat - 0.04, seat + 0.02, sz, w - 0.04, w - 0.04, cushion, rotY);
  // Back: three slats, or a woven panel for a dark frame.
  const [bx, bz] = at(0, -e);
  const dark = parseInt(frame.color.replace("#", "").slice(0, 2), 16) < 0x40;
  if (dark) P.box(bx, seat + 0.1, top - 0.05, bz, w - 2 * t - 0.06, 0.02, m(shadeColor(frame.color, 1.7), "fabric"), rotY);
  else for (let i = 0; i < 3; i++) {
    const y0 = seat + 0.1 + ((top - seat - 0.14) * i) / 2;
    P.box(bx, y0, y0 + 0.04, bz, w - 2 * t, 0.025, frame, rotY);
  }
  if (arms) {
    for (const lx of [-e, e]) {
      const [ax, az] = at(lx, 0);
      P.box(ax, seat + 0.2, seat + 0.24, az, 0.04, w - 0.04, frame, rotY);
    }
  }
}

function diningSet(P: Parts, def: GardenDef, item: GardenItem, w: number, d: number, h: number) {
  const frame = m(item.color ?? def.color, "metal");
  const seatMat = m(item.accent ?? def.accent ?? shadeColor(item.color ?? def.color, 1.25), "fabric");
  const top = m(item.accent ?? def.accent ?? item.color ?? def.color, "metal");
  const seats = Math.max(0, item.seats ?? def.seats ?? 4);
  const seat = Math.min(0.45, h * 0.6);
  if (def.round) {
    const D = Math.min(w, d);
    const td = Math.max(0.55, D - 1.0);
    P.cyl(0, h - 0.03, h, 0, td, top);
    P.cyl(0, 0, h - 0.03, 0, 0.06, frame);
    P.cyl(0, 0, 0.02, 0, td * 0.6, frame);
    const r = D / 2 - 0.25;
    for (let i = 0; i < seats; i++) {
      const a = (i / seats) * Math.PI * 2 + Math.PI / 4;
      // A chair at angle a faces the table: its +z points to the centre.
      chair(P, Math.cos(a) * r, Math.sin(a) * r, Math.atan2(-Math.cos(a), -Math.sin(a)), seat, h, frame, seatMat, seats >= 6);
    }
    return;
  }
  // Same layout as the plan symbol (editor/GardenSymbol.tsx): the table's long side runs left to right (x),
  // the chairs sit along its front and back, and the remaining one or two take the ends.
  const perSide = Math.max(0, Math.floor((seats - 2) / 2));
  const ends = Math.min(2, seats - perSide * 2);
  // End chairs tuck under the table's ends, so the set is only 0.6 m longer than the table.
  const tl = Math.max(0.6, w - (ends ? 0.6 : 0.1));
  const td = Math.max(0.6, d * 0.44);
  P.box(0, h - 0.03, h, 0, tl, td, top);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box((sx * tl) / 2 - sx * 0.05, 0, h - 0.03, (sz * td) / 2 - sz * 0.05, 0.04, 0.04, frame);
  const off = td / 2 + 0.2;
  for (let i = 0; i < perSide; i++) {
    const u = -tl / 2 + (tl * (i + 0.5)) / perSide;
    // Chairs face the table: the back row faces +z, the front row faces -z.
    chair(P, u, -off, 0, seat, h, frame, seatMat, seats >= 6);
    chair(P, u, off, Math.PI, seat, h, frame, seatMat, seats >= 6);
  }
  if (ends >= 1) chair(P, -tl / 2 - 0.12, 0, Math.PI / 2, seat, h, frame, seatMat, seats >= 6);
  if (ends >= 2) chair(P, tl / 2 + 0.12, 0, -Math.PI / 2, seat, h, frame, seatMat, seats >= 6);
}

function loungeSet(P: Parts, def: GardenDef, item: GardenItem, w: number, d: number, h: number) {
  const base0 = item.color ?? def.color;
  const frame = m(shadeColor(base0, 0.8), "plastic");
  const cushion = m(item.accent ?? def.accent ?? "#d8d3c8", "fabric");
  const sd = Math.min(0.8, d * 0.45, w * 0.4);
  const base = Math.min(0.32, h * 0.5);
  const seatTop = Math.min(base + 0.1, h * 0.65);
  const armTop = Math.max(seatTop + 0.06, h - 0.1);
  // Long run across the back, short run down the left side.
  P.box(0, 0, base, -d / 2 + sd / 2, w, sd, frame);
  P.box(-w / 2 + sd / 2, 0, base, (sd + 0) / 2, sd, d - sd, frame);
  P.box(0, base, armTop, -d / 2 + 0.08, w, 0.16, frame);
  P.box(-w / 2 + 0.08, base, armTop, sd / 2 - 0.08, 0.16, d - sd + 0.16, frame);
  // Seat cushions, split about every 0.7 m with a 2 cm gap.
  const longLen = w - 0.1 - 0.16;
  const nl = Math.max(1, Math.round(longLen / 0.7));
  for (let i = 0; i < nl; i++) {
    const x0 = -w / 2 + 0.1 + 0.16 + (longLen * i) / nl;
    P.soft(x0 + longLen / nl / 2, base, seatTop, -d / 2 + sd / 2 + 0.08, longLen / nl - 0.02, sd - 0.16, cushion);
  }
  const shortLen = d - sd - 0.05;
  const ns = Math.max(1, Math.round(shortLen / 0.7));
  for (let i = 0; i < ns; i++) {
    const z0 = -d / 2 + sd + (shortLen * i) / ns;
    P.soft(-w / 2 + sd / 2 + 0.08, base, seatTop, z0 + shortLen / ns / 2, sd - 0.16, shortLen / ns - 0.02, cushion);
  }
  // Back cushions, leaning, standing 3 cm proud of the arm.
  const n = Math.max(2, Math.round(w / 0.7));
  for (let i = 0; i < n; i++) P.soft(-w / 2 + sd + ((w - sd) * (i + 0.5)) / n, seatTop, armTop + 0.03, -d / 2 + 0.22, (w - sd) / n - 0.04, 0.14, cushion, 0, -0.15);
  // Coffee table in the corner of the L.
  const ct = Math.min(0.9, w - sd - 0.3);
  if (ct > 0.3) P.box(sd / 2 + 0.1, 0, Math.min(0.35, h * 0.5), sd / 2 + 0.15, ct, Math.min(0.55, d - sd - 0.3), m(TIMBER, "timber"));
}

function bench(P: Parts, def: GardenDef, item: GardenItem, w: number, d: number, h: number) {
  const wood = m(item.color ?? def.color, "timber");
  const seat = Math.min(0.45, h * 0.55);
  for (const x of [-w / 2 + 0.05, w / 2 - 0.05]) {
    P.box(x, 0, seat, 0, 0.06, d * 0.9, wood);
    P.box(x, seat, h, -d / 2 + 0.06, 0.06, 0.06, wood);
  }
  for (let i = 0; i < 4; i++) P.box(0, seat - 0.035, seat, -d / 2 + 0.08 + ((d - 0.12) * (i + 0.5)) / 4 - 0.02, w - 0.04, (d - 0.12) / 4 - 0.02, wood);
  for (let i = 0; i < 3; i++) {
    const y0 = seat + 0.06 + ((h - seat - 0.06) * i) / 3;
    P.box(0, y0, y0 + (h - seat - 0.06) / 3 - 0.03, -d / 2 + 0.06, w - 0.1, 0.025, wood, 0, -0.08);
  }
}

function parasol(P: Parts, def: GardenDef, item: GardenItem, w: number, _d: number, h: number) {
  const pole = m(item.color ?? def.color, "metal");
  const canopy = m(item.accent ?? def.accent ?? "#8c8f91", "fabric");
  P.cyl(0, 0, 0.08, 0, Math.min(0.5, w * 0.25), m(DARK, "stone"));
  P.cyl(0, 0, h, 0, 0.045, pole);
  const ch = Math.min(0.55, h * 0.25);
  const top = h - 0.02;
  const rim = top - ch;
  P.out.push({ g: "cone8", p: [0, (top + rim) / 2, 0], s: [w, ch, w], mat: canopy });
  // Eight ribs under the canopy, hub to rim (the cone's corners).
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    P.bar([0, top - 0.03, 0], [Math.sin(a) * (w / 2 - 0.02), rim + 0.01, Math.cos(a) * (w / 2 - 0.02)], 0.012, pole);
  }
  P.cyl(0, h * 0.6 - 0.05, h * 0.6 + 0.05, 0, 0.07, pole);
  P.blob(0, h - 0.03, 0, 0.06, 0.06, 0.06, pole, "sphere");
}

function bbq(P: Parts, def: GardenDef, item: GardenItem, w: number, d: number, h: number) {
  const body = m(item.color ?? def.color, "metal");
  if (def.round) {
    const D = Math.min(w, d);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      P.box(Math.cos(a) * D * 0.3, 0, h * 0.62, Math.sin(a) * D * 0.3, 0.025, 0.025, body);
    }
    P.blob(0, h * 0.72, 0, D * 0.92, h * 0.5, D * 0.92, body, "sphere");
    P.cyl(0, h * 0.94, h, 0, 0.06, m(DARK, "plastic"));
    return;
  }
  const steel = m(item.accent ?? def.accent ?? "#b9bdc2", "metal");
  const cart = Math.min(0.85, h * 0.72);
  P.box(0, 0.05, cart, 0, w * 0.6, d * 0.9, body);
  for (const x of [-1, 1]) P.box((x * w) / 2 - x * w * 0.1, cart - 0.04, cart, 0, w * 0.2, d * 0.85, steel);
  P.box(0, cart, h - 0.02, 0, w * 0.58, d * 0.85, body);
  P.box(0, h - 0.2, h - 0.17, d * 0.43, w * 0.5, 0.03, steel);
  for (const x of [-1, 1]) for (const z of [-1, 1]) P.cyl((x * w * 0.6) / 2 - x * 0.04, 0, 0.06, (z * d * 0.9) / 2 - z * 0.04, 0.06, m(DARK, "plastic"));
}

function firePit(P: Parts, def: GardenDef, item: GardenItem, w: number, d: number, h: number) {
  const bowl = m(item.color ?? def.color, "metal");
  const D = Math.min(w, d);
  P.cyl(0, 0, h * 0.35, 0, D * 0.45, bowl);
  P.cyl(0, h * 0.35, h, 0, D, bowl);
  P.cyl(0, h * 0.8, h * 0.98, 0, D * 0.88, m("#2a2420", "soil"));
  for (let i = 0; i < 3; i++) P.box(0, h * 0.95, h, 0, D * 0.55, 0.06, m("#5a3f2a", "bark"), (i * Math.PI) / 3);
}

function pot(P: Parts, def: GardenDef, item: GardenItem, w: number, d: number, h: number) {
  const D = Math.min(w, d);
  const body = m(item.color ?? def.color, "stone");
  const ph = h * 0.62;
  P.cyl(0, 0, ph, 0, D * 0.9, body);
  P.cyl(0, ph - 0.05, ph, 0, D, m(shadeColor(item.color ?? def.color, 0.9), "stone"));
  P.cyl(0, ph - 0.035, ph - 0.01, 0, D * 0.88, m(SOIL, "soil"));
  const leaf = m(item.accent ?? def.accent ?? FOLIAGE, "leaf");
  const r = (h - ph) * 1.4;
  P.blob(0, h - r / 2, 0, D * 0.85, r, D * 0.85, leaf);
  P.blob(D * 0.12, h - r * 0.75, -D * 0.1, D * 0.6, r * 0.7, D * 0.6, leaf);
}

function planter(P: Parts, def: GardenDef, item: GardenItem, w: number, d: number, h: number) {
  const body = m(item.color ?? def.color, "timber");
  const ph = h * 0.7;
  P.box(0, 0, ph, 0, w, d, body);
  P.box(0, ph - 0.01, ph + 0.005, 0, w - 0.06, d - 0.06, m(SOIL, "soil"));
  const leaf = m(item.accent ?? def.accent ?? FOLIAGE, "leaf");
  const n = Math.max(2, Math.round(w / 0.35));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (w * (i + 0.5)) / n;
    const s = Math.min(w / n, d) * 1.05;
    P.blob(x, ph + (h - ph) * 0.5, (i % 2 ? 0.03 : -0.03) * d, s, (h - ph) * 1.0, Math.min(s, d * 0.95), leaf);
  }
}

/** A small building with a pitched roof, ridge along x: sheds and playhouses. */
function hut(P: Parts, w: number, d: number, h: number, walls: GMat, roof: GMat, trim: GMat, eavesShare: number, playful: boolean) {
  const e = h * eavesShare;
  const rise = h - e - 0.04;
  P.box(0, 0, 0.06, 0, w, d, m(DARK, "timber"));
  P.box(0, 0.06, e, 0, w - 0.04, d - 0.04, walls);
  P.prism(0, e, e + rise, 0, w - 0.04, d - 0.04, walls);
  // Roof slopes: tilted boards from the ridge down to the eaves at each side.
  const run = d / 2;
  const L = Math.hypot(run, rise) + 0.03;
  const a = Math.atan2(rise, run);
  for (const s of [1, -1]) P.out.push({ g: "box", p: [0, e + rise / 2 + 0.02, (s * run) / 2], s: [w, 0.03, L], mat: roof, tilt: s * a });
  // Door on the front (+z), a window on the right end.
  const dw = Math.min(0.75, w * 0.4);
  const dh = Math.min(e * (playful ? 0.8 : 0.95), 1.85);
  P.box(playful ? -w * 0.2 : 0, 0.06, dh, d / 2 - 0.01, dw, 0.03, trim);
  const wy = Math.min(e * 0.55, 1.1);
  if (playful) P.box(w * 0.22, wy, wy + Math.min(0.45, e * 0.35), d / 2 - 0.01, Math.min(0.5, w * 0.3), 0.03, m("#cfe0ea", "plastic"));
  else P.box(w / 2 - 0.01, wy, wy + Math.min(0.5, e * 0.35), 0, 0.03, Math.min(0.6, d * 0.4), m("#cfe0ea", "plastic"));
}

function shed(P: Parts, def: GardenDef, item: GardenItem, w: number, d: number, h: number) {
  hut(P, w, d, h, m(item.color ?? def.color, "timber"), m(item.accent ?? def.accent ?? "#3a3a3a", "fabric"), m(shadeColor(item.color ?? def.color, 0.8), "timber"), 0.75, false);
}

function playhouse(P: Parts, def: GardenDef, item: GardenItem, w: number, d: number, h: number) {
  hut(P, w, d, h, m(item.color ?? def.color, "timber"), m(item.accent ?? def.accent ?? "#7c9a6a", "timber"), m(item.accent ?? def.accent ?? "#7c9a6a", "timber"), 0.62, true);
}

/**
 * The Smoby Life Friends playhouse with its summer kitchen, from the product
 * photos: a gable-fronted house (ridge front to back) in off-white planked
 * plastic under a dark grey tiled roof with a pale blue chimney; coral
 * shutters either side of the gable window under a green "Smoby" arch; a big
 * square window with a coral lattice and a blue window box on the front left;
 * a stable door, coral over green, with a doorbell beside it; on the right a
 * lean-to summer kitchen (grey worktop with a hob and sink on a tan brick
 * base, a green trellis at its front edge, a coral hatch in the house wall);
 * on the left a picnic table and bench in grey on green legs against a green
 * brick-effect lower wall. Proportions follow the 217 x 155 x 172 cm box.
 */
function playhouseKitchen(P: Parts, def: GardenDef, item: GardenItem, w: number, d: number, h: number) {
  const wall = m(item.color ?? def.color, "plastic");
  const roof = m(item.accent ?? def.accent ?? "#55585b", "plastic");
  const coral = m("#d2694f", "plastic");
  const green = m("#b7cf7a", "plastic");
  const grey = m("#6b6e70", "plastic");
  const tan = m("#d6c19e", "plastic");
  const blue = m("#9cc7d6", "plastic");
  const white = m(shadeColor(item.color ?? def.color, 1.03), "plastic");
  // Left to right: picnic table, the house, the kitchen wing.
  const tw = w * 0.23;
  const kw = w * 0.23;
  const hw = w - tw - kw;
  const cx = -w / 2 + tw + hw / 2;
  const hd = d * 0.87;
  const e = h * 0.65;
  const rise = h - e - 0.03;
  const x0 = cx - hw / 2;
  const x1 = cx + hw / 2;
  const zf = hd / 2;
  // Skid, walls and the gable prism (ridge along z).
  P.box(cx, 0, 0.04, 0, hw + 0.06, hd + 0.02, m(DARK, "plastic"));
  P.box(cx, 0.04, e, 0, hw, hd, wall);
  P.out.push({ g: "prism", p: [cx, e + rise / 2, 0], s: [hd, rise, hw], mat: wall, rotY: Math.PI / 2 });
  // Roof slopes either side of the ridge, overhanging the gables, and a ridge cap.
  const run = hw / 2 + 0.06;
  const L = Math.hypot(run, rise) + 0.02;
  const a = Math.atan2(rise, run);
  for (const sgn of [1, -1]) P.out.push({ g: "box", p: [cx + (sgn * run) / 2, e + rise / 2 + 0.03, 0], s: [hd + 0.2, 0.035, L], mat: roof, tilt: sgn * a, rotY: Math.PI / 2 });
  P.box(cx, e + rise, e + rise + 0.03, 0, 0.08, hd + 0.2, roof);
  P.box(cx, e + rise - 0.12, e + rise + 0.06, -hd * 0.25, 0.12, 0.12, blue); // chimney
  // Front gable: small window with coral shutters under the green arch.
  const gy = e + rise * 0.3;
  P.box(cx, gy - 0.1, gy + 0.1, zf + 0.01, 0.22, 0.03, grey);
  P.box(cx, gy - 0.08, gy + 0.08, zf + 0.03, 0.16, 0.01, m("#cfe0ea", "plastic"));
  for (const sgn of [-1, 1]) P.box(cx + sgn * 0.21, gy - 0.1, gy + 0.1, zf + 0.01, 0.12, 0.025, coral);
  P.box(cx, gy + 0.16, gy + 0.21, zf + 0.012, 0.4, 0.02, green);
  // Front left: the big window (grey frame, coral lattice) with its blue window box.
  const wx = cx - hw * 0.26;
  P.box(wx, e * 0.5, e * 0.86, zf + 0.012, hw * 0.34, 0.03, grey);
  P.box(wx, e * 0.52, e * 0.84, zf + 0.034, hw * 0.3, 0.01, coral);
  P.box(wx, e * 0.38, e * 0.47, zf + 0.07, hw * 0.24, 0.13, blue);
  // Stable door, coral above green, white frame, grey threshold, doorbell beside it.
  const dx = cx + hw * 0.08;
  const dw = Math.min(0.42, hw * 0.36);
  P.box(dx, 0.04, e * 0.93, zf + 0.008, dw + 0.06, 0.012, white);
  P.box(dx, 0.04, e * 0.5, zf + 0.018, dw, 0.012, green);
  P.box(dx, e * 0.5, e * 0.9, zf + 0.018, dw, 0.012, coral);
  P.box(dx, 0.02, 0.07, zf + 0.06, dw + 0.1, 0.12, grey);
  P.box(dx + dw / 2 + 0.07, e * 0.68, e * 0.76, zf + 0.012, 0.045, 0.02, white);
  // Right: the lean-to kitchen. Roof from under the eaves down to the wing's edge; coral hatch in the wall;
  // tan brick base with a grey worktop, hob and sink; green trellis across the front edge.
  const kx0 = x1;
  const kd = hd * 0.5;
  const lt = e * 0.98;
  const lb = e * 0.78;
  const lrun = kw * 0.9;
  const lL = Math.hypot(lrun, lt - lb) + 0.02;
  const la = Math.atan2(lt - lb, lrun);
  P.out.push({ g: "box", p: [kx0 + lrun / 2, (lt + lb) / 2 + 0.02, 0.02], s: [kd + 0.12, 0.03, lL], mat: roof, tilt: la, rotY: Math.PI / 2 });
  P.box(kx0 + 0.012, e * 0.45, e * 0.78, 0, 0.02, kd * 0.85, coral);
  P.box(kx0 + kw * 0.5, 0.02, h * 0.28, 0.04, kw * 0.8, kd * 0.75, tan);
  P.box(kx0 + kw * 0.5, h * 0.28, h * 0.305, 0.04, kw * 0.92, kd * 0.85, grey);
  P.box(kx0 + kw * 0.5, h * 0.305, h * 0.315, -kd * 0.2, kw * 0.45, kd * 0.3, m(DARK, "metal"));
  P.cyl(kx0 + kw * 0.5, h * 0.3, h * 0.312, kd * 0.22, kw * 0.4, m("#c9ccd0", "metal"));
  P.box(kx0 + kw * 0.5, h * 0.315, h * 0.68, kd / 2 + 0.02, kw, 0.025, green); // trellis
  // Left: green brick lower wall, the side windows, and the picnic table with its bench.
  P.box(x0 - 0.012, 0.04, e * 0.62, 0, 0.02, hd * 0.75, green);
  P.box(x0 - 0.012, e * 0.42, e * 0.74, -hd * 0.08, 0.03, hd * 0.36, grey);
  P.box(x0 - 0.034, e * 0.44, e * 0.72, -hd * 0.08, 0.01, hd * 0.32, m("#cfe0ea", "plastic"));
  P.box(x0 - 0.012, e * 0.8, e * 0.98, 0, 0.03, hd * 0.26, green); // shuttered window under the eave
  const tx = x0 - tw * 0.4;
  const bx = x0 - tw * 0.78;
  const tl = hd * 0.66;
  P.box(tx, h * 0.27, h * 0.3, hd * 0.05, tw * 0.6, tl, grey); // table top
  for (const z of [-tl / 2 + 0.06, tl / 2 - 0.06]) P.box(tx, 0.02, h * 0.27, hd * 0.05 + z, tw * 0.5, 0.06, green);
  P.box(bx, h * 0.16, h * 0.18, hd * 0.05, tw * 0.42, tl, grey); // bench
  for (const z of [-tl / 2 + 0.08, tl / 2 - 0.08]) P.box(bx, 0.02, h * 0.16, hd * 0.05 + z, tw * 0.32, 0.05, green);
}

function pergola(P: Parts, def: GardenDef, item: GardenItem, w: number, d: number, h: number) {
  const wood = m(item.color ?? def.color, "timber");
  const post = 0.1;
  for (const x of [-1, 1]) for (const z of [-1, 1]) P.box((x * (w - post)) / 2 - x * 0.1, 0, h - 0.16, (z * (d - post)) / 2 - z * 0.1, post, post, wood);
  for (const z of [-1, 1]) P.box(0, h - 0.3, h - 0.12, (z * (d - post)) / 2 - z * 0.1, w, 0.06, wood);
  const n = Math.max(3, Math.round(w / 0.5));
  for (let i = 0; i < n; i++) P.box(-w / 2 + 0.05 + ((w - 0.1) * (i + 0.5)) / n, h - 0.13, h, 0, 0.05, d, wood);
}

function mudKitchen(P: Parts, def: GardenDef, item: GardenItem, w: number, d: number, h: number) {
  const wood = m(item.color ?? def.color, "timber");
  const steel = m("#b9bdc2", "metal");
  const top = Math.min(0.6, h * 0.65);
  for (const x of [-1, 1]) for (const z of [-1, 1]) P.box((x * w) / 2 - x * 0.03, 0, top, (z * d) / 2 - z * 0.03, 0.05, 0.05, wood);
  P.box(0, top - 0.03, top, 0, w, d, wood);
  P.box(0, 0.12, 0.15, 0, w - 0.06, d - 0.06, wood);
  P.box(0, top, h, -d / 2 + 0.02, w, 0.03, wood);
  P.box(0, h * 0.88, h * 0.9, -d / 2 + 0.1, w - 0.1, 0.15, wood);
  // Sink: a bowl set into the top, a darker basin inside its rim, and a tap over it.
  const sx = -w * 0.2;
  const bowl = Math.min(0.28, d * 0.6);
  P.cyl(sx, top - 0.09, top + 0.02, 0.02, bowl, steel);
  P.cyl(sx, top - 0.09, top + 0.022, 0.02, bowl * 0.82, m("#7d8288", "metal"));
  const tz = 0.02 - bowl / 2 - 0.03;
  P.cyl(sx, top, top + 0.18, tz, 0.02, steel);
  P.bar([sx, top + 0.17, tz], [sx, top + 0.17, tz + 0.1], 0.02, steel);
  // Two hob rings, a pot with a handle on the right one.
  const ring = m("#2a2a2a", "plastic");
  P.cyl(w * 0.16, top, top + 0.012, 0.05, 0.14, ring);
  P.cyl(w * 0.34, top, top + 0.012, 0.05, 0.14, ring);
  P.cyl(w * 0.34, top + 0.012, top + 0.09, 0.05, 0.12, m("#c45a3a", "plastic"));
  P.bar([w * 0.34 + 0.06, top + 0.07, 0.05], [w * 0.34 + 0.16, top + 0.07, 0.05], 0.015, m("#2a2a2a", "plastic"));
  // Three hooks on the back board with utensils hanging under the shelf.
  const hz = -d / 2 + 0.045;
  const cols = ["#b9bdc2", "#c45a3a", "#5a7d3a"];
  cols.forEach((col, i) => {
    const ux = -w * 0.1 + i * 0.16;
    P.box(ux, h * 0.88 - 0.03, h * 0.88 - 0.015, hz, 0.02, 0.02, wood);
    P.out.push({ g: "cyl", p: [ux, h * 0.88 - 0.12, hz + 0.012], s: [0.012, 0.18, 0.012], mat: m(col, "metal") });
    P.box(ux, h * 0.88 - 0.29, h * 0.88 - 0.22, hz + 0.012, 0.05, 0.01, m(col, "metal"));
  });
}

function trampoline(P: Parts, def: GardenDef, item: GardenItem, w: number, d: number, h: number) {
  const frame = m(item.color ?? def.color, "metal");
  const pad = m(item.accent ?? def.accent ?? "#3d6fb0", "plastic");
  const D = Math.min(w, d);
  const deck = Math.min(0.75, h * 0.35);
  P.cyl(0, deck - 0.03, deck, 0, D * 0.85, m("#1b1c1e", "fabric"));
  P.cyl(0, deck - 0.05, deck + 0.01, 0, D * 0.98, pad);
  const legs = 6;
  for (let i = 0; i < legs; i++) {
    const a = (i / legs) * Math.PI * 2;
    P.box((Math.cos(a) * D) / 2 * 0.95, 0, deck, (Math.sin(a) * D) / 2 * 0.95, 0.04, 0.04, frame);
    P.box((Math.cos(a) * D) / 2 * 0.95, deck, h, (Math.sin(a) * D) / 2 * 0.95, 0.03, 0.03, m("#e8e8e8", "plastic"));
  }
  // The top ring of the net, as straight lengths between the poles.
  const r = (D / 2) * 0.95;
  const side = 2 * r * Math.sin(Math.PI / legs);
  for (let i = 0; i < legs; i++) {
    const a = ((i + 0.5) / legs) * Math.PI * 2;
    const rr = r * Math.cos(Math.PI / legs);
    P.box(Math.cos(a) * rr, h - 0.03, h, Math.sin(a) * rr, side, 0.03, m("#e8e8e8", "plastic"), -a - Math.PI / 2);
  }
}

function binStore(P: Parts, def: GardenDef, item: GardenItem, w: number, d: number, h: number) {
  const body = m(item.color ?? def.color, "timber");
  const dark = m(shadeColor(item.color ?? def.color, 0.65), "timber");
  P.box(0, 0, h - 0.06, 0, w, d, body);
  for (const x of [-1, 1]) P.box((x * w) / 4, h - 0.07, h, -0.01, w / 2 - 0.02, d + 0.01, body, 0, 0.04);
  P.box(0, 0.05, h - 0.1, d / 2 + 0.005, 0.02, 0.01, dark);
  for (const x of [-1, 1]) P.box((x * w) / 4 + x * 0.15, h * 0.45, h * 0.55, d / 2 + 0.005, 0.03, 0.01, dark);
}

/**
 * A resin garden storage box (Keter Darwin): a dark plinth, a planked body in the
 * main colour with vertical grooves on the front and ends, a darker frame band
 * at each corner, and a darker lid that overhangs a little with a lip at the
 * front and a lock tab in the middle.
 */
function storageBox(P: Parts, def: GardenDef, item: GardenItem, w: number, d: number, h: number) {
  const main = item.color ?? def.color;
  const dark = item.accent ?? def.accent ?? shadeColor(main, 0.5);
  const body = m(main, "plastic");
  const groove = m(shadeColor(main, 0.72), "plastic");
  const frame = m(dark, "plastic");
  const lidH = Math.min(0.06, h * 0.1);
  const top = h - lidH;
  P.box(0, 0, 0.03, 0, w - 0.02, d - 0.02, frame); // plinth
  P.box(0, 0.03, top, 0, w - 0.01, d - 0.01, body);
  for (const x of [-1, 1]) P.box((x * (w - 0.04)) / 2, 0.03, top, 0, 0.03, d, frame); // corner bands
  // Vertical plank grooves on the front and both ends.
  const pitch = 0.1;
  const nf = Math.max(2, Math.round((w - 0.1) / pitch));
  for (let i = 0; i < nf; i++) P.box(-w / 2 + 0.05 + ((w - 0.1) * (i + 0.5)) / nf, 0.05, top - 0.02, d / 2 - 0.002, 0.006, 0.012, groove);
  const ne = Math.max(2, Math.round((d - 0.08) / pitch));
  for (const x of [-1, 1]) for (let i = 0; i < ne; i++) P.box((x * (w - 0.004)) / 2, 0.05, top - 0.02, -d / 2 + 0.04 + ((d - 0.08) * (i + 0.5)) / ne, 0.012, 0.006, groove);
  // Lid: a darker slab overhanging the body, with a lip at the front and the lock tab.
  P.box(0, top, h, 0, w + 0.02, d + 0.01, frame);
  P.box(0, top - 0.02, top + 0.005, d / 2 + 0.005, w + 0.02, 0.01, frame);
  P.box(0, top + lidH * 0.3, top + lidH * 0.8, d / 2 + 0.008, 0.05, 0.01, m("#2b2d30", "metal"));
}

function recyclingBox(P: Parts, def: GardenDef, item: GardenItem, w: number, d: number, h: number) {
  const body = m(item.color ?? def.color, "plastic");
  P.box(0, 0, h * 0.95, 0, w * 0.95, d * 0.95, body);
  P.box(0, h * 0.9, h, 0, w, d, m(shadeColor(item.color ?? def.color, 0.75), "plastic"));
  P.box(0, h * 0.9, h + 0.002, 0, w * 0.8, d * 0.75, m("#1d1f22", "plastic"));
}

function waterButt(P: Parts, def: GardenDef, item: GardenItem, w: number, d: number, h: number) {
  const body = m(item.color ?? def.color, "plastic");
  const D = Math.min(w, d);
  P.cyl(0, 0, h * 0.94, 0, D * 0.95, body);
  P.cyl(0, h * 0.94, h, 0, D * 0.8, m(shadeColor(item.color ?? def.color, 0.75), "plastic"));
  P.box(0, h * 0.12, h * 0.17, D * 0.47, 0.05, 0.05, m("#2b2d30", "plastic"));
}

function washingLine(P: Parts, def: GardenDef, item: GardenItem, w: number, d: number, h: number) {
  const metal = m(item.color ?? def.color, "metal");
  const line = m("#d4d8dc", "plastic");
  const R = Math.min(w, d) / 2;
  P.cyl(0, 0, h, 0, 0.04, metal);
  const armY = h - 0.12;
  // Four arms: two crossing bars along the diagonals of the square of lines, and their struts.
  for (const a of [Math.PI / 4, -Math.PI / 4]) P.box(0, armY - 0.012, armY + 0.012, 0, 2 * R * 0.98, 0.025, metal, a);
  // Four struts from the pole up to the arms.
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    P.bar([0, h - 0.5, 0], [Math.sin(a) * R * 0.6, armY - 0.012, Math.cos(a) * R * 0.6], 0.015, metal);
  }
  // Square rings of line, three sizes.
  for (const k of [0.4, 0.62, 0.85]) {
    const s = R * Math.SQRT1_2 * k * 2;
    for (const [x, z, ax] of [[0, s / 2, true], [0, -s / 2, true], [s / 2, 0, false], [-s / 2, 0, false]] as [number, number, boolean][]) {
      P.box(x, armY - 0.007, armY + 0.005, z, ax ? s : 0.012, ax ? 0.012 : s, line);
    }
  }
}

function bollard(P: Parts, def: GardenDef, item: GardenItem, w: number, d: number, h: number) {
  const body = m(item.color ?? def.color, "metal");
  const D = Math.min(w, d);
  const glow = def.glow ?? "#ffd9a0";
  P.cyl(0, 0, h - 0.13, 0, D, body);
  P.cyl(0, h - 0.13, h - 0.03, 0, D * 0.85, m(glow, "bulb", glow));
  P.cyl(0, h - 0.03, h, 0, D, body);
}

function wallLight(P: Parts, def: GardenDef, item: GardenItem, w: number, d: number, h: number) {
  const body = m(item.color ?? def.color, "metal");
  const glow = def.glow ?? "#ffd9a0";
  P.box(0, 0, h, -d / 2 + 0.01, w * 0.7, 0.02, body);
  P.box(0, h * 0.25, h * 0.85, 0, w * 0.75, d * 0.6, m(glow, "bulb", glow));
  P.box(0, h * 0.85, h, 0.0, w, d, body);
  P.box(0, h * 0.15, h * 0.25, 0, w * 0.8, d * 0.7, body);
}

type Builder = (P: Parts, def: GardenDef, item: GardenItem, w: number, d: number, h: number) => void;

const BUILDERS: Partial<Record<GardenDef["shape"], Builder>> = {
  "dining-set": diningSet,
  "lounge-set": loungeSet,
  bench,
  parasol,
  bbq,
  "fire-pit": firePit,
  pot,
  planter,
  shed,
  pergola,
  playhouse,
  "playhouse-kitchen": playhouseKitchen,
  "mud-kitchen": mudKitchen,
  trampoline,
  "bin-store": binStore,
  "storage-box": storageBox,
  "recycling-box": recyclingBox,
  "water-butt": waterButt,
  "washing-line": washingLine,
  bollard,
  "wall-light": wallLight,
};

/** Shapes gardenParts draws (everything that is not a plant or a run). */
export const PART_SHAPES = Object.keys(BUILDERS) as GardenDef["shape"][];

/**
 * The parts of a garden item that is not a plant or a run, in its local frame, sized by `itemSize`
 * (overrides applied). Unknown shapes give a plain box so nothing goes missing.
 */
export function gardenParts(def: GardenDef, item: GardenItem): GPart[] {
  const { w, d, h } = itemSize(item);
  const P = new Parts();
  const build = BUILDERS[def.shape];
  if (build) build(P, def, item, w, d, h);
  else P.box(0, 0, h, 0, w, d, m(item.color ?? def.color, "plastic"));
  return P.out;
}

export { STONE, Parts as GPartsBuilder, m as gmat };
