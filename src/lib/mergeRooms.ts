import type { Floor, Opening, Pt, Room, WallOverride } from "../types";
import { EXT_WALL_T } from "./geometry";

/**
 * Knock through: merge two rooms that share a wall into one, dropping the
 * wall between them and any doors, gaps or archways in it.
 *
 * Works in image pixels on the traced polygons. Rooms are traced by hand, so a
 * shared wall is only collinear to within a few pixels: corners that land
 * close together are joined and a corner that falls on the other room's edge
 * splits that edge, which makes the shared stretch identical on both sides
 * so it can be cancelled. What is left of the two outlines is the union.
 */

/** How far apart (metres) traced corners and edges may be and still count as the same wall. */
const SNAP_M = 0.1;
/** A shared wall shorter than this (metres) is two rooms touching at a corner, not a wall. */
const MIN_SHARED_M = 0.2;
/** A corner this close (metres) to the line through its neighbours is not a corner. */
const FLAT_M = 0.04;
/** Merged area may differ from the sum of the two by this fraction before the rooms count as overlapping. */
const OVERLAP_FRAC = 0.1;

export type MergeFailure = "no-wall" | "overlap" | "hole" | "unknown-room";

export type MergeResult =
  | {
      ok: true;
      /** The floor with the rooms merged and the opening(s) in the shared wall gone. */
      floor: Floor;
      /** The merged room (the kept room's id, name and fields, the union outline). */
      room: Room;
      /** The room that was merged away. */
      removed: Room;
      /** Openings that sat in the wall between the rooms. */
      removedOpenings: Opening[];
      /** Length of the wall knocked out, metres. */
      sharedM: number;
    }
  | { ok: false; code: MergeFailure; reason: string };

interface Seg {
  a: Pt;
  b: Pt;
}

const signedArea = (poly: Pt[]) => {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    s += p.x * q.y - q.x * p.y;
  }
  return s / 2;
};

const key = (p: Pt) => `${Math.round(p.x * 1e4)},${Math.round(p.y * 1e4)}`;
const dist = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.y - q.y);

/** Where `v` falls on segment a-b: parameter along it (0-1) and distance from it. */
function onSegment(v: Pt, a: Pt, b: Pt) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 < 1e-12 ? 0 : ((v.x - a.x) * dx + (v.y - a.y) * dy) / len2;
  const c = Math.max(0, Math.min(1, t));
  return { t, d: Math.hypot(v.x - (a.x + dx * c), v.y - (a.y + dy * c)) };
}

/** Insert into `poly` every corner of `others` that falls on one of its edges (not at its ends). */
function splitEdges(poly: Pt[], others: Pt[], tol: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    out.push(a);
    const len = dist(a, b);
    if (len < 1e-9) continue;
    const hits: { t: number; p: Pt }[] = [];
    for (const v of others) {
      const { t, d } = onSegment(v, a, b);
      if (d > tol || t * len <= tol || (1 - t) * len <= tol) continue;
      if (!hits.some((h) => key(h.p) === key(v))) hits.push({ t, p: v });
    }
    hits.sort((x, y) => x.t - y.t);
    for (const h of hits) out.push({ x: h.p.x, y: h.p.y });
  }
  return out;
}

/** Remove corners that sit on the line through their neighbours (or double back on it), and repeated corners. */
function tidyOutline(poly: Pt[], flat: number): Pt[] {
  let pts = poly.filter((p, i) => dist(p, poly[(i + 1) % poly.length]) > 1e-6);
  for (let again = true; again && pts.length > 3; ) {
    again = false;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[(i - 1 + pts.length) % pts.length];
      const c = pts[i];
      const n = pts[(i + 1) % pts.length];
      const { d } = onSegment(c, p, n);
      const u = { x: c.x - p.x, y: c.y - p.y };
      const w = { x: n.x - c.x, y: n.y - c.y };
      const lu = Math.hypot(u.x, u.y);
      const lw = Math.hypot(w.x, w.y);
      const cos = (u.x * w.x + u.y * w.y) / (lu * lw);
      // On the line (any angle), or a small kink of a few pixels either way.
      const flatCorner = Math.abs(cross(p, c, n)) / Math.max(dist(p, n), 1e-9) < 1e-3 || (d < flat && cos > 0.99);
      const spike = Math.abs(cross(p, c, n)) < 1e-6 && cos < 0;
      if ((flatCorner || spike) && d < bestD) {
        best = i;
        bestD = d;
      }
    }
    if (best >= 0) {
      pts = pts.filter((_, i) => i !== best);
      again = true;
    }
  }
  return pts;
}

/** Twice the signed area of triangle p, c, n (cross product of p->c and c->n). */
function cross(p: Pt, c: Pt, n: Pt) {
  return (c.x - p.x) * (n.y - c.y) - (c.y - p.y) * (n.x - c.x);
}

/** Trace the closed outlines left once the shared edges are cancelled. */
function traceLoops(edges: Seg[]): Pt[][] {
  const from = new Map<string, number[]>();
  edges.forEach((e, i) => from.set(key(e.a), [...(from.get(key(e.a)) ?? []), i]));
  const used = new Set<number>();
  const loops: Pt[][] = [];
  for (let s = 0; s < edges.length; s++) {
    if (used.has(s)) continue;
    const loop: Pt[] = [];
    let cur = s;
    for (;;) {
      used.add(cur);
      loop.push(edges[cur].a);
      const e = edges[cur];
      const next = (from.get(key(e.b)) ?? []).filter((j) => !used.has(j) || j === s);
      if (!next.length) break;
      // At a pinch point where the outline touches itself, turn right so each lobe closes on its own.
      let pick = next[0];
      if (next.length > 1) {
        const inAng = Math.atan2(e.b.y - e.a.y, e.b.x - e.a.x);
        let bestTurn = Infinity;
        for (const j of next) {
          let turn = Math.atan2(edges[j].b.y - edges[j].a.y, edges[j].b.x - edges[j].a.x) - inAng;
          while (turn > Math.PI) turn -= 2 * Math.PI;
          while (turn <= -Math.PI) turn += 2 * Math.PI;
          if (turn < bestTurn) {
            bestTurn = turn;
            pick = j;
          }
        }
      }
      if (pick === s) break;
      cur = pick;
    }
    loops.push(loop);
  }
  return loops;
}

/** Overlap (px) of old edge `o` with new edge `n` when they run along the same line within `tol`, else 0. */
function overlapAlong(n: Seg, o: Seg, tol: number): number {
  const len = dist(n.a, n.b);
  const olen = dist(o.a, o.b);
  if (len < 1e-9 || olen < 1e-9) return 0;
  const ux = (n.b.x - n.a.x) / len;
  const uy = (n.b.y - n.a.y) / len;
  if (Math.abs(((o.b.x - o.a.x) * ux + (o.b.y - o.a.y) * uy) / olen) < 0.985) return 0;
  const off = (p: Pt) => Math.abs((p.x - n.a.x) * -uy + (p.y - n.a.y) * ux);
  if (Math.max(off(o.a), off(o.b)) > tol) return 0;
  const t = (p: Pt) => (p.x - n.a.x) * ux + (p.y - n.a.y) * uy;
  return Math.max(0, Math.min(len, Math.max(t(o.a), t(o.b))) - Math.max(0, Math.min(t(o.a), t(o.b))));
}

/**
 * Carry per-edge wall finishes over to the merged outline: a new edge takes the
 * finish of the old edge it runs along, preferring the kept room's.
 */
function remapWallFinishes(poly: Pt[], keep: Room, other: Room, tol: number): Room["wallFinishes"] {
  const edgesOf = (r: Room) =>
    Object.entries(r.wallFinishes ?? {})
      .map(([k, o]): [Seg, WallOverride] | null => {
        const i = Number(k);
        if (!Number.isInteger(i) || i < 0 || i >= r.polygon.length) return null;
        return [{ a: r.polygon[i], b: r.polygon[(i + 1) % r.polygon.length] }, o];
      })
      .filter((x): x is [Seg, WallOverride] => !!x);
  const keepEdges = edgesOf(keep);
  const otherEdges = edgesOf(other);
  if (!keepEdges.length && !otherEdges.length) return undefined;
  const best = (n: Seg, cands: [Seg, WallOverride][], minFrac: number) => {
    const len = dist(n.a, n.b);
    let pick: { o: WallOverride; run: number } | null = null;
    for (const [seg, o] of cands) {
      const run = overlapAlong(n, seg, tol);
      if (run >= minFrac * len && run > 1e-6 && (!pick || run > pick.run)) pick = { o, run };
    }
    return pick?.o;
  };
  const out: Record<number, WallOverride> = {};
  poly.forEach((a, i) => {
    const n = { a, b: poly[(i + 1) % poly.length] };
    const o = best(n, keepEdges, 0.25) ?? best(n, otherEdges, 0.5);
    if (o) out[i] = o;
  });
  return Object.keys(out).length ? out : undefined;
}

/**
 * Merge room `idA` and room `idB` of a floor into one, keeping the name,
 * finishes and other fields of `keep` ("a" or "b"). Fails (with a reason you
 * can show) when the rooms do not share a wall, overlap, or would leave a hole.
 */
export function mergeRooms(floor: Floor, idA: string, idB: string, keep: "a" | "b"): MergeResult {
  const ra = floor.rooms.find((r) => r.id === idA);
  const rb = floor.rooms.find((r) => r.id === idB);
  if (!ra || !rb || ra.id === rb.id) return { ok: false, code: "unknown-room", reason: "Pick two different rooms on this floor." };
  const kept = keep === "a" ? ra : rb;
  const gone = keep === "a" ? rb : ra;
  const tol = SNAP_M * floor.pxPerM;

  // Both outlines the same way round, whichever way they were traced.
  const orient = (r: Room) => (signedArea(r.polygon) >= 0 ? r.polygon.map((p) => ({ ...p })) : r.polygon.map((p) => ({ ...p })).reverse());
  const P = orient(ra);
  let Q = orient(rb);
  if (P.length < 3 || Q.length < 3) return { ok: false, code: "no-wall", reason: "These rooms don't share a wall." };

  // Join corners that were traced a few pixels apart.
  Q = Q.map((q) => P.find((p) => dist(p, q) <= tol) ?? q);
  // A corner that lands on the other room's edge splits that edge, so the shared stretch matches on both sides.
  const P2 = splitEdges(P, Q, tol);
  const Q2 = splitEdges(Q, P, tol);

  const edgesOf = (poly: Pt[]): Seg[] => poly.map((a, i) => ({ a, b: poly[(i + 1) % poly.length] })).filter((e) => key(e.a) !== key(e.b));
  const pe = edgesOf(P2);
  const qe = edgesOf(Q2);
  const qBack = new Map(qe.map((e, i) => [`${key(e.b)}>${key(e.a)}`, i]));
  const shared: Seg[] = [];
  const cancelledQ = new Set<number>();
  const cancelledP = new Set<number>();
  pe.forEach((e, i) => {
    const j = qBack.get(`${key(e.a)}>${key(e.b)}`);
    if (j === undefined || cancelledQ.has(j)) return;
    cancelledP.add(i);
    cancelledQ.add(j);
    shared.push(e);
  });
  const sharedPx = shared.reduce((s, e) => s + dist(e.a, e.b), 0);
  if (sharedPx < MIN_SHARED_M * floor.pxPerM) return { ok: false, code: "no-wall", reason: "These rooms don't share a wall." };

  const rest = [...pe.filter((_, i) => !cancelledP.has(i)), ...qe.filter((_, i) => !cancelledQ.has(i))];
  const loops = traceLoops(rest).map((l) => tidyOutline(l, FLAT_M * floor.pxPerM)).filter((l) => l.length >= 3);
  if (loops.length !== 1 || signedArea(loops[0]) <= 0)
    return { ok: false, code: "hole", reason: "Knocking these through would leave a hole or a pinched-off part in the middle. Knock through a different pair first." };
  let poly = loops[0];

  const mergedArea = signedArea(poly);
  const sum = Math.abs(signedArea(ra.polygon)) + Math.abs(signedArea(rb.polygon));
  if (Math.abs(mergedArea - sum) > OVERLAP_FRAC * sum)
    return { ok: false, code: "overlap", reason: "These rooms overlap each other. Tidy their outlines so they only touch along the wall, then try again." };

  // Wind like the kept room and start near its first corner, so the polygon reads the way the room was traced.
  if ((signedArea(kept.polygon) >= 0) !== (signedArea(poly) >= 0)) poly = [...poly].reverse();
  let first = 0;
  poly.forEach((p, i) => {
    if (dist(p, kept.polygon[0]) < dist(poly[first], kept.polygon[0])) first = i;
  });
  poly = [...poly.slice(first), ...poly.slice(0, first)];

  const room: Room = { ...kept, polygon: poly };
  delete room.dims;
  const wallFinishes = remapWallFinishes(poly, kept, gone, tol);
  if (wallFinishes) room.wallFinishes = wallFinishes;
  else delete room.wallFinishes;
  if (gone.notes && gone.notes !== kept.notes) room.notes = kept.notes ? `${kept.notes}\n\n${gone.name}: ${gone.notes}` : gone.notes;

  // Openings whose centre sits in the stretch of wall that goes.
  const openTol = Math.max(tol, 0.15 * floor.pxPerM);
  const inShared = (o: Opening) =>
    shared.some((s) => {
      const horizontal = Math.abs(s.b.x - s.a.x) >= Math.abs(s.b.y - s.a.y);
      if ((o.orientation === "h") !== horizontal) return false;
      const { t, d } = onSegment({ x: o.x, y: o.y }, s.a, s.b);
      const len = dist(s.a, s.b);
      return d <= openTol && t * len >= -openTol / 2 && (1 - t) * len >= -openTol / 2;
    });
  const removedOpenings = floor.openings.filter(inShared);

  return {
    ok: true,
    floor: {
      ...floor,
      rooms: floor.rooms.filter((r) => r.id !== gone.id).map((r) => (r.id === kept.id ? room : r)),
      openings: floor.openings.filter((o) => !removedOpenings.includes(o)),
    },
    room,
    removed: gone,
    removedOpenings,
    sharedM: sharedPx / floor.pxPerM,
  };
}

/** The other rooms on the floor that `roomId` shares a wall with (so can be knocked through into it). */
export function knockThroughNeighbours(floor: Floor, roomId: string): Room[] {
  const me = floor.rooms.find((r) => r.id === roomId);
  if (!me) return [];
  const box = (poly: { x: number; y: number }[]) => ({
    x0: Math.min(...poly.map((p) => p.x)),
    y0: Math.min(...poly.map((p) => p.y)),
    x1: Math.max(...poly.map((p) => p.x)),
    y1: Math.max(...poly.map((p) => p.y)),
  });
  const grow = EXT_WALL_T * floor.pxPerM;
  const a = box(me.polygon);
  return floor.rooms.filter((r) => {
    if (r.id === roomId) return false;
    const b = box(r.polygon);
    if (b.x0 > a.x1 + grow || b.x1 < a.x0 - grow || b.y0 > a.y1 + grow || b.y1 < a.y0 - grow) return false;
    const res = mergeRooms(floor, roomId, r.id, "a");
    return res.ok || res.code !== "no-wall";
  });
}
