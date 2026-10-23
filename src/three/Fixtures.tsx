import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Floor } from "../types";
import { toWorld } from "../lib/geometry";
import { DEFAULT_WORKTOP, burners, byId, chaiseSizes, radiatorPanels, sideBySideSplit, wardrobeDoorCount, type Symbol } from "../lib/catalogue";
import { fixtureBox } from "../lib/planMath";
import { glassMaterial, inUse } from "./textures";

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
    for (const pt of fixtureParts(item.symbol, b.w, b.d, b.h, f.color ?? item.color, f.worktop ?? WORKTOP, b.z0)) {
      const axis = pt.axis === "x" ? AXIS_X : pt.axis === "z" ? AXIS_Z : null;
      _quat.setFromEuler(axis ? _euler.set(axis[0], axis[1], axis[2]) : _euler.set(pt.tilt ?? 0, 0, 0));
      _part.compose(_pos.set(pt.p[0], pt.p[1], pt.p[2]), _quat, _scale.set(pt.s[0], pt.s[1], pt.s[2]));
      const g = GEOMETRY[pt.g].clone().applyMatrix4(_part.premultiply(_place));
      const key = pt.c + pt.f;
      const group = groups.get(key) ?? { color: pt.c, finish: pt.f, geoms: [] };
      group.geoms.push(g);
      groups.set(key, group);
    }
  }
  const out: FixtureMesh[] = [];
  for (const [key, g] of groups) {
    const merged = mergeGeometries(g.geoms);
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
const GEOMETRY = { box: BOX, cyl: CYL, quarter: QUARTER, shell: QUARTER_SHELL };
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
  g: keyof typeof GEOMETRY;
  /** Centre (for a quarter: the corner on its axis, at mid-height). */
  p: [number, number, number];
  s: [number, number, number];
  c: string;
  f: Finish;
  /** Axis of a cylinder (default standing, along y). */
  axis?: "x" | "z";
  /** Lean about the x axis, radians, after scaling; negative tips the top back and the front up. */
  tilt?: number;
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
function fixtureParts(symbol: Symbol, w: number, d: number, h: number, color: string, worktopColor = WORKTOP, mount = 0): Part[] {
  const out: Part[] = [];
  const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, c = color, f: Finish = "matt") =>
    out.push({ g: "box", p: [x, y, z], s: [Math.max(sx, 0.001), Math.max(sy, 0.001), Math.max(sz, 0.001)], c, f });
  const cyl = (x: number, y: number, z: number, dia: number, len: number, c: string, f: Finish = "matt", axis?: "x" | "z") =>
    out.push({ g: "cyl", p: [x, y, z], s: [dia, len, dia], c, f, axis });
  /** A box leaning back by `tilt` radians about its centre (see Part.tilt). */
  const lean = (x: number, y: number, z: number, sx: number, sy: number, sz: number, tilt: number, c = color, f: Finish = "matt") =>
    out.push({ g: "box", p: [x, y, z], s: [sx, sy, sz], c, f, tilt });
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
      box(cx, y + 0.07, (z0 + z1) / 2, cw - 0.015, 0.14, z1 - z0 - 0.01);
      if (backs) lean(cx, (y + 0.14 + h - 0.03) / 2, z0 + 0.09, cw - 0.03, h - 0.03 - y - 0.14, 0.16, -0.12, shade(color, 1.06));
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
      box(0, 0.15, 0, w, 0.3, d, "#8a6d4b");
      box(0, 0.4, d * 0.03, w - 0.06, 0.2, d - 0.12, color);
      box(0, 0.53, -d / 2 + 0.22, w - 0.2, 0.1, 0.3, "#ffffff");
      box(0, 0.51, d * 0.18, w - 0.04, 0.04, d * 0.6, shade(color, 0.85));
      box(0, (h + 0.5) / 2, -d / 2 + 0.03, w, h + 0.5, 0.06, "#8a6d4b");
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
      const arm = Math.min(0.2, w * 0.15);
      box(0, 0.22, back / 2, w - arm * 2, 0.44, d - back, color);
      box(0, (0.44 + h) / 2 - 0.1, -d / 2 + back / 2, w, h - 0.24, back, color);
      box(0, 0.1, 0, w, 0.2, d, shade(color, 0.8));
      for (const sx of [-1, 1]) box(sx * (w / 2 - arm / 2), 0.31, 0, arm, 0.62, d, color);
      break;
    }
    case "corner-sofa": {
      // A run along the back and a return down the left, as on the plan.
      const s = Math.min(0.95, w * 0.45, d * 0.5);
      const back = Math.min(0.22, s * 0.3);
      const arm = Math.min(0.2, s * 0.25);
      const base = shade(color, 0.8);
      box(0, 0.1, -d / 2 + s / 2, w, 0.2, s, base);
      box(-w / 2 + s / 2, 0.1, s / 2, s, 0.2, d - s, base);
      box((back - arm) / 2, 0.32, -d / 2 + (back + s) / 2, w - back - arm, 0.24, s - back, color);
      box(-w / 2 + (back + s) / 2, 0.32, (s - arm) / 2, s - back, 0.24, d - s - arm, color);
      box(0, (0.44 + h) / 2 - 0.1, -d / 2 + back / 2, w, h - 0.24, back, color);
      box(-w / 2 + back / 2, (0.44 + h) / 2 - 0.1, back / 2, back, h - 0.24, d - back, color);
      box(w / 2 - arm / 2, 0.31, -d / 2 + s / 2, arm, 0.62, s, color);
      box(-w / 2 + s / 2, 0.31, d / 2 - arm / 2, s, 0.62, arm, color);
      break;
    }
    case "low-sofa": {
      const back = Math.min(0.2, d * 0.25);
      const arm = Math.min(0.14, w * 0.1);
      const frame = shade(color, 0.85);
      legs([[-w / 2 + 0.06, -d / 2 + 0.06], [w / 2 - 0.06, -d / 2 + 0.06], [-w / 2 + 0.06, d / 2 - 0.06], [w / 2 - 0.06, d / 2 - 0.06]]);
      box(0, 0.18, 0, w, 0.16, d, frame);
      for (const sx of [-1, 1]) box(sx * (w / 2 - arm / 2), 0.38, 0, arm, 0.24, d, color);
      box(0, (0.26 + h) / 2, -d / 2 + back / 2, w - arm * 2, h - 0.26, back, color);
      cushions(-w / 2 + arm, w / 2 - arm, -d / 2 + back, d / 2, 0.26, true);
      break;
    }
    case "chaise-sofa": {
      const { s, c, back, arm } = chaiseSizes(w, d);
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
    case "pouf":
      drum(0, h, w, d, color);
      drum(h - 0.012, h + 0.002, w * 0.98, d * 0.98, shade(color, 0.9));
      break;
    case "round-table":
      drum(0, 0.02, w * 0.5, d * 0.5, shade(color, 0.85), "satin");
      drum(0.02, h - 0.03, w * 0.45, d * 0.45, shade(color, 0.92), "satin");
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
    case "media-unit": {
      // A wall-hung box with fluted, handleless fronts.
      box(0, h / 2, 0, w, h, d, color, "satin");
      const n = Math.max(1, Math.round(w / 0.6));
      for (let i = 1; i < n; i++) box(-w / 2 + (i * w) / n, h / 2, d / 2, 0.004, h - 0.02, 0.006, DARK);
      const flutes = Math.round(w / 0.05);
      for (let i = 0; i < flutes; i++) box(-w / 2 + ((i + 0.5) * w) / flutes, h / 2, d / 2 + 0.004, 0.022, h - 0.04, 0.008, shade(color, 1.08), "satin");
      break;
    }
    case "rug":
      box(0, h / 2, 0, w, h, d, color);
      box(0, h + 0.001, 0, w - Math.min(0.24, w * 0.16), 0.002, d - Math.min(0.24, d * 0.16), shade(color, 0.88));
      break;
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
    case "shelf":
      box(0, h / 2, 0, w, h, d, color, "satin");
      // A few things on it so it reads as an open shelf.
      if (w > 0.4) {
        cyl(-w * 0.3, h + 0.09, 0, 0.1, 0.18, "#e9e4da", "gloss");
        cyl(-w * 0.18, h + 0.06, 0, 0.08, 0.12, "#e9e4da", "gloss");
        box(w * 0.25, h + 0.11, -0.02, 0.24, 0.22, 0.03, "#7f8b78", "satin");
      }
      break;
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
      // A few rows of books so it reads as a bookcase.
      const bookColours = ["#7b3b3b", "#2f4f6f", "#5d6b3a", "#b08a4a"];
      for (let i = 0; i < n; i++) {
        const y = t + (i * (h - t)) / n;
        const bh = Math.min(0.26, (h - t) / n - t - 0.04);
        bookColours.forEach((c, j) => box(-w / 2 + t + (w - t * 2) * (0.05 + j * 0.2 + ((i * 7) % 3) * 0.02), y + bh / 2, 0.01, (w - t * 2) * 0.16, bh, d * 0.75, c));
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

/** Lighten (k > 1) or darken (k < 1) a hex colour. */
function shade(hex: string, k: number): string {
  const c = new THREE.Color(hex);
  c.r = Math.min(1, c.r * k);
  c.g = Math.min(1, c.g * k);
  c.b = Math.min(1, c.b * k);
  return "#" + c.getHexString();
}
