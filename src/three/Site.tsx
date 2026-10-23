import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { BoundaryEdge, HouseModel, Neighbour, Site, SiteSurface, SurfaceKind } from "../types";
import { useStore } from "../store";
import { useViewedSite } from "./viewedVariant";
import { roofGeometry, type RoofEnd } from "../lib/roof";
import { bbox, polygonCentroid, roomWorldPolygon, type V2 } from "../lib/geometry";
import { clipSegmentOutside, edgesOf } from "../lib/site";
import { metricUvs } from "../lib/neighbourUv";
import { effectiveSlope, slopeHeight } from "../lib/surfaceSlope";
import { surfaceLook } from "../lib/surfaceFinish";
import { boundaryWallSegments, wallAt, type WallSegment } from "../lib/wallSteps";
import { triangles } from "./geometryUtil";
import { membraneTexture, tileTextures } from "./roofTextures";
import { getMaterial } from "./textures";
import { metricBox, siteTexture, type TextureKind } from "./siteTextures";
import { useSiteView } from "./siteView";
import { SunHoursOverlay } from "./SunHours";

/** Ground level relative to the ground floor's finished floor (floor 0 sits on a 0.25 m slab). */
export const GROUND_Y = -0.26;

/**
 * Ground, plot, garden surfaces, boundary treatments and neighbouring
 * buildings. `model` is the house this viewer shows; fences stop at its walls.
 */
export function SiteScene({ centre, size, model }: { centre: THREE.Vector3; size: number; model?: HouseModel }) {
  const site = useViewedSite();
  const showSite = useStore((s) => s.showSite);
  const active = useStore((s) => s.variants[s.activeVariant]);
  if (!site || !showSite) {
    return (
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[centre.x, GROUND_Y, centre.z]} receiveShadow>
        <planeGeometry args={[size * 4, size * 4]} />
        <meshStandardMaterial color="#cfd6cc" />
      </mesh>
    );
  }
  return <SiteContent site={site} house={model ?? active} centre={centre} />;
}

function SiteContent({ site, house, centre: houseCentre }: { site: Site; house?: HouseModel; centre: THREE.Vector3 }) {
  const ghost = useSiteView((s) => s.ghostNeighbours);
  const sunHours = useSiteView((s) => s.sunHours);
  const sunOn = useStore((s) => s.sun.enabled);
  // Fences stop where a building stands on the line: the house's ground floor or a neighbour.
  const buildings = useMemo(() => {
    const lowest = house?.floors.length ? Math.min(...house.floors.map((f) => f.level)) : 0;
    const own = (house?.floors ?? []).filter((f) => f.level === lowest).flatMap((f) => f.rooms.map((r) => roomWorldPolygon(f, r)));
    return [...own, ...site.neighbours.map((n) => n.polygon)];
  }, [house, site.neighbours]);
  const centre = useMemo(() => (site.boundary.length ? polygonCentroid(site.boundary) : { x: 0, y: 0 }), [site.boundary]);
  // Paint lower layers first and lift each layer a little to avoid z-fighting.
  const surfaces = useMemo(() => [...site.surfaces].sort((a, b) => LAYER[a.kind] - LAYER[b.kind]), [site.surfaces]);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[centre.x, GROUND_Y, centre.y]} geometry={farGround()} material={surfaceMaterial("ground")} receiveShadow />
      {surfaces.map((s) => (
        <Surface key={s.id} surface={s} />
      ))}
      <Boundary site={site} buildings={buildings} />
      {site.neighbours.map((n) => (
        <NeighbourMass key={n.id} n={n} ghost={ghost} house={houseCentre} />
      ))}
      {sunHours && sunOn && house && <SunHoursOverlay site={site} model={house} y={GROUND_Y + 0.07} />}
    </group>
  );
}

const LAYER: Record<SurfaceKind, number> = { road: 1, lawn: 1, pavement: 2, drive: 2, bed: 3, patio: 3, path: 4 };

const materials = new Map<string, THREE.Material>();
/** One cached material per surface or boundary kind, shared by every viewer. */
function surfaceMaterial(kind: TextureKind, layer = 0): THREE.Material {
  const key = `${kind}:${layer}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      map: siteTexture(kind).map,
      roughness: kind === "road" || kind === "pavement" || kind === "tarmac" ? 0.95 : 1,
      polygonOffset: layer > 0,
      polygonOffsetFactor: -layer,
      polygonOffsetUnits: -layer * 4,
    });
    if (kind === "road") breakUpRepeat(m as THREE.MeshStandardMaterial);
    materials.set(key, m);
  }
  return m;
}

/**
 * The road's 4 m texture tile shows its dark blotches at a visible rhythm. Mix
 * in smooth two-octave noise from world position, at 10 to 30 m, which
 * lightens and darkens the surface so no two tiles read alike.
 */
function breakUpRepeat(m: THREE.MeshStandardMaterial) {
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vRoadXZ;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvRoadXZ = (modelMatrix * vec4(transformed, 1.0)).xz;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec2 vRoadXZ;
float roadHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float roadNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(roadHash(i), roadHash(i + vec2(1.0, 0.0)), f.x), mix(roadHash(i + vec2(0.0, 1.0)), roadHash(i + vec2(1.0, 1.0)), f.x), f.y);
}`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
{
  float lo = roadNoise(vRoadXZ * 0.09) * 0.65 + roadNoise(vRoadXZ * 0.23 + 17.0) * 0.35;
  diffuseColor.rgb *= 0.78 + 0.44 * lo;
}`,
      );
  };
  m.customProgramCacheKey = () => "road-variation";
}

function plainMaterial(color: string, layer = 0): THREE.Material {
  const key = `${color}:${layer}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, polygonOffset: layer > 0, polygonOffsetFactor: -layer, polygonOffsetUnits: -layer * 4 });
    materials.set(key, m);
  }
  return m;
}

/** A flat shape in world x/z from a plan polygon; UVs come out in metres. */
function flatShape(poly: V2[]): THREE.Shape {
  const s = new THREE.Shape();
  poly.forEach((p, i) => (i === 0 ? s.moveTo(p.x, -p.y) : s.lineTo(p.x, -p.y)));
  s.closePath();
  return s;
}

/** Dispose geometries made together (one memo) when they are replaced or the component goes. */
function useDisposeAll(list: (THREE.BufferGeometry | null | undefined)[]) {
  useEffect(() => () => list.forEach((g) => g?.dispose()), [list]);
}
const useDispose = (g: THREE.BufferGeometry | null) => useEffect(() => () => g?.dispose(), [g]);

/** A flat surface, or one lifted and ramped by its slope, with a kerb-coloured edge where it stands proud of the ground. */
function Surface({ surface }: { surface: SiteSurface }) {
  const layer = LAYER[surface.kind];
  const slope = effectiveSlope(surface.slope);
  const geom = useMemo(() => {
    const g = new THREE.ShapeGeometry(flatShape(surface.polygon));
    if (!slope) return g;
    // Shape space is (x, -z, 0) and the mesh is turned flat, so a vertex's local z becomes its height.
    const pos = g.getAttribute("position");
    for (let i = 0; i < pos.count; i++) pos.setZ(i, slopeHeight(surface.polygon, slope, { x: pos.getX(i), y: -pos.getY(i) }));
    pos.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  }, [surface.polygon, slope?.toward, slope?.rise, slope?.base]); // eslint-disable-line react-hooks/exhaustive-deps
  const edge = useMemo(
    () => (slope ? surfaceEdge(surface.polygon, (p) => slopeHeight(surface.polygon, slope, p), 0.01 * layer + 0.02) : null),
    [surface.polygon, slope?.toward, slope?.rise, slope?.base, layer], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const line = useMemo(() => (surface.kind === "road" ? centreLine(surface.polygon) : null), [surface.polygon, surface.kind]);
  useDispose(geom);
  useDispose(edge);
  useDispose(line);
  return (
    <group position={[0, GROUND_Y + 0.01 * layer, 0]}>
      <mesh geometry={geom} rotation={[-Math.PI / 2, 0, 0]} material={surfaceMaterial(surfaceLook(surface), layer)} receiveShadow />
      {edge && <mesh geometry={edge} material={plainMaterial(surface.kind === "bed" ? "#9a4d3a" : "#a19e96")} castShadow receiveShadow />}
      {line &&<mesh geometry={line} position={[0, 0.004, 0]} material={plainMaterial("#ecebe4", layer + 1)} receiveShadow />}
    </group>
  );
}

/**
 * The sides of a raised surface: a vertical strip down each edge from the
 * surface's height there to `sink` below its own level, so a ramp or raised
 * path doesn't show a gap under its edge. Edges that lie at ground level
 * (the low end of a ramp) come out as nothing. Built in the surface's local
 * frame (x, up, z), facing outwards.
 */
function surfaceEdge(poly: V2[], height: (p: V2) => number, sink: number): THREE.BufferGeometry | null {
  const n = poly.length;
  if (n < 3) return null;
  let area = 0;
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % n];
    area += a.x * b.y - b.x * a.y;
  });
  const pos: number[] = [];
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % n];
    const ha = height(a);
    const hb = height(b);
    if (ha < 0.004 && hb < 0.004) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    // Outward in plan for an anticlockwise polygon is (dy, -dx); flip for clockwise.
    const out = area >= 0 ? { x: dy, y: -dx } : { x: -dy, y: dx };
    const A = [a.x, -sink, a.y];
    const B = [b.x, -sink, b.y];
    const At = [a.x, ha, a.y];
    const Bt = [b.x, hb, b.y];
    // Normal of (A, B, Bt) = (B - A) x (Bt - A); keep the winding that faces outwards.
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const v = [Bt[0] - A[0], Bt[1] - A[1], Bt[2] - A[2]];
    const nx = u[1] * v[2] - u[2] * v[1];
    const nz = u[0] * v[1] - u[1] * v[0];
    const tris = nx * out.x + nz * out.y >= 0 ? [A, B, Bt, A, Bt, At] : [A, Bt, B, A, At, Bt];
    for (const q of tris) pos.push(q[0], q[1], q[2]);
  });
  return pos.length ? triangles(pos) : null;
}

/**
 * White dashed centre line along a road's length (its longest side), 4 m
 * dashes with 5 m gaps, as flat quads in world x/z.
 */
function centreLine(poly: V2[]): THREE.BufferGeometry | null {
  if (poly.length < 3) return null;
  let dir = { x: 1, y: 0 };
  let best = 0;
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > best) {
      best = len;
      dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    }
  });
  const c = polygonCentroid(poly);
  // Where the centre line enters and leaves the road.
  const ts: number[] = [];
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const den = dir.x * ey - dir.y * ex;
    if (Math.abs(den) < 1e-9) return;
    const t = ((a.x - c.x) * ey - (a.y - c.y) * ex) / den;
    const u = ((a.x - c.x) * dir.y - (a.y - c.y) * dir.x) / den;
    if (u >= 0 && u <= 1) ts.push(t);
  });
  if (ts.length < 2) return null;
  const t0 = Math.min(...ts) + 1;
  const t1 = Math.max(...ts) - 1;
  const half = 0.05;
  const n = { x: -dir.y * half, y: dir.x * half };
  const pos: number[] = [];
  for (let t = t0; t < t1; t += 9) {
    const e = Math.min(t + 4, t1);
    const a = { x: c.x + dir.x * t, y: c.y + dir.y * t };
    const b = { x: c.x + dir.x * e, y: c.y + dir.y * e };
    const q = [
      [a.x - n.x, a.y - n.y],
      [b.x - n.x, b.y - n.y],
      [b.x + n.x, b.y + n.y],
      [a.x + n.x, a.y + n.y],
    ];
    // Wound anticlockwise seen from above, so the quads face up.
    for (const k of [0, 2, 1, 0, 3, 2]) pos.push(q[k][0], 0, q[k][1]);
  }
  return pos.length ? triangles(pos) : null;
}

/** A box of length `len` along a ground segment, centred between p and q at height y. */
function along(g: THREE.BufferGeometry, p: V2, q: V2, y: number): THREE.BufferGeometry {
  g.rotateY(-Math.atan2(q.y - p.y, q.x - p.x));
  g.translate((p.x + q.x) / 2, y, (p.y + q.y) / 2);
  return g;
}

type Part = "timber" | "concrete" | "brick" | "coping" | "mortar" | "hedge";

/** Plan point d metres along a→b (length len). */
const at = (a: V2, b: V2, len: number, d: number): V2 => ({ x: a.x + ((b.x - a.x) * d) / len, y: a.y + ((b.y - a.y) * d) / len });

/** Height of a run's top or base at distance d (a level run gives the same at both ends). */
function runAt(s: WallSegment, d: number, key: "top" | "base"): number {
  const t = s.end - s.start > 1e-9 ? (d - s.start) / (s.end - s.start) : 0;
  return key === "top" ? s.top + (s.topEnd - s.top) * t : s.base + (s.baseEnd - s.base) * t;
}

/** The runs of `segs` that lie between d0 and d1, cut to fit. */
function runsBetween(segs: WallSegment[], d0: number, d1: number): WallSegment[] {
  return segs.flatMap((s) => {
    const start = Math.max(s.start, d0);
    const end = Math.min(s.end, d1);
    if (end - start < 1e-4) return [];
    return [{ start, end, base: runAt(s, start, "base"), top: runAt(s, start, "top"), baseEnd: runAt(s, end, "base"), topEnd: runAt(s, end, "top") }];
  });
}

/**
 * A straight block along a→b (plan, length len) from `d0` to `d1` metres along
 * it, `width` across, whose bottom runs from y0 to y0e and top from y1 to y1e
 * (world heights). UVs are in metres, with v following height on the sides and
 * ends so a brick texture's courses stay level along a raked wall.
 */
function slab(a: V2, b: V2, len: number, d0: number, d1: number, width: number, y0: number, y0e: number, y1: number, y1e: number): THREE.BufferGeometry {
  const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const n = { x: -u.y * (width / 2), y: u.x * (width / 2) };
  const P = (d: number, side: number, y: number) => [a.x + u.x * d + n.x * side, y, a.y + u.y * d + n.y * side];
  const mid = P((d0 + d1) / 2, 0, (y0 + y0e + y1 + y1e) / 4);
  const pos: number[] = [];
  const uv: number[] = [];
  // A quad wound to face away from the block's middle, with a uv per corner.
  const quad = (q: number[][], t: number[][]) => {
    const e1 = [q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]];
    const e2 = [q[2][0] - q[0][0], q[2][1] - q[0][1], q[2][2] - q[0][2]];
    const nn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const f = q.reduce((s, v) => [s[0] + v[0] / 4, s[1] + v[1] / 4, s[2] + v[2] / 4], [0, 0, 0]);
    const outward = nn[0] * (f[0] - mid[0]) + nn[1] * (f[1] - mid[1]) + nn[2] * (f[2] - mid[2]) >= 0;
    for (const k of outward ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]) {
      pos.push(...q[k]);
      uv.push(...t[k]);
    }
  };
  const L = d1 - d0;
  for (const side of [-1, 1]) {
    quad([P(d0, side, y0), P(d1, side, y0e), P(d1, side, y1e), P(d0, side, y1)], [[0, y0], [L, y0e], [L, y1e], [0, y1]]); // prettier-ignore
  }
  for (const [ya, yb] of [[y1, y1e], [y0, y0e]]) { // prettier-ignore
    quad([P(d0, -1, ya), P(d1, -1, yb), P(d1, 1, yb), P(d0, 1, ya)], [[0, 0], [L, 0], [L, width], [0, width]]); // prettier-ignore
  }
  for (const [d, ya, yb] of [[d0, y0, y1], [d1, y0e, y1e]]) { // prettier-ignore
    quad([P(d, -1, ya), P(d, 1, ya), P(d, 1, yb), P(d, -1, yb)], [[0, ya], [width, ya], [width, yb], [0, yb]]); // prettier-ignore
  }
  return triangles(pos, uv);
}

/**
 * Close-board fence over the runs of one stretch of boundary a→b: posts every
 * 1.83 m (a 6 ft panel) or less, boards on a concrete gravel board. A stepped
 * fence steps at a post; a raked one steps a little at every post.
 */
function fence(out: Record<Part, THREE.BufferGeometry[]>, a: V2, b: V2, len: number, runs: WallSegment[]) {
  const spansOf = (r: WallSegment) => Math.max(1, Math.ceil((r.end - r.start) / 1.83));
  // Posts first; where two runs meet at a step, one post as tall as the higher run.
  const posts = new Map<string, { d: number; base: number; top: number }>();
  for (const r of runs) {
    const spans = spansOf(r);
    for (let k = 0; k <= spans; k++) {
      const d = r.start + (k * (r.end - r.start)) / spans;
      const key = d.toFixed(3);
      const base = runAt(r, d, "base");
      const top = runAt(r, d, "top");
      const prev = posts.get(key);
      posts.set(key, prev ? { d, base: Math.min(prev.base, base), top: Math.max(prev.top, top) } : { d, base, top });
    }
  }
  for (const { d, base, top } of posts.values()) {
    const h = top - base;
    out.timber.push(along(metricBox(0.1, h + 0.05, 0.1), at(a, b, len, d), at(a, b, len, d + 1e-3), GROUND_Y + base + (h + 0.05) / 2));
  }
  for (const r of runs) {
    const rl = r.end - r.start;
    const spans = spansOf(r);
    const step = rl / spans;
    const level = Math.abs(r.top - r.topEnd) < 1e-6 && Math.abs(r.base - r.baseEnd) < 1e-6;
    if (level) out.concrete.push(along(metricBox(rl, 0.15, 0.05), at(a, b, len, r.start), at(a, b, len, r.end), GROUND_Y + r.base + 0.075));
    for (let k = 0; k < spans; k++) {
      const s0 = r.start + k * step;
      const s1 = s0 + step;
      const base = Math.min(runAt(r, s0, "base"), runAt(r, s1, "base"));
      const top = runAt(r, (s0 + s1) / 2, "top");
      // A raked run steps its gravel board and panels at every post.
      if (!level) out.concrete.push(along(metricBox(step, 0.15, 0.05), at(a, b, len, s0), at(a, b, len, s1), GROUND_Y + base + 0.075));
      const ph = Math.max(0.2, top - base - 0.17);
      out.timber.push(along(metricBox(step - 0.1, ph, 0.025), at(a, b, len, s0), at(a, b, len, s1), GROUND_Y + base + 0.17 + ph / 2));
    }
  }
}

/** Brick size on edge across a one-brick wall: 102.5 mm high, 65 mm along the wall, 10 mm joints. */
const EDGE_BRICK_H = 0.1025;
const EDGE_BRICK_PITCH = 0.075;
/** A brick pier's width. */
const PIER = 0.33;

/** A brick pier with a coping cap centred at plan point c, square to direction `dir`, from `base` up to `top`. */
function pier(out: Record<Part, THREE.BufferGeometry[]>, c: V2, dir: V2, base: number, top: number) {
  const c2 = { x: c.x + dir.x / 1000, y: c.y + dir.y / 1000 };
  const h = top - base;
  out.brick.push(along(metricBox(PIER, h - 0.06, PIER), c, c2, GROUND_Y + base + (h - 0.06) / 2));
  out.coping.push(along(metricBox(0.4, 0.07, 0.4), c, c2, GROUND_Y + top - 0.02));
}

/**
 * One-brick garden wall over the runs of one stretch of boundary a→b (length
 * len), `h` its nominal height. The top is a grey coping, or a course of bricks
 * on edge (slightly proud, vertical joints every 75 mm). Each run is built on
 * its own, so at a step the higher run's end closes the face. Piers about every
 * 3 m when asked.
 */
function brickWall(out: Record<Part, THREE.BufferGeometry[]>, a: V2, b: V2, len: number, runs: WallSegment[], h: number, top: "coping" | "brick" = "coping", withPiers = true) {
  if (!runs.length) return;
  const onEdge = top === "brick" && h > EDGE_BRICK_H + 0.1;
  const capH = onEdge ? EDGE_BRICK_H : 0.06;
  for (const r of runs) {
    const rl = r.end - r.start;
    const p = at(a, b, len, r.start);
    const q = at(a, b, len, r.end);
    const level = Math.abs(r.top - r.topEnd) < 1e-6 && Math.abs(r.base - r.baseEnd) < 1e-6;
    const body = Math.max(0.1, r.top - r.base - capH);
    if (level) out.brick.push(along(metricBox(rl, body, 0.215), p, q, GROUND_Y + r.base + body / 2));
    else out.brick.push(slab(a, b, len, r.start, r.end, 0.215, GROUND_Y + r.base, GROUND_Y + r.baseEnd, GROUND_Y + r.top - capH, GROUND_Y + r.topEnd - capH));
    if (onEdge) {
      // Where a run meets the next at a step, its end brick is flush with the step and hides the bedding.
      const stepAtStart = r !== runs[0];
      const stepAtEnd = r !== runs[runs.length - 1];
      const m0 = r.start + (stepAtStart ? 0.005 : 0);
      const m1 = r.end - (stepAtEnd ? 0.005 : 0);
      if (level) out.mortar.push(along(metricBox(m1 - m0, EDGE_BRICK_H - 0.004, 0.2), at(a, b, len, m0), at(a, b, len, m1), GROUND_Y + r.top - EDGE_BRICK_H / 2));
      else out.mortar.push(slab(a, b, len, m0, m1, 0.2, GROUND_Y + runAt(r, m0, "top") - capH, GROUND_Y + runAt(r, m1, "top") - capH, GROUND_Y + runAt(r, m0, "top") - 0.004, GROUND_Y + runAt(r, m1, "top") - 0.004));
      const n = Math.max(1, Math.round(rl / EDGE_BRICK_PITCH));
      const step = rl / n;
      for (let k = 0; k < n; k++) {
        const d0 = r.start + k * step + (k === 0 && stepAtStart ? 0 : 0.005);
        const d1 = r.start + (k + 1) * step - (k === n - 1 && stepAtEnd ? 0 : 0.005);
        const y = GROUND_Y + runAt(r, (d0 + d1) / 2, "top") - EDGE_BRICK_H / 2;
        out.brick.push(along(metricBox(d1 - d0, EDGE_BRICK_H, 0.23), at(a, b, len, d0), at(a, b, len, d1), y));
      }
    } else if (level) {
      out.coping.push(along(metricBox(rl + 0.04, 0.06, 0.29), p, q, GROUND_Y + r.top - 0.03));
    } else {
      // The coping overhangs each end by 2 cm, carrying on the rake.
      const g = ((r.topEnd - r.top) / rl) * 0.02;
      out.coping.push(slab(a, b, len, r.start - 0.02, r.end + 0.02, 0.29, GROUND_Y + r.top - 0.06 - g, GROUND_Y + r.topEnd - 0.06 + g, GROUND_Y + r.top - g, GROUND_Y + r.topEnd + g));
    }
  }
  if (withPiers && h > 0.6) {
    const d0 = runs[0].start;
    const d1 = runs[runs.length - 1].end;
    const piers = Math.max(1, Math.round((d1 - d0) / 3));
    const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    for (let k = 0; k <= piers; k++) {
      const d = d0 + (k * (d1 - d0)) / piers;
      const w = wallAt(runs, d);
      if (w) pier(out, at(a, b, len, d), dir, w.base, w.top);
    }
  }
}

/**
 * Brick piers at the ends of an opening (boundary edge i), flush with the cut
 * ends of the brick walls beside it, standing on the ground there and as tall
 * as those walls are at their ends.
 */
function openingPiers(out: Record<Part, THREE.BufferGeometry[]>, boundary: V2[], edges: BoundaryEdge[], i: number, surfaces: SiteSurface[]) {
  const n = boundary.length;
  // Wall edge w, cut at its start or at its end.
  const cap = (w: number, atStart: boolean) => {
    const wall = edges[w];
    if (!wall || wall.kind !== "wall" || wall.height <= 0.6) return;
    const a = boundary[w];
    const b = boundary[(w + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < PIER) return;
    // Centre the pier half its width back along the wall, so its face is flush with the cut end.
    const d = atStart ? PIER / 2 : len - PIER / 2;
    const runs = boundaryWallSegments(boundary, wall, w, surfaces);
    const under = [d - PIER / 2, d, d + PIER / 2].flatMap((x) => wallAt(runs, x) ?? []);
    if (!under.length) return;
    const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    pier(out, at(a, b, len, d), dir, Math.min(...under.map((x) => x.base)), Math.max(...under.map((x) => x.top)));
  };
  cap((i - 1 + n) % n, false);
  cap((i + 1) % n, true);
}

/** Hedge as overlapping clipped blocks of slightly varying size, so the top isn't ruler-straight. */
function hedge(out: Record<Part, THREE.BufferGeometry[]>, p: V2, q: V2, h: number) {
  const len = Math.hypot(q.x - p.x, q.y - p.y);
  const n = Math.max(1, Math.round(len / 1.1));
  const at = (d: number) => ({ x: p.x + ((q.x - p.x) * d) / len, y: p.y + ((q.y - p.y) * d) / len });
  for (let k = 0; k < n; k++) {
    // Deterministic wobble so the hedge doesn't change shape between renders.
    const w = Math.sin(k * 12.9898 + p.x * 78.233) * 0.5 + 0.5;
    const hh = h * (0.95 + 0.08 * w);
    const a = at(Math.max(0, (k * len) / n - 0.08));
    const b = at(Math.min(len, ((k + 1) * len) / n + 0.08));
    out.hedge.push(along(metricBox(Math.hypot(b.x - a.x, b.y - a.y), hh, 0.6 + 0.12 * w), a, b, GROUND_Y + hh / 2));
  }
}

const PART_MATERIAL: Record<Part, () => THREE.Material> = {
  timber: () => surfaceMaterial("fence"),
  concrete: () => plainMaterial("#a19e96"),
  brick: () => surfaceMaterial("brick"),
  coping: () => plainMaterial("#bdb9b0"),
  mortar: () => plainMaterial("#b4ac9c"),
  hedge: () => surfaceMaterial("hedge"),
};

/** Fences, walls and hedges along the plot boundary, stopping at buildings and stepping or raking with sloping ground. Merged into one mesh per material. */
function Boundary({ site: { boundary, boundaryEdges, surfaces }, buildings }: { site: Site; buildings: V2[][] }) {
  const parts = useMemo(() => {
    const out: Record<Part, THREE.BufferGeometry[]> = { timber: [], concrete: [], brick: [], coping: [], mortar: [], hedge: [] };
    const edges = edgesOf({ boundary, boundaryEdges });
    boundary.forEach((a, i) => {
      const e = edges[i];
      const b = boundary[(i + 1) % boundary.length];
      if (e?.kind === "open" && e.endFinish === "pier") openingPiers(out, boundary, edges, i, surfaces);
      if (!e || e.kind === "open" || e.height <= 0.05) return;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const segs = e.kind === "hedge" ? [] : boundaryWallSegments(boundary, e, i, surfaces);
      for (const [t0, t1] of clipSegmentOutside(a, b, buildings, 0.12)) {
        if (e.kind === "fence") fence(out, a, b, len, runsBetween(segs, t0 * len, t1 * len));
        else if (e.kind === "wall") brickWall(out, a, b, len, runsBetween(segs, t0 * len, t1 * len), e.height, e.top ?? "coping", e.piers ?? true);
        else hedge(out, at(a, b, 1, t0), at(a, b, 1, t1), e.height);
      }
    });
    return (Object.keys(out) as Part[]).flatMap((k) => {
      if (!out[k].length) return [];
      // Raked runs are unindexed; merging needs all one or the other.
      const mixed = out[k].some((g) => !g.index);
      const list = mixed ? out[k].map((g) => (g.index ? g.toNonIndexed() : g)) : out[k];
      const merged = mergeGeometries(list);
      new Set([...out[k], ...list]).forEach((g) => g.dispose());
      return merged ? [{ part: k, geom: merged }] : [];
    });
  }, [boundary, boundaryEdges, surfaces, buildings]);
  useDisposeAll(useMemo(() => parts.map((p) => p.geom), [parts]));
  return (
    <group>
      {parts.map(({ part, geom }) => (
        <mesh key={part} geometry={geom} material={PART_MATERIAL[part]()} castShadow receiveShadow />
      ))}
    </group>
  );
}

/** Fallback tints for a neighbour with no colour of its own. */
const NEIGHBOUR_WALL = "#f7f7f5";
const NEIGHBOUR_ROOF = "#aca7a2";
const FLAT_ROOF = "#9a9894";
/** Quiet "card model" massing, used unless the neighbours are shown in their own colours. */
const CARD_WALL = "#eef0ee";
const CARD_ROOF = "#cfd3d1";
const CARD_FLAT_ROOF = "#c4c8c6";

/** Neighbours sit in the background: their colours are pulled toward grey and their relief eased. */
const WALL_DESAT = 0.35;
const ROOF_DESAT = 0.15;
const NEIGHBOUR_BUMP = 0.6;

const mixToGrey = (hex: string, amount: number) => {
  const c = new THREE.Color(hex);
  const l = c.r * 0.299 + c.g * 0.587 + c.b * 0.114;
  return "#" + c.lerp(new THREE.Color(l, l, l), amount).getHexString();
};

const neighbourBases = new Map<string, THREE.MeshStandardMaterial>();
/** Cached, softened versions of the house's exterior materials; per-neighbour copies are cloned from these so fading never touches the house. */
function neighbourBase(key: string, make: () => THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  let m = neighbourBases.get(key);
  if (!m) {
    m = make();
    neighbourBases.set(key, m);
  }
  return m;
}
function neighbourWallBase(color: string): THREE.MeshStandardMaterial {
  // Strongly coloured walls read as brick, pale ones as render.
  const hsl = { h: 0, s: 0, l: 0 };
  new THREE.Color(color).getHSL(hsl);
  const finish = hsl.s > 0.25 && hsl.l < 0.7 ? "brick" : "render";
  return neighbourBase(`wall|${finish}|${color}`, () => {
    const m = (getMaterial({ kind: "ext", finish, color: mixToGrey(color, WALL_DESAT) }) as THREE.MeshStandardMaterial).clone();
    m.bumpScale *= NEIGHBOUR_BUMP;
    return m;
  });
}
function neighbourRoofBase(color: string): THREE.MeshStandardMaterial {
  return neighbourBase(`roof|${color}`, () => {
    const tex = tileTextures("plain");
    return new THREE.MeshStandardMaterial({ color: mixToGrey(color, ROOF_DESAT), map: tex.map, bumpMap: tex.bump, bumpScale: 2 * NEIGHBOUR_BUMP, roughness: tex.roughness, side: THREE.DoubleSide });
  });
}
function cardBase(color: string): THREE.MeshStandardMaterial {
  return neighbourBase(`card|${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.92 }));
}
function neighbourFlatBase(): THREE.MeshStandardMaterial {
  return neighbourBase("flat", () => new THREE.MeshStandardMaterial({ color: FLAT_ROOF, map: membraneTexture(), roughness: 0.95 }));
}

function neighbourGeometry(n: Neighbour) {
  const walls = new THREE.ExtrudeGeometry(flatShape(n.polygon), { depth: Math.max(0.5, n.eaves), bevelEnabled: false });
  walls.rotateX(-Math.PI / 2);
  walls.translate(0, GROUND_Y, 0);
  setMetricUvs(walls);
  const b = bbox(n.polygon);
  if (n.roof === "flat" || n.polygon.length < 3) return { walls, slopes: null, gables: null, top: GROUND_Y + n.eaves };
  const axis = !n.ridgeAxis || n.ridgeAxis === "auto" ? (b.w >= b.h ? "x" : "z") : n.ridgeAxis;
  const style: RoofEnd = n.roof;
  // A party wall at the left or right only meets a roof end when the ridge runs left-right.
  const flushStart = axis === "x" && n.partySide === "left";
  const flushEnd = axis === "x" && n.partySide === "right";
  const m = roofGeometry({
    x0: b.x0,
    z0: b.y0,
    x1: b.x1,
    z1: b.y1,
    y: GROUND_Y + n.eaves,
    axis,
    pitchDeg: n.pitchDeg ?? 35,
    // Eaves on the wall tops, as the house's own roof is seated; an attached neighbour shares the house's overhang, so its gutter line carries on from ours.
    overhang: n.overhang ?? 0.35,
    eavesOnWalls: true,
    start: flushStart ? "flush" : style,
    end: flushEnd ? "flush" : style,
    wallT: 0,
  });
  return { walls, slopes: setMetricUvs(triangles(m.slopes)), gables: setMetricUvs(triangles(m.gables)), top: m.ridgeY };
}

/** Give a non-indexed triangle-soup geometry (extrusions and roof triangles are) UVs in world metres. */
function setMetricUvs(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.setAttribute("uv", new THREE.Float32BufferAttribute(metricUvs(g.attributes.position.array), 2));
  return g;
}

/** The ground beyond the plot, 300 m across, with UVs in metres like the other site surfaces' textures expect. Shared, never disposed. */
let farGroundGeo: THREE.PlaneGeometry | undefined;
function farGround(): THREE.PlaneGeometry {
  if (!farGroundGeo) {
    farGroundGeo = new THREE.PlaneGeometry(300, 300);
    const uv = farGroundGeo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 300, uv.getY(i) * 300);
  }
  return farGroundGeo;
}

/** Opacity of see-through neighbours when chosen in the Site panel. */
const GHOST_OPACITY = 0.3;

/**
 * A neighbour's walls and roof. It stops drawing while it stands between the
 * camera and the house, so the side and rear views aren't just a wall: colour
 * writes go off but the meshes keep casting shadows (it is still a building),
 * and a faint outline keeps the mass readable.
 */
function NeighbourMass({ n, ghost, house }: { n: Neighbour; ghost: boolean; house: THREE.Vector3 }) {
  const invalidate = useThree((s) => s.invalidate);
  const geo = useMemo(() => neighbourGeometry(n), [n]);
  useDisposeAll(useMemo(() => [geo.walls, geo.slopes, geo.gables], [geo]));
  const edges = useMemo(() => [geo.walls, geo.slopes].flatMap((g) => (g ? [new THREE.EdgesGeometry(g, 30)] : [])), [geo]);
  useDisposeAll(edges);
  const outline = useMemo(() => new THREE.LineBasicMaterial({ color: "#5d6269", transparent: true, opacity: 0.3, depthWrite: false }), []);
  useEffect(() => () => outline.dispose(), [outline]);
  const outlineRef = useRef<THREE.Group>(null);
  const trueColours = useSiteView((s) => s.trueNeighbourColours);
  const mats = useMemo(() => {
    const make = (base: THREE.MeshStandardMaterial, side?: THREE.Side) => {
      const m = base.clone();
      if (side !== undefined) m.side = side;
      if (ghost) {
        m.transparent = true;
        m.opacity = GHOST_OPACITY;
        m.depthWrite = false;
      }
      return m;
    };
    // Extrude groups: 0 = top and bottom caps (a flat roof), 1 = the walls.
    if (!trueColours) {
      // Quiet "card model": plain pale massing, no textures.
      return [make(cardBase(CARD_FLAT_ROOF)), make(cardBase(CARD_WALL)), make(cardBase(CARD_ROOF), THREE.DoubleSide), make(cardBase(CARD_WALL), THREE.DoubleSide)];
    }
    const wall = neighbourWallBase(n.color ?? NEIGHBOUR_WALL);
    const roof = neighbourRoofBase(n.roofColor ?? NEIGHBOUR_ROOF);
    return [make(neighbourFlatBase()), make(wall), make(roof, THREE.DoubleSide), make(wall, THREE.DoubleSide)];
  }, [n.color, n.roofColor, ghost, trueColours]);
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);

  const box = useMemo(() => {
    const b = bbox(n.polygon);
    return new THREE.Box3(new THREE.Vector3(b.x0 - 0.3, GROUND_Y, b.y0 - 0.3), new THREE.Vector3(b.x1 + 0.3, geo.top, b.y1 + 0.3));
  }, [n.polygon, geo.top]);
  const probe = useMemo(() => ({ ray: new THREE.Ray(), hit: new THREE.Vector3(), faded: false }), []);
  useEffect(() => {
    probe.faded = false;
    if (outlineRef.current) outlineRef.current.visible = false;
  }, [mats, probe]);
  useFrame(({ camera }) => {
    if (ghost) return;
    const { ray, hit } = probe;
    ray.origin.copy(camera.position);
    ray.direction.copy(house).sub(camera.position);
    const dist = ray.direction.length();
    ray.direction.divideScalar(dist || 1);
    const blocks = !box.containsPoint(house) && ray.intersectBox(box, hit) !== null && hit.distanceTo(camera.position) < dist;
    if (blocks === probe.faded) return;
    probe.faded = blocks;
    for (const m of mats) {
      m.colorWrite = !blocks;
      m.depthWrite = !blocks;
    }
    if (outlineRef.current) outlineRef.current.visible = blocks;
    invalidate();
  });

  return (
    <group>
      <mesh geometry={geo.walls} material={[mats[0], mats[1]]} castShadow receiveShadow />
      {geo.slopes && <mesh geometry={geo.slopes} material={mats[2]} castShadow receiveShadow />}
      {geo.gables && <mesh geometry={geo.gables} material={mats[3]} castShadow receiveShadow />}
      <group ref={outlineRef} visible={false}>
        {edges.map((e, i) => (
          <lineSegments key={i} geometry={e} material={outline} />
        ))}
      </group>
    </group>
  );
}
