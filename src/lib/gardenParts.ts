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
  g: "box" | "cyl" | "cone" | "sphere" | "ico" | "prism";
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
    const z = (i & 4 ? 0.5 : -0.5) * pt.s[2];
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
  prism(x: number, y0: number, y1: number, z: number, sx: number, sz: number, mat: GMat) {
    this.out.push({ g: "prism", p: [x, (y0 + y1) / 2, z], s: [sx, y1 - y0, sz], mat });
  }
}

const m = (color: string, finish: GFinish, glow?: string): GMat => (glow ? { color, finish, glow } : { color, finish });

/** A chair facing +z at (x, z) turned `rotY`, seat at `seat`, back up to `top`. */
function chair(P: Parts, x: number, z: number, rotY: number, seat: number, top: number, frame: GMat, cushion: GMat) {
  const c = Math.cos(rotY), s = Math.sin(rotY);
  // Local (lx, lz) in the chair's frame to the item's frame (rotation about y by rotY).
  const at = (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];
  const w = 0.46;
  for (const lx of [-w / 2 + 0.02, w / 2 - 0.02]) {
    const [ax, az] = at(lx, 0);
    P.box(ax, 0, seat, az, 0.03, w, frame, rotY);
  }
  const [sx, sz] = at(0, 0);
  P.box(sx, seat - 0.04, seat, sz, w, w, cushion, rotY);
  const [bx, bz] = at(0, -w / 2 + 0.03);
  P.box(bx, seat, top, bz, w, 0.04, frame, rotY);
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
      chair(P, Math.cos(a) * r, Math.sin(a) * r, Math.atan2(-Math.cos(a), -Math.sin(a)), seat, h, frame, seatMat);
    }
    return;
  }
  // The table's long side runs along the longer of w and d; chairs on the long sides, one at each end when odd.
  const along = d >= w ? "z" : "x";
  const L = along === "z" ? d : w;
  const W = along === "z" ? w : d;
  const tl = Math.max(0.6, L - 0.2);
  const tw = Math.max(0.6, Math.min(W - 0.9, 1.0));
  const tx = along === "z" ? tw : tl;
  const tz = along === "z" ? tl : tw;
  P.box(0, h - 0.03, h, 0, tx, tz, top);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box((sx * tx) / 2 - sx * 0.05, 0, h - 0.03, (sz * tz) / 2 - sz * 0.05, 0.04, 0.04, frame);
  const perSide = Math.ceil(seats / 2);
  const off = tw / 2 + 0.18;
  for (let side = 0; side < 2; side++) {
    const n = side === 0 ? perSide : seats - perSide;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5;
      const u = t * (tl - 0.4);
      const sgn = side === 0 ? -1 : 1;
      // Chairs face the table: their +z points across it.
      if (along === "z") chair(P, sgn * off, u, sgn < 0 ? Math.PI / 2 : -Math.PI / 2, seat, h, frame, seatMat);
      else chair(P, u, sgn * off, sgn < 0 ? 0 : Math.PI, seat, h, frame, seatMat);
    }
  }
}

function loungeSet(P: Parts, def: GardenDef, item: GardenItem, w: number, d: number, h: number) {
  const frame = m(item.color ?? def.color, "plastic");
  const cushion = m(item.accent ?? def.accent ?? "#d8d3c8", "fabric");
  const sd = Math.min(0.8, d * 0.45, w * 0.4);
  const base = Math.min(0.32, h * 0.5);
  const seatTop = Math.min(base + 0.1, h * 0.65);
  // Long run across the back, short run down the left side.
  P.box(0, 0, base, -d / 2 + sd / 2, w, sd, frame);
  P.box(-w / 2 + sd / 2, 0, base, (sd + 0) / 2, sd, d - sd, frame);
  P.box(0.05, base, seatTop, -d / 2 + sd / 2 + 0.06, w - 0.1, sd - 0.16, cushion);
  P.box(-w / 2 + sd / 2 + 0.06, base, seatTop, sd / 2, sd - 0.16, d - sd - 0.05, cushion);
  P.box(0, base, h, -d / 2 + 0.08, w, 0.16, frame);
  P.box(-w / 2 + 0.08, base, h, sd / 2 - 0.08, 0.16, d - sd + 0.16, frame);
  // Back cushions.
  const n = Math.max(2, Math.round(w / 0.7));
  for (let i = 0; i < n; i++) P.box(-w / 2 + sd + ((w - sd) * (i + 0.5)) / n, seatTop, h - 0.04, -d / 2 + 0.22, (w - sd) / n - 0.04, 0.14, cushion, 0, -0.15);
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
  P.cone(0, h - ch - 0.02, h - 0.02, 0, w, canopy);
  P.cyl(0, h - 0.04, h, 0, 0.06, pole);
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
 * A playhouse with a summer kitchen wing on its left (the Smoby Life Friends
 * house): the house itself as a hut set to the right, and on its left a
 * counter at child height with a grill and a sink, under the house's eaves.
 */
function playhouseKitchen(P: Parts, def: GardenDef, item: GardenItem, w: number, d: number, h: number) {
  const walls = m(item.color ?? def.color, "plastic");
  const roof = m(item.accent ?? def.accent ?? "#c2412f", "plastic");
  const door = m("#7fb04e", "plastic");
  const wing = Math.min(0.5, w * 0.22);
  const hw = w - wing;
  const hx = wing / 2;
  const house = new Parts();
  hut(house, hw, d * 0.9, h, walls, roof, door, 0.62, true);
  for (const pt of house.out) {
    pt.p[0] += hx;
    pt.p[2] -= d * 0.05;
  }
  P.out.push(...house.out);
  // Shutters either side of the window and a doorbell beside the door.
  const e = h * 0.62;
  const wy = Math.min(e * 0.55, 1.1);
  const wh = Math.min(0.45, e * 0.35);
  const ww = Math.min(0.5, hw * 0.3);
  for (const s of [-1, 1]) P.box(hx + hw * 0.22 + (s * (ww / 2 + 0.06)), wy - 0.03, wy + wh + 0.03, d * 0.4 - 0.005, 0.1, 0.02, door);
  P.box(hx - hw * 0.2 + Math.min(0.75, hw * 0.4) / 2 + 0.07, e * 0.5, e * 0.5 + 0.06, d * 0.4 - 0.005, 0.05, 0.02, m("#f2b23c", "plastic"));
  // The kitchen wing: a counter against the house's left wall, worktop at child height, splashback up the wall.
  const kx = -w / 2 + wing / 2;
  const kd = Math.min(0.7, d * 0.45);
  const top = Math.min(0.6, h * 0.35);
  P.box(kx, 0.02, top - 0.04, 0, wing - 0.04, kd, m(shadeColor(item.color ?? def.color, 0.92), "plastic"));
  P.box(kx, top - 0.04, top, 0, wing, kd + 0.04, m("#8a9aa6", "plastic"));
  P.box(hx - hw / 2 + 0.03, top, Math.min(h * 0.58, top + 0.45), 0, 0.03, kd, door);
  P.cyl(kx, top, top + 0.1, -kd * 0.22, Math.min(0.32, wing * 0.7), m(DARK, "metal"));
  P.box(kx, top + 0.1, top + 0.115, -kd * 0.22, Math.min(0.26, wing * 0.55), Math.min(0.26, wing * 0.55), m("#55595e", "metal"));
  P.cyl(kx, top, top + 0.015, kd * 0.25, Math.min(0.26, wing * 0.55), m("#7fb4d8", "plastic"));
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
  const top = Math.min(0.6, h * 0.65);
  for (const x of [-1, 1]) for (const z of [-1, 1]) P.box((x * w) / 2 - x * 0.03, 0, top, (z * d) / 2 - z * 0.03, 0.05, 0.05, wood);
  P.box(0, top - 0.03, top, 0, w, d, wood);
  P.box(0, 0.12, 0.15, 0, w - 0.06, d - 0.06, wood);
  P.box(0, top, h, -d / 2 + 0.02, w, 0.03, wood);
  P.box(0, h * 0.82, h * 0.84, -d / 2 + 0.1, w - 0.1, 0.15, wood);
  P.cyl(-w * 0.2, top - 0.08, top + 0.01, 0.02, Math.min(0.3, d * 0.6), m("#b9bdc2", "metal"));
  P.cyl(w * 0.22, top, top + 0.08, 0.05, 0.16, m("#c45a3a", "plastic"));
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
  const line = m("#e9ecef", "plastic");
  const R = Math.min(w, d) / 2;
  P.cyl(0, 0, h, 0, 0.04, metal);
  const armY = h - 0.12;
  // Four arms: two crossing bars along the diagonals of the square of lines, and their struts.
  for (const a of [Math.PI / 4, -Math.PI / 4]) P.box(0, armY - 0.012, armY + 0.012, 0, 2 * R * 0.98, 0.025, metal, a);
  for (const a of [Math.PI / 4, -Math.PI / 4]) P.box(0, h - 0.5, h - 0.48, 0, 0.9, 0.02, metal, a, 0);
  // Square rings of line, three sizes.
  for (const k of [0.4, 0.62, 0.85]) {
    const s = R * Math.SQRT1_2 * k * 2;
    for (const [x, z, ax] of [[0, s / 2, true], [0, -s / 2, true], [s / 2, 0, false], [-s / 2, 0, false]] as [number, number, boolean][]) {
      P.box(x, armY - 0.005, armY + 0.003, z, ax ? s : 0.008, ax ? 0.008 : s, line);
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
