import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { GardenItem, Site } from "../types";
import type { V2 } from "../lib/geometry";
import { gardenDef, isPlant, itemSize, type GardenDef } from "../lib/gardenCatalogue";
import { gardenParts, type GFinish, type GPart } from "../lib/gardenParts";
import { plantParts, runParts } from "../lib/plantForms";
import { alongEvery, festoonCurve, itemsOf } from "../lib/siteItems";
import { surfaceOutline } from "../lib/surfaceCurve";
import { surfaceHeightAt } from "../lib/surfaceSlope";
import { bbox, pointInPolygon } from "../lib/geometry";
import { edgesOf, pointSegmentDistance } from "../lib/site";
import { lightGlow } from "../lib/dusk";
import { useSunInfo } from "./useSun";
import { GROUND_Y } from "./Site";

/**
 * Garden items and plants in 3D (Site.items). Every item's parts
 * (lib/gardenParts.ts, lib/plantForms.ts) are placed on the ground under it,
 * turned by its rotation, and merged into one geometry per finish, colours
 * riding on vertex colours, so a garden of any size costs a handful of draw
 * calls. Festoon bulbs are one instanced mesh for the site. Lights have no
 * real light: their bulbs glow (emissive, stronger as the sun goes down),
 * with a soft halo and, for bollards and wall lights, a pool of light on the
 * ground.
 */
export function SiteItems({ site, quiet, buildings = [] }: { site: Site; quiet: boolean; buildings?: V2[][] }) {
  const built = useMemo(
    () => buildGarden(site, quiet, buildings),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [site.items, site.surfaces, site.boundary, site.boundaryEdges, quiet, buildings],
  );
  useEffect(() => () => built.dispose(), [built]);

  const sun = useSunInfo();
  const invalidate = useThree((s) => s.invalidate);
  const glow = lightGlow(sun?.active ? sun.position.altitude : null);
  useEffect(() => {
    setGlow(glow);
    invalidate();
  }, [glow, built, invalidate]);

  if (!built.group.children.length) return null;
  return <primitive object={built.group} />;
}

// ---------------------------------------------------------------------------
// Unit shapes: non-indexed, position and normal only, so any mix merges.

function unit(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  if (n !== g) g.dispose();
  n.deleteAttribute("uv");
  if (!n.getAttribute("normal")) n.computeVertexNormals();
  return n;
}

/** A 1 × 1 × 1 triangular prism: ridge along x at y = 0.5, eaves at y = -0.5, z = ±0.5. */
function prism(): THREE.BufferGeometry {
  const A = [-0.5, -0.5, 0.5], B = [-0.5, -0.5, -0.5], C = [-0.5, 0.5, 0]; // prettier-ignore
  const D = [0.5, -0.5, 0.5], E = [0.5, -0.5, -0.5], F = [0.5, 0.5, 0]; // prettier-ignore
  const tris = [
    [A, C, B], [D, E, F], // ends
    [A, D, F], [A, F, C], // front slope
    [B, C, F], [B, F, E], // back slope
    [A, B, E], [A, E, D], // bottom
  ]; // prettier-ignore
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(tris.flat(2), 3));
  g.computeVertexNormals();
  return g;
}

/** A lumpy blob: an icosphere with every vertex pushed out 0.92–1.08 by a fixed hash, then welded and smooth shaded. */
function lumpy(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.5, 1);
  g.deleteAttribute("normal");
  g.deleteAttribute("uv");
  const pos = g.getAttribute("position");
  const v = new THREE.Vector3();
  const seen = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // Same point, same push, so the welded blob has no cracks.
    const key = `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`;
    let k = seen.get(key);
    if (k === undefined) seen.set(key, (k = seen.size));
    v.multiplyScalar(0.92 + 0.16 * (jitter(k, 7) + 0.5));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  const m = mergeVertices(g, 1e-3);
  g.dispose();
  m.computeVertexNormals();
  return m;
}

/** A flat double-sided tapered strip (1 wide at the foot, 0.1 at the tip, 1 tall), bowing 0.15 towards +z, in 3 quads. */
function blade(): THREE.BufferGeometry {
  const rows = 4;
  const row = (i: number) => {
    const t = i / (rows - 1);
    const hw = 0.5 * (1 - 0.9 * t);
    const z = 0.15 * t * t - 0.05;
    return [[-hw, t - 0.5, z], [hw, t - 0.5, z]];
  };
  const pos: number[] = [];
  for (let i = 0; i < rows - 1; i++) {
    const [a, b] = row(i);
    const [c, d] = row(i + 1);
    // Front faces, then the same faces wound the other way.
    pos.push(...a, ...b, ...d, ...a, ...d, ...c, ...a, ...d, ...b, ...a, ...c, ...d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Rounded cushion: a 1 × 1 × 1 box with soft edges. */
function pillowGeo(): THREE.BufferGeometry {
  const g = new RoundedBoxGeometry(1, 1, 1, 2, 0.15);
  return g;
}

let shapes: Record<GPart["g"] | "ico0" | "cylLo", THREE.BufferGeometry> | undefined;
function unitShapes() {
  return (shapes ??= {
    box: unit(new THREE.BoxGeometry(1, 1, 1)),
    cyl: unit(new THREE.CylinderGeometry(0.5, 0.5, 1, 24)),
    cylLo: unit(new THREE.CylinderGeometry(0.5, 0.5, 1, 12)),
    cone: unit(new THREE.ConeGeometry(0.5, 1, 12)),
    cone8: unit(new THREE.ConeGeometry(0.5, 1, 8)),
    sphere: unit(new THREE.SphereGeometry(0.5, 12, 8)),
    ico: unit(lumpy()),
    ico0: unit(new THREE.SphereGeometry(0.5, 8, 6)),
    prism: unit(prism()),
    blade: unit(blade()),
    pillow: unit(pillowGeo()),
  });
}

// ---------------------------------------------------------------------------
// Materials: one per finish (and glow colour), shared by every viewer.

const FINISH: Record<GFinish, THREE.MeshStandardMaterialParameters> = {
  metal: { roughness: 0.45, metalness: 0.55 },
  timber: { roughness: 0.85 },
  plastic: { roughness: 0.55 },
  fabric: { roughness: 0.95, side: THREE.DoubleSide },
  stone: { roughness: 0.95 },
  leaf: { roughness: 0.9 },
  bark: { roughness: 1 },
  soil: { roughness: 1 },
  bulb: { roughness: 0.4 },
};
/** Emissive strength of a bulb at full glow. */
const BULB_INTENSITY = 2;

const materials = new Map<string, THREE.MeshStandardMaterial>();
function material(finish: GFinish, glow?: string): THREE.MeshStandardMaterial {
  const key = `${finish}|${glow ?? ""}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ vertexColors: true, ...FINISH[finish] });
    if (glow) {
      m.emissive.set(glow);
      m.emissiveIntensity = BULB_INTENSITY * currentGlow;
    }
    materials.set(key, m);
  }
  return m;
}

/** Festoon bulbs stay clear glass by day: no glow until the lights come up past the daytime level. */
const clearGlass = (g: number) => Math.max(0, g - 0.15) / 0.85;

let currentGlow = lightGlow(null);
/** Turn every bulb, halo and light pool up or down for the sun's altitude. */
function setGlow(g: number) {
  currentGlow = g;
  for (const [key, m] of materials) if (!key.endsWith("|")) m.emissiveIntensity = BULB_INTENSITY * (key.startsWith("bulb-inst") ? clearGlass(g) : g);
  // Halos and pools show from about the time the lamps would be switched on.
  const t = THREE.MathUtils.smoothstep(g, 0.3, 0.9);
  halo().opacity = 0.85 * t;
  pool().opacity = 0.55 * t;
  halo().visible = pool().visible = t > 0.01;
}

/** A soft round glow, white in the middle fading to nothing (for halos and light pools). */
let glowTex: THREE.Texture | undefined;
function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const size = 64;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.12, "rgba(255,255,255,0.5)");
  grad.addColorStop(0.4, "rgba(255,255,255,0.12)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}
let haloMat: THREE.PointsMaterial | undefined;
function halo(): THREE.PointsMaterial {
  return (haloMat ??= new THREE.PointsMaterial({
    size: 0.32,
    map: glowTexture(),
    color: "#ffc98a",
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    visible: false,
  }));
}
let poolMat: THREE.MeshBasicMaterial | undefined;
function pool(): THREE.MeshBasicMaterial {
  return (poolMat ??= new THREE.MeshBasicMaterial({
    map: glowTexture(),
    color: "#ffb870",
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -16,
    visible: false,
  }));
}

// ---------------------------------------------------------------------------
// Building.

interface Built {
  group: THREE.Group;
  dispose: () => void;
  /** Milliseconds the last build took (dev checks). */
  ms: number;
}

const _m = new THREE.Matrix4();
const _place = new THREE.Matrix4();
const _lift = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

/** Deterministic jitter in [-0.5, 0.5) from two integers. */
function jitter(a: number, b: number): number {
  const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return x - Math.floor(x) - 0.5;
}

/**
 * Ground height under a point, metres above GROUND_Y: lib/siteItems.ts groundHeightAt with each surface's
 * outline worked out once, since a hedge or bamboo screen asks for every part.
 */
function groundSampler(site: Site): (x: number, y: number) => number {
  const surfaces = site.surfaces.filter((s) => s.polygon.length >= 3).map((s) => {
    const outline = surfaceOutline(s, site.surfaces);
    return { s, outline, box: bbox(outline) };
  });
  return (x, y) => {
    let h = 0;
    for (const { s, outline, box } of surfaces) {
      if (x < box.x0 || x > box.x1 || y < box.y0 || y > box.y1 || !pointInPolygon({ x, y }, outline)) continue;
      h = Math.max(h, surfaceHeightAt(s, { x, y }));
    }
    return h;
  };
}

/** One finish's pieces: shared unit geometries, each with its own matrix and colour. */
interface Group {
  finish: GFinish;
  glow?: string;
  pieces: { src: THREE.BufferGeometry; m: THREE.Matrix4; r: number; g: number; b: number }[];
  verts: number;
}

const _n = new THREE.Matrix3();
/** Bake a group's pieces into one non-indexed geometry (positions, normals, colours) without cloning each piece. */
function pack(grp: Group): THREE.BufferGeometry {
  const pos = new Float32Array(grp.verts * 3);
  const nor = new Float32Array(grp.verts * 3);
  const col = new Float32Array(grp.verts * 3);
  let o = 0;
  for (const { src, m, r, g, b } of grp.pieces) {
    const sp = src.getAttribute("position").array as Float32Array;
    const sn = src.getAttribute("normal").array as Float32Array;
    const e = m.elements;
    const ne = _n.getNormalMatrix(m).elements;
    for (let i = 0; i < sp.length; i += 3, o += 3) {
      const x = sp[i], y = sp[i + 1], z = sp[i + 2];
      pos[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
      pos[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      pos[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      const nx = sn[i], ny = sn[i + 1], nz = sn[i + 2];
      const ax = ne[0] * nx + ne[3] * ny + ne[6] * nz;
      const ay = ne[1] * nx + ne[4] * ny + ne[7] * nz;
      const az = ne[2] * nx + ne[5] * ny + ne[8] * nz;
      const l = Math.hypot(ax, ay, az) || 1;
      nor[o] = ax / l;
      nor[o + 1] = ay / l;
      nor[o + 2] = az / l;
      col[o] = r;
      col[o + 1] = g;
      col[o + 2] = b;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  return geo;
}

/** Where built pieces go: placed parts, or ready-made world geometry. */
interface Sink {
  part: (pt: GPart, place: THREE.Matrix4, lift: number, salt: number) => void;
  /** A temporary geometry to dispose once packed. */
  own: (g: THREE.BufferGeometry) => void;
  ground: (x: number, y: number) => number;
  geom: (g: THREE.BufferGeometry, matrix: THREE.Matrix4, mat: GPart["mat"], salt: number) => void;
}

/** Where a light pool goes and how big it is. */
interface Pool {
  x: number;
  y: number;
  z: number;
  r: number;
}

function buildGarden(site: Site, quiet: boolean, buildings: V2[][]): Built {
  const t0 = performance.now();
  const S = unitShapes();
  const groups = new Map<string, Group>();
  const bulbs: THREE.Vector3[] = [];
  const halos: number[] = [];
  const pools: Pool[] = [];
  const ground = groundSampler(site);
  /** A geometry under a matrix, painted one colour (a leaf or bark colour nudged by `salt`), into its finish's group. */
  const addGeom = (src: THREE.BufferGeometry, matrix: THREE.Matrix4, mat: GPart["mat"], salt: number) => {
    _c.set(mat.color);
    if (!quiet && (mat.finish === "leaf" || mat.finish === "bark")) _c.multiplyScalar(1 + 0.12 * jitter(salt, mat.color.length));
    const key = `${mat.finish}|${mat.glow ?? ""}`;
    let grp = groups.get(key);
    if (!grp) groups.set(key, (grp = { finish: mat.finish, glow: mat.glow, pieces: [], verts: 0 }));
    grp.pieces.push({ src, m: matrix.clone(), r: _c.r, g: _c.g, b: _c.b });
    grp.verts += src.getAttribute("position").count;
  };
  /** A part placed by `place` (and lifted `lift` metres) into its finish's group. */
  const addPart = (pt: GPart, place: THREE.Matrix4, lift: number, salt: number) => {
    const big = Math.max(pt.s[0], pt.s[1], pt.s[2]);
    const src = pt.g === "ico" && big < 0.25 ? S.ico0 : pt.g === "cyl" && Math.max(pt.s[0], pt.s[2]) < 0.1 ? S.cylLo : S[pt.g];
    _q.setFromEuler(_e.set(pt.tilt ?? 0, pt.rotY ?? 0, 0, "YXZ"));
    _m.compose(_v.set(pt.p[0], pt.p[1], pt.p[2]), _q, _s.set(pt.s[0], pt.s[1], pt.s[2]));
    _m.premultiply(place);
    if (lift) _m.premultiply(_lift.makeTranslation(0, lift, 0));
    addGeom(src, _m, pt.mat, salt);
    if (pt.mat.finish === "bulb") {
      const c = _v.set(0, 0, 0).applyMatrix4(_m);
      halos.push(c.x, c.y, c.z);
    }
  };
  const temp: THREE.BufferGeometry[] = [];
  const sink: Sink = { part: addPart, geom: addGeom, own: (g) => temp.push(g), ground };

  // Ends of a festoon near a wall, fence, hedge or building are tied to it; elsewhere they need a post.
  const edges = edgesOf(site);
  const lines: [V2, V2][] = [];
  site.boundary.forEach((a, i) => {
    if (edges[i]?.kind !== "open") lines.push([a, site.boundary[(i + 1) % site.boundary.length]]);
  });
  for (const poly of buildings) poly.forEach((a, i) => lines.push([a, poly[(i + 1) % poly.length]]));
  const tied = (p: V2) => lines.some(([a, b]) => pointSegmentDistance(p, a, b) <= 0.3);

  itemsOf(site).forEach((item, idx) => {
    const def = gardenDef(item.type);
    if (!def) return;
    if (def.run === "festoon") return festoon(item, def, idx, sink, bulbs, pools, tied);
    const base = ground(item.x, item.y);
    if (def.run) {
      const yaw = item.to ? -Math.atan2(item.to.y - item.y, item.to.x - item.x) : (-item.rot * Math.PI) / 180;
      _place.compose(_v.set(item.x, GROUND_Y, item.y), _q.setFromAxisAngle(UP, yaw), _s.set(1, 1, 1));
      const place = _place.clone();
      const c = Math.cos(-yaw), s = Math.sin(-yaw);
      runParts(def, item).forEach((pt, k) => {
        // Each part of a run stands on the ground under it.
        const wx = item.x + pt.p[0] * c - pt.p[2] * s;
        const wy = item.y + pt.p[0] * s + pt.p[2] * c;
        addPart(pt, place, ground(wx, wy), idx * 1000 + k);
      });
      return;
    }
    const mount = item.mount ?? def.mount ?? 0;
    const yaw = (-item.rot * Math.PI) / 180;
    _place.compose(_v.set(item.x, GROUND_Y + base + mount, item.y), _q.setFromAxisAngle(UP, yaw), _s.set(1, 1, 1));
    const place = _place.clone();
    const parts = isPlant(def) ? plantParts(def, item) : gardenParts(def, item);
    parts.forEach((pt, k) => addPart(pt, place, 0, idx * 1000 + k));
    if (def.shape === "bollard" || def.shape === "wall-light") {
      const { d } = itemSize(item);
      // A wall light throws its pool forwards from the wall, a bollard round its foot.
      const fwd = def.shape === "wall-light" ? 0.25 + d : 0;
      pools.push({ x: item.x + Math.sin(yaw) * fwd, y: GROUND_Y + base + 0.012, z: item.y + Math.cos(yaw) * fwd, r: def.shape === "wall-light" ? 1.6 : 1.1 });
    }
  });

  const group = new THREE.Group();
  group.name = "garden-items";
  const owned: THREE.BufferGeometry[] = [];
  for (const grp of groups.values()) {
    const { finish, glow } = grp;
    const merged = pack(grp);
    owned.push(merged);
    const mesh = new THREE.Mesh(merged, material(finish, glow));
    mesh.castShadow = finish !== "bulb";
    mesh.receiveShadow = finish !== "bulb";
    group.add(mesh);
  }
  if (bulbs.length) {
    const geo = new THREE.SphereGeometry(0.5, 10, 6);
    owned.push(geo);
    const lamp = gardenDef("festoon")?.glow ?? "#ffd9a0";
    const mesh = new THREE.InstancedMesh(geo, bulbMaterial(lamp), bulbs.length);
    bulbs.forEach((p, i) => mesh.setMatrixAt(i, _m.compose(p, _q.identity(), _s.set(0.06, 0.072, 0.06))));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    for (const p of bulbs) halos.push(p.x, p.y, p.z);
  }
  if (halos.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(halos, 3));
    owned.push(geo);
    const pts = new THREE.Points(geo, halo());
    pts.raycast = () => {};
    pts.renderOrder = 3;
    group.add(pts);
  }
  if (pools.length) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    owned.push(geo);
    const mesh = new THREE.InstancedMesh(geo, pool(), pools.length);
    pools.forEach((p, i) => mesh.setMatrixAt(i, _m.compose(_v.set(p.x, p.y, p.z), _q.identity(), _s.set(p.r * 2, 1, p.r * 2))));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.raycast = () => {};
    mesh.renderOrder = 2;
    group.add(mesh);
  }
  temp.forEach((g) => g.dispose());
  const ms = performance.now() - t0;
  if (import.meta.env.DEV) {
    let meshes = 0, triangles = 0;
    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const geo = mesh.geometry;
      const per = (geo.index ? geo.index.count : geo.getAttribute("position").count) / 3;
      meshes++;
      triangles += per * ((mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1);
    });
    Object.assign(window, { __gardenBuildMs: ms, __gardenStats: { meshes, triangles } });
  }
  return { group, ms, dispose: () => owned.forEach((g) => g.dispose()) };
}

/** Festoon bulbs share one plain material (not vertex coloured), lit like the other bulbs. */
function bulbMaterial(glow: string): THREE.MeshStandardMaterial {
  const key = `bulb-inst|${glow}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: "#f6f1e7", emissive: glow, emissiveIntensity: BULB_INTENSITY * clearGlass(currentGlow), roughness: 0.15 });
    materials.set(key, m);
  }
  return m;
}

/**
 * A festoon string: a thin dark wire sagging between its ends (h and toH above the ground under each), bulbs
 * every `pitch` hanging just below it, and a slim post at each end that is not tied to a wall or building.
 */
function festoon(
  item: GardenItem,
  def: GardenDef,
  idx: number,
  sink: Sink,
  bulbs: THREE.Vector3[],
  pools: Pool[],
  tied: (p: V2) => boolean,
) {
  const { h } = itemSize(item);
  const to = item.to ?? { x: item.x + 0.01, y: item.y };
  const ga = sink.ground(item.x, item.y);
  const gb = sink.ground(to.x, to.y);
  const a = { x: item.x, y: GROUND_Y + ga + h, z: item.y };
  const b = { x: to.x, y: GROUND_Y + gb + (item.toH ?? h), z: to.y };
  const curve = festoonCurve(a, b, item.sag ?? 0.3, 24);
  const wire = unit(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curve.map((p) => new THREE.Vector3(p.x, p.y, p.z))), 32, 0.004, 4, false));
  sink.geom(wire, new THREE.Matrix4(), { color: "#2b2b2b", finish: "plastic" }, idx);
  sink.own(wire);
  const radius = def.id === "festoon-warm" ? 1.0 : 0.9;
  alongEvery(curve, Math.max(0.1, def.pitch ?? 0.5)).forEach((p, i) => {
    bulbs.push(new THREE.Vector3(p.x, p.y - 0.06, p.z));
    // A pool of warm light on the ground under every second bulb.
    if (i % 2 === 0) pools.push({ x: p.x, y: GROUND_Y + sink.ground(p.x, p.z) + 0.012, z: p.z, r: radius });
  });
  for (const [end, g, top] of [[{ x: item.x, y: item.y }, ga, h], [to, gb, item.toH ?? h]] as [V2, number, number][]) {
    if (tied(end)) continue;
    _place.makeTranslation(end.x, GROUND_Y + g, end.y);
    sink.part({ g: "cyl", p: [0, (top + 0.08) / 2, 0], s: [0.07, top + 0.08, 0.07], mat: { color: def.color, finish: "metal" } }, _place.clone(), 0, idx * 1000 + 7);
  }
}
