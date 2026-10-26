import { uid, type GardenItem, type Site, type WPt } from "../types";
import { gardenDef, itemSize } from "./gardenCatalogue";
import { bbox, pointInPolygon, polygonCentroid } from "./geometry";
import type { Prism } from "./site";
import { closestOnSegment, edgesOf } from "./site";
import { surfaceHeightAt } from "./surfaceSlope";
import { surfaceArea, surfaceOutline } from "./surfaceCurve";

/**
 * Placement maths for garden items and plants (Site.items), in world metres:
 * the ground under an item, its footprint, snapping, hit tests, runs
 * (festoon strings, stepping stones, hedges) and the shade it casts.
 *
 * Chunk 0 (Björk) landed working first versions except snapItem's wall snap and itemOccluders;
 * Lily Allen owns this file and its tests (docs/garden-plan.md).
 */

/** A point in world metres with height: x right, y up (above GROUND_Y), z = plan y. */
export interface P3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Height above the ground of whatever an item at `p` stands on: the highest
 * surface top there (beds included, so a plant in a raised bed sits on its
 * soil; smooth surfaces tested against their outline), 0 where there is none.
 */
export function groundHeightAt(site: Pick<Site, "surfaces">, p: WPt): number {
  let h = 0;
  for (const s of site.surfaces) {
    if (s.polygon.length < 3 || !pointInPolygon(p, surfaceOutline(s, site.surfaces))) continue;
    h = Math.max(h, surfaceHeightAt(s, p));
  }
  return h;
}

/** The items of a site, never undefined (old saves have none). */
export const itemsOf = (site: Pick<Site, "items">): GardenItem[] => site.items ?? [];

/** Footprint polygon of an item, world metres: its rotated rectangle, a 16-gon for round entries, the run's strip for runs. */
export function itemFootprint(item: GardenItem): WPt[] {
  const def = gardenDef(item.type);
  const { w, d } = itemSize(item);
  if (item.to) {
    const dx = item.to.x - item.x;
    const dy = item.to.y - item.y;
    const len = Math.hypot(dx, dy) || 1;
    const n = { x: (-dy / len) * (w / 2), y: (dx / len) * (w / 2) };
    return [
      { x: item.x + n.x, y: item.y + n.y },
      { x: item.to.x + n.x, y: item.to.y + n.y },
      { x: item.to.x - n.x, y: item.to.y - n.y },
      { x: item.x - n.x, y: item.y - n.y },
    ];
  }
  if (def?.round) return Array.from({ length: 16 }, (_, i) => ({ x: item.x + (w / 2) * Math.cos((i / 16) * Math.PI * 2), y: item.y + (d / 2) * Math.sin((i / 16) * Math.PI * 2) }));
  const a = (item.rot * Math.PI) / 180;
  const c = Math.cos(a);
  const sn = Math.sin(a);
  return [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ].map(([x, y]) => ({ x: item.x + x * c - y * sn, y: item.y + x * sn + y * c }));
}

/** Axis-aligned bounds of an item's footprint. */
export function itemBounds(item: GardenItem): { x0: number; y0: number; x1: number; y1: number } {
  const b = bbox(itemFootprint(item));
  return { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 };
}

/** Length of a run (festoon, stones, hedge, climber), metres; 0 for an item without `to`. */
export const runLength = (item: Pick<GardenItem, "x" | "y" | "to">): number => (item.to ? Math.hypot(item.to.x - item.x, item.to.y - item.y) : 0);

/** Topmost item whose footprint holds `p` (within `tol` metres for thin runs), last drawn first; undefined if none. */
export function hitItem(items: GardenItem[], p: WPt, tol = 0.15): string | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.to) {
      const q = closestOnSegment(p, it, it.to);
      if (Math.hypot(q.x - p.x, q.y - p.y) <= Math.max(tol, itemSize(it).w / 2)) return it.id;
    } else if (pointInPolygon(p, itemFootprint(it))) return it.id;
  }
  return undefined;
}

/**
 * Where a dragged item lands: snapped to a 5 cm grid, and, for entries with
 * `wall` set, its back pulled against the nearest boundary wall or house wall
 * within `reach` metres and turned to face away from it. `houseOutline` is the
 * ground-floor outline in world metres (lib/site.ts houseOutlines).
 */
export function snapItem(
  item: GardenItem,
  p: WPt,
  site: Pick<Site, "boundary" | "boundaryEdges">,
  houseOutline: WPt[][],
  reach = 0.4,
): { x: number; y: number; rot: number } {
  const g = (v: number) => Math.round(v / 0.05) * 0.05;
  const plain = { x: g(p.x), y: g(p.y), rot: item.rot };
  const def = gardenDef(item.type);
  if (!def?.wall) return plain;
  const half = item.to ? 0 : itemSize(item).d / 2;

  let best: { dist: number; foot: WPt; n: WPt } | undefined;
  const consider = (a: WPt, b: WPt) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return;
    const foot = closestOnSegment(p, a, b);
    const dist = Math.hypot(p.x - foot.x, p.y - foot.y);
    // Unit normal on the side the point is on (a point exactly on the wall goes to the left of a to b).
    let n = { x: dy / len, y: -dx / len };
    if ((p.x - foot.x) * n.x + (p.y - foot.y) * n.y < 0) n = { x: -n.x, y: -n.y };
    const out = { x: foot.x + n.x * 0.05, y: foot.y + n.y * 0.05 };
    if (houseOutline.some((poly) => poly.length >= 3 && pointInPolygon(out, poly))) return; // inside the house: not an outside face
    if (!best || dist < best.dist) best = { dist, foot, n };
  };
  const edges = edgesOf(site);
  site.boundary.forEach((a, i) => {
    const kind = edges[i].kind;
    if (kind === "wall" || kind === "fence") consider(a, site.boundary[(i + 1) % site.boundary.length]);
  });
  for (const poly of houseOutline) poly.forEach((a, i) => consider(a, poly[(i + 1) % poly.length]));

  const hit = best as { dist: number; foot: WPt; n: WPt } | undefined;
  if (!hit || hit.dist > reach + half) return plain;
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  // Slide along the wall on the grid-free foot; stand off by half the depth so the back is flush.
  const x = r3(hit.foot.x + hit.n.x * half);
  const y = r3(hit.foot.y + hit.n.y * half);
  if (item.to) return { x, y, rot: item.rot }; // climbers and other wall runs: each end lies on the wall line
  const rot = Math.round((Math.atan2(-hit.n.x, hit.n.y) * 180) / Math.PI);
  return { x, y, rot: ((rot % 360) + 360) % 360 };
}

/** Move items by (dx, dy) metres (both ends of a run). Returns a new site. */
export function moveItems(site: Site, ids: string[], dx: number, dy: number): Site {
  const set = new Set(ids);
  const items = itemsOf(site).map((it) =>
    set.has(it.id) ? { ...it, x: it.x + dx, y: it.y + dy, ...(it.to ? { to: { x: it.to.x + dx, y: it.to.y + dy } } : {}) } : it,
  );
  return { ...site, items };
}

/** Copies of the items with new ids, offset by (dx, dy); returns the new site and the copies' ids. */
export function copyItems(site: Site, ids: string[], dx = 0.5, dy = 0.5): { site: Site; ids: string[] } {
  const set = new Set(ids);
  const copies = itemsOf(site)
    .filter((it) => set.has(it.id))
    .map((it) => ({ ...structuredClone(it), id: uid(), x: it.x + dx, y: it.y + dy, ...(it.to ? { to: { x: it.to.x + dx, y: it.to.y + dy } } : {}) }));
  return { site: { ...site, items: [...itemsOf(site), ...copies] }, ids: copies.map((c) => c.id) };
}

/**
 * The festoon string from a to b (heights above the ground) sagging `sag`
 * metres at mid-span: a catenary sampled at `n` + 1 points, ends included.
 */
export function festoonCurve(a: P3, b: P3, sag: number, n = 24): P3[] {
  // A parabola through both ends, `sag` below the chord at mid-span: close to a catenary at garden spans.
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t - 4 * sag * t * (1 - t), z: a.z + (b.z - a.z) * t };
  });
}

/** Points `pitch` apart along a curve or polyline, ends included where they fall (bulbs on a festoon). */
export function alongEvery<T extends { x: number; y: number; z?: number }>(pts: T[], pitch: number): T[] {
  if (pts.length < 2 || pitch <= 0) return pts.slice(0, 1);
  const d = (p: T, q: T) => Math.hypot(q.x - p.x, q.y - p.y, (q.z ?? 0) - (p.z ?? 0));
  const out: T[] = [pts[0]];
  let next = pitch;
  let run = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = d(pts[i - 1], pts[i]);
    while (seg > 0 && run + seg >= next - 1e-9) {
      const t = (next - run) / seg;
      const p = pts[i - 1];
      const q = pts[i];
      out.push({ ...q, x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, ...(p.z !== undefined && q.z !== undefined ? { z: p.z + (q.z - p.z) * t } : {}) });
      next += pitch;
    }
    run += seg;
  }
  return out;
}

/** Centres and turns (degrees) of the stones in a stepping-stone run, `pitch` apart from end to end. */
export function steppingStones(item: GardenItem): { x: number; y: number; rot: number }[] {
  if (!item.to) return [{ x: item.x, y: item.y, rot: item.rot }];
  const pitch = gardenDef(item.type)?.pitch ?? 0.6;
  const len = runLength(item);
  const count = Math.max(1, Math.round(len / pitch) + 1);
  const rot = (Math.atan2(item.to.y - item.y, item.to.x - item.x) * 180) / Math.PI;
  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0 : i / (count - 1);
    return { x: item.x + (item.to!.x - item.x) * t, y: item.y + (item.to!.y - item.y) * t, rot };
  });
}

/**
 * Plants and structures with `shade` as sun-study blocks: a tree's canopy as a prism raised off the ground (base =
 * 35% of its height, the clear trunk), shrubs and hedges from the ground, sheds and playhouses as boxes from the
 * ground to `h`, runs as their strip. Plants are "boundary" blocks (a point under a tree is still garden).
 */
export function itemOccluders(site: Pick<Site, "items" | "surfaces">): Prism[] {
  const out: Prism[] = [];
  for (const it of itemsOf(site)) {
    const def = gardenDef(it.type);
    if (!def?.shade) continue;
    const ground = groundHeightAt(site, it);
    const { h } = itemSize(it);
    const poly = itemFootprint(it);
    if (def.kind === "plant") {
      const tree = def.category === "Trees";
      out.push({ poly, base: ground + (tree ? 0.35 * h : 0), height: ground + h, kind: "boundary" });
    } else out.push({ poly, base: ground, height: ground + h, kind: "building" });
  }
  return out;
}

/**
 * Where a new item goes when it is added without a point (the Add button in the 3D tab, or on a phone): the
 * centre of the largest lawn or patio, else the middle of the plot. Lily Allen may refine (avoid other items).
 */
export function placeSpot(site: Pick<Site, "surfaces" | "boundary">): WPt {
  const open = site.surfaces.filter((s) => (s.kind === "lawn" || s.kind === "patio") && s.polygon.length >= 3);
  const best = open.sort((a, b) => surfaceArea(b) - surfaceArea(a))[0];
  if (best) return polygonCentroid(surfaceOutline(best));
  return site.boundary.length >= 3 ? polygonCentroid(site.boundary) : { x: 0, y: -6 };
}
