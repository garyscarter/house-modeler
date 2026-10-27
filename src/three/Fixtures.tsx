import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Fixture, Floor } from "../types";
import { toWorld } from "../lib/geometry";
import { CUBE_BOARD, DEFAULT_WORKTOP, SIX_RINGS, VENTED_ZONES, burners, byId, chaiseSizes, cornerArm, cornerEnds, cornerSofaSizes, cubeGrid, type CatalogueItem, isHandleless, peninsulaOverhang, radiatorPanels, sideBySideSplit, wardrobeDoorCount, type Symbol } from "../lib/catalogue";
import { fixtureBox } from "../lib/planMath";
import { FRAME_COLOUR, FRAME_W, isPicture, type PictureFrame } from "../lib/art";
import { artTexture } from "./artTextures";
import { CUSHION_T, TOP_T, builtInLayout, isJoinery, joineryOf, shelfStack, type Joinery } from "../lib/joinery";
import type { JoineryFront } from "../types";
import { glassMaterial, inUse } from "./textures";
import { FLOOR_SURFACE, shade } from "./shell";

/**
 * Simple primitive-built furniture and fixtures, placed from the plan at their own size, colour and rotation.
 * A floor's fixtures are a few hundred small parts, so they are merged into one mesh per material (see
 * buildFixtureMeshes) rather than drawn one mesh each. Fixtures have no 3D click handling, so nothing is lost.
 */
export function Fixtures({ floor, ceiling }: { floor: Floor; ceiling: number }) {
  // Rebuilt only when the fixtures, the floor's placement or the ceiling change: not for a room colour or a wall.
  const meshes = useMemo(
    () => buildFixtureMeshes(floor, ceiling),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [floor.fixtures, floor.origin, floor.offset, floor.pxPerM, ceiling],
  );
  useEffect(() => () => meshes.forEach((m) => m.geometry.dispose()), [meshes]);
  return (
    <group>
      {meshes.map((m) => (
        <mesh key={m.key} geometry={m.geometry} material={m.material} castShadow={m.castShadow} receiveShadow />
      ))}
      {(floor.fixtures ?? []).map((f) => {
        const item = byId(f.type);
        return item && isPicture(item) ? <PrintFace key={f.id} floor={floor} fixture={f} item={item} ceiling={ceiling} /> : null;
      })}
    </group>
  );
}

/** The printed face of a picture: a textured plane just in front of the frame's backing, inside the moulding. */
function PrintFace({ floor, fixture: f, item, ceiling }: { floor: Floor; fixture: Fixture; item: CatalogueItem; ceiling: number }) {
  const b = fixtureBox(f, item, ceiling);
  const p = toWorld(floor, { x: f.x, y: f.y });
  const frame: PictureFrame = f.frame ?? "black";
  const fw = FRAME_W[frame];
  const w = Math.max(0.02, b.w - 2 * fw);
  const h = Math.max(0.02, b.h - 2 * fw);
  const texture = useMemo(() => artTexture(f.print, w, h), [f.print, w, h]);
  const geometry = useMemo(() => new THREE.PlaneGeometry(w, h), [w, h]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 }), [texture]);
  useEffect(() => () => material.dispose(), [material]);
  return (
    <group position={[p.x, b.z0, p.y]} rotation={[0, (-f.rot * Math.PI) / 180, 0]}>
      <mesh geometry={geometry} material={material} position={[0, b.h / 2, b.d / 2 + 0.001]} />
    </group>
  );
}

interface FixtureMesh {
  key: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  castShadow: boolean;
}

const _place = new THREE.Matrix4();
const _part = new THREE.Matrix4();
const _euler = new THREE.Euler();
const _quat = new THREE.Quaternion();
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _yaw = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

/** Every part of every fixture on the floor in world space, merged into one geometry per material. */
function buildFixtureMeshes(floor: Floor, ceiling: number): FixtureMesh[] {
  const groups = new Map<string, { color: string; finish: Finish; geoms: THREE.BufferGeometry[] }>();
  for (const f of floor.fixtures ?? []) {
    const item = byId(f.type);
    if (!item) continue;
    const p = toWorld(floor, { x: f.x, y: f.y });
    const b = fixtureBox(f, item, ceiling);
    _place.compose(_pos.set(p.x, b.z0, p.y), _yaw.setFromAxisAngle(_up, (-f.rot * Math.PI) / 180), _scale.set(1, 1, 1));
    const j = isJoinery(item) ? joineryOf(f, item, b) : undefined;
    const colour = isPicture(item) ? FRAME_COLOUR[f.frame ?? "black"] : (f.color ?? item.color);
    for (const pt of fixtureParts(item.symbol, b.w, b.d, b.h, colour, f.worktop ?? WORKTOP, b.z0, j, f.seat, f.front, cornerEnds(b.w, b.d, f), f.frame)) {
      const axis = pt.axis === "x" ? AXIS_X : pt.axis === "z" ? AXIS_Z : null;
      _quat.setFromEuler(axis ? _euler.set(axis[0], axis[1], axis[2]) : _euler.set(pt.tilt ?? 0, pt.rotY ?? 0, 0));
      _part.compose(_pos.set(pt.p[0], pt.p[1], pt.p[2]), _quat, pt.g === "soft" ? _scale.set(1, 1, 1) : _scale.set(pt.s[0], pt.s[1], pt.s[2]));
      const g = (pt.g === "soft" ? softGeometry(pt.s[0], pt.s[1], pt.s[2]) : GEOMETRY[pt.g]).clone().applyMatrix4(_part.premultiply(_place));
      const key = pt.c + pt.f;
      const group = groups.get(key) ?? { color: pt.c, finish: pt.f, geoms: [] };
      group.geoms.push(g);
      groups.set(key, group);
    }
  }
  const out: FixtureMesh[] = [];
  for (const [key, g] of groups) {
    // A rounded box comes without an index; mergeGeometries wants all indexed or none.
    const geoms = g.geoms.some((x) => !x.index) ? g.geoms.map((x) => (x.index ? x.toNonIndexed() : x)) : g.geoms;
    const merged = mergeGeometries(geoms);
    g.geoms.forEach((x) => x.dispose());
    if (merged) out.push({ key, geometry: merged, material: material(g.color, g.finish), castShadow: g.finish !== "glass" });
  }
  return out;
}

// Every part is a unit box, cylinder or quarter cylinder scaled into place, and
// materials are shared by colour, so a kitchen of fifty parts costs a handful
// of geometries and materials however many fixtures there are.
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 20);
/** Quarter of a unit-radius cylinder in the +x/+z quadrant, from the axis at its corner. */
const QUARTER = new THREE.CylinderGeometry(1, 1, 1, 16, 1, false, 0, Math.PI / 2);
const QUARTER_SHELL = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true, 0, Math.PI / 2);
/** A right-triangle prism, the right angle on its axis at the corner, legs along +x and +z of unit length, unit height centred on y. */
const WEDGE = (() => {
  const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(1, 0), new THREE.Vector2(0, 1)]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
  g.rotateX(Math.PI / 2);
  g.translate(0, 0.5, 0);
  // Indexed like the box and cylinder, so parts of one colour merge into a single geometry.
  return mergeVertices(g);
})();
/** A slumped bean bag body: unit size, centred on y like the cylinder, widest low down, flat on the floor, dished on top. */
const BLOB = (() => {
  const prof: [number, number][] = [
    [0, 0], [0.2, 0], [0.34, 0.015], [0.44, 0.07], [0.495, 0.17], [0.5, 0.3], [0.475, 0.45], [0.42, 0.62],
    [0.35, 0.77], [0.29, 0.88], [0.21, 0.95], [0.14, 0.94], [0.07, 0.87], [0, 0.82],
  ];
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y - 0.5)), 24);
  g.computeVertexNormals();
  return g;
})();
const BALL = new THREE.SphereGeometry(0.5, 20, 14);
const GEOMETRY = { box: BOX, cyl: CYL, quarter: QUARTER, shell: QUARTER_SHELL, wedge: WEDGE, blob: BLOB, ball: BALL };

/** Rounded boxes for cushions, mattresses and arms, cached by size to the centimetre (real size, so the radius is not squashed). */
const SOFT_LIMIT = 60;
const softCache = new Map<string, THREE.BufferGeometry>();
export function softGeometry(sx: number, sy: number, sz: number): THREE.BufferGeometry {
  const q = (v: number) => Math.max(0.01, Math.round(v * 100) / 100);
  const [x, y, z] = [q(sx), q(sy), q(sz)];
  const key = `${x},${y},${z}`;
  let g = softCache.get(key);
  if (g) {
    softCache.delete(key);
  } else {
    g = new RoundedBoxGeometry(x, y, z, 2, Math.min(0.035, 0.3 * Math.min(x, y, z)));
    if (softCache.size >= SOFT_LIMIT) {
      const oldest = softCache.keys().next().value as string;
      softCache.get(oldest)?.dispose();
      softCache.delete(oldest);
    }
  }
  softCache.set(key, g);
  return g;
}
const AXIS_X: [number, number, number] = [0, 0, Math.PI / 2];
const AXIS_Z: [number, number, number] = [Math.PI / 2, 0, 0];

type Finish = "matt" | "satin" | "gloss" | "metal" | "glass" | "mirror" | "glow";
/**
 * Materials by colour and finish, least recently used first. Colours are free-form (every colour-picker step makes
 * a new one), so the cache is bounded and an evicted material is disposed, unless a tracked scene still draws it.
 */
const MATERIAL_LIMIT = 96;
const materials = new Map<string, THREE.Material>();
function material(color: string, finish: Finish): THREE.Material {
  const key = color + finish;
  let m = materials.get(key);
  if (m) {
    materials.delete(key);
    materials.set(key, m);
  } else {
    if (finish === "glass") m = glassMaterial(color);
    else if (finish === "glow") m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2, roughness: 0.6 });
    else if (finish === "mirror") m = new THREE.MeshStandardMaterial({ color, roughness: 0.04, metalness: 1 });
    else if (finish === "metal") m = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.8 });
    else m = new THREE.MeshStandardMaterial({ color, roughness: finish === "matt" ? 0.85 : finish === "satin" ? 0.5 : 0.2 });
    materials.set(key, m);
    if (materials.size > MATERIAL_LIMIT) {
      // Free the oldest ones nothing on screen uses; a used one goes back in as young.
      const live = inUse().materials;
      for (const oldest of [...materials.keys()]) {
        if (materials.size <= MATERIAL_LIMIT) break;
        const old = materials.get(oldest)!;
        materials.delete(oldest);
        if (live.has(old)) materials.set(oldest, old);
        else old.dispose();
      }
    }
  }
  return m;
}

interface Part {
  g: keyof typeof GEOMETRY | "soft";
  /** Centre (for a quarter: the corner on its axis, at mid-height). */
  p: [number, number, number];
  s: [number, number, number];
  c: string;
  f: Finish;
  /** Axis of a cylinder (default standing, along y). */
  axis?: "x" | "z";
  /** Lean about the x axis, radians, after scaling; negative tips the top back and the front up. */
  tilt?: number;
  /** Turn about the y axis, radians, applied with tilt as rotation [tilt, rotY, 0]. */
  rotY?: number;
}

const WHITE = "#f5f5f5";
const CHROME = "#b8bcc2";
const STEEL = "#c9ccd0";
const KNOB = "#ece8df";
const WORKTOP = DEFAULT_WORKTOP;
const PLINTH = "#3f4247";
const DARK = "#1f2125";
const GLASS = "#bfe0ee";
const MARBLE = "#ece6da";
const BRASS = "#c8a24a";
const MIRROR = "#e4ecf0";
const GLOW = "#fff1d6";

/**
 * The parts of a fixture in its local frame: origin at the centre of its
 * footprint on its base, y up, back towards -z (the top of the plan).
 * `mount` is the height of that base above the floor, for parts that reach down to it.
 */
function fixtureParts(
  symbol: Symbol,
  w: number,
  d: number,
  h: number,
  color: string,
  worktopColor = WORKTOP,
  mount = 0,
  j?: Joinery,
  seat?: number,
  front?: "flat" | "curved",
  ends = { endBack: 0, endSide: 0 },
  frame?: PictureFrame,
): Part[] {
  const out: Part[] = [];
  const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, c = color, f: Finish = "matt") =>
    out.push({ g: "box", p: [x, y, z], s: [Math.max(sx, 0.001), Math.max(sy, 0.001), Math.max(sz, 0.001)], c, f });
  const cyl = (x: number, y: number, z: number, dia: number, len: number, c: string, f: Finish = "matt", axis?: "x" | "z") =>
    out.push({ g: "cyl", p: [x, y, z], s: [dia, len, dia], c, f, axis });
  /** A box leaning back by `tilt` radians about its centre (see Part.tilt). */
  const lean = (x: number, y: number, z: number, sx: number, sy: number, sz: number, tilt: number, c = color, f: Finish = "matt") =>
    out.push({ g: "box", p: [x, y, z], s: [sx, sy, sz], c, f, tilt });
  /** A box turned about the y axis by `rotY` radians (see Part.rotY). */
  const turn = (x: number, y: number, z: number, sx: number, sy: number, sz: number, rotY: number, c = color, f: Finish = "matt") =>
    out.push({ g: "box", p: [x, y, z], s: [sx, sy, sz], c, f, rotY });
  /** A rounded box (cushion, arm, mattress) of real size sx × sy × sz, optionally leaning back by `tilt`. */
  const soft = (x: number, y: number, z: number, sx: number, sy: number, sz: number, c = color, f: Finish = "matt", tilt = 0) =>
    out.push({ g: "soft", p: [x, y, z], s: [Math.max(sx, 0.01), Math.max(sy, 0.01), Math.max(sz, 0.01)], c, f, tilt });
  /** An upright elliptical drum filling w × d, from y0 to y1. */
  const drum = (y0: number, y1: number, sw: number, sd: number, c: string, f: Finish = "matt") =>
    out.push({ g: "cyl", p: [0, (y0 + y1) / 2, 0], s: [sw, Math.max(y1 - y0, 0.001), sd], c, f });
  /** Slim black legs at plan points (x, z), 0.1 m tall. */
  const legs = (pts: [number, number][]) => {
    for (const [x, z] of pts) box(x, 0.05, z, 0.03, 0.1, 0.03, DARK, "metal");
  };
  /** Seat cushions from x0 to x1 over z0..z1 on a frame top at y, with leaning back cushions when `backs`. */
  const cushions = (x0: number, x1: number, z0: number, z1: number, y: number, backs: boolean) => {
    const n = Math.max(1, Math.round((x1 - x0) / 0.75));
    const cw = (x1 - x0) / n;
    for (let i = 0; i < n; i++) {
      const cx = x0 + (i + 0.5) * cw;
      soft(cx, y + 0.07, (z0 + z1) / 2, cw - 0.03, 0.14, z1 - z0 - 0.01);
      if (backs) soft(cx, (y + 0.14 + h - 0.03) / 2, z0 + 0.09, cw - 0.04, h - 0.03 - y - 0.14, 0.16, shade(color, 1.06), "matt", -0.12);
    }
  };
  /** Door fronts with handles across a carcass face from y0 to y1, one per ~0.6 m. */
  const doors = (y0: number, y1: number, z: number, pitch = 0.6, handleAtTop = true) => {
    const n = Math.max(1, Math.round(w / pitch));
    for (let i = 1; i < n; i++) box(-w / 2 + (i * w) / n, (y0 + y1) / 2, z, 0.006, y1 - y0 - 0.02, 0.012, DARK);
    for (let i = 0; i < n; i++) {
      const cx = -w / 2 + ((i + 0.5) * w) / n;
      box(cx, handleAtTop ? y1 - 0.06 : y0 + 0.06, z + 0.012, Math.min(0.16, w / n - 0.1), 0.012, 0.02, CHROME, "metal");
    }
  };
  /** Handleless slab fronts: joints only, one door per ~0.6 m across `width`, under a J-pull shadow rail when `rail`. */
  const slabs = (y0: number, y1: number, z: number, width = w, rail = true) => {
    const n = Math.max(1, Math.round(width / 0.6));
    for (let i = 1; i < n; i++) box(-width / 2 + (i * width) / n, (y0 + y1) / 2, z, 0.004, y1 - y0, 0.012, DARK);
    if (rail) box(0, y1 - 0.02, z + 0.002, width, 0.035, 0.008, DARK, "satin");
  };
  /**
   * Door fronts across bay [x0, x1] in band [y0, y1], faces at zFront: two leaves when the bay is over 0.55 m wide
   * (one when `single`), 4 mm gaps, in the given style.
   */
  const fronts = (x0: number, x1: number, y0: number, y1: number, zFront: number, style: JoineryFront, c = color, single = false, knob = true) => {
    if (style === "open" || y1 - y0 < 0.03) return;
    const t = 0.018;
    const gap = 0.004;
    const n = single || x1 - x0 <= 0.55 ? 1 : 2;
    const lw = (x1 - x0) / n;
    const zc = zFront - t / 2;
    const hh = y1 - y0 - gap;
    const yc = (y0 + y1) / 2;
    for (let i = 0; i < n; i++) {
      const cx = x0 + (i + 0.5) * lw;
      const fw = lw - gap;
      // The meeting edge: the right edge of the left leaf, the left edge of the right leaf, the right edge when alone.
      const dir = n === 1 ? 1 : i === 0 ? 1 : -1;
      const ex = cx + dir * (fw / 2 - 0.045);
      if (style === "glass") {
        const rail = 0.05;
        box(cx, y0 + gap / 2 + rail / 2, zc, fw, rail, t, c, "satin");
        box(cx, y1 - gap / 2 - rail / 2, zc, fw, rail, t, c, "satin");
        for (const sx of [-1, 1]) box(cx + (sx * (fw - rail)) / 2, yc, zc, rail, hh - 2 * rail, t, c, "satin");
        box(cx, yc, zc, fw - 2 * rail + 0.01, hh - 2 * rail + 0.01, 0.006, GLASS, "glass");
      } else {
        box(cx, yc, zc, fw, hh, t, c, "satin");
        if (style === "shaker") {
          const rail = 0.06;
          const bw = fw - 2 * rail;
          const bh = hh - 2 * rail;
          if (bw > 0.05 && bh > 0.05) {
            const bead = shade(c, 0.93);
            for (const sy of [-1, 1]) box(cx, yc + (sy * bh) / 2, zFront + 0.003, bw, 0.009, 0.006, bead, "satin");
            for (const sx of [-1, 1]) box(cx + (sx * bw) / 2, yc, zFront + 0.003, 0.009, bh, 0.006, bead, "satin");
          }
        }
      }
      if (!knob) continue;
      if (style === "slab") box(ex, yc, zFront + 0.012, 0.012, Math.min(0.3, hh * 0.4), 0.02, CHROME, "metal");
      else cyl(ex, y0 + hh * 0.5 + (hh > 0.7 ? -hh * 0.25 : 0), zFront + 0.012, 0.032, 0.024, KNOB, "satin", "z");
    }
  };
  /** A built-in appliance face: dark glass door with a handle bar near its top. */
  const appliance = (yc: number, hh: number, z: number) => {
    box(0, yc, z + 0.005, w - 0.04, hh, 0.01, "#2a2d31", "gloss");
    box(0, yc + hh / 2 - 0.05, z + 0.03, w - 0.16, 0.02, 0.03, CHROME, "metal");
  };
  /**
   * Radiator valves at the bottom corners, on tails from the side tappings: a thermostatic head on the
   * left, a lockshield on the right, each on a pipe down to the floor.
   */
  const valves = (z: number) => {
    for (const sx of [-1, 1]) {
      const x = sx * (w / 2 + 0.03);
      box(sx * (w / 2 + 0.012), 0.03, z, 0.025, 0.016, 0.016, color, "satin");
      cyl(x, 0.03, z, 0.026, 0.05, color, "satin");
      if (sx < 0) cyl(x, 0.1, z, 0.044, 0.09, WHITE, "satin");
      else cyl(x, 0.07, z, 0.024, 0.03, color, "satin");
      if (mount > 0.01) cyl(x, (0.005 - mount) / 2, z, 0.015, mount + 0.005, color, "satin");
    }
  };
  /** A kitchen base carcass of height top, with plinth and worktop. Returns the front face z. */
  const base = (top: number, depth = d, zc = 0, worktop = worktopColor) => {
    box(0, 0.05, zc - 0.03, w - 0.02, 0.1, depth - 0.08, PLINTH);
    box(0, (0.1 + top - 0.04) / 2, zc - 0.01, w, top - 0.14, depth - 0.02, color, "satin");
    box(0, top - 0.02, zc, w, 0.04, depth, worktop, "satin");
    return zc + depth / 2 - 0.01;
  };

  switch (symbol) {
    case "bed": {
      const wood = "#8a6d4b";
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(sx * (w / 2 - 0.06), 0.06, sz * (d / 2 - 0.06), 0.1, 0.12, 0.1, wood);
      box(0, 0.21, 0, w, 0.18, d, wood);
      const mw = w - 0.06;
      const mz0 = -d / 2 + 0.06;
      const md = d - 0.09;
      soft(0, 0.4, mz0 + md / 2, mw, 0.2, md, "#f2efe8");
      // Duvet over the foot 70 % of the mattress, hanging a little down each side.
      const dl = md * 0.7;
      const dz = mz0 + md - dl / 2;
      soft(0, 0.5, dz, mw + 0.06, 0.05, dl, color);
      for (const sx of [-1, 1]) soft(sx * (mw / 2 + 0.03), 0.42, dz, 0.025, 0.2, dl, shade(color, 0.92));
      soft(0, 0.42, mz0 + md + 0.02, mw + 0.06, 0.2, 0.025, shade(color, 0.92));
      soft(0, 0.515, dz - dl / 2 + 0.06, mw + 0.05, 0.05, 0.12, shade(color, 1.12));
      // Pillows against the headboard.
      const np = w >= 1.2 ? 2 : 1;
      const pw = np === 2 ? (mw - 0.1) / 2 : mw - 0.2;
      for (let i = 0; i < np; i++) soft((i - (np - 1) / 2) * (pw + 0.04), 0.56, mz0 + 0.29, pw, 0.12, 0.45, "#faf8f4", "matt", -0.08);
      // A folded throw across the foot.
      soft(0, 0.54, d / 2 - 0.28, mw + 0.04, 0.06, 0.35, shade(color, 0.75));
      // Headboard: board plus padded panel.
      box(0, (h + 0.5) / 2, -d / 2 + 0.03, w, h + 0.5, 0.06, wood);
      soft(0, 0.62 + (h - 0.2) / 2 * 0.5, -d / 2 + 0.09, w - 0.1, (h + 0.5) * 0.45, 0.06, shade(color, 0.7));
      break;
    }
    case "cot": {
      const rail = 0.04;
      box(0, 0.3, 0, w - 0.06, 0.12, d - 0.06, WHITE);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(sx * (w / 2 - rail / 2), h / 2, sz * (d / 2 - rail / 2), rail, h, rail, color, "satin");
      for (const sz of [-1, 1]) {
        box(0, h - rail / 2, sz * (d / 2 - rail / 2), w, rail, rail, color, "satin");
        box(0, 0.2, sz * (d / 2 - rail / 2), w, rail, rail, color, "satin");
        const bars = Math.max(4, Math.round(w / 0.1));
        for (let i = 1; i < bars; i++) box(-w / 2 + (i * w) / bars, (h + 0.2) / 2, sz * (d / 2 - rail / 2), 0.02, h - 0.2, 0.02, color, "satin");
      }
      for (const sx of [-1, 1]) box(sx * (w / 2 - rail / 2), (h + 0.2) / 2, 0, rail, h - 0.2, d - 0.08, color, "satin");
      break;
    }
    case "toilet":
      box(0, 0.42, -d / 2 + 0.1, w, 0.84, 0.2, WHITE, "gloss");
      box(0, 0.2, d * 0.12, w * 0.85, 0.4, d * 0.62, WHITE, "gloss");
      box(0, 0.41, d * 0.12, w * 0.88, 0.03, d * 0.66, WHITE, "gloss");
      break;
    case "basin":
      box(0, 0.4, 0, w * 0.35, 0.8, d * 0.35, WHITE, "gloss");
      box(0, 0.8, 0, w, 0.12, d, WHITE, "gloss");
      cyl(0, 0.93, -d / 2 + 0.06, 0.03, 0.16, CHROME, "metal");
      break;
    case "vanity": {
      box(0, 0.08, -0.02, w - 0.04, 0.16, d - 0.06, PLINTH);
      box(0, (0.16 + h - 0.06) / 2, -0.01, w, h - 0.22, d - 0.02, color, "satin");
      box(0, (0.16 + h - 0.06) / 2, d / 2 - 0.01, w - 0.02, 0.006, 0.012, DARK);
      box(0, h - 0.03, 0, w, 0.06, d, WHITE, "gloss");
      box(0, h - 0.02, 0.02, w * 0.7, 0.05, d * 0.6, "#dde6ea", "gloss");
      cyl(0, h + 0.08, -d / 2 + 0.06, 0.03, 0.16, CHROME, "metal");
      break;
    }
    case "shower":
      box(0, 0.04, 0, w, 0.08, d, WHITE, "gloss");
      box(w / 2 - 0.01, 1.05, 0, 0.02, 1.95, d, GLASS, "glass");
      box(0, 1.05, d / 2 - 0.01, w, 1.95, 0.02, GLASS, "glass");
      box(0, 1.9, -d / 2 + 0.05, 0.04, 0.4, 0.04, CHROME, "metal");
      break;
    case "quadrant":
      // Tray and curved glass from the back-left corner; the walls make the straight sides.
      out.push({ g: "quarter", p: [-w / 2, 0.04, -d / 2], s: [w, 0.08, d], c: WHITE, f: "gloss" });
      out.push({ g: "shell", p: [-w / 2, 1.05, -d / 2], s: [w - 0.01, 1.9, d - 0.01], c: GLASS, f: "glass" });
      box(-w / 2 + 0.06, 1.6, -d / 2 + 0.03, 0.03, 0.9, 0.03, CHROME, "metal");
      break;
    case "bath":
      box(0, h / 2, 0, w, h, d, WHITE, "gloss");
      box(0, h - 0.03, 0, w - 0.14, 0.04, d - 0.14, "#dbe9f0", "gloss");
      cyl(w / 2 - 0.12, h + 0.08, 0, 0.03, 0.16, CHROME, "metal");
      break;
    case "mirror":
    case "mirror-lit": {
      // Frame is the full depth; the glass sits a hair proud of its front face.
      const t = 0.012;
      box(0, h / 2, 0, w, h, d, color, "metal");
      if (symbol === "mirror-lit") {
        box(0, h / 2, -d / 2 + 0.004, w + 0.04, h + 0.04, 0.008, GLOW, "glow");
        box(0, h / 2, d / 2 + 0.001, w - t * 2, h - t * 2, 0.002, MIRROR, "mirror");
      } else box(0, h / 2, d / 2 + 0.001, w - t * 2, h - t * 2, 0.002, MIRROR, "mirror");
      break;
    }
    case "mirror-round": {
      out.push({ g: "cyl", p: [0, h / 2, 0], s: [w, d, h], c: color, f: "metal", axis: "z" });
      out.push({ g: "cyl", p: [0, h / 2, d / 2 + 0.001], s: [w - 0.024, 0.002, h - 0.024], c: MIRROR, f: "mirror", axis: "z" });
      break;
    }
    case "mirror-cabinet": {
      box(0, h / 2, 0, w, h, d, color, "satin");
      const gap = 0.012;
      const n = w >= 0.5 ? 2 : 1;
      const dw = (w - gap * (n + 1)) / n;
      for (let i = 0; i < n; i++) box(-w / 2 + gap + dw / 2 + i * (dw + gap), h / 2, d / 2 + 0.001, dw, h - gap * 2, 0.002, MIRROR, "mirror");
      break;
    }
    case "towel-rail": {
      for (const sx of [-1, 1]) cyl(sx * (w / 2 - 0.015), h / 2, 0, 0.03, h, color, "metal");
      const bars = Math.max(4, Math.round(h / 0.1));
      for (let i = 0; i < bars; i++) cyl(0, 0.05 + (i * (h - 0.1)) / (bars - 1), 0, 0.018, w - 0.03, color, "metal", "x");
      break;
    }
    case "sofa": {
      const back = Math.min(0.22, d * 0.3);
      const arm = Math.min(0.16, w * 0.14);
      const frame = shade(color, 0.85);
      legs([[-w / 2 + 0.06, -d / 2 + 0.06], [w / 2 - 0.06, -d / 2 + 0.06], [-w / 2 + 0.06, d / 2 - 0.06], [w / 2 - 0.06, d / 2 - 0.06]]);
      box(0, 0.18, 0, w, 0.16, d, frame);
      for (const sx of [-1, 1]) soft(sx * (w / 2 - arm / 2), 0.36, 0, arm, 0.52, d, color);
      soft(0, (0.26 + h) / 2, -d / 2 + back / 2, w - arm * 2, h - 0.26, back, color);
      cushions(-w / 2 + arm, w / 2 - arm, -d / 2 + back, d / 2, 0.26, true);
      break;
    }
    case "corner-sofa": {
      // A run along the back and a return down the left, as on the plan.
      const { s, back, arm } = cornerSofaSizes(w, d, seat);
      const base = shade(color, 0.8);
      box(0, 0.14, -d / 2 + s / 2, w, 0.16, s, base);
      box(-w / 2 + s / 2, 0.14, s / 2, s, 0.16, d - s, base);
      legs([[-w / 2 + 0.06, -d / 2 + 0.06], [w / 2 - 0.06, -d / 2 + 0.06], [-w / 2 + 0.06, d / 2 - 0.06], [-w / 2 + s - 0.06, d / 2 - 0.06], [-w / 2 + s - 0.06, -d / 2 + s - 0.06]]);
      cushions(-w / 2 + back, w / 2 - arm, -d / 2 + back, -d / 2 + s, 0.22, false);
      // The return runs along z: lay its cushions out on a rotated frame by hand.
      const rz0 = -d / 2 + s;
      const rz1 = d / 2 - arm;
      const rn = Math.max(1, Math.round((rz1 - rz0) / 0.75));
      const rl = (rz1 - rz0) / rn;
      for (let i = 0; i < rn; i++) soft(-w / 2 + (back + s) / 2, 0.29, rz0 + (i + 0.5) * rl, s - back - 0.01, 0.14, rl - 0.03);
      const bn = Math.max(1, Math.round((w - back - arm) / 0.75));
      const bl = (w - back - arm) / bn;
      for (let i = 0; i < bn; i++) soft(-w / 2 + back + (i + 0.5) * bl, (0.36 + h - 0.03) / 2, -d / 2 + back + 0.07, bl - 0.04, h - 0.39, 0.16, shade(color, 1.06), "matt", -0.12);
      const rbn = Math.max(1, Math.round((d - s - arm) / 0.75));
      const rbl = (d - s - arm) / rbn;
      for (let i = 0; i < rbn; i++) soft(-w / 2 + back + 0.07, (0.36 + h - 0.03) / 2, rz0 + (i + 0.5) * rbl, 0.16, h - 0.39, rbl - 0.04, shade(color, 1.06), "matt", 0);
      soft(0, (0.3 + h) / 2 - 0.05, -d / 2 + back / 2, w, h - 0.3, back);
      soft(-w / 2 + back / 2, (0.3 + h) / 2 - 0.05, back / 2, back, h - 0.3, d - back);
      soft(w / 2 - arm / 2, 0.36, -d / 2 + s / 2, arm, 0.52, s);
      soft(-w / 2 + s / 2, 0.36, d / 2 - arm / 2, s, 0.52, arm);
      break;
    }
    case "low-sofa": {
      const back = Math.min(0.2, d * 0.25);
      const arm = Math.min(0.14, w * 0.1);
      const frame = shade(color, 0.85);
      legs([[-w / 2 + 0.06, -d / 2 + 0.06], [w / 2 - 0.06, -d / 2 + 0.06], [-w / 2 + 0.06, d / 2 - 0.06], [w / 2 - 0.06, d / 2 - 0.06]]);
      box(0, 0.18, 0, w, 0.16, d, frame);
      for (const sx of [-1, 1]) soft(sx * (w / 2 - arm / 2), 0.38, 0, arm, 0.24, d, color);
      soft(0, (0.26 + h) / 2, -d / 2 + back / 2, w - arm * 2, h - 0.26, back, color);
      cushions(-w / 2 + arm, w / 2 - arm, -d / 2 + back, d / 2, 0.26, true);
      break;
    }
    case "chaise-sofa": {
      const { s, c, back, arm } = chaiseSizes(w, d, seat);
      const frame = shade(color, 0.85);
      legs([[-w / 2 + 0.06, -d / 2 + 0.06], [w / 2 - 0.06, -d / 2 + 0.06], [-w / 2 + 0.06, -d / 2 + s - 0.06], [w / 2 - 0.06, d / 2 - 0.06], [w / 2 - c + 0.06, d / 2 - 0.06]]);
      box(0, 0.18, -d / 2 + s / 2, w, 0.16, s, frame);
      box(w / 2 - c / 2, 0.18, s / 2, c, 0.16, d - s, frame);
      box(-w / 2 + arm / 2, 0.38, -d / 2 + s / 2, arm, 0.24, s, color);
      box(w / 2 - arm / 2, 0.38, 0, arm, 0.24, d, color);
      box(0, (0.26 + h) / 2, -d / 2 + back / 2, w - arm * 2, h - 0.26, back, color);
      cushions(-w / 2 + arm, w / 2 - c, -d / 2 + back, -d / 2 + s, 0.26, true);
      cushions(w / 2 - c, w / 2 - arm, -d / 2 + back, d / 2, 0.26, true);
      break;
    }
    case "lounge-chair": {
      // Swivel base, a walnut seat and back shell, leather cushions and arm rests, all leaning back.
      const shell = "#6b4a2f";
      const base = Math.min(w, d) * 0.6;
      out.push({ g: "cyl", p: [0, 0.02, 0.02], s: [base, 0.04, base], c: DARK, f: "metal" });
      cyl(0, 0.17, 0.02, 0.06, 0.26, DARK, "metal");
      lean(0, 0.32, 0.04, w - 0.14, 0.05, d * 0.64, -0.1, shell, "satin");
      lean(0, 0.39, 0.06, w - 0.18, 0.1, d * 0.6, -0.1, color, "satin");
      lean(0, h * 0.71, -d / 2 + 0.1, w - 0.1, h * 0.6, 0.03, -0.3, shell, "satin");
      lean(0, h * 0.73, -d / 2 + 0.16, w - 0.16, h * 0.56, 0.1, -0.3, color, "satin");
      for (const sx of [-1, 1]) {
        lean(sx * (w / 2 - 0.06), 0.5, 0.02, 0.1, 0.03, d * 0.55, -0.1, shell, "satin");
        lean(sx * (w / 2 - 0.06), 0.53, 0.02, 0.09, 0.04, d * 0.5, -0.1, color, "satin");
        lean(sx * (w / 2 - 0.06), 0.42, 0.02, 0.03, 0.12, 0.03, -0.1, DARK, "metal");
      }
      break;
    }
    case "stool": {
      // Round seat on a slim stem over a weighted disc, with a footrest ring part-way up.
      const seatT = 0.05;
      drum(0, 0.02, w * 0.95, d * 0.95, DARK, "metal");
      cyl(0, (0.02 + h - seatT) / 2, 0, 0.035, h - seatT - 0.02, DARK, "metal");
      drum(h * 0.36, h * 0.36 + 0.015, w * 0.85, d * 0.85, DARK, "metal");
      drum(h - seatT, h, w, d, color, "satin");
      break;
    }
    case "stool-back": {
      // Counter stool: round seat at 0.65 on four splayed-looking legs, a low curved back and a footrest bar.
      const seat = Math.min(0.65, h - 0.2);
      const seatT = 0.05;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(sx * (w / 2 - 0.03), seat / 2, sz * (d / 2 - 0.04), 0.025, seat, 0.025, DARK, "metal");
      for (const sx of [-1, 1]) box(sx * (w / 2 - 0.03), seat * 0.35, 0, 0.02, 0.02, d - 0.08, DARK, "metal");
      box(0, seat * 0.35, d / 2 - 0.04, w - 0.06, 0.02, 0.02, DARK, "metal");
      drum(seat - seatT, seat, w, d * 0.9, color, "satin");
      for (const sx of [-1, 1]) box(sx * (w / 2 - 0.05), (seat + h) / 2, -d / 2 + 0.05, 0.02, h - seat, 0.02, DARK, "metal");
      lean(0, h - 0.08, -d / 2 + 0.05, w - 0.06, 0.16, 0.03, -0.12, color, "satin");
      break;
    }
    case "gas-hob": {
      box(0, 0.006, 0, w, 0.012, d, color, "gloss");
      for (const [fx, fy] of SIX_RINGS) {
        cyl(fx * w, 0.02, fy * d, 0.11, 0.016, "#2a2a2a", "metal");
        cyl(fx * w, 0.04, fy * d, 0.06, 0.006, "#8d7a4a", "metal");
      }
      for (const fy of [-0.22, 0.2]) {
        for (const s of [-1, 1]) box(0, 0.052, fy * d + s * 0.13, w - 0.06, 0.012, 0.012, DARK, "matt");
        for (const [fx, ry] of SIX_RINGS) if (Math.abs(ry - fy) < 0.1) box(fx * w, 0.052, fy * d, 0.012, 0.012, 0.26, DARK, "matt");
      }
      for (let i = 0; i < 6; i++) cyl(-w / 2 + (w * (i + 0.5)) / 6, 0.018, d / 2 - 0.03, 0.035, 0.012, DARK, "matt");
      break;
    }
    case "induction":
    case "vented-hob": {
      box(0, h / 2, 0, w, h, d, color, "gloss");
      const zones = symbol === "induction" ? SIX_RINGS : VENTED_ZONES;
      for (const [fx, fy] of zones) {
        cyl(fx * w, h + 0.001, fy * d, 0.2, 0.002, "#5a5e64", "satin");
        cyl(fx * w, h + 0.0025, fy * d, 0.12, 0.0025, "#3a3d42", "satin");
      }
      box(0, h + 0.001, d / 2 - 0.04, 0.3, 0.002, 0.02, "#8e9399", "satin");
      if (symbol === "vented-hob") {
        box(0, h + 0.002, 0, 0.2, 0.01, 0.09, "#101214", "matt");
        box(0, h + 0.008, 0, 0.19, 0.003, 0.08, STEEL, "metal");
        for (const dz of [-0.025, 0, 0.025]) box(0, h + 0.01, dz, 0.19, 0.003, 0.006, DARK, "matt");
      }
      break;
    }
    case "glass-hood": {
      box(0, 0.45 + (h - 0.45) / 2, -d / 2 + 0.125, 0.3, h - 0.45, 0.25, STEEL, "metal");
      box(0, 0.4, -d / 2 + 0.15, 0.5, 0.1, 0.3, STEEL, "metal");
      lean(0, 0.2, -0.025, w, 0.45, 0.012, -0.9, color, "gloss");
      box(0, 0.01, d / 2 - 0.05, w, 0.02, 0.02, STEEL, "metal");
      box(0, 0.345, -d / 2 + 0.2, 0.4, 0.008, 0.03, "#f4efd8", "gloss");
      break;
    }
    case "box-hood": {
      box(0, 0.01 + (h - 0.02) / 2, 0, w, h - 0.02, d, STEEL, "metal");
      box(0, 0.004, 0, w - 0.08, 0.006, d - 0.1, "#55595f", "metal");
      box(0, h / 2, d / 2 + 0.002, w - 0.1, 0.012, 0.004, "#2a2d31", "satin");
      break;
    }
    case "island-hood": {
      box(0, 0.06, 0, w, 0.12, d, STEEL, "metal");
      box(0, 0.004, 0, w - 0.08, 0.006, d - 0.08, "#55595f", "metal");
      box(0, 0.12 + (h - 0.12) / 2, 0, 0.25, h - 0.12, 0.25, STEEL, "metal");
      for (const s of [-1, 1]) box(s * w * 0.25, 0.0, 0, 0.05, 0.004, 0.05, "#f4efd8", "gloss");
      break;
    }
    case "beanbag":
      out.push({ g: "blob", p: [0, h / 2, 0], s: [w, h, d], c: color, f: "matt" });
      // The seat: a slightly darker, flattened pad pressed into the dimple.
      out.push({ g: "ball", p: [0, h * 0.84, 0], s: [w * 0.4, h * 0.12, d * 0.4], c: shade(color, 0.92), f: "matt" });
      break;
    case "beanbag-chair": {
      out.push({ g: "blob", p: [0, h * 0.25, 0], s: [w, h * 0.5, d], c: color, f: "matt" });
      out.push({ g: "ball", p: [0, h * 0.52, -d * 0.25], s: [w * 0.88, h * 0.95, d * 0.42], c: shade(color, 1.05), f: "matt", tilt: -0.3 });
      out.push({ g: "ball", p: [0, h * 0.44, d * 0.08], s: [w * 0.5, h * 0.09, d * 0.4], c: shade(color, 0.92), f: "matt" });
      break;
    }
    case "wood-armchair": {
      const oak = "#c9a26b";
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(sx * (w / 2 - 0.05), 0.21, sz * (d / 2 - 0.05), 0.04, 0.42, 0.04, oak, "satin");
      for (const sx of [-1, 1]) {
        box(sx * (w / 2 - 0.035), 0.6, 0, 0.05, 0.03, d - 0.1, oak, "satin");
        box(sx * (w / 2 - 0.035), 0.51, d / 2 - 0.05, 0.03, 0.2, 0.03, oak, "satin");
        box(sx * (w / 2 - 0.05), 0.42 + (h - 0.42) / 2, -d / 2 + 0.05, 0.03, h - 0.42, 0.03, oak, "satin");
      }
      box(0, 0.42, 0, w - 0.1, 0.03, d - 0.1, oak, "satin");
      box(0, 0.49, 0.03, w - 0.12, 0.1, d - 0.16, color);
      lean(0, 0.72, -d / 2 + 0.12, w - 0.14, 0.4, 0.1, -0.15, color);
      break;
    }
    case "corner-tv": {
      // A low unit in the corner: right angle at the back-left, legs along the two walls, doors across the corner.
      // Square ends (kb on the back leg, ks on the side leg) are boxes along the walls; the corner piece spans the rest.
      const curved = front === "curved";
      const { endBack: kb, endSide: ks } = ends;
      const rw = w - ks;
      const rd = d - kb;
      const corner = (y0: number, y1: number, inset: number, c: string, f: Finish = "satin") => {
        const yc = (y0 + y1) / 2;
        const sy = y1 - y0;
        out.push({ g: curved ? "quarter" : "wedge", p: [-w / 2 + ks, yc, -d / 2 + kb], s: [rw - inset, sy, rd - inset], c, f });
        if (ks > 0) box(-w / 2 + ks / 2, yc, (kb - inset) / 2, ks, sy, d - inset - kb + 0.001, c, f);
        if (kb > 0) box(-ks / 2 - inset / 2, yc, -d / 2 + kb / 2, w - inset - ks + 0.001, sy, kb, c, f);
      };
      corner(0, 0.1, 0.06, PLINTH, "matt");
      corner(0.1, h - 0.03, 0.01, color);
      corner(h - 0.03, h, -0.02, shade(color, 1.05));
      const L = Math.hypot(rw, rd);
      const ang = Math.atan2(rd, rw);
      const nx = rd / L;
      const nz = rw / L;
      // Midpoint of the front, in the unit's centred frame.
      const mx = ks / 2;
      const mz = kb / 2;
      const yc = (0.12 + h - 0.05) / 2;
      const dh = h - 0.17;
      if (curved) {
        // One joint line down the middle of the curved front.
        const t = Math.PI / 4;
        turn(-w / 2 + ks + (rw - 0.005) * Math.cos(t), yc, -d / 2 + kb + (rd - 0.005) * Math.sin(t), 0.006, dh, 0.012, ang, DARK);
      } else {
        // Two doors across the diagonal, a joint between them and a handle on each.
        turn(mx + nx * 0.01, yc, mz + nz * 0.01, L - 0.04, dh, 0.02, ang, color, "satin");
        turn(mx + nx * 0.021, yc, mz + nz * 0.021, 0.006, dh - 0.02, 0.012, ang, DARK);
        for (const s of [-1, 1]) turn(mx + nx * 0.032 + s * (rw / L) * 0.08, h - 0.1, mz + nz * 0.032 - s * (rd / L) * 0.08, 0.12, 0.012, 0.02, ang, CHROME, "metal");
      }
      break;
    }
    case "cube-shelves": {
      // Open cubes with no back: outer frame, vertical boards between columns, shelves between rows.
      const { cols, rows } = cubeGrid(w, h);
      const t = CUBE_BOARD;
      box(0, t / 2, 0, w, t, d, color, "satin");
      box(0, h - t / 2, 0, w, t, d, color, "satin");
      for (const sx of [-1, 1]) box(sx * (w / 2 - t / 2), h / 2, 0, t, h - 2 * t, d, color, "satin");
      for (let i = 1; i < cols; i++) box(-w / 2 + (i * w) / cols, h / 2, 0, t, h - 2 * t, d - 0.01, color, "satin");
      for (let i = 1; i < rows; i++) box(0, (i * h) / rows, 0, w - 2 * t, t, d - 0.01, color, "satin");
      break;
    }
    case "pouf":
      drum(0, h - 0.02, w, d, color);
      out.push({ g: "ball", p: [0, h - 0.02, 0], s: [w * 0.98, 0.08, d * 0.98], c: color, f: "matt" });
      drum(h - 0.03, h - 0.02, w * 1.005, d * 1.005, shade(color, 0.8));
      break;
    case "round-table":
      drum(0, 0.02, w * 0.45, d * 0.45, shade(color, 0.85), "satin");
      drum(0.02, 0.12, w * 0.2, d * 0.2, shade(color, 0.88), "satin");
      drum(0.12, h - 0.03, w * 0.12, d * 0.12, shade(color, 0.92), "satin");
      drum(h - 0.042, h - 0.03, w * 0.98, d * 0.98, shade(color, 0.85), "satin");
      drum(h - 0.03, h, w, d, color, "satin");
      break;
    case "floor-lamp": {
      const shadeD = Math.min(w, d);
      drum(0, 0.025, shadeD * 0.7, shadeD * 0.7, DARK, "metal");
      cyl(0, (h - 0.3) / 2, 0, 0.022, h - 0.3, DARK, "metal");
      drum(h - 0.33, h, shadeD, shadeD, color);
      drum(h - 0.335, h - 0.325, shadeD * 0.9, shadeD * 0.9, GLOW, "glow");
      break;
    }
    case "picture": {
      // A backing board against the wall and the moulding around it (a canvas: a deep stretcher wrapped by the print);
      // the print itself is a textured plane drawn by PrintFace.
      const fw = FRAME_W[frame ?? "black"];
      if (fw > 0) {
        box(0, h / 2, 0, w - 2 * fw, h - 2 * fw, d - 0.006, "#e8e4da", "matt");
        box(0, h - fw / 2, 0, w, fw, d, color, "satin");
        box(0, fw / 2, 0, w, fw, d, color, "satin");
        for (const sx of [-1, 1]) box(sx * (w / 2 - fw / 2), h / 2, 0, fw, h - 2 * fw, d, color, "satin");
      } else box(0, h / 2, 0, w, h, d, "#e8e4da", "matt");
      break;
    }
    case "table-lamp": {
      // A weighted base, a short stem and a drum shade lit from inside.
      const shadeD = Math.min(w, d);
      const shadeH = Math.min(0.28, h * 0.45);
      drum(0, 0.02, shadeD * 0.5, shadeD * 0.5, DARK, "metal");
      drum(0.02, 0.06, shadeD * 0.3, shadeD * 0.3, "#8a7a5a", "satin");
      cyl(0, 0.06 + (h - shadeH - 0.06) / 2, 0, 0.03, h - shadeH - 0.06, "#8a7a5a", "satin");
      drum(h - shadeH, h, shadeD, shadeD, color);
      drum(h - shadeH + 0.003, h - shadeH + 0.012, shadeD * 0.9, shadeD * 0.9, GLOW, "glow");
      break;
    }
    case "desk-lamp": {
      // A round base at the back, a jointed arm reaching forward and a small conical head looking down.
      drum(0, 0.015, Math.min(w, d * 0.5), Math.min(w, d * 0.5), color, "metal");
      const armH = h - 0.08;
      lean(0, 0.015 + armH * 0.5 * 0.5, -d / 2 + d * 0.25 + d * 0.12, 0.014, armH * 0.55, 0.014, 0.35, color, "metal");
      lean(0, 0.015 + armH * 0.5 + armH * 0.45 * 0.5, d * 0.1, 0.014, armH * 0.5, 0.014, -0.9, color, "metal");
      out.push({ g: "cyl", p: [0, h - 0.06, d / 2 - d * 0.2], s: [0.12, 0.08, 0.12], c: color, f: "metal", tilt: 0.3 });
      out.push({ g: "cyl", p: [0, h - 0.095, d / 2 - d * 0.2], s: [0.08, 0.004, 0.08], c: GLOW, f: "glow", tilt: 0.3 });
      break;
    }
    case "tv-wall": {
      box(0, h / 2, -d / 2 + 0.015, 0.2, 0.3, 0.03, DARK, "metal");
      box(0, h / 2, d / 2 - 0.015, w, h, 0.03, color, "gloss");
      box(0, h / 2, d / 2 + 0.002, w - 0.02, h - 0.02, 0.004, "#2a3340", "gloss");
      break;
    }
    case "tv-stand": {
      box(0, 0.005, 0, w * 0.45, 0.01, d, DARK, "metal");
      box(0, 0.055, 0, 0.06, 0.1, 0.06, DARK, "metal");
      const sh = h - 0.1;
      box(0, 0.1 + sh / 2, 0, w, sh, 0.03, color, "gloss");
      box(0, 0.1 + sh / 2, 0.017, w - 0.02, sh - 0.02, 0.004, "#2a3340", "gloss");
      break;
    }
    case "media-unit": {
      // A wall-hung box with fluted, handleless fronts.
      box(0, h / 2, 0, w, h, d, color, "satin");
      const n = Math.max(1, Math.round(w / 0.6));
      for (let i = 1; i < n; i++) box(-w / 2 + (i * w) / n, h / 2, d / 2, 0.004, h - 0.02, 0.006, DARK);
      const flutes = Math.round(w / 0.05);
      for (let i = 0; i < flutes; i++) box(-w / 2 + ((i + 0.5) * w) / flutes, h / 2, d / 2 + 0.004, 0.022, h - 0.04, 0.008, shade(color, 1.08), "satin");
      break;
    }
    case "rug": {
      // Lies on the room's floor surface (not the storey base, which the floor finish covers), with a border.
      const y = FLOOR_SURFACE;
      box(0, y + h / 2, 0, w, h, d, color);
      box(0, y + h + 0.001, 0, w - Math.min(0.24, w * 0.16), 0.002, d - Math.min(0.24, d * 0.16), shade(color, 0.88));
      break;
    }
    case "table":
      box(0, h - 0.02, 0, w, 0.04, d, color, "satin");
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(sx * (w / 2 - 0.05), (h - 0.04) / 2, sz * (d / 2 - 0.05), 0.06, h - 0.04, 0.06, color);
      break;
    case "chair":
      box(0, 0.45, 0, w, 0.04, d, color);
      box(0, 0.68, -d / 2 + 0.02, w, 0.45, 0.04, color);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(sx * (w / 2 - 0.03), 0.22, sz * (d / 2 - 0.03), 0.04, 0.44, 0.04, color);
      break;
    case "car":
      box(0, 0.45, 0, w, 0.6, d, color, "gloss");
      box(0, 1.05, d * 0.05, w - 0.2, 0.6, d * 0.5, "#3b4652", "gloss");
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(sx * (w / 2 - 0.1), 0.3, sz * d * 0.32, 0.6, 0.2, "#222", "matt", "x");
      break;
    case "washer":
      // Round porthole door under a control strip.
      box(0, h / 2, 0, w, h, d, color, "gloss");
      cyl(0, h * 0.45, d / 2 + 0.01, Math.min(w, h) * 0.55, 0.02, "#9aa3ab", "gloss", "z");
      box(0, h - 0.06, d / 2 + 0.005, w - 0.04, 0.08, 0.01, "#d0d3d6", "satin");
      break;
    case "appliance":
      box(0, h / 2, 0, w, h, d, color, "gloss");
      if (h > 1.2) {
        // Fridge freezer: two doors with handles.
        box(0, h * 0.6, d / 2 + 0.003, w - 0.01, 0.008, 0.008, DARK);
        box(-w / 2 + 0.06, h * 0.78, d / 2 + 0.02, 0.02, 0.35, 0.03, CHROME, "metal");
        box(-w / 2 + 0.06, h * 0.42, d / 2 + 0.02, 0.02, 0.3, 0.03, CHROME, "metal");
      } else {
        // Dishwasher: control strip and a handle across the top.
        box(0, h - 0.05, d / 2 + 0.005, w - 0.02, 0.08, 0.01, "#d0d3d6", "satin");
        box(0, h - 0.13, d / 2 + 0.02, w * 0.5, 0.02, 0.03, CHROME, "metal");
      }
      break;
    case "cabinet": {
      const kitchen = h > 0.85 && h < 0.95;
      if (kitchen) doors(0.12, h - 0.06, base(h));
      else {
        box(0, 0.04, 0, w - 0.04, 0.08, d - 0.04, shade(color, 0.7));
        box(0, (h + 0.08) / 2, 0, w, h - 0.08, d, color, "satin");
        doors(0.1, h - 0.04, d / 2, 0.55, true);
      }
      break;
    }
    case "worktop":
      doors(0.12, h - 0.06, base(h));
      break;
    case "island": {
      // Units on the front side, worktop overhanging at the back for stools.
      const over = Math.min(0.3, d * 0.35);
      box(0, 0.05, over / 2 - 0.02, w - 0.04, 0.1, d - over - 0.08, PLINTH);
      box(0, (0.1 + h - 0.04) / 2, over / 2, w, h - 0.14, d - over, color, "satin");
      box(0, h - 0.02, 0, w + 0.04, 0.04, d, worktopColor, "satin");
      doors(0.12, h - 0.06, d / 2);
      break;
    }
    case "corner-unit":
    case "corner-unit-handleless":
    case "corner-diagonal":
    case "corner-diagonal-handleless": {
      const hl = isHandleless(symbol);
      const a = cornerArm(w, d);
      const yb = 0.12;
      const yt = h - 0.06;
      const yc = (yb + yt) / 2;
      // Back arm along the full width, left arm below it (the corner square belongs to the back arm).
      const lz0 = -d / 2 + a;
      const lz = d - a;
      const lcz = lz0 + lz / 2;
      box(0, 0.05, -d / 2 + a / 2 - 0.03, w - 0.02, 0.1, a - 0.08, PLINTH);
      box(0, (0.1 + h - 0.04) / 2, -d / 2 + a / 2 - 0.01, w, h - 0.14, a - 0.02, color, "satin");
      box(0, h - 0.02, -d / 2 + a / 2, w, 0.04, a, worktopColor, "satin");
      box(-w / 2 + a / 2, 0.05, lcz - 0.03, a - 0.02, 0.1, lz - 0.08, PLINTH);
      box(-w / 2 + a / 2 - 0.01, (0.1 + h - 0.04) / 2, lcz, a - 0.02, h - 0.14, lz, color, "satin");
      box(-w / 2 + a / 2, h - 0.02, lcz, a, 0.04, lz, worktopColor, "satin");
      const fz = lz0 - 0.01; // back arm front face, facing +z
      const fx = -w / 2 + a - 0.01; // left arm right face, facing +x
      const bx0 = -w / 2 + a;
      const bw = w / 2 - bx0;
      const bcx = (bx0 + w / 2) / 2;
      if (symbol.startsWith("corner-unit")) {
        // The corner post, then one door on each arm.
        box(bx0 + 0.015, yc, lz0 - 0.005, 0.03, yt - yb, 0.03, DARK);
        if (hl) {
          box(bcx + 0.015, yt - 0.02, fz + 0.002, bw - 0.03, 0.035, 0.008, DARK, "satin");
          box(fx + 0.002, yt - 0.02, lz0 + lz / 2 + 0.015, 0.008, 0.035, lz - 0.03, DARK, "satin");
        } else {
          box(bcx + 0.1, yt - 0.06, fz + 0.012, Math.min(0.16, bw - 0.1), 0.012, 0.02, CHROME, "metal");
          box(fx + 0.012, yt - 0.06, lz0 + lz * 0.55, 0.02, 0.012, Math.min(0.16, lz - 0.1), CHROME, "metal");
        }
      } else {
        const dx = w - a;
        const dz = d - a;
        const len = Math.hypot(dx, dz);
        const ang = Math.atan2(dz, dx);
        const mx = (w / 2 + bx0) / 2;
        const mz = (lz0 + d / 2) / 2;
        const nx = Math.sin(ang);
        const nz = Math.cos(ang); // outward normal of the diagonal
        // A carcass wedge, its plinth and worktop behind the angled door.
        const th = Math.min(0.3, (dx * dz) / len);
        const cx = mx - nx * (th / 2 + 0.01);
        const cz = mz - nz * (th / 2 + 0.01);
        turn(cx, 0.05, cz, len - 0.1, 0.1, th, ang, PLINTH);
        turn(cx, (0.1 + h - 0.04) / 2, cz, len - 0.06, h - 0.14, th, ang, color, "satin");
        turn(mx - nx * (th / 2 - 0.005), h - 0.02, mz - nz * (th / 2 - 0.005), len + 0.02, 0.04, th + 0.03, ang, worktopColor, "satin");
        // The angled door, lying along the diagonal.
        turn(mx - nx * 0.01, yc, mz - nz * 0.01, len - 0.04, yt - yb, 0.02, ang, color, "satin");
        if (hl) turn(mx + nx * 0.004, yt - 0.02, mz + nz * 0.004, len - 0.06, 0.035, 0.008, ang, DARK, "satin");
        else turn(mx + nx * 0.012, yt - 0.06, mz + nz * 0.012, Math.min(0.16, len - 0.1), 0.012, 0.02, ang, CHROME, "metal");
      }
      break;
    }
    case "peninsula":
    case "peninsula-handleless": {
      const over = peninsulaOverhang(d);
      box(0, 0.05, over / 2 - 0.02, w - 0.04, 0.1, d - over - 0.08, PLINTH);
      box(0, (0.1 + h - 0.04) / 2, over / 2, w, h - 0.14, d - over, color, "satin");
      box(0, h - 0.02, 0, w + 0.04, 0.04, d, worktopColor, "satin");
      if (isHandleless(symbol)) slabs(0.1, h - 0.06, d / 2 - 0.02);
      else doors(0.12, h - 0.06, d / 2);
      // Finished end panels.
      for (const sx of [-1, 1]) box(sx * (w / 2 - 0.01), (0.1 + h - 0.04) / 2, over / 2, 0.02, h - 0.14, d - over, color, "satin");
      break;
    }
    case "sink": {
      const front = base(h);
      doors(0.12, h - 0.06, front);
      const bw = Math.min(w * 0.5, 0.5);
      const bx = -w / 2 + 0.06 + bw / 2;
      box(bx, h - 0.005, 0.02, bw, 0.012, d - 0.18, STEEL, "metal");
      box(bx, h - 0.004, 0.02, bw - 0.04, 0.014, d - 0.22, "#8e9399", "metal");
      box((bx + bw / 2 + w / 2) / 2, h - 0.004, 0.02, w / 2 - bx - bw / 2 - 0.06, 0.012, d - 0.18, STEEL, "metal");
      cyl(bx, h + 0.15, -d / 2 + 0.06, 0.03, 0.3, CHROME, "metal");
      box(bx, h + 0.29, -d / 2 + 0.14, 0.025, 0.025, 0.18, CHROME, "metal");
      break;
    }
    case "hob": {
      box(0, h / 2, 0, w, h, d, color, "gloss");
      const rings: [number, number, number][] = [
        [-0.3, -0.25, 0.17],
        [0.3, -0.25, 0.13],
        [-0.3, 0.25, 0.13],
        [0.3, 0.25, 0.19],
      ];
      for (const [fx, fz, dia] of rings) cyl(fx * w, h + 0.002, fz * d, dia, 0.004, "#5a5e64", "satin");
      break;
    }
    case "range": {
      box(0, h / 2 - 0.02, 0, w, h - 0.04, d, color, "gloss");
      box(0, h - 0.02, 0, w, 0.04, d, DARK, "gloss");
      for (const [fx, fz] of burners(w)) cyl(fx * w, h + 0.01, fz * d, 0.12, 0.02, "#2a2a2a", "metal");
      // One oven on a cooker, two side by side on a range, under a control panel and handle rail.
      const ovens = w < 0.8 ? [0] : [-w / 4, w / 4];
      for (const x of ovens) box(x, 0.42, d / 2 + 0.005, w / ovens.length - 0.08, 0.5, 0.01, "#30353a", "gloss");
      box(0, h - 0.12, d / 2 + 0.005, w - 0.04, 0.1, 0.01, shade(color, 1.2), "satin");
      cyl(0, 0.75, d / 2 + 0.05, 0.025, w - 0.1, CHROME, "metal", "x");
      const nk = ovens.length * 2 + 2;
      for (let i = 0; i < nk; i++) cyl(-w / 2 + ((i + 0.5) * w) / nk, h - 0.12, d / 2 + 0.015, 0.035, 0.02, CHROME, "metal", "z");
      box(0, h - 0.12, d / 2 + 0.012, 0.08, 0.03, 0.006, "#1a1c1f", "gloss");
      box(0, 0.04, 0, w - 0.02, 0.08, d - 0.04, PLINTH);
      break;
    }
    case "handleless":
      slabs(0.1, h - 0.06, base(h));
      break;
    case "drawers": {
      // Three drawers, deepest at the bottom, each with a long bar handle.
      const front = base(h);
      const ys = [0.1, 0.1 + (h - 0.16) * 0.42, 0.1 + (h - 0.16) * 0.76, h - 0.06];
      for (let i = 1; i < 3; i++) box(0, ys[i], front, w - 0.01, 0.006, 0.012, DARK);
      for (let i = 0; i < 3; i++) box(0, ys[i + 1] - 0.05, front + 0.012, Math.min(0.5, w * 0.6), 0.012, 0.02, CHROME, "metal");
      break;
    }
    case "wine-cooler": {
      // Rows of bottle ends behind a glass door framed in black, in a base unit under the worktop.
      const front = base(h);
      const y0 = 0.14;
      const y1 = h - 0.08;
      box(0, (y0 + y1) / 2, front + 0.002, w - 0.04, y1 - y0 + 0.02, 0.006, DARK, "gloss");
      const rows = Math.max(2, Math.floor((y1 - y0) / 0.13));
      const cols = Math.max(1, Math.floor((w - 0.1) / 0.085));
      for (let r = 0; r < rows; r++) {
        const y = y0 + ((r + 0.5) * (y1 - y0)) / rows;
        box(0, y - 0.045, front + 0.006, w - 0.08, 0.006, 0.006, "#6b6f75", "metal");
        for (let c = 0; c < cols; c++) cyl(-((cols - 1) * 0.085) / 2 + c * 0.085, y, front + 0.015, 0.07, 0.016, (r + c) % 3 ? "#5a1f2b" : "#2f5a3a", "gloss", "z");
      }
      box(0, (y0 + y1) / 2, front + 0.032, w - 0.04, y1 - y0 + 0.02, 0.004, "#2a3238", "glass");
      box(w / 2 - 0.05, (y0 + y1) / 2, front + 0.05, 0.015, (y1 - y0) * 0.6, 0.025, CHROME, "metal");
      break;
    }
    case "waterfall": {
      // Worktop over the top and down both ends to the floor; handleless units between, set forward
      // so the back overhangs for stools.
      const t = 0.04;
      const over = Math.min(0.3, d * 0.3);
      const iw = w - t * 2;
      box(0, h - t / 2, 0, w, t, d, worktopColor, "satin");
      for (const sx of [-1, 1]) box(sx * (w / 2 - t / 2), (h - t) / 2, 0, t, h - t, d, worktopColor, "satin");
      box(0, 0.05, over / 2 + 0.02, iw - 0.02, 0.1, d - over - 0.08, PLINTH);
      box(0, (0.1 + h - t) / 2, over / 2 + 0.005, iw, h - t - 0.1, d - over - 0.03, color, "satin");
      slabs(0.1, h - t - 0.02, d / 2 - 0.02, iw);
      break;
    }
    case "american-fridge": {
      // Side-by-side: a narrower freezer door on the left with the dispenser, the fridge on the right,
      // long bar handles either side of the split, and a vent grille along the plinth.
      const split = sideBySideSplit(w);
      const z = d / 2;
      box(0, h / 2 + 0.03, -0.02, w, h - 0.06, d - 0.04, color, "metal");
      box(0, 0.04, -0.02, w - 0.02, 0.08, d - 0.08, DARK);
      box(0, 0.05, z - 0.035, w - 0.06, 0.05, 0.01, "#2a2d31", "satin");
      for (const [x0, x1] of [
        [-w / 2, split],
        [split, w / 2],
      ]) {
        box((x0 + x1) / 2, h / 2 + 0.04, z - 0.02, x1 - x0 - 0.006, h - 0.08, 0.04, color, "metal");
      }
      for (const sx of [-1, 1]) box(split + sx * 0.04, h * 0.55, z + 0.03, 0.022, h * 0.55, 0.03, CHROME, "metal");
      const fx = (-w / 2 + split) / 2;
      box(fx, h * 0.6, z + 0.003, Math.min(0.2, split + w / 2 - 0.12), 0.3, 0.008, "#1d1f23", "gloss");
      box(fx, h * 0.6 + 0.11, z + 0.008, 0.08, 0.04, 0.004, "#5f8fb0", "glow");
      break;
    }
    case "chimney-hood": {
      // Canopy across the bottom, tapering into a chimney against the wall that runs to the top.
      const can = 0.06;
      const cd = Math.min(0.26, d * 0.55);
      box(0, can / 2, 0, w, can, d, color, "metal");
      box(0, 0.005, 0.02, w - 0.08, 0.01, d - 0.1, "#55595f", "metal");
      box(0, can + 0.07, -d / 2 + (d * 0.6) / 2, w * 0.45, 0.14, d * 0.6, color, "metal");
      box(0, (can + 0.14 + h) / 2, -d / 2 + cd / 2, Math.min(0.28, w * 0.35), h - can - 0.14, cd, color, "metal");
      box(-w / 2 + 0.12, can / 2, d / 2 + 0.002, 0.12, 0.016, 0.004, "#2a2d31", "satin");
      break;
    }
    case "oven-pair":
      box(0, 0.05, -0.03, w - 0.02, 0.1, d - 0.08, PLINTH);
      box(0, (0.1 + h) / 2, 0, w, h - 0.1, d, color, "satin");
      // Drawer below, oven, then a compact combi microwave at eye level and a door above.
      appliance(1.0, 0.58, d / 2);
      appliance(1.53, 0.44, d / 2);
      for (const y of [0.7, 1.8]) box(0, y, d / 2, w - 0.02, 0.006, 0.012, DARK);
      box(0, 0.64, d / 2 + 0.012, 0.16, 0.012, 0.02, CHROME, "metal");
      box(0, 1.86, d / 2 + 0.012, 0.16, 0.012, 0.02, CHROME, "metal");
      break;
    case "built-in": {
      if (!j) {
        box(0, h / 2, 0, w, h, d, color, "satin");
        break;
      }
      const t = 0.018;
      const cc = j.carcass;
      const L = builtInLayout(j, w, h);
      const f = d / 2;
      box(0, h / 2, -d / 2 + 0.005, w, h, 0.01, shade(cc, 0.85));
      for (const sx of [-1, 1]) box(sx * (w / 2 - t / 2), h / 2, 0, t, h, d, cc, "satin");
      box(0, h - t / 2, 0, w - 2 * t, t, d, cc, "satin");
      if (L.plinth) box(0, L.plinth[1] / 2, -0.025, w - 2 * t, L.plinth[1], d - 0.1, shade(color, 0.8));
      const inner = L.bayXs.slice(1, -1);
      const bays = L.bayXs.slice(0, -1).map((x, i): [number, number] => [x + (i === 0 ? t : t / 2), L.bayXs[i + 1] - (i === L.bayXs.length - 2 ? t : t / 2)]);
      if (L.base) {
        const [b0, b1] = L.base;
        box(0, b0 + t / 2, 0, w - 2 * t, t, d - 0.01, cc, "satin");
        for (const x of inner) box(x, (b0 + b1) / 2, 0, t, b1 - b0, d - 0.01, cc, "satin");
        for (const [x0, x1] of bays) {
          if (j.baseFront === "open") box((x0 + x1) / 2, (b0 + b1) / 2, 0, x1 - x0, t, d - 0.04, cc, "satin");
          else fronts(x0, x1, b0, b1, f, j.baseFront);
        }
      }
      if (L.top) box(0, (L.top[0] + L.top[1]) / 2, 0.01, w, TOP_T, d + 0.02, j.topColor, "satin");
      const [u0, u1] = L.upper;
      const ud = Math.min(j.upperD, d);
      const uz = -d / 2 + ud / 2;
      if (u1 - u0 > 0.05) {
        for (const x of inner) box(x, (u0 + u1) / 2, uz, t, u1 - u0, ud, cc, "satin");
        if (j.upperFront === "open") {
          const bookColours = ["#7b3b3b", "#2f4f6f", "#5d6b3a", "#b08a4a"];
          for (const [bi, y] of L.shelfYs.entries()) {
            for (const [x0, x1] of bays) box((x0 + x1) / 2, y, uz, x1 - x0, 0.022, ud, cc, "satin");
            if (bi % 2 === 0) {
              const gapH = Math.min(0.3, (u1 - u0) / (j.shelves + 1) - 0.05);
              if (gapH > 0.08)
                bays.forEach(([x0, x1], k) => {
                  const bw = x1 - x0;
                  const bh = Math.min(gapH, 0.24 + ((k + bi) % 3) * 0.02);
                  for (let q = 0; q < 3; q++) box(x0 + bw * (0.18 + q * 0.17), y + 0.011 + bh / 2, uz, bw * 0.13, bh, ud * 0.7, bookColours[(q + k + bi) % 4]);
                });
            }
          }
        } else {
          for (const y of L.shelfYs) box(0, y, uz, w - 2 * t, 0.022, ud, cc, "satin");
          for (const [x0, x1] of bays) fronts(x0, x1, u0, u1, -d / 2 + ud, j.upperFront);
        }
      }
      if (L.topBox) {
        const [y0, y1] = L.topBox;
        box(0, y0 + t / 2, 0, w - 2 * t, t, d - 0.01, cc, "satin");
        const style: JoineryFront = j.upperFront !== "open" ? j.upperFront : j.baseFront !== "open" ? j.baseFront : "slab";
        for (const [x0, x1] of bays) fronts(x0, x1, y0 + t, y1, f, style);
      }
      break;
    }
    case "window-seat": {
      if (!j) {
        box(0, h / 2, 0, w, h, d, color, "satin");
        break;
      }
      const boxTop = h - CUSHION_T;
      const ph = j.plinth ? 0.08 : 0;
      const t = 0.018;
      if (ph > 0) box(0, ph / 2, -0.025, w - 0.02, ph, d - 0.1, shade(color, 0.8));
      box(0, (ph + boxTop - 0.02) / 2, 0, w, boxTop - 0.02 - ph, d, color, "satin");
      box(0, boxTop - 0.01, 0.01, w, 0.02, d + 0.02, color, "satin");
      const n = Math.max(1, j.bays);
      const bw = w / n;
      const front = d / 2;
      for (let i = 0; i < n; i++) {
        const x0 = -w / 2 + i * bw + (i === 0 ? t : t / 2);
        const x1 = -w / 2 + (i + 1) * bw - (i === n - 1 ? t : t / 2);
        if (j.seatFront === "drawers") {
          fronts(x0, x1, ph + 0.01, boxTop - 0.02, front, "slab", color, true, false);
          box((x0 + x1) / 2, (ph + boxTop) / 2, front + 0.012, Math.min(0.2, bw * 0.5), 0.012, 0.02, CHROME, "metal");
        } else {
          fronts(x0, x1, ph + 0.01, boxTop - 0.03, front, "shaker", color, true, false);
        }
      }
      if (j.seatFront !== "drawers") box(0, boxTop - 0.025, front + 0.002, w, 0.006, 0.01, DARK);
      box(0, boxTop + CUSHION_T / 2, 0.01, w - 0.02, CUSHION_T, d - 0.03, j.cushion, "matt");
      if (j.backCushion) {
        const m = Math.max(1, Math.round(w / 0.6));
        const cw = w / m;
        for (let i = 0; i < m; i++) lean(-w / 2 + (i + 0.5) * cw, boxTop + CUSHION_T + 0.21, -d / 2 + 0.08, cw - 0.03, 0.42, 0.14, -0.12, shade(j.cushion, 1.06));
      }
      break;
    }
    case "wall-box": {
      if (!j) {
        box(0, h / 2, 0, w, h, d, color, "satin");
        break;
      }
      const t = 0.018;
      const cc = j.carcass;
      box(0, h / 2, -d / 2 + 0.005, w, h, 0.01, shade(cc, 0.85));
      box(0, h - t / 2, 0, w, t, d, cc, "satin");
      box(0, t / 2, 0, w, t, d, cc, "satin");
      for (const sx of [-1, 1]) box(sx * (w / 2 - t / 2), h / 2, 0, t, h, d, cc, "satin");
      const n = j.bays;
      for (let k = 1; k < n; k++) box(-w / 2 + (k * w) / n, h / 2, 0, t, h - 2 * t, d - 0.01, cc, "satin");
      for (let i = 1; i <= j.shelves; i++) box(0, t + (i * (h - 2 * t)) / (j.shelves + 1), 0, w - 2 * t, t, d - 0.01, cc, "satin");
      if (j.front !== "open") for (let i = 0; i < n; i++) fronts(-w / 2 + (i * w) / n + (i === 0 ? t : t / 2), -w / 2 + ((i + 1) * w) / n - (i === n - 1 ? t : t / 2), 0.0, h, d / 2, j.front);
      break;
    }
    case "shelf": {
      const st = j ? shelfStack(j, h) : { n: 1, t: h, ys: [0] };
      for (const y of st.ys) box(0, y + st.t / 2, 0, w, st.t, d, color, "satin");
      // A few things on it so it reads as an open shelf.
      if (w > 0.4) {
        const top = st.ys[st.n - 1] + st.t;
        cyl(-w * 0.3, top + 0.09, 0, 0.1, 0.18, "#e9e4da", "gloss");
        cyl(-w * 0.18, top + 0.06, 0, 0.08, 0.12, "#e9e4da", "gloss");
        box(w * 0.25, top + 0.11, -0.02, 0.24, 0.22, 0.03, "#7f8b78", "satin");
        if (st.n > 1) {
          const y1 = st.ys[1] + st.t;
          cyl(w * 0.3, y1 + 0.05, 0, 0.07, 0.1, "#c9b99a", "gloss");
          if (st.n > 2) box(-w * 0.25, st.ys[2] + st.t + 0.07, 0, 0.2, 0.14, 0.12, "#7b3b3b");
        }
      }
      break;
    }
    case "wall-cabinet":
      box(0, h / 2, 0, w, h, d, color, "satin");
      doors(0.01, h - 0.01, d / 2, 0.6, false);
      box(0, -0.01, 0, w, 0.02, d, shade(color, 0.85), "satin");
      break;
    case "oven":
    case "tall": {
      box(0, 0.05, -0.03, w - 0.02, 0.1, d - 0.08, PLINTH);
      box(0, (0.1 + h) / 2, 0, w, h - 0.1, d, color, "satin");
      const front = d / 2;
      if (symbol === "oven") {
        // Built-in oven at eye level between a drawer below and a door above.
        box(0, 1.1, front + 0.005, w - 0.04, 0.58, 0.01, "#2a2d31", "gloss");
        box(0, 1.27, front + 0.03, w - 0.16, 0.02, 0.03, CHROME, "metal");
        box(0, 0.8, front, w - 0.02, 0.006, 0.012, DARK);
        box(0, 1.4, front, w - 0.02, 0.006, 0.012, DARK);
        box(0, 0.75, front + 0.012, 0.16, 0.012, 0.02, CHROME, "metal");
        box(0, 1.46, front + 0.012, 0.16, 0.012, 0.02, CHROME, "metal");
      } else {
        box(0, 1.35, front, w - 0.02, 0.006, 0.012, DARK);
        box(w / 2 - 0.05, 1.1, front + 0.012, 0.012, 0.3, 0.02, CHROME, "metal");
        box(w / 2 - 0.05, 1.6, front + 0.012, 0.012, 0.3, 0.02, CHROME, "metal");
      }
      break;
    }
    case "shelves": {
      const t = 0.02;
      box(0, h / 2, -d / 2 + 0.005, w, h, 0.01, shade(color, 0.85));
      for (const sx of [-1, 1]) box(sx * (w / 2 - t / 2), h / 2, 0, t, h, d, color, "satin");
      const n = Math.max(2, Math.round(h / 0.35));
      for (let i = 0; i <= n; i++) box(0, t / 2 + (i * (h - t)) / n, 0, w - t * 2, t, d, color, "satin");
      // Books left to right on every shelf, from a seeded PRNG so each bookcase is the same every time.
      const bookColours = ["#7b3b3b", "#2f4f6f", "#5d6b3a", "#b08a4a", "#3d3a36", "#8c6f5a", "#c9b99a", "#4d5d6b"];
      const inner = w - t * 2;
      for (let i = 0; i < n; i++) {
        const y = t + (i * (h - t)) / n;
        const gap = (h - t) / n - t;
        let seed = (((i + 1) * 73856093) ^ Math.round(w * 100) * 19349663 ^ Math.round(h * 100) * 83492791) >>> 0;
        const rnd = () => {
          seed = (Math.imul(seed ^ (seed >>> 15), 2246822507) + 0x6d2b79f5) >>> 0;
          return (seed >>> 8) / 16777216;
        };
        const target = inner * (0.7 + rnd() * 0.2);
        let used = 0;
        let x = -inner / 2 + 0.01;
        let count = 0;
        while (count < 14) {
          const bw = 0.025 + rnd() * 0.025;
          if (used + bw > target) break;
          const bh = gap * (0.7 + rnd() * 0.25);
          const c = bookColours[Math.floor(rnd() * bookColours.length)];
          // On every third shelf the last books lie in a short flat stack instead.
          if (i % 3 === 2 && used + bw * 4 > target) {
            const sw = 0.15 + rnd() * 0.05;
            for (let k = 0; k < 3; k++) box(x + sw / 2 + 0.01, y + 0.02 * k + 0.01, 0.01, sw - k * 0.01, 0.02, d * 0.7, bookColours[Math.floor(rnd() * bookColours.length)]);
            break;
          }
          box(x + bw / 2, y + bh / 2, 0.01, bw, bh, d * 0.75, c);
          used += bw;
          x += bw;
          count++;
        }
      }
      break;
    }
    case "dresser": {
      box(0, h - 0.02, 0, w, 0.04, d, color, "satin");
      box(w / 2 - 0.22, (h - 0.04) / 2 + 0.05, 0, 0.42, h - 0.14, d - 0.02, color, "satin");
      for (const sz of [-1, 1]) box(-w / 2 + 0.03, (h - 0.04) / 2, sz * (d / 2 - 0.03), 0.04, h - 0.04, 0.04, color);
      box(w / 2 - 0.22, 0.03, 0, 0.42, 0.06, d - 0.06, shade(color, 0.8));
      box(0, h + 0.4, -d / 2 + 0.03, w * 0.6, 0.7, 0.03, shade(color, 0.8), "satin");
      box(0, h + 0.4, -d / 2 + 0.05, w * 0.6 - 0.06, 0.64, 0.01, "#cfd8dc", "mirror");
      break;
    }
    case "fitted-wardrobe": {
      // Flat-panel doors over a full-height carcass: tall doors below and a row of top boxes
      // above them, as in the photos. Thin dark joints stand in for the shadow gaps.
      const t = 0.02; // door thickness
      const gap = 0.006; // joint between doors
      const top = Math.min(0.4, h * 0.2); // top-box height
      const skirt = 0.06;
      const front = d / 2;
      const zd = front - t / 2;
      const joint = shade(color, 0.5);
      box(0, h / 2, -t / 2, w, h, d - t, shade(color, 0.9), "satin");
      const n = wardrobeDoorCount(symbol, w);
      const dw = w / n;
      const rows: [number, number, number][] = [
        [skirt, h - top - gap, 1.0],
        [h - top, h, h - top + 0.08],
      ];
      for (const [y0, y1, knobY] of rows) {
        for (let i = 0; i < n; i++) {
          const x = -w / 2 + (i + 0.5) * dw;
          box(x, (y0 + y1) / 2, zd, dw - gap, y1 - y0 - gap, t, color, "satin");
          // Knobs sit on the edge nearest the middle of each pair of doors.
          cyl(x + (i % 2 ? -1 : 1) * (dw / 2 - 0.05), knobY, front + 0.01, 0.03, 0.02, KNOB, "satin", "z");
        }
      }
      for (let i = 1; i < n; i++) box(-w / 2 + i * dw, (h + skirt) / 2, zd, gap, h - skirt, t, joint);
      box(0, skirt / 2, zd, w, skirt, t, shade(color, 0.85), "satin");
      break;
    }
    case "shaker-wardrobe": {
      // Full-height framed doors, as in the photos: a recessed panel above a shorter one, each
      // outlined by a thin raised bead, with a round knob on the edge nearest the middle of each
      // pair of doors. A run with an odd number of doors starts with a single one.
      const t = 0.018;
      const gap = 0.005;
      const skirt = 0.08;
      const zd = d / 2 - t / 2;
      const front = d / 2;
      const bead = shade(color, 1.2);
      box(0, h / 2, -t / 2, w, h, d - t, shade(color, 0.9), "satin");
      box(0, skirt / 2, zd, w, skirt, t, shade(color, 0.85), "satin");
      // A dark backer just behind the door fronts, so the joints between doors read as solid shadow gaps.
      box(0, (skirt + h - 0.02) / 2, zd, w, h - 0.02 - skirt, t * 0.8, shade(color, 0.5));
      const n = wardrobeDoorCount(symbol, w);
      const dw = w / n;
      const y0 = skirt;
      const y1 = h - 0.02;
      const rail = 0.07; // rail and stile width outside the bead
      const mid = y0 + (y1 - y0) * 0.33; // bottom of the long upper panel
      const knobY = mid + 0.1;
      const lone = n % 2; // doors before the first pair
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + (i + 0.5) * dw;
        box(x, (y0 + y1) / 2, zd, dw - gap, y1 - y0, t, color, "satin");
        const bw = dw - gap - 2 * rail;
        // Bead round each panel, standing 6 mm proud of the door face.
        for (const [by0, by1] of [
          [y0 + rail, mid - rail / 2],
          [mid + rail / 2, y1 - rail],
        ]) {
          const bh = by1 - by0;
          const bc = (by0 + by1) / 2;
          for (const sy of [by0, by1]) box(x, sy, front + 0.003, bw, 0.009, 0.006, bead, "satin");
          for (const sx of [-1, 1]) box(x + (sx * bw) / 2, bc, front + 0.003, 0.009, bh, 0.006, bead, "satin");
        }
        const right = i < lone || (i - lone) % 2 === 0;
        cyl(x + (right ? 1 : -1) * (dw / 2 - 0.045), knobY, front + 0.012, 0.032, 0.024, KNOB, "satin", "z");
      }
      break;
    }
    case "hood": {
      // A slim canopy hood across the bottom, under a short wall cabinet set back to the wall-cabinet depth.
      const cd = Math.min(d, 0.33);
      const cy0 = Math.min(0.26, h * 0.4);
      box(0, (cy0 + h) / 2, -d / 2 + cd / 2, w, h - cy0, cd, color, "satin");
      doors(cy0 + 0.01, h - 0.01, -d / 2 + cd, 0.6, false);
      box(0, 0.06 + (cy0 - 0.06) / 2, 0, w, cy0 - 0.06, d, "#26282c", "satin");
      box(0, 0.055, 0.02, w - 0.06, 0.012, d - 0.08, "#8e9399", "metal");
      box(0, cy0 - 0.03, d / 2 + 0.003, w - 0.02, 0.012, 0.006, "#4b4f55", "satin");
      box(0, 0.065, d / 2 - 0.005, w, 0.01, 0.01, STEEL, "metal");
      break;
    }
    case "fireplace": {
      // Hearth slab across the full footprint; a carved surround (legs, frieze and mantel shelf) against
      // the wall framing a marble back panel, with a brass-framed gas fire at its foot.
      const hearth = 0.04;
      const sw = w * 0.9;
      const sd = Math.min(0.14, d * 0.4);
      const lw = Math.min(0.17, sw * 0.14);
      const zs = -d / 2 + sd / 2;
      const front = -d / 2 + sd;
      const frieze = Math.min(0.16, h * 0.14);
      const shelf = 0.05;
      const legTop = h - shelf - frieze;
      const carve = shade(color, 1.3);
      box(0, hearth / 2, 0, w, hearth, d, MARBLE, "gloss");
      box(0, (hearth + legTop) / 2, -d / 2 + 0.015, sw - lw * 2, legTop - hearth, 0.03, MARBLE, "gloss");
      for (const sx of [-1, 1]) {
        const x = sx * (sw / 2 - lw / 2);
        box(x, (hearth + legTop) / 2, zs, lw, legTop - hearth, sd, color, "satin");
        box(x, hearth + (legTop - hearth) * 0.55, front + 0.006, lw * 0.5, (legTop - hearth) * 0.6, 0.012, carve, "satin");
        box(x, legTop - 0.05, front + 0.012, lw * 0.8, 0.08, 0.024, carve, "satin");
      }
      box(0, legTop + frieze / 2, zs, sw, frieze, sd, color, "satin");
      box(0, legTop + frieze / 2, front + 0.006, sw * 0.42, frieze * 0.5, 0.012, carve, "satin");
      box(0, h - shelf / 2, -d / 2 + (sd + 0.06) / 2, sw + 0.1, shelf, sd + 0.06, color, "satin");
      // Gas fire: brass frame, black firebox with coals, and a dark fret along the bottom.
      const fw = Math.min(0.5, sw - lw * 2 - 0.1);
      const fh = Math.min(0.58, legTop - hearth - 0.12);
      const fz = -d / 2 + 0.06;
      box(0, hearth + fh / 2, fz, fw, fh, 0.08, BRASS, "metal");
      box(0, hearth + fh / 2 + 0.02, fz + 0.041, fw - 0.09, fh - 0.15, 0.004, "#141518", "gloss");
      box(0, hearth + 0.17, fz + 0.045, fw - 0.13, 0.09, 0.02, "#3b3734");
      box(0, hearth + 0.05, fz + 0.06, fw - 0.02, 0.06, 0.04, "#1d1e21", "metal");
      break;
    }
    case "radiator": {
      // Steel panels with pressed vertical channels; a double has a second panel behind with convector
      // fins between, seen as a grille from above. Two brackets hold it off the wall.
      const t = 0.02; // panel thickness
      const off = Math.min(0.03, d * 0.4); // wall to the back panel, on the brackets
      const zf = d / 2 - t / 2; // front panel
      const panels = radiatorPanels(d);
      const zb = panels === 2 ? -d / 2 + off + t / 2 : zf;
      const lip = Math.min(0.03, h * 0.08); // flat band top and bottom, with no channels
      const flute = shade(color, 0.86);
      box(0, h / 2, zf, w, h, t, color, "satin");
      if (panels === 2) {
        box(0, h / 2, zb, w, h, t, color, "satin");
        box(0, (h - 0.012) / 2, (zf + zb) / 2, w - 0.02, h - 0.012, zf - zb - t, shade(color, 0.62));
      } else box(0, (h - 0.012) / 2, zf - t / 2 - 0.008, w - 0.02, h - 0.012, 0.016, shade(color, 0.62));
      const n = Math.max(3, Math.round(w / 0.05));
      for (let i = 1; i < n; i++) box(-w / 2 + (i * w) / n, h / 2, d / 2 + 0.0008, 0.007, h - lip * 2, 0.002, flute, "satin");
      for (const sx of [-1, 1]) box(sx * (w / 2 - Math.min(0.15, w * 0.2)), h * 0.7, -d / 2 + off / 2, 0.04, 0.08, off, shade(color, 0.8));
      valves(zb);
      break;
    }
    case "column-radiator": {
      // Rows of round columns between a top and bottom header: two rows when it is deep enough.
      const n = Math.max(3, Math.round(w / 0.065));
      const dia = Math.min(0.032, (w / n) * 0.7);
      const rows = d > 0.08 ? [d / 2 - dia / 2 - 0.004, d / 2 - dia * 1.5 - 0.012] : [d / 2 - dia / 2 - 0.004];
      const head = Math.min(0.05, h * 0.06);
      for (const z of rows) {
        for (let i = 0; i < n; i++) cyl(-w / 2 + ((i + 0.5) * w) / n, h / 2, z, dia, h - head, color, "satin");
        for (const y of [head / 2, h - head / 2]) box(0, y, z, w - 0.01, head, dia * 0.8, shade(color, 0.92), "satin");
      }
      const back = rows[rows.length - 1] - dia / 2;
      for (const sx of [-1, 1]) box(sx * (w / 2 - Math.min(0.12, w * 0.2)), h * 0.75, (-d / 2 + back) / 2, 0.03, 0.05, back + d / 2, shade(color, 0.8));
      valves(rows[rows.length - 1]);
      break;
    }
    case "boiler":
      box(0, h / 2, 0, w, h, d, color, "gloss");
      box(0, 0.08, d / 2 + 0.005, w - 0.06, 0.1, 0.01, "#4b5563", "satin");
      cyl(0, h + 0.1, -d / 2 + 0.1, 0.1, 0.2, "#e5e7eb", "satin");
      break;
    default:
      box(0, h / 2, 0, w, h, d, color, "satin");
  }
  return out;
}

