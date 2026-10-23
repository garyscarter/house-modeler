import type { BoundaryEdge, Neighbour, Site, WPt } from "../types";
import { uid } from "../types";
import type { Change } from "./layoutMerge";
import { areaOf, edgesOf, pointSegmentDistance } from "./site";
import { metres } from "./layoutMerge";

/**
 * Bring a plot's boundary treatments (fence, wall, hedge, heights, tops) up to date with another plot's
 * without touching anything else: corners, openings the owner made, surfaces and buildings stay as they are.
 */

/** An edge of the plot being updated counts as lying along a latest edge when both ends are this close (metres). */
export const MATCH_TOL = 0.05;

/** The treatment fields that follow the latest plot. `endFinish` is the owner's, so it is not here. */
const FIELDS = ["kind", "height", "top", "piers", "follow", "stepEvery"] as const;

export interface BoundaryChange {
  /** Index of the edge in the plot being updated (edge i runs from boundary[i] to boundary[i + 1]). */
  edge: number;
  from: BoundaryEdge;
  to: BoundaryEdge;
  /** Plain words, e.g. "Rear boundary: fence 1.8 m → brick wall 1.8 m". */
  label: string;
}

export interface BoundaryMerge {
  site: Site;
  changes: BoundaryChange[];
}

type PlotSide = "front" | "right" | "rear" | "left";
const SIDE_NAME: Record<PlotSide, string> = { front: "Front boundary", right: "Right boundary", rear: "Rear boundary", left: "Left boundary" };
const ORDINAL = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th", "11th", "12th"];

const signedArea = (poly: WPt[]) => poly.reduce((s, p, i) => s + p.x * poly[(i + 1) % poly.length].y - poly[(i + 1) % poly.length].x * p.y, 0) / 2;

/** Which side of the plot edge i is on, by its outward normal (plan frame: +y is the front); null for a zero-length edge. */
function sideOf(boundary: WPt[], i: number): PlotSide | null {
  const a = boundary[i];
  const b = boundary[(i + 1) % boundary.length];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1e-6) return null;
  const sign = signedArea(boundary) >= 0 ? 1 : -1;
  const nx = (sign * (b.y - a.y)) / len;
  const ny = (-sign * (b.x - a.x)) / len;
  return Math.abs(ny) >= Math.abs(nx) ? (ny > 0 ? "front" : "rear") : nx > 0 ? "right" : "left";
}

/** The index of the edge of `latest` that edge (a, b) lies along, or -1. */
function matchEdge(a: WPt, b: WPt, latest: WPt[]): number {
  if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-3) return -1;
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  let best = -1;
  let bestScore = MATCH_TOL;
  latest.forEach((p, j) => {
    const q = latest[(j + 1) % latest.length];
    if (Math.hypot(q.x - p.x, q.y - p.y) < 1e-6) return;
    const score = Math.max(pointSegmentDistance(a, p, q), pointSegmentDistance(b, p, q), pointSegmentDistance(m, p, q));
    if (score <= bestScore) {
      best = j;
      bestScore = score;
    }
  });
  return best;
}

/** A field's value with the defaults filled in, so "no top" and "coping" do not count as a difference. */
function value(e: BoundaryEdge, f: (typeof FIELDS)[number]): unknown {
  const wall = e.kind === "wall";
  switch (f) {
    case "top":
      return wall ? (e.top ?? "coping") : undefined;
    case "piers":
      return wall ? (e.piers ?? true) : undefined;
    case "follow":
    case "stepEvery":
      return e.kind === "open" ? undefined : e[f];
    case "height":
      return e.kind === "open" ? 0 : Math.round(e.height * 1000);
    default:
      return e[f];
  }
}

const differs = (a: BoundaryEdge, b: BoundaryEdge) => FIELDS.some((f) => value(a, f) !== value(b, f));


/** "brick wall 1.4 m", adding only the details that differ from `other` (so the arrow reads cleanly). */
function describe(e: BoundaryEdge, other: BoundaryEdge): string {
  if (e.kind === "open") return "opening";
  const parts: string[] = [];
  const noun = e.kind === "wall" ? (e.top === "brick" ? "brick wall" : "wall with coping") : e.kind;
  parts.push(`${noun} ${metres(e.height)}`);
  const extra: string[] = [];
  if (e.kind === "wall" && other.kind === "wall" && value(e, "piers") !== value(other, "piers")) extra.push(e.piers === false ? "no piers" : "piers");
  // Only said when this side sets it; an unset one just takes the default for the ground.
  if (e.follow && (value(e, "follow") !== value(other, "follow") || value(e, "stepEvery") !== value(other, "stepEvery"))) {
    const how = e.follow === "step" ? "stepped top" : e.follow === "rake" ? "sloping top" : "level top";
    extra.push(e.follow === "step" && e.stepEvery ? `${how}, step every ${metres(e.stepEvery)}` : how);
  }
  return extra.length ? `${parts[0]} (${extra.join(", ")})` : parts[0];
}

/** Where an edge is, in words: "Rear boundary", or "Right boundary, 2nd from the rear" when a side has several edges. */
function placeNames(boundary: WPt[]): string[] {
  const sides = boundary.map((_, i) => sideOf(boundary, i));
  return boundary.map((_, i) => {
    const side = sides[i];
    if (!side) return `Edge ${i + 1}`;
    const same = sides.map((s, j) => (s === side ? j : -1)).filter((j) => j >= 0);
    if (same.length < 2) return SIDE_NAME[side];
    const mid = (j: number) => ({ x: (boundary[j].x + boundary[(j + 1) % boundary.length].x) / 2, y: (boundary[j].y + boundary[(j + 1) % boundary.length].y) / 2 });
    const alongLeftRight = side === "front" || side === "rear";
    const sorted = [...same].sort((p, q) => (alongLeftRight ? mid(p).x - mid(q).x : mid(p).y - mid(q).y));
    const n = ORDINAL[sorted.indexOf(i)] ?? `#${sorted.indexOf(i) + 1}`;
    return `${SIDE_NAME[side]}, ${n} from the ${alongLeftRight ? "left" : "rear"}`;
  });
}

/**
 * Update the boundary treatments of `mine` from `latest`.
 *
 * Each edge of `mine` is matched to the edge of `latest` it lies along: both ends within 5 cm of that edge, so
 * a wall shortened by a widened opening, or a wall split in two, still finds its edge. Matched edges take
 * kind, height, top, piers, follow and stepEvery from `latest`. Never changed: the corners, an opening the
 * owner made (an "open" edge where `latest` has a wall), `endFinish`, surfaces, buildings and everything else.
 * Edges with no match are left alone. The result carries `latest`'s preset marker, so it is no longer
 * offered as out of date.
 */
export function mergeBoundaryTreatments(mine: Site, latest: Site): BoundaryMerge {
  const mineEdges = edgesOf(mine);
  const latestEdges = edgesOf(latest);
  const places = placeNames(mine.boundary);
  const changes: BoundaryChange[] = [];
  const edges = mineEdges.map((edge, i) => {
    const j = matchEdge(mine.boundary[i], mine.boundary[(i + 1) % mine.boundary.length], latest.boundary);
    if (j < 0) return edge;
    const source = latestEdges[j];
    if (edge.kind === "open" && source.kind !== "open") return edge;
    if (!differs(edge, source)) return edge;
    const copy: Record<string, unknown> = { ...edge };
    for (const f of FIELDS) {
      if (source[f] === undefined) delete copy[f];
      else copy[f] = source[f];
    }
    const next = copy as unknown as BoundaryEdge;
    changes.push({ edge: i, from: edge, to: next, label: `${places[i]}: ${describe(edge, next)} → ${describe(next, edge)}` });
    return next;
  });
  const site: Site = { ...structuredClone(mine), boundaryEdges: edges };
  if (latest.preset) site.preset = { ...latest.preset };
  return { site, changes };
}

/** The confirm-dialog text for one or more plots' changes; `names` labels each plot when there are several. */
export function describeBoundaryChanges(parts: { name?: string; changes: BoundaryChange[] }[]): string {
  const lines = parts.flatMap((p) => p.changes.map((c) => `• ${p.name ? `${p.name}: ` : ""}${c.label}`));
  const intro = "Update the plot's fences, walls and hedges to the latest for listing 91770873? Your corners, drive opening and other plot edits stay as they are. You can undo it.";
  if (!lines.length) return "The boundary walls and fences already match the latest for listing 91770873. Mark the plot as up to date?";
  return `${intro}\n\nThese change:\n${lines.join("\n")}`;
}

// ---------------------------------------------------------------------------------------------------------
// Neighbouring buildings

export type PlotChange = Change<Site>;

/** A neighbour moved by no more than this (metres, outline unchanged) is taken to be a correction to the listing's, and ticked. */
export const NEIGHBOUR_NUDGE_M = 0.5;

const NEIGHBOUR_FIELDS = ["eaves", "roof", "pitchDeg", "overhang", "ridgeAxis", "partySide", "color", "roofColor"] as const;
type NeighbourField = (typeof NEIGHBOUR_FIELDS)[number];
const NEIGHBOUR_WORD: Record<NeighbourField, string> = {
  eaves: "eaves height",
  roof: "roof",
  pitchDeg: "roof pitch",
  overhang: "eaves overhang",
  ridgeAxis: "ridge direction",
  partySide: "party wall side",
  color: "wall colour",
  roofColor: "roof colour",
};

/** A field with the renderer's defaults filled in (see three/Site.tsx), so "unset" and the default don't differ. */
function neighbourValue(n: Neighbour, k: NeighbourField): unknown {
  const pitched = n.roof !== "flat";
  switch (k) {
    case "pitchDeg":
      return pitched ? (n.pitchDeg ?? 35) : undefined;
    case "overhang":
      return pitched ? (n.overhang ?? 0.35) : undefined;
    case "ridgeAxis":
      return pitched ? (n.ridgeAxis ?? "auto") : undefined;
    case "partySide":
      return n.partySide ?? "none";
    default:
      return n[k];
  }
}
function showNeighbourValue(k: NeighbourField, v: unknown): string {
  if (v === undefined) return "default";
  if (k === "pitchDeg") return `${+(v as number).toFixed(1)}°`;
  if (k === "roof") return v === "hip" ? "hipped" : v === "gable" ? "gabled" : "flat";
  return typeof v === "number" ? metres(v) : String(v);
}

/** The common shift of every corner from `a` to `b`, or null when the outline itself changed. */
function shiftOf(a: WPt[], b: WPt[]): WPt | null {
  if (a.length !== b.length || !a.length) return null;
  const d = { x: b[0].x - a[0].x, y: b[0].y - a[0].y };
  return a.every((p, i) => Math.abs(b[i].x - p.x - d.x) < 0.01 && Math.abs(b[i].y - p.y - d.y) < 0.01) ? d : null;
}
const directionWords = (d: WPt) =>
  Math.abs(d.x) >= Math.abs(d.y) ? (d.x > 0 ? "to the right" : "to the left") : d.y > 0 ? "towards the street" : "towards the back";

/** Change the neighbour named `name` (the first of that name) in a copy of `site`; unchanged when there is none. */
function withNeighbour(site: Site, name: string, edit: (n: Neighbour) => Neighbour): Site {
  const i = site.neighbours.findIndex((n) => n.name === name);
  if (i < 0) return site;
  return { ...site, neighbours: site.neighbours.map((n, j) => (j === i ? edit(structuredClone(n)) : n)) };
}

/**
 * Changes to bring the neighbouring buildings of plot `mine` in line with `latest`, matched by name.
 *
 * Roof pitch, overhang, eaves height, roof shape, ridge, party side and colours that differ are offered
 * ticked (they are measurements of a building next door, which a design doesn't change). A building moved
 * by up to half a metre with its outline unchanged is ticked too; a bigger move or a new outline is offered
 * unticked, since the owner may have redrawn it. Buildings of `latest` missing from `mine` are offered,
 * unticked, to add back. Buildings only `mine` has, the boundary, surfaces and everything else are never
 * touched.
 */
export function neighbourUpdates(mine: Site, latest: Site): PlotChange[] {
  const out: PlotChange[] = [];
  for (const ln of latest.neighbours) {
    const mn = mine.neighbours.find((n) => n.name === ln.name);
    const name = ln.name;
    if (!mn) {
      out.push({
        id: `neighbour.${name}.add`,
        group: "neighbours",
        label: `Add ${name} (${+areaOf(ln.polygon).toFixed(1)} m², ${ln.roof === "flat" ? "flat roof" : `${ln.roof === "hip" ? "hipped" : "gabled"} roof`})`,
        note: "Not ticked: your plot doesn't have it, which may be on purpose.",
        defaultSelected: false,
        available: true,
        apply: (site) => ({ ...site, neighbours: [...site.neighbours, { ...structuredClone(ln), id: uid() }] }),
      });
      continue;
    }
    for (const k of NEIGHBOUR_FIELDS) {
      const from = neighbourValue(mn, k);
      const to = neighbourValue(ln, k);
      if (from === to) continue;
      out.push({
        id: `neighbour.${name}.${k}`,
        group: "neighbours",
        label: `${name}: ${NEIGHBOUR_WORD[k]} ${showNeighbourValue(k, from)} → ${showNeighbourValue(k, to)}`,
        defaultSelected: true,
        available: true,
        apply: (site) =>
          withNeighbour(site, name, (n) => {
            if (ln[k] === undefined) delete n[k];
            else (n as unknown as Record<string, unknown>)[k] = ln[k];
            return n;
          }),
      });
    }
    if (JSON.stringify(mn.polygon) !== JSON.stringify(ln.polygon)) {
      const d = shiftOf(mn.polygon, ln.polygon);
      const far = d ? Math.hypot(d.x, d.y) : Infinity;
      const tick = far <= NEIGHBOUR_NUDGE_M;
      out.push({
        id: `neighbour.${name}.polygon`,
        group: "neighbours",
        label: d
          ? `${name}: moved ${metres(far)} ${directionWords(d)}`
          : `${name}: new outline (${+areaOf(mn.polygon).toFixed(1)} m² → ${+areaOf(ln.polygon).toFixed(1)} m²)`,
        ...(tick ? {} : { note: "Not ticked: it replaces this building's outline on your plot, in case you redrew it yourself." }),
        defaultSelected: tick,
        available: true,
        apply: (site) => withNeighbour(site, name, (n) => ({ ...n, polygon: structuredClone(ln.polygon) })),
      });
    }
  }
  return out;
}
