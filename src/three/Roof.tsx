import { useEffect, useLayoutEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { HouseModel } from "../types";
import { GUTTER_R, PIPE_R, exteriorOf, planRoofs, type P3 } from "../lib/roof";
import { SOIL_R, roofParts, type RoofParts } from "../lib/roofParts";
import { useStore } from "../store";
import { roofStructure } from "../lib/structure";
import { brickTexture, membraneTexture, tileTextures } from "./roofTextures";

/** BufferGeometry from flat xyz triangle soup (and optional uv pairs), with flat normals. */
export function triangles(pos: number[], uv?: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  if (uv && uv.length) g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** uPVC white for fascias, soffits and rainwater goods. */
const WHITE_TRIM = "#f2f1ec";
/** Light cream of the ceiling under a porch or canopy roof (it reads cream-white in the front photos). */
const CEILING = "#efe8d6";
/** Length of one ridge or hip tile. */
const CAP_LEN = 0.45;
const CAP_R = 0.11;

const Y = new THREE.Vector3(0, 1, 0);
const tmp = { m: new THREE.Matrix4(), x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3(), s: new THREE.Vector3() };

/** Matrix placing a unit cylinder (axis y, height 1, centred) from a to b, its +z side towards `face`, radius r. */
function along(a: P3, b: P3, r: number, face?: THREE.Vector3, rz = r): THREE.Matrix4 {
  const { m, x, y, z, s } = tmp;
  y.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = y.length();
  y.normalize();
  z.copy(face ?? (Math.abs(y.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : Y));
  z.addScaledVector(y, -z.dot(y)).normalize();
  x.crossVectors(y, z);
  m.makeBasis(x, y, z);
  m.scale(s.set(r, len, rz));
  m.setPosition((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return m;
}

/** Merge copies of `unit` placed by each matrix; null when there is nothing to draw. */
function instances(unit: THREE.BufferGeometry, mats: THREE.Matrix4[]): THREE.BufferGeometry | null {
  if (!mats.length) return null;
  const parts = mats.map((m) => unit.clone().applyMatrix4(m));
  const g = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return g;
}

interface RoofGeometry {
  tiles: THREE.BufferGeometry;
  gables: THREE.BufferGeometry;
  trim: THREE.BufferGeometry;
  ceiling: THREE.BufferGeometry;
  membrane: THREE.BufferGeometry;
  edgeTrim: THREE.BufferGeometry;
  flashing: THREE.BufferGeometry;
  brick: THREE.BufferGeometry;
  cement: THREE.BufferGeometry;
  caps: THREE.BufferGeometry | null;
  gutters: THREE.BufferGeometry | null;
  pipes: THREE.BufferGeometry | null;
  soil: THREE.BufferGeometry | null;
  vents: THREE.BufferGeometry | null;
  pots: THREE.BufferGeometry | null;
}

function buildGeometry(p: RoofParts): RoofGeometry {
  // Ridge and hip tiles: half-round, the arc widened by the pitch so its edges sit on the slopes, each tile flared at its socket.
  const byPitch = new Map<number, THREE.Matrix4[]>();
  for (const { line, pitchDeg } of p.caps) {
    const [a, b] = line;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const n = Math.max(1, Math.round(len / CAP_LEN));
    const key = Math.round(pitchDeg);
    const list = byPitch.get(key) ?? [];
    for (let i = 0; i < n; i++) {
      const t0 = Math.max(0, i / n - 0.01);
      const t1 = (i + 1) / n;
      const at = (t: number): P3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      list.push(along(at(t0), at(t1), CAP_R, Y).clone());
    }
    byPitch.set(key, list);
  }
  const capParts: THREE.BufferGeometry[] = [];
  for (const [pitch, mats] of byPitch) {
    const p0 = (pitch * Math.PI) / 180;
    const unit = new THREE.CylinderGeometry(1, 1.08, 1, 20, 1, false, -(Math.PI / 2 + p0), Math.PI + 2 * p0);
    const g = instances(unit, mats);
    if (g) capParts.push(g);
    unit.dispose();
  }
  const caps = capParts.length ? mergeGeometries(capParts) : null;
  capParts.forEach((g) => g.dispose());

  // Half-round gutters with stop ends, open side up.
  const trough = new THREE.CylinderGeometry(1, 1, 1, 10, 1, false, -Math.PI / 2, Math.PI);
  const gutters = instances(
    trough,
    p.gutters.map(([a, b]) => along(a, b, GUTTER_R, new THREE.Vector3(0, -1, 0)).clone()),
  );
  trough.dispose();

  // Downpipes, with a ball at each bend so swan necks read as one pipe.
  const pipe = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
  const ball = new THREE.SphereGeometry(1, 8, 6);
  const pipeMats = p.pipes.map(([a, b]) => along(a, b, PIPE_R).clone());
  const bends = p.pipes.slice(0, -1).map(([, b]) => new THREE.Matrix4().makeScale(PIPE_R, PIPE_R, PIPE_R).setPosition(b[0], b[1], b[2]));
  const pipeG = instances(pipe, pipeMats);
  const ballG = instances(ball, bends);
  const pipes = pipeG && ballG ? mergeGeometries([pipeG, ballG]) : pipeG;
  if (pipeG && ballG) {
    pipeG.dispose();
    ballG.dispose();
  }
  pipe.dispose();
  ball.dispose();

  // Soil and vent stacks, each capped with a pale grey vent terminal: a short wider barrel under a domed top.
  const stack = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
  const soil = instances(
    stack,
    p.soil.map(([a, b]) => along(a, b, SOIL_R).clone()),
  );
  stack.dispose();
  const ventUnit = mergeGeometries([
    new THREE.CylinderGeometry(0.075, 0.075, 0.16, 10).translate(0, 0.08, 0),
    new THREE.SphereGeometry(0.075, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.16, 0),
  ]);
  const vents = instances(
    ventUnit,
    p.vents.map((at) => new THREE.Matrix4().makeTranslation(at[0], at[1], at[2])),
  );
  ventUnit.dispose();

  // Clay chimney pots, slightly tapered, with a rolled rim.
  const potUnit = mergeGeometries([
    new THREE.CylinderGeometry(0.085, 0.11, 0.55, 12).translate(0, 0.275, 0),
    new THREE.CylinderGeometry(0.1, 0.1, 0.05, 12).translate(0, 0.53, 0),
  ]);
  const pots = instances(
    potUnit,
    p.pots.map((at) => new THREE.Matrix4().makeTranslation(at[0], at[1], at[2])),
  );
  potUnit.dispose();

  return {
    tiles: triangles(p.tiles.pos, p.tiles.uv),
    gables: triangles(p.gables),
    trim: triangles(p.trim),
    ceiling: triangles(p.ceiling),
    membrane: triangles(p.membrane.pos, p.membrane.uv),
    edgeTrim: triangles(p.edgeTrim),
    flashing: triangles(p.flashing),
    brick: triangles(p.brick.pos, p.brick.uv),
    cement: triangles(p.cement),
    caps,
    gutters,
    pipes,
    soil,
    vents,
    pots,
  };
}

/** Lighten (>1) or darken (<1) a hex colour. */
function shade(hex: string, f: number): string {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return "#" + c.getHexString();
}

/**
 * Pitched and flat roofs planned from the floors, with fascias, soffits,
 * bargeboards, gutters and downpipes, ridge and hip tiles, lean-to porch
 * roofs, canopy pillars and chimneys.
 */
export function Roof({ model }: { model: HouseModel }) {
  const ext = exteriorOf(model);
  const low = useStore((s) => s.settings.quality === "low");
  // Keyed on what planning reads, so recolouring a room or moving a fixture leaves the roof alone.
  const sig = roofStructure(model);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plan = useMemo(() => planRoofs(model), [sig]);
  const geo = useMemo(
    () => buildGeometry(roofParts(plan, { gutters: ext.gutters, skirt: ext.flatRoofSkirt, downpipes: ext.downpipes, soilPipes: ext.soilPipes })),
    [plan, ext.gutters, ext.flatRoofSkirt, ext.downpipes, ext.soilPipes],
  );
  useEffect(() => () => Object.values(geo).forEach((g) => g?.dispose()), [geo]);

  const fascia = ext.fascia === "trim" ? ext.trimColor : WHITE_TRIM;
  // Made once per tile style and quality; a colour change only sets .color below, so no material or program is recreated.
  const mats = useMemo(() => {
    const tex = tileTextures(ext.tileStyle);
    return {
      tiles: new THREE.MeshStandardMaterial({
        map: tex.map,
        bumpMap: low ? null : tex.bump,
        bumpScale: 2,
        roughness: tex.roughness,
        side: THREE.DoubleSide,
      }),
      caps: new THREE.MeshStandardMaterial({ roughness: 0.8 }),
      gable: new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide }),
      trim: new THREE.MeshStandardMaterial({ roughness: 0.55, side: THREE.DoubleSide }),
      ceiling: new THREE.MeshStandardMaterial({ color: CEILING, roughness: 0.9, side: THREE.DoubleSide }),
      rainwater: new THREE.MeshStandardMaterial({ roughness: 0.4, side: THREE.DoubleSide }),
      membrane: new THREE.MeshStandardMaterial({ color: "#55585d", map: membraneTexture(), roughness: 0.95 }),
      edgeTrim: new THREE.MeshStandardMaterial({ color: "#2f3236", roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide }),
      flashing: new THREE.MeshStandardMaterial({ color: "#8b9096", roughness: 0.7, metalness: 0.1, side: THREE.DoubleSide }),
      brick: new THREE.MeshStandardMaterial({ map: brickTexture(), roughness: 0.9 }),
      cement: new THREE.MeshStandardMaterial({ color: "#a9a59c", roughness: 1 }),
      pot: new THREE.MeshStandardMaterial({ color: "#b5603f", roughness: 0.85 }),
      vent: new THREE.MeshStandardMaterial({ color: "#c9cbcc", roughness: 0.6 }),
    };
  }, [ext.tileStyle, low]);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    mats.tiles.color.set(ext.roofColor);
    mats.caps.color.set(shade(ext.roofColor, 0.9));
    mats.gable.color.set(ext.wallColor);
    mats.trim.color.set(fascia);
    mats.rainwater.color.set(fascia);
    invalidate();
  }, [mats, ext.roofColor, ext.wallColor, fascia, invalidate]);

  const solid = (g: THREE.BufferGeometry | null, m: THREE.Material, key: string, shadow = true) =>
    g && <mesh key={key} geometry={g} material={m} castShadow={shadow} receiveShadow />;
  return (
    <group>
      {solid(geo.tiles, mats.tiles, "tiles")}
      {solid(geo.caps, mats.caps, "caps")}
      {solid(geo.gables, mats.gable, "gables")}
      {solid(geo.trim, mats.trim, "trim")}
      {solid(geo.ceiling, mats.ceiling, "ceiling")}
      {solid(geo.gutters, mats.rainwater, "gutters")}
      {solid(geo.pipes, mats.rainwater, "pipes")}
      {solid(geo.soil, mats.rainwater, "soil")}
      {solid(geo.vents, mats.vent, "vents")}
      {solid(geo.membrane, mats.membrane, "membrane")}
      {solid(geo.edgeTrim, mats.edgeTrim, "edge")}
      {solid(geo.flashing, mats.flashing, "flashing", false)}
      {solid(geo.brick, mats.brick, "brick")}
      {solid(geo.cement, mats.cement, "cement")}
      {solid(geo.pots, mats.pot, "pots")}
    </group>
  );
}
