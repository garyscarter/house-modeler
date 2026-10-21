import { EXT_WALL_T } from "./geometry";
import type { FlatRoofSkirt, PlanSide, WallSpot } from "../types";
import {
  DOWNPIPE_REACH,
  FLAT_OVERHANG,
  GUTTER_R,
  LEAN_DEPTH,
  PIPE_R,
  leanToHeightAt,
  leanToSurface,
  downpipeSpot,
  joinRoofs,
  pushPoly,
  roofGeometry,
  roofHeightAt,
  type FlatEdge,
  type FlatRoof,
  type LeanTo,
  type P3,
  type RoofPlan,
} from "./roof";

/** Triangles with texture coordinates in metres. */
export interface Soup {
  pos: number[];
  uv: number[];
}

/** Everything the roof renderer draws, grouped by material. */
export interface RoofParts {
  /** Tiled slopes (pitched roofs and lean-tos). */
  tiles: Soup;
  /** Gable ends and built-up walls, in the wall colour. */
  gables: number[];
  /** Fascias, soffits and bargeboards, in the fascia colour. */
  trim: number[];
  /** Ceilings under porch and canopy roofs, painted light (front photos) rather than in the fascia colour. */
  ceiling: number[];
  /** Flat roof membrane. */
  membrane: Soup;
  /** Flat roof edge trims with their upstand. */
  edgeTrim: number[];
  /** Lead flashings where a roof meets a taller wall. */
  flashing: number[];
  /** Chimney stacks and canopy pillars. */
  brick: Soup;
  /** Chimney flaunching. */
  cement: number[];
  /** Ridge and hip capping lines, with the pitch of the roof under them. */
  caps: { line: [P3, P3]; pitchDeg: number }[];
  gutters: [P3, P3][];
  /** Downpipe segments, swan necks included. */
  pipes: [P3, P3][];
  /** Soil and vent stacks (wider than downpipes), and the base of each one's vent terminal. */
  soil: [P3, P3][];
  vents: P3[];
  /** Chimney pot bases (centre of the bottom). */
  pots: P3[];
}

const BOARD = 0.025;

const up: P3 = [0, 1, 0];
const down: P3 = [0, -1, 0];

/** An axis-aligned box with texture coordinates in metres (courses stay level all round). */
export function pushBox(s: Soup, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, bottom = true) {
  const q = (pts: P3[], n: P3, uv: [number, number][]) => pushPoly(s.pos, pts, n, s.uv, uv);
  q([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
  q([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], [[-x1, y0], [-x0, y0], [-x0, y1], [-x1, y1]]);
  q([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], [[-z1, y0], [-z0, y0], [-z0, y1], [-z1, y1]]);
  q([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], [[z0, y0], [z1, y0], [z1, y1], [z0, y1]]);
  q([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], up, [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]);
  if (bottom) q([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], down, [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]);
}

/** The same box without texture coordinates. */
function pushPlainBox(out: number[], x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
  pushBox({ pos: out, uv: [] }, x0, y0, z0, x1, y1, z1);
}

/** Assemble the triangle soups for a planned roof. */
export function roofParts(
  plan: RoofPlan,
  opts: { gutters: boolean; skirt?: FlatRoofSkirt; downpipes?: WallSpot[]; soilPipes?: WallSpot[] },
): RoofParts {
  const parts: RoofParts = {
    tiles: { pos: [], uv: [] },
    gables: [],
    trim: [],
    ceiling: [],
    membrane: { pos: [], uv: [] },
    edgeTrim: [],
    flashing: [],
    brick: { pos: [], uv: [] },
    cement: [],
    caps: [],
    gutters: [],
    pipes: [],
    soil: [],
    vents: [],
    pots: [],
  };
  const placed = opts.downpipes ? assignDownpipes(plan, opts.downpipes, opts.skirt) : null;
  const drop = (path: P3[]) => {
    for (let i = 0; i + 1 < path.length; i++) parts.pipes.push([path[i], path[i + 1]]);
    const head = path[path.length - 1];
    parts.pipes.push([head, [head[0], footAt(plan, head[0], head[2], head[1]), head[2]]]);
  };

  plan.blocks.forEach((b, bi) => {
    // Each roof cut where another covers it, so an extension's roof meets the main roof in valleys.
    const tr = joinRoofs(plan.blocks, bi, placed?.blocks[bi]);
    parts.tiles.pos.push(...tr.slopes);
    parts.tiles.uv.push(...tr.slopeUVs);
    parts.gables.push(...tr.gables);
    parts.trim.push(...tr.trim);
    parts.caps.push(...tr.caps.map((line) => ({ line, pitchDeg: b.pitchDeg })));
    if (opts.gutters) {
      parts.gutters.push(...tr.gutters);
      for (const dp of tr.downpipes) drop(dp.path);
    }
  });
  if (opts.gutters) for (const f of placed?.flats ?? []) drop(flatDownpipe(f.roof, f.edge, f.along));
  for (const sp of opts.soilPipes ?? []) {
    const stack = soilStack(plan, sp.x, sp.y);
    if (!stack) continue;
    parts.soil.push(stack.line);
    parts.vents.push(stack.vent);
  }

  for (const fr of plan.flatRoofs) {
    const skirted = skirtedEdges(fr, opts.skirt);
    flatRoofParts(fr, parts, skirted, opts.skirt);
    if (skirted.length) skirtParts(fr, opts.skirt!, parts, { gutters: opts.gutters, foot: (x, z, from) => footAt(plan, x, z, from) });
  }
  for (const l of plan.leanTos) leanToParts(l, parts, opts.gutters);

  for (const p of plan.pillars) pushBox(parts.brick, p.x - 0.15, p.y0, p.z - 0.15, p.x + 0.15, p.y1, p.z + 0.15, false);

  for (const c of plan.chimneys) {
    const [x0, x1, z0, z1] = [c.x - c.w / 2, c.x + c.w / 2, c.z - c.d / 2, c.z + c.d / 2];
    // Shaft, an oversailing course two bricks deep, a top course, then the cement flaunching and pots.
    pushBox(parts.brick, x0, c.y0, z0, x1, c.y1 - 0.225, z1, false);
    pushBox(parts.brick, x0 - 0.05, c.y1 - 0.225, z0 - 0.05, x1 + 0.05, c.y1 - 0.075, z1 + 0.05);
    pushBox(parts.brick, x0, c.y1 - 0.075, z0, x1, c.y1, z1);
    pushPlainBox(parts.cement, x0 + 0.02, c.y1, z0 + 0.02, x1 - 0.02, c.y1 + 0.05, z1 - 0.02);
    const alongX = c.w >= c.d;
    const n = c.pots;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5;
      parts.pots.push(alongX ? [c.x + t * c.w, c.y1 + 0.05, c.z] : [c.x, c.y1 + 0.05, c.z + t * c.d]);
    }
  }
  return parts;
}

/**
 * Which roof each downpipe spot (world x, y = z) goes on: the nearest
 * guttered wall of a pitched roof (see downpipeSpot), or the nearest plain
 * eaves edge of a flat roof, where no skirt covers it, within DOWNPIPE_REACH.
 * Spots near neither are dropped.
 */
export function assignDownpipes(
  plan: RoofPlan,
  spots: WallSpot[],
  skirt?: FlatRoofSkirt,
): { blocks: [number, number][][]; flats: { roof: FlatRoof; edge: FlatEdge; along: number }[] } {
  const blocks: [number, number][][] = plan.blocks.map(() => []);
  const flats: { roof: FlatRoof; edge: FlatEdge; along: number }[] = [];
  const tol = 0.05;
  for (const { x, y: z } of spots) {
    let best: { dist: number; put: () => void } | null = null;
    plan.blocks.forEach((b, i) => {
      const at = downpipeSpot(b, x, z);
      if (at && (!best || at.dist < best.dist)) best = { dist: at.dist, put: () => blocks[i].push([x, z]) };
    });
    for (const fr of plan.flatRoofs) {
      const skirted = skirtedEdges(fr, skirt);
      for (const e of fr.edges) {
        if (e.kind !== "eaves") continue;
        const [along, across] = e.axis === "x" ? [x, z] : [z, x];
        if (along < e.a - tol || along > e.b + tol) continue;
        if (skirted.some((k) => k.src === e && along > k.a - tol && along < k.b + tol)) continue;
        const dist = Math.abs(across - e.at);
        if (dist <= DOWNPIPE_REACH && (!best || dist < best.dist)) best = { dist, put: () => flats.push({ roof: fr, edge: e, along }) };
      }
    }
    (best as { put: () => void } | null)?.put();
  }
  return { blocks, flats };
}

/**
 * A downpipe off a plain flat-roof edge: an outlet through the fascia at
 * membrane level, down the outside of the fascia and a swan neck under the
 * soffit back to the wall. The path stops there; the caller runs it down.
 */
export function flatDownpipe(fr: FlatRoof, e: FlatEdge, along: number): P3[] {
  const half = EXT_WALL_T / 2;
  const W = half + FLAT_OVERHANG;
  const P = (al: number, y: number, ac: number): P3 => (e.axis === "x" ? [al, y, e.at + e.out * ac] : [e.at + e.out * ac, y, al]);
  const a = Math.min(Math.max(along, e.a + 0.12), e.b - 0.12);
  const out = W + PIPE_R + 0.01;
  const dp = half + PIPE_R + 0.02;
  const yOut = fr.top - 0.04;
  const ySoffit = fr.y - 0.04;
  return [P(a, yOut, W - 0.08), P(a, yOut, out), P(a, ySoffit - 0.06, out), P(a, ySoffit - 0.06 - 0.8 * (out - dp), dp)];
}

/** Radius of a 110 mm soil and vent pipe. */
export const SOIL_R = 0.055;

/**
 * A soil and vent stack beside the nearest exposed outer wall face of a
 * pitched roof block (not a party wall), within DOWNPIPE_REACH of the spot:
 * from the roof or ground below up through the eaves to just clear of the
 * tiles over it, where its vent terminal sits. Null when no wall is near.
 */
export function soilStack(plan: RoofPlan, x: number, z: number): { line: [P3, P3]; vent: P3 } | null {
  let best: { dist: number; px: number; pz: number; b: (typeof plan.blocks)[number] } | null = null;
  for (const b of plan.blocks) {
    const half = (b.wallT ?? EXT_WALL_T) / 2;
    const off = half + SOIL_R + 0.03;
    const flushAt = (axis: "x" | "z", end: "start" | "end") => b.axis === axis && b[end] === "flush";
    const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo + 0.1), hi - 0.1);
    const faces = [
      { open: !flushAt("x", "start"), dist: Math.abs(x - (b.x0 - half)), on: z > b.z0 - half && z < b.z1 + half, px: b.x0 - off, pz: clamp(z, b.z0 - half, b.z1 + half) },
      { open: !flushAt("x", "end"), dist: Math.abs(x - (b.x1 + half)), on: z > b.z0 - half && z < b.z1 + half, px: b.x1 + off, pz: clamp(z, b.z0 - half, b.z1 + half) },
      { open: !flushAt("z", "start"), dist: Math.abs(z - (b.z0 - half)), on: x > b.x0 - half && x < b.x1 + half, px: clamp(x, b.x0 - half, b.x1 + half), pz: b.z0 - off },
      { open: !flushAt("z", "end"), dist: Math.abs(z - (b.z1 + half)), on: x > b.x0 - half && x < b.x1 + half, px: clamp(x, b.x0 - half, b.x1 + half), pz: b.z1 + off },
    ];
    for (const f of faces) if (f.open && f.on && f.dist <= DOWNPIPE_REACH && (!best || f.dist < best.dist)) best = { dist: f.dist, px: f.px, pz: f.pz, b };
  }
  if (!best) return null;
  const { px, pz, b } = best;
  const tiles = roofHeightAt(b, px, pz) ?? roofGeometry(b).eavesY;
  const top = tiles + 0.15;
  return { line: [[px, footAt(plan, px, pz, b.y), pz], [px, top, pz]], vent: [px, top, pz] };
}

/** Where a downpipe at (x, z) coming down from `from` ends: on the highest flat or lean-to roof below it, else the ground. */
export function footAt(plan: RoofPlan, x: number, z: number, from: number): number {
  let foot = plan.groundY;
  const reach = EXT_WALL_T / 2 + FLAT_OVERHANG;
  for (const fr of plan.flatRoofs) {
    if (fr.top >= from || fr.top <= foot) continue;
    const on = fr.rects.some((r) => x > r.x0 - reach && x < r.x1 + reach && z > r.z0 - reach && z < r.z1 + reach);
    if (on) foot = fr.top;
  }
  for (const l of plan.leanTos) {
    const h = leanToHeightAt(l, x, z);
    if (h !== null && h < from && h > foot) foot = h;
  }
  return foot;
}

/**
 * Membrane, fascias, soffits, edge trims and flashings of one flat roof. Skirted edges get no drip trim: the tiles cover them.
 * Where the skirt's eaves are dropped below the deck (see skirtEaves) its fascia and soffit come down with them, the porch
 * ceilings too, and the membrane stops where the slope rises through the deck, so it never shows over the tiles.
 */
function flatRoofParts(fr: FlatRoof, parts: RoofParts, skirted: SkirtEdge[] = [], skirt?: FlatRoofSkirt) {
  const half = EXT_WALL_T / 2;
  const W = half + FLAT_OVERHANG;
  const ySoffit = fr.y - 0.04;
  const low = skirt && skirted.length ? skirtEaves(fr, skirt) : null;
  const dropped = low && low.yE < fr.top - 0.03 - 1e-6 ? low : null;
  const yCeiling = dropped ? dropped.ySoffit : ySoffit;
  const membrane = (x0: number, z0: number, x1: number, z1: number) =>
    pushPoly(
      parts.membrane.pos,
      [
        [x0, fr.top, z0],
        [x1, fr.top, z0],
        [x1, fr.top, z1],
        [x0, fr.top, z1],
      ],
      up,
      parts.membrane.uv,
      [
        [x0, z0],
        [x1, z0],
        [x1, z1],
        [x0, z1],
      ],
    );
  // A dropped skirt's tiles stay under the deck for a little way in from its eaves: keep the membrane off that strip.
  const t = skirt ? Math.tan((skirt.pitchDeg * Math.PI) / 180) : 0;
  const inset = dropped && t > 0 ? (fr.top - dropped.yE) / t - W : 0;
  const cuts: Box2[] = inset > 0 ? skirted.map((s) => skirtStrip(s, inset)) : [];
  for (const r of fr.rects) for (const p of cutBoxes([{ x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1 }], cuts)) membrane(p.x0, p.z0, p.x1, p.z1);
  for (const r of fr.open)
    pushPoly(
      parts.ceiling,
      [
        [r.x0, yCeiling, r.z0],
        [r.x1, yCeiling, r.z0],
        [r.x1, yCeiling, r.z1],
        [r.x0, yCeiling, r.z1],
      ],
      down,
    );

  for (const e of fr.edges) {
    // (along, across) on the edge line to world.
    const P = (along: number, y: number, across: number): P3 => (e.axis === "x" ? [along, y, e.at + e.out * across] : [e.at + e.out * across, y, along]);
    const N = (across: number, y = 0): P3 => (e.axis === "x" ? [0, y, e.out * across] : [e.out * across, y, 0]);
    const quad = (out: number[], a: number, b: number, c0: number, c1: number, y0: number, y1: number, n: P3) =>
      pushPoly(out, c0 === c1 ? [P(a, y0, c0), P(b, y0, c0), P(b, y1, c0), P(a, y1, c0)] : [P(a, y0, c0), P(b, y0, c0), P(b, y0, c1), P(a, y0, c1)], n);
    if (e.kind === "abutment") {
      const [a, b] = [e.a - e.fascia[0], e.b + e.fascia[1]];
      // Where a dropped skirt's tiles run into this wall they carry their own flashing, and the deck's would stand proud of them.
      const covered = dropped && skirt ? skirtWallCover(fr, skirt, skirted, e) : [];
      for (const [p, q] of subtract(a, b, covered)) quad(parts.flashing, p, q, -(half + 0.006), -(half + 0.006), fr.top - 0.01, fr.top + 0.15, N(-1));
      continue;
    }
    const [fa, fb] = [e.a - e.fascia[0], e.b + e.fascia[1]];
    const [oa, ob] = [e.a - e.soffit[0], e.b + e.soffit[1]];
    if (!dropped) {
      quad(parts.trim, fa, fb, W, W, ySoffit, fr.top - 0.03, N(1));
      quad(parts.trim, fa, fb, W, W - BOARD, ySoffit, ySoffit, down);
      quad(parts.trim, oa, ob, half, W - BOARD, ySoffit, ySoffit, down);
    } else {
      // Under the skirt the fascia and soffit sit lower; elsewhere they stay at the deck.
      const under = skirted.filter((s) => s.src === e).map((s): [number, number] => [s.a - s.fascia[0], s.b + s.fascia[1]]);
      const within = (a: number, b: number) => under.map(([p, q]): [number, number] => [Math.max(a, p), Math.min(b, q)]).filter(([p, q]) => q - p > 0.01);
      for (const [p, q] of subtract(fa, fb, under)) {
        quad(parts.trim, p, q, W, W, ySoffit, fr.top - 0.03, N(1));
        quad(parts.trim, p, q, W, W - BOARD, ySoffit, ySoffit, down);
      }
      for (const [p, q] of within(fa, fb)) {
        quad(parts.trim, p, q, W, W, dropped.ySoffit, dropped.yE, N(1));
        quad(parts.trim, p, q, W, W - BOARD, dropped.ySoffit, dropped.ySoffit, down);
      }
      for (const [p, q] of subtract(oa, ob, under)) quad(parts.trim, p, q, half, W - BOARD, ySoffit, ySoffit, down);
      // From the wall line, so it also closes the slot over the open side of a porch, below the wall tops.
      for (const [p, q] of within(oa, ob)) quad(parts.trim, p, q, 0, W - BOARD, dropped.ySoffit, dropped.ySoffit, down);
    }
    // Stretches the skirt's tiles cover need neither the membrane strip nor the drip trim.
    // (Past a corner too, where the drip trim would otherwise run on a little.)
    const tiled = skirted.filter((s) => s.src === e).map((s): [number, number] => [s.a - s.fascia[0] - (s.cut[0] ? 0 : 0.05), s.b + s.fascia[1] + (s.cut[1] ? 0 : 0.05)]);
    for (const [sa, sb] of subtract(e.a - e.strip[0], e.b + e.strip[1], tiled))
      pushPoly(parts.membrane.pos, [P(sa, fr.top, 0), P(sb, fr.top, 0), P(sb, fr.top, W), P(sa, fr.top, W)], up, parts.membrane.uv, [
        [P(sa, 0, 0)[0], P(sa, 0, 0)[2]],
        [P(sb, 0, 0)[0], P(sb, 0, 0)[2]],
        [P(sb, 0, W)[0], P(sb, 0, W)[2]],
        [P(sa, 0, W)[0], P(sa, 0, W)[2]],
      ]);
    // Drip trim: a slim edge standing proud of the membrane to hold water back.
    const [ci, co, yb, yt] = [W - 0.02, W + 0.015, fr.top - 0.06, fr.top + 0.035];
    for (const [ta, tb] of subtract(fa - (e.fascia[0] > 0 ? 0.015 : 0), fb + (e.fascia[1] > 0 ? 0.015 : 0), tiled)) {
      quad(parts.edgeTrim, ta, tb, co, co, yb, yt, N(1));
      quad(parts.edgeTrim, ta, tb, ci, ci, fr.top - 0.005, yt, N(-1));
      quad(parts.edgeTrim, ta, tb, ci, co, yt, yt, up);
      quad(parts.edgeTrim, ta, tb, W, co, yb, yb, down);
      for (const [at, sign] of [
        [ta, -1],
        [tb, 1],
      ] as const) {
        const n: P3 = e.axis === "x" ? [sign, 0, 0] : [0, 0, sign];
        pushPoly(parts.edgeTrim, [P(at, yb, W), P(at, yb, co), P(at, yt, co), P(at, yt, ci), P(at, fr.top - 0.005, ci)], n);
      }
    }
  }
}

/** Tiles, porch ceiling, beam, verges, gutter and any built-up walls of a lean-to. */
function leanToParts(l: LeanTo, parts: RoofParts, gutters: boolean) {
  const half = EXT_WALL_T / 2;
  const cos = Math.cos((l.pitchDeg * Math.PI) / 180);
  const o = l.overhang;
  // Local (u along the wall, h, d out from the wall line) to world.
  const P = (u: number, h: number, d: number): P3 => (l.axis === "x" ? [u, h, l.wall + l.dir * d] : [l.wall + l.dir * d, h, u]);
  const N = (u: number, h: number, d: number): P3 => (l.axis === "x" ? [u, h, l.dir * d] : [l.dir * d, h, u]);
  const surf = (d: number) => leanToSurface(l, d);
  const lo = (d: number) => surf(d) - LEAN_DEPTH;
  const INSET = 0.03;
  const ua = l.startFlush ? l.u0 : l.u0 - o;
  const ub = l.endFlush ? l.u1 : l.u1 + o;
  const dw = half;
  const de = l.depth + o;
  const dfo = de - INSET;
  const dfi = dfo - BOARD;
  const poly = (out: number[], pts: P3[], n: P3) => pushPoly(out, pts, n);

  pushPoly(parts.tiles.pos, [P(ua, surf(dw), dw), P(ub, surf(dw), dw), P(ub, surf(de), de), P(ua, surf(de), de)], up, parts.tiles.uv, [
    [ua, (de - dw) / cos],
    [ub, (de - dw) / cos],
    [ub, 0],
    [ua, 0],
  ]);
  // Fascia along the low edge.
  const fa = l.startFlush ? ua : ua + INSET;
  const fb = l.endFlush ? ub : ub - INSET;
  poly(parts.trim, [P(fa, surf(de), dfo), P(fb, surf(de), dfo), P(fb, surf(de) - LEAN_DEPTH, dfo), P(fa, surf(de) - LEAN_DEPTH, dfo)], N(0, 0, 1));
  poly(parts.trim, [P(fa, surf(de) - LEAN_DEPTH, dfo), P(fb, surf(de) - LEAN_DEPTH, dfo), P(fb, surf(de) - LEAN_DEPTH, dfi), P(fa, surf(de) - LEAN_DEPTH, dfi)], down);
  // Porch ceiling following the roof.
  const ca = l.startFlush ? ua : ua + INSET + BOARD;
  const cb = l.endFlush ? ub : ub - INSET - BOARD;
  poly(parts.ceiling, [P(ca, lo(dw), dw), P(cb, lo(dw), dw), P(cb, lo(dfi), dfi), P(ca, lo(dfi), dfi)], down);
  // Beam over the posts along the open edge.
  const beam = { pos: [] as number[], uv: [] as number[] };
  const [b0, b1] = [P(l.u0, l.postTop, l.depth - 0.07), P(l.u1, lo(l.depth), l.depth + 0.07)];
  pushBox(beam, Math.min(b0[0], b1[0]), b0[1], Math.min(b0[2], b1[2]), Math.max(b0[0], b1[0]), b1[1], Math.max(b0[2], b1[2]));
  parts.trim.push(...beam.pos);
  // Bargeboards at open ends.
  for (const [flush, u, sign] of [
    [l.startFlush, ua, -1],
    [l.endFlush, ub, 1],
  ] as const) {
    if (flush) continue;
    const uo = u - sign * INSET;
    const ui = uo - sign * BOARD;
    const top = (d: number) => surf(d) - 0.015;
    poly(parts.trim, [P(uo, top(dw), dw), P(uo, top(dfo), dfo), P(uo, lo(dfo), dfo), P(uo, lo(dw), dw)], N(sign, 0, 0));
    poly(parts.trim, [P(uo, lo(dw), dw), P(uo, lo(dfo), dfo), P(ui, lo(dfo), dfo), P(ui, lo(dw), dw)], down);
  }
  // A lower wall behind or beside is built up to meet the roof.
  const lift = 0.04;
  if (!l.tallWall) {
    const g = { pos: [] as number[], uv: [] as number[] };
    const [p0, p1] = [P(l.u0 - half, l.postTop, -half), P(l.u1 + half, surf(dw) + lift, half)];
    pushBox(g, Math.min(p0[0], p1[0]), p0[1], Math.min(p0[2], p1[2]), Math.max(p0[0], p1[0]), p1[1], Math.max(p0[2], p1[2]), false);
    parts.gables.push(...g.pos);
  } else {
    poly(parts.flashing, [P(ua, surf(dw) - 0.02, dw + 0.006), P(ub, surf(dw) - 0.02, dw + 0.006), P(ub, surf(dw) + 0.15, dw + 0.006), P(ua, surf(dw) + 0.15, dw + 0.006)], N(0, 0, 1));
  }
  for (const [cheek, u] of [
    [l.startCheek, l.u0],
    [l.endCheek, l.u1],
  ] as const) {
    if (!cheek) continue;
    for (const side of [-1, 1]) {
      const uu = u + side * half;
      poly(parts.gables, [P(uu, l.postTop, dw), P(uu, l.postTop, l.depth), P(uu, surf(l.depth) + lift, l.depth), P(uu, surf(dw) + lift, dw)], N(side, 0, 0));
    }
    poly(parts.gables, [P(u - half, surf(dw) + lift, dw), P(u + half, surf(dw) + lift, dw), P(u + half, surf(l.depth) + lift, l.depth), P(u - half, surf(l.depth) + lift, l.depth)], up);
    poly(parts.gables, [P(u - half, l.postTop, l.depth), P(u + half, l.postTop, l.depth), P(u + half, surf(l.depth) + lift, l.depth), P(u - half, surf(l.depth) + lift, l.depth)], N(0, 0, 1));
  }
  if (gutters) {
    const dg = dfo + GUTTER_R;
    parts.gutters.push([P(ua, surf(de) - 0.03, dg), P(ub, surf(de) - 0.03, dg)]);
  }
}

/** The plan side an eaves edge faces. */
function sideOf(e: FlatEdge): PlanSide {
  return e.axis === "x" ? (e.out > 0 ? "front" : "rear") : e.out > 0 ? "right" : "left";
}

/** A stretch of a flat roof's eaves edge under the tiled skirt. */
export interface SkirtEdge extends FlatEdge {
  /** The eaves edge it is part of. */
  src: FlatEdge;
  /** Ends where a return stops short of the edge's own end. */
  cut: [boolean, boolean];
}

/** Whether a perpendicular edge in `list` turns the corner at end `end` of `e`. */
function turnsCorner(e: FlatEdge, end: 0 | 1, list: FlatEdge[]) {
  const along = end === 0 ? e.a : e.b;
  return list.some((f) => f.axis !== e.axis && Math.abs(f.at - along) < 0.05 && (Math.abs(f.a - e.at) < 0.05 || Math.abs(f.b - e.at) < 0.05));
}

/**
 * The stretches of a flat roof's eaves that carry the tiled skirt: every
 * eaves edge facing one of the skirt's sides, plus its returns, which carry
 * it round an outside corner and a set distance along the next edge.
 */
export function skirtedEdges(fr: FlatRoof, skirt: FlatRoofSkirt | undefined): SkirtEdge[] {
  if (!skirt?.sides.length) return [];
  const eaves = fr.edges.filter((e) => e.kind === "eaves");
  const full = eaves.filter((e) => skirt.sides.includes(sideOf(e)));
  const out: SkirtEdge[] = full.map((e) => ({ ...e, src: e, cut: [false, false] }));
  const ret = skirt.returns ?? 0;
  if (ret <= 0) return out;
  for (const e of eaves) {
    if (full.includes(e)) continue;
    const [t0, t1] = [e.fascia[0] > 0 && turnsCorner(e, 0, full), e.fascia[1] > 0 && turnsCorner(e, 1, full)];
    // Returns are measured from the outside corner of the eaves.
    const [oa, ob] = [e.a - e.fascia[0], e.b + e.fascia[1]];
    const [ra, rb] = [oa + ret, ob - ret];
    if ((t0 && t1 && ra >= rb) || (t0 && ra >= ob) || (t1 && rb <= oa)) {
      out.push({ ...e, src: e, cut: [false, false] });
      continue;
    }
    if (t0) out.push({ ...e, b: ra, fascia: [e.fascia[0], 0], src: e, cut: [false, true] });
    if (t1) out.push({ ...e, a: rb, fascia: [0, e.fascia[1]], src: e, cut: [true, false] });
  }
  return out;
}

/**
 * Edges across the roof from `e`, which a slope rising from `e` heads for, with how far the
 * slope can run from the eaves before it reaches them: to the face of a taller wall or of an
 * unskirted edge, or halfway to a skirted stretch facing it (the two would meet in a ridge).
 */
function facing(e: FlatEdge, all: FlatEdge[], skirted: SkirtEdge[]) {
  const half = EXT_WALL_T / 2;
  const W = half + FLAT_OVERHANG;
  const opposite = (g: FlatEdge) => g !== e && g.axis === e.axis && g.out === -e.out && (e.at - g.at) * e.out > 0 && Math.min(e.b, g.b) - Math.max(e.a, g.a) > 0.05;
  const dist = (g: FlatEdge) => Math.abs(e.at - g.at);
  return [
    ...all.filter(opposite).map((g) => ({ g, reach: dist(g) + W - half })),
    ...skirted.filter(opposite).map((g) => ({ g: g as FlatEdge, reach: dist(g) / 2 + W })),
  ];
}

/**
 * Horizontal depth of a flat roof's skirt. It is the same all round, so hips
 * and valleys run at 45 degrees and meet cleanly, and it is cut back so no
 * slope runs into a taller wall or through the slope facing it: a skirt set
 * deeper than the roof allows stops against the wall above it.
 */
export function skirtRun(fr: FlatRoof, skirt: FlatRoofSkirt): number {
  const skirted = skirtedEdges(fr, skirt);
  let run = Math.max(0.2, skirt.depth);
  for (const e of skirted) for (const { reach } of facing(e, fr.edges, skirted)) run = Math.min(run, reach);
  return run;
}

/**
 * How a skirted edge ends: mitred into a hip (outside corner) or a valley
 * (inside corner) where the skirt turns the corner, square where it does not,
 * or against a taller wall.
 */
export type SkirtEnd = "hip" | "valley" | "square" | "wall";
export function skirtEnd(e: SkirtEdge, end: 0 | 1, skirted: SkirtEdge[]): SkirtEnd {
  if (e.cut[end]) return "square";
  const turns = turnsCorner(e, end, skirted);
  const adj = e.fascia[end];
  if (adj > 0) return turns ? "hip" : "square";
  // Fascias run back by the full eaves width from an inside corner, and by less to a taller wall.
  if (adj < -EXT_WALL_T / 2 - 1e-6) return turns ? "valley" : "square";
  return "wall";
}

/** Depth of a dropped skirt's fascia, from its eaves down to its soffit. */
export const SKIRT_FASCIA = 0.2;

/**
 * Where a flat roof's skirt starts: the height of its eaves (the top of its
 * fascia, where the tiles start) and of its soffit. Level with the deck
 * unless the skirt is dropped, and then never below the tops of the walls.
 */
export function skirtEaves(fr: FlatRoof, skirt: FlatRoofSkirt): { yE: number; ySoffit: number } {
  const deck = fr.top - 0.03;
  const yE = Math.max(Math.min(fr.y, deck), deck - Math.max(0, skirt.drop ?? 0));
  return { yE, ySoffit: Math.min(fr.y - 0.04, yE - SKIRT_FASCIA) };
}

/**
 * Stretches of a taller wall (an abutment edge `g` of the flat roof) that a skirt's tiles run into: the tops of the
 * slopes facing it, between their hips or valleys, and the ends of slopes that stop against it.
 */
function skirtWallCover(fr: FlatRoof, skirt: FlatRoofSkirt, skirted: SkirtEdge[], g: FlatEdge): [number, number][] {
  const half = EXT_WALL_T / 2;
  const W = half + FLAT_OVERHANG;
  const run = skirtRun(fr, skirt);
  const across = W - run;
  const out: [number, number][] = [];
  for (const s of skirted) {
    const ends = [skirtEnd(s, 0, skirted), skirtEnd(s, 1, skirted)] as const;
    if (s.axis === g.axis) {
      if (!facing(s, fr.edges, skirted).some((f) => f.g === g && f.reach <= run + 1e-6)) continue;
      const inset = (k: SkirtEnd) => (k === "hip" ? run : k === "valley" ? -run : 0);
      out.push([s.a - s.fascia[0] + inset(ends[0]), s.b + s.fascia[1] - inset(ends[1])]);
      continue;
    }
    // A slope ending square against this wall covers it from its eaves to its top.
    for (const end of [0, 1] as const) {
      const along = end === 0 ? s.a : s.b;
      if (ends[end] !== "wall" || Math.abs(along - g.at) > half + 0.05) continue;
      const [p, q] = [s.at + s.out * W, s.at + s.out * across];
      out.push([Math.min(p, q), Math.max(p, q)]);
    }
  }
  return out;
}

/** An axis-aligned rectangle on the ground plane, world metres. */
interface Box2 {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** The strip `depth` wide just inside a skirted stretch's wall line, along its whole length. */
function skirtStrip(s: SkirtEdge, depth: number): Box2 {
  const [a, b] = [s.a - Math.max(0, s.fascia[0]), s.b + Math.max(0, s.fascia[1])];
  const [c0, c1] = [Math.min(s.at, s.at - s.out * depth), Math.max(s.at, s.at - s.out * depth)];
  return s.axis === "x" ? { x0: a, x1: b, z0: c0, z1: c1 } : { x0: c0, x1: c1, z0: a, z1: b };
}

/** What is left of `boxes` once every box in `cuts` is taken out, as rectangles. */
export function cutBoxes(boxes: Box2[], cuts: Box2[]): Box2[] {
  let out = boxes;
  for (const c of cuts) {
    out = out.flatMap((r): Box2[] => {
      if (c.x1 <= r.x0 || c.x0 >= r.x1 || c.z1 <= r.z0 || c.z0 >= r.z1) return [r];
      const [z0, z1] = [Math.max(r.z0, c.z0), Math.min(r.z1, c.z1)];
      return [
        { ...r, z1: c.z0 },
        { ...r, z0: c.z1 },
        { ...r, z0, z1, x1: c.x0 },
        { ...r, z0, z1, x0: c.x1 },
      ].filter((p) => p.x1 - p.x0 > 1e-6 && p.z1 - p.z0 > 1e-6);
    });
  }
  return out;
}

/** Parts of [a, b] not covered by any of `cut`. */
function subtract(a: number, b: number, cut: [number, number][]): [number, number][] {
  let out: [number, number][] = [[a, b]];
  for (const [c0, c1] of cut) {
    out = out.flatMap(([s, e]): [number, number][] => (c1 <= s || c0 >= e ? [[s, e]] : ([[s, c0], [c1, e]] as [number, number][]).filter(([p, q]) => q - p > 0.01)));
  }
  return out;
}

/**
 * Tiled skirt slopes along the eaves of a flat roof facing the chosen sides,
 * and their returns (see skirtedEdges), all rising the same depth from the
 * fascia towards the roof's middle (see skirtRun). Where two skirted stretches
 * meet they are mitred into a hip at an outside corner or a valley at an
 * inside one; other open ends, such as the end of a return, get a cheek, and
 * ends against a taller wall a flashing. A low upstand finishes the
 * top edge, or a flashing where it meets a taller wall. Gutters run along the
 * fascias and round the hips, with a downpipe at each end that does not turn
 * a corner; `foot` says where a downpipe at (x, z) coming down from `from` stops.
 */
export function skirtParts(
  fr: FlatRoof,
  skirt: FlatRoofSkirt,
  parts: RoofParts,
  opts: { gutters?: boolean; foot?: (x: number, z: number, from: number) => number } = {},
) {
  const edges = skirtedEdges(fr, skirt);
  if (!edges.length) return;
  const half = EXT_WALL_T / 2;
  const W = half + FLAT_OVERHANG;
  const t = Math.tan((skirt.pitchDeg * Math.PI) / 180);
  const cos = Math.cos((skirt.pitchDeg * Math.PI) / 180);
  const { yE, ySoffit } = skirtEaves(fr, skirt);
  const dropped = yE < fr.top - 0.03 - 1e-6;
  const run = skirtRun(fr, skirt);
  const yT = yE + run * t;
  const across = W - run;
  const yG = yE - 0.03;
  const vG = W + GUTTER_R;
  const hips = new Map<string, [P3, P3]>();
  for (const e of edges) {
    const P = (along: number, y: number, ac: number): P3 => (e.axis === "x" ? [along, y, e.at + e.out * ac] : [e.at + e.out * ac, y, along]);
    // Normal pointing along the edge (sign +1 towards b), and away from the roof.
    const N = (sign: number): P3 => (e.axis === "x" ? [sign, 0, 0] : [0, 0, sign]);
    const outward: P3 = e.axis === "x" ? [0, 0, e.out] : [e.out, 0, 0];
    const ends = [skirtEnd(e, 0, edges), skirtEnd(e, 1, edges)] as const;
    const [oa, ob] = [e.a - e.fascia[0], e.b + e.fascia[1]];
    const inset = (k: SkirtEnd) => (k === "hip" ? run : k === "valley" ? -run : 0);
    const [ia, ib] = [oa + inset(ends[0]), ob - inset(ends[1])];
    if (ib < ia - 1e-6) continue;
    pushPoly(parts.tiles.pos, [P(oa, yE, W), P(ob, yE, W), P(ib, yT, across), P(ia, yT, across)], [outward[0], 1, outward[2]], parts.tiles.uv, [
      [oa, 0],
      [ob, 0],
      [ib, run / cos],
      [ia, run / cos],
    ]);

    // Top edge: a flashing where it reaches a taller wall, an upstand down to the membrane elsewhere.
    const walls = facing(e, fr.edges, edges)
      .filter(({ g, reach }) => g.kind === "abutment" && reach <= run + 1e-6)
      .map(({ g }): [number, number] => [Math.max(ia, g.a), Math.min(ib, g.b)])
      .filter(([p, q]) => q > p);
    for (const [p, q] of walls) {
      const ac = across + 0.006;
      pushPoly(parts.flashing, [P(p, yT - 0.02, ac), P(q, yT - 0.02, ac), P(q, yT + 0.1, ac), P(p, yT + 0.1, ac)], outward);
    }
    const inward: P3 = [-outward[0], 0, -outward[2]];
    for (const [p, q] of subtract(ia, ib, walls)) pushPoly(parts.trim, [P(p, fr.top, across), P(q, fr.top, across), P(q, yT, across), P(p, yT, across)], inward);

    // At each end: where a return stops, the face of the taller wall the skirt stops against, or the outside corner of the walls.
    const face = (end: 0 | 1) => {
      const sign = end === 0 ? -1 : 1;
      if (e.cut[end]) return end === 0 ? e.a : e.b;
      return (end === 0 ? e.a : e.b) + (ends[end] === "wall" ? -sign * half : sign * half);
    };
    if (opts.gutters) {
      // Gutters meet the next one round a hip or into a valley, and stop at a wall or an open end.
      const gEnd = (end: 0 | 1) => {
        const sign = end === 0 ? -1 : 1;
        const at = end === 0 ? oa : ob;
        const k = ends[end];
        return k === "hip" ? at + sign * GUTTER_R : k === "valley" ? at - sign * GUTTER_R : k === "wall" ? face(end) : at;
      };
      parts.gutters.push([P(gEnd(0), yG, vG), P(gEnd(1), yG, vG)]);
    }
    for (const end of [0, 1] as const) {
      const kind = ends[end];
      const sign = end === 0 ? -1 : 1;
      const at = end === 0 ? oa : ob;
      if (kind === "hip") {
        const a = P(at, yE, W);
        const b = P(at - sign * run, yT, across);
        const key = [...a, ...b].map((v) => v.toFixed(3)).join(",");
        hips.set(key, [a, b]);
        continue;
      }
      if (kind === "valley") continue;
      if (kind === "square" && !dropped) pushPoly(parts.trim, [P(at, yE, W), P(at, yT, across), P(at, fr.top, across)], N(sign));
      else if (kind === "square") {
        // A dropped skirt's cheek: under the slope down to the deck where it rises above it, down to the wall
        // tops nearer the eaves, and the end of the lowered fascia and soffit, where the plain edge's are higher.
        const ax = Math.max(across, W - (fr.top - yE) / t);
        const yX = yE + (W - ax) * t;
        if (yT > yX + 1e-6) pushPoly(parts.trim, [P(at, yX, ax), P(at, yT, across), P(at, fr.top, across)], N(sign));
        const bot = Math.min(yE, fr.y);
        if (bot < yE - 1e-6) pushPoly(parts.trim, [P(at, yE, W), P(at, yX, ax), P(at, bot, ax), P(at, bot, W)], N(sign));
        else pushPoly(parts.trim, [P(at, yE, W), P(at, yX, ax), P(at, bot, ax)], N(sign));
        pushPoly(parts.trim, [P(at, ySoffit, half), P(at, ySoffit, W), P(at, yE, W), P(at, yE, half)], N(sign));
      } else {
        const f = face(end) - sign * 0.006;
        pushPoly(parts.flashing, [P(f, yE - 0.02, W), P(f, yT - 0.02, across), P(f, yT + 0.15, across), P(f, yE + 0.15, W)], N(-sign));
      }
      // A downpipe where the gutter stops, unless that is at an inside corner.
      if (opts.gutters && (kind === "wall" || e.cut[end] || e.fascia[end] > 0)) {
        const up = face(end) - sign * 0.15;
        const vp = half + PIPE_R + 0.02;
        const path: P3[] = [P(up, yG - GUTTER_R, vG), P(up, ySoffit - 0.06, vG), P(up, ySoffit - 0.06 - 0.8 * (vG - vp), vp)];
        for (let i = 0; i + 1 < path.length; i++) parts.pipes.push([path[i], path[i + 1]]);
        const head = path[path.length - 1];
        const foot = opts.foot ? opts.foot(head[0], head[2], head[1]) : 0;
        parts.pipes.push([head, [head[0], foot, head[2]]]);
      }
    }
  }
  for (const line of hips.values()) parts.caps.push({ line, pitchDeg: skirt.pitchDeg });
}
