import { EXT_WALL_T } from "./geometry";
import {
  FLAT_OVERHANG,
  GUTTER_R,
  LEAN_DEPTH,
  leanToHeightAt,
  leanToSurface,
  pushPoly,
  roofGeometry,
  roofTrim,
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
  /** Fascias, soffits, bargeboards and porch ceilings, in the fascia colour. */
  trim: number[];
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
export function roofParts(plan: RoofPlan, opts: { gutters: boolean }): RoofParts {
  const parts: RoofParts = {
    tiles: { pos: [], uv: [] },
    gables: [],
    trim: [],
    membrane: { pos: [], uv: [] },
    edgeTrim: [],
    flashing: [],
    brick: { pos: [], uv: [] },
    cement: [],
    caps: [],
    gutters: [],
    pipes: [],
    pots: [],
  };

  for (const b of plan.blocks) {
    const m = roofGeometry(b);
    parts.tiles.pos.push(...m.slopes);
    parts.tiles.uv.push(...m.slopeUVs);
    parts.gables.push(...m.gables);
    const tr = roofTrim(b);
    parts.trim.push(...tr.trim);
    parts.caps.push(...tr.caps.map((line) => ({ line, pitchDeg: b.pitchDeg })));
    if (opts.gutters) {
      parts.gutters.push(...tr.gutters);
      for (const dp of tr.downpipes) {
        for (let i = 0; i + 1 < dp.path.length; i++) parts.pipes.push([dp.path[i], dp.path[i + 1]]);
        const head = dp.path[dp.path.length - 1];
        const foot = footAt(plan, head[0], head[2], head[1]);
        parts.pipes.push([head, [head[0], foot, head[2]]]);
      }
    }
  }

  for (const fr of plan.flatRoofs) flatRoofParts(fr, parts);
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

/** Membrane, fascias, soffits, edge trims and flashings of one flat roof. */
function flatRoofParts(fr: FlatRoof, parts: RoofParts) {
  const half = EXT_WALL_T / 2;
  const W = half + FLAT_OVERHANG;
  const ySoffit = fr.y - 0.04;
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
  for (const r of fr.rects) membrane(r.x0, r.z0, r.x1, r.z1);
  for (const r of fr.open)
    pushPoly(
      parts.trim,
      [
        [r.x0, ySoffit, r.z0],
        [r.x1, ySoffit, r.z0],
        [r.x1, ySoffit, r.z1],
        [r.x0, ySoffit, r.z1],
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
      quad(parts.flashing, a, b, -(half + 0.006), -(half + 0.006), fr.top - 0.01, fr.top + 0.15, N(-1));
      continue;
    }
    const [sa, sb] = [e.a - e.strip[0], e.b + e.strip[1]];
    pushPoly(parts.membrane.pos, [P(sa, fr.top, 0), P(sb, fr.top, 0), P(sb, fr.top, W), P(sa, fr.top, W)], up, parts.membrane.uv, [
      [P(sa, 0, 0)[0], P(sa, 0, 0)[2]],
      [P(sb, 0, 0)[0], P(sb, 0, 0)[2]],
      [P(sb, 0, W)[0], P(sb, 0, W)[2]],
      [P(sa, 0, W)[0], P(sa, 0, W)[2]],
    ]);
    const [fa, fb] = [e.a - e.fascia[0], e.b + e.fascia[1]];
    quad(parts.trim, fa, fb, W, W, ySoffit, fr.top - 0.03, N(1));
    quad(parts.trim, fa, fb, W, W - BOARD, ySoffit, ySoffit, down);
    const [oa, ob] = [e.a - e.soffit[0], e.b + e.soffit[1]];
    quad(parts.trim, oa, ob, half, W - BOARD, ySoffit, ySoffit, down);
    // Drip trim: a slim edge standing proud of the membrane to hold water back.
    const [ta, tb] = [fa - (e.fascia[0] > 0 ? 0.015 : 0), fb + (e.fascia[1] > 0 ? 0.015 : 0)];
    const [ci, co, yb, yt] = [W - 0.02, W + 0.015, fr.top - 0.06, fr.top + 0.035];
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
  poly(parts.trim, [P(ca, lo(dw), dw), P(cb, lo(dw), dw), P(cb, lo(dfi), dfi), P(ca, lo(dfi), dfi)], down);
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
