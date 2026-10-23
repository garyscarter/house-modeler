import type { Floor, HouseModel, Opening, Site } from "../types";
import { bbox, buildWalls, cutWall, modelBounds, pointInPolygon, polygonCentroid, roomWorldPolygon, toWorld, type V2 } from "./geometry";
import { outwardSign, wallEnds, wallThickness } from "./walls";
import { bifoldLayout, bifoldZigzag } from "./bifold";
import { bayOutline, frontUnit } from "./openings";
import { axisRect, DOUBLE_DOOR_M, doorSwing } from "./planMath";
import { floorFlight, stairTreads } from "./stairs";
import {
  changeCost,
  CONTINGENCY,
  estimateCosts,
  fmtDelta,
  fmtFt2,
  fmtGBP,
  fmtM2,
  fmtQty,
  roomArea,
  floorArea,
  type AreaReport,
  type Change,
  type RoomNote,
} from "./report";

/**
 * Exports built from the model rather than the screen: scaled plan drawings
 * as SVG, the change list as CSV, and the printable report. All pure strings
 * so they can be tested; only downloadBlob touches the DOM.
 */

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const f2 = (v: number) => (Math.round(v * 100) / 100).toString();

export interface Extent {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** World extent of a set of models, so every plan in a set is framed (and lined up) the same way. */
export function planExtent(models: HouseModel[]): Extent {
  const b = modelBounds(models.flatMap((m) => m.floors));
  return { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 };
}

/** Margin round the traced walls for wall thickness, bays and door swings, metres. */
const PAD = 0.9;
/** Printable area of A4 portrait after margins and the title block, mm. */
const FIT_W = 182;
const FIT_H = 215;
const SCALES = [50, 100, 200, 500];

/** The largest standard scale (1:50, 1:100, ...) at which the extent fits on A4 portrait. */
export function planScale(e: Extent): number {
  const w = e.x1 - e.x0 + 2 * PAD;
  const h = e.y1 - e.y0 + 2 * PAD;
  return SCALES.find((s) => (w * 1000) / s <= FIT_W && (h * 1000) / s <= FIT_H) ?? SCALES[SCALES.length - 1];
}

export interface PlanSvgOptions {
  /** Variant label for the title block, e.g. "As listed". */
  variant: string;
  /** Date for the title block, already formatted. */
  date: string;
  /** Draws a north arrow from site.frontBearing. */
  site?: Site;
  /** Scale denominator (100 = 1:100). Default: planScale of the extent. */
  scale?: number;
  /** World extent to frame. Default: this floor. */
  extent?: Extent;
  /** First line of the title block. */
  title?: string;
}

const INK = "#1f2937";
const WALL = "#2f2f2f";
const ROOM = "#faf8f3";
const FONT = "Helvetica, Arial, sans-serif";

/**
 * A scaled plan drawing of one floor: walls at their real thickness, rooms
 * with names, areas and sizes, doors with swings, windows, stairs, a north
 * arrow, a scale bar and a title block. Units are paper millimetres, so it
 * prints at the stated scale when printed at 100%.
 */
export function planSvg(model: HouseModel, floor: Floor, opts: PlanSvgOptions): string {
  const ext = opts.extent ?? floorExtent(floor);
  const scale = opts.scale ?? planScale(ext);
  const k = 1000 / scale; // paper mm per metre
  const M = 12;
  const planW = (ext.x1 - ext.x0 + 2 * PAD) * k;
  const planH = (ext.y1 - ext.y0 + 2 * PAD) * k;
  const W = Math.max(planW + 2 * M, 186);
  const footH = 30;
  const H = M + planH + 6 + footH + M;
  const ox = (W - planW) / 2 - (ext.x0 - PAD) * k;
  const oy = M - (ext.y0 - PAD) * k;
  const X = (p: V2) => f2(ox + p.x * k);
  const Y = (p: V2) => f2(oy + p.y * k);
  const pts = (ps: V2[]) => ps.map((p) => `${X(p)},${Y(p)}`).join(" ");

  const polys = floor.rooms.map((r) => roomWorldPolygon(floor, r));
  const walls = buildWalls(floor);
  const thick = walls.map(wallThickness);
  const ends = wallEnds(walls, thick);
  const H3 = model.ceilingHeight;

  const out: string[] = [];
  out.push(`<rect width="${f2(W)}" height="${f2(H)}" fill="#fff"/>`);

  // Room floors.
  out.push(`<g fill="${ROOM}" stroke="none">`);
  for (const p of polys) out.push(`<polygon points="${pts(p)}"/>`);
  out.push(`</g>`);

  // Walls: the full-height parts of each wall, extended at corners so they close.
  const wallPolys: string[] = [];
  const symbols: string[] = [];
  walls.forEach((w, i) => {
    const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    if (len < 1e-6) return;
    const dir = { x: (w.b.x - w.a.x) / len, y: (w.b.y - w.a.y) / len };
    const n = { x: -dir.y, y: dir.x };
    const t = thick[i];
    const { pieces, placements } = cutWall(w, H3);
    for (const pc of pieces) {
      if (pc.y0 > 0.01 || pc.y1 < H3 - 0.01) continue;
      let t0 = (pc.a.x - w.a.x) * dir.x + (pc.a.y - w.a.y) * dir.y;
      let t1 = (pc.b.x - w.a.x) * dir.x + (pc.b.y - w.a.y) * dir.y;
      if (t0 < 1e-3) t0 -= ends[i].ext[0];
      if (t1 > len - 1e-3) t1 += ends[i].ext[1];
      const at = (s: number, side: number) => ({ x: w.a.x + dir.x * s + n.x * side * (t / 2), y: w.a.y + dir.y * s + n.y * side * (t / 2) });
      wallPolys.push(`<polygon points="${pts([at(t0, 1), at(t1, 1), at(t1, -1), at(t0, -1)])}"/>`);
    }
    for (const pl of placements) {
      const c = { x: ox + pl.centre.x * k, y: oy + pl.centre.y * k };
      // Symbols use the opening's own frame (as the editor and 3D doors do), not the wall's direction, so hinge and swing agree.
      const od = pl.opening.orientation === "h" ? { x: 1, y: 0 } : { x: 0, y: 1 };
      const on = { x: -od.y, y: od.x };
      const outside = outwardSign({ centre: pl.centre, dir: od }, polys);
      symbols.push(
        `<g transform="matrix(${f2(od.x)} ${f2(od.y)} ${f2(on.x)} ${f2(on.y)} ${f2(c.x)} ${f2(c.y)})">${openingSymbol(pl.opening, pl.width * k, t * k, k, outside)}</g>`,
      );
    }
  });
  out.push(`<g fill="${WALL}" stroke="none">${wallPolys.join("")}</g>`);
  out.push(`<g fill="none" stroke="${INK}" stroke-width="0.18">${symbols.join("")}</g>`);

  // Stairs: treads across the flight and an arrow up it.
  if (floor.stairs) out.push(stairsSvg(model, floor, X, Y));

  // Room labels.
  out.push(`<g font-family="${FONT}" fill="${INK}" text-anchor="middle">`);
  const avoid = floor.stairs ? [stairsFrame(floor).corners] : [];
  floor.rooms.forEach((room, i) => out.push(roomLabel(floor, room, polys[i], k, avoid, X, Y)));
  out.push(`</g>`);

  // North arrow at the top right of the drawing.
  if (opts.site) out.push(northArrow(opts.site.frontBearing, W - M - 8, M + 8));

  // Footer: scale bar on the left, title block on the right.
  const fy = M + planH + 6;
  out.push(scaleBar(scale, k, M, fy + 8));
  out.push(titleBlock(W - M - 96, fy, 96, footH, [
    opts.title ?? "House plan",
    `${floor.name} · ${opts.variant}`,
    `Floor area ${fmtM2(floorArea(floor))} m² (${fmtFt2(floorArea(floor))} ft²)`,
    `Scale 1:${scale} at A4 · ${opts.date}`,
    "Traced from the listing floorplan: check on site",
  ]));

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f2(W)}mm" height="${f2(H)}mm" viewBox="0 0 ${f2(W)} ${f2(H)}">`,
    `<title>${esc(`${floor.name} (${opts.variant})`)}</title>`,
    ...out,
    `</svg>`,
  ].join("\n");
}

function floorExtent(floor: Floor): Extent {
  const b = bbox(floor.rooms.flatMap((r) => roomWorldPolygon(floor, r)));
  return Number.isFinite(b.x0) ? { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 } : { x0: -3, y0: -3, x1: 3, y1: 3 };
}

/**
 * Plan symbol for an opening in its local frame (x along the wall, y as in
 * doorSwing). Mirrors the editor's OpeningSymbol, in paper mm.
 */
function openingSymbol(o: Opening, len: number, t: number, k: number, outside: 1 | -1 | 0): string {
  const half = len / 2;
  const { hinge: hingeSide, swing } = doorSwing(o, outside);
  const breakWall = `<line x1="${f2(-half)}" y1="${f2(-t / 2)}" x2="${f2(-half)}" y2="${f2(t / 2)}"/><line x1="${f2(half)}" y1="${f2(-t / 2)}" x2="${f2(half)}" y2="${f2(t / 2)}"/>`;
  const leaf = (hx: number, r: number, toward: 1 | -1) => {
    const tipY = swing * r;
    const sweep = swing * toward > 0 ? 0 : 1;
    return `<path d="M ${f2(hx)} ${f2(tipY)} A ${f2(r)} ${f2(r)} 0 0 ${sweep} ${f2(hx + toward * r)} 0" stroke-dasharray="0.8 0.5"/><line x1="${f2(hx)}" y1="0" x2="${f2(hx)}" y2="${f2(tipY)}" stroke-width="0.4"/>`;
  };
  const glazing = (y: number) => `<line x1="${f2(-half)}" y1="${f2(y)}" x2="${f2(half)}" y2="${f2(y)}"/>`;
  switch (o.kind) {
    case "door":
      if (outside === 0 && len > DOUBLE_DOOR_M * k) return breakWall + leaf(-half, half, 1) + leaf(half, half, -1);
      return breakWall + leaf(hingeSide * half, len, hingeSide > 0 ? -1 : 1);
    case "front": {
      // The leaf swings across its own span; side lights are glazing past a mullion.
      const unit = frontUnit(o, len / k);
      const [d0, d1] = unit.door.map((x) => x * k);
      const lights = unit.lights.map(([a, b]) => {
        const mx = Math.abs(a * k + half) < 1e-6 ? b * k : a * k;
        const g = (y: number) => `<line x1="${f2(a * k)}" y1="${f2(y)}" x2="${f2(b * k)}" y2="${f2(y)}"/>`;
        return g(-t / 2) + g(0) + g(t / 2) + `<line x1="${f2(mx)}" y1="${f2(-t / 2)}" x2="${f2(mx)}" y2="${f2(t / 2)}"/>`;
      });
      return breakWall + lights.join("") + leaf(hingeSide > 0 ? d1 : d0, d1 - d0, hingeSide > 0 ? -1 : 1);
    }
    case "french":
      return breakWall + leaf(-half, half, 1) + leaf(half, half, -1);
    case "bifold": {
      const zig = bifoldZigzag(bifoldLayout(len / k, outside === 0), hingeSide, swing).map((q) => `${f2(q.x * k)},${f2(q.y * k)}`);
      return breakWall + `<polyline points="${zig.join(" ")}" stroke-width="0.4" stroke-linejoin="round"/>`;
    }
    case "window":
      return breakWall + glazing(-t / 2) + glazing(0) + glazing(t / 2);
    case "bay": {
      const s = outside || 1;
      const outline = bayOutline(len / k, t / k, o.depth).map((p) => `${f2(p.x * k)},${f2(s * p.z * k)}`);
      return breakWall + `<polygon points="${outline.join(" ")}" fill="#e0f2fe"/>` + glazing(0);
    }
    case "patio": {
      const off = Math.max(t / 5, 0.3);
      return breakWall + `<line x1="${f2(-half)}" y1="${f2(-off)}" x2="${f2(len * 0.06)}" y2="${f2(-off)}" stroke-width="0.4"/><line x1="${f2(-len * 0.06)}" y1="${f2(off)}" x2="${f2(half)}" y2="${f2(off)}" stroke-width="0.4"/>`;
    }
    case "garage": {
      const inward = -(outside || -1);
      const travel = Math.min(0.9 * k, len * 0.5);
      return (
        breakWall +
        `<line x1="${f2(-half)}" y1="0" x2="${f2(half)}" y2="0" stroke-width="${f2(Math.max(t * 0.4, 0.4))}"/>` +
        `<rect x="${f2(-half)}" y="${f2(inward > 0 ? t / 2 : -t / 2 - travel)}" width="${f2(len)}" height="${f2(travel)}" stroke-dasharray="1 0.6"/>`
      );
    }
    case "archway": {
      const lt = Math.max(0.025 * k, 0.4);
      const lining = (x: number) => `<rect x="${f2(x)}" y="${f2(-t / 2)}" width="${f2(lt)}" height="${f2(t)}" fill="#3b2418" stroke="none"/>`;
      return lining(-half) + lining(half - lt) + `<line x1="${f2(-half)}" y1="${f2(-t / 2)}" x2="${f2(half)}" y2="${f2(-t / 2)}" stroke-dasharray="0.8 0.6"/><line x1="${f2(-half)}" y1="${f2(t / 2)}" x2="${f2(half)}" y2="${f2(t / 2)}" stroke-dasharray="0.8 0.6"/>`;
    }
    case "gap":
      return `<line x1="${f2(-half)}" y1="${f2(-t / 2)}" x2="${f2(half)}" y2="${f2(-t / 2)}" stroke-dasharray="0.8 0.6"/><line x1="${f2(-half)}" y1="${f2(t / 2)}" x2="${f2(half)}" y2="${f2(t / 2)}" stroke-dasharray="0.8 0.6"/>`;
  }
}

/** The stairs' flight on the plan: its run direction, size and a point on it, world metres. */
function stairsFrame(floor: Floor) {
  const c = toWorld(floor, floor.stairs!);
  const run = floor.stairsLen ?? 2.6;
  const w = floor.stairsWidth ?? 0.9;
  const d = floor.stairsDir ?? "up";
  const ax = d === "left" ? -1 : d === "right" ? 1 : 0;
  const ay = d === "up" ? -1 : d === "down" ? 1 : 0;
  /** s along the flight (towards the top), q across it. */
  const at = (s: number, q: number): V2 => ({ x: c.x + ax * s - ay * q, y: c.y + ay * s + ax * q });
  return { run, w, ax, ay, at, corners: [at(-run / 2, -w / 2), at(run / 2, -w / 2), at(run / 2, w / 2), at(-run / 2, w / 2)] };
}

function stairsSvg(model: HouseModel, floor: Floor, X: (p: V2) => string, Y: (p: V2) => string): string {
  const { run, w, ax, ay, at, corners } = stairsFrame(floor);
  const up = model.floors.some((f) => f.level === floor.level + 1);
  const lines: string[] = [];
  lines.push(`<polygon points="${corners.map((p) => `${X(p)},${Y(p)}`).join(" ")}" fill="#fff"/>`);
  const flight = floorFlight(model, floor);
  if (flight && (flight.turn || flight.topTurn)) {
    // Winders at the foot or head: draw every tread's outline (on the floor above too, where the flight arrives).
    for (const t of stairTreads(flight)) lines.push(`<polygon points="${t.pts.map((p) => `${X(p)},${Y(p)}`).join(" ")}"/>`);
  } else {
    const steps = Math.max(6, Math.round(run / 0.25));
    for (let i = 1; i < steps; i++) {
      const s = -run / 2 + (i * run) / steps;
      const p = at(s, -w / 2);
      const q = at(s, w / 2);
      lines.push(`<line x1="${X(p)}" y1="${Y(p)}" x2="${X(q)}" y2="${Y(q)}"/>`);
    }
  }
  // Arrow along the centre line: up the flight on the floor it starts from, down it on the floor above.
  const from = at(up ? -run / 2 + 0.15 : run / 2 - 0.15, 0);
  const to = at(up ? run / 2 - 0.15 : -run / 2 + 0.15, 0);
  const dx = (up ? ax : -ax) * 1.2;
  const dy = (up ? ay : -ay) * 1.2;
  const head = [
    { x: Number(X(to)) - dx * 1.2 + dy * 0.8, y: Number(Y(to)) - dy * 1.2 - dx * 0.8 },
    { x: Number(X(to)), y: Number(Y(to)) },
    { x: Number(X(to)) - dx * 1.2 - dy * 0.8, y: Number(Y(to)) - dy * 1.2 + dx * 0.8 },
  ];
  lines.push(`<line x1="${X(from)}" y1="${Y(from)}" x2="${X(to)}" y2="${Y(to)}" stroke-width="0.3"/>`);
  lines.push(`<polyline points="${head.map((p) => `${f2(p.x)},${f2(p.y)}`).join(" ")}" stroke-width="0.3"/>`);
  lines.push(`<circle cx="${X(from)}" cy="${Y(from)}" r="0.6" fill="${INK}"/>`);
  // The word sits on the first treads, beside the arrow.
  const label = at(up ? -run / 2 + 0.4 : run / 2 - 0.4, w / 4 + 0.05);
  lines.push(
    `<text x="${X(label)}" y="${f2(Number(Y(label)) + 0.65)}" font-family="${FONT}" font-size="1.8" text-anchor="middle" fill="${INK}" stroke="none">${up ? "Up" : "Down"}</text>`,
  );
  return `<g fill="none" stroke="${INK}" stroke-width="0.15" class="stairs">${lines.join("")}</g>`;
}

function segDist(p: V2, a: V2, b: V2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}

/**
 * Where to put a room's label: the point deepest inside the room (labels are
 * wide, so room to the sides counts for half), kept off the stairs. The
 * centroid of an L-shaped room often lands in a corner or on the flight.
 */
export function labelSpot(poly: V2[], avoid: V2[][] = []): V2 {
  const b = bbox(poly);
  const squash = (p: V2) => ({ x: p.x * 0.5, y: p.y });
  const sp = poly.map(squash);
  const sa = avoid.map((o) => o.map(squash));
  const clearance = (p: V2) => {
    const q = squash(p);
    let d = Infinity;
    sp.forEach((a, i) => (d = Math.min(d, segDist(q, a, sp[(i + 1) % sp.length]))));
    for (const o of sa) {
      if (pointInPolygon(q, o)) return d * 0.2;
      o.forEach((a, i) => (d = Math.min(d, segDist(q, a, o[(i + 1) % o.length]) + 0.15)));
    }
    return d;
  };
  const c = polygonCentroid(poly);
  // A slight preference for the centroid keeps simple rooms' labels in the middle.
  let best = pointInPolygon(c, poly) ? { p: c, s: clearance(c) * 1.05 } : { p: c, s: -Infinity };
  const n = 24;
  for (let i = 1; i < n; i++) {
    for (let j = 1; j < n; j++) {
      const p = { x: b.x0 + (b.w * i) / n, y: b.y0 + (b.h * j) / n };
      if (!pointInPolygon(p, poly)) continue;
      const s = clearance(p);
      if (s > best.s) best = { p, s };
    }
  }
  return best.p;
}

/** Free length through p across (axis 1 = left-right, 0 = up-down) inside the room and off the stairs, metres. */
function freeRun(p: V2, poly: V2[], avoid: V2[][], axis: 0 | 1): number {
  const free = (q: V2) => pointInPolygon(q, poly) && !avoid.some((o) => pointInPolygon(q, o));
  const step = 0.05;
  let run = 0;
  for (const s of [1, -1]) {
    let t = step;
    while (t < 30 && free(axis ? { x: p.x + s * t, y: p.y } : { x: p.x, y: p.y + s * t })) t += step;
    run += t;
  }
  return run;
}

function roomLabel(floor: Floor, room: Floor["rooms"][number], poly: V2[], k: number, avoid: V2[][], X: (p: V2) => string, Y: (p: V2) => string): string {
  const b = bbox(poly);
  const area = roomArea(floor, room);
  const rect = axisRect(room.polygon, 1);
  const fits = (w: number) => Math.min(2.6, w / (0.62 * Math.max(4, room.name.length)));
  // Tall, narrow rooms (cupboards, corridors) take their label turned along their length.
  const turn = fits(b.w * k - 1.5) < 1.5 && b.h > b.w * 1.5;
  const c = turn ? polygonCentroid(poly) : labelSpot(poly, avoid);
  // In an L-shaped room the label only has the width of the arm it sits in.
  const availW = (turn ? b.h : freeRun(c, poly, avoid, 1)) * k - 2.5;
  const availH = (turn ? b.w : freeRun(c, poly, avoid, 0)) * k - 1;
  const lines: { text: string; size: number; bold?: boolean }[] = [];
  // Shrink the name to fit the room, down to a legible minimum.
  const nameSize = Math.max(1.5, fits(availW));
  lines.push({ text: room.name, size: nameSize, bold: true });
  const sub = Math.min(2, nameSize * 0.85);
  const areaText = `${fmtM2(area)} m² · ${fmtFt2(area)} ft²`;
  const dims = rect ? `${((rect.x1 - rect.x0) / floor.pxPerM).toFixed(2)} × ${((rect.y1 - rect.y0) / floor.pxPerM).toFixed(2)} m` : "";
  if (availW >= 0.5 * sub * areaText.length && availH >= nameSize + sub * 1.3) lines.push({ text: areaText, size: sub });
  if (dims && availW >= 0.5 * sub * dims.length && availH >= nameSize + sub * 2.6) lines.push({ text: dims, size: sub });
  const total = lines.reduce((s, l) => s + l.size * 1.25, 0);
  let y = -total / 2;
  const text = lines
    .map((l) => {
      y += l.size * 1.25;
      return `<text y="${f2(y - l.size * 0.3)}" font-size="${f2(l.size)}"${l.bold ? ` font-weight="bold"` : ` fill="#4b5563"`}>${esc(l.text)}</text>`;
    })
    .join("");
  return `<g transform="translate(${X(c)} ${Y(c)})${turn ? " rotate(-90)" : ""}">${text}</g>`;
}

/** North arrow: the front of the house (the bottom of the plan) faces frontBearing. */
function northArrow(frontBearing: number, cx: number, cy: number): string {
  // Bearings turn clockwise; "up" on the plan faces frontBearing + 180, so north is that much anticlockwise of up.
  const rot = (((180 - frontBearing) % 360) + 360) % 360;
  return (
    `<g class="north-arrow" transform="translate(${f2(cx)} ${f2(cy)})" font-family="${FONT}">` +
    `<circle r="6.5" fill="#fff" stroke="${INK}" stroke-width="0.2"/>` +
    `<g transform="rotate(${f2(rot)})"><polygon points="0,-5.5 2,2.5 0,1.2 -2,2.5" fill="${INK}"/>` +
    `<text y="-6.8" font-size="2.6" font-weight="bold" text-anchor="middle" fill="${INK}">N</text></g></g>`
  );
}

/** Alternating black and white metre blocks with labels. */
function scaleBar(scale: number, k: number, x: number, y: number): string {
  const total = scale <= 50 ? 3 : scale <= 100 ? 5 : scale <= 200 ? 10 : 20;
  const step = total / 5;
  const parts: string[] = [];
  for (let i = 0; i < 5; i++) {
    parts.push(`<rect x="${f2(x + i * step * k)}" y="${f2(y)}" width="${f2(step * k)}" height="1.6" fill="${i % 2 ? "#fff" : INK}" stroke="${INK}" stroke-width="0.2"/>`);
  }
  const labels = [0, total / 2, total].map(
    (m, i) => `<text x="${f2(x + m * k)}" y="${f2(y + 5)}" font-size="2.2" text-anchor="${i === 0 ? "start" : i === 2 ? "end" : "middle"}">${m}${i === 2 ? " m" : ""}</text>`,
  );
  return `<g id="scale-bar" class="scale-bar" font-family="${FONT}" fill="${INK}">${parts.join("")}${labels.join("")}<text x="${f2(x)}" y="${f2(y - 2)}" font-size="2.2">Scale 1:${scale}</text></g>`;
}

function titleBlock(x: number, y: number, w: number, h: number, rows: string[]): string {
  const rh = h / rows.length;
  const text = rows
    .map((r, i) => `<text x="${f2(x + 2.5)}" y="${f2(y + rh * (i + 0.68))}" font-size="${i === 0 ? 3 : i === rows.length - 1 ? 2 : 2.4}"${i < 2 ? ` font-weight="bold"` : ""}${i === rows.length - 1 ? ` fill="#6b7280"` : ""}>${esc(r)}</text>`)
    .join("");
  return `<g class="title-block" font-family="${FONT}" fill="${INK}"><rect x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${f2(h)}" fill="#fff" stroke="${INK}" stroke-width="0.3"/>${text}</g>`;
}

// ---------------------------------------------------------------------------
// CSV

/** A CSV cell: quoted when needed, and with a leading quote on text a spreadsheet would run as a formula. */
function cell(v: string | number | undefined): string {
  if (v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(Math.round(v * 100) / 100) : "";
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export const toCsv = (rows: (string | number | undefined)[][]) => rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

/** The change list with the user's rates and line costs, then the totals. */
export function changesCsv(changes: Change[], rates: Record<string, number>): string {
  const est = estimateCosts(changes, rates);
  const rows: (string | number | undefined)[][] = [["Floor", "Category", "Description", "Quantity", "Unit", "Rate (£)", "Cost (£)", "Structural advice"]];
  for (const c of changes) {
    rows.push([c.floor, c.category, c.description, c.quantity, c.unit, c.costLine ? rates[c.costLine] : undefined, changeCost(c, rates), c.structural]);
  }
  rows.push([]);
  rows.push(["", "", "Subtotal", "", "", "", est.subtotal]);
  rows.push(["", "", `Contingency${est.contingencyPct !== undefined ? ` (${est.contingencyPct}%)` : ""}`, "", "", rates[CONTINGENCY], est.contingency]);
  rows.push(["", "", "Rough estimate (from your own rates; not a quote)", "", "", "", est.total]);
  return toCsv(rows);
}

// ---------------------------------------------------------------------------
// Print view

export interface PrintInput {
  date: string;
  /** Each layout, with its own plot (for the plans' north arrow). */
  variants: { label: string; model: HouseModel; notes: RoomNote[]; site?: Site }[];
  areas: AreaReport;
  changes?: Change[];
  rates: Record<string, number>;
  /** Plot for layouts that don't carry their own. */
  site?: Site;
  /** PNG data URLs of the 3D view, with captions. */
  snapshots: { caption: string; src: string }[];
}

/** A self-contained, print-friendly HTML report: areas, changes, costs, notes and plans. */
export function printHtml(p: PrintInput): string {
  const both = p.variants.length > 1;
  const [la, lb] = [p.variants[0]?.label, p.variants[1]?.label];
  const sec: string[] = [];

  sec.push(`<header><h1>House report</h1><p class="muted">${esc(p.date)} · Areas are internal, measured to the traced wall centre lines.</p></header>`);
  if (p.snapshots.length) {
    sec.push(`<section class="shots">${p.snapshots.map((s) => `<figure><img src="${s.src}" alt=""><figcaption>${esc(s.caption)}</figcaption></figure>`).join("")}</section>`);
  }

  // Areas.
  const head = both ? `<tr><th>Room</th><th>${esc(la)} m²</th><th>${esc(lb)} m²</th><th>Change m²</th></tr>` : `<tr><th>Room</th><th>m²</th><th>ft²</th></tr>`;
  const val = (v?: number) => (v === undefined ? "–" : fmtM2(v));
  const areaRows = p.areas.floors.flatMap((f) => [
    `<tr class="floor"><th colspan="${both ? 4 : 3}">${esc(f.name)}</th></tr>`,
    ...f.rows.map((r) => {
      const name = esc(r.name) + (r.was ? ` <span class="muted">(was ${esc(r.was)})</span>` : "");
      const v = r.current ?? r.proposed ?? 0;
      return both
        ? `<tr><td>${name}</td><td>${val(r.current)}</td><td>${val(r.proposed)}</td><td>${fmtDelta((r.proposed ?? 0) - (r.current ?? 0))}</td></tr>`
        : `<tr><td>${name}</td><td>${fmtM2(v)}</td><td>${fmtFt2(v)}</td></tr>`;
    }),
    both
      ? `<tr class="total"><td>${esc(f.name)} total</td><td>${val(f.current)}</td><td>${val(f.proposed)}</td><td>${fmtDelta((f.proposed ?? 0) - (f.current ?? 0))}</td></tr>`
      : `<tr class="total"><td>${esc(f.name)} total</td><td>${fmtM2(f.current ?? f.proposed ?? 0)}</td><td>${fmtFt2(f.current ?? f.proposed ?? 0)}</td></tr>`,
  ]);
  const grand = both
    ? `<tr class="grand"><td>Whole house</td><td>${val(p.areas.current)}</td><td>${val(p.areas.proposed)}</td><td>${fmtDelta((p.areas.proposed ?? 0) - (p.areas.current ?? 0))}</td></tr>`
    : `<tr class="grand"><td>Whole house</td><td>${fmtM2(p.areas.current ?? p.areas.proposed ?? 0)}</td><td>${fmtFt2(p.areas.current ?? p.areas.proposed ?? 0)}</td></tr>`;
  sec.push(`<section><h2>Floor areas</h2><table class="areas">${head}${areaRows.join("")}${grand}</table></section>`);

  // Changes and costs.
  if (p.changes) {
    const rows = p.changes.map((c) => {
      const cost = changeCost(c, p.rates);
      return `<tr><td>${esc(c.floor)}</td><td>${esc(c.category)}</td><td>${esc(c.description)}${c.structural ? `<div class="warn">${esc(c.structural)}</div>` : ""}</td><td class="num">${esc(fmtQty(c.quantity, c.unit))}</td><td class="num">${cost === undefined ? "" : fmtGBP(cost)}</td></tr>`;
    });
    sec.push(
      `<section><h2>Changes from ${esc(la)} to ${esc(lb)}</h2>${
        p.changes.length ? `<table><tr><th>Floor</th><th>Item</th><th>Description</th><th>Qty</th><th>Cost</th></tr>${rows.join("")}</table>` : `<p class="muted">No differences found.</p>`
      }</section>`,
    );
    const est = estimateCosts(p.changes, p.rates);
    if (est.lines.length) {
      const lines = est.lines.map(
        (l) =>
          `<tr><td>${esc(l.def.label)}</td><td class="num">${esc(fmtQty(l.quantity, l.def.unit))}</td><td class="num">${l.rate === undefined ? "not set" : `${fmtGBP(l.rate)} / ${l.def.unit === "each" ? "each" : l.def.unit}`}</td><td class="num">${l.total === undefined ? "–" : fmtGBP(l.total)}</td></tr>`,
      );
      sec.push(
        `<section><h2>Rough cost estimate</h2><p class="note">From your own rates; not a quote. Get quotes from builders and advice from a structural engineer before relying on any figure.</p><table>` +
          `<tr><th>Item</th><th>Qty</th><th>Rate</th><th>Total</th></tr>${lines.join("")}` +
          `<tr class="total"><td colspan="3">Subtotal</td><td class="num">${fmtGBP(est.subtotal)}</td></tr>` +
          `<tr><td colspan="3">Contingency${est.contingencyPct !== undefined ? ` (${est.contingencyPct}%)` : " (not set)"}</td><td class="num">${fmtGBP(est.contingency)}</td></tr>` +
          `<tr class="grand"><td colspan="3">Rough estimate</td><td class="num">${fmtGBP(est.total)}</td></tr></table>` +
          (est.missing.length ? `<p class="warn">${est.missing.length} line${est.missing.length > 1 ? "s have" : " has"} no rate yet and ${est.missing.length > 1 ? "are" : "is"} left out of the total.</p>` : "") +
          `</section>`,
      );
    }
  }

  // Notes.
  const notes = p.variants.filter((v) => v.notes.length);
  sec.push(
    `<section><h2>Room notes</h2>${
      notes.length
        ? notes
            .map((v) => `<h3>${esc(v.label)}</h3><dl>${v.notes.map((n) => `<dt>${esc(n.room)} <span class="muted">· ${esc(n.floor)}</span></dt><dd>${esc(n.notes)}</dd>`).join("")}</dl>`)
            .join("")
        : `<p class="muted">No room notes.</p>`
    }</section>`,
  );

  // Plans, one per page, framed alike so floors and variants line up.
  const extent = planExtent(p.variants.map((v) => v.model));
  const scale = planScale(extent);
  for (const v of p.variants) {
    for (const f of [...v.model.floors].sort((a, b) => a.level - b.level)) {
      const svg = planSvg(v.model, f, { variant: v.label, date: p.date, site: v.site ?? p.site, extent, scale }).replace(/^<\?xml[^>]*>\n/, "");
      sec.push(`<section class="plan">${svg}</section>`);
    }
  }

  return `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>House report</title>
<style>
@page { size: A4 portrait; margin: 12mm; }
body { font: 10.5pt/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1f2937; margin: 0 auto; max-width: 190mm; padding: 12px; }
h1 { font-size: 18pt; margin: 0 0 2px; } h2 { font-size: 13pt; margin: 18px 0 6px; border-bottom: 1px solid #1f2937; padding-bottom: 2px; } h3 { font-size: 11pt; margin: 10px 0 4px; }
.muted { color: #6b7280; } .warn { color: #b45309; font-size: 9pt; } .note { background: #fefce8; border: 1px solid #fde68a; padding: 6px 8px; }
table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
th, td { text-align: left; padding: 3px 6px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
th { background: #f3f4f6; } td.num, .areas td:not(:first-child), .areas th:not(:first-child) { text-align: right; white-space: nowrap; }
tr.floor th { background: #fff; padding-top: 10px; border-bottom: 1px solid #9ca3af; }
tr.total td { font-weight: 600; } tr.grand td { font-weight: 700; border-top: 2px solid #1f2937; }
dl { margin: 0; } dt { font-weight: 600; margin-top: 6px; } dd { margin: 0 0 4px; white-space: pre-wrap; }
.shots { display: grid; grid-template-columns: repeat(auto-fit, minmax(70mm, 1fr)); gap: 6px; margin-top: 10px; }
.shots figure { margin: 0; } .shots img { width: 100%; border: 1px solid #e5e7eb; } .shots figcaption { font-size: 9pt; color: #6b7280; }
section { break-inside: avoid-page; }
section.plan { break-before: page; text-align: center; padding-top: 6px; }
section.plan svg { max-width: 100%; height: auto; }
.bar { position: sticky; top: 0; background: #fff; padding: 8px 0; border-bottom: 1px solid #e5e7eb; display: flex; gap: 8px; align-items: center; }
.bar button { font: inherit; padding: 6px 12px; border: 1px solid #2563eb; background: #2563eb; color: #fff; border-radius: 6px; }
@media print { .bar { display: none; } body { padding: 0; max-width: none; } }
</style></head><body>
<div class="bar"><button onclick="window.print()">Print / save as PDF</button><span class="muted">Choose "Save as PDF" as the printer to keep a copy. Plans print to scale at 100%.</span></div>
${sec.join("\n")}
</body></html>`;
}

// ---------------------------------------------------------------------------
// Files

/** Today's date as yyyy-mm-dd, for file names. */
export const fileDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** A file name made safe for every platform: "Floor 1 (Proposed)" -> "floor-1-proposed". */
export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "file";

/** Save a blob through a temporary link (works on desktop browsers and iOS Safari). */
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser time to start the download before the URL goes.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
