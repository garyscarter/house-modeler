import type { BoundaryEdge, HouseModel, Neighbour, Site, SiteSurface, WPt } from "../types";
import { uid } from "../types";
import { EXT_WALL_T, areaOf, bbox, modelBounds, pointInPolygon, roomWorldPolygon, type V2 } from "./geometry";
import { exteriorOf, floorBase, planRoofs } from "./roof";
import { exteriorFaces, type ExteriorFace } from "./siteWalls";

/** Ground level below the ground floor's finished floor, metres (matches the 3D scene). */
export const GROUND_DROP = 0.26;

/** Unsigned polygon area, m². */
export { areaOf };

export function closestOnSegment(p: V2, a: V2, b: V2): V2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return { x: a.x + dx * t, y: a.y + dy * t };
}

export const pointSegmentDistance = (p: V2, a: V2, b: V2) => {
  const c = closestOnSegment(p, a, b);
  return Math.hypot(p.x - c.x, p.y - c.y);
};

/** Shortest distance between two things, with the closest point on each. */
export interface Closest {
  d: number;
  a: V2;
  b: V2;
}

/** Where segments a0-a1 and b0-b1 cross or touch, or null. */
export function segmentIntersection(a0: V2, a1: V2, b0: V2, b1: V2): V2 | null {
  const d = (a1.x - a0.x) * (b1.y - b0.y) - (a1.y - a0.y) * (b1.x - b0.x);
  if (Math.abs(d) < 1e-12) return null;
  const t = ((b0.x - a0.x) * (b1.y - b0.y) - (b0.y - a0.y) * (b1.x - b0.x)) / d;
  const u = ((b0.x - a0.x) * (a1.y - a0.y) - (b0.y - a0.y) * (a1.x - a0.x)) / d;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return { x: a0.x + (a1.x - a0.x) * t, y: a0.y + (a1.y - a0.y) * t };
}

/** Closest points between two segments: 0 where they cross, else from one of the four end points. */
export function segmentSegmentClosest(a0: V2, a1: V2, b0: V2, b1: V2): Closest {
  const hit = segmentIntersection(a0, a1, b0, b1);
  if (hit) return { d: 0, a: hit, b: hit };
  const cands = [
    { a: a0, b: closestOnSegment(a0, b0, b1) },
    { a: a1, b: closestOnSegment(a1, b0, b1) },
    { a: closestOnSegment(b0, a0, a1), b: b0 },
    { a: closestOnSegment(b1, a0, a1), b: b1 },
  ].map((c) => ({ ...c, d: Math.hypot(c.a.x - c.b.x, c.a.y - c.b.y) }));
  return cands.reduce((m, c) => (c.d < m.d ? c : m));
}

/** Distance from a point to a polygon: 0 inside, otherwise to the nearest edge. */
export function pointPolygonDistance(p: V2, poly: V2[]): number {
  if (pointInPolygon(p, poly)) return 0;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) best = Math.min(best, pointSegmentDistance(p, poly[i], poly[(i + 1) % poly.length]));
  return best;
}

/**
 * Parts of segment a-b that are clear of every polygon by more than
 * `margin`, as [t0, t1] fractions along it. Used to stop fences at
 * buildings: a fence on a party line would otherwise run through the walls.
 */
export function clipSegmentOutside(a: V2, b: V2, polys: V2[][], margin = 0): [number, number][] {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1e-9) return [];
  const at = (t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const blocked = (t: number) => polys.some((poly) => pointPolygonDistance(at(t), poly) <= margin);
  // Sample finely, then bisect each change so the ends are exact to a millimetre.
  const n = Math.max(2, Math.ceil(len / 0.05));
  const refine = (t0: number, t1: number) => {
    const b0 = blocked(t0);
    while ((t1 - t0) * len > 0.001) {
      const m = (t0 + t1) / 2;
      if (blocked(m) === b0) t0 = m;
      else t1 = m;
    }
    return (t0 + t1) / 2;
  };
  const out: [number, number][] = [];
  let start: number | null = blocked(0) ? null : 0;
  let prevT = 0;
  let prev = blocked(0);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const cur = blocked(t);
    if (cur !== prev) {
      const edge = refine(prevT, t);
      if (cur) {
        if (start !== null) out.push([start, edge]);
        start = null;
      } else start = edge;
    }
    prev = cur;
    prevT = t;
  }
  if (start !== null) out.push([start, 1]);
  return out.filter(([t0, t1]) => (t1 - t0) * len > 0.02);
}

export type HouseSide = "front" | "rear" | "left" | "right";
export const SIDE_DIR: Record<HouseSide, V2> = { front: { x: 0, y: 1 }, rear: { x: 0, y: -1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

/** Room outlines of one storey, world metres. */
export interface LevelOutline {
  level: number;
  polys: V2[][];
  /** Outer faces of the exterior walls (centre lines pushed out by half the thickness); clearances measure from these when present. */
  faces?: ExteriorFace[];
}

export function houseOutlines(model: HouseModel): LevelOutline[] {
  const levels = [...new Set(model.floors.map((f) => f.level))].sort((a, b) => a - b);
  const faces = exteriorFaces(model);
  return levels.map((level) => ({
    level,
    polys: model.floors.filter((f) => f.level === level).flatMap((f) => f.rooms.map((r) => roomWorldPolygon(f, r))),
    faces: faces.find((f) => f.level === level)?.segments,
  }));
}

/** Outward unit normal of edge i of a polygon (whatever its winding). */
function outwardNormal(poly: V2[], i: number): V2 {
  const a = poly[i];
  const b = poly[(i + 1) % poly.length];
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const n = { x: (b.y - a.y) / len, y: -(b.x - a.x) / len };
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return pointInPolygon({ x: mid.x + n.x * 1e-3, y: mid.y + n.y * 1e-3 }, poly) ? { x: -n.x, y: -n.y } : n;
}

export interface SideClearance {
  side: HouseSide;
  /** Shortest distance from that side of the house to the boundary, metres. */
  distance: number;
  /** Closest point on the house and on the boundary. */
  from: V2;
  to: V2;
  /** Storey whose outline gave the shortest distance. */
  level: number;
}

/**
 * Shortest distance from each side of the house to the plot boundary on that
 * side. A side is the external walls facing that way (within about 50
 * degrees); the boundary on that side is the boundary edges facing the same
 * way. Every storey counts, so an overhanging upper floor is measured too.
 */
export function sideClearances(outlines: LevelOutline[], boundary: V2[]): SideClearance[] {
  if (boundary.length < 3) return [];
  if (outlines.some((o) => o.faces)) return sideClearancesFromFaces(outlines.map((o) => ({ level: o.level, segments: o.faces ?? [] })), boundary);
  const out: SideClearance[] = [];
  const bEdges = boundary.map((a, i) => ({ a, b: boundary[(i + 1) % boundary.length], n: outwardNormal(boundary, i) }));
  for (const side of Object.keys(SIDE_DIR) as HouseSide[]) {
    const dir = SIDE_DIR[side];
    const facing = (n: V2) => n.x * dir.x + n.y * dir.y > 0.64;
    const targets = bEdges.filter((e) => facing(e.n));
    if (!targets.length) continue;
    let best: SideClearance | null = null;
    for (const { level, polys } of outlines) {
      for (const poly of polys) {
        for (let i = 0; i < poly.length; i++) {
          const n = outwardNormal(poly, i);
          if (!facing(n)) continue;
          const a = poly[i];
          const b = poly[(i + 1) % poly.length];
          const probe = { x: (a.x + b.x) / 2 + n.x * 0.2, y: (a.y + b.y) / 2 + n.y * 0.2 };
          if (polys.some((p) => p !== poly && pointInPolygon(probe, p))) continue; // internal wall
          for (const t of targets) {
            const c = segmentSegmentClosest(a, b, t.a, t.b);
            if (!best || c.d < best.distance - 1e-9) best = { side, distance: c.d, from: c.a, to: c.b, level };
          }
        }
      }
    }
    if (best) out.push(best);
  }
  return out;
}

/**
 * As sideClearances, but measured from the outer faces of the exterior walls
 * rather than room edges (wall centre lines), so the figure is the real gap.
 */
export function sideClearancesFromFaces(faces: { level: number; segments: ExteriorFace[] }[], boundary: V2[]): SideClearance[] {
  if (boundary.length < 3) return [];
  const out: SideClearance[] = [];
  const bEdges = boundary.map((a, i) => ({ a, b: boundary[(i + 1) % boundary.length], n: outwardNormal(boundary, i) }));
  for (const side of Object.keys(SIDE_DIR) as HouseSide[]) {
    const dir = SIDE_DIR[side];
    const facing = (n: V2) => n.x * dir.x + n.y * dir.y > 0.64;
    const targets = bEdges.filter((e) => facing(e.n));
    if (!targets.length) continue;
    let best: SideClearance | null = null;
    for (const { level, segments } of faces) {
      for (const seg of segments) {
        if (!facing(seg.n)) continue;
        // A face that pokes past the boundary (a party wall built on the line) has no clearance.
        const mid = { x: (seg.a.x + seg.b.x) / 2, y: (seg.a.y + seg.b.y) / 2 };
        const over = !pointInPolygon(mid, boundary) && targets.some((t) => pointSegmentDistance(mid, t.a, t.b) < 0.3 && t.n.x * seg.n.x + t.n.y * seg.n.y > 0.9) ? mid : null;
        if (over) {
          if (!best || best.distance > 0) best = { side, distance: 0, from: over, to: over, level };
          continue;
        }
        for (const t of targets) {
          const c = segmentSegmentClosest(seg.a, seg.b, t.a, t.b);
          if (!best || c.d < best.distance - 1e-9) best = { side, distance: c.d, from: c.a, to: c.b, level };
        }
      }
    }
    if (best) out.push(best);
  }
  return out;
}

/** Plot area not covered by buildings, m², sampled on a 0.1 m grid. */
export function gardenArea(boundary: V2[], buildings: V2[][]): number {
  if (boundary.length < 3) return 0;
  const STEP = 0.1;
  const b = bbox(boundary);
  const near = buildings.filter((p) => {
    const pb = bbox(p);
    return pb.x1 > b.x0 && pb.x0 < b.x1 && pb.y1 > b.y0 && pb.y0 < b.y1;
  });
  let n = 0;
  for (let y = b.y0 + STEP / 2; y < b.y1; y += STEP) {
    for (let x = b.x0 + STEP / 2; x < b.x1; x += STEP) {
      const p = { x, y };
      if (pointInPolygon(p, boundary) && !near.some((poly) => pointInPolygon(p, poly))) n++;
    }
  }
  return n * STEP * STEP;
}

export const rectPoly = (x0: number, y0: number, x1: number, y1: number): WPt[] => [
  { x: Math.min(x0, x1), y: Math.min(y0, y1) },
  { x: Math.max(x0, x1), y: Math.min(y0, y1) },
  { x: Math.max(x0, x1), y: Math.max(y0, y1) },
  { x: Math.min(x0, x1), y: Math.max(y0, y1) },
];

const DEFAULT_EDGE: BoundaryEdge = { kind: "fence", height: 1.8 };

/** Boundary edge treatments, one per edge, filling any gaps with a 1.8 m fence. */
export const edgesOf = (site: Pick<Site, "boundary" | "boundaryEdges">): BoundaryEdge[] => site.boundary.map((_, i) => site.boundaryEdges?.[i] ?? DEFAULT_EDGE);

/** Insert a boundary vertex after vertex i; both halves of the split edge keep its treatment. */
export function insertBoundaryVertex(site: Site, i: number, p: WPt): Site {
  const edges = edgesOf(site);
  return {
    ...site,
    boundary: [...site.boundary.slice(0, i + 1), p, ...site.boundary.slice(i + 1)],
    boundaryEdges: [...edges.slice(0, i + 1), { ...edges[i] }, ...edges.slice(i + 1)],
  };
}

/** Remove boundary vertex i; the merged edge keeps the treatment of the edge before it. Keeps at least a triangle. */
export function removeBoundaryVertex(site: Site, i: number): Site {
  if (site.boundary.length <= 3) return site;
  const edges = edgesOf(site);
  return { ...site, boundary: site.boundary.filter((_, j) => j !== i), boundaryEdges: edges.filter((_, j) => j !== i) };
}

/** Garden depths around the house for a simple rectangular plot, metres. */
export interface PlotDepths {
  front: number;
  rear: number;
  left: number;
  right: number;
}

/** Default depths: no gap on a party-wall side. */
export function defaultDepths(model: HouseModel): PlotDepths {
  const party = exteriorOf(model).partyWall;
  return {
    front: 6,
    rear: 12,
    left: party === "left" || party === "both" ? 0 : 1.5,
    right: party === "right" || party === "both" ? 0 : 1.5,
  };
}

/**
 * A rectangular plot around the house's outline with a front and rear lawn,
 * a pavement and road in front, and (for a semi or terrace) the attached
 * neighbour mirrored across the party wall.
 */
export function simpleSite(model: HouseModel, depths: PlotDepths, keep?: Pick<Site, "frontBearing" | "latitude" | "longitude">): Site {
  const b = modelBounds(model.floors);
  const ext = exteriorOf(model);
  const x0 = b.x0 - depths.left;
  const x1 = b.x1 + depths.right;
  const y0 = b.y0 - depths.rear;
  const y1 = b.y1 + depths.front;
  const surfaces: SiteSurface[] = [];
  if (depths.rear > 0.3) surfaces.push({ id: uid(), kind: "lawn", polygon: rectPoly(x0, y0, x1, b.y0) });
  if (depths.front > 0.3) surfaces.push({ id: uid(), kind: "lawn", polygon: rectPoly(x0, b.y1, x1, y1) });
  const span = Math.max(b.w * 3, 30);
  const cx = (b.x0 + b.x1) / 2;
  surfaces.push(
    { id: uid(), kind: "pavement", polygon: rectPoly(cx - span / 2, y1, cx + span / 2, y1 + 2) },
    { id: uid(), kind: "road", polygon: rectPoly(cx - span / 2, y1 + 2, cx + span / 2, y1 + 8.5) },
  );
  const top = Math.max(0, ...model.floors.map((f) => f.level));
  const topFloor = model.floors.find((f) => f.level === top);
  const eaves = (topFloor ? floorBase(model, topFloor) : 0) + model.ceilingHeight + GROUND_DROP;
  const attached = (side: "left" | "right"): Neighbour => ({
    id: uid(),
    name: "Attached neighbour",
    polygon: side === "right" ? rectPoly(b.x1, b.y0, b.x1 + b.w, b.y1) : rectPoly(b.x0 - b.w, b.y0, b.x0, b.y1),
    eaves: Math.round(eaves * 10) / 10,
    roof: ext.roofStyle,
    pitchDeg: ext.pitchDeg,
    overhang: ext.overhang,
    ridgeAxis: "x",
    partySide: side === "right" ? "left" : "right",
  });
  const neighbours: Neighbour[] = [];
  if (ext.partyWall === "right" || ext.partyWall === "both") neighbours.push(attached("right"));
  if (ext.partyWall === "left" || ext.partyWall === "both") neighbours.push(attached("left"));
  return {
    frontBearing: keep?.frontBearing ?? 180,
    latitude: keep?.latitude ?? 51.45,
    longitude: keep?.longitude ?? -2.6,
    // Clockwise on the plan from the rear left corner: rear, right, front, left.
    boundary: rectPoly(x0, y0, x1, y1),
    boundaryEdges: [
      { kind: "fence", height: 1.8 },
      { kind: "fence", height: 1.8 },
      { kind: "wall", height: 0.9 },
      { kind: "fence", height: 1.8 },
    ],
    neighbours,
    surfaces,
  };
}

/** A building as a vertical prism standing on the ground: footprint and height above the ground, metres. */
export interface Prism {
  poly: V2[];
  /** Top of the block, metres above the ground. */
  height: number;
  /** Bottom of the block (default 0: standing on the ground), so a roof leaves the storey beneath it open to a high sun. */
  base?: number;
  /** Fences and walls on the boundary: they shade the garden but a point beside one is still garden. Default "building". */
  kind?: "building" | "boundary";
}

/**
 * The house as prisms: each room from the ground to the top of its storey's
 * walls, plus each pitched roof as a block half-way up its slope (the same
 * volume of shade, near enough).
 */
export function housePrisms(model: HouseModel): Prism[] {
  const rooms = model.floors.flatMap((f) =>
    f.rooms.map((r) => ({ poly: roomWorldPolygon(f, r), height: floorBase(model, f) + model.ceilingHeight + GROUND_DROP })),
  );
  if (!exteriorOf(model).showRoof) return rooms;
  const roofs = planRoofs(model).blocks.map((b) => {
    const span = Math.min(b.x1 - b.x0, b.z1 - b.z0) + EXT_WALL_T;
    const rise = (span / 2) * Math.tan((b.pitchDeg * Math.PI) / 180);
    return { poly: rectPoly(b.x0, b.z0, b.x1, b.z1), height: b.y + GROUND_DROP + rise / 2, base: b.y + GROUND_DROP };
  });
  return [...rooms, ...roofs];
}

/** A neighbouring building as a prism: walls to the eaves plus half the roof's rise. */
export function neighbourPrism(n: Neighbour): Prism {
  const b = bbox(n.polygon);
  const rise = n.roof === "flat" ? 0 : (Math.min(b.w, b.h) / 2) * Math.tan(((n.pitchDeg ?? 35) * Math.PI) / 180);
  return { poly: n.polygon, height: n.eaves + rise / 2 };
}

/** Boundary fences, walls and hedges as thin prisms (open edges leave a gap). */
export function boundaryPrisms(site: Pick<Site, "boundary" | "boundaryEdges">): Prism[] {
  const out: Prism[] = [];
  const edges = edgesOf(site);
  const half = 0.05;
  site.boundary.forEach((a, i) => {
    const e = edges[i];
    if (e.kind === "open" || !(e.height > 0)) return;
    const b = site.boundary[(i + 1) % site.boundary.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) return;
    const nx = ((b.y - a.y) / len) * half;
    const ny = (-(b.x - a.x) / len) * half;
    out.push({
      poly: [
        { x: a.x + nx, y: a.y + ny },
        { x: b.x + nx, y: b.y + ny },
        { x: b.x - nx, y: b.y - ny },
        { x: a.x - nx, y: a.y - ny },
      ],
      height: e.height,
      kind: "boundary",
    });
  });
  return out;
}

/**
 * Whether a ray from point p at height z (default: the ground) towards a sun
 * with unit horizontal direction (dx, dy) and altitude tangent `tanAlt` is
 * blocked by a prism: it is if the ray is inside the block's height range
 * somewhere over its footprint.
 */
export function prismBlocks(p: V2, dx: number, dy: number, tanAlt: number, prism: Prism, z = 0): boolean {
  const poly = prism.poly;
  const base = prism.base ?? 0;
  const inside = pointInPolygon(p, poly);
  let sIn = inside ? 0 : Infinity;
  let sOut = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const s = ((a.x - p.x) * ey - (a.y - p.y) * ex) / den;
    const u = ((a.x - p.x) * dy - (a.y - p.y) * dx) / den;
    if (s > 0 && u >= 0 && u <= 1) {
      if (s < sIn) sIn = s;
      if (s > sOut) sOut = s;
    }
  }
  if (sIn === Infinity) return false;
  return z + sIn * tanAlt < prism.height && z + sOut * tanAlt > base;
}

export interface SunHoursGrid {
  x0: number;
  y0: number;
  cell: number;
  nx: number;
  ny: number;
  /** Hours of direct sun per cell (row-major, y then x); NaN outside the plot or under a building. */
  hours: Float32Array;
}

/**
 * Hours of direct sun at ground level over the plot on one day, per `cell`
 * metre square. `sun(t)` gives the sun's horizontal world direction and
 * altitude (degrees) at clock hour t; samples run every `stepH` hours from
 * sunrise to sunset.
 */
export function sunHoursGrid(
  boundary: V2[],
  prisms: Prism[],
  sun: (t: number) => { x: number; y: number; altitude: number },
  sunrise: number,
  sunset: number,
  cell = 0.5,
  stepH = 0.25,
): SunHoursGrid {
  const samples: SunDir[] = [];
  for (let t = sunrise + stepH / 2; t < sunset; t += stepH) {
    const s = sun(t);
    if (s.altitude <= 0) continue;
    const len = Math.hypot(s.x, s.y) || 1;
    samples.push({ dx: s.x / len, dy: s.y / len, tan: Math.tan((s.altitude * Math.PI) / 180) });
  }
  return sunHoursGridFromSamples(boundary, prisms, samples, cell, stepH);
}

/** A direction of the sun: horizontal unit vector in world (x, z = plan y) and the tangent of its altitude. */
export interface SunDir {
  dx: number;
  dy: number;
  tan: number;
}

/** As sunHoursGrid, from ready-made sun directions, one per `stepH` hours. */
export function sunHoursGridFromSamples(boundary: V2[], prisms: Prism[], samples: SunDir[], cell = 0.5, stepH = 0.25): SunHoursGrid {
  const b = bbox(boundary);
  const nx = Math.max(1, Math.ceil(b.w / cell));
  const ny = Math.max(1, Math.ceil(b.h / cell));
  const hours = new Float32Array(nx * ny).fill(NaN);
  const solid = prisms.filter((pr) => pr.kind !== "boundary");
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const p = { x: b.x0 + (i + 0.5) * cell, y: b.y0 + (j + 0.5) * cell };
      if (!pointInPolygon(p, boundary) || solid.some((pr) => pointInPolygon(p, pr.poly))) continue;
      let lit = 0;
      for (const s of samples) if (!prisms.some((pr) => prismBlocks(p, s.dx, s.dy, s.tan, pr))) lit++;
      hours[j * nx + i] = lit * stepH;
    }
  }
  return { x0: b.x0, y0: b.y0, cell, nx, ny, hours };
}

/** Unit normal of edge `i` (from vertex i to i+1, rotated a quarter turn), or null for a zero-length edge. */
export function edgeNormal(poly: V2[], i: number): V2 | null {
  const a = poly[i];
  const b = poly[(i + 1) % poly.length];
  if (!a || !b) return null;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  return len < 1e-9 ? null : { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
}

/** Move edge `i` by `offset` metres along its normal; both ends move together so it stays parallel. */
export function slideEdge(poly: V2[], i: number, offset: number): V2[] {
  const n = edgeNormal(poly, i);
  if (!n) return poly.map((p) => ({ ...p }));
  const j = (i + 1) % poly.length;
  return poly.map((p, k) => (k === i || k === j ? { ...p, x: p.x + n.x * offset, y: p.y + n.y * offset } : { ...p }));
}

/** Nudge `offset` so the slid edge's line passes through the nearest target within `tol` of it. */
export function snapEdgeOffset(poly: V2[], i: number, offset: number, targets: V2[], tol: number): number {
  const n = edgeNormal(poly, i);
  if (!n) return offset;
  const a = poly[i];
  let best = offset;
  let bestD = tol;
  for (const t of targets) {
    const d = (t.x - a.x) * n.x + (t.y - a.y) * n.y;
    if (Math.abs(d - offset) <= bestD) {
      bestD = Math.abs(d - offset);
      best = d;
    }
  }
  return best;
}
