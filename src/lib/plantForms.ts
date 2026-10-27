import type { GardenItem } from "../types";
import { itemSize, type GardenDef } from "./gardenCatalogue";
import { gmat, GPartsBuilder, shadeColor, type GPart } from "./gardenParts";
import { runLength, steppingStones } from "./siteItems";

/**
 * Plants as low-poly parts: trunks and stems as cylinders, canopies and
 * mounds as faceted blobs, varied by a seed so two of a kind differ. Same
 * local frame as lib/gardenParts.ts (origin at the centre of the footprint at
 * ground level, y up). Runs (hedges, bamboo, climbers, stepping stones) are
 * built in the run's own frame: origin at the first end, +x towards `to`,
 * +z to its left on the plan; three/SiteItems.tsx lifts each part onto the
 * ground under it.
 */

/** Parts allowed per plant (not per run). */
export const PLANT_PART_BUDGET = 40;

/** Stable 32-bit hash of a string (FNV-1a). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a small seeded PRNG giving floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The seed an item's shape grows from. */
export const plantSeed = (item: Pick<GardenItem, "id" | "seed">) => (item.seed ?? hashString(item.id)) >>> 0;

type R = () => number;
const between = (r: R, a: number, b: number) => a + (b - a) * r();

interface Ctx {
  P: GPartsBuilder;
  r: R;
  w: number;
  h: number;
  leaf: string;
  trunk: string;
  accent?: string;
  /** The catalogue id, for plants whose flower heads differ by kind. */
  id: string;
  /** The blobs placed so far (for fruit hung on their outsides). */
  blobs?: { x: number; y: number; z: number; rx: number; ry: number; rz: number }[];
  /** A run: blobs are kept within w/2 across it (z) only, not round the origin. */
  run?: boolean;
}

/**
 * A blob of radius (rx, ry, rz) near (x, y, z), pulled in so it stays inside the plant's cylinder
 * (radius w/2) and below h; its colour nudged lighter or darker.
 */
function blob(c: Ctx, x: number, y: number, z: number, rx: number, ry: number, rz: number, color = c.leaf, g: "ico" | "sphere" = "ico") {
  const R = c.w / 2;
  rx = Math.min(rx, R);
  rz = Math.min(rz, R);
  ry = Math.min(ry, c.h / 2);
  if (c.run) z = Math.max(-(R - rz), Math.min(R - rz, z));
  const reach = c.run ? 0 : Math.hypot(x, z);
  const room = R - Math.max(rx, rz);
  if (reach > room && reach > 0) {
    x *= room / reach;
    z *= room / reach;
  }
  y = Math.min(Math.max(y, ry), c.h - ry);
  c.blobs?.push({ x, y, z, rx, ry, rz });
  c.P.blob(x, y, z, rx * 2, ry * 2, rz * 2, gmat(color, "leaf"), g);
}

/** A trunk or stem from the ground (or y0) leaning `lean` radians towards bearing `dir`, `len` long. */
function stem(c: Ctx, x: number, z: number, y0: number, len: number, dia: number, lean = 0, dir = 0, color = c.trunk): [number, number, number] {
  // The stem's axis after the tilt about x then the turn about y: (sin l · sin d, cos l, sin l · cos d).
  const ax = Math.sin(lean) * Math.sin(dir);
  const ay = Math.cos(lean);
  const az = Math.sin(lean) * Math.cos(dir);
  c.P.out.push({ g: "cyl", p: [x + (ax * len) / 2, y0 + (ay * len) / 2, z + (az * len) / 2], s: [dia, len, dia], mat: gmat(color, "bark"), ...(lean ? { tilt: lean, rotY: dir } : {}) });
  return [x + ax * len, y0 + ay * len, z + az * len];
}

/** A round canopy of n blobs filling the top of the plant from y0 to h, round a core blob `core` of the spread. */
function canopy(c: Ctx, n: number, y0: number, size: number, flat = 1, color = c.leaf, core = 0.8) {
  const R = c.w / 2;
  const H = c.h - y0;
  const cy = y0 + H / 2;
  if (core > 0) blob(c, 0, cy + H * 0.05, 0, R * core, (H / 2) * (core + 0.1) * flat, R * core, shadeColor(color, 0.92));
  for (let i = 1; i < n; i++) {
    const a = c.r() * Math.PI * 2;
    const br = R * between(c.r, size * 0.75, size * 1.1);
    const dist = between(c.r, 0.3, 1) * (R - br);
    const y = cy + between(c.r, -0.35, 0.4) * H;
    blob(c, Math.cos(a) * dist, y, Math.sin(a) * dist, br, br * 0.85 * flat, br, shadeColor(color, between(c.r, 0.88, 1.12)));
  }
}

/** Small coloured dots scattered over the top of a mound or canopy (flowers, fruit). */
function speckle(c: Ctx, n: number, y0: number, y1: number, rIn: number, size: number, color: string) {
  for (let i = 0; i < n; i++) {
    const a = c.r() * Math.PI * 2;
    const d = Math.sqrt(c.r()) * rIn;
    const y = y0 + (y1 - y0) * (1 - (d / Math.max(rIn, 1e-6)) ** 2 * 0.6) * between(c.r, 0.85, 1);
    blob(c, Math.cos(a) * d, y, Math.sin(a) * d, size, size, size, shadeColor(color, between(c.r, 0.9, 1.1)));
  }
}

/** Short flower spikes: speckles kept to the top of the mound, between y0 and y1. */
function spikes(c: Ctx, n: number, y0: number, y1: number, rIn: number, size: number, color: string) {
  for (let i = 0; i < n; i++) {
    const a = c.r() * Math.PI * 2;
    const d = Math.sqrt(c.r()) * rIn;
    blob(c, Math.cos(a) * d, y0 + (y1 - y0) * between(c.r, 0, 1), Math.sin(a) * d, size, size * 1.6, size, shadeColor(color, between(c.r, 0.9, 1.1)));
  }
}

function conifer(c: Ctx) {
  const { w, h } = c;
  stem(c, 0, 0, 0, h * 0.2, Math.min(0.18, w * 0.12));
  const tiers = 3 + Math.floor(c.r() * 2);
  const y0 = h * 0.08;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const base = y0 + (h - y0) * t * 0.82;
    const top = Math.min(h, base + (h - y0) * (0.5 - t * 0.12));
    const dia = w * (1 - t * 0.55) * between(c.r, 0.92, 1);
    const cx = between(c.r, -0.03, 0.03) * w, cz = between(c.r, -0.03, 0.03) * w;
    const col = shadeColor(c.leaf, between(c.r, 0.9, 1.1));
    c.P.cone(cx, base, top, cz, Math.min(w, dia), gmat(col, "leaf"));
    // Two soft blobs at the tier's base break the cone's hard edge.
    const bd = Math.min(w, dia) * 0.35;
    const a0 = c.r() * Math.PI;
    for (let k = 0; k < 2; k++) {
      const a = a0 + k * Math.PI;
      blob(c, cx + Math.cos(a) * (Math.min(w, dia) / 2 - bd * 0.55), base + bd * 0.4, cz + Math.sin(a) * (Math.min(w, dia) / 2 - bd * 0.55), bd / 2, bd * 0.4, bd / 2, shadeColor(col, between(c.r, 0.92, 1.08)));
    }
  }
  // Leader at the top.
  c.P.cone(0, h * 0.86, h, 0, w * 0.22, gmat(shadeColor(c.leaf, 1.05), "leaf"));
}

function birch(c: Ctx) {
  const { w, h, r } = c;
  const t = stem(c, 0, 0, 0, h * 0.78, Math.min(0.2, w * 0.06), between(r, 0, 0.06), r() * 6.28);
  // Two side branches and dark marks on the white bark.
  for (let i = 0; i < 2; i++) stem(c, t[0] * 0.5, t[2] * 0.5, h * between(r, 0.4, 0.55), h * 0.3, 0.05, between(r, 0.5, 0.8), r() * 6.28);
  for (let i = 0; i < 4; i++) c.P.box(t[0] * (0.1 + i * 0.12), h * (0.08 + i * 0.12), h * (0.08 + i * 0.12) + 0.04, t[2] * (0.1 + i * 0.12), 0.13, 0.13, gmat("#2b2a28", "bark"), r() * 3);
  // Loose, airy crown: no core, small blobs hung off the upper trunk and branches.
  const n = 9 + Math.floor(r() * 4);
  canopy(c, n, h * 0.35, 0.3, 1.25, c.leaf, 0);
}

function apple(c: Ctx) {
  const { w, h, r } = c;
  stem(c, 0, 0, 0, h * 0.4, Math.min(0.2, w * 0.07));
  for (let i = 0; i < 3; i++) stem(c, 0, 0, h * 0.35, h * 0.3, 0.07, between(r, 0.5, 0.8), (i / 3) * 6.28 + r());
  c.blobs = [];
  canopy(c, 11 + Math.floor(r() * 4), h * 0.42, 0.3, 0.85, c.leaf, 0.5);
  if (c.accent) {
    // Fruit hung on the outside of the canopy blobs.
    const out = c.blobs.filter((b) => Math.hypot(b.x, b.z) > 0.1);
    for (let i = 0; i < 12 && out.length; i++) {
      const b = out[Math.floor(r() * out.length)];
      const a = Math.atan2(b.z, b.x) + between(r, -0.8, 0.8);
      const fx = b.x + Math.cos(a) * b.rx * 0.95;
      const fz = b.z + Math.sin(a) * b.rz * 0.95;
      blob(c, fx, b.y + between(r, -0.3, 0.3) * b.ry, fz, 0.03, 0.03, 0.03, shadeColor(c.accent, between(r, 0.9, 1.1)), "sphere");
    }
  }
}

function acer(c: Ctx) {
  const { w, h, r } = c;
  for (let i = 0; i < 3; i++) stem(c, 0, 0, 0, h * 0.5, 0.05, between(r, 0.25, 0.5), (i / 3) * 6.28 + r());
  // Layered, thin tiers of foliage stepping up the stem.
  const n = 8 + Math.floor(r() * 3);
  const R = w / 2;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const a = r() * Math.PI * 2;
    const br = R * between(r, 0.3, 0.45);
    const d = between(r, 0.3, 1) * (R - br);
    blob(c, Math.cos(a) * d, h * (0.45 + 0.45 * t), Math.sin(a) * d, br, br * 0.3, br, shadeColor(c.leaf, between(r, 0.85, 1.15)));
  }
  blob(c, 0, h * 0.86, 0, w * 0.25, h * 0.1, w * 0.25, shadeColor(c.leaf, 1.05));
}

function olive(c: Ctx) {
  const { w, h, r } = c;
  const lean = between(r, 0.1, 0.2);
  const dir = r() * 6.28;
  const t = stem(c, 0, 0, 0, h * 0.35, Math.min(0.16, w * 0.1), lean, dir);
  stem(c, t[0], t[2], t[1], h * 0.2, 0.08, -lean, dir);
  canopy(c, 7 + Math.floor(r() * 3), h * 0.42, 0.36, 0.75, c.leaf, 0.5);
}

function bay(c: Ctx) {
  const { w, h } = c;
  const ball = Math.min(w / 2, h * 0.28);
  stem(c, 0, 0, 0, h - ball * 1.6, Math.min(0.06, w * 0.08));
  blob(c, 0, h - ball, 0, ball, ball, ball, c.leaf);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * 6.28 + c.r();
    blob(c, Math.cos(a) * ball * 0.35, h - ball + between(c.r, -0.1, 0.25) * ball, Math.sin(a) * ball * 0.35, ball * 0.7, ball * 0.7, ball * 0.7, shadeColor(c.leaf, between(c.r, 0.92, 1.12)));
  }
}

function boxBall(c: Ctx) {
  const d = Math.min(c.w, c.h);
  c.P.blob(0, c.h - d / 2, 0, d, d, d, gmat(c.leaf, "leaf"), "sphere");
}

function mound(c: Ctx, n: number, height = 1) {
  const { w, h, r } = c;
  const H = h * height;
  blob(c, 0, H * 0.45, 0, w * 0.45, H * 0.45, w * 0.45, shadeColor(c.leaf, 0.95));
  for (let i = 1; i < n; i++) {
    const a = r() * 6.28;
    const br = w * between(r, 0.22, 0.32);
    blob(c, Math.cos(a) * (w / 2 - br) * 0.8, H * between(r, 0.3, 0.5), Math.sin(a) * (w / 2 - br) * 0.8, br, H * between(r, 0.3, 0.42), br, shadeColor(c.leaf, between(r, 0.88, 1.12)));
  }
}

function lavender(c: Ctx) {
  mound(c, 2, 0.6);
  if (c.accent) spikes(c, 30, c.h * 0.75, c.h, c.w * 0.45, Math.min(0.025, c.w * 0.04), c.accent);
}

function hydrangea(c: Ctx) {
  mound(c, 3, 0.85);
  if (!c.accent) return;
  // Five to seven round flower heads sunk into the top of the mound.
  const n = 5 + Math.floor(c.r() * 3);
  const H = c.h * 0.85;
  const R = c.w * 0.45;
  for (let i = 0; i < n; i++) {
    const a = c.r() * Math.PI * 2;
    const dia = Math.min(between(c.r, 0.14, 0.18), c.w * 0.25);
    const d = Math.sqrt(c.r()) * (R * 0.7);
    const surface = H * 0.9 * Math.sqrt(Math.max(0, 1 - (d / R) ** 2));
    blob(c, Math.cos(a) * d, surface + dia * 0.1, Math.sin(a) * d, dia / 2, (dia / 2) * 0.8, dia / 2, shadeColor(c.accent, between(c.r, 0.92, 1.08)), "sphere");
  }
}

function perennials(c: Ctx) {
  mound(c, 3, 0.7);
  grassFan(c, 8, c.leaf, 0.5);
  if (c.accent) speckle(c, 12, c.h * 0.55, c.h, c.w * 0.45, Math.min(0.045, c.w * 0.05), c.accent);
}

/** A low leafy clump with five to nine upright stems, each topped by a flower head in the accent colour: tulips to sunflowers by size. */
function flowers(c: Ctx) {
  mound(c, 3, 0.4);
  const n = Math.min(Math.round(between(c.r, 5, 9)), c.id === "foxgloves" ? 6 : 9);
  const base = c.h * 0.28;
  for (let i = 0; i < n; i++) {
    const a = c.r() * Math.PI * 2;
    const len = Math.max(0.02, c.h * between(c.r, 0.6, 0.95) - base);
    const hr = Math.min(0.075, c.w * 0.13) * between(c.r, 0.8, 1.2);
    // Tall stems lean less, and every stem starts far enough in for its head to stay inside the spread.
    const lean = between(c.r, 0, 0.14) * Math.min(1, c.w / c.h);
    const d = Math.sqrt(c.r()) * Math.max(0, c.w / 2 - hr * 1.15 - Math.sin(lean) * len);
    const top = stem(c, Math.cos(a) * d, Math.sin(a) * d, base, len, Math.min(0.015, c.w * 0.03), lean, c.r() * Math.PI * 2, shadeColor(c.leaf, 0.85));
    if (c.accent) head(c, top, hr, len);
  }
}

/** One flower head on top of a stem, by kind (the catalogue id). */
function head(c: Ctx, top: [number, number, number], hr: number, len: number) {
  const [x, y, z] = top;
  const acc = () => shadeColor(c.accent!, between(c.r, 0.9, 1.1));
  const id = c.id;
  if (id === "alliums") {
    const R = Math.min(between(c.r, 0.04, 0.05), c.w * 0.12);
    blob(c, x, y, z, R, R, R, acc(), "sphere");
  } else if (id === "tulips" || id === "daffodils") {
    const col = acc();
    blob(c, x, y, z, hr * 0.8, hr * 1.3, hr * 0.8, col, "sphere");
  } else if (id === "cosmos" || id === "sunflowers" || id === "marigolds") {
    // A flat disc of petals with a dark centre.
    c.P.out.push({ g: "cyl", p: [x, y, z], s: [hr * 2, hr * 0.3, hr * 2], mat: gmat(acc(), "leaf") });
    const cr = hr * 0.4;
    c.P.blob(x, y + hr * 0.12, z, cr * 2, cr * 1.4, cr * 2, gmat(id === "sunflowers" ? "#3b2a14" : "#5a3d1e", "leaf"), "sphere");
  } else if (id === "foxgloves") {
    // Small bells stacked up the top of the stem, tapering.
    for (let k = 0; k < 4; k++) {
      const rr = hr * 0.55 * (1 - k * 0.18);
      blob(c, x, y - len * 0.1 + k * len * 0.1, z, rr, rr, rr, acc(), "sphere");
    }
  } else {
    blob(c, x, y - hr * 0.2, z, hr, hr * 0.75, hr, acc(), "sphere");
  }
}

/** A fan of thin tilted blades from the middle (grasses, fern fronds). */
function grassFan(c: Ctx, n: number, color: string, maxLean = 0.7, width = 0.045) {
  const { w, h, r } = c;
  for (let i = 0; i < n; i++) {
    const lean = between(r, 0.08, maxLean);
    const dir = (i / n) * 6.28 + r() * 0.5;
    const len = Math.min(h / Math.cos(lean), (w / 2 - width) / Math.max(Math.sin(lean), 1e-3)) * between(r, 0.75, 0.97);
    // Centre of a blade leaning `lean` towards `dir`, its foot at the middle.
    const ax = Math.sin(lean) * Math.sin(dir);
    const az = Math.sin(lean) * Math.cos(dir);
    // A tapered blade; its z scale sets how far it bows forward (towards its lean), 0.15 of that at the tip.
    c.P.out.push({ g: "blade", p: [(ax * len) / 2, (Math.cos(lean) * len) / 2 + 0.02, (az * len) / 2], s: [width, len, Math.min(1, len)], mat: gmat(shadeColor(color, between(r, 0.85, 1.15)), "leaf"), tilt: lean, rotY: dir });
  }
}

function grass(c: Ctx) {
  blob(c, 0, c.h * 0.12, 0, c.w * 0.25, c.h * 0.12, c.w * 0.25, shadeColor(c.leaf, 0.8));
  grassFan(c, 22, c.leaf, 0.55);
}

function buddleia(c: Ctx) {
  const { w, h, r } = c;
  const n = 5;
  for (let i = 0; i < n; i++) {
    const dir = (i / n) * 6.28 + r() * 0.6;
    const lean = between(r, 0.25, 0.45);
    const t = stem(c, 0, 0, 0, h * 0.5, 0.05, lean, dir);
    // Arching foliage at the end of each stem, a purple flower cone nodding outwards.
    blob(c, t[0] * 1.3, h * between(r, 0.55, 0.7), t[2] * 1.3, w * 0.24, h * 0.18, w * 0.24, shadeColor(c.leaf, between(r, 0.88, 1.12)));
    if (c.accent) {
      const out = Math.min(w / 2 - 0.15, Math.hypot(t[0], t[2]) * 1.9);
      const len = Math.min(0.35, h * 0.12);
      c.P.out.push({ g: "cone", p: [Math.sin(dir) * out, h * between(r, 0.72, 0.86), Math.cos(dir) * out], s: [0.12, len, 0.12], mat: gmat(shadeColor(c.accent, between(r, 0.9, 1.1)), "leaf"), tilt: 0.7, rotY: dir });
    }
  }
  canopy(c, 4, h * 0.45, 0.35, 0.8);
}

const PLANTS: Partial<Record<GardenDef["shape"], (c: Ctx) => void>> = {
  conifer,
  birch,
  apple,
  acer,
  olive,
  bay,
  "box-ball": boxBall,
  lavender,
  hydrangea,
  grass,
  buddleia,
  perennials,
  flowers,
};

function ctx(def: GardenDef, item: GardenItem, w: number, h: number): Ctx {
  return { P: new GPartsBuilder(), r: mulberry32(plantSeed(item)), w, h, leaf: item.color ?? def.color, trunk: def.trunk ?? "#5a4030", accent: item.accent ?? def.accent, id: def.id };
}

/** A single plant's parts in its local frame, within its spread (w) and height (h), seeded by `item.seed` or its id. */
export function plantParts(def: GardenDef, item: GardenItem): GPart[] {
  const { w, h } = itemSize(item);
  const c = ctx(def, item, w, h);
  (PLANTS[def.shape] ?? ((k: Ctx) => mound(k, 3)))(c);
  return c.P.out;
}

/**
 * A run's parts in the run's frame (origin at the first end on the ground, +x along the run): a hedge's
 * clipped body and blobs every `pitch`, bamboo canes in clumps, a climber's flat leafy band on the wall
 * plane up to h, or stepping stones where lib/siteItems.ts steppingStones puts them.
 */
export function runParts(def: GardenDef, item: GardenItem): GPart[] {
  const { w, d, h } = itemSize(item);
  const L = runLength(item);
  const pitch = Math.max(0.1, def.pitch ?? 0.5);
  const c = { ...ctx(def, item, w, h), run: true };
  const { P, r } = c;
  const leaf = c.leaf;
  if (def.run === "stones") {
    const dx = item.to ? (item.to.x - item.x) / (L || 1) : 1;
    const dy = item.to ? (item.to.y - item.y) / (L || 1) : 0;
    for (const s of steppingStones(item)) {
      const ox = s.x - item.x;
      const oy = s.y - item.y;
      const lx = ox * dx + oy * dy;
      const lz = -ox * dy + oy * dx;
      // Stones turned a little each, as laid by hand.
      P.box(lx, 0, h, lz, w * between(r, 0.92, 1), d * between(r, 0.85, 1), gmat(shadeColor(c.leaf, between(r, 0.92, 1.08)), "stone"), between(r, -0.25, 0.25));
    }
    return P.out;
  }
  const n = Math.max(1, Math.round(L / pitch) + 1);
  const xs = Array.from({ length: n }, (_, i) => (n === 1 ? 0 : (i * L) / (n - 1)));
  if (def.shape === "bamboo") {
    for (const x of xs) {
      const canes = 3;
      for (let k = 0; k < canes; k++) {
        const ch = h * between(r, 0.8, 1);
        const lean = between(r, 0, 0.08);
        stem(c, x + between(r, -0.08, 0.08), between(r, -w * 0.3, w * 0.3), 0, ch, 0.025, lean, r() * 6.28, shadeColor("#7f9a4a", between(r, 0.85, 1.15)));
      }
      blob(c, x, h * between(r, 0.55, 0.7), 0, pitch * 0.9, h * 0.22, w * 0.5, shadeColor(leaf, between(r, 0.88, 1.12)));
      blob(c, x + pitch * 0.3, h * between(r, 0.8, 0.88), between(r, -0.05, 0.05), pitch * 0.8, h * 0.13, w * 0.45, shadeColor(leaf, between(r, 0.9, 1.15)));
    }
    return P.out;
  }
  if (def.shape === "climber") {
    const base = Math.min(0.3, h * 0.15);
    // A stem every few metres, then the flat band of foliage, highest in the middle of each plant.
    for (let x = 0; x <= L + 1e-6; x += Math.max(1.5, L / 3 || 1)) stem(c, x, 0, 0, h * 0.6, 0.03);
    for (const x of xs) {
      const top = h * between(r, 0.72, 1);
      const rows = 3;
      for (let k = 0; k < rows; k++) {
        const y0 = base + ((top - base) * k) / rows;
        const y1 = base + ((top - base) * (k + 1)) / rows;
        blob(c, x, (y0 + y1) / 2, 0, pitch * 0.75, (y1 - y0) * 0.75, w * 0.5, shadeColor(leaf, between(r, 0.86, 1.14)));
      }
      if (c.accent && r() < 0.7) blob(c, x + between(r, -0.1, 0.1), top * between(r, 0.5, 0.9), w * 0.3, 0.05, 0.05, 0.03, c.accent);
    }
    return P.out;
  }
  // Hedge: a clipped body along the run with soft blobs along its top and sides.
  P.box(L / 2, 0, h * 0.86, 0, L + w * 0.7, w * 0.86, gmat(shadeColor(leaf, 0.9), "leaf"));
  for (const x of xs) {
    blob(c, x, h * between(r, 0.72, 0.8), 0, pitch * 0.8, h * 0.2, w * 0.48, shadeColor(leaf, between(r, 0.9, 1.12)));
    if (r() < 0.5) blob(c, x, h * between(r, 0.35, 0.55), between(r, -0.04, 0.04), pitch * 0.7, h * 0.22, w * 0.5, shadeColor(leaf, between(r, 0.85, 1.05)));
  }
  return P.out;
}
