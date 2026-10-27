import * as THREE from "three";
import type { Floor, Opening, Room, WallFinish } from "../types";
import {
  cutWall,
  roomWorldPolygon,
  windowSill,
  type OpeningPlacement,
  type V2,
  type WallSeg,
} from "../lib/geometry";
import { outwardSign, sideSpans, spanAt, wallEnds, wallFaces, wallBands, wallThickness, type FaceQuad, type FaceSlot, type RoomPoly } from "../lib/walls";
import { DEFAULT_ARCHWAY_COLOUR, DEFAULT_LINING, bayParts, boxQuads, openingParts, quadsToWorld, withHouseDoorColour, withRoomWallColours, type Box, type PartMat } from "../lib/openings";
import { coverLayout, coverTop, coverV, interiorFinish, outsideLook, splitFinish, splitQuadAtY, type InteriorFinish } from "../lib/wallCovering";
import { spansByEdge } from "../lib/featureWalls";
import { splitFaceByLine, splitLine } from "../lib/wallSplit";
import { skirtingColour } from "../lib/skirting";
import { clipUnderFlight, type FlightShape } from "../lib/stairs";
import { type MatSpec, matKey } from "./textures";

/**
 * Builds the static shell of one floor (walls, skirting, doors, windows and
 * bays) as one merged geometry per material, so a floor is a dozen draw
 * calls rather than hundreds of small meshes.
 */

export interface ShellInput {
  floor: Floor;
  walls: WallSeg[];
  /** Ceiling height and slab thickness, metres. */
  ceiling: number;
  slab: number;
  /** Room outlines of the floor above, to carry external walls up through the slab. */
  upperPolys: V2[][];
  /** Walls of the floor above: the band through the slab runs out to their outer faces. */
  upperWalls: WallSeg[];
  /** Base of external walls on the lowest floor (down to the ground), or null. */
  plinthY: number | null;
  /** Height of this floor's base, so brick courses line up between storeys. */
  baseY: number;
  wallFinish: WallFinish;
  wallColor: string;
  trimColor: string;
  /** The house's front and back door colours, for outside doors without their own. */
  doorColours: { frontDoorColor?: string; backDoorColor?: string };
  /** Draw swing doors at their open angle; off draws them all shut. */
  doorsOpen: boolean;
  /** The flight up from this floor, if any: walls it passes over stop under its treads. */
  flight?: FlightShape | null;
  /** Rooms with a lit light in them: the pane faces that look into them from the other side glow at night. */
  litRooms?: ReadonlySet<string>;
}

export interface ShellMesh {
  key: string;
  spec: MatSpec;
  geometry: THREE.BufferGeometry;
  /** Glass lets light through, so it casts no shadow. */
  castShadow: boolean;
}

export interface BayFloor {
  roomId: string | null;
  /** World plan polygon. */
  poly: V2[];
}

const SKIRTING_H = 0.1;
const SKIRTING_T = 0.018;

/** Lighten (>1) or darken (<1) a hex colour. */
export function shade(hex: string, f: number): string {
  const c = new THREE.Color(hex);
  c.r = Math.min(1, c.r * f);
  c.g = Math.min(1, c.g * f);
  c.b = Math.min(1, c.b * f);
  return "#" + c.getHexString();
}

/** Default leaf colour by kind: oak internal doors, red front and garage doors. */
function leafColour(op: Opening): string {
  if (op.color) return op.color;
  if (op.kind === "archway") return DEFAULT_ARCHWAY_COLOUR;
  return op.kind === "door" ? "#c9a26b" : "#b3202e";
}

/** Painted internal woodwork: linings, architraves and window boards unless an opening says otherwise. */
const JOINERY_WHITE = DEFAULT_LINING;

/** Material of a joinery part of an opening. */
function partSpec(mat: PartMat, op: Opening | null, trim: string, side?: 1 | -1): MatSpec {
  const frame = op?.frameColor ?? trim;
  /** The leaf colour on this side: the back side may have its own. */
  const leafBase = (): string => (side === -1 && op?.backColor ? op.backColor : op ? leafColour(op) : trim);
  switch (mat) {
    case "frame":
      return { kind: "plain", color: frame, roughness: 0.5 };
    case "joinery":
      return { kind: "plain", color: JOINERY_WHITE, roughness: 0.6 };
    case "lining":
      return { kind: "plain", color: (side === -1 ? op?.backLiningColor : undefined) ?? op?.liningColor ?? JOINERY_WHITE, roughness: 0.6 };
    case "board":
      return { kind: "plain", color: op?.boardColor ?? JOINERY_WHITE, roughness: 0.6 };
    case "glass":
      return { kind: "glass" };
    case "obscure":
      // Patterned glass you cannot see through: pale, slightly glossy.
      return { kind: "plain", color: "#c9d0d2", roughness: 0.25, metalness: 0.1 };
    case "sill":
      // Stone or concrete sills are pale; uPVC sills match the frame.
      return op?.sillStyle === "upvc" ? { kind: "plain", color: frame, roughness: 0.5 } : { kind: "plain", color: "#d6d2c8", roughness: 0.85 };
    case "leaf":
      return { kind: "plain", color: leafBase(), roughness: 0.55 };
    case "panel": {
      // Raised panels catch the light: a lighter shade, or a slightly darker one on white doors.
      const c = leafBase();
      return { kind: "plain", color: shade(c, new THREE.Color(c).getHSL({ h: 0, s: 0, l: 0 }).l > 0.8 ? 0.95 : 1.14), roughness: 0.5 };
    }
    case "groove":
      return { kind: "plain", color: shade(leafBase(), 0.55), roughness: 0.8 };
    case "metal":
      return op?.kind === "front" ? { kind: "plain", color: "#c8a24a", roughness: 0.35, metalness: 0.7 } : { kind: "plain", color: "#c9c6bf", roughness: 0.35, metalness: 0.7 };
    case "lead":
      return { kind: "plain", color: "#6b7073", roughness: 0.7 };
    case "threshold":
      return { kind: "plain", color: "#8a8a8a", roughness: 0.6 };
  }
}

/** Collects quads per material and turns each group into one indexed geometry. */
class Batcher {
  private groups = new Map<string, { spec: MatSpec; pos: number[]; nor: number[]; uv: number[]; idx: number[]; glow: number[] }>();

  /** `glow`: for glass, 1 when the face looks into a lit room (see addOpening); glass geometry carries it per vertex. */
  add(q: FaceQuad, spec: MatSpec, glow = 0) {
    const key = matKey(spec);
    let g = this.groups.get(key);
    if (!g) {
      g = { spec, pos: [], nor: [], uv: [], idx: [], glow: [] };
      this.groups.set(key, g);
    }
    const base = g.pos.length / 3;
    for (let i = 0; i < 4; i++) {
      g.pos.push(q.v[i][0], q.v[i][1], q.v[i][2]);
      g.nor.push(q.n[0], q.n[1], q.n[2]);
      g.uv.push(q.uv[i][0], q.uv[i][1]);
      if (spec.kind === "glass") g.glow.push(glow);
    }
    g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  build(): ShellMesh[] {
    return [...this.groups.entries()].map(([key, g]) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(g.pos, 3));
      geometry.setAttribute("normal", new THREE.Float32BufferAttribute(g.nor, 3));
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(g.uv, 2));
      if (g.spec.kind === "glass") geometry.setAttribute("glow", new THREE.Float32BufferAttribute(g.glow, 1));
      geometry.setIndex(g.idx);
      geometry.computeBoundingSphere();
      return { key, spec: g.spec, geometry, castShadow: g.spec.kind !== "glass" };
    });
  }
}

/** Height of a room's floor surface above the storey base, metres: finishes sit on the slab, and anything lying on the floor (rugs) starts here. */
export const FLOOR_SURFACE = 0.012;

export function buildShell(inp: ShellInput): { meshes: ShellMesh[]; bayFloors: BayFloor[] } {
  const { floor, walls, ceiling: H, trimColor } = inp;
  const rooms: RoomPoly[] = floor.rooms.map((r) => ({ id: r.id, poly: roomWorldPolygon(floor, r) }));
  const roomsById = new Map<string, Room>(floor.rooms.map((r) => [r.id, r]));
  const polys = rooms.map((r) => r.poly);
  // Only rooms with feature walls need their faces split edge by edge.
  const featurePolys = new Map(rooms.filter((r) => roomsById.get(r.id)?.wallFinishes).map((r) => [r.id, r.poly]));
  const thick = walls.map(wallThickness);
  const upperWalls = inp.upperWalls.map((w) => ({ wall: w, thickness: wallThickness(w) }));
  const ends = wallEnds(walls, thick);
  const batch = new Batcher();
  const bayFloors: BayFloor[] = [];

  const outsideSpec = (roomId: string | null, color?: string, edge?: number): MatSpec => {
    const look = outsideLook(roomId ? roomsById.get(roomId) : undefined, edge, { finish: inp.wallFinish, color: inp.wallColor });
    return { kind: "ext", finish: look.finish, color: color ?? look.color };
  };
  const finishSpec = (f: InteriorFinish): MatSpec => (f.covering === "paint" ? { kind: "paint", color: f.color } : { kind: "cover", ...f });
  /**
   * Add a wall face. A covering that stops part-way up the wall (panelling,
   * boards, splashback tiles) cuts the face at the top of the band: covering
   * below, the wall's paint above. Fitted ones are stretched to the band, and
   * start at the wall's end so panels begin at a corner.
   */
  const addFace = (q: FaceQuad, wall: WallSeg | null, op: Opening | null, sills: number[], u0: number, glow = 0) => {
    const room = q.slot.kind === "inside" && wall && !wall.color ? roomsById.get(q.slot.roomId) : undefined;
    if (q.slot.kind !== "inside" || !room) return batch.add(q, slotSpec(q.slot, wall, op), glow);
    const fin = interiorFinish(room, undefined, q.slot.edge);
    const e = q.slot.edge;
    const split = fin.covering === "paint" && e !== undefined && e < room.polygon.length ? room.wallFinishes?.[e]?.split : undefined;
    const poly = split && wall ? rooms.find((r) => r.id === room.id)?.poly : undefined;
    if (split && wall && poly && e !== undefined && poly.length > e) {
      const wl = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y) || 1;
      const d = { x: (wall.b.x - wall.a.x) / wl, y: (wall.b.y - wall.a.y) / wl };
      const uOf = (p: { x: number; y: number }) => (p.x - wall.a.x) * d.x + (p.y - wall.a.y) * d.y + u0;
      const uA = uOf(poly[e]);
      const uB = uOf(poly[(e + 1) % poly.length]);
      // The viewer looks along -n (n points into the room), y up, world z toward the front. Their right is
      // forward x up = (-f.z, 0, f.x) with f = -n, i.e. (n.z, 0, -n.x) in (x, z). If that points along the wall
      // direction, u grows to the viewer's right and the left end is the smaller u.
      const rightward = q.n[2] * d.x - q.n[0] * d.y >= 0;
      const lo = Math.min(uA, uB);
      const hi = Math.max(uA, uB);
      const top = wall.height !== undefined ? Math.min(wall.height, H) : H;
      const { below, above } = splitFaceByLine(q, rightward ? splitLine(split, lo, hi, top) : splitLine(split, hi, lo, top));
      for (const b of below) batch.add(b, finishSpec(fin));
      for (const a of above) batch.add(a, finishSpec({ covering: "paint", color: split.color }));
      return;
    }
    const layout = fin.covering === "paint" ? undefined : coverLayout(fin.covering);
    if (!layout) return batch.add(q, finishSpec(fin));
    const top = coverTop(layout, H, sills);
    const { lower, upper } = splitFinish(fin);
    const [lo, hi] = layout.band === null ? [q, null] : splitQuadAtY(q, top);
    if (lo) {
      // Texture v follows the height above the floor (not the storey's base) so panels and courses start at the floor.
      const uv = lo.uv.map(([u, v], i): [number, number] => [layout.fit ? u - u0 : u, lo.n[1] === 0 ? coverV(layout, lo.v[i][1], top) : v]);
      batch.add({ ...lo, uv }, finishSpec(lower));
    }
    if (hi) batch.add(hi, finishSpec(upper ?? lower));
  };
  const slotSpec = (slot: FaceSlot, wall: WallSeg | null, op: Opening | null): MatSpec => {
    switch (slot.kind) {
      case "inside":
        return finishSpec(interiorFinish(roomsById.get(slot.roomId), wall?.color, slot.edge));
      case "outside":
        return outsideSpec(slot.roomId, wall?.color, slot.edge);
      case "top":
        return { kind: "plain", color: "#cfcac0", roughness: 0.9 };
      case "part":
        return partSpec(slot.mat, op, trimColor, slot.side);
    }
  };

  walls.forEach((wall, i) => {
    const top = wall.height !== undefined ? Math.min(wall.height, H) : H;
    const cut = cutWall(wall, top);
    const { placements } = cut;
    const pieces = inp.flight ? clipUnderFlight(cut.pieces, inp.flight, thick[i]) : cut.pieces;
    const probe = thick[i] / 2 + 0.08;
    const spansOn = (s: 1 | -1) => spansByEdge(wall, sideSpans(wall, s, probe, rooms), (id) => featurePolys.get(id));
    const spans: [ReturnType<typeof sideSpans>, ReturnType<typeof sideSpans>] = [spansOn(1), spansOn(-1)];
    const bands = wallBands(wall, thick[i], spans, { ceiling: H, slab: inp.slab, upperPolys: inp.upperPolys, upperWalls, plinthY: inp.plinthY });
    const { quads, skirting } = wallFaces({
      wall,
      thickness: thick[i],
      ends: ends[i],
      spans,
      pieces,
      bands,
      placements,
      top,
      baseY: inp.baseY,
      skirting: wall.height === undefined,
    });
    // Sills of the wall's windows: a splashback or dado stops at a sill just under its top.
    const sills = placements.filter((pl) => pl.opening.kind === "window" || pl.opening.kind === "bay").map((pl) => pl.y0);
    const wallLen = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y) || 1;
    const u0 = (wall.a.x * (wall.b.x - wall.a.x) + wall.a.y * (wall.b.y - wall.a.y)) / wallLen;
    for (const q of quads) addFace(q, wall, null, sills, u0);

    for (const s of skirting) {
      const dx = s.b.x - s.a.x;
      const dy = s.b.y - s.a.y;
      const l = Math.hypot(dx, dy);
      if (l < 0.05) continue;
      const dir = { x: dx / l, y: dy / l };
      // Local +z is dir turned anticlockwise; push the board off the face into the room.
      const side = Math.sign(-dir.y * s.n.x + dir.x * s.n.y) || 1;
      const centre = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
      const box: Box = { mat: "joinery", p: [0, SKIRTING_H / 2, (side * SKIRTING_T) / 2], s: [l, SKIRTING_H, SKIRTING_T] };
      const boardSpec: MatSpec = { kind: "plain", color: skirtingColour(roomsById.get(s.roomId)), roughness: 0.6 };
      for (const q of boxQuads([box], { centre, dir })) batch.add(q, boardSpec);
    }

    for (const pl of placements) addOpening(pl, wall, thick[i], spans);
  });

  function addOpening(pl: OpeningPlacement, wall: WallSeg, wallT: number, spans: [ReturnType<typeof sideSpans>, ReturnType<typeof sideSpans>]) {
    const out = outwardSign(pl, polys);
    const along = (pl.centre.x - wall.a.x) * pl.dir.x + (pl.centre.y - wall.a.y) * pl.dir.y;
    // Wall colour of the room on a side of the wall (spans[0] is the +z side), for doors that match their rooms.
    const wallColour = (s: 0 | 1): string | undefined => {
      const id = spanAt(spans[s], along);
      return id ? interiorFinish(roomsById.get(id), wall.color).color : undefined;
    };
    const op = withRoomWallColours(
      withHouseDoorColour(pl.opening, inp.doorColours, out !== 0),
      out ? undefined : wallColour(0),
      out ? wallColour(out === 1 ? 1 : 0) : wallColour(1),
    );
    const frame = { centre: pl.centre, dir: pl.dir };
    // A pane face glows at night when the room behind it, seen from where the face points, has a lit light: the
    // outside face of a window into a lit room, each face of an internal pane by the room beyond it. The room on each
    // side (spans[0] is the +n side; outside is never lit, for now), then per face by its normal.
    const lit = inp.litRooms;
    const roomOn = (s: 0 | 1): string | null => (out && (s === 0) === (out === 1) ? null : spanAt(spans[s], along));
    const litOn = lit?.size ? ([roomOn(0), roomOn(1)].map((id) => !!id && lit.has(id)) as [boolean, boolean]) : [false, false];
    const glowOf = (q: FaceQuad): number => {
      if (!litOn[0] && !litOn[1]) return 0;
      const dn = q.n[0] * -pl.dir.y + q.n[2] * pl.dir.x;
      // Edges of the pane (normals along the wall or up, or the thin sides of an angled bay pane) never glow.
      if (Math.abs(dn) < 0.5 || quadMinSide(q) < 0.03) return 0;
      // A face pointing to the +n side is seen from there: the room behind it is on the -n side.
      return litOn[dn > 0 ? 1 : 0] ? 1 : 0;
    };
    let parts;
    if (op.kind === "bay" && out) {
      // The room is on the side away from outside.
      const roomId = spanAt(spans[out === 1 ? 1 : 0], along);
      parts = bayParts(pl, wallT, out, roomId, { sill: windowSill(op), plinth: inp.plinthY ?? 0, depth: op.depth });
      if (parts.bayFloor) bayFloors.push({ roomId, poly: parts.bayFloor.map((p) => toPlan(frame, p.x, p.z)) });
    } else if (op.kind === "bay") {
      // A bay on an internal wall makes no sense; draw it as a window.
      parts = openingParts({ ...pl, y0: Math.min(windowSill(op), pl.y1 - 0.1), opening: { ...op, kind: "window" } }, wallT, out);
    } else parts = openingParts(pl, wallT, out, inp.doorsOpen);
    for (const q of boxQuads(parts.boxes, frame)) addFace(q, null, op, [], 0, glowOf(q));
    for (const q of quadsToWorld(parts.quads, frame)) addFace(q, null, op, [], 0, glowOf(q));
  }

  return { meshes: batch.build(), bayFloors };
}

/** The shorter side of a quad, metres. */
function quadMinSide(q: FaceQuad): number {
  const d = (a: number, b: number) => Math.hypot(q.v[a][0] - q.v[b][0], q.v[a][1] - q.v[b][1], q.v[a][2] - q.v[b][2]);
  return Math.min(d(0, 1), d(1, 2));
}

/** Local (x along the wall, z along +n) to plan. */
function toPlan(f: { centre: V2; dir: V2 }, x: number, z: number): V2 {
  return { x: f.centre.x + f.dir.x * x - f.dir.y * z, y: f.centre.y + f.dir.y * x + f.dir.x * z };
}
