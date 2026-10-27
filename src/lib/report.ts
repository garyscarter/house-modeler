import type { Fixture, Floor, HouseModel, Opening, OpeningKind, Room, Site } from "../types";
import { FLOOR_FINISH_LABEL, type FloorFinish } from "../types";
import { buildWalls, diffWalls, EXT_WALL_T, pointInPolygon, polygonArea, polygonCentroid, roomWorldPolygon, toWorld, type V2, type WallSeg } from "./geometry";
import { byId } from "./catalogue";
import { frontAreas, isJoinery, joineryOf, shelfStack } from "./joinery";
import { fixtureBox, M2_TO_FT2 } from "./planMath";
import { diffSites } from "./siteDiff";

/**
 * The report: floor areas, the list of changes from As listed to Proposed,
 * and a rough cost from the user's own rates. Everything here is pure so it
 * can be tested against the built-in listing and reused by the exports.
 */

export { M2_TO_FT2 };

/** Area changes smaller than this (m²) or this fraction of the room are tracing noise. */
const AREA_TOL = 0.2;
const AREA_FRAC = 0.03;
/** Openings this close (metres) on the same floor are the same opening. */
const OPENING_TOL = 0.3;
/** Wall pieces shorter than this (metres) are left out of the change list. */
const WALL_MIN = 0.3;
/** Removed internal walls at least this long (metres) are flagged as likely structural. */
const LONG_WALL = 3;

export const roomArea = (floor: Floor, room: Room) => Math.abs(polygonArea(roomWorldPolygon(floor, room)));
export const floorArea = (floor: Floor) => floor.rooms.reduce((s, r) => s + roomArea(floor, r), 0);
export const modelArea = (model: HouseModel) => model.floors.reduce((s, f) => s + floorArea(f), 0);

/** Rooms that aren't heated: as set on the room, else anything called a garage. */
export const isUnheated = (room: Room) => room.unheated ?? /garage/i.test(room.name);

export interface AreaSummary {
  /** Inside the inner face of the outside walls, internal walls included: how listings and EPCs measure (IPMS 3C). */
  internal: number;
  /** The same, leaving out unheated rooms. */
  heated: number;
  unheatedRooms: string[];
  /** Model minus the listing's printed total, as a fraction of it, when the listing gives one. */
  vsListed?: number;
}

/**
 * Floor areas measured the way a listing would. Room areas run to the wall
 * centre lines, so each room loses a strip half an outside wall thick along
 * its outside walls (corner overlaps are a few cm² and ignored).
 */
export function areaSummary(model: HouseModel): AreaSummary {
  let internal = 0;
  let heated = 0;
  const unheatedRooms: string[] = [];
  for (const floor of model.floors) {
    const strip = new Map<string, number>();
    for (const w of buildWalls(floor)) {
      if (!w.exterior || !w.roomId) continue;
      strip.set(w.roomId, (strip.get(w.roomId) ?? 0) + Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) * (EXT_WALL_T / 2));
    }
    for (const r of floor.rooms) {
      const a = Math.max(0, roomArea(floor, r) - (strip.get(r.id) ?? 0));
      internal += a;
      if (isUnheated(r)) unheatedRooms.push(r.name);
      else heated += a;
    }
  }
  return { internal, heated, unheatedRooms, vsListed: model.listedArea ? (internal - model.listedArea) / model.listedArea : undefined };
}

/** Floors of two variants paired by id (copyVariant keeps ids), then by level. Sorted by level. */
export function pairFloors(a?: HouseModel, b?: HouseModel): { level: number; a?: Floor; b?: Floor }[] {
  const fa = a?.floors ?? [];
  const fb = b?.floors ?? [];
  const used = new Set<Floor>();
  const pairs = fa.map((f) => {
    const m = fb.find((g) => !used.has(g) && g.id === f.id) ?? fb.find((g) => !used.has(g) && g.level === f.level && !fa.some((h) => h.id === g.id));
    if (m) used.add(m);
    return { level: f.level, a: f as Floor | undefined, b: m };
  });
  for (const g of fb) if (!used.has(g)) pairs.push({ level: g.level, a: undefined, b: g });
  return pairs.sort((p, q) => p.level - q.level);
}

export interface RoomPair {
  a?: Room;
  b?: Room;
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Rooms of one floor in two variants, paired by id, then by name, then (for
 * a renamed room in an independently traced plan) by a nearby centre and a
 * similar area. Order follows `fa`, then rooms only in `fb`.
 */
export function pairRooms(fa?: Floor, fb?: Floor): RoomPair[] {
  const ra = fa?.rooms ?? [];
  const rb = fb?.rooms ?? [];
  const match = new Map<Room, Room>();
  const taken = new Set<Room>();
  const take = (r: Room, pick: (s: Room) => boolean) => {
    if (match.has(r)) return;
    const s = rb.find((x) => !taken.has(x) && pick(x));
    if (s) {
      match.set(r, s);
      taken.add(s);
    }
  };
  for (const r of ra) take(r, (s) => s.id === r.id);
  for (const r of ra) take(r, (s) => norm(s.name) === norm(r.name));
  if (fa && fb) {
    for (const r of ra) {
      const ca = polygonCentroid(roomWorldPolygon(fa, r));
      const area = roomArea(fa, r);
      take(r, (s) => {
        const cb = polygonCentroid(roomWorldPolygon(fb, s));
        const bArea = roomArea(fb, s);
        return Math.hypot(ca.x - cb.x, ca.y - cb.y) < 0.5 && Math.abs(bArea - area) <= Math.max(AREA_TOL, area * 0.1);
      });
    }
  }
  const pairs: RoomPair[] = ra.map((r) => ({ a: r, b: match.get(r) }));
  for (const s of rb) if (!taken.has(s)) pairs.push({ b: s });
  return pairs;
}

/** True when an area change is big enough to report. */
export const significantArea = (before: number, after: number) => {
  const d = Math.abs(after - before);
  return d >= AREA_TOL && d >= AREA_FRAC * Math.max(before, after);
};

export interface AreaRow {
  key: string;
  name: string;
  /** Previous name when the room was renamed in Proposed. */
  was?: string;
  current?: number;
  proposed?: number;
}

export interface FloorAreas {
  key: string;
  level: number;
  name: string;
  rows: AreaRow[];
  current?: number;
  proposed?: number;
}

export interface AreaReport {
  floors: FloorAreas[];
  current?: number;
  proposed?: number;
}

/** Room, floor and whole-house areas for one or both variants, rooms paired across them. */
export function areaReport(current?: HouseModel, proposed?: HouseModel): AreaReport {
  const floors = pairFloors(current, proposed).map(({ level, a, b }): FloorAreas => {
    const rows = pairRooms(a, b).map(({ a: ra, b: rb }): AreaRow => ({
      key: (ra ?? rb)!.id + (rb ? ":" + rb.id : ""),
      name: (rb ?? ra)!.name,
      was: ra && rb && ra.name !== rb.name ? ra.name : undefined,
      current: ra && a ? roomArea(a, ra) : undefined,
      proposed: rb && b ? roomArea(b, rb) : undefined,
    }));
    return {
      key: (a ?? b)!.id,
      level,
      name: (b ?? a)!.name,
      rows,
      current: a && current ? floorArea(a) : undefined,
      proposed: b && proposed ? floorArea(b) : undefined,
    };
  });
  return { floors, current: current && modelArea(current), proposed: proposed && modelArea(proposed) };
}

// ---------------------------------------------------------------------------
// Changes

export type Unit = "m²" | "m" | "each";
export type ChangeCategory = "Floor" | "Room" | "Wall" | "Door" | "Window" | "Opening" | "Joinery" | "Site" | "Garden";
export type CostLineId =
  | "newFloorArea"
  | "removeWall"
  | "newPartition"
  | "newExternalWall"
  | "newWindow"
  | "newDoor"
  | "alterOpening"
  | "blockOpening"
  | "removeGardenWall"
  | "newPaving"
  | "newFlooring"
  | "joineryClosed"
  | "joineryOpen"
  | "floatingShelf"
  | "windowSeat"
  // Garden (lib/siteDiff.ts gardenChanges; each catalogue entry names its line in lib/gardenCatalogue.ts)
  | "newLawn"
  | "newBed"
  | "gardenEdging"
  | "gardenFurniture"
  | "gardenStructure"
  | "gardenLighting"
  | "gardenPlanting"
  | "hedging"
  | "removeGardenItem";

export interface Change {
  key: string;
  level: number;
  floor: string;
  category: ChangeCategory;
  description: string;
  quantity: number;
  unit: Unit;
  /** The cost line this change is priced on; undefined = for information only. */
  costLine?: CostLineId;
  /** A warning to take structural advice, in plain English. */
  structural?: string;
}

export const STRUCTURAL_ADVICE = "Likely structural: get a structural engineer's advice.";
const LINTEL_ADVICE = "Needs a lintel in a load-bearing wall: get a structural engineer's advice.";

const KIND_NOUN: Record<OpeningKind, string> = {
  door: "door",
  front: "front door",
  window: "window",
  bay: "bay window",
  garage: "garage door",
  gap: "opening",
  patio: "sliding patio door",
  french: "French doors",
  bifold: "bi-fold doors",
  archway: "archway",
};

export const categoryOf = (kind: OpeningKind): ChangeCategory => (kind === "window" || kind === "bay" ? "Window" : kind === "gap" || kind === "archway" ? "Opening" : "Door");
const newLine = (kind: OpeningKind): CostLineId => {
  const c = categoryOf(kind);
  return c === "Window" ? "newWindow" : c === "Door" ? "newDoor" : "alterOpening";
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const m1 = (v: number) => Math.round(v * 10) / 10;

const label = (f: string) => FLOOR_FINISH_LABEL[f as FloorFinish] ?? f;

/** A room's floor finish changed: what is laid, and what it replaces. Colour and pattern direction alone don't count. */
export function floorChange(ra: Pick<Room, "floorFinish">, rb: Pick<Room, "floorFinish" | "name">): { description: string; laid: boolean } | undefined {
  const a = ra.floorFinish ?? "plain";
  const b = rb.floorFinish ?? "plain";
  if (a === b) return undefined;
  if (b === "plain") return { description: `${rb.name}: ${label(a).toLowerCase()} floor taken up`, laid: false };
  return { description: `New floor in the ${rb.name}: ${label(b)}${a === "plain" ? "" : ` (was ${label(a).toLowerCase()})`}`, laid: true };
}
const fmtLen = (v: number) => `${v.toFixed(v < 10 ? 2 : 1)} m`;
const list = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

interface FloorCtx {
  floor: Floor;
  polys: { room: Room; poly: V2[] }[];
  walls: WallSeg[];
}

const ctxOf = (floor: Floor): FloorCtx => ({
  floor,
  polys: floor.rooms.map((room) => ({ room, poly: roomWorldPolygon(floor, room) })),
  walls: buildWalls(floor),
});

/** Which side of the house an outward normal faces, in plan terms (front = bottom of the plan). */
const sideName = (out: V2) =>
  Math.abs(out.y) >= Math.abs(out.x) ? (out.y > 0 ? "front" : "rear") : out.x > 0 ? "right-hand side" : "left-hand side";

/**
 * Rooms found just to either side of a point on a wall running along `dir`,
 * and for an external wall the side of the house it faces.
 */
function roomsBeside(ctx: FloorCtx, p: V2, dir: V2, probe = 0.3): { names: string[]; side?: string } {
  const n = { x: -dir.y, y: dir.x };
  const hits = ([1, -1] as const).map((s) => ctx.polys.find((r) => pointInPolygon({ x: p.x + n.x * probe * s, y: p.y + n.y * probe * s }, r.poly)));
  const names = [...new Set(hits.filter((h) => h).map((h) => h!.room.name))];
  const side = hits[0] && !hits[1] ? sideName({ x: -n.x, y: -n.y }) : !hits[0] && hits[1] ? sideName(n) : undefined;
  return { names, side };
}

/** Rooms along each side of a wall, sampled every 0.25 m. */
function wallSides(ctx: FloorCtx, w: { a: V2; b: V2 }): [string[], string[]] {
  const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
  const dir = { x: (w.b.x - w.a.x) / len, y: (w.b.y - w.a.y) / len };
  const n = { x: -dir.y, y: dir.x };
  const steps = Math.max(1, Math.round(len / 0.25));
  const sides: [Set<string>, Set<string>] = [new Set(), new Set()];
  for (let i = 0; i < steps; i++) {
    const t = ((i + 0.5) / steps) * len;
    ([1, -1] as const).forEach((s, k) => {
      const q = { x: w.a.x + dir.x * t + n.x * 0.3 * s, y: w.a.y + dir.y * t + n.y * 0.3 * s };
      const hit = ctx.polys.find((r) => pointInPolygon(q, r.poly));
      if (hit) sides[k].add(hit.room.name);
    });
  }
  return [[...sides[0]], [...sides[1]]];
}

function describeWall(ctx: FloorCtx, w: { a: V2; b: V2 }): string {
  const [s0, s1] = wallSides(ctx, w);
  if (s0.length && s1.length) return `wall between ${list(s0)} and ${list(s1)}`;
  if (!s0.length && !s1.length) return "free-standing wall";
  const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
  // The rooms are on the +n side (s0), so outside is -n, or the other way round.
  const n = { x: -(w.b.y - w.a.y) / len, y: (w.b.x - w.a.x) / len };
  const out = s0.length ? { x: -n.x, y: -n.y } : n;
  return `${sideName(out)} external wall of ${list(s0.length ? s0 : s1)}`;
}

const openingDir = (o: Opening): V2 => (o.orientation === "h" ? { x: 1, y: 0 } : { x: 0, y: 1 });

function wherePhrase(ctx: FloorCtx, o: Opening): string {
  const { names, side } = roomsBeside(ctx, toWorld(ctx.floor, o), openingDir(o));
  if (names.length === 2) return ` between ${names[0]} and ${names[1]}`;
  if (!names.length) return "";
  return side ? ` in the ${side} wall of ${names[0]}` : ` in ${names[0]}`;
}

/** The wall of `walls` that an opening sits in, if any (within 0.25 m and running the same way). */
function wallAt(walls: WallSeg[], p: V2, o: Opening): WallSeg | undefined {
  let best: { w: WallSeg; d: number } | undefined;
  for (const w of walls) {
    const dx = w.b.x - w.a.x;
    const dy = w.b.y - w.a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    if ((Math.abs(dx) >= Math.abs(dy)) !== (o.orientation === "h")) continue;
    const t = ((p.x - w.a.x) * dx + (p.y - w.a.y) * dy) / len;
    if (t < -0.05 || t > len + 0.05) continue;
    const d = Math.abs(((p.x - w.a.x) * -dy + (p.y - w.a.y) * dx) / len);
    if (d < 0.25 && (!best || d < best.d)) best = { w, d };
  }
  return best?.w;
}

/**
 * Openings of one floor in two variants paired by id, then by kind and
 * position, then by position alone (an opening that changed type).
 */
export function pairOpenings(fa: Floor | undefined, fb: Floor | undefined): { a?: Opening; b?: Opening }[] {
  const oa = fa?.openings ?? [];
  const ob = fb?.openings ?? [];
  const match = new Map<Opening, Opening>();
  const taken = new Set<Opening>();
  const pos = (f: Floor, o: Opening) => toWorld(f, o);
  for (const o of oa) {
    const m = ob.find((x) => x.id === o.id);
    if (m) {
      match.set(o, m);
      taken.add(m);
    }
  }
  const nearest = (sameKind: boolean) => {
    if (!fa || !fb) return;
    for (const o of oa) {
      if (match.has(o)) continue;
      const p = pos(fa, o);
      let best: { m: Opening; d: number } | undefined;
      for (const m of ob) {
        if (taken.has(m) || m.orientation !== o.orientation || (sameKind && m.kind !== o.kind)) continue;
        const q = pos(fb, m);
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d <= OPENING_TOL && (!best || d < best.d)) best = { m, d };
      }
      if (best) {
        match.set(o, best.m);
        taken.add(best.m);
      }
    }
  };
  nearest(true);
  nearest(false);
  const pairs: { a?: Opening; b?: Opening }[] = oa.map((a) => ({ a, b: match.get(a) }));
  for (const b of ob) if (!taken.has(b)) pairs.push({ a: undefined, b });
  return pairs;
}

/**
 * Everything that differs between As listed (`a`) and Proposed (`b`), floor
 * by floor, then (given each layout's plot) the plot under "Site".
 */
// ---------------------------------------------------------------------------
// Fitted joinery

type JoineryChange = Omit<Change, "level" | "floor" | "key"> & { key: string };

const mm = (v: number) => Math.round(v * 1000) / 1000;

/** What makes a unit a different job: size and construction. Colour (a repaint), fit and position (free to move) are left out. */
function joinerySignature(fx: Fixture, ceiling: number): string {
  const item = byId(fx.type)!;
  const box = fixtureBox(fx, item, ceiling);
  const { carcass: _c, topColor: _t, cushion: _k, fit: _f, trim: _tr, panel: _p, ...j } = joineryOf(fx, item, box);
  return JSON.stringify({ w: mm(box.w), d: mm(box.d), h: mm(box.h), j });
}

/** Costed changes to fitted joinery (built-ins, wall boxes, shelf stacks, window seats) on one floor. */
export function joineryChanges(fa: Floor | undefined, fb: Floor, ceilA: number, ceilB: number): JoineryChange[] {
  const list = (f: Floor | undefined) => (f?.fixtures ?? []).filter((fx) => isJoinery(byId(fx.type)));
  const A = list(fa);
  const B = list(fb);
  const taken = new Set<string>();
  const partnerOf = new Map<string, Fixture>();
  for (const fx of B) {
    const hit = A.find((x) => x.id === fx.id);
    if (hit) {
      partnerOf.set(fx.id, hit);
      taken.add(hit.id);
    }
  }
  for (const fx of B) {
    if (partnerOf.has(fx.id)) continue;
    const w = toWorld(fb, fx);
    const hit = A.find((x) => {
      if (taken.has(x.id) || x.type !== fx.type) return false;
      const p = toWorld(fa!, x);
      return Math.hypot(p.x - w.x, p.y - w.y) <= 0.3;
    });
    if (hit) {
      partnerOf.set(fx.id, hit);
      taken.add(hit.id);
    }
  }

  const inRoom = (f: Floor, fx: Fixture) => {
    const p = toWorld(f, fx);
    const n = f.rooms.find((r) => pointInPolygon(p, roomWorldPolygon(f, r)))?.name;
    return n ? ` in the ${n}` : "";
  };
  const out: JoineryChange[] = [];
  for (const fx of B) {
    const item = byId(fx.type)!;
    const old = partnerOf.get(fx.id);
    if (old && joinerySignature(old, ceilA) === joinerySignature(fx, ceilB)) continue;
    const box = fixtureBox(fx, item, ceilB);
    const j = joineryOf(fx, item, box);
    const name = item.name.toLowerCase();
    const where = inRoom(fb, fx);
    const w2 = box.w.toFixed(2);
    if (item.symbol === "built-in" || item.symbol === "wall-box") {
      const lead = old ? `${item.name}${where} remade, now` : `New ${name}${where},`;
      const size = `${w2} × ${box.h.toFixed(2)} m`;
      const { closed, open } = frontAreas(item, j, box.w, box.h);
      if (closed >= 0.05) out.push({ key: `joinery:${fx.id}:closed`, category: "Joinery", description: `${lead} ${size}: cupboard fronts`, quantity: m1(closed), unit: "m²", costLine: "joineryClosed" });
      if (open >= 0.05) out.push({ key: `joinery:${fx.id}:open`, category: "Joinery", description: `${lead} ${size}: open shelving`, quantity: m1(open), unit: "m²", costLine: "joineryOpen" });
    } else if (item.symbol === "shelf") {
      const n = shelfStack(j, box.h).n;
      const lead = old ? `${item.name}${where} remade, now` : `New ${n === 1 ? "floating shelf" : "floating shelves"}${where}:`;
      out.push({ key: `joinery:${fx.id}:shelf`, category: "Joinery", description: `${lead} ${n} × ${w2} m`, quantity: n, unit: "each", costLine: "floatingShelf" });
    } else if (item.symbol === "window-seat") {
      const text = old ? `${item.name}${where} remade, now ${w2} m` : `New ${name}${where}, ${w2} m`;
      out.push({ key: `joinery:${fx.id}:seat`, category: "Joinery", description: text, quantity: m1(box.w), unit: "m", costLine: "windowSeat" });
    }
  }
  if (fa) {
    const kept = new Set([...partnerOf.values()].map((x) => x.id));
    for (const fx of A) {
      if (kept.has(fx.id)) continue;
      out.push({ key: `joinery:${fx.id}:removed`, category: "Joinery", description: `${byId(fx.type)!.name}${inRoom(fa, fx)} removed`, quantity: 1, unit: "each" });
    }
  }
  return out;
}

export function diffModels(a: HouseModel, b: HouseModel, sites?: { a?: Site; b?: Site }): Change[] {
  const out: Change[] = [];
  for (const { level, a: fa, b: fb } of pairFloors(a, b)) {
    const floorName = (fb ?? fa)!.name;
    const push = (c: Omit<Change, "level" | "floor" | "key"> & { key: string }) =>
      out.push({ ...c, key: `${(fb ?? fa)!.id}:${c.key}`, level, floor: floorName });

    if (fa && !fb) {
      push({ key: "floor-removed", category: "Floor", description: `${fa.name} removed`, quantity: m1(floorArea(fa)), unit: "m²" });
      continue;
    }
    const ca = fa ? ctxOf(fa) : undefined;
    const cb = ctxOf(fb!);
    const areaA = fa ? floorArea(fa) : 0;
    const areaB = floorArea(fb!);
    const extended = !fa || areaB - areaA >= AREA_TOL;

    // Floor area.
    if (!fa) {
      push({ key: "floor-added", category: "Floor", description: `New floor: ${fb!.name}`, quantity: m1(areaB), unit: "m²", costLine: "newFloorArea" });
    } else if (significantArea(areaA, areaB)) {
      const d = areaB - areaA;
      push({
        key: "floor-area",
        category: "Floor",
        description: d > 0 ? `Floor area extended from ${areaA.toFixed(1)} to ${areaB.toFixed(1)} m²` : `Floor area reduced from ${areaA.toFixed(1)} to ${areaB.toFixed(1)} m²`,
        quantity: m1(Math.abs(d)),
        unit: "m²",
        costLine: d > 0 ? "newFloorArea" : undefined,
      });
    }

    // Rooms.
    for (const { a: ra, b: rb } of pairRooms(fa, fb)) {
      if (ra && !rb) {
        push({ key: `room-removed:${ra.id}`, category: "Room", description: `${ra.name} removed`, quantity: m1(roomArea(fa!, ra)), unit: "m²" });
        continue;
      }
      if (!ra && rb) {
        push({ key: `room-added:${rb.id}`, category: "Room", description: `New room: ${rb.name}`, quantity: m1(roomArea(fb!, rb)), unit: "m²" });
        continue;
      }
      if (!ra || !rb) continue;
      if (ra.name !== rb.name) {
        push({ key: `room-renamed:${rb.id}`, category: "Room", description: `${ra.name} renamed ${rb.name}`, quantity: 1, unit: "each" });
      }
      const before = roomArea(fa!, ra);
      const after = roomArea(fb!, rb);
      if (significantArea(before, after)) {
        push({
          key: `room-area:${rb.id}`,
          category: "Room",
          description: `${rb.name} ${after > before ? "enlarged" : "reduced"} from ${before.toFixed(1)} to ${after.toFixed(1)} m²`,
          quantity: m1(Math.abs(after - before)),
          unit: "m²",
        });
      }
      const fl = floorChange(ra, rb);
      if (fl) push({ key: `room-floor:${rb.id}`, category: "Room", description: fl.description, quantity: m1(after), unit: "m²", costLine: fl.laid ? "newFlooring" : undefined });
    }

    // Walls.
    const removed = ca ? diffWalls(ca.walls, cb.walls) : [];
    const added = diffWalls(cb.walls, ca?.walls ?? []);
    removed.forEach((w, i) => {
      const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
      if (len < WALL_MIN) return;
      const structural = w.exterior || len >= LONG_WALL;
      push({
        key: `wall-removed:${i}`,
        category: "Wall",
        description: `Remove the ${describeWall(ca!, w)} (${fmtLen(len)})`,
        quantity: m1(len),
        unit: "m",
        costLine: "removeWall",
        structural: structural ? STRUCTURAL_ADVICE : undefined,
      });
    });
    added.forEach((w, i) => {
      const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
      if (len < WALL_MIN) return;
      const ext = !!w.exterior;
      push({
        key: `wall-added:${i}`,
        category: "Wall",
        description: `New ${describeWall(cb, w)} (${fmtLen(len)})${ext && extended ? ", part of the extension" : ""}`,
        quantity: m1(len),
        unit: "m",
        costLine: ext ? (extended ? undefined : "newExternalWall") : "newPartition",
      });
    });

    // Doors and windows.
    const onRemovedWall = (o: Opening) => !!fa && !!wallAt(removed, toWorld(fa, o), o);
    for (const { a: oa, b: ob } of pairOpenings(fa, fb)) {
      if (oa && !ob) {
        const gone = onRemovedWall(oa);
        push({
          key: `opening-removed:${oa.id}`,
          category: categoryOf(oa.kind),
          description: `${cap(KIND_NOUN[oa.kind])}${wherePhrase(ca!, oa)} removed${gone ? " with its wall" : ", opening blocked up"}`,
          quantity: 1,
          unit: "each",
          costLine: gone ? undefined : "blockOpening",
        });
        continue;
      }
      if (!ob) continue;
      const where = wherePhrase(cb, ob);
      if (!oa) {
        // A new opening cut into a wall that is already there and holds the house up needs a lintel.
        const host = ca ? wallAt(ca.walls, toWorld(fb!, ob), ob) : undefined;
        push({
          key: `opening-added:${ob.id}`,
          category: categoryOf(ob.kind),
          description: `New ${KIND_NOUN[ob.kind]}${where}, ${ob.widthM.toFixed(2)} m wide`,
          quantity: 1,
          unit: "each",
          costLine: newLine(ob.kind),
          structural: host?.exterior ? LINTEL_ADVICE : undefined,
        });
        continue;
      }
      if (oa.kind !== ob.kind) {
        push({
          key: `opening-kind:${ob.id}`,
          category: categoryOf(ob.kind),
          description: `${cap(KIND_NOUN[oa.kind])}${where} replaced by ${KIND_NOUN[ob.kind]}`,
          quantity: 1,
          unit: "each",
          costLine: newLine(ob.kind),
        });
      }
      const dw = ob.widthM - oa.widthM;
      if (Math.abs(dw) >= 0.1) {
        const host = wallAt(ca!.walls, toWorld(fa!, oa), oa);
        push({
          key: `opening-width:${ob.id}`,
          category: categoryOf(ob.kind),
          description: `${cap(KIND_NOUN[ob.kind])}${where} ${dw > 0 ? "widened" : "narrowed"} from ${oa.widthM.toFixed(2)} to ${ob.widthM.toFixed(2)} m`,
          quantity: 1,
          unit: "each",
          costLine: "alterOpening",
          structural: dw > 0 && host?.exterior ? LINTEL_ADVICE : undefined,
        });
      }
      const pa = toWorld(fa!, oa);
      const pb = toWorld(fb!, ob);
      const moved = Math.hypot(pa.x - pb.x, pa.y - pb.y);
      if (moved > OPENING_TOL) {
        push({
          key: `opening-moved:${ob.id}`,
          category: categoryOf(ob.kind),
          description: `${cap(KIND_NOUN[ob.kind])}${where} moved ${moved.toFixed(1)} m`,
          quantity: 1,
          unit: "each",
          costLine: "alterOpening",
        });
      }
    }

    // Fitted joinery.
    for (const c of joineryChanges(fa, fb!, a.ceilingHeight, b.ceilingHeight)) push(c);
  }
  if (sites) out.push(...diffSites(sites.a, sites.b));
  return out;
}

// ---------------------------------------------------------------------------
// Costs

export interface CostLineDef {
  id: CostLineId;
  label: string;
  unit: Unit;
  /** Shown as a placeholder only, never used as a price. */
  example: number;
}

export const COST_LINES: CostLineDef[] = [
  { id: "newFloorArea", label: "New floor area", unit: "m²", example: 2500 },
  { id: "removeWall", label: "Remove a wall", unit: "m", example: 500 },
  { id: "newPartition", label: "New partition wall", unit: "m", example: 150 },
  { id: "newExternalWall", label: "New external wall", unit: "m", example: 800 },
  { id: "newWindow", label: "New window", unit: "each", example: 900 },
  { id: "newDoor", label: "New door", unit: "each", example: 600 },
  { id: "alterOpening", label: "Widen, move or form an opening", unit: "each", example: 1500 },
  { id: "blockOpening", label: "Block up an opening", unit: "each", example: 500 },
  { id: "removeGardenWall", label: "Remove garden wall", unit: "m", example: 100 },
  { id: "newPaving", label: "New paving", unit: "m²", example: 80 },
  { id: "newFlooring", label: "New floor finish", unit: "m²", example: 70 },
  { id: "joineryClosed", label: "Fitted joinery: cupboard fronts", unit: "m²", example: 650 },
  { id: "joineryOpen", label: "Fitted joinery: open shelving", unit: "m²", example: 350 },
  { id: "floatingShelf", label: "Floating shelf", unit: "each", example: 120 },
  { id: "windowSeat", label: "Window seat or banquette", unit: "m", example: 900 },
  { id: "newLawn", label: "New lawn (turf)", unit: "m²", example: 15 },
  { id: "newBed", label: "New planting bed", unit: "m²", example: 60 },
  { id: "gardenEdging", label: "Lawn and bed edging", unit: "m", example: 45 },
  { id: "gardenFurniture", label: "Garden furniture, pots and BBQ", unit: "each", example: 250 },
  { id: "gardenStructure", label: "Shed, pergola or play structure", unit: "each", example: 1200 },
  { id: "gardenLighting", label: "Garden lighting", unit: "each", example: 120 },
  { id: "gardenPlanting", label: "Trees, shrubs and plants", unit: "each", example: 40 },
  { id: "hedging", label: "Hedging, screens and climbers", unit: "m", example: 60 },
  { id: "removeGardenItem", label: "Remove a garden item", unit: "each", example: 60 },
];

/** Key in store.costRates for the contingency percentage. */
export const CONTINGENCY = "contingency";
export const CONTINGENCY_EXAMPLE = 15;

export interface CostLineTotal {
  def: CostLineDef;
  quantity: number;
  rate?: number;
  total?: number;
}

export interface CostEstimate {
  /** Lines with something to price, in COST_LINES order. */
  lines: CostLineTotal[];
  subtotal: number;
  contingencyPct?: number;
  contingency: number;
  total: number;
  /** Lines with a quantity but no rate yet. */
  missing: CostLineId[];
}

const rateOf = (rates: Record<string, number>, id: string) => {
  const r = rates[id];
  return typeof r === "number" && Number.isFinite(r) && r >= 0 ? r : undefined;
};

/** Cost of one change at the user's rates, or undefined when unpriced. */
export function changeCost(c: Change, rates: Record<string, number>): number | undefined {
  if (!c.costLine) return undefined;
  const r = rateOf(rates, c.costLine);
  return r === undefined ? undefined : r * c.quantity;
}

/** Totals per cost line from the user's own rates, plus contingency. */
export function estimateCosts(changes: Change[], rates: Record<string, number>): CostEstimate {
  const lines: CostLineTotal[] = [];
  const missing: CostLineId[] = [];
  for (const def of COST_LINES) {
    const quantity = m1(changes.filter((c) => c.costLine === def.id).reduce((s, c) => s + c.quantity, 0));
    if (quantity <= 0) continue;
    const rate = rateOf(rates, def.id);
    if (rate === undefined) missing.push(def.id);
    lines.push({ def, quantity, rate, total: rate === undefined ? undefined : rate * quantity });
  }
  const subtotal = lines.reduce((s, l) => s + (l.total ?? 0), 0);
  const contingencyPct = rateOf(rates, CONTINGENCY);
  const contingency = (subtotal * (contingencyPct ?? 0)) / 100;
  return { lines, subtotal, contingencyPct, contingency, total: subtotal + contingency, missing };
}

// ---------------------------------------------------------------------------
// Notes and formatting

export interface RoomNote {
  floor: string;
  room: string;
  notes: string;
}

/** Every room note in a model, floor by floor. */
export function roomNotes(model: HouseModel): RoomNote[] {
  return [...model.floors]
    .sort((p, q) => p.level - q.level)
    .flatMap((f) => f.rooms.filter((r) => r.notes?.trim()).map((r) => ({ floor: f.name, room: r.name, notes: r.notes!.trim() })));
}

export const fmtM2 = (v: number) => v.toFixed(1);
export const fmtFt2 = (v: number) => Math.round(v * M2_TO_FT2).toString();
/** Signed change, e.g. "+27.1" or "−1.2"; empty when too small to matter. */
export const fmtDelta = (d: number, unit: "m²" | "ft²" = "m²") => {
  const v = unit === "ft²" ? d * M2_TO_FT2 : d;
  const s = unit === "ft²" ? Math.round(Math.abs(v)).toString() : Math.abs(v).toFixed(1);
  if (Number(s) === 0) return "";
  return `${v > 0 ? "+" : "−"}${s}`;
};

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
export const fmtGBP = (v: number) => GBP.format(v);

/** "m²" lines read "27.1 m²", "each" lines read "2". */
export const fmtQty = (q: number, unit: Unit) => (unit === "each" ? String(q) : `${q.toFixed(1)} ${unit}`);
