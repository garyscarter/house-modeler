import type { Floor, HouseModel, Opening, Site, SiteSurface } from "../types";
import { byId, isElectricalItem } from "./catalogue";
import { gardenDef, itemSize } from "./gardenCatalogue";
import { areaOf, bbox, buildWalls, cutWall, modelBounds, pointInPolygon, polygonCentroid, roomWorldPolygon, toWorld, type OpeningPlacement, type V2 } from "./geometry";
import { bayOutline, frontUnit } from "./openings";
import { fixtureSolids } from "./planMath";
import { GROUND_DROP } from "./site";
import { itemFootprint, itemsOf } from "./siteItems";
import { flightAt, flightBlocks, flightL, flightS, headSpans, stairHeight, stepDepth, type Flight, type StepSpan } from "./stairs";
import { floorBulkheads } from "./bulkhead";
import { headSideSteps, stairwells, type Rect } from "./stairwell";
import { surfaceOutline } from "./surfaceCurve";
import { effectiveSlope } from "./surfaceSlope";
import { outwardSign, wallThickness } from "./walls";
import { doorKey, initiallyOpen, leafSweeps, passageOf, patioSlider, yawOf, type DoorStates, type NavDoor, type NavFlight, type NavLevel, type NavWorld } from "./walkTypes";

/**
 * Walk-through: the walkable world (docs/walkthrough-plan.md, Chunk B). Per storey, the things that stop
 * a walker (wall pieces, the closed parts of openings, door leaves, fixtures, the stairs) as boxes, and a
 * 0.1 m grid of where a walker's centre may stand; in the garden, the plot, neighbours and garden items.
 * Everything here is plan metres: x = world x, y = world z.
 */

/** Walker's radius, metres: the clearance kept from walls and furniture. */
export const WALKER_R = 0.25;
/** Highest step up a walker takes without stairs, metres (kerbs, a threshold). */
export const MAX_STEP = 0.3;
/** Highest step on or off the treads sideways, through a doorway off the flight's side (about two risers), metres. */
export const SIDE_STEP = 0.45;
/** Grid cell, metres. Fine enough that a 0.65 m door leaves a column of free cells. */
export const CELL = 0.1;
/**
 * Door frames eat this much of each side of a door's width, metres. The plan suggested 0.05; with a 0.25 m
 * walker that closes 0.65 m doors (the owner's bathroom), so frames take 0.02.
 */
const DOOR_INSET = 0.02;
/** How far out from obstacles the grid keeps a clearance figure (for choosing roomy standing spots). */
const CLR_REACH = 0.6;
/** Below this height a wall piece stops you (a window's sill wall does; a lintel doesn't). */
const PIECE_MAX_Y0 = 0.3;
/** How far beyond the flight's entry and exit edges its stand spots are. */
export const STAND_OUT = 0.35;
/** Clear height a walker needs under a flight to pass beneath it (its head boxed into a bulkhead, say), metres. */
export const UNDER_CLEAR = 1.9;

export interface BB {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** An obstacle: a box (centre, unit direction, half length, half thickness) grown by a round radius `rr`; `door` >= 0 is a door leaf that only blocks while shut. */
export interface Obs {
  cx: number;
  cy: number;
  ux: number;
  uy: number;
  hl: number;
  ht: number;
  rr: number;
  door: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Grid {
  x0: number;
  y0: number;
  nx: number;
  ny: number;
  /** 0 not walkable, 1 indoors (a room or a bay floor), 2 garden. */
  kind: Uint8Array;
  /** Room index on the level, -1 for none. */
  room: Int16Array;
  /** Inside something solid (furniture, the stairs, a stairwell, a neighbour). */
  solid: Uint8Array;
  /** Not a place for a walker's centre whatever the doors: solid, or within WALKER_R of a permanent obstacle. */
  blocked: Uint8Array;
  /** Distance to the nearest permanent obstacle, capped at CLR_REACH. */
  clr: Float32Array;
  /** Feet height. */
  h: Float32Array;
  /** Doors whose shut leaf covers the cell: count (3 = too many to track: always blocked), and the first two. */
  doorN: Uint8Array;
  doorA: Int16Array;
  doorB: Int16Array;
}

export interface LevelNav {
  level: number;
  floorId: string;
  baseY: number;
  rooms: V2[][];
  roomBB: BB[];
  /** Bay floors (outside the room polygons, walkable at this storey's height), with the room they open off. */
  bays: { poly: V2[]; bb: BB; room: number }[];
  garden: boolean;
  obs: Obs[];
  grid: Grid;
}

export interface FlightNav {
  f: Flight;
  lower: number;
  upper: number;
  lowerBase: number;
  upperBase: number;
  /** How far up the run the flight is solid on the floor below (boxed in, or hanging lower than UNDER_CLEAR); beyond, walkers there pass under it. */
  lowTo: number;
  /** Stringers while on the stairs: the flight's outline less its entry and exit edges. */
  perim: Obs[];
  /** The stairwells over it on the upper storey. */
  wells: Rect[];
  entryMid: V2;
  exitMid: V2;
  /** The walking line from the entry edge's midpoint to the exit edge's, at most 0.3 m between points. */
  line: V2[];
  /** Cost of the stair link, metres. */
  cost: number;
  footStand: V2;
  headStand: V2;
  footCell: number;
  headCell: number;
  /** Ways on and off: 0 the foot, 1 the head, then side exits through doorways off the flight's sides. */
  ends: StairEnd[];
}

/** A way on or off a flight. */
export interface StairEnd {
  /** The storey it leads to. */
  li: number;
  /** Midpoint on the flight's edge, and the point level with it on the centre line. */
  mid: V2;
  centre: V2;
  /** Where on the run it is, and for a side exit, which side (+1 right going up, -1 left) and the stretch of side it opens. */
  s: number;
  side: -1 | 0 | 1;
  s0: number;
  s1: number;
  /** How far across the flight (|l|) its edge is: the stringer, or the far edge of a flat head's steps. */
  edge: number;
  /** Door through it (index in doors), -1 for none. */
  door: number;
  stand: V2;
  cell: number;
}

export interface DoorNav {
  nd: NavDoor;
  li: number;
  /** Ends of the passable span on the wall line. */
  a: V2;
  b: V2;
  out: 1 | -1 | 0;
}

export interface GardenNav {
  boundary: V2[];
  bb: BB;
  surfaces: { s: SiteSurface; outline: V2[]; bb: BB; height: (p: V2) => number }[];
  site: Site | null;
}

export interface Stand {
  at: V2;
  yaw: number;
}

export interface WalkInternal {
  levels: LevelNav[];
  flights: FlightNav[];
  doors: DoorNav[];
  garden: GardenNav | null;
  gardenLi: number;
  houseCentre: V2;
  /** Node id offset of each level's grid in the routing graph. */
  off: number[];
  total: number;
  stands: Map<string, Stand | null>;
}

export const internalOf = (nav: NavWorld): WalkInternal | null => (nav.internal as WalkInternal | null) ?? null;

// ---------------------------------------------------------------- geometry

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const bbOf = (poly: V2[]): BB => {
  const b = bbox(poly);
  return { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 };
};
const inBB = (b: BB, p: V2, m = 0) => p.x >= b.x0 - m && p.x <= b.x1 + m && p.y >= b.y0 - m && p.y <= b.y1 + m;

export function boxObs(a: V2, b: V2, ht: number, door = -1, rr = 0): Obs {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const ux = len > 1e-9 ? dx / len : 1;
  const uy = len > 1e-9 ? dy / len : 0;
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;
  const hl = len / 2;
  const ex = Math.abs(ux) * hl + Math.abs(uy) * ht + rr;
  const ey = Math.abs(uy) * hl + Math.abs(ux) * ht + rr;
  return { cx, cy, ux, uy, hl, ht, rr, door, x0: cx - ex, y0: cy - ey, x1: cx + ex, y1: cy + ey };
}
export const circleObs = (c: V2, r: number): Obs => boxObs(c, c, 0, -1, r);

/** Outward normal of the last obsDist call. */
export const NORMAL = { x: 0, y: 0 };

/** Signed distance from a point to an obstacle (negative inside); sets NORMAL to the direction that leads out. */
export function obsDist(o: Obs, px: number, py: number): number {
  const dx = px - o.cx;
  const dy = py - o.cy;
  const u = dx * o.ux + dy * o.uy;
  const v = -dx * o.uy + dy * o.ux;
  const eu = u - clamp(u, -o.hl, o.hl);
  const ev = v - clamp(v, -o.ht, o.ht);
  const e = Math.hypot(eu, ev);
  if (e > 1e-9) {
    NORMAL.x = (eu * o.ux - ev * o.uy) / e;
    NORMAL.y = (eu * o.uy + ev * o.ux) / e;
    return e - o.rr;
  }
  const pu = o.hl - Math.abs(u);
  const pv = o.ht - Math.abs(v);
  if (pu < pv) {
    const s = u >= 0 ? 1 : -1;
    NORMAL.x = s * o.ux;
    NORMAL.y = s * o.uy;
    return -pu - o.rr;
  }
  const s = v >= 0 ? 1 : -1;
  NORMAL.x = -s * o.uy;
  NORMAL.y = s * o.ux;
  return -pv - o.rr;
}

function ptSegDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 1e-12 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}

/** Distance from the segment a–b to an obstacle (0 minus its round radius when they cross). */
export function segObsDist(o: Obs, a: V2, b: V2): number {
  const lx = (p: V2) => (p.x - o.cx) * o.ux + (p.y - o.cy) * o.uy;
  const ly = (p: V2) => -(p.x - o.cx) * o.uy + (p.y - o.cy) * o.ux;
  const au = lx(a);
  const av = ly(a);
  const bu = lx(b);
  const bv = ly(b);
  // Liang-Barsky: does the segment meet the box?
  let t0 = 0;
  let t1 = 1;
  let hit = true;
  const du = bu - au;
  const dv = bv - av;
  const tests: [number, number][] = [
    [-du, au + o.hl],
    [du, o.hl - au],
    [-dv, av + o.ht],
    [dv, o.ht - av],
  ];
  for (const [p, q] of tests) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) {
        hit = false;
        break;
      }
    } else {
      const r = q / p;
      if (p < 0) {
        if (r > t1) {
          hit = false;
          break;
        }
        if (r > t0) t0 = r;
      } else {
        if (r < t0) {
          hit = false;
          break;
        }
        if (r < t1) t1 = r;
      }
    }
  }
  if (hit) return -o.rr;
  const rectD = (u: number, v: number) => Math.hypot(Math.max(Math.abs(u) - o.hl, 0), Math.max(Math.abs(v) - o.ht, 0));
  let d = Math.min(rectD(au, av), rectD(bu, bv));
  for (const cu of [-o.hl, o.hl]) for (const cv of [-o.ht, o.ht]) d = Math.min(d, ptSegDist(cu, cv, au, av, bu, bv));
  return d - o.rr;
}

/** Proper crossing of segments p–q and a–b: the parameter along p–q, or null. */
export function crossAt(p: V2, q: V2, a: V2, b: V2): number | null {
  const rx = q.x - p.x;
  const ry = q.y - p.y;
  const sx = b.x - a.x;
  const sy = b.y - a.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((a.x - p.x) * sy - (a.y - p.y) * sx) / den;
  const u = ((a.x - p.x) * ry - (a.y - p.y) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

// ---------------------------------------------------------------- grid

function makeGrid(b: BB): Grid {
  const x0 = Math.floor(b.x0 / CELL) * CELL;
  const y0 = Math.floor(b.y0 / CELL) * CELL;
  const nx = Math.max(1, Math.ceil((b.x1 - x0) / CELL));
  const ny = Math.max(1, Math.ceil((b.y1 - y0) / CELL));
  const n = nx * ny;
  return {
    x0, y0, nx, ny,
    kind: new Uint8Array(n),
    room: new Int16Array(n).fill(-1),
    solid: new Uint8Array(n),
    blocked: new Uint8Array(n),
    clr: new Float32Array(n).fill(CLR_REACH),
    h: new Float32Array(n),
    doorN: new Uint8Array(n),
    doorA: new Int16Array(n).fill(-1),
    doorB: new Int16Array(n).fill(-1),
  };
}

export const cellX = (g: Grid, i: number) => g.x0 + ((i % g.nx) + 0.5) * CELL;
export const cellY = (g: Grid, i: number) => g.y0 + (Math.floor(i / g.nx) + 0.5) * CELL;
export const cellPt = (g: Grid, i: number): V2 => ({ x: cellX(g, i), y: cellY(g, i) });

export function cellAt(g: Grid, x: number, y: number): number {
  const ix = Math.floor((x - g.x0) / CELL);
  const iy = Math.floor((y - g.y0) / CELL);
  return ix < 0 || iy < 0 || ix >= g.nx || iy >= g.ny ? -1 : iy * g.nx + ix;
}

function forCells(g: Grid, x0: number, y0: number, x1: number, y1: number, fn: (i: number, x: number, y: number) => void) {
  const ix0 = Math.max(0, Math.floor((x0 - g.x0) / CELL));
  const iy0 = Math.max(0, Math.floor((y0 - g.y0) / CELL));
  const ix1 = Math.min(g.nx - 1, Math.floor((x1 - g.x0) / CELL));
  const iy1 = Math.min(g.ny - 1, Math.floor((y1 - g.y0) / CELL));
  for (let iy = iy0; iy <= iy1; iy++) {
    const y = g.y0 + (iy + 0.5) * CELL;
    for (let ix = ix0; ix <= ix1; ix++) fn(iy * g.nx + ix, g.x0 + (ix + 0.5) * CELL, y);
  }
}

function fillPoly(g: Grid, poly: V2[], fn: (i: number, x: number, y: number) => void) {
  if (poly.length < 3) return;
  const b = bbOf(poly);
  const p = { x: 0, y: 0 };
  forCells(g, b.x0, b.y0, b.x1, b.y1, (i, x, y) => {
    p.x = x;
    p.y = y;
    if (pointInPolygon(p, poly)) fn(i, x, y);
  });
}

/** Whether a door is open: its state in `doors`, else how it started. */
export const doorIsOpen = (I: WalkInternal, d: number, doors: DoorStates) => doors[I.doors[d].nd.key] ?? I.doors[d].nd.initial;

/** A cell a walker's centre may use, given which doors are open. */
export function passable(g: Grid, i: number, open: (d: number) => boolean): boolean {
  if (i < 0 || !g.kind[i] || g.blocked[i]) return false;
  const n = g.doorN[i];
  if (!n) return true;
  if (n > 2) return false;
  return open(g.doorA[i]) && (n < 2 || open(g.doorB[i]));
}
export const ALL_OPEN = () => true;
export const NONE_OPEN = () => false;

/** The passable cell nearest p within `reach` metres, or -1. */
export function nearestCell(g: Grid, p: V2, reach: number, ok: (i: number) => boolean): number {
  let best = -1;
  let bd = Infinity;
  forCells(g, p.x - reach, p.y - reach, p.x + reach, p.y + reach, (i, x, y) => {
    const d = Math.hypot(x - p.x, y - p.y);
    if (d <= reach && d < bd && ok(i)) {
      bd = d;
      best = i;
    }
  });
  return best;
}

// ---------------------------------------------------------------- queries

/** Index of a storey in nav.levels: an exact match, else the nearest. */
export function levelIndex(I: WalkInternal, level: number): number {
  let best = 0;
  for (let i = 0; i < I.levels.length; i++) if (Math.abs(I.levels[i].level - level) < Math.abs(I.levels[best].level - level)) best = i;
  return best;
}

/** A surface's height function (lib/surfaceSlope slopeHeight, with its extent worked out once). */
function slopeFn(surface: SiteSurface): (p: V2) => number {
  const sl = effectiveSlope(surface.slope);
  if (!sl) return () => 0;
  const base = sl.base ?? 0;
  if (surface.polygon.length < 3 || sl.rise === 0) return () => base;
  const d = { back: { x: 0, y: -1 }, front: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }[sl.toward];
  const b = bbox(surface.polygon);
  const proj = [b.x0 * d.x + b.y0 * d.y, b.x1 * d.x + b.y0 * d.y, b.x1 * d.x + b.y1 * d.y, b.x0 * d.x + b.y1 * d.y];
  const lo = Math.min(...proj);
  const hi = Math.max(...proj);
  if (hi - lo < 1e-9) return () => base;
  return (p) => base + sl.rise * clamp((p.x * d.x + p.y * d.y - lo) / (hi - lo), 0, 1);
}

/** Height of the garden at p (as lib/siteItems groundHeightAt, with the outlines worked out once). */
export function groundAt(G: GardenNav, p: V2): number {
  let h = 0;
  for (const s of G.surfaces) {
    if (!inBB(s.bb, p) || !pointInPolygon(p, s.outline)) continue;
    h = Math.max(h, s.height(p));
  }
  return h;
}

/** The room (index) or bay floor at p on a level, -1 for none. */
export function roomIndexAt(L: LevelNav, p: V2): number {
  for (let r = 0; r < L.rooms.length; r++) if (inBB(L.roomBB[r], p) && pointInPolygon(p, L.rooms[r])) return r;
  return -1;
}
function inBay(L: LevelNav, p: V2): boolean {
  return L.bays.some((b) => inBB(b.bb, p) && pointInPolygon(p, b.poly));
}
/** Inside the plot and not in the house: the garden. */
export function inGarden(I: WalkInternal, li: number, p: V2): boolean {
  const L = I.levels[li];
  const G = I.garden;
  return !!G && L.garden && inBB(G.bb, p) && pointInPolygon(p, G.boundary) && roomIndexAt(L, p) < 0 && !inBay(L, p);
}

/** Feet height standing at p on a storey (not on the stairs): its floor in a room, the ground in the garden; null where nobody can stand. */
export function floorAt(I: WalkInternal, li: number, p: V2): number | null {
  const L = I.levels[li];
  if (roomIndexAt(L, p) >= 0 || inBay(L, p)) return L.baseY;
  if (inGarden(I, li, p)) return -GROUND_DROP + groundAt(I.garden!, p);
  return null;
}

/** Plan point to the flight's (s, l). */
export const flightSL = (F: FlightNav, p: V2) => ({ s: flightS(F.f, p.x, p.y), l: flightL(F.f, p.x, p.y) });
/** On the flight's treads (and, with `steps`, on a flat head's steps beside its square, which are up at the floor above). */
export function insideFlight(F: FlightNav, p: V2, steps = false): boolean {
  const { s, l } = flightSL(F, p);
  const hw = F.f.width / 2;
  if (s > 0 && s < F.f.run && Math.abs(l) < hw) return true;
  if (!steps) return false;
  const reach = hw + stepDepth(F.f);
  return reach > hw && Math.abs(l) < reach && headSpans(F.f).some((sp) => sp.side === Math.sign(l) && s > sp.s0 && s < sp.s1);
}
export function insideWell(F: FlightNav, p: V2): boolean {
  return F.wells.some((r) => p.x > r.x0 && p.x < r.x1 && p.y > r.y0 && p.y < r.y1) && insideFlight(F, p, true);
}
/** The span a flat head steps off onto the landing from (on the side it turns to), if it has one. */
const headSpan = (f: Flight): StepSpan | undefined => headSpans(f).find((sp) => sp.side === f.topTurn);
/** Where on the stairs: feet height and the storey (the lower one until past half way up). */
export function stairState(I: WalkInternal, fi: number, p: V2): { feetY: number; li: number } {
  const F = I.flights[fi];
  const { s, l } = flightSL(F, p);
  const h = stairHeight(F.f, s, l);
  return { feetY: F.lowerBase + h, li: h > F.f.rise / 2 ? F.upper : F.lower };
}
/** Which way a point beyond the flight's outline left it: through the entry edge, the exit edge, or neither. */
export function leftBy(F: FlightNav, p: V2): "entry" | "exit" | null {
  const { s, l } = flightSL(F, p);
  const { run, width: w, turn } = F.f;
  const top = F.f.topTurn ?? 0;
  const sp = headSpan(F.f);
  const entry = turn ? l * turn >= w / 2 && s >= -0.05 && s <= w + 0.05 : s <= 0 && Math.abs(l) <= w / 2 + 0.05;
  const exit = sp
    ? l * top >= w / 2 + stepDepth(F.f) - 1e-6 && s >= sp.s0 - 0.05 && s <= sp.s1 + 0.05
    : top
      ? l * top >= w / 2 && s >= run - w - 0.05 && s <= run + 0.05
      : s >= run && Math.abs(l) <= w / 2 + 0.05;
  if (entry && exit) return s < run / 2 ? "entry" : "exit";
  return entry ? "entry" : exit ? "exit" : null;
}

/** The side exit (index in ends) a point beyond the flight's side is at, or -1. */
export function sideAt(F: FlightNav, p: V2): number {
  const { s, l } = flightSL(F, p);
  for (let k = 2; k < F.ends.length; k++) {
    const e = F.ends[k];
    if (e.side * l >= e.edge - 1e-6 && s >= e.s0 - 0.05 && s <= e.s1 + 0.05) return k;
  }
  return -1;
}

export const pathLength = (pts: V2[]) => pts.reduce((t, p, i) => t + (i ? Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0), 0);

/** The walking line between two ends of a flight: edge midpoint, along the centre line, edge midpoint; points at most 0.3 m apart. */
export function stairPath(F: FlightNav, a: number, b: number): V2[] {
  const A = F.ends[a];
  const B = F.ends[b];
  const pts: V2[] = [A.mid];
  for (const p of [A.centre, B.centre, B.mid]) {
    const q = pts[pts.length - 1];
    if (Math.hypot(p.x - q.x, p.y - q.y) > 1e-6) pts.push(p);
  }
  return densify(pts, 0.3);
}

/** How deep a walker at p sits inside the obstacles (0 when clear). */
export function penetration(obs: Obs[], x: number, y: number, open: (d: number) => boolean): number {
  let pen = 0;
  for (const o of obs) {
    if (x < o.x0 - WALKER_R || x > o.x1 + WALKER_R || y < o.y0 - WALKER_R || y > o.y1 + WALKER_R) continue;
    if (o.door >= 0 && open(o.door)) continue;
    const d = obsDist(o, x, y);
    if (WALKER_R - d > pen) pen = WALKER_R - d;
  }
  return pen;
}

/** Whether a walker may stand at p on a storey with these doors. */
export function standable(I: WalkInternal, li: number, p: V2, open: (d: number) => boolean): boolean {
  const L = I.levels[li];
  const c = cellAt(L.grid, p.x, p.y);
  if (c < 0 || L.grid.solid[c] || floorAt(I, li, p) === null) return false;
  return penetration(L.obs, p.x, p.y, open) <= 1e-3;
}

/** A free spot on a storey near p, within `reach`: p itself when free, else the nearest free cell centre; null if none. */
export function snapFree(I: WalkInternal, li: number, p: V2, reach: number, open: (d: number) => boolean): V2 | null {
  if (standable(I, li, p, open)) return { x: p.x, y: p.y };
  const g = I.levels[li].grid;
  const c = nearestCell(g, p, reach, (i) => passable(g, i, open));
  return c < 0 ? null : cellPt(g, c);
}

/** The longest free sight line from p on a storey, as a yaw. */
function longestView(I: WalkInternal, li: number, p: V2): number {
  const g = I.levels[li].grid;
  let best = 0;
  let bestLen = -1;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let t = 0;
    while (t < 12) {
      const c = cellAt(g, p.x + dx * (t + CELL), p.y + dy * (t + CELL));
      if (c < 0 || !g.kind[c] || g.blocked[c]) break;
      t += CELL;
    }
    if (t > bestLen) {
      bestLen = t;
      best = yawOf({ x: dx, y: dy });
    }
  }
  return best;
}

/** Which way to face standing at `at` in a room with this centroid: at the centroid, or along the longest view when standing on it. */
export function facing(I: WalkInternal, li: number, at: V2, centre: V2): number {
  const d = { x: centre.x - at.x, y: centre.y - at.y };
  return Math.hypot(d.x, d.y) > 0.3 ? yawOf(d) : longestView(I, li, at);
}

/** Where to stand in a room: the free cell nearest its centroid, favouring room to move; null when the room has no free cell. */
export function roomStand(I: WalkInternal, li: number, ri: number): Stand | null {
  const key = `${li}:${ri}`;
  if (I.stands.has(key)) return I.stands.get(key)!;
  const L = I.levels[li];
  const g = L.grid;
  const cen = polygonCentroid(L.rooms[ri]);
  let best = -1;
  let bs = Infinity;
  const b = L.roomBB[ri];
  forCells(g, b.x0, b.y0, b.x1, b.y1, (i, x, y) => {
    if (g.room[i] !== ri || !g.kind[i] || g.blocked[i] || g.doorN[i]) return;
    const sc = Math.hypot(x - cen.x, y - cen.y) - 0.3 * Math.min(g.clr[i], 0.6);
    if (sc < bs) {
      bs = sc;
      best = i;
    }
  });
  const out = best < 0 ? null : { at: cellPt(g, best), yaw: facing(I, li, cellPt(g, best), cen) };
  I.stands.set(key, out);
  return out;
}

// ---------------------------------------------------------------- build

/** A door's passable span along its wall, metres from the opening's centre. */
function doorSpan(op: Opening, w: number): [number, number] {
  if (op.kind === "front") return frontUnit(op, w).door;
  if (op.kind === "patio") return patioSlider(w, op.flipHinge).span;
  return [-w / 2 + DOOR_INSET, w / 2 - DOOR_INSET];
}

const along = (pl: { centre: V2; dir: V2 }, x: number, z = 0): V2 => ({
  x: pl.centre.x + pl.dir.x * x - pl.dir.y * z,
  y: pl.centre.y + pl.dir.y * x + pl.dir.x * z,
});

/** Width of a convex outline: the least, over its edges, of the farthest corner from that edge's line. */
function polyWidth(poly: V2[]): number {
  let w = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-9) continue;
    let far = 0;
    for (const p of poly) far = Math.max(far, Math.abs(((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / len));
    w = Math.min(w, far);
  }
  return w;
}

function edgesOf(poly: V2[], closed = true): Obs[] {
  const out: Obs[] = [];
  const n = closed ? poly.length : poly.length - 1;
  for (let i = 0; i < n; i++) out.push(boxObs(poly[i], poly[(i + 1) % poly.length], 0));
  return out;
}

/** An interval [a, b] less the intervals in `cut`. */
function subtract(a: number, b: number, cut: [number, number][]): [number, number][] {
  let parts: [number, number][] = [[a, b]];
  for (const [c0, c1] of cut) {
    parts = parts.flatMap(([p0, p1]): [number, number][] => {
      if (c1 <= p0 || c0 >= p1) return [[p0, p1]];
      const r: [number, number][] = [];
      if (c0 > p0) r.push([p0, c0]);
      if (c1 < p1) r.push([c1, p1]);
      return r;
    });
  }
  return parts.filter(([p0, p1]) => p1 - p0 > 1e-3);
}

interface FloorBits {
  rooms: V2[][];
  bays: { poly: V2[]; room: number }[];
  obs: Obs[];
  solids: V2[][];
}

function floorBits(model: HouseModel, floor: Floor, li: number, doors: DoorNav[], doorsOpen: boolean): FloorBits {
  const rooms = floor.rooms.map((r) => roomWorldPolygon(floor, r));
  const obs: Obs[] = [];
  const solids: V2[][] = [];
  const bays: FloorBits["bays"] = [];
  const box = (pl: OpeningPlacement, x0: number, x1: number, ht: number, door = -1) => {
    if (x1 - x0 > 1e-3) obs.push(boxObs(along(pl, x0), along(pl, x1), ht, door));
  };
  for (const w of buildWalls(floor)) {
    const T = wallThickness(w);
    const { pieces, placements } = cutWall(w, model.ceilingHeight);
    for (const pc of pieces) if (pc.y0 < PIECE_MAX_Y0) obs.push(boxObs(pc.a, pc.b, T / 2));
    for (const pl of placements) {
      const op = pl.opening;
      const pass = passageOf(op.kind);
      const hw = pl.width / 2;
      const out = outwardSign(pl, rooms);
      const nd = (span: [number, number]): NavDoor => ({
        key: doorKey(floor.id, op.id), floorId: floor.id, openingId: op.id, level: floor.level, kind: op.kind, passage: pass,
        initial: initiallyOpen(op, doorsOpen), centre: pl.centre, dir: pl.dir, width: pl.width, span, sweeps: pass === "door" ? leafSweeps(op, pl.centre, pl.dir, pl.width, out) : [],
      });
      if (pass === "open") {
        doors.push({ nd: nd([-hw, hw]), li, a: along(pl, -hw), b: along(pl, hw), out });
        continue;
      }
      if (pass === "door") {
        const span = doorSpan(op, pl.width);
        const s0 = clamp(span[0], -hw, hw);
        const s1 = clamp(span[1], -hw, hw);
        const di = doors.length;
        doors.push({ nd: nd([s0, s1]), li, a: along(pl, s0), b: along(pl, s1), out });
        box(pl, -hw, s0, T / 2);
        box(pl, s1, hw, T / 2);
        box(pl, s0, s1, T / 2, di);
        continue;
      }
      if (op.kind === "bay" && out !== 0) {
        // The bay's walls block; its floor is part of the room.
        const pts = bayOutline(pl.width, T, op.depth).map((p) => along(pl, p.x, p.z * out));
        for (let i = 1; i < pts.length; i++) obs.push(boxObs(pts[i - 1], pts[i], 0.05));
        const poly = [along(pl, -hw), ...pts, along(pl, hw)];
        const inner = along(pl, 0, -out * 0.3);
        bays.push({ poly, room: rooms.findIndex((r) => pointInPolygon(inner, r)) });
        continue;
      }
      // Windows, internal bays, garages: the whole opening.
      box(pl, -hw, hw, T / 2);
    }
  }
  // Furniture between 0.15 m and 1 m off the floor, lights and electrical points apart.
  const fixtures = floor.fixtures ?? [];
  const typeOf = new Map(fixtures.map((f) => [f.id, f.type]));
  for (const s of fixtureSolids(fixtures, floor.pxPerM, byId)) {
    if (!(s.z0 < 1.0 && s.z1 > 0.15)) continue;
    const item = byId(typeOf.get(s.id) ?? "");
    if (!item || isElectricalItem(item)) continue;
    const poly = s.corners.map((p) => toWorld(floor, p));
    if (poly.length < 3 || polyWidth(poly) < 0.05) continue;
    obs.push(...edgesOf(poly));
    solids.push(poly);
  }
  return { rooms, bays, obs, solids };
}

function gardenBits(G: GardenNav): { obs: Obs[]; solids: V2[][] } {
  const obs: Obs[] = edgesOf(G.boundary);
  const solids: V2[][] = [];
  const site = G.site;
  if (!site) return { obs, solids };
  for (const n of site.neighbours) {
    if (n.polygon.length < 3) continue;
    obs.push(...edgesOf(n.polygon));
    solids.push(n.polygon);
  }
  for (const item of itemsOf(site)) {
    const def = gardenDef(item.type);
    if (!def) continue;
    const { w, d, h } = itemSize(item);
    const base = item.mount ?? def.mount ?? 0;
    const poly = () => {
      const p = itemFootprint(item);
      obs.push(...edgesOf(p));
      solids.push(p);
    };
    if (def.kind === "path") continue;
    if (def.kind === "light") {
      if (def.shape === "bollard") obs.push(circleObs(item, 0.05));
      continue;
    }
    if (def.shape === "parasol" || def.shape === "washing-line") {
      obs.push(circleObs(item, 0.04));
      continue;
    }
    if (def.shape === "pergola") {
      const a = (item.rot * Math.PI) / 180;
      const c = Math.cos(a);
      const s = Math.sin(a);
      for (const sx of [-1, 1])
        for (const sy of [-1, 1]) {
          const x = sx * (w / 2 - 0.15);
          const y = sy * (d / 2 - 0.15);
          obs.push(circleObs({ x: item.x + x * c - y * s, y: item.y + x * s + y * c }, 0.04));
        }
      continue;
    }
    if (def.kind === "plant") {
      if (def.run) poly();
      else if (h >= 0.3) obs.push(circleObs(item, clamp(w / 4, 0.15, 0.5)));
      continue;
    }
    if (h >= 0.1 && base < 1.0) poly();
  }
  return { obs, solids };
}

function rectPoly(F: Flight, upTo = F.run): V2[] {
  const hw = F.width / 2;
  return [flightAt(F, 0, -hw), flightAt(F, upTo, -hw), flightAt(F, upTo, hw), flightAt(F, 0, hw)];
}

/**
 * How far up a flight it is in the way on the floor below: to the far end of the last of its blocks (treads,
 * soffits, boxing; see flightBlocks) whose underside is lower than UNDER_CLEAR. A head that runs on over a wall
 * into the next room, boxed into a bulkhead there, leaves that room's floor free under it.
 */
function lowRun(model: HouseModel, floor: Floor, f: Flight): number {
  const { body, carpet } = flightBlocks(floor, f, floorBulkheads(floor, model.ceilingHeight));
  let s = 0;
  for (const b of [...body, ...carpet]) {
    if (b.y0 >= UNDER_CLEAR) continue;
    // A flat head's steps out beside the flight hang over no more than a wall's width of floor: not in the way.
    const c = polygonCentroid(b.pts);
    if (Math.abs(flightL(f, c.x, c.y)) > f.width / 2) continue;
    for (const p of b.pts) s = Math.max(s, flightS(f, p.x, p.y));
  }
  return Math.min(f.run, s);
}

type Edge = { s0: number; l0: number; s1: number; l1: number };
/** The flight's outline as four (s, l) edges, less its entry edge and/or exit edge. */
type SideCut = { side: number; s0: number; s1: number; edge?: number };
/**
 * With `steps` (on the stairs, where the exit is open), a flat head's square opens onto its steps, whose ends
 * bound them and whose far edges are the ways off (the head's exit, and side exits on the far side).
 */
function flightEdges(F: Flight, noEntry: boolean, noExit: boolean, sides: SideCut[] = [], steps = false, upTo = F.run): Edge[] {
  const { width: w, turn } = F;
  // Short of the head (the floor below, where walkers pass under the rest), the far edge is where it stops.
  const run = Math.min(F.run, upTo);
  const hw = w / 2;
  const top = F.topTurn ?? 0;
  const spans = steps ? headSpans(F) : [];
  const reach = hw + stepDepth(F);
  const out: Edge[] = [];
  const side = (l: number) => {
    const cut: [number, number][] = [];
    if (noEntry && turn && Math.sign(l) === turn) cut.push([0, w]);
    if (noExit && top && Math.sign(l) === top && !headSpans(F).length) cut.push([F.run - w, F.run]);
    for (const c of sides) if (c.side === Math.sign(l) && (c.edge ?? hw) <= hw + 1e-6) cut.push([c.s0, c.s1]);
    for (const sp of spans) if (sp.side === Math.sign(l)) cut.push([sp.s0, sp.s1]);
    for (const [a, b] of subtract(0, run, cut)) out.push({ s0: a, l0: l, s1: b, l1: l });
  };
  side(-hw);
  side(hw);
  for (const sp of reach > hw ? spans : []) {
    out.push({ s0: sp.s0, l0: sp.side * hw, s1: sp.s0, l1: sp.side * reach }, { s0: sp.s1, l0: sp.side * hw, s1: sp.s1, l1: sp.side * reach });
  }
  if (!(noEntry && !turn)) out.push({ s0: 0, l0: -hw, s1: 0, l1: hw });
  if (!(noExit && !top) || run < F.run) out.push({ s0: run, l0: -hw, s1: run, l1: hw });
  return out;
}
const edgeObs = (F: Flight, e: Edge) => boxObs(flightAt(F, e.s0, e.l0), flightAt(F, e.s1, e.l1), 0);

/** A well's edges, less where they lie along the flight's exit edge. */
function wellObs(F: Flight, r: Rect, sides: SideCut[] = []): Obs[] {
  const corners = [
    { x: r.x0, y: r.y0 },
    { x: r.x1, y: r.y0 },
    { x: r.x1, y: r.y1 },
    { x: r.x0, y: r.y1 },
  ];
  const { run, width: w } = F;
  const top = F.topTurn ?? 0;
  const sp = headSpan(F);
  // The way off the head: a flat head's steps' far edge, or the side a winding head turns to. Between a flat
  // head's square and its steps (on either side) the well is open too.
  const exit: SideCut[] = sp ? [{ side: top, s0: sp.s0, s1: sp.s1, edge: w / 2 + stepDepth(F) }] : top ? [{ side: top, s0: run - w, s1: run }] : [];
  if (stepDepth(F) > 0) exit.push(...headSpans(F).map((x) => ({ side: x.side, s0: x.s0, s1: x.s1, edge: w / 2 })));
  const out: Obs[] = [];
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    const sa = flightS(F, a.x, a.y);
    const la = flightL(F, a.x, a.y);
    const sb = flightS(F, b.x, b.y);
    const lb = flightL(F, b.x, b.y);
    // Parameter t along a-b where the edge's s (or l) reaches the given value.
    const cut: [number, number][] = [];
    for (const c of [...exit, ...sides]) {
      const at = c.side * (c.edge ?? w / 2);
      if (Math.abs(la - at) < 0.03 && Math.abs(lb - at) < 0.03 && Math.abs(sb - sa) > 1e-6) {
        const t0 = (c.s0 - sa) / (sb - sa);
        const t1 = (c.s1 - sa) / (sb - sa);
        cut.push([Math.min(t0, t1), Math.max(t0, t1)]);
      }
    }
    if (!top && Math.abs(sa - run) < 0.03 && Math.abs(sb - run) < 0.03 && Math.abs(lb - la) > 1e-6) {
      const t0 = (-w / 2 - la) / (lb - la);
      const t1 = (w / 2 - la) / (lb - la);
      cut.push([Math.min(t0, t1), Math.max(t0, t1)]);
    }
    for (const [t0, t1] of subtract(0, 1, cut))
      out.push(boxObs({ x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0 }, { x: a.x + (b.x - a.x) * t1, y: a.y + (b.y - a.y) * t1 }, 0));
  }
  return out;
}

/** Points at most `step` apart along a polyline (its first point included). */
function densify(pts: V2[], step: number): V2[] {
  const out: V2[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let k = 1; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return out;
}

export function buildNav(model: HouseModel, site: Site | undefined, doorsOpen: boolean): NavWorld {
  const floors = [...model.floors].sort((a, b) => a.level - b.level);
  const storey = model.ceilingHeight + model.slabThickness;
  const gi = floors.findIndex((f) => f.level === 0);
  const gardenLi = gi >= 0 ? gi : 0;
  const doors: DoorNav[] = [];

  // The garden: the plot, or a box 4 m round the house.
  const mb = modelBounds(model.floors);
  const boundary: V2[] = site?.boundary?.length
    ? site.boundary.map((p) => ({ x: p.x, y: p.y }))
    : [
        { x: mb.x0 - 4, y: mb.y0 - 4 },
        { x: mb.x1 + 4, y: mb.y0 - 4 },
        { x: mb.x1 + 4, y: mb.y1 + 4 },
        { x: mb.x0 - 4, y: mb.y1 + 4 },
      ];
  const garden: GardenNav | null = floors.length
    ? {
        boundary,
        bb: bbOf(boundary),
        site: site ?? null,
        surfaces: (site?.surfaces ?? []).filter((s) => s.polygon.length >= 3).map((s) => {
          const outline = surfaceOutline(s, site!.surfaces);
          return { s, outline, bb: bbOf(outline), height: slopeFn(s) };
        }),
      }
    : null;

  const bits = floors.map((f, li) => floorBits(model, f, li, doors, doorsOpen));
  const levels: LevelNav[] = floors.map((f, li) => {
    const b = bits[li];
    const pts = [...b.rooms.flat(), ...b.bays.flatMap((x) => x.poly)];
    let bb: BB = pts.length ? bbOf(pts) : { x0: -5, y0: -5, x1: 5, y1: 5 };
    if (li === gardenLi && garden) bb = { x0: Math.min(bb.x0, garden.bb.x0), y0: Math.min(bb.y0, garden.bb.y0), x1: Math.max(bb.x1, garden.bb.x1), y1: Math.max(bb.y1, garden.bb.y1) };
    bb = { x0: bb.x0 - 0.5, y0: bb.y0 - 0.5, x1: bb.x1 + 0.5, y1: bb.y1 + 0.5 };
    return {
      level: f.level,
      floorId: f.id,
      baseY: f.level * storey,
      rooms: b.rooms,
      roomBB: b.rooms.map(bbOf),
      bays: b.bays.map((x) => ({ ...x, bb: bbOf(x.poly) })),
      garden: li === gardenLi && !!garden,
      obs: b.obs,
      grid: makeGrid(bb),
    };
  });
  const solids: V2[][][] = bits.map((b) => [...b.solids]);
  if (garden && levels.length) {
    const gb = gardenBits(garden);
    levels[gardenLi].obs.push(...gb.obs);
    solids[gardenLi].push(...gb.solids);
  }

  // Stairs.
  const liOf = (id: string) => floors.findIndex((f) => f.id === id);
  const flights: FlightNav[] = [];
  for (const well of stairwells(model)) {
    const f = well.flight;
    const lower = liOf(f.lowerId);
    const upper = liOf(f.upperId);
    if (lower < 0 || upper < 0) continue;
    const { run, width: w, turn } = f;
    const top = f.topTurn ?? 0;
    const hw = w / 2;
    const lowerBase = levels[lower].baseY;
    // Side exits: doorways in a wall along the flight's side, and a turned head's far side where it steps up onto
    // more landing (no rail there), where the treads are within SIDE_STEP of that floor.
    const sides: StairEnd[] = [];
    const sideExit = (li: number, side: -1 | 1, sa: number, sb: number, door: number) => {
      const cut: [number, number][] = [];
      if (turn === side) cut.push([0, w]);
      if (top === side) cut.push([run - w, run]);
      for (const [p0, p1] of subtract(Math.max(0, Math.min(sa, sb)), Math.min(run, Math.max(sa, sb)), cut)) {
        // The longest stretch where the treads at the side are within SIDE_STEP of the floor.
        let best: [number, number] | null = null;
        let from = -1;
        const n = Math.max(1, Math.ceil((p1 - p0) / 0.02));
        for (let k = 0; k <= n + 1; k++) {
          const sk = p0 + ((p1 - p0) * k) / n;
          const ok = k <= n && Math.abs(lowerBase + stairHeight(f, sk, side * hw) - levels[li].baseY) <= SIDE_STEP;
          if (ok && from < 0) from = sk;
          if (!ok && from >= 0) {
            const end = p0 + ((p1 - p0) * (k - 1)) / n;
            if (!best || end - from > best[1] - best[0]) best = [from, end];
            from = -1;
          }
        }
        if (!best || best[1] - best[0] < 0.2) continue;
        const sm = (best[0] + best[1]) / 2;
        // Upstairs it must open off the well (elsewhere the upper floor covers the treads).
        const inner = flightAt(f, sm, side * (hw - 0.1));
        if (li === upper && !well.rects.some((r) => inner.x > r.x0 && inner.x < r.x1 && inner.y > r.y0 && inner.y < r.y1)) continue;
        sides.push({
          li, s: sm, side, s0: best[0], s1: best[1], door, edge: hw,
          mid: flightAt(f, sm, side * hw), centre: flightAt(f, sm, 0), stand: flightAt(f, sm, side * (hw + STAND_OUT)), cell: -1,
        });
      }
    };
    for (const li of [lower, upper]) {
      doors.forEach((d, di) => {
        if (d.li !== li || d.nd.passage === "shut") return;
        const sa = flightS(f, d.a.x, d.a.y);
        const la = flightL(f, d.a.x, d.a.y);
        const sb = flightS(f, d.b.x, d.b.y);
        const lb = flightL(f, d.b.x, d.b.y);
        const side = Math.sign(la) as -1 | 1;
        if (!side || Math.sign(lb) !== side || Math.abs(la - lb) > 0.05 || side * la < hw - 0.05 || side * la > hw + 0.3) return;
        sideExit(li, side, sa, sb, d.nd.passage === "door" ? di : -1);
      });
    }
    for (const st of headSideSteps(model, well)) sideExit(upper, st.side, st.s0, st.s1, -1);
    // A flat head's steps up on its far side, onto a landing carried on past it.
    const reach = hw + stepDepth(f);
    for (const sp of headSpans(f).filter((x) => x.side !== top)) {
      const sm = (sp.s0 + sp.s1) / 2;
      sides.push({
        li: upper, s: sm, side: sp.side, s0: sp.s0, s1: sp.s1, door: -1, edge: reach,
        mid: flightAt(f, sm, sp.side * reach), centre: flightAt(f, sm, 0), stand: flightAt(f, sm, sp.side * (reach + STAND_OUT)), cell: -1,
      });
    }
    const cutsOn = (li: number) => sides.filter((e) => e.li === li);
    // Below, the flight is in the way only as far as it is low; walkers pass under the rest.
    const lowTo = lowRun(model, floors[lower], f);
    levels[lower].obs.push(...flightEdges(f, true, false, cutsOn(lower).filter((e) => e.edge <= hw + 1e-6), false, lowTo).map((e) => edgeObs(f, e)));
    solids[lower].push(rectPoly(f, lowTo));
    for (const r of well.rects) {
      levels[upper].obs.push(...wellObs(f, r, cutsOn(upper)));
      solids[upper].push([
        { x: r.x0, y: r.y0 },
        { x: r.x1, y: r.y0 },
        { x: r.x1, y: r.y1 },
        { x: r.x0, y: r.y1 },
      ]);
    }
    const entryMid = turn ? flightAt(f, hw, turn * hw) : flightAt(f, 0, 0);
    // A turned head is left from the middle of its side, or of its steps' far edge.
    const head = headSpan(f);
    const hs = head ? (head.s0 + head.s1) / 2 : run - hw;
    const he = head ? reach : hw;
    const exitMid = top ? flightAt(f, hs, top * he) : flightAt(f, run, 0);
    const footStand = turn ? flightAt(f, hw, turn * (hw + STAND_OUT)) : flightAt(f, -STAND_OUT, 0);
    const headStand = top ? flightAt(f, hs, top * (he + STAND_OUT)) : flightAt(f, run + STAND_OUT, 0);
    const ends: StairEnd[] = [
      { li: lower, mid: entryMid, centre: turn ? flightAt(f, hw, 0) : entryMid, s: turn ? hw : 0, side: 0, s0: 0, s1: 0, door: -1, edge: hw, stand: footStand, cell: -1 },
      { li: upper, mid: exitMid, centre: top ? flightAt(f, hs, 0) : exitMid, s: top ? hs : run, side: 0, s0: run, s1: run, door: -1, edge: he, stand: headStand, cell: -1 },
      ...sides,
    ];
    // On the treads, the stringers block, and a side exit's door while it is shut.
    const leaves = sides.filter((e) => e.door >= 0).flatMap((e) => levels[e.li].obs.filter((o) => o.door === e.door));
    const F: FlightNav = {
      f, lower, upper, lowerBase, lowTo,
      upperBase: levels[upper].baseY,
      perim: [...flightEdges(f, true, true, sides, true).map((e) => edgeObs(f, e)), ...leaves],
      wells: well.rects,
      entryMid, exitMid, line: [], cost: 0,
      footStand, headStand, footCell: -1, headCell: -1, ends,
    };
    F.line = stairPath(F, 0, 1);
    F.cost = pathLength(F.line) + 2 * STAND_OUT + 0.5;
    flights.push(F);
  }

  const lowest = levels.length ? polygonCentroidOfRooms(levels[gardenLi].rooms) : { x: 0, y: 0 };
  const I: WalkInternal = { levels, flights, doors, garden, gardenLi, houseCentre: lowest, off: [], total: 0, stands: new Map() };

  // Grids.
  levels.forEach((L, li) => {
    const g = L.grid;
    L.rooms.forEach((poly, ri) =>
      fillPoly(g, poly, (i) => {
        g.kind[i] = 1;
        g.room[i] = ri;
      }),
    );
    for (const b of L.bays)
      fillPoly(g, b.poly, (i) => {
        if (g.kind[i]) return;
        g.kind[i] = 1;
        g.room[i] = b.room;
      });
    for (let i = 0; i < g.kind.length; i++) if (g.kind[i] === 1) g.h[i] = L.baseY;
    if (L.garden && garden)
      fillPoly(g, garden.boundary, (i, x, y) => {
        if (g.kind[i]) return;
        g.kind[i] = 2;
        g.h[i] = -GROUND_DROP + groundAt(garden, { x, y });
      });
    for (const poly of solids[li]) fillPoly(g, poly, (i) => (g.solid[i] = 1));
    for (const o of L.obs) {
      if (o.door < 0) {
        forCells(g, o.x0 - CLR_REACH, o.y0 - CLR_REACH, o.x1 + CLR_REACH, o.y1 + CLR_REACH, (i, x, y) => {
          const d = obsDist(o, x, y);
          if (d < g.clr[i]) g.clr[i] = Math.max(0, d);
          if (d < WALKER_R) g.blocked[i] = 1;
        });
      } else {
        forCells(g, o.x0 - WALKER_R, o.y0 - WALKER_R, o.x1 + WALKER_R, o.y1 + WALKER_R, (i, x, y) => {
          if (obsDist(o, x, y) >= WALKER_R) return;
          const n = g.doorN[i];
          if ((n >= 1 && g.doorA[i] === o.door) || (n >= 2 && g.doorB[i] === o.door)) return;
          if (n === 0) g.doorA[i] = o.door;
          else if (n === 1) g.doorB[i] = o.door;
          g.doorN[i] = Math.min(3, n + 1);
        });
      }
    }
    for (let i = 0; i < g.kind.length; i++) if (g.solid[i]) g.blocked[i] = 1;
  });

  // Stand spots at each end of a flight, on a free cell (a side exit's beyond its side).
  for (const F of flights) {
    F.ends.forEach((e, k) => {
      const g = levels[e.li].grid;
      const beyond = (i: number) => k < 2 || e.side * flightL(F.f, cellX(g, i), cellY(g, i)) > e.edge + 0.1;
      e.cell = nearestCell(g, e.stand, k < 2 ? 1.0 : 0.6, (i) => passable(g, i, ALL_OPEN) && beyond(i));
      if (e.cell >= 0) e.stand = cellPt(g, e.cell);
    });
    F.footCell = F.ends[0].cell;
    F.headCell = F.ends[1].cell;
    F.footStand = F.ends[0].stand;
    F.headStand = F.ends[1].stand;
  }

  let total = 0;
  for (const L of levels) {
    I.off.push(total);
    total += L.grid.kind.length;
  }
  I.total = total;

  const navLevels: NavLevel[] = levels.map((L, li) => ({
    level: L.level,
    floorId: L.floorId,
    baseY: L.baseY,
    rooms: floors[li].rooms.map((r, ri) => ({ id: r.id, name: r.name, poly: L.rooms[ri], area: areaOf(L.rooms[ri]) })),
  }));
  const navFlights: NavFlight[] = flights.map((F) => ({ lowerLevel: levels[F.lower].level, upperLevel: levels[F.upper].level, footStand: F.footStand, headStand: F.headStand }));
  return { levels: navLevels, flights: navFlights, doors: doors.map((d) => d.nd), plot: garden ? garden.boundary : null, internal: I };
}

function polygonCentroidOfRooms(rooms: V2[][]): V2 {
  let a = 0;
  let x = 0;
  let y = 0;
  for (const r of rooms) {
    const ar = areaOf(r);
    const c = polygonCentroid(r);
    a += ar;
    x += c.x * ar;
    y += c.y * ar;
  }
  return a > 0 ? { x: x / a, y: y / a } : { x: 0, y: 0 };
}
