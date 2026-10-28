import { buildWalls, EXT_WALL_T, WALL_T } from "../lib/geometry";
import { areaM2 } from "../lib/planMath";
import type { Pt, Room } from "../types";
import type { HouseDef } from "./types";

export interface LintOptions {
  /**
   * How far a room's inner area (the tracing on wall centre lines, moved in by half each wall's thickness) may differ
   * from its printed size, which is to the inner faces, as a fraction (default 0.08).
   */
  dimsTolerance?: number;
}

const POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/;
/** A colour value (hex, rgb(), hsl()), which can look like a postcode ("#F4F1EA") but is not one. */
const COLOUR = /^\s*(#[0-9a-f]{3,8}|(rgb|hsl)a?\([^)]*\))\s*$/i;
const STREET = /\b\d{1,4}\s+[A-Z][a-z]+\s+(Road|Street|Lane|Avenue|Close|Drive|Way)\b/;

const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
const near = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;

/** Do segments ab and cd cross or touch, other than by sharing an end point? */
function segmentsClash(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  if (near(a, c) || near(a, d) || near(b, c) || near(b, d)) return false;
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  const on = (p: Pt, q: Pt, r: Pt) => Math.abs(cross(p, q, r)) < 1e-9 && Math.min(p.x, q.x) <= r.x && r.x <= Math.max(p.x, q.x) && Math.min(p.y, q.y) <= r.y && r.y <= Math.max(p.y, q.y);
  return on(c, d, a) || on(c, d, b) || on(a, b, c) || on(a, b, d);
}

/** A polygon is simple when no two of its edges meet except neighbours at their shared corner. */
export function isSimplePolygon(poly: Pt[]): boolean {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsClash(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return false;
    }
  }
  return true;
}

/** Distance from point p to segment ab. */
function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * The area, in m², of a room's inside: its traced polygon (on wall centre lines, in pixels) with every edge moved in
 * by half its wall's thickness. This is the figure a printed room size (to the inner faces) compares with.
 * An edge is an external wall (EXT_WALL_T) when no other room on the floor touches it, else a partition (WALL_T),
 * the same split the app uses to build the walls (geometry.ts).
 */
export function innerAreaM2(room: Room, rooms: Room[], pxPerM: number): number {
  const poly = room.polygon;
  const n = poly.length;
  const sign = Math.sign(poly.reduce((s, p, i) => s + (p.x * poly[(i + 1) % n].y - poly[(i + 1) % n].x * p.y), 0)) || 1;
  const touch = 0.15 * pxPerM;
  const others = rooms.filter((r) => r !== room && r.polygon.length >= 3);
  const lines = poly.map((a, i) => {
    const b = poly[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const shared = [0.25, 0.5, 0.75].some((t) => {
      const m = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      return others.some((r) => r.polygon.some((c, j) => distToSegment(m, c, r.polygon[(j + 1) % r.polygon.length]) < touch));
    });
    const d = ((shared ? WALL_T : EXT_WALL_T) / 2) * pxPerM;
    // Inward normal: to the left of the edge for a counter-clockwise polygon (y down flips it with the sign).
    const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    const nrm = { x: -dir.y * sign, y: dir.x * sign };
    return { p: { x: a.x + nrm.x * d, y: a.y + nrm.y * d }, dir, nrm, d };
  });
  const inner = poly.map((v, i) => {
    const prev = lines[(i + n - 1) % n];
    const next = lines[i];
    const den = prev.dir.x * next.dir.y - prev.dir.y * next.dir.x;
    // Collinear neighbours: slide the corner straight in.
    if (Math.abs(den) < 1e-9) return { x: v.x + next.nrm.x * next.d, y: v.y + next.nrm.y * next.d };
    const t = ((next.p.x - prev.p.x) * next.dir.y - (next.p.y - prev.p.y) * next.dir.x) / den;
    return { x: prev.p.x + prev.dir.x * t, y: prev.p.y + prev.dir.y * t };
  });
  return areaM2(inner, pxPerM);
}

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => strings(v, out));
  return out;
}

/**
 * Check a house definition for the mistakes tracing tends to make. Returns one message per problem; an empty list
 * means the house passes. Run it from the house's own test (`expect(lintHouse(house)).toEqual([])`).
 */
export function lintHouse(def: HouseDef, options: LintOptions = {}): string[] {
  const problems: string[] = [];
  const tolerance = options.dimsTolerance ?? 0.08;
  const add = (msg: string) => problems.push(msg);
  const json: unknown[] = [{ id: def.id, name: def.name, tiles: def.tiles.map((t) => ({ ...t, caption: t.caption(0) })) }];

  for (const [pid, preset] of Object.entries(def.presets)) {
    let model;
    try {
      model = preset.build("");
    } catch (e) {
      add(`preset ${pid} does not build: ${(e as Error).message}`);
      continue;
    }
    json.push(model);
    for (const f of model.floors) {
      const at = `${pid} / ${f.name}`;
      if (!(f.pxPerM > 0)) add(`${at}: pxPerM must be above 0`);
      for (const r of f.rooms) {
        if (r.polygon.length < 3) add(`${at}: room "${r.name}" has fewer than 3 corners`);
        else if (!isSimplePolygon(r.polygon)) add(`${at}: room "${r.name}" crosses itself`);
        if (r.dims && r.polygon.length >= 3 && f.pxPerM > 0) {
          const printed = r.dims.w * r.dims.h;
          const traced = innerAreaM2(r, f.rooms, f.pxPerM);
          if (printed > 0 && Math.abs(traced - printed) / printed > tolerance) {
            add(`${at}: room "${r.name}" measures ${traced.toFixed(1)} m² inside its walls but its printed size is ${printed.toFixed(1)} m² (more than ${Math.round(tolerance * 100)}% apart)`);
          }
        }
      }
      if (f.pxPerM > 0 && f.rooms.every((r) => r.polygon.length >= 3)) {
        const placed = buildWalls(f).reduce((n, w) => n + w.openings.length, 0);
        if (placed !== f.openings.length) add(`${at}: ${f.openings.length - placed} opening(s) are not on a room edge`);
      }
    }
  }
  if (!(def.main in def.presets)) add(`main preset "${def.main}" is not in presets`);
  if (def.proposed && !(def.proposed in def.presets)) add(`proposed preset "${def.proposed}" is not in presets`);

  for (const [sid, preset] of Object.entries(def.sitePresets)) {
    try {
      json.push(preset.build());
    } catch (e) {
      add(`site preset ${sid} does not build: ${(e as Error).message}`);
    }
  }
  const siteDef = def.sitePresets[def.site];
  if (!siteDef) add(`main site "${def.site}" is not in sitePresets`);
  else {
    const site = siteDef.build();
    if (site.boundary.length < 3) add("main site: the boundary needs 3 or more corners");
    for (const k of ["latitude", "longitude", "frontBearing"] as const) {
      if (typeof site[k] !== "number" || !Number.isFinite(site[k])) add(`main site: ${k} is not set`);
    }
  }

  for (const s of strings(json)) {
    if (COLOUR.test(s)) continue;
    if (POSTCODE.test(s)) add(`looks like a postcode: "${s.slice(0, 40)}"`);
    if (STREET.test(s)) add(`looks like a street address: "${s.slice(0, 40)}"`);
  }
  return problems;
}
