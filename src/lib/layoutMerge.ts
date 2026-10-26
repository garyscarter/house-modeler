import type { Exterior, Fixture, Floor, HouseModel, Opening, OpeningKind, Pt, Room } from "../types";
import { DEFAULT_EXTERIOR, TILE_STYLE_LABEL, WALL_FINISH_LABEL, uid } from "../types";
import { byId, type CatalogueItem } from "./catalogue";
import { EXT_WALL_T, pointInPolygon, toWorld, WALL_T, type V2 } from "./geometry";
import { convexOverlap, defaultHead, defaultSill, DOOR_KINDS, fixtureSolids, rectCorners, wallLines, type WallLine } from "./planMath";

/**
 * Bring changes made to a built-in house since a design was copied from it into that design, one ticked
 * change at a time, without touching the design's own work: its rooms, walls and own furniture are never
 * changed, and nothing that isn't ticked is.
 *
 * There is no record of what the built-in house looked like when the design was copied, so every
 * difference between the design and the latest built-in house is a candidate: either the listing changed,
 * or the owner did. Each change therefore says what it does in plain words, and is ticked by default only
 * where it is very likely to be a listing update that fits the design (see `listingUpdates`).
 */

export type UpdateGroup = "exterior" | "neighbours" | "garden" | "fixtures" | "stairs" | "openings";
export const UPDATE_GROUP_LABEL: Record<UpdateGroup, string> = {
  exterior: "Roof and exterior settings",
  neighbours: "Neighbouring buildings",
  garden: "Garden",
  fixtures: "New fittings and furniture",
  stairs: "Stairs settings",
  openings: "Doors and windows",
};
export const UPDATE_GROUP_ORDER: UpdateGroup[] = ["exterior", "neighbours", "garden", "fixtures", "stairs", "openings"];

/** One change on offer. `T` is what it applies to: the layout (HouseModel) or its plot (Site). */
export interface Change<T> {
  /** Stable for the same pair of inputs, so a selection can be applied later. */
  id: string;
  group: UpdateGroup;
  /** Plain words, e.g. "Roof pitch: 28° → 32°". */
  label: string;
  /** Why it is not ticked, or anything else worth knowing ("sits where your Utility Room now is"). */
  note?: string;
  defaultSelected: boolean;
  /** False when it cannot be put in (no wall there, say): shown, but it can't be ticked. */
  available: boolean;
  /** Returns a changed copy; never mutates its input. */
  apply: (x: T) => T;
}
export type LayoutChange = Change<HouseModel>;

/** A fixture of the latest house counts as already there when the design has one of the same type this close (metres). */
export const FIXTURE_MATCH_M = 0.3;
/** An opening of the latest house is the design's when one of the same kind and orientation is this close (metres). */
export const OPENING_MATCH_M = 0.2;
/** Stair changes are ticked when the design's flight is still within this of the latest's (metres). */
export const STAIRS_NEAR_M = 0.75;
/** How far off a room edge an opening may sit and still be in that wall (metres). */
const ON_WALL_M = 0.06;

export const metres = (n: number) => `${+n.toFixed(2)} m`;
const degrees = (n: number) => `${+n.toFixed(1)}°`;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------------------------------------------------
// Roof and exterior

type ExtKey = Exclude<keyof Exterior, "showRoof">;
interface ExtSpec {
  label: string;
  show: (v: unknown, e: Exterior) => string;
  /** Ticked by default; otherwise `note` says why not. */
  tick: boolean | ((mine: Exterior, latest: Exterior) => boolean);
  note?: string;
}
const yesNo = (v: unknown) => (v ? "on" : "off");
const text = (v: unknown) => (v === undefined ? "not set" : String(v));
const countOf = (v: unknown, one: string, many: string) => {
  const n = Array.isArray(v) ? v.length : 0;
  return `${n} ${n === 1 ? one : many}`;
};
const DESIGN_NOTE = "Not ticked: it depends on your design's walls and roofs, so yours may be deliberate.";

const EXT_SPECS: Record<ExtKey, ExtSpec> = {
  pitchDeg: { label: "Roof pitch", show: (v) => degrees(v as number), tick: true },
  overhang: { label: "Eaves overhang", show: (v) => metres(v as number), tick: true },
  roofStyle: { label: "Roof shape", show: (v) => (v === "hip" ? "hipped" : "gabled"), tick: true },
  partyWall: { label: "Party wall side", show: text, tick: true },
  ridgeAxis: { label: "Ridge direction", show: (v) => (v === "x" ? "left to right" : v === "z" ? "front to back" : "automatic"), tick: true },
  roofColor: { label: "Roof colour", show: text, tick: true },
  wallColor: { label: "Wall colour", show: text, tick: true },
  trimColor: { label: "Window and door frame colour", show: text, tick: true },
  frontDoorColor: { label: "Front door colour", show: text, tick: true },
  backDoorColor: { label: "Back door colour", show: text, tick: true },
  wallFinish: { label: "Outside wall finish", show: (v) => (v ? WALL_FINISH_LABEL[v as keyof typeof WALL_FINISH_LABEL] : "default"), tick: true },
  tileStyle: { label: "Roof tiles", show: (v) => (v ? TILE_STYLE_LABEL[v as keyof typeof TILE_STYLE_LABEL] : "default"), tick: true },
  fascia: { label: "Fascias and gutters", show: (v) => (v === "trim" ? "window frame colour" : "white"), tick: true },
  gutters: { label: "Gutters and downpipes", show: yesNo, tick: true },
  canopyRoof: { label: "Porch canopy roof", show: (v) => (v === "lean-to" ? "tiled lean-to" : "flat"), tick: true },
  extensionRoof: { label: "Extension roofs", show: (v) => (v === "separate" ? "separate, lower roofs" : "carry on the main roof"), tick: false, note: DESIGN_NOTE },
  extensionDrop: { label: "Extension ridge drop", show: (v) => metres((v as number) ?? 0), tick: false, note: DESIGN_NOTE },
  chimneys: {
    label: "Chimneys",
    show: (v) => countOf(v, "chimney", "chimneys"),
    // The same number of stacks only moved or resized: a correction to the listing's.
    tick: (m, l) => (m.chimneys?.length ?? 0) === (l.chimneys?.length ?? 0),
    note: "Not ticked: your design has a different number of chimneys.",
  },
  flatRoofSkirt: {
    label: "Tiled skirt round flat roofs",
    show: (v) => {
      const s = v as Exterior["flatRoofSkirt"];
      if (!s) return "none";
      const parts = [`${s.sides.join(" and ") || "no sides"}`, `${metres(s.depth)} deep`, `pitch ${degrees(s.pitchDeg)}`];
      if (s.returns) parts.push(`returns ${metres(s.returns)}`);
      if (s.drop) parts.push(`${metres(s.drop)} down`);
      return parts.join(", ");
    },
    tick: (m, l) => !!m.flatRoofSkirt && !!l.flatRoofSkirt && same([...m.flatRoofSkirt.sides].sort(), [...l.flatRoofSkirt.sides].sort()),
    note: "Not ticked: your design's skirt runs along different sides.",
  },
  downpipes: { label: "Downpipe positions", show: (v) => (v ? countOf(v, "downpipe", "downpipes") : "automatic"), tick: false, note: DESIGN_NOTE },
  soilPipes: { label: "Soil and vent stacks", show: (v) => countOf(v, "stack", "stacks"), tick: false, note: DESIGN_NOTE },
};

const extOf = (m: HouseModel): Exterior => ({ ...DEFAULT_EXTERIOR, ...m.exterior });

function exteriorChanges(mine: HouseModel, latest: HouseModel): LayoutChange[] {
  if (!latest.exterior) return [];
  const m = extOf(mine);
  const l = extOf(latest);
  const out: LayoutChange[] = [];
  for (const key of Object.keys(EXT_SPECS) as ExtKey[]) {
    const spec = EXT_SPECS[key];
    const from = m[key];
    const to = l[key];
    if (same(from, to)) continue;
    const tick = typeof spec.tick === "function" ? spec.tick(m, l) : spec.tick;
    const fromText = spec.show(from, m);
    const toText = spec.show(to, l);
    out.push({
      id: `exterior.${key}`,
      group: "exterior",
      label: fromText === toText ? `${spec.label}: ${toText} (positions or sizes updated)` : `${spec.label}: ${fromText} → ${toText}`,
      ...(tick ? {} : { note: spec.note }),
      defaultSelected: tick,
      available: true,
      apply: (model) => {
        const ext: Exterior = { ...(model.exterior ?? DEFAULT_EXTERIOR) };
        const value = latest.exterior![key];
        if (value === undefined) delete ext[key];
        else (ext as unknown as Record<string, unknown>)[key] = structuredClone(value);
        return { ...model, exterior: ext };
      },
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// Shared plan helpers

/** The design's floor for each latest floor, matched by level. */
function floorPairs(mine: HouseModel, latest: HouseModel): { lf: Floor; mf: Floor; li: number }[] {
  return latest.floors.flatMap((lf, li) => {
    const mf = mine.floors.find((f) => f.level === lf.level);
    return mf ? [{ lf, mf, li }] : [];
  });
}

/** Image px on `to` for an image px point on `from` (they can differ in scale or origin). */
function mapPoint(from: Floor, to: Floor, p: Pt): Pt {
  const w = toWorld(from, p);
  return { x: (w.x - to.offset.x) * to.pxPerM + to.origin.x, y: (w.y - to.offset.y) * to.pxPerM + to.origin.y };
}
const distM = (a: V2, b: V2) => Math.hypot(a.x - b.x, a.y - b.y);
const roomAt = (floor: Floor, p: Pt): Room | undefined => floor.rooms.find((r) => pointInPolygon(p, r.polygon));
/** The room a fixture is in, or, for one standing just outside every room (in a bay, say), the room just behind or in front of it. */
function roomOfFixture(floor: Floor, fx: Fixture): Room | undefined {
  const r = (fx.rot * Math.PI) / 180;
  const step = 0.45 * floor.pxPerM;
  for (const s of [0, -1, 1]) {
    const room = roomAt(floor, { x: fx.x - Math.sin(r) * step * s, y: fx.y + Math.cos(r) * step * s });
    if (room) return room;
  }
  return undefined;
}

/** Rectangles (as corners) of a floor's walls at their thickness, image px. */
function wallRects(lines: WallLine[]): Pt[][] {
  return lines.flatMap(({ a, b, halfT }) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) return [];
    const n = { x: (-(b.y - a.y) / len) * halfT, y: ((b.x - a.x) / len) * halfT };
    return [[{ x: a.x + n.x, y: a.y + n.y }, { x: b.x + n.x, y: b.y + n.y }, { x: b.x - n.x, y: b.y - n.y }, { x: a.x - n.x, y: a.y - n.y }]];
  });
}

/** Rectangle in front of and behind a doorway (where a fixture would block it), image px. */
function doorwayRect(o: Opening, ppm: number): Pt[] {
  const half = (o.widthM / 2) * ppm;
  const reach = (EXT_WALL_T / 2 + 0.35) * ppm;
  return o.orientation === "h"
    ? rectCorners({ x: o.x, y: o.y }, 2 * half, 2 * reach, 0)
    : rectCorners({ x: o.x, y: o.y }, 2 * reach, 2 * half, 0);
}
const isDoorway = (o: Opening) => DOOR_KINDS.includes(o.kind) || o.kind === "gap";

const KIND_WORD: Record<OpeningKind, string> = {
  door: "Door",
  front: "Front door",
  window: "Window",
  bay: "Bay window",
  garage: "Garage door",
  gap: "Opening",
  patio: "Patio doors",
  french: "French doors",
  bifold: "Bi-fold doors",
  archway: "Archway",
};

/** Names of the rooms either side of an opening on `floor`, e.g. ["Kitchen", "Hallway (stairs)"]; "outside" where there is none. */
function roomsBeside(floor: Floor, o: Pick<Opening, "x" | "y" | "orientation">): string[] {
  const probe = 0.3 * floor.pxPerM;
  const n = o.orientation === "h" ? { x: 0, y: probe } : { x: probe, y: 0 };
  return [-1, 1].map((s) => roomAt(floor, { x: o.x + n.x * s, y: o.y + n.y * s })?.name ?? "outside");
}
function where(floor: Floor, o: Pick<Opening, "x" | "y" | "orientation">): string {
  const [a, b] = roomsBeside(floor, o);
  if (a === b) return `in ${a === "outside" ? "no room" : a}`;
  if (a === "outside" || b === "outside") return `in ${a === "outside" ? b : a}'s outside wall`;
  return `between ${a} and ${b}`;
}

// ---------------------------------------------------------------------------------------------------------
// Fittings and furniture

/** Fittings that come with a house rather than with its owner: heating, mirrors, heated towel rails. */
export function isFitting(item: CatalogueItem | undefined): boolean {
  return !!item && (item.category === "Heating" || item.symbol.startsWith("mirror") || item.symbol === "towel-rail");
}

function fixtureName(fx: Fixture, item: CatalogueItem | undefined): string {
  if (!item) return fx.label ?? fx.type;
  if (item.category === "Heating") {
    const mm = (m: number) => Math.round(m * 1000);
    return `${item.name.replace(/\s*\(.*\)$/, "")} (${mm(fx.w ?? item.w)} × ${mm(fx.h ?? item.h)})`;
  }
  return fx.label && fx.label !== item.name ? `${item.name} ("${fx.label}")` : item.name;
}

/** What is wrong with putting fixture `fx` (on `floor`, image px) there, or undefined. Rooms, walls, doorways, other fixtures. */
function fixtureProblems(fx: Fixture, item: CatalogueItem, floor: Floor, latestRoom: string | undefined, skipWalls: boolean, skipDoors: boolean): string[] {
  const ppm = floor.pxPerM;
  const out: string[] = [];
  const room = roomOfFixture(floor, fx);
  if (latestRoom !== undefined && room?.name !== latestRoom) out.push(room ? `sits where your ${room.name} now is` : "sits outside your rooms");
  const corners = rectCorners(fx, (fx.w ?? item.w) * ppm, (fx.d ?? item.d) * ppm, fx.rot);
  // Touching (a radiator against a wall face) is fine; 5 mm in is a clash, even for a 2 cm mirror.
  const eps = 0.005 * ppm;
  if (!skipWalls && wallRects(wallLines(floor, WALL_T, EXT_WALL_T)).some((r) => convexOverlap(corners, r, eps))) out.push("would cut into one of your walls");
  const door = skipDoors ? undefined : floor.openings.find((o) => isDoorway(o) && convexOverlap(corners, doorwayRect(o, ppm), eps));
  if (door) out.push(`would block your ${KIND_WORD[door.kind].toLowerCase()} ${where(floor, door)}`);
  const self = fixtureSolids([{ ...fx, id: "\u0000new" }], ppm, byId)[0];
  const clash = self && fixtureSolids(floor.fixtures ?? [], ppm, byId).find((s) => Math.min(s.z1, self.z1) - Math.max(s.z0, self.z0) > 0.005 && convexOverlap(s.corners, self.corners, eps));
  if (clash) {
    const other = (floor.fixtures ?? []).find((f) => f.id === clash.id)!;
    out.push(`overlaps your ${fixtureName(other, byId(other.type)).replace(/^./, (c) => c.toLowerCase())}`);
  }
  return out;
}

function fixtureChanges(mine: HouseModel, latest: HouseModel): LayoutChange[] {
  const out: (LayoutChange & { fitting: boolean })[] = [];
  for (const { lf, mf, li } of floorPairs(mine, latest)) {
    const mineFx = mf.fixtures ?? [];
    (lf.fixtures ?? []).forEach((lfx, i) => {
      const lw = toWorld(lf, lfx);
      const there = mineFx.some((m) => m.id === lfx.id || (m.type === lfx.type && distM(toWorld(mf, m), lw) <= FIXTURE_MATCH_M));
      if (there) return;
      const item = byId(lfx.type);
      const placed: Fixture = { ...structuredClone(lfx), ...mapPoint(lf, mf, lfx) };
      const latestRoom = roomOfFixture(lf, lfx)?.name;
      // A clash the latest house has itself (a radiator tucked against a nib, say) is how it is meant to be.
      const latestOnly = { ...lf, fixtures: (lf.fixtures ?? []).filter((f) => f !== lfx) };
      const problems = item
        ? fixtureProblems(
            placed,
            item,
            mf,
            latestRoom,
            fixtureProblems(lfx, item, latestOnly, undefined, false, true).some((p) => p.startsWith("would cut")),
            fixtureProblems(lfx, item, latestOnly, undefined, true, false).some((p) => p.startsWith("would block")),
          )
        : ["isn't in this version's catalogue"];
      const fitting = isFitting(item);
      const tick = fitting && !problems.length;
      const note = problems.length
        ? `Not ticked: it ${problems.join(", and ")}.`
        : fitting
          ? undefined
          : "Not ticked: furniture is yours to place, and you may have removed this on purpose.";
      out.push({
        fitting,
        id: `fixture.${li}.${i}`,
        group: "fixtures",
        label: `${mf.name}${latestRoom ? `, ${latestRoom}` : ""}: ${fixtureName(lfx, item)}`,
        ...(note ? { note } : {}),
        defaultSelected: tick,
        available: !!item,
        apply: (model) => ({
          ...model,
          floors: model.floors.map((f) => (f.id === mf.id ? { ...f, fixtures: [...(f.fixtures ?? []), { ...structuredClone(placed), id: uid() }] } : f)),
        }),
      });
    });
  }
  // Fittings first, ticked ones leading: they are what an update brings.
  const rank = (c: (typeof out)[number]) => (c.defaultSelected ? 0 : c.fitting ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b)).map(({ fitting: _fitting, ...c }) => c);
}

// ---------------------------------------------------------------------------------------------------------
// Stairs

const STAIR_FIELDS = ["stairsDir", "stairsLen", "stairsWidth", "stairsTurn", "stairsTopTurn", "stairsTopWinders"] as const;
type StairField = (typeof STAIR_FIELDS)[number];

function stairValue(f: Floor, k: StairField): unknown {
  switch (k) {
    case "stairsDir":
      return f.stairsDir ?? "up";
    case "stairsLen":
      return f.stairsLen ?? 2.6;
    case "stairsWidth":
      return f.stairsWidth ?? 0.9;
    case "stairsTopWinders":
      return f.stairsTopTurn ? (f.stairsTopWinders ?? 2) : undefined;
    default:
      return f[k];
  }
}
const turnWords = (t: unknown, winders?: unknown) => (t ? `winds ${t}${winders ? ` (${winders} winders)` : ""}` : "straight");
const DIR_WORDS: Record<string, string> = { up: "towards the rear", down: "towards the front", left: "to the left", right: "to the right" };

function direction(dx: number, dy: number): string {
  return Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "to the right" : "to the left") : dy > 0 ? "towards the front" : "towards the rear";
}

function stairChanges(mine: HouseModel, latest: HouseModel): LayoutChange[] {
  const out: LayoutChange[] = [];
  for (const { lf, mf, li } of floorPairs(mine, latest)) {
    if (!lf.stairs) continue;
    const at = mapPoint(lf, mf, lf.stairs);
    const parts: string[] = [];
    if (mf.stairs) {
      const d = distM(toWorld(mf, mf.stairs), toWorld(lf, lf.stairs));
      if (d > 0.01) {
        const w0 = toWorld(mf, mf.stairs);
        const w1 = toWorld(lf, lf.stairs);
        parts.push(`moved ${metres(d)} ${direction(w1.x - w0.x, w1.y - w0.y)}`);
      }
    }
    if (stairValue(mf, "stairsDir") !== stairValue(lf, "stairsDir")) parts.push(`rises ${DIR_WORDS[stairValue(lf, "stairsDir") as string]}`);
    if (stairValue(mf, "stairsLen") !== stairValue(lf, "stairsLen")) parts.push(`${metres(stairValue(mf, "stairsLen") as number)} → ${metres(stairValue(lf, "stairsLen") as number)} long`);
    if (stairValue(mf, "stairsWidth") !== stairValue(lf, "stairsWidth")) parts.push(`${metres(stairValue(mf, "stairsWidth") as number)} → ${metres(stairValue(lf, "stairsWidth") as number)} wide`);
    if (stairValue(mf, "stairsTurn") !== stairValue(lf, "stairsTurn")) parts.push(`foot ${turnWords(mf.stairsTurn)} → ${turnWords(lf.stairsTurn)}`);
    if (stairValue(mf, "stairsTopTurn") !== stairValue(lf, "stairsTopTurn") || stairValue(mf, "stairsTopWinders") !== stairValue(lf, "stairsTopWinders"))
      parts.push(`top ${turnWords(mf.stairsTopTurn, stairValue(mf, "stairsTopWinders"))} → ${turnWords(lf.stairsTopTurn, stairValue(lf, "stairsTopWinders"))}`);
    if (!parts.length && mf.stairs) continue;
    const far = mf.stairs ? distM(toWorld(mf, mf.stairs), toWorld(lf, lf.stairs)) : Infinity;
    const note = !mf.stairs
      ? "Not ticked: your design has no stairs on this floor."
      : far > STAIRS_NEAR_M
        ? `Not ticked: your stairs are ${metres(far)} from the listing's, so you may have moved them.`
        : undefined;
    out.push({
      id: `stairs.${li}`,
      group: "stairs",
      label: `${mf.name} stairs: ${parts.length ? parts.join(", ") : "added"}`,
      ...(note ? { note } : {}),
      defaultSelected: !note,
      available: true,
      apply: (model) => ({
        ...model,
        floors: model.floors.map((f) => {
          if (f.id !== mf.id) return f;
          const next: Floor = { ...f, stairs: { ...at } };
          for (const k of STAIR_FIELDS) {
            if (lf[k] === undefined) delete next[k];
            else (next as unknown as Record<string, unknown>)[k] = lf[k];
          }
          return next;
        }),
      }),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// Doors and windows

/**
 * Appearance and size fields of an opening that follow the listing. Hinge side, swing, how far it is drawn
 * open and a front door's side lights are the owner's, and so is the width of a front door given side lights.
 */
const OPENING_FIELDS = ["widthM", "style", "glazing", "sillStyle", "sill", "head", "depth", "color", "boardColor", "liningColor", "frameColor"] as const;
type OpeningField = (typeof OPENING_FIELDS)[number];
const OPENING_FIELD_WORD: Record<OpeningField, string> = {
  widthM: "width",
  style: "style",
  glazing: "glazing",
  sillStyle: "outside sill",
  sill: "sill height",
  head: "head height",
  depth: "depth",
  color: "colour",
  boardColor: "window board colour",
  liningColor: "lining colour",
  frameColor: "frame colour",
};

function openingValue(o: Opening, k: OpeningField): unknown {
  switch (k) {
    case "sill":
      return o.kind === "window" || o.kind === "bay" ? (o.sill ?? defaultSill(o.kind)) : undefined;
    case "head":
      return o.head ?? defaultHead(o.kind);
    case "depth":
      return o.kind === "bay" ? (o.depth ?? 0.6) : undefined;
    case "sillStyle":
      return o.kind === "window" || o.kind === "bay" ? (o.sillStyle ?? "stone") : undefined;
    case "glazing":
      return o.kind === "window" || o.kind === "bay" ? (o.glazing ?? "grid") : undefined;
    default:
      return o[k];
  }
}
const showOpeningValue = (v: unknown) => (v === undefined ? "default" : typeof v === "number" ? metres(v) : String(v));

/** The span [s0, s1] along its wall line, and the line's position, image px. */
function spanOf(o: Pick<Opening, "x" | "y" | "orientation" | "widthM">, ppm: number) {
  const half = (o.widthM / 2) * ppm;
  return o.orientation === "h" ? { line: o.y, s0: o.x - half, s1: o.x + half } : { line: o.x, s0: o.y - half, s1: o.y + half };
}

/** Is an opening of this width at this spot in one of the floor's walls (room edges or free walls, collinear pieces joined)? */
export function onWall(floor: Floor, o: Pick<Opening, "x" | "y" | "orientation" | "widthM">): boolean {
  const tol = ON_WALL_M * floor.pxPerM;
  const { line, s0, s1 } = spanOf(o, floor.pxPerM);
  const segs: [Pt, Pt][] = [
    ...floor.rooms.flatMap((r) => r.polygon.map((a, i) => [a, r.polygon[(i + 1) % r.polygon.length]] as [Pt, Pt])),
    ...(floor.walls ?? []).map((w) => [w.a, w.b] as [Pt, Pt]),
  ];
  const along: [number, number][] = [];
  for (const [a, b] of segs) {
    const [la, lb, sa, sb] = o.orientation === "h" ? [a.y, b.y, a.x, b.x] : [a.x, b.x, a.y, b.y];
    if (Math.abs(la - line) > tol || Math.abs(lb - line) > tol) continue;
    along.push([Math.min(sa, sb), Math.max(sa, sb)]);
  }
  along.sort((p, q) => p[0] - q[0]);
  let reach = -Infinity;
  let start = -Infinity;
  for (const [a, b] of along) {
    if (a > reach + tol) start = a;
    reach = Math.max(reach, b);
    if (start <= s0 + tol && reach >= s1 - tol) return true;
  }
  return false;
}

/** The floor's opening that would overlap one at this spot along the same wall line, other than `except`. */
function overlapping(floor: Floor, o: Pick<Opening, "x" | "y" | "orientation" | "widthM">, except?: Opening): Opening | undefined {
  const tol = ON_WALL_M * floor.pxPerM;
  const a = spanOf(o, floor.pxPerM);
  return floor.openings.find((p) => {
    if (p === except || p.orientation !== o.orientation) return false;
    const b = spanOf(p, floor.pxPerM);
    return Math.abs(a.line - b.line) <= tol && Math.min(a.s1, b.s1) - Math.max(a.s0, b.s0) > 0.02 * floor.pxPerM;
  });
}

/** Pairs each latest opening with the design's of the same kind and orientation within OPENING_MATCH_M, nearest first. */
function matchOpenings(lf: Floor, mf: Floor): Map<number, Opening> {
  const cands: { i: number; m: Opening; d: number }[] = [];
  lf.openings.forEach((o, i) => {
    const w = toWorld(lf, o);
    for (const m of mf.openings) {
      if (m.kind !== o.kind || m.orientation !== o.orientation) continue;
      const d = distM(toWorld(mf, m), w);
      if (d <= OPENING_MATCH_M) cands.push({ i, m, d });
    }
  });
  cands.sort((a, b) => a.d - b.d);
  const out = new Map<number, Opening>();
  const used = new Set<Opening>();
  for (const c of cands) {
    if (out.has(c.i) || used.has(c.m)) continue;
    out.set(c.i, c.m);
    used.add(c.m);
  }
  return out;
}

function openingChanges(mine: HouseModel, latest: HouseModel): LayoutChange[] {
  const out: LayoutChange[] = [];
  for (const { lf, mf, li } of floorPairs(mine, latest)) {
    const matched = matchOpenings(lf, mf);
    lf.openings.forEach((lo, i) => {
      const mo = matched.get(i);
      if (mo) {
        const diffs = OPENING_FIELDS.filter((k) => !same(openingValue(mo, k), openingValue(lo, k)) && !(k === "widthM" && mo.kind === "front" && mo.sidelight));
        if (!diffs.length) return;
        const resized = { ...mo, widthM: lo.widthM };
        const widthNote =
          diffs.includes("widthM") && !onWall(mf, resized)
            ? "it would run past the end of your wall"
            : diffs.includes("widthM") && overlapping(mf, resized, mo)
              ? "it would run into another of your openings"
              : undefined;
        out.push({
          id: `opening.${li}.${i}`,
          group: "openings",
          label: `${mf.name}, ${KIND_WORD[mo.kind].toLowerCase()} (${metres(mo.widthM)}) ${where(mf, mo)}: ${diffs.map((k) => `${OPENING_FIELD_WORD[k]} ${showOpeningValue(openingValue(mo, k))} → ${showOpeningValue(openingValue(lo, k))}`).join(", ")}`.replace(/^./, (c) => c.toUpperCase()),
          ...(widthNote ? { note: `Not ticked: ${widthNote}.` } : {}),
          defaultSelected: !widthNote,
          available: true,
          apply: (model) => ({
            ...model,
            floors: model.floors.map((f) =>
              f.id !== mf.id
                ? f
                : {
                    ...f,
                    openings: f.openings.map((o) => {
                      if (o.id !== mo.id) return o;
                      const next: Opening = { ...o };
                      for (const k of diffs) {
                        if (lo[k] === undefined) delete next[k];
                        else (next as unknown as Record<string, unknown>)[k] = lo[k];
                      }
                      return next;
                    }),
                  },
            ),
          }),
        });
        return;
      }
      // An opening the design doesn't have: the listing added or moved it, or the owner took it out.
      const placed: Opening = { ...structuredClone(lo), ...mapPoint(lf, mf, lo) };
      const clash = overlapping(mf, placed);
      const blocked = !onWall(mf, placed) ? "there is no wall there in your design" : clash ? `it would overlap your ${KIND_WORD[clash.kind].toLowerCase()} there` : undefined;
      const [a, b] = roomsBeside(mf, placed).sort();
      const twin = !blocked && a !== b && mf.openings.find((o) => o.kind !== "window" && o.kind !== "bay" && same(roomsBeside(mf, o).sort(), [a, b]));
      out.push({
        id: `opening.${li}.${i}.add`,
        group: "openings",
        label: `${mf.name}: add the listing's ${KIND_WORD[lo.kind].toLowerCase()} (${metres(lo.widthM)}) ${where(mf, placed)}`,
        note: blocked
          ? `Can't be added: ${blocked}.`
          : twin
            ? `Not ticked: you already have a ${KIND_WORD[twin.kind].toLowerCase()} ${where(mf, twin)}; the listing's may be the same one in another place, and yours isn't removed.`
            : "Not ticked: your design doesn't have it, which may be on purpose.",
        defaultSelected: false,
        available: !blocked,
        apply: (model) => ({
          ...model,
          floors: model.floors.map((f) => (f.id === mf.id ? { ...f, openings: [...f.openings, { ...structuredClone(placed), id: uid() }] } : f)),
        }),
      });
    });
  }
  return out;
}

/**
 * The design's own windows (ones the latest floor has no counterpart for, an extension's say) still at the default
 * sill and head, brought to the sill and head every window on the latest floor shares: one ticked change per floor.
 * Defaults drawn for 2.4 m storeys are taller than the measured windows, and on the first floor reach past the soffit.
 */
function ownWindowChanges(mine: HouseModel, latest: HouseModel): LayoutChange[] {
  const out: LayoutChange[] = [];
  for (const { lf, mf, li } of floorPairs(mine, latest)) {
    const wins = lf.openings.filter((o) => o.kind === "window");
    const { sill, head } = wins[0] ?? {};
    if (wins.length < 2 || sill === undefined || head === undefined || !wins.every((o) => o.sill === sill && o.head === head)) continue;
    const matched = new Set(matchOpenings(lf, mf).values());
    const own = mf.openings.filter((o) => o.kind === "window" && !matched.has(o) && o.sill === undefined && o.head === undefined);
    if (!own.length) continue;
    const ids = new Set(own.map((o) => o.id));
    const span = (s: number, h: number) => `${metres(s)} to ${metres(h)}`;
    out.push({
      id: `opening.${li}.own-heights`,
      group: "openings",
      label: `${mf.name}, your own window${own.length > 1 ? `s (${own.length})` : ""} ${[...new Set(own.map((o) => where(mf, o)))].join(", ")}: sill and head ${span(defaultSill("window")!, defaultHead("window")!)} → ${span(sill, head)}, as the house's`,
      defaultSelected: true,
      available: true,
      apply: (model) => ({
        ...model,
        floors: model.floors.map((f) => (f.id !== mf.id ? f : { ...f, openings: f.openings.map((o) => (ids.has(o.id) ? { ...o, sill, head } : o)) })),
      }),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------

/**
 * The changes on offer to bring `mine` (a design copied from the built-in house) up to `latest`, grouped.
 *
 * - Roof and exterior: each differing `exterior` setting. Measured ones (pitch, overhang, colours, tiles…) are
 *   ticked; ones that depend on the design (extension roofs, downpipes, a skirt on other sides) are not.
 * - New fittings and furniture: latest fixtures with no fixture of the same type within 0.3 m (or the same
 *   id) on the design's floor of the same level. Fittings (radiators, mirrors, towel rails) are ticked when
 *   they land in a room of the same name, clear of the design's walls, doorways and fixtures (clashes the
 *   latest house has itself don't count); everything else is offered unticked with the reason.
 * - Stairs: one change per floor whose flight differs; ticked when the design's flight is within 0.75 m.
 * - Doors and windows: an opening of the same kind and orientation within 0.2 m is the design's own; its
 *   style, size and height fields that differ are offered (ticked unless a new width would leave its wall
 *   or run into another opening). Hinge side, swing and open angle are never offered. A latest opening
 *   with no counterpart is offered unticked, and can't be ticked off a wall or over an opening. Openings
 *   the design has and the latest hasn't are never removed. The design's own windows still at the default
 *   sill and head are brought to the latest floor's, when all its windows share one (ticked).
 */
/**
 * The storeys' ceiling height and floor depth, as one ticked change: they are measured from the photos, and the
 * listing's window heads and eaves are set to go with them.
 */
function storeyChanges(mine: HouseModel, latest: HouseModel): LayoutChange[] {
  if (mine.ceilingHeight === latest.ceilingHeight && mine.slabThickness === latest.slabThickness) return [];
  const show = (m: HouseModel) => `${metres(m.ceilingHeight)} ceilings, ${metres(m.slabThickness)} floors`;
  return [
    {
      id: "model.storeys",
      group: "exterior",
      label: `Storey heights: ${show(mine)} → ${show(latest)}`,
      defaultSelected: true,
      available: true,
      apply: (model) => ({ ...model, ceilingHeight: latest.ceilingHeight, slabThickness: latest.slabThickness }),
    },
  ];
}

export function listingUpdates(mine: HouseModel, latest: HouseModel): LayoutChange[] {
  return [
    ...storeyChanges(mine, latest),
    ...exteriorChanges(mine, latest),
    ...fixtureChanges(mine, latest),
    ...stairChanges(mine, latest),
    ...openingChanges(mine, latest),
    ...ownWindowChanges(mine, latest),
  ];
}

/** Apply the chosen changes (by id) in order to a copy of `mine`; ids that are not on offer, or can't be applied, are ignored. */
export function applyChanges<T>(mine: T, changes: Change<T>[], selected: Iterable<string>): T {
  const ids = new Set(selected);
  return changes.filter((c) => c.available && ids.has(c.id)).reduce((acc, c) => c.apply(acc), structuredClone(mine));
}

/** Test convenience: nothing in the app calls this. `mine` with the chosen changes from `listingUpdates(mine, latest)`. Rooms, walls and the design's own fixtures are never touched. */
export function applyListingUpdates(mine: HouseModel, latest: HouseModel, selected: Iterable<string>): HouseModel {
  return applyChanges(mine, listingUpdates(mine, latest), selected);
}

/** The ids ticked by default. */
export const defaultSelection = <T>(changes: Change<T>[]): string[] => changes.filter((c) => c.available && c.defaultSelected).map((c) => c.id);

// ---------------------------------------------------------------------------------------------------------
// Which designs are based on the listing, and which version they were last brought up to

/**
 * Is this layout a design the owner started from the built-in house `listingId` (rather than the built-in
 * house itself, or a house of their own)? Yes when it says so (`basedOn`), when it still carries As listed's
 * tag (a copy made before copies dropped it), or, for a copy with neither, when its floors line up with the
 * latest house's (same scale and origin, and at least half its room names on each floor).
 */
export function isBasedOnListing(model: HouseModel | undefined, listingId: string, latest?: HouseModel): boolean {
  if (!model) return false;
  if (model.basedOn?.id === listingId || model.preset?.id === listingId) return true;
  if (model.preset || !latest) return false;
  return latest.floors.every((lf) => {
    const mf = model.floors.find((f) => f.level === lf.level);
    if (!mf || Math.abs(mf.pxPerM - lf.pxPerM) > 0.5 || Math.hypot(mf.origin.x - lf.origin.x, mf.origin.y - lf.origin.y) > 1) return false;
    const names = new Set(mf.rooms.map((r) => r.name));
    return lf.rooms.filter((r) => names.has(r.name)).length * 2 >= lf.rooms.length;
  });
}

/** The listing version a design was last brought up to (or copied at), if known. */
export function reviewedVersion(model: Pick<HouseModel, "preset" | "basedOn"> | undefined, listingId: string): number | undefined {
  if (model?.basedOn?.id === listingId) return model.basedOn.version;
  if (model?.preset?.id === listingId) return model.preset.version;
  return undefined;
}
