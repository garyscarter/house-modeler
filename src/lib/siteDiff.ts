import { SURFACE_LABEL, type BoundaryEdge, type GardenItem, type Site, type SiteSurface, type SurfaceKind, type WPt } from "../types";
import { screenKey } from "./screenBlocks";
import { COST_LINES, type Change, type CostLineId } from "./report";
import { KERBS, gardenDef, itemSize, kerbOf } from "./gardenCatalogue";
import { areaOf, edgesOf } from "./site";
import { itemsOf, runLength, steppingStones } from "./siteItems";
import { surfaceArea, surfacePerimeter } from "./surfaceCurve";

/**
 * Plot changes between two layouts: boundary treatments (walls, fences,
 * hedges and openings, side by side of the plot), garden surfaces, buildings
 * and orientation. Pure, so the report, the exports and the 3D overlay share it.
 */

/** Which side of the plot an edge is on, by its outward normal (plan frame: +y is the front). */
export type PlotSide = "front" | "right" | "rear" | "left";
const SIDES: PlotSide[] = ["front", "right", "rear", "left"];
const SIDE_LABEL: Record<PlotSide, string> = { front: "Front", right: "Right side", rear: "Rear", left: "Left side" };

/** A stretch of boundary and its treatment before and after; a missing side means no boundary ran there. */
export interface BoundaryPiece {
  a: WPt;
  b: WPt;
  length: number;
  side: PlotSide;
  before?: BoundaryEdge;
  after?: BoundaryEdge;
}

/** Points this close (metres) to a boundary line are on it. */
const LINE_TOL = 0.03;
/** Lengths and areas below these are noise. */
const LEN_TOL = 0.05;
const AREA_TOL = 0.2;
const AREA_FRAC = 0.03;
/** Change.level for site changes, after every floor. */
export const SITE_LEVEL = 1000;
export const SITE_GROUP = "Site";

interface Seg {
  a: WPt;
  b: WPt;
  len: number;
  /** Unit direction. */
  ux: number;
  uy: number;
  edge: BoundaryEdge;
  side: PlotSide;
}

const signedArea = (poly: WPt[]) => poly.reduce((s, p, i) => s + p.x * poly[(i + 1) % poly.length].y - poly[(i + 1) % poly.length].x * p.y, 0) / 2;

function segments(site: Site | undefined): Seg[] {
  if (!site || site.boundary.length < 2) return [];
  const edges = edgesOf(site);
  const sign = signedArea(site.boundary) >= 0 ? 1 : -1;
  const out: Seg[] = [];
  site.boundary.forEach((a, i) => {
    const b = site.boundary[(i + 1) % site.boundary.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) return;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    // Outward normal: (uy, -ux) for a positively wound polygon.
    const nx = sign * uy;
    const ny = -sign * ux;
    const side: PlotSide = Math.abs(ny) >= Math.abs(nx) ? (ny > 0 ? "front" : "rear") : nx > 0 ? "right" : "left";
    out.push({ a, b, len, ux, uy, edge: edges[i], side });
  });
  return out;
}

/** The stretch of `f` that lies along `e`'s line, as distances from e.a, or null when f is off the line. */
function along(e: Seg, f: Seg): [number, number] | null {
  const off = (p: WPt) => Math.abs((p.x - e.a.x) * e.uy - (p.y - e.a.y) * e.ux);
  if (off(f.a) > LINE_TOL || off(f.b) > LINE_TOL) return null;
  const t = (p: WPt) => (p.x - e.a.x) * e.ux + (p.y - e.a.y) * e.uy;
  const t0 = Math.max(0, Math.min(t(f.a), t(f.b)));
  const t1 = Math.min(e.len, Math.max(t(f.a), t(f.b)));
  return t1 - t0 > 1e-3 ? [t0, t1] : null;
}

/** Split each of `from`'s segments where `other`'s segments along the same line start and end. */
function split(from: Seg[], other: Seg[]): { seg: Seg; t0: number; t1: number; match?: Seg }[] {
  const out: { seg: Seg; t0: number; t1: number; match?: Seg }[] = [];
  for (const e of from) {
    const cover = other.flatMap((f) => {
      const r = along(e, f);
      return r ? [{ f, r }] : [];
    });
    const cuts = [...new Set([0, e.len, ...cover.flatMap((c) => c.r)])].sort((x, y) => x - y);
    for (let i = 0; i + 1 < cuts.length; i++) {
      const [t0, t1] = [cuts[i], cuts[i + 1]];
      if (t1 - t0 < 1e-3) continue;
      const mid = (t0 + t1) / 2;
      out.push({ seg: e, t0, t1, match: cover.find((c) => c.r[0] <= mid && mid <= c.r[1])?.f });
    }
  }
  return out;
}

const at = (s: Seg, t: number): WPt => ({ x: s.a.x + s.ux * t, y: s.a.y + s.uy * t });

/**
 * The two boundaries laid over each other, cut into stretches that each have
 * one treatment before and one after. Robust to added or removed corners: a
 * wall split in two by a new corner is still the same wall.
 */
export function boundaryPieces(before: Site | undefined, after: Site | undefined): BoundaryPiece[] {
  const sa = segments(before);
  const sb = segments(after);
  const pieces: BoundaryPiece[] = split(sa, sb).map(({ seg, t0, t1, match }) => ({
    a: at(seg, t0),
    b: at(seg, t1),
    length: t1 - t0,
    side: seg.side,
    before: seg.edge,
    after: match?.edge,
  }));
  for (const { seg, t0, t1, match } of split(sb, sa)) {
    if (!match) pieces.push({ a: at(seg, t0), b: at(seg, t1), length: t1 - t0, side: seg.side, after: seg.edge });
  }
  return pieces;
}

/** Same treatment: kind, height and, for walls, the top, piers and screen blocks. */
export function sameEdge(x?: BoundaryEdge, y?: BoundaryEdge): boolean {
  if (!x || !y) return x === y;
  if (x.kind !== y.kind) return false;
  if (x.kind === "open") return true;
  if (Math.abs(x.height - y.height) > 0.005) return false;
  if (x.kind !== "wall") return true;
  return (x.top ?? "coping") === (y.top ?? "coping") && (x.piers ?? true) === (y.piers ?? true) && screenKey(x.screen) === screenKey(y.screen);
}

/** Stretches whose treatment differs, for the 3D overlay. */
export const changedPieces = (before: Site | undefined, after: Site | undefined) =>
  boundaryPieces(before, after).filter((p) => p.length >= LEN_TOL && !sameEdge(p.before, p.after));

// ---------------------------------------------------------------------------
// Change list

type Kind = BoundaryEdge["kind"];
const KINDS: Kind[] = ["wall", "fence", "hedge", "open"];
const solid = (k?: Kind) => !!k && k !== "open";
const r1 = (v: number) => Math.round(v * 10) / 10;
const len = (v: number) => `${v.toFixed(1)} m`;
const m2 = (v: number) => `${v.toFixed(1)} m²`;
const TOP_LABEL = { coping: "coping", brick: "brick on edge" } as const;

/** Distance from a point to a polygon (0 inside). */
function distToPolygon(p: WPt, poly: WPt[]): number {
  let inside = false;
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j];
    const b = poly[i];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  return inside ? 0 : best;
}

/** A sentence part: "<Side> <noun> <rest>" when it leads, "<noun> <rest>" after a semicolon. */
interface Phrase {
  noun: string;
  rest: string;
}

function boundaryChanges(before: Site, after: Site): Change[] {
  const pieces = boundaryPieces(before, after);
  const drives = [...before.surfaces, ...after.surfaces].filter((s) => s.kind === "drive").map((s) => s.polygon);
  const out: Change[] = [];
  for (const side of SIDES) {
    const ps = pieces.filter((p) => p.side === side);
    const changed = ps.filter((p) => !sameEdge(p.before, p.after));
    if (changed.reduce((s, p) => s + p.length, 0) < LEN_TOL) continue;
    const sum = (f: (p: BoundaryPiece) => boolean) => ps.filter(f).reduce((s, p) => s + p.length, 0);
    const phrases: Phrase[] = [];

    // A solid treatment swapped for another along the same line ("fence to wall").
    const convOut = new Map<Kind, number>();
    const convIn = new Map<Kind, number>();
    for (const k1 of KINDS.filter(solid)) {
      for (const k2 of KINDS.filter(solid)) {
        if (k1 === k2) continue;
        const l = sum((p) => p.before?.kind === k1 && p.after?.kind === k2);
        if (l < LEN_TOL) continue;
        convOut.set(k1, (convOut.get(k1) ?? 0) + l);
        convIn.set(k2, (convIn.get(k2) ?? 0) + l);
        phrases.push({ noun: "boundary", rest: `changed from ${k1} to ${k2} (${len(l)})` });
      }
    }

    // Each treatment's length on this side, before and after.
    const isDrive = ps.some((p) => (p.before?.kind === "open" || p.after?.kind === "open") && drives.some((d) => distToPolygon({ x: (p.a.x + p.b.x) / 2, y: (p.a.y + p.b.y) / 2 }, d) <= 0.3));
    for (const k of KINDS) {
      const was = sum((p) => p.before?.kind === k) - (convOut.get(k) ?? 0);
      const now = sum((p) => p.after?.kind === k) - (convIn.get(k) ?? 0);
      const moved = sum((p) => (p.before?.kind === k) !== (p.after?.kind === k) && (!p.before || !p.after));
      const d = now - was;
      if (Math.abs(d) < LEN_TOL && moved < LEN_TOL) continue;
      const noun = k === "open" ? (isDrive ? "drive opening" : "opening") : k;
      let rest: string;
      if (was < LEN_TOL) rest = `added (${len(now)})`;
      else if (now < LEN_TOL) rest = k === "open" ? `closed (${len(was)})` : `removed (${len(was)})`;
      else if (k === "open") rest = Math.abs(d) < LEN_TOL ? "moved" : `${d > 0 ? "widened" : "narrowed"} from ${len(was)} to ${len(now)}`;
      else rest = Math.abs(d) < LEN_TOL ? `moved (${len(moved / 2)})` : d < 0 ? `shortened by ${len(-d)}` : `lengthened by ${len(d)}`;
      phrases.push({ noun, rest });
    }

    // Same treatment, new height, top or piers.
    const tweaks = new Map<string, Phrase>();
    for (const p of changed) {
      if (!p.before || !p.after || p.before.kind !== p.after.kind) continue;
      const [x, y] = [p.before, p.after];
      if (Math.abs(x.height - y.height) > 0.005) tweaks.set(`h${x.kind}${x.height}${y.height}`, { noun: x.kind, rest: `${y.height > x.height ? "raised" : "lowered"} from ${len(x.height)} to ${len(y.height)}` });
      if (x.kind === "wall" && (x.top ?? "coping") !== (y.top ?? "coping")) tweaks.set(`t${y.top}`, { noun: "wall", rest: `topped with ${TOP_LABEL[y.top ?? "coping"]} instead of ${TOP_LABEL[x.top ?? "coping"]}` });
      if (x.kind === "wall" && (x.piers ?? true) !== (y.piers ?? true)) tweaks.set(`p${y.piers}`, { noun: "wall", rest: (y.piers ?? true) ? "piers added" : "piers removed" });
      if (x.kind === "wall" && screenKey(x.screen) !== screenKey(y.screen))
        tweaks.set(`s${screenKey(y.screen)}`, { noun: "wall", rest: !y.screen ? "screen blocks removed" : !x.screen ? "screen blocks added" : "screen blocks changed" });
    }
    phrases.push(...tweaks.values());
    if (!phrases.length) continue;

    const text = phrases.map((ph, i) => (i === 0 ? `${SIDE_LABEL[side]} ${ph.noun} ${ph.rest}` : `${ph.noun} ${ph.rest}`)).join("; ");
    const wallGone = sum((p) => p.before?.kind === "wall" && p.after?.kind !== "wall");
    out.push({
      key: `site:boundary:${side}`,
      level: SITE_LEVEL,
      floor: SITE_GROUP,
      category: "Site",
      description: text,
      ...(wallGone >= LEN_TOL
        ? { quantity: r1(wallGone), unit: "m" as const, costLine: "removeGardenWall" as const }
        : { quantity: r1(changed.reduce((s, p) => s + p.length, 0)), unit: "m" as const }),
    });
  }
  return out;
}

// Surfaces

/** Surfaces laid as new hard landscaping (priced as paving). Pavement and road are public, so left out. */
const HARD = new Set<SurfaceKind>(["drive", "patio", "path"]);
const centroid = (poly: WPt[]) => poly.reduce((s, p) => ({ x: s.x + p.x / poly.length, y: s.y + p.y / poly.length }), { x: 0, y: 0 });
/** A surface as JSON without what is reported on its own (id, smoothing, edging). */
const plain = ({ id: _id, smooth: _s, kerb: _k, kerbHeight: _h, ...rest }: SiteSurface) => JSON.stringify(rest);
const significant = (a: number, b: number) => Math.abs(b - a) >= AREA_TOL && Math.abs(b - a) >= AREA_FRAC * Math.max(a, b);

function pairSurfaces(a: SiteSurface[], b: SiteSurface[]): { a?: SiteSurface; b?: SiteSurface }[] {
  const taken = new Set<SiteSurface>();
  const pairs: { a?: SiteSurface; b?: SiteSurface }[] = a.map((s) => {
    const m = b.find((t) => !taken.has(t) && t.id === s.id);
    if (m) taken.add(m);
    return { a: s, b: m };
  });
  // Unmatched ids (a surface redrawn): the same kind overlapping the old one.
  for (const p of pairs) {
    if (p.b) continue;
    const c = centroid(p.a!.polygon);
    const m = b.find((t) => !taken.has(t) && t.kind === p.a!.kind && (distToPolygon(c, t.polygon) === 0 || distToPolygon(centroid(t.polygon), p.a!.polygon) === 0));
    if (m) {
      taken.add(m);
      p.b = m;
    }
  }
  for (const t of b) if (!taken.has(t)) pairs.push({ b: t });
  return pairs;
}

function surfaceChanges(before: Site, after: Site): Change[] {
  const out: Change[] = [];
  // Where there are two of a kind (front and back lawns), say which by where it lies in the plot.
  const mid = before.boundary.length >= 3 ? centroid(before.boundary).y : 0;
  const count = (k: SurfaceKind) => Math.max(before.surfaces.filter((s) => s.kind === k).length, after.surfaces.filter((s) => s.kind === k).length);
  const name = (s: SiteSurface) => {
    const label = SURFACE_LABEL[s.kind];
    return count(s.kind) > 1 ? `${centroid(s.polygon).y > mid ? "Front" : "Back"} ${label.toLowerCase()}` : label;
  };
  const push = (key: string, c: Omit<Change, "key" | "level" | "floor" | "category">) =>
    out.push({ key: `site:surface:${key}`, level: SITE_LEVEL, floor: SITE_GROUP, category: "Site", ...c });

  /** Planted and mown ground is priced on its own lines; hard surfaces as paving. */
  const lineOf = (k: SurfaceKind): CostLineId | undefined => (HARD.has(k) ? "newPaving" : k === "lawn" ? "newLawn" : k === "bed" ? "newBed" : undefined);
  const edging = (a: SiteSurface | undefined, b: SiteSurface) => {
    const [ka, kb] = [a ? kerbOf(a) : { style: "none" as const, height: 0 }, kerbOf(b)];
    if (ka.style === kb.style || (!a && !b.kerb)) return; // new surfaces count only an edging chosen on purpose
    if (kb.style === "none") {
      push(`${b.id}:kerb`, { description: `${name(b)}: ${KERBS[ka.style].label.toLowerCase()} edging removed`, quantity: r1(surfacePerimeter(b)), unit: "m" });
      return;
    }
    push(`${b.id}:kerb`, { description: `${name(b)}: ${KERBS[kb.style].label.toLowerCase()} edging`, quantity: r1(surfacePerimeter(b)), unit: "m", costLine: "gardenEdging" });
  };

  for (const { a, b } of pairSurfaces(before.surfaces, after.surfaces)) {
    if (a && !b) {
      push(a.id, { description: `${name(a)} removed (${m2(surfaceArea(a))})`, quantity: r1(surfaceArea(a)), unit: "m²" });
      continue;
    }
    if (b && !a) {
      const area = surfaceArea(b);
      const line = lineOf(b.kind);
      push(b.id, { description: `New ${name(b).toLowerCase()} (${m2(area)})`, quantity: r1(area), unit: "m²", ...(line ? { costLine: line } : {}) });
      edging(undefined, b);
      continue;
    }
    if (!a || !b) continue;
    if (plain(a) === plain(b)) {
      edging(a, b); // smoothing and edging only: smooth alone is not a change
      continue;
    }
    const [aa, ab] = [surfaceArea(a), surfaceArea(b)];
    if (a.kind !== b.kind) {
      const line = lineOf(b.kind);
      push(b.id, {
        description: `${name(a)} changed to ${SURFACE_LABEL[b.kind].toLowerCase()} (${m2(ab)})`,
        quantity: r1(ab),
        unit: "m²",
        ...(line && line !== lineOf(a.kind) ? { costLine: line } : {}),
      });
    } else if (significant(aa, ab)) {
      const bigger = ab > aa;
      const line = lineOf(b.kind);
      push(b.id, {
        description: `${name(b)} ${bigger ? "enlarged" : "reduced"} from ${m2(aa)} to ${m2(ab)}`,
        quantity: r1(Math.abs(ab - aa)),
        unit: "m²",
        ...(bigger && line ? { costLine: line } : {}),
      });
    } else if (a.polygon.length !== b.polygon.length || a.polygon.some((p, i) => Math.hypot(p.x - b.polygon[i].x, p.y - b.polygon[i].y) > LEN_TOL)) {
      push(b.id, { description: `${name(b)} reshaped (${m2(ab)})`, quantity: r1(ab), unit: "m²" });
    } else {
      push(b.id, { description: `${name(b)} changed (${m2(ab)})`, quantity: r1(ab), unit: "m²" });
    }
    edging(a, b);
  }
  return out;
}

// Garden items

const ITEM_MATCH = 0.3;

/** Garden items added, removed, moved or resized between two layouts, with their cost lines. */
export function gardenChanges(before: Site, after: Site): Change[] {
  const out: Change[] = [];
  const A = itemsOf(before);
  const B = itemsOf(after);
  const push = (id: string, c: Omit<Change, "key" | "level" | "floor" | "category">) =>
    out.push({ key: `site:item:${id}`, level: SITE_LEVEL, floor: SITE_GROUP, category: "Garden", ...c });
  const pairs: { a?: GardenItem; b?: GardenItem }[] = [];
  const taken = new Set<GardenItem>();
  for (const a of A) {
    const m = B.find((t) => !taken.has(t) && t.id === a.id);
    if (m) taken.add(m);
    pairs.push({ a, b: m });
  }
  for (const p of pairs) {
    if (p.b) continue;
    const m = B.find((t) => !taken.has(t) && t.type === p.a!.type && Math.hypot(t.x - p.a!.x, t.y - p.a!.y) <= ITEM_MATCH && !A.some((x) => x.id === t.id));
    if (m) {
      taken.add(m);
      p.b = m;
    }
  }
  for (const t of B) if (!taken.has(t)) pairs.push({ b: t });

  const nameOf = (it: GardenItem) => gardenDef(it.type)?.name ?? it.type;
  const sizeKey = (it: GardenItem) => JSON.stringify([it.w ?? null, it.d ?? null, it.h ?? null, it.to ? runLength(it).toFixed(1) : null, it.seats ?? null]);
  for (const { a, b } of pairs) {
    if (b && !a) {
      const def = gardenDef(b.type);
      if (!def) continue;
      const sz = itemSize(b);
      // Quantity in the cost line's own unit: one each, a run's length in metres, or stones' area in m².
      const unit = COST_LINES.find((l) => l.id === def.costLine)?.unit ?? "each";
      const stones = def.run === "stones" ? steppingStones(b).length : 0;
      const quantity = unit === "m" ? r1(runLength(b)) : unit === "m²" ? (stones ? Math.round(stones * sz.w * sz.d * 100) / 100 : sz.w * sz.d) : 1;
      const tail = stones ? ` (${stones} stones, ${runLength(b).toFixed(1)} m)` : def.run ? ` (${runLength(b).toFixed(1)} m)` : "";
      push(b.id, { description: `New ${def.name}${tail}`, quantity, unit, costLine: def.costLine });
    } else if (a && !b) {
      push(a.id, { description: `Remove ${nameOf(a)}`, quantity: 1, unit: "each", costLine: "removeGardenItem" });
    } else if (a && b) {
      const moved = Math.hypot(b.x - a.x, b.y - a.y) >= ITEM_MATCH || (b.to && a.to && Math.hypot(b.to.x - a.to.x, b.to.y - a.to.y) >= ITEM_MATCH);
      if (moved) push(b.id, { description: `${nameOf(b)} moved`, quantity: 1, unit: "each" });
      else if (sizeKey(a) !== sizeKey(b)) push(b.id, { description: `${nameOf(b)} resized`, quantity: 1, unit: "each" });
    }
  }
  return out;
}

function otherChanges(before: Site, after: Site): Change[] {
  const out: Change[] = [];
  const push = (key: string, c: Omit<Change, "key" | "level" | "floor" | "category">) =>
    out.push({ key: `site:${key}`, level: SITE_LEVEL, floor: SITE_GROUP, category: "Site", ...c });
  const [pa, pb] = [before.boundary.length >= 3 ? areaOf(before.boundary) : 0, after.boundary.length >= 3 ? areaOf(after.boundary) : 0];
  if (Math.abs(pb - pa) >= 0.5) push("plot", { description: `Plot area changed from ${m2(pa)} to ${m2(pb)}`, quantity: r1(Math.abs(pb - pa)), unit: "m²" });
  // Buildings by id, then (a plot loaded afresh has new ids) by name, then by place.
  const taken = new Set<string>();
  const match = (n: Site["neighbours"][number]) => {
    const free = after.neighbours.filter((x) => !taken.has(x.id));
    const m = free.find((x) => x.id === n.id) ?? free.find((x) => x.name === n.name) ?? free.find((x) => distToPolygon(centroid(n.polygon), x.polygon) === 0);
    if (m) taken.add(m.id);
    return m;
  };
  const strip = (n: Site["neighbours"][number]) => JSON.stringify({ ...n, id: "", name: "" });
  for (const n of before.neighbours) {
    const m = match(n);
    if (!m) push(`building:${n.id}`, { description: `${n.name} removed`, quantity: 1, unit: "each" });
    else if (strip(n) !== strip(m)) push(`building:${n.id}`, { description: `${m.name} changed`, quantity: 1, unit: "each" });
  }
  for (const m of after.neighbours) if (!taken.has(m.id)) push(`building:${m.id}`, { description: `New building: ${m.name}`, quantity: 1, unit: "each" });
  if (Math.abs(after.frontBearing - before.frontBearing) >= 0.5)
    push("bearing", { description: `Orientation changed from ${Math.round(before.frontBearing)}° to ${Math.round(after.frontBearing)}°`, quantity: 1, unit: "each" });
  return out;
}

/** Everything on the plot that differs from `before` (As listed) to `after` (Proposed). */
export function diffSites(before: Site | undefined, after: Site | undefined): Change[] {
  if (!before && !after) return [];
  if (!before || !after) {
    return [{ key: "site:plot", level: SITE_LEVEL, floor: SITE_GROUP, category: "Site", description: before ? "Proposed has no plot" : "Plot added for Proposed", quantity: 1, unit: "each" }];
  }
  return [...boundaryChanges(before, after), ...surfaceChanges(before, after), ...gardenChanges(before, after), ...otherChanges(before, after)];
}
