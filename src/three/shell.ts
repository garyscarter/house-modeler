import * as THREE from "three";
import type { Floor, Opening, Room, WallFinish } from "../types";
import {
  coveredIntervals,
  cutWall,
  roomWorldPolygon,
  windowSill,
  type OpeningPlacement,
  type V2,
  type WallPiece,
  type WallSeg,
} from "../lib/geometry";
import { outwardSign, sideSpans, spanAt, wallEnds, wallFaces, wallThickness, type FaceQuad, type FaceSlot, type RoomPoly } from "../lib/walls";
import { DEFAULT_ARCHWAY_COLOUR, bayParts, boxQuads, openingParts, quadsToWorld, type Box, type PartMat } from "../lib/openings";
import { interiorFinish, outsideLook } from "../lib/wallCovering";
import { spansByEdge } from "../lib/featureWalls";
import { skirtingColour } from "../lib/skirting";
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
  /** Base of external walls on the lowest floor (down to the ground), or null. */
  plinthY: number | null;
  /** Height of this floor's base, so brick courses line up between storeys. */
  baseY: number;
  wallFinish: WallFinish;
  wallColor: string;
  trimColor: string;
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
const JOINERY_WHITE = "#f3f1ea";

/** Material of a joinery part of an opening. */
function partSpec(mat: PartMat, op: Opening | null, trim: string): MatSpec {
  const frame = op?.frameColor ?? trim;
  switch (mat) {
    case "frame":
      return { kind: "plain", color: frame, roughness: 0.5 };
    case "joinery":
      return { kind: "plain", color: JOINERY_WHITE, roughness: 0.6 };
    case "lining":
      return { kind: "plain", color: op?.liningColor ?? JOINERY_WHITE, roughness: 0.6 };
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
      return { kind: "plain", color: op ? leafColour(op) : trim, roughness: 0.55 };
    case "panel": {
      // Raised panels catch the light: a lighter shade, or a slightly darker one on white doors.
      const c = op ? leafColour(op) : trim;
      return { kind: "plain", color: shade(c, new THREE.Color(c).getHSL({ h: 0, s: 0, l: 0 }).l > 0.8 ? 0.95 : 1.14), roughness: 0.5 };
    }
    case "groove":
      return { kind: "plain", color: shade(op ? leafColour(op) : trim, 0.55), roughness: 0.8 };
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
  private groups = new Map<string, { spec: MatSpec; pos: number[]; nor: number[]; uv: number[]; idx: number[] }>();

  add(q: FaceQuad, spec: MatSpec) {
    const key = matKey(spec);
    let g = this.groups.get(key);
    if (!g) {
      g = { spec, pos: [], nor: [], uv: [], idx: [] };
      this.groups.set(key, g);
    }
    const base = g.pos.length / 3;
    for (let i = 0; i < 4; i++) {
      g.pos.push(q.v[i][0], q.v[i][1], q.v[i][2]);
      g.nor.push(q.n[0], q.n[1], q.n[2]);
      g.uv.push(q.uv[i][0], q.uv[i][1]);
    }
    g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  build(): ShellMesh[] {
    return [...this.groups.entries()].map(([key, g]) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(g.pos, 3));
      geometry.setAttribute("normal", new THREE.Float32BufferAttribute(g.nor, 3));
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(g.uv, 2));
      geometry.setIndex(g.idx);
      geometry.computeBoundingSphere();
      return { key, spec: g.spec, geometry, castShadow: g.spec.kind !== "glass" };
    });
  }
}

export function buildShell(inp: ShellInput): { meshes: ShellMesh[]; bayFloors: BayFloor[] } {
  const { floor, walls, ceiling: H, trimColor } = inp;
  const rooms: RoomPoly[] = floor.rooms.map((r) => ({ id: r.id, poly: roomWorldPolygon(floor, r) }));
  const roomsById = new Map<string, Room>(floor.rooms.map((r) => [r.id, r]));
  const polys = rooms.map((r) => r.poly);
  // Only rooms with feature walls need their faces split edge by edge.
  const featurePolys = new Map(rooms.filter((r) => roomsById.get(r.id)?.wallFinishes).map((r) => [r.id, r.poly]));
  const thick = walls.map(wallThickness);
  const ends = wallEnds(walls, thick);
  const batch = new Batcher();
  const bayFloors: BayFloor[] = [];

  const outsideSpec = (roomId: string | null, color?: string, edge?: number): MatSpec => {
    const look = outsideLook(roomId ? roomsById.get(roomId) : undefined, edge, { finish: inp.wallFinish, color: inp.wallColor });
    return { kind: "ext", finish: look.finish, color: color ?? look.color };
  };
  const slotSpec = (slot: FaceSlot, wall: WallSeg | null, op: Opening | null): MatSpec => {
    switch (slot.kind) {
      case "inside": {
        const f = interiorFinish(roomsById.get(slot.roomId), wall?.color, slot.edge);
        return f.covering === "paint" ? { kind: "paint", color: f.color } : { kind: "cover", ...f };
      }
      case "outside":
        return outsideSpec(slot.roomId, wall?.color, slot.edge);
      case "top":
        return { kind: "plain", color: "#cfcac0", roughness: 0.9 };
      case "part":
        return partSpec(slot.mat, op, trimColor);
    }
  };

  walls.forEach((wall, i) => {
    const top = wall.height !== undefined ? Math.min(wall.height, H) : H;
    const { pieces, placements } = cutWall(wall, top);
    const len = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
    const at = (t: number): V2 => ({ x: wall.a.x + ((wall.b.x - wall.a.x) * t) / len, y: wall.a.y + ((wall.b.y - wall.a.y) * t) / len });
    // External walls run up through the slab where there is a floor above
    // (so the outside face is continuous between storeys) and down to the
    // ground on the lowest floor.
    const bands: WallPiece[] = [];
    if (wall.exterior && wall.height === undefined) {
      for (const [t0, t1] of coveredIntervals(wall, inp.upperPolys)) bands.push({ a: at(t0), b: at(t1), y0: H, y1: H + inp.slab });
      if (inp.plinthY !== null) bands.push({ a: wall.a, b: wall.b, y0: inp.plinthY, y1: 0 });
    }
    const probe = thick[i] / 2 + 0.08;
    const spansOn = (s: 1 | -1) => spansByEdge(wall, sideSpans(wall, s, probe, rooms), (id) => featurePolys.get(id));
    const spans: [ReturnType<typeof sideSpans>, ReturnType<typeof sideSpans>] = [spansOn(1), spansOn(-1)];
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
    for (const q of quads) batch.add(q, slotSpec(q.slot, wall, null));

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
    const op = pl.opening;
    const out = outwardSign(pl, polys);
    const frame = { centre: pl.centre, dir: pl.dir };
    let parts;
    if (op.kind === "bay" && out) {
      // The room is on the side away from outside.
      const along = (pl.centre.x - wall.a.x) * pl.dir.x + (pl.centre.y - wall.a.y) * pl.dir.y;
      const roomId = spanAt(spans[out === 1 ? 1 : 0], along);
      parts = bayParts(pl, wallT, out, roomId, { sill: windowSill(op), plinth: inp.plinthY ?? 0, depth: op.depth });
      if (parts.bayFloor) bayFloors.push({ roomId, poly: parts.bayFloor.map((p) => toPlan(frame, p.x, p.z)) });
    } else if (op.kind === "bay") {
      // A bay on an internal wall makes no sense; draw it as a window.
      parts = openingParts({ ...pl, y0: Math.min(windowSill(op), pl.y1 - 0.1), opening: { ...op, kind: "window" } }, wallT, out);
    } else parts = openingParts(pl, wallT, out);
    for (const q of boxQuads(parts.boxes, frame)) batch.add(q, slotSpec(q.slot, null, op));
    for (const q of quadsToWorld(parts.quads, frame)) batch.add(q, slotSpec(q.slot, null, op));
  }

  return { meshes: batch.build(), bayFloors };
}

/** Local (x along the wall, z along +n) to plan. */
function toPlan(f: { centre: V2; dir: V2 }, x: number, z: number): V2 {
  return { x: f.centre.x + f.dir.x * x - f.dir.y * z, y: f.centre.y + f.dir.y * x + f.dir.x * z };
}
