import { polygonCentroid, type V2 } from "./geometry";
import {
  NORMAL, WALKER_R, MAX_STEP, SIDE_STEP, sideAt, doorIsOpen, floorAt, flightSL, insideFlight, insideWell, internalOf, leftBy, levelIndex, nearestCell, cellPt, obsDist,
  passable, penetration, roomStand, snapFree, stairState, standable, facing, ALL_OPEN, type Obs, type WalkInternal,
} from "./walkNav";
import { yawOf, type DoorStates, type NavWorld, type WalkPose, type WalkStart } from "./walkTypes";

/**
 * Walk-through movement (docs/walkthrough-plan.md, Chunk B): sliding collision, feet height and the stairs'
 * state machine, settling a pose after the layout changes, and where a walk starts.
 */

/** Longest sub-step, metres. */
const SUB = 0.1;
/** Starting this deep in an obstacle, a walker is not pushed out but may move to make it less. */
const STUCK = 0.02;

interface State {
  x: number;
  y: number;
  li: number;
  stair: number | null;
  feetY: number;
}

/** Push a point out of the obstacles (4 passes), so a walker slides along what it meets. */
function resolve(obs: Obs[], x: number, y: number, open: (d: number) => boolean): [number, number] {
  for (let it = 0; it < 4; it++) {
    let moved = false;
    for (const o of obs) {
      if (x < o.x0 - WALKER_R || x > o.x1 + WALKER_R || y < o.y0 - WALKER_R || y > o.y1 + WALKER_R) continue;
      if (o.door >= 0 && open(o.door)) continue;
      const d = obsDist(o, x, y);
      if (d < WALKER_R) {
        const k = WALKER_R - d + 1e-6;
        x += NORMAL.x * k;
        y += NORMAL.y * k;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return [x, y];
}

function subStep(I: WalkInternal, st: State, dx: number, dy: number, open: (d: number) => boolean): State {
  const obs = st.stair !== null ? I.flights[st.stair].perim : I.levels[st.li].obs;
  const pen0 = penetration(obs, st.x, st.y, open);
  let x = st.x + dx;
  let y = st.y + dy;
  if (pen0 > STUCK) {
    // Started inside something (after a flip, say): only moves that get you less stuck.
    if (penetration(obs, x, y, open) > pen0 - 1e-6) return st;
  } else {
    [x, y] = resolve(obs, x, y, open);
    if (penetration(obs, x, y, open) > 0.01) return st;
  }
  const p = { x, y };
  let next: State;
  // On or off the treads sideways, through a doorway off the flight's side.
  let side = false;
  if (st.stair !== null) {
    const F = I.flights[st.stair];
    if (insideFlight(F, p, true)) {
      const s = stairState(I, st.stair, p);
      next = { x, y, li: s.li, stair: st.stair, feetY: s.feetY };
    } else {
      const by = leftBy(F, p);
      const k = by ? -1 : sideAt(F, p);
      side = k >= 0;
      const li = by === "entry" ? F.lower : by === "exit" ? F.upper : side ? F.ends[k].li : stairState(I, st.stair, p).li;
      // Between the stringer and the wall line of a side doorway there may be no room polygon: it is still floor.
      const feet = floorAt(I, li, p) ?? (side ? I.levels[li].baseY : null);
      if (feet === null) return st;
      next = { x, y, li, stair: null, feetY: feet };
    }
  } else {
    // From below, only where the flight comes down to the floor (its foot); walkers pass under a head high enough.
    const fi = I.flights.findIndex((F) => (F.lower === st.li && insideFlight(F, p) && flightSL(F, p).s < F.lowTo) || (F.upper === st.li && insideWell(F, p)));
    if (fi >= 0) {
      const s = stairState(I, fi, p);
      const k = sideAt(I.flights[fi], st);
      side = k >= 0 && I.flights[fi].ends[k].li === st.li;
      next = { x, y, li: s.li, stair: fi, feetY: s.feetY };
    } else {
      const feet = floorAt(I, st.li, p);
      if (feet === null) return st;
      next = { x, y, li: st.li, stair: null, feetY: feet };
    }
  }
  const rise = next.feetY - st.feetY;
  if (side ? Math.abs(rise) > SIDE_STEP + 1e-6 : rise > MAX_STEP + 1e-6) return st;
  return next;
}

const stateOf = (I: WalkInternal, pose: WalkPose): State => ({
  x: pose.x,
  y: pose.y,
  li: levelIndex(I, pose.level),
  stair: pose.stair !== null && I.flights[pose.stair] ? pose.stair : null,
  feetY: pose.feetY,
});

/** Move the walker by (dx, dy) plan metres: slides along walls, stopped by shut doors and steps over MAX_STEP, and climbs the stairs. */
export function stepWalker(nav: NavWorld, pose: WalkPose, dx: number, dy: number, doors: DoorStates): WalkPose {
  const I = internalOf(nav);
  const dist = Math.hypot(dx, dy);
  if (!I || !I.levels.length || dist < 1e-9) return I ? pose : { ...pose, x: pose.x + dx, y: pose.y + dy };
  const open = (d: number) => doorIsOpen(I, d, doors);
  const n = Math.ceil(dist / SUB);
  let st = stateOf(I, pose);
  for (let k = 0; k < n; k++) st = subStep(I, st, dx / n, dy / n, open);
  return { ...pose, x: st.x, y: st.y, level: I.levels[st.li].level, stair: st.stair, feetY: st.feetY };
}

/** Put a pose somewhere valid (after a layout flip or an edit): the same spot if free, else nearby, else a room's stand spot, else the front door. */
export function settle(nav: NavWorld, pose: WalkPose, doors: DoorStates): WalkPose {
  const I = internalOf(nav);
  if (!I || !I.levels.length) return pose;
  const open = (d: number) => doorIsOpen(I, d, doors);
  const li = levelIndex(I, pose.level);
  const L = I.levels[li];
  const p = { x: pose.x, y: pose.y };
  const keep = { yaw: pose.yaw, pitch: pose.pitch };
  if (pose.stair !== null) {
    const fi = pose.stair;
    const F = I.flights[fi];
    if (F && (F.lower === li || F.upper === li) && insideFlight(F, p)) {
      const s = stairState(I, fi, p);
      return { ...pose, level: I.levels[s.li].level, stair: fi, feetY: s.feetY };
    }
  }
  const at = (q: V2): WalkPose => ({ ...keep, x: q.x, y: q.y, level: L.level, stair: null, feetY: floorAt(I, li, q) ?? L.baseY });
  if (standable(I, li, p, open)) return at(p);
  const c = nearestCell(L.grid, p, 1.5, (i) => passable(L.grid, i, open));
  if (c >= 0) return at(cellPt(L.grid, c));
  // The nearest room's stand spot on this storey.
  const order = L.rooms
    .map((poly, ri) => ({ ri, d: Math.hypot(polygonCentroid(poly).x - p.x, polygonCentroid(poly).y - p.y) }))
    .sort((a, b) => a.d - b.d);
  for (const { ri } of order) {
    const s = roomStand(I, li, ri);
    if (s) return at(s.at);
  }
  return { ...startPose(nav, { kind: "front" }), ...keep };
}

/** Where a walk starts: outside the front door looking at it, or in a room. */
export function startPose(nav: NavWorld, start: WalkStart): WalkPose {
  const I = internalOf(nav);
  if (!I || !I.levels.length) return { x: 0, y: 0, level: 0, stair: null, feetY: 0, yaw: 0, pitch: 0 };
  if (start.kind === "room") {
    const li = levelIndex(I, start.level);
    const L = I.levels[li];
    const ri = nav.levels[li].rooms.findIndex((r) => r.id === start.roomId);
    if (ri >= 0) {
      const cen = polygonCentroid(L.rooms[ri]);
      const near = start.at ? snapFree(I, li, start.at, 1.0, ALL_OPEN) : null;
      const at = near ?? roomStand(I, li, ri)?.at;
      if (at) return { x: at.x, y: at.y, level: L.level, stair: null, feetY: floorAt(I, li, at) ?? L.baseY, yaw: facing(I, li, at, cen), pitch: 0 };
    }
  }
  // The front door: the lowest storey's front opening, else its outside door nearest the street.
  const li = I.gardenLi;
  const L = I.levels[li];
  const outside = I.doors.filter((d) => d.li === li && d.nd.passage === "door" && d.out !== 0);
  const door = outside.find((d) => d.nd.kind === "front") ?? [...outside].sort((a, b) => b.nd.centre.y - a.nd.centre.y)[0];
  let stand: V2;
  let look: V2;
  if (door) {
    const n = { x: -door.nd.dir.y * door.out, y: door.nd.dir.x * door.out };
    const mid = (door.nd.span[0] + door.nd.span[1]) / 2;
    look = { x: door.nd.centre.x + door.nd.dir.x * mid, y: door.nd.centre.y + door.nd.dir.y * mid };
    stand = { x: look.x + n.x * 1.6, y: look.y + n.y * 1.6 };
  } else {
    const pts = L.rooms.flat();
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    look = pts.length ? { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: Math.max(...ys) } : { x: 0, y: 0 };
    stand = { x: look.x, y: look.y + 3 };
  }
  const at = snapFree(I, li, stand, 1.5, ALL_OPEN) ?? stand;
  const yaw = yawOf({ x: look.x - at.x, y: look.y - at.y });
  return { x: at.x, y: at.y, level: L.level, stair: null, feetY: floorAt(I, li, at) ?? L.baseY, yaw, pitch: 0 };
}
