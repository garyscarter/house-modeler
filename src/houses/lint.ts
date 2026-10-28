import { buildWalls } from "../lib/geometry";
import { areaM2 } from "../lib/planMath";
import { areaSummary } from "../lib/report";
import type { Pt } from "../types";
import type { HouseDef } from "./types";

export interface LintOptions {
  /**
   * Rooms whose printed size is allowed to disagree with the tracing by more than 8%, by room name, each with the
   * reason. A name that matches no room, or a room that now passes, is itself reported, so exceptions cannot go stale.
   */
  dimsExceptions?: Record<string, string>;
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
  const tolerance = 0.08;
  /** Whole-building area against the listing figure: the app's internal area must be within this fraction. */
  const listedTolerance = 0.03;
  const exceptions = options.dimsExceptions ?? {};
  const roomNames = new Set<string>();
  const failing = new Set<string>();
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
    if (model.listedArea && pid === def.main) {
      const internal = areaSummary(model).internal;
      if (Math.abs(internal - model.listedArea) / model.listedArea > listedTolerance) {
        add(`${pid}: the internal area is ${internal.toFixed(1)} m² but the listing says ${model.listedArea.toFixed(1)} m² (more than ${Math.round(listedTolerance * 100)}% apart): the floorplan scale is probably wrong`);
      }
    }
    for (const f of model.floors) {
      const at = `${pid} / ${f.name}`;
      if (!(f.pxPerM > 0)) add(`${at}: pxPerM must be above 0`);
      for (const r of f.rooms) {
        roomNames.add(r.name);
        if (r.polygon.length < 3) add(`${at}: room "${r.name}" has fewer than 3 corners`);
        else if (!isSimplePolygon(r.polygon)) add(`${at}: room "${r.name}" crosses itself`);
        if (r.dims && r.polygon.length >= 3 && f.pxPerM > 0) {
          const printed = r.dims.w * r.dims.h;
          const traced = areaM2(r.polygon, f.pxPerM);
          if (printed > 0 && Math.abs(traced - printed) / printed > tolerance) {
            failing.add(r.name);
            if (!(r.name in exceptions)) add(`${at}: room "${r.name}" traces ${traced.toFixed(1)} m² but its printed size is ${printed.toFixed(1)} m² (more than ${Math.round(tolerance * 100)}% apart)`);
          }
        }
      }
      if (f.pxPerM > 0 && f.rooms.every((r) => r.polygon.length >= 3)) {
        const placed = buildWalls(f).reduce((n, w) => n + w.openings.length, 0);
        if (placed !== f.openings.length) add(`${at}: ${f.openings.length - placed} opening(s) are not on a room edge`);
      }
    }
  }
  for (const [name, reason] of Object.entries(exceptions)) {
    if (!reason.trim()) add(`dims exception for "${name}" needs a reason`);
    if (!roomNames.has(name)) add(`dims exception names "${name}", which is not a room`);
    else if (!failing.has(name)) add(`dims exception for "${name}" is not needed: the room is within 8% of its printed size`);
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
