import type { BoundaryEdge, HouseModel, Site, WPt } from "../types";
import { WALL_FINISH_LABEL, type WallFinish } from "../types";
import { EXT_WALL_T, bbox, pointInPolygon, roomWorldPolygon, toWorld, type V2 } from "./geometry";
import { diffModels } from "./report";
import { exteriorOf, flatRoofTop, leanToHeightAt, planRoofs, roofGeometry, roofHeightAt, type RoofBlock, type RoofPlan } from "./roof";
import { GROUND_DROP, areaOf, houseOutlines, pointSegmentDistance, segmentSegmentClosest } from "./site";
import { boundaryPieces, sameEdge } from "./siteDiff";
import { surfaceLook } from "./surfaceFinish";

/**
 * A first look at whether the Proposed layout fits householder permitted
 * development in England (the GPDO 2015, Schedule 2, Part 1 Classes A, D and
 * F, and Part 2 Class A) or needs a planning application, plus the other
 * consents the work is likely to need. Guidance, not legal advice.
 *
 * How it measures: both layouts' room outlines are rasterised per storey on a
 * 5 cm grid. Cells in Proposed but not in the "original" house (As listed, or
 * As listed without its single-storey side wing if the owner says the wing
 * came after 1948) are the extensions; joined-up cells (seen from above) make
 * one extension. Each cell is then placed against the original's walls on
 * the same storey: behind the rear wall in its column is "rear", forward of
 * the front wall is "front", and, where the original has nothing in that
 * column, beyond the side wall in its row is "side". Heights come from the
 * model's storey heights and its roof plan (roof.ts), measured from the ground
 * (GROUND_DROP below the ground floor). Everything runs to the wall centre
 * lines the plan is traced on; distances to boundaries are taken to the
 * outside face of the wall (half a wall thickness further out).
 */

export type RuleStatus = "pass" | "fail" | "prior" | "check" | "na";

export const STATUS_LABEL: Record<RuleStatus, string> = {
  pass: "Pass",
  fail: "Fail",
  prior: "Prior approval",
  check: "Check",
  na: "n/a",
};

export interface PlanningRule {
  id: string;
  /** Heading the rule is listed under. */
  group: string;
  title: string;
  status: RuleStatus;
  /** One plain-English line with the measured numbers. */
  reason: string;
  /** For fails and prior approvals: the phrase used in the verdict ("the side extension is two storeys"). */
  short?: string;
  /** Where the rule comes from. */
  ref?: string;
}

export interface Consent {
  id: string;
  title: string;
  reason: string;
  /** "yes": needed; "likely": probably needed, depending on details the model can't show. */
  needed: "yes" | "likely";
}

export type ExtensionSide = "front" | "rear" | "left" | "right";

/** One extension found by comparing Proposed with the original house. */
export interface ExtensionPart {
  id: string;
  label: string;
  /** Which of the original's walls it goes beyond. */
  sides: ExtensionSide[];
  /** Storeys with new floor area. */
  levels: number[];
  /** Storeys standing on its footprint in Proposed (new or existing). */
  storeys: number;
  /** Footprint seen from above, m² (new floor area on any storey). */
  area: number;
  /** New floor area on the ground, m² (counts towards the 50% garden rule). */
  groundArea: number;
  /** Plan extents, world metres. */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** How far beyond the side wall (width), past the rear wall (depth) and forward of the front wall, metres. */
  width: number;
  depth: number;
  forward: number;
  /** Heights above the ground, metres: eaves (top of the walls) and the highest part of the roof. */
  eaves: number;
  height: number;
  /** Closest distance from its outside walls to the plot boundary, metres (undefined with no plot). */
  boundaryDistance?: number;
  /** Fills a gap inside the original's outline on that storey. */
  infill: boolean;
  /** Adds a storey above the original's top storey. */
  newStorey: boolean;
}

export interface PlanningOptions {
  /** The single-storey side wing was added after 1 July 1948, so it is not part of the "original" house. */
  wingAfter1948?: boolean;
}

export type Verdict = "none" | "pd" | "prior" | "permission";

export interface PlanningCheck {
  verdict: Verdict;
  headline: string;
  /** Why permission is needed (fails), or what needs prior approval. */
  because: string[];
  consents: Consent[];
  rules: PlanningRule[];
  parts: ExtensionPart[];
  houseType: "detached" | "semi-detached" | "terraced";
  /** What was taken as the original house. */
  original: string;
  /** Caveats that always apply. */
  caveats: string[];
}

// ---------------------------------------------------------------------------
// Limits (GPDO 2015 Schedule 2)

/** Class A.1(f)/(g): single-storey rear extension depth, metres, without and with prior approval. */
const REAR_DEPTH = { detached: [4, 8], attached: [3, 6] } as const;
const MAX_SINGLE_HEIGHT = 4;
const TWO_STOREY_REAR_DEPTH = 3;
const TWO_STOREY_REAR_GAP = 7;
const NEAR_BOUNDARY = 2;
const NEAR_BOUNDARY_EAVES = 3;
const COVERAGE = 0.5;
const PORCH_AREA = 3;
const PORCH_HEIGHT = 3;
const PORCH_HIGHWAY = 2;
const HARD_SURFACE = 5;
const WALL_BY_ROAD = 1;
const WALL_ELSEWHERE = 2;
/** Party Wall Act: excavating within 3 m of a neighbour's building. */
const PARTY_WALL_REACH = 3;

// Measuring tolerances.
const CELL = 0.05;
/** Heights within this are "the same". */
const H_TOL = 0.05;
/** An extension smaller than this, or thinner on average, is tracing noise. */
const MIN_AREA = 0.5;
const MIN_THICK = 0.3;
const MIN_NEW = 0.25;
/** Hard surface changes under this are noise, m². */
const SURFACE_TOL = 0.5;
const LEN_TOL = 0.05;

// ---------------------------------------------------------------------------
// Formatting

const m = (v: number, limit?: number) => `${v.toFixed(limit !== undefined && Math.abs(v - limit) < 0.1 ? 2 : 1)} m`;
const m2 = (v: number) => `${v.toFixed(1)} m²`;
const deg = (v: number) => `${Math.round(v)}°`;
const fromBoundary = (d: number) => (d < 0.05 ? "right on the boundary" : `${m(d, NEAR_BOUNDARY)} from the boundary`);

// ---------------------------------------------------------------------------
// Grid

interface Grid {
  x0: number;
  y0: number;
  nx: number;
  ny: number;
}

const cx = (g: Grid, i: number) => g.x0 + (i + 0.5) * CELL;
const cy = (g: Grid, j: number) => g.y0 + (j + 0.5) * CELL;

function makeGrid(polys: V2[][]): Grid {
  const pts = polys.flat();
  const b = pts.length ? bbox(pts) : { x0: -5, y0: -5, x1: 5, y1: 5 };
  // A small odd offset keeps cell centres off traced wall lines, so shared edges never count twice or not at all.
  const x0 = b.x0 - 1.0137;
  const y0 = b.y0 - 1.0137;
  return { x0, y0, nx: Math.ceil((b.x1 + 1 - x0) / CELL), ny: Math.ceil((b.y1 + 1 - y0) / CELL) };
}

function rasterize(g: Grid, polys: V2[][]): Uint8Array {
  const out = new Uint8Array(g.nx * g.ny);
  for (const poly of polys) {
    if (poly.length < 3) continue;
    const b = bbox(poly);
    const i0 = Math.max(0, Math.floor((b.x0 - g.x0) / CELL));
    const i1 = Math.min(g.nx - 1, Math.ceil((b.x1 - g.x0) / CELL));
    const j0 = Math.max(0, Math.floor((b.y0 - g.y0) / CELL));
    const j1 = Math.min(g.ny - 1, Math.ceil((b.y1 - g.y0) / CELL));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * g.nx + i;
        if (!out[k] && pointInPolygon({ x: cx(g, i), y: cy(g, j) }, poly)) out[k] = 1;
      }
    }
  }
  return out;
}

const or = (a: Uint8Array, b: Uint8Array) => a.map((v, k) => v | b[k]);
const count = (a: Uint8Array) => a.reduce((s, v) => s + v, 0);
const cellsArea = (n: number) => n * CELL * CELL;

/** Per column the lowest and highest row with a cell set (-1 if none), and per row the same for columns. */
interface Extents {
  colMin: Int32Array;
  colMax: Int32Array;
  rowMin: Int32Array;
  rowMax: Int32Array;
  any: boolean;
}

function extents(g: Grid, mask: Uint8Array): Extents {
  const colMin = new Int32Array(g.nx).fill(-1);
  const colMax = new Int32Array(g.nx).fill(-1);
  const rowMin = new Int32Array(g.ny).fill(-1);
  const rowMax = new Int32Array(g.ny).fill(-1);
  let any = false;
  for (let j = 0; j < g.ny; j++) {
    for (let i = 0; i < g.nx; i++) {
      if (!mask[j * g.nx + i]) continue;
      any = true;
      if (colMin[i] < 0) colMin[i] = j;
      colMax[i] = j;
      if (rowMin[j] < 0) rowMin[j] = i;
      rowMax[j] = i;
    }
  }
  return { colMin, colMax, rowMin, rowMax, any };
}

/** 4-connected groups of set cells, as lists of cell indices. */
function components(g: Grid, mask: Uint8Array): number[][] {
  const seen = new Uint8Array(mask.length);
  const out: number[][] = [];
  for (let k0 = 0; k0 < mask.length; k0++) {
    if (!mask[k0] || seen[k0]) continue;
    const comp: number[] = [];
    const stack = [k0];
    seen[k0] = 1;
    while (stack.length) {
      const k = stack.pop()!;
      comp.push(k);
      const i = k % g.nx;
      const j = (k - i) / g.nx;
      const next = [i > 0 ? k - 1 : -1, i < g.nx - 1 ? k + 1 : -1, j > 0 ? k - g.nx : -1, j < g.ny - 1 ? k + g.nx : -1];
      for (const n of next) {
        if (n >= 0 && mask[n] && !seen[n]) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    out.push(comp);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Plot helpers

interface BEdge {
  a: WPt;
  b: WPt;
  /** Outward unit normal. */
  n: V2;
  edge: BoundaryEdge;
}

function boundaryEdgesOf(site: Site): BEdge[] {
  const pts = site.boundary;
  if (pts.length < 3) return [];
  const signed = pts.reduce((s, p, i) => s + p.x * pts[(i + 1) % pts.length].y - pts[(i + 1) % pts.length].x * p.y, 0);
  const sign = signed >= 0 ? 1 : -1;
  return pts.flatMap((a, i) => {
    const b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) return [];
    return [{ a, b, n: { x: (sign * (b.y - a.y)) / len, y: (-sign * (b.x - a.x)) / len }, edge: site.boundaryEdges?.[i] ?? { kind: "fence", height: 1.8 } }];
  });
}

/** Whether a point is on a road or pavement of the plot plan. */
const onHighway = (site: Site, p: V2) => site.surfaces.some((s) => (s.kind === "road" || s.kind === "pavement") && pointInPolygon(p, s.polygon));
const hasHighway = (site: Site) => site.surfaces.some((s) => s.kind === "road" || s.kind === "pavement");

/**
 * Whether the plot boundary from a to b (with outward normal n) adjoins a
 * highway: a point just outside it, a quarter, half or three quarters along,
 * is on a road or pavement. A plot drawn with no road at all is taken to have
 * one along its front.
 */
function adjoinsHighway(site: Site, a: V2, b: V2, n: V2): boolean {
  if (!hasHighway(site)) return n.y > 0.7;
  return [0.25, 0.5, 0.75].some((t) => onHighway(site, { x: a.x + (b.x - a.x) * t + n.x * 0.3, y: a.y + (b.y - a.y) * t + n.y * 0.3 }));
}

function distToBoundary(p: V2, edges: BEdge[], boundary: WPt[]): number {
  if (!pointInPolygon(p, boundary)) return 0;
  let best = Infinity;
  for (const e of edges) best = Math.min(best, pointSegmentDistance(p, e.a, e.b));
  return best;
}

/** Distance straight back (towards -z) from p to the plot boundary, or Infinity. */
function rayBack(p: V2, edges: BEdge[]): number {
  let best = Infinity;
  for (const { a, b } of edges) {
    if ((a.x - p.x) * (b.x - p.x) > 0 || Math.abs(b.x - a.x) < 1e-9) continue;
    const z = a.y + ((p.x - a.x) / (b.x - a.x)) * (b.y - a.y);
    if (z < p.y) best = Math.min(best, p.y - z);
  }
  return best;
}

// ---------------------------------------------------------------------------
// Roof heights

interface Heights {
  /** Top of the walls / the flat roof, above the ground. */
  eaves: number;
  /** Highest part. */
  top: number;
}

const storeyTop = (model: HouseModel, level: number) => level * (model.ceilingHeight + model.slabThickness) + model.ceilingHeight;

/** Eaves and roof height over one point, for a storey whose walls top out at `yTop` (model frame). */
function heightsAt(model: HouseModel, plan: RoofPlan, x: number, z: number, yTop: number): Heights {
  let best: number | null = null;
  for (const b of plan.blocks) {
    if (Math.abs(b.y - yTop) > H_TOL) continue;
    const h = roofHeightAt(b, x, z);
    if (h !== null && (best === null || h > best)) best = h;
  }
  if (best !== null) return { eaves: yTop + GROUND_DROP, top: best + GROUND_DROP };
  const flat = flatRoofTop(model, yTop) + GROUND_DROP;
  return { eaves: flat, top: flat };
}

/** The existing house's eaves (highest wall top under a pitched roof) and the top of its highest roof. */
function houseHeights(model: HouseModel, plan: RoofPlan): Heights {
  if (plan.blocks.length) {
    return {
      eaves: Math.max(...plan.blocks.map((b) => b.y)) + GROUND_DROP,
      top: Math.max(...plan.blocks.map((b) => roofGeometry(b).ridgeY)) + GROUND_DROP,
    };
  }
  const top = Math.max(0, ...model.floors.map((f) => f.level));
  const flat = flatRoofTop(model, storeyTop(model, top)) + GROUND_DROP;
  return { eaves: flat, top: flat };
}

// ---------------------------------------------------------------------------
// The check

/**
 * Compare Proposed with As listed (the original house) and list each planning
 * rule that applies, with a verdict and the other consents likely needed.
 */
export function planningCheck(current: HouseModel, proposed: HouseModel, sites: { current?: Site; proposed?: Site } = {}, opts: PlanningOptions = {}): PlanningCheck {
  const ext = exteriorOf(current);
  const houseType = ext.partyWall === "none" ? "detached" : ext.partyWall === "both" ? "terraced" : "semi-detached";
  const site = sites.proposed ?? sites.current;
  const bEdges = site ? boundaryEdgesOf(site) : [];

  const curOut = houseOutlines(current);
  const proOut = houseOutlines(proposed);
  const canopyPolys = (model: HouseModel) => model.floors.flatMap((f) => (f.canopies ?? []).map((c) => c.map((p) => toWorld(f, p))));
  const g = makeGrid([...curOut, ...proOut].flatMap((o) => o.polys).concat(site ? [site.boundary] : [], canopyPolys(current), canopyPolys(proposed)));
  const levels = [...new Set([...curOut, ...proOut].map((o) => o.level))].sort((a, b) => a - b);
  const maskOf = (outs: typeof curOut, level: number) => rasterize(g, outs.find((o) => o.level === level)?.polys ?? []);
  const cur = new Map(levels.map((l) => [l, maskOf(curOut, l)]));
  const pro = new Map(levels.map((l) => [l, maskOf(proOut, l)]));

  // The original house: As listed, or without its single-storey side wing.
  const orig = new Map(cur);
  let original = "As listed is taken as the original house (as built, or as it stood on 1 July 1948).";
  const ground = levels[0];
  const upper = levels.find((l) => l > ground && count(cur.get(l)!) > 0);
  if (opts.wingAfter1948 && ground !== undefined && upper !== undefined) {
    // The wing: ground-floor cells beyond the side walls of the storey above.
    const above = extents(g, cur.get(upper)!);
    let i0 = g.nx;
    let i1 = -1;
    for (let i = 0; i < g.nx; i++) {
      if (above.colMin[i] >= 0) {
        i0 = Math.min(i0, i);
        i1 = Math.max(i1, i);
      }
    }
    const core = cur.get(ground)!.map((v, k) => (v && k % g.nx >= i0 && k % g.nx <= i1 ? 1 : 0));
    orig.set(ground, core);
    original = "As listed without its single-storey side wing (added after 1 July 1948, you said) is taken as the original house; the wing counts as an earlier extension.";
  } else if (opts.wingAfter1948) {
    original = "As listed is taken as the original house: it has no storey above the ground floor to tell a side wing from the main house.";
  }

  const origFoot = levels.reduce((a, l) => or(a, orig.get(l)!), new Uint8Array(g.nx * g.ny));
  const proFoot = levels.reduce((a, l) => or(a, pro.get(l)!), new Uint8Array(g.nx * g.ny));
  const origTop = Math.max(...levels.filter((l) => count(orig.get(l)!) > 0));
  const added = new Map(levels.map((l) => [l, pro.get(l)!.map((v, k) => (v && !orig.get(l)![k] ? 1 : 0))]));
  const fresh = new Map(levels.map((l) => [l, pro.get(l)!.map((v, k) => (v && !cur.get(l)![k] ? 1 : 0))]));
  const anyAdded = levels.reduce((a, l) => or(a, added.get(l)!), new Uint8Array(g.nx * g.ny));
  const anyFresh = levels.reduce((a, l) => or(a, fresh.get(l)!), new Uint8Array(g.nx * g.ny));
  const ext0 = new Map(levels.map((l) => [l, extents(g, orig.get(l)!)]));
  const footExt = extents(g, origFoot);

  const curPlan = planRoofs(current);
  const proPlan = planRoofs(proposed);
  const existing = houseHeights(current, curPlan);
  const pExt = exteriorOf(proposed);

  // Extensions: joined-up added cells that include something new in Proposed.
  const parts: (ExtensionPart & { cells: number[] })[] = [];
  for (const comp of components(g, anyAdded)) {
    const area = cellsArea(comp.length);
    if (area < MIN_AREA) continue;
    const newCells = comp.filter((k) => anyFresh[k]).length;
    if (cellsArea(newCells) < MIN_NEW) continue;
    let i0 = g.nx;
    let i1 = 0;
    let j0 = g.ny;
    let j1 = 0;
    for (const k of comp) {
      const i = k % g.nx;
      const j = (k - i) / g.nx;
      i0 = Math.min(i0, i);
      i1 = Math.max(i1, i);
      j0 = Math.min(j0, j);
      j1 = Math.max(j1, j);
    }
    if (area / (Math.max(i1 - i0 + 1, j1 - j0 + 1) * CELL) < MIN_THICK) continue;

    const sides = new Set<ExtensionSide>();
    let width = 0;
    let depth = 0;
    let forward = 0;
    let infill = false;
    let newStorey = false;
    const partLevels: number[] = [];
    for (const l of levels) {
      const add = added.get(l)!;
      const cells = comp.filter((k) => add[k]);
      if (!cells.length) continue;
      partLevels.push(l);
      if (l > origTop) {
        newStorey = true;
        continue;
      }
      const e = ext0.get(l)!.any ? ext0.get(l)! : footExt;
      for (const k of cells) {
        const i = k % g.nx;
        const j = (k - i) / g.nx;
        const [c0, c1] = [e.colMin[i], e.colMax[i]];
        const [r0, r1] = [e.rowMin[j], e.rowMax[j]];
        if (c0 >= 0 && j < c0) {
          sides.add("rear");
          depth = Math.max(depth, (c0 - j) * CELL);
        } else if (c0 >= 0 && j > c1) {
          sides.add("front");
          forward = Math.max(forward, (j - c1) * CELL);
        } else if (r0 >= 0 && i < r0) {
          sides.add("left");
          width = Math.max(width, (r0 - i) * CELL);
        } else if (r0 >= 0 && i > r1) {
          sides.add("right");
          width = Math.max(width, (i - r1) * CELL);
        } else if (c0 >= 0 || r0 >= 0) {
          infill = true;
        } else {
          // Off a corner of the original (a wraparound): beyond both walls.
          const ii = [...e.colMin].findIndex((v) => v >= 0);
          const jj = [...e.rowMin].findIndex((v) => v >= 0);
          if (ii >= 0 && i < ii) sides.add("left");
          else if (ii >= 0) sides.add("right");
          if (jj >= 0 && j < jj) sides.add("rear");
          else if (jj >= 0) sides.add("front");
        }
      }
    }

    // Storeys standing on the footprint, and heights over it.
    let storeys = 1;
    let eaves = 0;
    let height = 0;
    let groundCells = 0;
    for (const k of comp) {
      const on = levels.filter((l) => pro.get(l)![k]);
      if (!on.length) continue;
      storeys = Math.max(storeys, on.length);
      if (!origFoot[k]) groundCells++;
      const i = k % g.nx;
      const j = (k - i) / g.nx;
      const h = heightsAt(proposed, proPlan, cx(g, i), cy(g, j), storeyTop(proposed, Math.max(...on)));
      eaves = Math.max(eaves, h.eaves);
      height = Math.max(height, h.top);
    }

    // Closest approach to the plot boundary, from the cells on the extension's edge, to the outside face of the wall.
    let boundaryDistance: number | undefined;
    if (site && bEdges.length) {
      const inComp = new Uint8Array(g.nx * g.ny);
      for (const k of comp) inComp[k] = 1;
      let d = Infinity;
      for (const k of comp) {
        const i = k % g.nx;
        const j = (k - i) / g.nx;
        const edge = i === 0 || i === g.nx - 1 || j === 0 || j === g.ny - 1 || !inComp[k - 1] || !inComp[k + 1] || !inComp[k - g.nx] || !inComp[k + g.nx];
        if (edge) d = Math.min(d, distToBoundary({ x: cx(g, i), y: cy(g, j) }, bEdges, site.boundary));
      }
      boundaryDistance = Math.max(0, d - CELL / 2 - EXT_WALL_T / 2);
    }

    const sideList = (["left", "right", "rear", "front"] as ExtensionSide[]).filter((s) => sides.has(s));
    parts.push({
      id: `ext${parts.length + 1}`,
      label: "",
      sides: sideList,
      levels: partLevels,
      storeys,
      area,
      groundArea: cellsArea(groundCells),
      x0: g.x0 + i0 * CELL,
      x1: g.x0 + (i1 + 1) * CELL,
      z0: g.y0 + j0 * CELL,
      z1: g.y0 + (j1 + 1) * CELL,
      width,
      depth,
      forward,
      eaves,
      height,
      boundaryDistance,
      infill,
      newStorey,
      cells: comp,
    });
  }

  // Porches: a small single-storey addition forward of the front wall (or a room called a porch) is a porch (Class D), not Class A.
  const porchRoomName = (p: (typeof parts)[number]) =>
    proposed.floors
      .filter((f) => f.level === ground)
      .flatMap((f) => f.rooms.map((r) => ({ r, poly: roomWorldPolygon(f, r) })))
      .some(({ r, poly }) => /porch/i.test(r.name) && p.cells.some((k) => pointInPolygon({ x: cx(g, k % g.nx), y: cy(g, Math.floor(k / g.nx)) }, poly)));
  const isPorch = (p: (typeof parts)[number]) =>
    p.storeys === 1 && p.levels.every((l) => l === ground) && p.sides.length === 1 && p.sides[0] === "front" && (p.area <= 4 || porchRoomName(p));
  const porches = parts.filter(isPorch);
  const extensions = parts.filter((p) => !isPorch(p));

  for (const p of extensions) p.label = labelOf(p, ground);
  for (const p of porches) p.label = "Porch";

  const rules: PlanningRule[] = [];
  const push = (r: PlanningRule) => rules.push(r);

  // ---- Class A: extensions ----
  const origWidth = (() => {
    let i0 = -1;
    let i1 = -1;
    for (let i = 0; i < g.nx; i++) {
      if (footExt.colMin[i] >= 0) {
        if (i0 < 0) i0 = i;
        i1 = i;
      }
    }
    return i0 < 0 ? 0 : (i1 - i0 + 1) * CELL;
  })();
  const attached = houseType !== "detached";
  const [rearLimit, rearPrior] = attached ? REAR_DEPTH.attached : REAR_DEPTH.detached;

  if (!extensions.length) {
    push({ id: "A-none", group: "Extensions (Class A)", title: "Extensions", status: "na", reason: "No extension found: Proposed adds no floor area outside the original house." });
  }

  extensions.forEach((p, n) => {
    const group = extensions.length > 1 ? `${p.label} (${n + 1})` : p.label;
    const id = (s: string) => `${p.id}-${s}`;
    const what = p.label.toLowerCase();

    // A.1(e): beyond the principal elevation.
    if (p.sides.includes("front")) {
      push({ id: id("front"), group, title: "Not forward of the front wall", status: "fail", reason: `It comes ${m(p.forward)} forward of the front wall (the principal elevation). Permitted development doesn't allow that.`, short: `the ${what} comes ${m(p.forward)} forward of the front wall`, ref: "Class A.1(e)" });
    } else {
      push({ id: id("front"), group, title: "Not forward of the front wall", status: "pass", reason: "It stays behind the line of the front wall (the principal elevation).", ref: "Class A.1(e)" });
    }

    // A.1(j): beyond a side wall.
    const side = p.sides.find((s): s is "left" | "right" => s === "left" || s === "right");
    if (side) {
      push(
        p.storeys > 1
          ? { id: id("side-storeys"), group, title: "Side extension: single storey only", status: "fail", reason: `It is ${p.storeys} storeys where it goes beyond the house's ${side} side wall. A side extension can only be single storey.`, short: `the side extension is ${p.storeys === 2 ? "two" : p.storeys} storeys (side extensions must be single storey)`, ref: "Class A.1(j)(ii)" }
          : { id: id("side-storeys"), group, title: "Side extension: single storey only", status: "pass", reason: "It is single storey.", ref: "Class A.1(j)(ii)" },
      );
      push(
        p.height > MAX_SINGLE_HEIGHT + H_TOL
          ? { id: id("side-height"), group, title: "Side extension: no more than 4 m high", status: "fail", reason: `Its highest part is about ${m(p.height, MAX_SINGLE_HEIGHT)} above the ground (limit ${MAX_SINGLE_HEIGHT} m).`, short: `the side extension is about ${m(p.height)} high (limit 4 m)`, ref: "Class A.1(j)(i)" }
          : { id: id("side-height"), group, title: "Side extension: no more than 4 m high", status: "pass", reason: `Its highest part is about ${m(p.height, MAX_SINGLE_HEIGHT)} above the ground.`, ref: "Class A.1(j)(i)" },
      );
      const half = origWidth / 2;
      push(
        p.width > half + LEN_TOL
          ? { id: id("side-width"), group, title: "Side extension: no wider than half the house", status: "fail", reason: `It is ${p.width.toFixed(2)} m wide; half the original house's width (${m(origWidth)}) is ${half.toFixed(2)} m.`, short: `the side extension is ${m(p.width)} wide, more than half the original house (${m(half)})`, ref: "Class A.1(j)(iii)" }
          : { id: id("side-width"), group, title: "Side extension: no wider than half the house", status: "pass", reason: `It is ${p.width.toFixed(2)} m wide; half the original house's width (${m(origWidth)}) is ${half.toFixed(2)} m.`, ref: "Class A.1(j)(iii)" },
      );
      // Side elevation fronting a highway: a boundary on that side of the plot by a road.
      if (site) {
        const dir = side === "left" ? -1 : 1;
        const roadside = bEdges.filter((e) => e.n.x * dir > 0.64).some((e) => adjoinsHighway(site, e.a, e.b, e.n));
        push(
          roadside
            ? { id: id("side-road"), group, title: "Side wall not facing a road", status: "fail", reason: `The plot's ${side} side runs along a road or pavement, so the side wall fronts a highway: a side extension there needs permission.`, short: "the side extension faces a road", ref: "Class A.1(e)(ii)" }
            : { id: id("side-road"), group, title: "Side wall not facing a road", status: "pass", reason: `The plot's ${side} side doesn't border a road or pavement on the Site plan.`, ref: "Class A.1(e)(ii)" },
        );
      } else {
        push({ id: id("side-road"), group, title: "Side wall not facing a road", status: "check", reason: "There's no plot to tell whether that side of the house faces a road.", ref: "Class A.1(e)(ii)" });
      }
    }

    // A.1(f), (g), (i): beyond the rear wall.
    if (p.sides.includes("rear")) {
      if (p.storeys <= 1) {
        const tooDeep = p.depth > rearPrior + LEN_TOL;
        const prior = !tooDeep && p.depth > rearLimit + LEN_TOL;
        push({
          id: id("rear-depth"),
          group,
          title: `Rear extension: no deeper than ${rearLimit} m (${rearPrior} m with prior approval)`,
          status: tooDeep ? "fail" : prior ? "prior" : "pass",
          reason: `It goes ${m(p.depth, prior || tooDeep ? rearPrior : rearLimit)} past the original rear wall. A ${houseType} house can go ${rearLimit} m, or up to ${rearPrior} m through the larger home extension prior approval scheme (the council consults the neighbours).`,
          short: tooDeep ? `the rear extension is ${m(p.depth)} deep (limit ${rearPrior} m even with prior approval)` : prior ? `the rear extension is ${m(p.depth)} deep: over ${rearLimit} m needs prior approval from the council` : undefined,
          ref: "Class A.1(f), A.1(g), A.4",
        });
        push(
          p.height > MAX_SINGLE_HEIGHT + H_TOL
            ? { id: id("rear-height"), group, title: "Rear extension: no more than 4 m high", status: "fail", reason: `Its highest part is about ${m(p.height, MAX_SINGLE_HEIGHT)} above the ground (limit ${MAX_SINGLE_HEIGHT} m).`, short: `the rear extension is about ${m(p.height)} high (limit 4 m)`, ref: "Class A.1(f)(ii)" }
            : { id: id("rear-height"), group, title: "Rear extension: no more than 4 m high", status: "pass", reason: `Its highest part is about ${m(p.height, MAX_SINGLE_HEIGHT)} above the ground.`, ref: "Class A.1(f)(ii)" },
        );
      } else {
        push(
          p.depth > TWO_STOREY_REAR_DEPTH + LEN_TOL
            ? { id: id("rear-depth"), group, title: "Two-storey rear extension: no deeper than 3 m", status: "fail", reason: `It goes ${m(p.depth, TWO_STOREY_REAR_DEPTH)} past the original rear wall (limit ${TWO_STOREY_REAR_DEPTH} m).`, short: `the two-storey rear extension is ${m(p.depth)} deep (limit 3 m)`, ref: "Class A.1(i)(i)" }
            : { id: id("rear-depth"), group, title: "Two-storey rear extension: no deeper than 3 m", status: "pass", reason: `It goes ${m(p.depth, TWO_STOREY_REAR_DEPTH)} past the original rear wall.`, ref: "Class A.1(i)(i)" },
        );
        const cells = p.cells;
        let gap = Infinity;
        if (site) {
          const front = new Map<number, number>();
          for (const k of cells) {
            const i = k % g.nx;
            const j = (k - i) / g.nx;
            if (!front.has(i) || j < front.get(i)!) front.set(i, j);
          }
          for (const [i, j] of front) gap = Math.min(gap, rayBack({ x: cx(g, i), y: g.y0 + j * CELL }, bEdges));
          gap = Math.max(0, gap - EXT_WALL_T / 2);
        }
        push(
          !site || !Number.isFinite(gap)
            ? { id: id("rear-gap"), group, title: "Two-storey rear extension: 7 m from the rear boundary", status: "check", reason: "There's no plot boundary behind it to measure to.", ref: "Class A.1(i)(ii)" }
            : gap < TWO_STOREY_REAR_GAP - LEN_TOL
              ? { id: id("rear-gap"), group, title: "Two-storey rear extension: 7 m from the rear boundary", status: "fail", reason: `Its rear wall is ${m(gap, TWO_STOREY_REAR_GAP)} from the boundary behind it (at least ${TWO_STOREY_REAR_GAP} m).`, short: `the two-storey rear extension is ${m(gap)} from the rear boundary (at least 7 m)`, ref: "Class A.1(i)(ii)" }
              : { id: id("rear-gap"), group, title: "Two-storey rear extension: 7 m from the rear boundary", status: "pass", reason: `Its rear wall is ${m(gap, TWO_STOREY_REAR_GAP)} from the boundary behind it.`, ref: "Class A.1(i)(ii)" },
        );
      }
    }

    if (p.infill) {
      push({ id: id("infill"), group, title: "Infill inside the house's outline", status: "check", reason: "Part of it fills a gap enclosed by the original house (a courtyard or notch). Whether it counts as side or rear depends on the walls around it: ask the council.", ref: "Class A" });
    }
    if (p.newStorey) {
      push({ id: id("storey"), group, title: "Adding a storey on top", status: "fail", reason: "It adds a storey above the original house's top floor. Class A doesn't cover that; Class AA (prior approval) does only for houses built between 1948 and 2018.", short: "it adds a storey on top of the house", ref: "Class A, Class AA" });
    }

    // A.1(ii) eaves within 2 m of a boundary.
    if (p.boundaryDistance === undefined) {
      push({ id: id("eaves-2m"), group, title: "Within 2 m of a boundary: eaves no higher than 3 m", status: "check", reason: `There's no plot boundary to measure to; its eaves are about ${m(p.eaves)} high.`, ref: "Class A.1(ii)" });
    } else if (p.boundaryDistance < NEAR_BOUNDARY) {
      const bad = p.eaves > NEAR_BOUNDARY_EAVES + H_TOL;
      push({
        id: id("eaves-2m"),
        group,
        title: "Within 2 m of a boundary: eaves no higher than 3 m",
        status: bad ? "fail" : "pass",
        reason: `It is ${fromBoundary(p.boundaryDistance)} and its eaves are about ${m(p.eaves, NEAR_BOUNDARY_EAVES)} high${bad ? ` (limit ${NEAR_BOUNDARY_EAVES} m within ${NEAR_BOUNDARY} m of a boundary)` : ""}.`,
        short: bad ? `its eaves are about ${m(p.eaves)} high ${fromBoundary(p.boundaryDistance)} (limit 3 m within 2 m of a boundary)` : undefined,
        ref: "Class A.1(ii)",
      });
    } else {
      push({ id: id("eaves-2m"), group, title: "Within 2 m of a boundary: eaves no higher than 3 m", status: "pass", reason: `It is ${m(p.boundaryDistance)} from the nearest boundary, so the 3 m eaves limit doesn't apply.`, ref: "Class A.1(ii)" });
    }

    // A.1(c), (d): no higher than the existing house.
    const highEaves = p.eaves > existing.eaves + H_TOL;
    push({
      id: id("eaves"),
      group,
      title: "Eaves no higher than the house's",
      status: highEaves ? "fail" : "pass",
      reason: `Its eaves are about ${m(p.eaves)} high; the existing house's are about ${m(existing.eaves)}.`,
      short: highEaves ? `its eaves (${m(p.eaves)}) are higher than the house's (${m(existing.eaves)})` : undefined,
      ref: "Class A.1(d)",
    });
    // The roof over the enlarged part: its own highest point, or the ridge of a roof that now spans it and the house.
    const roofTop = Math.max(p.height, ...blocksOver(proPlan, p).map((b) => roofGeometry(b).ridgeY + GROUND_DROP));
    const highTop = roofTop > existing.top + H_TOL;
    push({
      id: id("ridge"),
      group,
      title: "No higher than the house's roof",
      status: highTop ? "fail" : "pass",
      reason: `The roof over it rises to about ${m(roofTop)}; the existing roof's ridge is about ${m(existing.top)}.`,
      short: highTop ? `its roof rises to ${m(roofTop)}, above the existing ridge (${m(existing.top)})` : undefined,
      ref: "Class A.1(c)",
    });

    // A.3(c): roof pitch of a two-storey extension.
    if (p.storeys > 1) {
      const blocks = blocksOver(proPlan, p);
      const main = mainBlock(curPlan.blocks);
      if (!blocks.length || !main) {
        push({ id: id("pitch"), group, title: "Roof pitch to match the house", status: "check", reason: "It isn't under a pitched roof in the model: the roof should, as far as practicable, match the house's.", ref: "Class A.3(c)" });
      } else {
        const off = blocks.filter((b) => Math.abs(b.pitchDeg - main.pitchDeg) > 3);
        push(
          off.length
            ? { id: id("pitch"), group, title: "Roof pitch to match the house", status: "check", reason: `Its roof is pitched at ${deg(off[0].pitchDeg)}; the house's is ${deg(main.pitchDeg)}. It should match as far as practicable.`, ref: "Class A.3(c)" }
            : { id: id("pitch"), group, title: "Roof pitch to match the house", status: "pass", reason: `Its roof is pitched at ${deg(blocks[0].pitchDeg)}, like the house's.`, ref: "Class A.3(c)" },
        );
      }
    }

    // A.3(b): upper-floor windows in a side elevation.
    if (p.levels.some((l) => l > ground) || p.storeys > 1) {
      const sideWindows = upperSideWindows(proposed, p, g, pro, ground);
      push(
        sideWindows
          ? { id: id("side-windows"), group, title: "Upper-floor side windows obscure-glazed", status: "check", reason: `${sideWindows} upper-floor window${sideWindows > 1 ? "s are" : " is"} in a side wall: ${sideWindows > 1 ? "they" : "it"} must be obscure-glazed and fixed shut below 1.7 m above the floor.`, ref: "Class A.3(b)" }
          : { id: id("side-windows"), group, title: "Upper-floor side windows obscure-glazed", status: "pass", reason: "No upper-floor windows in its side walls.", ref: "Class A.3(b)" },
      );
    }
  });

  // A.1(b): coverage of the curtilage.
  if (extensions.length) {
    if (site && site.boundary.length >= 3) {
      const plot = areaOf(site.boundary);
      let origIn = 0;
      let extIn = 0;
      for (let k = 0; k < origFoot.length; k++) {
        if (!origFoot[k] && !proFoot[k]) continue;
        const i = k % g.nx;
        const j = (k - i) / g.nx;
        if (!pointInPolygon({ x: cx(g, i), y: cy(g, j) }, site.boundary)) continue;
        if (origFoot[k]) origIn++;
        else extIn++;
      }
      const curtilage = Math.max(0, plot - cellsArea(origIn));
      const built = cellsArea(extIn);
      const share = curtilage > 0 ? built / curtilage : 1;
      push({
        id: "A-coverage",
        group: "Extensions (Class A)",
        title: "Extensions cover no more than half the garden",
        status: share > COVERAGE ? "fail" : "pass",
        reason:
          built < SURFACE_TOL
            ? `The extensions add no ground area: they sit on the existing ground floor (the limit is half of the ${m2(curtilage)} of plot around the original house).`
            : `Extensions${opts.wingAfter1948 ? " (the side wing included)" : ""} would cover ${m2(built)}, ${Math.round(share * 100)}% of the ${m2(curtilage)} of plot around the original house (limit 50%; sheds and other outbuildings count too, and the model has none).`,
        short: share > COVERAGE ? `extensions would cover ${Math.round(share * 100)}% of the garden (limit 50%)` : undefined,
        ref: "Class A.1(b)",
      });
    } else {
      push({ id: "A-coverage", group: "Extensions (Class A)", title: "Extensions cover no more than half the garden", status: "check", reason: "There's no plot to measure the garden.", ref: "Class A.1(b)" });
    }

    // A.3(a): materials.
    push({ id: "A-materials", group: "Extensions (Class A)", title: "Materials look like the house's", status: "check", reason: materialsReason(current, proposed, extensions, g, added), ref: "Class A.3(a)" });
  }

  // ---- Class D: porches ----
  const porchRows = porchRules(current, proposed, porches, site, bEdges, g, pExt.flatRoofSkirt?.sides.includes("front") ?? false, proPlan, ground);
  rules.push(...porchRows);

  // ---- Class F: front garden hard surfacing ----
  rules.push(hardSurfaceRule(sites.current, sites.proposed, g, proFoot));

  // ---- Part 2 Class A: walls and the drive opening ----
  const { rules: wallRules, kerb } = boundaryRules(sites.current, sites.proposed);
  rules.push(...wallRules);

  // ---- 45-degree guideline ----
  rules.push(...fortyFive(extensions, site, g));

  // ---- Other consents ----
  const consents: Consent[] = [];
  const structural = diffModels(current, proposed).filter((c) => c.structural);
  if (extensions.length || porches.length) {
    consents.push({
      id: "building-regs",
      title: "Building Regulations approval",
      needed: "yes",
      reason: `Needed whatever the planning answer: structure and foundations, fire safety and escape (a first-floor room needs an escape window or protected stair), insulation, ventilation and drainage. Apply to building control (a full plans application or a building notice) before work starts.`,
    });
  } else if (structural.length) {
    consents.push({ id: "building-regs", title: "Building Regulations approval", needed: "likely", reason: `${structural.length} change${structural.length > 1 ? "s look" : " looks"} structural (see Changes in the Report): structural work needs building control approval.` });
  }

  const pw = partyWall(extensions, site, houseType, g);
  if (pw) consents.push(pw);
  if (kerb) consents.push(kerb);

  // ---- Verdict ----
  const fails = rules.filter((r) => r.status === "fail");
  const priors = rules.filter((r) => r.status === "prior");
  const because = (fails.length ? fails : priors).map((r) => r.short ?? r.title.toLowerCase());
  const work = parts.length > 0 || rules.some((r) => r.status !== "na") || consents.length > 0;
  let verdict: Verdict;
  let headline: string;
  if (fails.length) {
    verdict = "permission";
    headline = "Needs planning permission (a householder planning application)";
  } else if (priors.length) {
    verdict = "prior";
    headline = "Looks like permitted development, after prior approval from the council";
  } else if (work) {
    verdict = "pd";
    headline = "Looks like permitted development";
  } else {
    verdict = "none";
    headline = "No building work found between As listed and Proposed";
  }

  return {
    verdict,
    headline,
    because: [...new Set(because)],
    consents,
    rules,
    parts: parts.map(({ cells: _cells, ...p }) => p),
    houseType,
    original,
    caveats: CAVEATS,
  };
}

export const CAVEATS = [
  "Guidance, not legal advice. To be sure, ask the council for a Lawful Development Certificate (for permitted development) or pre-application advice.",
  "Permitted development rights can be taken away by an Article 4 direction, a conservation area, a listed building or a condition on an earlier planning permission. The app can't see any of these: check with the council.",
  "“Original” means the house as built, or as it stood on 1 July 1948 if it is older. Earlier extensions count against the limits.",
  "Measured from the traced plan (wall centre lines) and the model's storey and roof heights, so allow 10 to 20 cm either way.",
  "Check the deeds too: a restrictive covenant can need someone's consent even when the council's doesn't.",
];

function labelOf(p: ExtensionPart, ground: number): string {
  const storeys = p.storeys === 1 ? "Single-storey" : p.storeys === 2 ? "Two-storey" : `${p.storeys}-storey`;
  const side = p.sides.find((s) => s === "left" || s === "right");
  const where =
    side && p.sides.includes("rear")
      ? `wraparound extension (${side} side and rear)`
      : side
        ? `side extension on the ${side}`
        : p.sides.includes("rear")
          ? "rear extension"
          : p.sides.includes("front")
            ? "front extension"
            : p.newStorey
              ? "extension on top"
              : "extension";
  const over = !p.levels.includes(ground) && p.storeys > 1 ? " (built over the existing ground floor)" : "";
  return `${storeys} ${where}${over}`;
}

/** Overlap (metres) a roof block's walls need with an extension's footprint to count as over it, not just beside it. */
const OVER_TOL = 0.3;

/**
 * Proposed roof blocks over an extension's footprint: not the main roof of a
 * house whose wall it merely stands against (an extension's own roof that
 * runs in under it is the one over it).
 */
function blocksOver(plan: RoofPlan, p: ExtensionPart): RoofBlock[] {
  return plan.blocks.filter((b) => b.x0 < p.x1 - OVER_TOL && b.x1 > p.x0 + OVER_TOL && b.z0 < p.z1 - OVER_TOL && b.z1 > p.z0 + OVER_TOL);
}

const mainBlock = (blocks: RoofBlock[]) => [...blocks].sort((a, b) => (b.x1 - b.x0) * (b.z1 - b.z0) - (a.x1 - a.x0) * (a.z1 - a.z0))[0];

const GLAZED = new Set(["window", "bay", "french", "patio", "bifold"]);

/**
 * Upper-floor windows in an extension's side walls: windows on walls running
 * front to back ("v" on the plan) with the extension on one side and outside
 * on the other.
 */
function upperSideWindows(model: HouseModel, p: ExtensionPart & { cells?: number[] }, g: Grid, pro: Map<number, Uint8Array>, ground: number): number {
  let n = 0;
  for (const f of model.floors) {
    if (f.level <= ground) continue;
    const mask = pro.get(f.level);
    if (!mask) continue;
    const inside = (x: number, y: number) => {
      const i = Math.floor((x - g.x0) / CELL);
      const j = Math.floor((y - g.y0) / CELL);
      return i >= 0 && j >= 0 && i < g.nx && j < g.ny && !!mask[j * g.nx + i];
    };
    for (const o of f.openings) {
      if (!GLAZED.has(o.kind) || o.orientation !== "v") continue;
      const w = toWorld(f, { x: o.x, y: o.y });
      if (w.x < p.x0 - 0.3 || w.x > p.x1 + 0.3 || w.y < p.z0 - 0.3 || w.y > p.z1 + 0.3) continue;
      const l = inside(w.x - 0.15, w.y);
      const r = inside(w.x + 0.15, w.y);
      if (l !== r) n++;
    }
  }
  return n;
}

const finishOf = (model: HouseModel, finish?: WallFinish) => finish ?? exteriorOf(model).wallFinish ?? "render";

function materialsReason(current: HouseModel, proposed: HouseModel, parts: (ExtensionPart & { cells: number[] })[], g: Grid, added: Map<number, Uint8Array>): string {
  const existing = new Set(current.floors.flatMap((f) => f.rooms.map((r) => finishOf(current, r.exteriorFinish))));
  const used = new Set<WallFinish>();
  for (const f of proposed.floors) {
    const mask = added.get(f.level);
    if (!mask) continue;
    for (const r of f.rooms) {
      const poly = roomWorldPolygon(f, r);
      const hit = parts.some((p) => p.cells.some((k, n) => n % 7 === 0 && mask[k] && pointInPolygon({ x: cx(g, k % g.nx), y: cy(g, Math.floor(k / g.nx)) }, poly)));
      if (hit) used.add(finishOf(proposed, r.exteriorFinish));
    }
  }
  const names = [...used].map((u) => WALL_FINISH_LABEL[u].toLowerCase());
  const same = [...used].every((u) => existing.has(u));
  const shown = names.length ? `The model shows the extension in ${names.join(" and ")}` : "The model doesn't say what the extension is finished in";
  return `${shown}${names.length ? (same ? ", as on the existing house" : ", which the existing house doesn't have") : ""}. The walls, roof tiles and windows must look similar to the house's: confirm with the builder.`;
}

// ---------------------------------------------------------------------------
// Class D porches

function porchRules(
  current: HouseModel,
  proposed: HouseModel,
  porchRooms: (ExtensionPart & { cells: number[] })[],
  site: Site | undefined,
  bEdges: BEdge[],
  g: Grid,
  skirt: boolean,
  plan: RoofPlan,
  ground: number,
): PlanningRule[] {
  const group = "Porch (Class D)";
  const out: PlanningRule[] = [];
  // Canopies (open porches) that differ between the layouts.
  const canopies = (model: HouseModel) => model.floors.filter((f) => f.level === ground).flatMap((f) => (f.canopies ?? []).map((c) => c.map((p) => toWorld(f, p))));
  const before = canopies(current);
  const after = canopies(proposed);
  const mb = rasterize(g, before);
  const changed = after.filter((poly) => !before.some((b) => b.length === poly.length && b.every((p, i) => Math.hypot(p.x - poly[i].x, p.y - poly[i].y) < 0.02)));
  const removedOnly = !changed.length && before.length > after.length;

  type Porch = { label: string; area: number; height: number; poly?: V2[]; cells?: number[]; grows: boolean; was: number };
  const items: Porch[] = [];
  const wasArea = before.reduce((s, b) => s + areaOf(b), 0);
  for (const poly of changed) {
    const ma = rasterize(g, [poly]);
    let grows = false;
    for (let k = 0; k < ma.length; k++) if (ma[k] && !mb[k]) grows = true;
    // Canopies are drawn to their outer edge, so their area is the external ground area.
    let height = 0;
    for (const p of poly) height = Math.max(height, porchHeight(proposed, plan, p.x, p.y, ground));
    const c = { x: poly.reduce((s, p) => s + p.x, 0) / poly.length, y: poly.reduce((s, p) => s + p.y, 0) / poly.length };
    height = Math.max(height, porchHeight(proposed, plan, c.x, c.y, ground));
    items.push({ label: "Open porch (canopy)", area: areaOf(poly), height, poly, grows, was: wasArea });
  }
  for (const p of porchRooms) {
    // Rooms run to the wall centre lines. Outside, a porch against the front wall measures half a wall wider at
    // each side, and from the house's outer face to its own outer face, which is its centre-line depth.
    const w = p.x1 - p.x0 + EXT_WALL_T;
    const d = p.z1 - p.z0;
    items.push({ label: "Porch", area: (p.area / ((p.x1 - p.x0) * d)) * w * d, height: p.height, cells: p.cells, grows: true, was: 0 });
  }

  if (!items.length) {
    out.push({ id: "D-none", group, title: "Porch", status: "na", reason: removedOnly ? "A porch canopy is taken away: that needs no permission." : "No new or changed porch in Proposed." });
    return out;
  }

  items.forEach((it, n) => {
    const id = (s: string) => `D${n}-${s}`;
    const name = items.length > 1 ? `${it.label} ${n + 1}` : it.label;
    if (it.area > PORCH_AREA + 0.01) {
      // A porch made smaller than the one it replaces is arguably no new development; say so rather than fail it.
      const smaller = !it.grows && it.was > it.area;
      out.push({
        id: id("area"),
        group,
        title: `${name}: ground area up to 3 m²`,
        status: smaller ? "check" : "fail",
        reason: smaller
          ? `It is ${m2(it.area)} (outside measurements), over the 3 m² limit, but smaller than the ${m2(it.was)} porch it replaces: ask the council whether cutting it back needs permission.`
          : `It is ${m2(it.area)} measured outside (limit ${PORCH_AREA} m²).`,
        short: smaller ? undefined : `the porch is ${m2(it.area)} (limit 3 m²)`,
        ref: "Class D.1(b)",
      });
    } else {
      out.push({ id: id("area"), group, title: `${name}: ground area up to 3 m²`, status: "pass", reason: `It is ${m2(it.area)} measured outside.`, ref: "Class D.1(b)" });
    }
    if (it.height > PORCH_HEIGHT + H_TOL) {
      out.push({ id: id("height"), group, title: `${name}: no more than 3 m high`, status: "fail", reason: `Its roof is about ${m(it.height, PORCH_HEIGHT)} above the ground (limit ${PORCH_HEIGHT} m).`, short: `the porch is about ${m(it.height)} high (limit 3 m)`, ref: "Class D.1(c)" });
    } else if (skirt && it.poly) {
      out.push({ id: id("height"), group, title: `${name}: no more than 3 m high`, status: "check", reason: `Its flat roof is about ${m(it.height, PORCH_HEIGHT)} above the ground, but the tiled skirt along the front may rise above 3 m: measure it.`, ref: "Class D.1(c)" });
    } else {
      out.push({ id: id("height"), group, title: `${name}: no more than 3 m high`, status: "pass", reason: `Its roof is about ${m(it.height, PORCH_HEIGHT)} above the ground.`, ref: "Class D.1(c)" });
    }
    if (!site) {
      out.push({ id: id("road"), group, title: `${name}: 2 m from a boundary on a road`, status: "check", reason: "There's no plot to measure to.", ref: "Class D.1(d)" });
    } else {
      const road = bEdges.filter((e) => adjoinsHighway(site, e.a, e.b, e.n));
      const poly = it.poly ?? cellsOutline(it.cells ?? [], g);
      let d = Infinity;
      for (const e of road) for (let i = 0; i < poly.length; i++) d = Math.min(d, segmentSegmentClosest(poly[i], poly[(i + 1) % poly.length], e.a, e.b).d);
      if (it.cells) d = Math.max(0, d - EXT_WALL_T / 2);
      out.push(
        !road.length
          ? { id: id("road"), group, title: `${name}: 2 m from a boundary on a road`, status: "pass", reason: "No boundary of the plot runs along a road.", ref: "Class D.1(d)" }
          : d < PORCH_HIGHWAY - LEN_TOL
            ? { id: id("road"), group, title: `${name}: 2 m from a boundary on a road`, status: "fail", reason: `It is ${m(d, PORCH_HIGHWAY)} from the boundary by the road (at least ${PORCH_HIGHWAY} m).`, short: `the porch is ${m(d)} from the boundary by the road (at least 2 m)`, ref: "Class D.1(d)" }
            : { id: id("road"), group, title: `${name}: 2 m from a boundary on a road`, status: "pass", reason: `It is ${m(d, PORCH_HIGHWAY)} from the boundary by the road.`, ref: "Class D.1(d)" },
      );
    }
  });
  return out;
}

/** Height of the porch roof over a point: a lean-to's tiles, else the flat roof on the storey's walls. */
function porchHeight(model: HouseModel, plan: RoofPlan, x: number, z: number, ground: number): number {
  let h: number | null = null;
  for (const l of plan.leanTos) {
    const v = leanToHeightAt(l, x, z);
    if (v !== null) h = Math.max(h ?? 0, v);
  }
  if (h !== null) return h + GROUND_DROP;
  return flatRoofTop(model, storeyTop(model, ground)) + GROUND_DROP;
}

/** The bounding rectangle of a set of cells, as a polygon. */
function cellsOutline(cells: number[], g: Grid): V2[] {
  if (!cells.length) return [];
  const xs = cells.map((k) => k % g.nx);
  const ys = cells.map((k) => Math.floor(k / g.nx));
  const x0 = g.x0 + Math.min(...xs) * CELL;
  const x1 = g.x0 + (Math.max(...xs) + 1) * CELL;
  const y0 = g.y0 + Math.min(...ys) * CELL;
  const y1 = g.y0 + (Math.max(...ys) + 1) * CELL;
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

// ---------------------------------------------------------------------------
// Class F hard surfacing

const HARD = new Set(["drive", "patio", "path"]);

/**
 * New or relaid hard surfacing in the front garden. The front garden is the
 * plot in front of the house: cells whose column has the house behind them
 * and nothing in front, or, beside the house, cells further forward than the
 * typical front wall line. A cell counts as new or relaid when it is hard in
 * Proposed and was soft, or a different material, in As listed.
 */
function hardSurfaceRule(before: Site | undefined, after: Site | undefined, g: Grid, house: Uint8Array): PlanningRule {
  const group = "Front garden (Class F)";
  const title = "Hard surfacing over 5 m² drains to a permeable area";
  const ref = "Class F";
  if (!before || !after) return { id: "F", group, title, status: "na", reason: "No plot to compare." };
  if (before === after) return { id: "F", group, title, status: "na", reason: "The front garden's surfaces don't change." };
  const he = extents(g, house);
  const fronts = [...he.colMax].filter((v) => v >= 0).sort((a, b) => a - b);
  const frontLine = fronts.length ? fronts[Math.floor(fronts.length / 2)] : -1;
  const key = (site: Site, p: V2) => {
    for (let s = site.surfaces.length - 1; s >= 0; s--) {
      const sf = site.surfaces[s];
      if (pointInPolygon(p, sf.polygon)) return HARD.has(sf.kind) ? `${sf.kind}:${surfaceLook(sf)}` : null;
    }
    return null;
  };
  let changed = 0;
  let porous = 0;
  let grown = 0;
  for (let j = 0; j < g.ny; j++) {
    for (let i = 0; i < g.nx; i++) {
      const k = j * g.nx + i;
      if (house[k]) continue;
      const inFront = he.colMax[i] >= 0 ? j > he.colMax[i] : frontLine >= 0 && j > frontLine;
      if (!inFront) continue;
      const p = { x: cx(g, i), y: cy(g, j) };
      if (!pointInPolygon(p, after.boundary)) continue;
      const a = key(after, p);
      if (!a) continue;
      const b = key(before, p);
      if (a === b) continue;
      changed++;
      if (!b) grown++;
      if (a.endsWith(":gravel")) porous++;
    }
  }
  const area = cellsArea(changed);
  if (area < SURFACE_TOL) return { id: "F", group, title, status: "na", reason: "No new or relaid hard surface in the front garden." };
  const grow = cellsArea(grown);
  const what = `${m2(area)} of new or relaid hard surface in the front garden${grow >= SURFACE_TOL ? ` (${m2(grow)} of it where there was none)` : ""}`;
  if (area <= HARD_SURFACE) return { id: "F", group, title, status: "pass", reason: `${what}: under 5 m², so no permission needed.`, ref };
  if (cellsArea(porous) >= area - SURFACE_TOL) return { id: "F", group, title, status: "pass", reason: `${what}, laid in gravel, which is permeable.`, ref };
  return {
    id: "F",
    group,
    title,
    status: "check",
    reason: `${what}. Over 5 m² it needs permission unless it is permeable (porous block paving, gravel) or drains to a lawn or border on the plot.`,
    ref,
  };
}

// ---------------------------------------------------------------------------
// Part 2 Class A: walls, fences and gates; the drive opening

function boundaryRules(before: Site | undefined, after: Site | undefined): { rules: PlanningRule[]; kerb?: Consent } {
  const group = "Walls, fences and the drive";
  if (!before || !after || before === after) {
    return { rules: [{ id: "W", group, title: "Walls, fences and gates", status: "na", reason: before && after ? "The plot's boundaries don't change." : "No plot to compare." }] };
  }
  const NORMAL: Record<string, V2> = { front: { x: 0, y: 1 }, rear: { x: 0, y: -1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
  const pieces = boundaryPieces(before, after).filter((p) => p.length >= 1e-3);
  const byRoad = (p: (typeof pieces)[number]) => adjoinsHighway(after, p.a, p.b, NORMAL[p.side]) || adjoinsHighway(before, p.a, p.b, NORMAL[p.side]);
  const solid = (e?: BoundaryEdge) => !!e && e.kind !== "open";
  const rules: PlanningRule[] = [];

  // New or raised walls and fences.
  const changed = pieces.filter((p) => solid(p.after) && !sameEdge(p.before, p.after));
  const tooHigh = changed.filter((p) => p.after!.height > (byRoad(p) ? WALL_BY_ROAD : WALL_ELSEWHERE) + 0.005);
  if (tooHigh.length) {
    const p = tooHigh[0];
    const limit = byRoad(p) ? WALL_BY_ROAD : WALL_ELSEWHERE;
    rules.push({
      id: "W-height",
      group,
      title: "New walls and fences: 1 m by a road, 2 m elsewhere",
      status: "fail",
      reason: `A new or altered ${p.after!.kind} on the ${p.side} is ${m(p.after!.height)} high (limit ${limit} m ${limit === 1 ? "next to a road" : "away from a road"}).`,
      short: `a new ${p.after!.kind} on the ${p.side} is ${m(p.after!.height)} high (limit ${limit} m)`,
      ref: "Part 2 Class A.1",
    });
  } else if (changed.length) {
    rules.push({ id: "W-height", group, title: "New walls and fences: 1 m by a road, 2 m elsewhere", status: "pass", reason: "The new or altered walls and fences are within the height limits.", ref: "Part 2 Class A.1" });
  }

  // Walls taken down.
  const removed = pieces.filter((p) => solid(p.before) && !solid(p.after)).reduce((s, p) => s + p.length, 0);
  if (removed >= LEN_TOL) {
    rules.push({
      id: "W-removed",
      group,
      title: "Taking down boundary walls",
      status: "pass",
      reason: `${m(removed)} of wall or fence comes down. That needs no planning permission (only new walls by a road are limited, to 1 m), unless the house is in a conservation area, where taking down a wall over 1 m high by a road needs consent.`,
      ref: "Part 2 Class A, Part 11",
    });
  }

  // The opening onto the street.
  const roadside = pieces.filter(byRoad);
  const openBefore = roadside.filter((p) => p.before?.kind === "open").reduce((s, p) => s + p.length, 0);
  const openAfter = roadside.filter((p) => p.after?.kind === "open").reduce((s, p) => s + p.length, 0);
  let kerb: Consent | undefined;
  if (openAfter > openBefore + LEN_TOL) {
    kerb = {
      id: "dropped-kerb",
      title: "Highway authority consent for a wider dropped kerb",
      needed: "yes",
      reason: `The opening onto the street widens from ${m(openBefore)} to ${m(openAfter)}. Widening the vehicle crossing (the dropped kerb across the pavement) needs the highway authority's consent, and their contractor usually builds it. Apply to the council's highways team before taking the wall down.`,
    };
    rules.push({ id: "W-opening", group, title: "Wider opening onto the street", status: "pass", reason: `The opening widens from ${m(openBefore)} to ${m(openAfter)}: no planning permission for the opening itself, but see the dropped kerb under other consents.`, ref: "Part 2 Class A" });
  }
  if (!rules.length) rules.push({ id: "W", group, title: "Walls, fences and gates", status: "na", reason: "The plot's boundaries don't change." });
  return { rules, kerb };
}

// ---------------------------------------------------------------------------
// The 45-degree guideline

/**
 * Local planning guidance, not permitted development: an extension shouldn't
 * cross a line drawn at 45 degrees from the nearest habitable-room window of
 * the neighbour, on plan. Neighbours are drawn without windows, so the
 * corner of the neighbour's front or rear wall nearest the extension stands
 * in for the window (conservative: real windows sit further in). The angle is
 * measured from that wall's line to the extension's farthest-reaching corner;
 * above 45 degrees, the extension crosses the line.
 */
function fortyFive(parts: (ExtensionPart & { cells: number[] })[], site: Site | undefined, g: Grid): PlanningRule[] {
  const group = "Neighbours (local guidance)";
  const title = "45-degree line from the neighbour's nearest window";
  const ref = "Local planning guidance";
  if (!parts.length) return [];
  if (!site) return [{ id: "N45", group, title, status: "check", reason: "There's no plot with neighbours to measure from.", ref }];
  const blocks = site.neighbours.map((n) => ({ n, b: bbox(n.polygon) }));
  let worst: { angle: number; name: string; face: "rear" | "front" } | null = null;
  for (const p of parts) {
    for (const { n, b } of blocks) {
      // Beside it, give or take: within 8 m front to back (a rear extension starts where the neighbour's house ends).
      if (Math.max(b.y0, p.z0) - Math.min(b.y1, p.z1) > 8) continue;
      const leftOf = b.x1 <= p.x0 + 0.05;
      const rightOf = b.x0 >= p.x1 - 0.05;
      if (!leftOf && !rightOf) continue;
      const gap = leftOf ? p.x0 - b.x1 : b.x0 - p.x1;
      if (gap > 10) continue;
      const cornerX = leftOf ? b.x1 : b.x0;
      // A face against another neighbour block (a conservatory against the house) has no window.
      const faceFree = (z: number, out: number) =>
        !blocks.some(({ n: o, b: ob }) => o !== n && ob.x0 < b.x1 && ob.x1 > b.x0 && Math.abs((out < 0 ? ob.y1 : ob.y0) - z) < 0.1);
      const faces: { face: "rear" | "front"; z: number; out: number }[] = [
        { face: "rear", z: b.y0, out: -1 },
        { face: "front", z: b.y1, out: 1 },
      ];
      for (const f of faces) {
        if (!faceFree(f.z, f.out)) continue;
        for (const k of p.cells) {
          const i = k % g.nx;
          const j = (k - i) / g.nx;
          const reach = f.out < 0 ? f.z - (cy(g, j) - CELL / 2) : cy(g, j) + CELL / 2 - f.z;
          if (reach <= LEN_TOL) continue;
          const lateral = Math.max(0, Math.abs(cx(g, i) - cornerX) - CELL / 2);
          const angle = (Math.atan2(reach, lateral) * 180) / Math.PI;
          if (!worst || angle > worst.angle) worst = { angle, name: n.name, face: f.face };
        }
      }
    }
  }
  if (!worst) return [{ id: "N45", group, title, status: "pass", reason: "The extension doesn't reach past the front or back of any neighbouring house beside it.", ref }];
  const crosses = worst.angle > 45;
  return [
    {
      id: "N45",
      group,
      title,
      status: crosses ? "check" : "pass",
      reason: `Seen from the nearest ${worst.face} corner of ${worst.name}, it reaches ${deg(worst.angle)} off the line of their ${worst.face} wall${crosses ? ", across the 45° line" : ", inside the 45° line"}. Measured from the corner because the model has no neighbours' windows${crosses ? ": check where their nearest window really is" : ""}.`,
      ref,
    },
  ];
}

// ---------------------------------------------------------------------------
// Party walls

function partyWall(parts: (ExtensionPart & { cells: number[] })[], site: Site | undefined, houseType: string, g: Grid): Consent | undefined {
  if (!parts.length) return undefined;
  const reasons: string[] = [];
  const near = parts.map((p) => p.boundaryDistance).filter((d): d is number => d !== undefined);
  const closest = near.length ? Math.min(...near) : undefined;
  if (closest !== undefined && closest < 0.3) reasons.push(closest < 0.05 ? "it is built right on the boundary" : `it is built ${m(closest)} from the boundary`);
  if (site) {
    let best = Infinity;
    let name = "";
    for (const n of site.neighbours) {
      for (const p of parts) {
        for (const k of p.cells) {
          const pt = { x: cx(g, k % g.nx), y: cy(g, Math.floor(k / g.nx)) };
          let d = pointInPolygon(pt, n.polygon) ? 0 : Infinity;
          for (let i = 0; i < n.polygon.length && d > 0; i++) d = Math.min(d, pointSegmentDistance(pt, n.polygon[i], n.polygon[(i + 1) % n.polygon.length]));
          d = Math.max(0, d - CELL / 2 - EXT_WALL_T / 2);
          if (d < best) {
            best = d;
            name = n.name;
          }
        }
      }
    }
    if (best <= PARTY_WALL_REACH) reasons.push(`it is ${m(best)} from ${name}, within 3 m, so digging its foundations (or underpinning) is notifiable`);
  }
  if (!reasons.length && houseType === "detached") return undefined;
  if (!reasons.length) reasons.push("the house shares a party wall; any work to it, such as cutting in beams or flashings, is notifiable");
  return {
    id: "party-wall",
    title: "Party wall notices (Party Wall etc. Act 1996)",
    needed: (closest ?? Infinity) < 0.3 ? "yes" : "likely",
    reason: `${(closest ?? Infinity) < 0.3 ? "Needed" : "Likely needed"} because ${reasons.join(", and ")}. Serve notice on the neighbours one to two months before work starts; if they don't agree, a party wall surveyor settles it.`,
  };
}
