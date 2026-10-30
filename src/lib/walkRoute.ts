import type { V2 } from "./geometry";
import {
  ALL_OPEN, CELL, MAX_STEP, WALKER_R, cellAt, cellPt, crossAt, doorIsOpen, floorAt, groundAt, inGarden, insideFlight, internalOf, levelIndex,
  STAND_OUT, nearestCell, passable, pathLength, roomIndexAt, stairPath, roomStand, segObsDist, standable, stairState, type WalkInternal,
} from "./walkNav";
import { GROUND_DROP } from "./site";
import type { DoorStates, NavWorld, RouteResult, WalkGoal, WalkHit, WalkPoint, WalkPose, WalkRoute } from "./walkTypes";

/**
 * Walk-through routes (docs/walkthrough-plan.md, Chunk B): A* over every storey's grid joined by the stairs,
 * pulled tight with line of sight, through the stairs along their walking line; what a tap means; where a goal is.
 */

type Open = (d: number) => boolean;

// ---------------------------------------------------------------- graph

class Heap {
  private ids: number[] = [];
  private fs: number[] = [];
  get size() {
    return this.ids.length;
  }
  push(id: number, f: number) {
    const { ids, fs } = this;
    let i = ids.length;
    ids.push(id);
    fs.push(f);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (fs[p] <= f) break;
      ids[i] = ids[p];
      fs[i] = fs[p];
      i = p;
    }
    ids[i] = id;
    fs[i] = f;
  }
  pop(): number {
    const { ids, fs } = this;
    const top = ids[0];
    const id = ids.pop()!;
    const f = fs.pop()!;
    const n = ids.length;
    if (n) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && fs[c + 1] < fs[c]) c++;
        if (fs[c] >= f) break;
        ids[i] = ids[c];
        fs[i] = fs[c];
        i = c;
      }
      ids[i] = id;
      fs[i] = f;
    }
    return top;
  }
}

/** A way over a flight, from one of its ends to another (foot, head, side exits), each end's stand cell to the other's. */
interface Link {
  from: number;
  to: number;
  cost: number;
  fi: number;
  a: number;
  b: number;
  /** Doors on the way (a side exit's), which must be open. */
  doors: number[];
}
const linkCache = new WeakMap<WalkInternal, { byNode: Map<number, number[]>; list: Link[] }>();
function linksOf(I: WalkInternal): { byNode: Map<number, number[]>; list: Link[] } {
  let m = linkCache.get(I);
  if (m) return m;
  const list: Link[] = [];
  const byNode = new Map<number, number[]>();
  I.flights.forEach((F, fi) => {
    F.ends.forEach((A, a) =>
      F.ends.forEach((B, b) => {
        if (a === b || A.cell < 0 || B.cell < 0) return;
        const from = I.off[A.li] + A.cell;
        const to = I.off[B.li] + B.cell;
        const doors = [A.door, B.door].filter((d) => d >= 0);
        byNode.set(from, [...(byNode.get(from) ?? []), list.length]);
        list.push({ from, to, cost: pathLength(stairPath(F, a, b)) + 2 * STAND_OUT + 0.5, fi, a, b, doors });
      }),
    );
  });
  m = { byNode, list };
  linkCache.set(I, m);
  return m;
}

export function liOfNode(I: WalkInternal, id: number): number {
  let li = 0;
  for (let i = 1; i < I.off.length; i++) if (I.off[i] <= id) li = i;
  return li;
}
export const nodePt = (I: WalkInternal, id: number): V2 => {
  const li = liOfNode(I, id);
  return cellPt(I.levels[li].grid, id - I.off[li]);
};

export interface Field {
  g: Float64Array;
  parent: Int32Array;
  /** The stair link (index in linksOf(I).list) used to reach a node, -1 for none. */
  via: Int16Array;
}

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];
const DIAG = CELL * Math.SQRT2;

/** A* (or Dijkstra when goal < 0) over the grids and stair links, from several starts with their own head start costs. */
export function search(I: WalkInternal, starts: { id: number; g: number }[], goal: number, open: Open): Field & { reached: boolean } {
  const n = I.total;
  const g = new Float64Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  const via = new Int16Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const links = linksOf(I);
  const gp = goal >= 0 ? nodePt(I, goal) : null;
  const h = (li: number, c: number) => {
    if (!gp) return 0;
    const gr = I.levels[li].grid;
    const x = gr.x0 + ((c % gr.nx) + 0.5) * CELL;
    const y = gr.y0 + (Math.floor(c / gr.nx) + 0.5) * CELL;
    return Math.hypot(x - gp.x, y - gp.y);
  };
  const heap = new Heap();
  for (const s of starts) {
    if (s.g < g[s.id]) {
      g[s.id] = s.g;
      const li = liOfNode(I, s.id);
      heap.push(s.id, s.g + h(li, s.id - I.off[li]));
    }
  }
  let reached = false;
  while (heap.size) {
    const id = heap.pop();
    if (closed[id]) continue;
    closed[id] = 1;
    if (id === goal) {
      reached = true;
      break;
    }
    const li = liOfNode(I, id);
    const gr = I.levels[li].grid;
    const off = I.off[li];
    const c = id - off;
    const ix = c % gr.nx;
    const iy = (c - ix) / gr.nx;
    const hc = gr.h[c];
    for (let k = 0; k < 8; k++) {
      const dx = DX[k];
      const dy = DY[k];
      const jx = ix + dx;
      const jy = iy + dy;
      if (jx < 0 || jy < 0 || jx >= gr.nx || jy >= gr.ny) continue;
      const j = jy * gr.nx + jx;
      if (closed[off + j] || !passable(gr, j, open) || Math.abs(gr.h[j] - hc) > MAX_STEP + 1e-6) continue;
      if (k >= 4 && (!passable(gr, iy * gr.nx + jx, open) || !passable(gr, jy * gr.nx + ix, open))) continue;
      const ng = g[id] + (k >= 4 ? DIAG : CELL);
      if (ng < g[off + j]) {
        g[off + j] = ng;
        parent[off + j] = id;
        via[off + j] = -1;
        heap.push(off + j, ng + h(li, j));
      }
    }
    for (const li2 of links.byNode.get(id) ?? []) {
      const L = links.list[li2];
      if (closed[L.to] || !L.doors.every(open)) continue;
      const ng = g[id] + L.cost;
      if (ng < g[L.to]) {
        g[L.to] = ng;
        parent[L.to] = id;
        via[L.to] = li2;
        const lj = liOfNode(I, L.to);
        heap.push(L.to, ng + h(lj, L.to - I.off[lj]));
      }
    }
  }
  return { g, parent, via, reached };
}

// ---------------------------------------------------------------- line of sight and pulling tight

/** Whether a walker can go straight from a to b on a storey: clear of every obstacle (shut doors included), on walkable ground, no step over MAX_STEP. */
export function lineClear(I: WalkInternal, li: number, a: V2, b: V2, open: Open): boolean {
  const L = I.levels[li];
  const x0 = Math.min(a.x, b.x) - WALKER_R;
  const x1 = Math.max(a.x, b.x) + WALKER_R;
  const y0 = Math.min(a.y, b.y) - WALKER_R;
  const y1 = Math.max(a.y, b.y) + WALKER_R;
  for (const o of L.obs) {
    if (o.x1 < x0 || o.x0 > x1 || o.y1 < y0 || o.y0 > y1) continue;
    if (o.door >= 0 && open(o.door)) continue;
    if (segObsDist(o, a, b) < WALKER_R - 1e-4) return false;
  }
  const g = L.grid;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.ceil(len / 0.05));
  let prev = NaN;
  for (let k = 0; k <= n; k++) {
    const c = cellAt(g, a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n);
    if (c < 0 || !g.kind[c] || g.solid[c]) return false;
    if (k && Math.abs(g.h[c] - prev) > MAX_STEP + 1e-6) return false;
    prev = g.h[c];
  }
  return true;
}

/** Points after `from` along a path of cell centres to `end`, keeping only the corners (greedy line of sight). */
function pull(I: WalkInternal, li: number, from: V2, mids: V2[], end: V2, open: Open): V2[] {
  const pts = [from, ...mids, end];
  const out: V2[] = [];
  let a = 0;
  while (a < pts.length - 1) {
    let best = a + 1;
    let fails = 0;
    for (let k = a + 2; k < pts.length; k++) {
      if (lineClear(I, li, pts[a], pts[k], open)) {
        best = k;
        fails = 0;
      } else if (++fails > 6) break;
    }
    out.push(pts[best]);
    a = best;
  }
  return out.filter((p, i) => Math.hypot(p.x - (i ? out[i - 1] : from).x, p.y - (i ? out[i - 1] : from).y) > 1e-6 || i === out.length - 1);
}

// ---------------------------------------------------------------- routes

const levelNum = (I: WalkInternal, li: number) => I.levels[li].level;

/** Points along a flight's walking line, each with its stair and storey. */
function stairPoints(I: WalkInternal, fi: number, pts: V2[]): WalkPoint[] {
  return pts.map((p) => ({ x: p.x, y: p.y, stair: fi, level: levelNum(I, stairState(I, fi, p).li) }));
}

/** Doors crossed going through the points from `from`, with the index of the first point beyond each. */
function doorsCrossed(I: WalkInternal, from: WalkPose | WalkPoint, pts: WalkPoint[]): { key: string; index: number }[] {
  const out: { key: string; index: number }[] = [];
  let prev: WalkPoint = { x: from.x, y: from.y, level: from.level, stair: from.stair };
  pts.forEach((q, i) => {
    if (prev.stair === null && q.stair === null && prev.level === q.level) {
      const hits: { key: string; t: number }[] = [];
      for (const d of I.doors) {
        if (d.nd.passage !== "door" || d.nd.level !== q.level) continue;
        const { centre: c, dir, width: w } = d.nd;
        const t = crossAt(prev, q, { x: c.x - (dir.x * w) / 2, y: c.y - (dir.y * w) / 2 }, { x: c.x + (dir.x * w) / 2, y: c.y + (dir.y * w) / 2 });
        if (t !== null) hits.push({ key: d.nd.key, t });
      }
      hits.sort((a, b) => a.t - b.t).forEach((hh) => out.push({ key: hh.key, index: i }));
    }
    prev = q;
  });
  return out;
}

interface Planned {
  route: WalkRoute;
  /** Doors whose leaf the cell path brushed, in order. */
  cellDoors: number[];
  cost: number;
}

function plan(I: WalkInternal, from: WalkPose, to: WalkPoint, open: Open): Planned | null {
  const gli = levelIndex(I, to.level);
  const gg = I.levels[gli].grid;
  const own = cellAt(gg, to.x, to.y);
  const exact = passable(gg, own, open) && standable(I, gli, to, open);
  const goalCell = exact ? own : nearestCell(gg, to, 1.0, (i) => passable(gg, i, open));
  if (goalCell < 0) return null;
  const goal = I.off[gli] + goalCell;
  const goalPt = exact ? { x: to.x, y: to.y } : cellPt(gg, goalCell);

  // Where we start: a cell near the walker, or either end of the flight we are on.
  const starts: { id: number; g: number; prefix: WalkPoint[]; at: V2; door?: number }[] = [];
  const F = from.stair !== null ? I.flights[from.stair] : undefined;
  if (F && from.stair !== null) {
    const fi = from.stair;
    const lenOf = (pts: V2[]) => pts.reduce((s, p, i) => s + (i ? Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : Math.hypot(p.x - from.x, p.y - from.y)), 0);
    F.ends.forEach((E, e) => {
      if (E.cell < 0 || (E.door >= 0 && !open(E.door))) return;
      // Along the walking line towards that end, from the point on it nearest the walker.
      let best: V2[] | null = null;
      let bd = Infinity;
      for (const src of [0, 1]) {
        if (src === e) continue;
        const path = stairPath(F, src, e);
        let k = 0;
        path.forEach((p, i) => {
          if (Math.hypot(p.x - from.x, p.y - from.y) < Math.hypot(path[k].x - from.x, path[k].y - from.y)) k = i;
        });
        const d = Math.hypot(path[k].x - from.x, path[k].y - from.y);
        if (d < bd) {
          bd = d;
          best = path.slice(k);
        }
      }
      const way = best!;
      starts.push({ id: I.off[E.li] + E.cell, g: lenOf([...way, E.stand]), at: E.stand, prefix: [...stairPoints(I, fi, way), { ...E.stand, level: levelNum(I, E.li), stair: null }], door: E.door });
    });
  } else {
    const li = levelIndex(I, from.level);
    const g = I.levels[li].grid;
    const c = nearestCell(g, from, 1.5, (i) => passable(g, i, open));
    if (c >= 0) starts.push({ id: I.off[li] + c, g: Math.hypot(cellPt(g, c).x - from.x, cellPt(g, c).y - from.y), at: { x: from.x, y: from.y }, prefix: [], door: -1 });
  }
  if (!starts.length) return null;
  const res = search(I, starts, goal, open);
  if (!res.reached) return null;

  const nodes: number[] = [];
  for (let id = goal; id >= 0; id = res.parent[id]) nodes.push(id);
  nodes.reverse();
  const start = starts.reduce((b, s) => (s.id === nodes[0] && (b.id !== nodes[0] || s.g < b.g) ? s : b), starts[0]);
  const points: WalkPoint[] = [...start.prefix];
  const links = linksOf(I);
  // Doors crossed stepping on or off the treads sideways, with the first point beyond each.
  const sideDoors: { key: string; index: number }[] = [];
  if (start.door !== undefined && start.door >= 0) sideDoors.push({ key: I.doors[start.door].nd.key, index: points.length - 1 });
  const cellDoors: number[] = [];
  // Split the node path into runs on one storey, joined by flights.
  const runs: { li: number; cells: number[]; viaIn: number }[] = [];
  for (const id of nodes) {
    const li = liOfNode(I, id);
    const c = id - I.off[li];
    const g = I.levels[li].grid;
    for (const d of [g.doorA[c], g.doorB[c]].slice(0, g.doorN[c])) if (d >= 0 && !cellDoors.includes(d)) cellDoors.push(d);
    if (!runs.length || res.via[id] >= 0) runs.push({ li, cells: [c], viaIn: runs.length ? res.via[id] : -1 });
    else runs[runs.length - 1].cells.push(c);
  }
  let cur: V2 = start.at;
  runs.forEach((run, k) => {
    const g = I.levels[run.li].grid;
    if (k > 0) {
      const L = links.list[run.viaIn];
      const Fl = I.flights[L.fi];
      const A = Fl.ends[L.a];
      const B = Fl.ends[L.b];
      if (A.door >= 0) sideDoors.push({ key: I.doors[A.door].nd.key, index: points.length });
      points.push(...stairPoints(I, L.fi, stairPath(Fl, L.a, L.b)));
      cur = B.stand;
      points.push({ ...cur, level: levelNum(I, run.li), stair: null });
      if (B.door >= 0) sideDoors.push({ key: I.doors[B.door].nd.key, index: points.length - 1 });
    }
    let end: V2;
    if (k === runs.length - 1) end = goalPt;
    else {
      const L = links.list[runs[k + 1].viaIn];
      end = I.flights[L.fi].ends[L.a].stand;
    }
    const mids = run.cells.map((c) => cellPt(g, c));
    for (const p of pull(I, run.li, cur, mids, end, open)) points.push({ x: p.x, y: p.y, level: levelNum(I, run.li), stair: null });
  });
  const route: WalkRoute = { points, doors: [...doorsCrossed(I, from, points), ...sideDoors].sort((a, b) => a.index - b.index) };
  return { route, cellDoors, cost: res.g[goal] };
}

/** A route from where the walker is to a point, with the doors as they are; failing that, the way through with every door open and the first shut door on it. */
export function routeTo(nav: NavWorld, from: WalkPose, to: WalkPoint, doors: DoorStates): RouteResult {
  const I = internalOf(nav);
  if (!I || !I.levels.length) return { ok: false, reason: "unreachable" };
  const isOpen = (d: number) => doorIsOpen(I, d, doors);
  const now = plan(I, from, to, isOpen);
  if (now) return { ok: true, route: now.route };
  const all = plan(I, from, to, ALL_OPEN);
  if (!all) return { ok: false, reason: "unreachable" };
  const keyShut = (key: string) => {
    const d = I.doors.find((x) => x.nd.key === key);
    return !!d && !(doors[key] ?? d.nd.initial);
  };
  const crossed = all.route.doors.find((d) => keyShut(d.key))?.key;
  const brushed = all.cellDoors.find((d) => !isOpen(d));
  const door = crossed ?? (brushed !== undefined ? I.doors[brushed].nd.key : undefined);
  if (!door) return { ok: true, route: all.route };
  return { ok: false, reason: "shut-door", door, route: all.route };
}

// ---------------------------------------------------------------- taps and goals

/** What a tap on a floor, the garden or the stairs asks for: a free spot within 1 m, or the far end of the flight; null when nowhere to go. */
export function pickTarget(nav: NavWorld, hit: WalkHit, from: WalkPose): WalkPoint | null {
  const I = internalOf(nav);
  if (!I || !I.levels.length) return null;
  const p = { x: hit.x, y: hit.z };
  // The treads: go to the other end.
  for (let fi = 0; fi < I.flights.length; fi++) {
    const F = I.flights[fi];
    if (!insideFlight(F, p, true) || hit.y <= F.lowerBase + 0.05 || hit.y >= F.upperBase - 0.05) continue;
    const onLower = from.stair === fi ? stairState(I, fi, from).li === F.lower : levelIndex(I, from.level) === F.lower;
    const li = onLower ? F.upper : F.lower;
    const at = onLower ? F.headStand : F.footStand;
    return { x: at.x, y: at.y, level: levelNum(I, li), stair: null };
  }
  const snap = (li: number): WalkPoint | null => {
    const g = I.levels[li].grid;
    const c = nearestCell(g, p, 1.0, (i) => passable(g, i, ALL_OPEN));
    if (c < 0) return null;
    const at = standable(I, li, p, ALL_OPEN) ? p : cellPt(g, c);
    return { x: at.x, y: at.y, level: levelNum(I, li), stair: null };
  };
  const order = I.levels.map((L, li) => ({ li, d: Math.abs(hit.y - L.baseY) })).sort((a, b) => a.d - b.d);
  for (const { li, d } of order) {
    if (d >= 0.4) break;
    const L = I.levels[li];
    if (roomIndexAt(L, p) >= 0 || floorAt(I, li, p) === L.baseY) return snap(li);
  }
  const G = I.garden;
  if (G && inGarden(I, I.gardenLi, p) && Math.abs(hit.y - (-GROUND_DROP + groundAt(G, p))) < 0.4) return snap(I.gardenLi);
  return null;
}

/** Where a goal from the HUD sends the walker: a room's stand spot (and the way to face), or a free spot near a point. */
export function goalPoint(nav: NavWorld, goal: WalkGoal): { point: WalkPoint; yaw?: number } | null {
  const I = internalOf(nav);
  if (!I || !I.levels.length) return null;
  const li = levelIndex(I, goal.level);
  const level = levelNum(I, li);
  if (goal.kind === "room") {
    const ri = nav.levels[li].rooms.findIndex((r) => r.id === goal.roomId);
    const s = ri >= 0 ? roomStand(I, li, ri) : null;
    return s ? { point: { x: s.at.x, y: s.at.y, level, stair: null }, yaw: s.yaw } : null;
  }
  const g = I.levels[li].grid;
  if (standable(I, li, goal.at, ALL_OPEN)) return { point: { x: goal.at.x, y: goal.at.y, level, stair: null } };
  const c = nearestCell(g, goal.at, 1.0, (i) => passable(g, i, ALL_OPEN));
  return c < 0 ? null : { point: { ...cellPt(g, c), level, stair: null } };
}

/** Starts for a distance field from a pose (its nearest free cell, or both ends of its flight). */
export function startNodes(I: WalkInternal, from: WalkPose | WalkPoint, open: Open): { id: number; g: number }[] {
  if (from.stair !== null && I.flights[from.stair]) {
    const F = I.flights[from.stair];
    return F.ends.filter((e) => e.cell >= 0 && (e.door < 0 || open(e.door))).map((e) => ({ id: I.off[e.li] + e.cell, g: Math.hypot(e.stand.x - from.x, e.stand.y - from.y) }));
  }
  const li = levelIndex(I, from.level);
  const g = I.levels[li].grid;
  const c = nearestCell(g, from, 1.5, (i) => passable(g, i, open));
  return c < 0 ? [] : [{ id: I.off[li] + c, g: 0 }];
}
