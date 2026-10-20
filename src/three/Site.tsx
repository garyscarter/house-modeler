import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { HouseModel, Neighbour, Site, SiteSurface, SurfaceKind } from "../types";
import { useStore } from "../store";
import { useViewedSite } from "./viewedVariant";
import { roofGeometry, type RoofEnd } from "../lib/roof";
import { bbox, polygonCentroid, roomWorldPolygon, type V2 } from "../lib/geometry";
import { clipSegmentOutside, edgesOf } from "../lib/site";
import { effectiveSlope, slopeHeight } from "../lib/surfaceSlope";
import { surfaceLook } from "../lib/surfaceFinish";
import { triangles } from "./Roof";
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
    materials.set(key, m);
  }
  return m;
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

/** Close-board fence: posts every 1.83 m (a 6 ft panel), boards on a concrete gravel board. */
function fence(out: Record<Part, THREE.BufferGeometry[]>, p: V2, q: V2, h: number) {
  const len = Math.hypot(q.x - p.x, q.y - p.y);
  const spans = Math.max(1, Math.ceil(len / 1.83));
  const step = len / spans;
  const at = (d: number) => ({ x: p.x + ((q.x - p.x) * d) / len, y: p.y + ((q.y - p.y) * d) / len });
  for (let k = 0; k <= spans; k++) {
    const c = at(k * step);
    out.timber.push(along(metricBox(0.1, h + 0.05, 0.1), c, at(k * step + 1e-3), GROUND_Y + (h + 0.05) / 2));
  }
  out.concrete.push(along(metricBox(len, 0.15, 0.05), p, q, GROUND_Y + 0.075));
  const ph = Math.max(0.2, h - 0.17);
  for (let k = 0; k < spans; k++) {
    out.timber.push(along(metricBox(step - 0.1, ph, 0.025), at(k * step), at((k + 1) * step), GROUND_Y + 0.17 + ph / 2));
  }
}

/** Brick size on edge across a one-brick wall: 102.5 mm high, 65 mm along the wall, 10 mm joints. */
const EDGE_BRICK_H = 0.1025;
const EDGE_BRICK_PITCH = 0.075;

/**
 * One-brick garden wall. The top is a grey coping, or a course of bricks on edge
 * (slightly proud, vertical joints every 75 mm). Piers about every 3 m when asked.
 */
function brickWall(out: Record<Part, THREE.BufferGeometry[]>, p: V2, q: V2, h: number, top: "coping" | "brick" = "coping", withPiers = true) {
  const len = Math.hypot(q.x - p.x, q.y - p.y);
  const onEdge = top === "brick" && h > EDGE_BRICK_H + 0.1;
  const capH = onEdge ? EDGE_BRICK_H : 0.06;
  const body = Math.max(0.1, h - capH);
  out.brick.push(along(metricBox(len, body, 0.215), p, q, GROUND_Y + body / 2));
  if (onEdge) {
    const n = Math.max(1, Math.round(len / EDGE_BRICK_PITCH));
    const step = len / n;
    const at = (d: number) => ({ x: p.x + ((q.x - p.x) * d) / len, y: p.y + ((q.y - p.y) * d) / len });
    const y = GROUND_Y + body + EDGE_BRICK_H / 2;
    out.mortar.push(along(metricBox(len, EDGE_BRICK_H - 0.004, 0.2), p, q, y));
    for (let k = 0; k < n; k++) {
      const a = at(k * step + 0.005);
      const b = at((k + 1) * step - 0.005);
      out.brick.push(along(metricBox(Math.hypot(b.x - a.x, b.y - a.y), EDGE_BRICK_H, 0.23), a, b, y));
    }
  } else {
    out.coping.push(along(metricBox(len + 0.04, 0.06, 0.29), p, q, GROUND_Y + h - 0.03));
  }
  if (withPiers && h > 0.6) {
    const piers = Math.max(1, Math.round(len / 3));
    for (let k = 0; k <= piers; k++) {
      const d = (k * len) / piers;
      const c = { x: p.x + ((q.x - p.x) * d) / len, y: p.y + ((q.y - p.y) * d) / len };
      const c2 = { x: c.x + (q.x - p.x) / len / 1000, y: c.y + (q.y - p.y) / len / 1000 };
      out.brick.push(along(metricBox(0.33, h - 0.06, 0.33), c, c2, GROUND_Y + (h - 0.06) / 2));
      out.coping.push(along(metricBox(0.4, 0.07, 0.4), c, c2, GROUND_Y + h - 0.02));
    }
  }
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

/** Fences, walls and hedges along the plot boundary, stopping at buildings. Merged into one mesh per material. */
function Boundary({ site: { boundary, boundaryEdges }, buildings }: { site: Site; buildings: V2[][] }) {
  const parts = useMemo(() => {
    const out: Record<Part, THREE.BufferGeometry[]> = { timber: [], concrete: [], brick: [], coping: [], mortar: [], hedge: [] };
    const edges = edgesOf({ boundary, boundaryEdges });
    boundary.forEach((a, i) => {
      const e = edges[i];
      const b = boundary[(i + 1) % boundary.length];
      if (!e || e.kind === "open" || e.height <= 0.05) return;
      for (const [t0, t1] of clipSegmentOutside(a, b, buildings, 0.12)) {
        const p = { x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0 };
        const q = { x: a.x + (b.x - a.x) * t1, y: a.y + (b.y - a.y) * t1 };
        if (e.kind === "fence") fence(out, p, q, e.height);
        else if (e.kind === "wall") brickWall(out, p, q, e.height, e.top ?? "coping", e.piers ?? true);
        else hedge(out, p, q, e.height);
      }
    });
    return (Object.keys(out) as Part[]).flatMap((k) => {
      if (!out[k].length) return [];
      const merged = mergeGeometries(out[k]);
      out[k].forEach((g) => g.dispose());
      return merged ? [{ part: k, geom: merged }] : [];
    });
  }, [boundary, boundaryEdges, buildings]);
  useDisposeAll(useMemo(() => parts.map((p) => p.geom), [parts]));
  return (
    <group>
      {parts.map(({ part, geom }) => (
        <mesh key={part} geometry={geom} material={PART_MATERIAL[part]()} castShadow receiveShadow />
      ))}
    </group>
  );
}

/** Light neutral massing for neighbours, so our house stands out. */
const NEIGHBOUR_WALL = "#f7f7f5";
const NEIGHBOUR_ROOF = "#aca7a2";
const FLAT_ROOF = "#9a9894";

function neighbourGeometry(n: Neighbour) {
  const walls = new THREE.ExtrudeGeometry(flatShape(n.polygon), { depth: Math.max(0.5, n.eaves), bevelEnabled: false });
  walls.rotateX(-Math.PI / 2);
  walls.translate(0, GROUND_Y, 0);
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
    overhang: 0.25,
    start: flushStart ? "flush" : style,
    end: flushEnd ? "flush" : style,
    wallT: 0,
  });
  return { walls, slopes: triangles(m.slopes), gables: triangles(m.gables), top: m.ridgeY };
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
/** Opacity of a neighbour that fades on its own in front of the camera: faint, so it doesn't read as haze over the garden. */
const FADED_OPACITY = 0.08;

/**
 * A neighbour's walls and roof. It turns see-through on its own while it
 * stands between the camera and the house, so the side and rear views
 * aren't just a wall; its shadow stays.
 */
function NeighbourMass({ n, ghost, house }: { n: Neighbour; ghost: boolean; house: THREE.Vector3 }) {
  const geo = useMemo(() => neighbourGeometry(n), [n]);
  useDisposeAll(useMemo(() => [geo.walls, geo.slopes, geo.gables], [geo]));
  const mats = useMemo(() => {
    const make = (color: string, side: THREE.Side = THREE.FrontSide) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.92, side, transparent: ghost, opacity: ghost ? GHOST_OPACITY : 1, depthWrite: !ghost });
    // Extrude groups: 0 = top and bottom caps (a flat roof), 1 = the walls.
    return [make(FLAT_ROOF), make(n.color ?? NEIGHBOUR_WALL), make(n.roofColor ?? NEIGHBOUR_ROOF, THREE.DoubleSide), make(n.color ?? NEIGHBOUR_WALL, THREE.DoubleSide)];
  }, [n.color, n.roofColor, ghost]);
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);

  const box = useMemo(() => {
    const b = bbox(n.polygon);
    return new THREE.Box3(new THREE.Vector3(b.x0 - 0.3, GROUND_Y, b.y0 - 0.3), new THREE.Vector3(b.x1 + 0.3, geo.top, b.y1 + 0.3));
  }, [n.polygon, geo.top]);
  const probe = useMemo(() => ({ ray: new THREE.Ray(), hit: new THREE.Vector3(), faded: false }), []);
  useEffect(() => {
    probe.faded = false;
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
      m.transparent = blocks;
      m.opacity = blocks ? FADED_OPACITY : 1;
      m.depthWrite = !blocks;
      m.needsUpdate = true;
    }
  });

  return (
    <group>
      <mesh geometry={geo.walls} material={[mats[0], mats[1]]} castShadow receiveShadow />
      {geo.slopes && <mesh geometry={geo.slopes} material={mats[2]} castShadow receiveShadow />}
      {geo.gables && <mesh geometry={geo.gables} material={mats[3]} castShadow receiveShadow />}
    </group>
  );
}
