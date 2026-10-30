import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RAIL_H, type RailRun } from "../lib/stairwell";
import { getMaterial, type MatSpec } from "./textures";

/** Dark stained timber, like the listing's stair balustrade. */
const TIMBER: MatSpec = { kind: "plain", color: "#4a2e22", roughness: 0.55 };
const SPINDLE_GAP = 0.11;

/** A box from p to q (its local x along the line), w wide and h tall. */
function beam(p: THREE.Vector3, q: THREE.Vector3, w: number, h: number): THREE.BufferGeometry {
  const d = new THREE.Vector3().subVectors(q, p);
  const len = d.length();
  const g = new THREE.BoxGeometry(len, h, w);
  const yaw = -Math.atan2(d.z, d.x);
  const pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, yaw, pitch, "YZX")));
  g.translate((p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2);
  return g;
}

/**
 * A board along a sloping run from a to b (plan x, z and height y), `w` thick and `h` deep measured square to its
 * slope, its top `below` under the line a-b, with plumb ends at a and b.
 */
function stringBoard(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, w: number, h: number, below: number): THREE.BufferGeometry {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const drop = h / Math.cos(Math.atan2(b.y - a.y, len));
  // In the run's own vertical plane: u along the plan line, v up.
  const shape = new THREE.Shape([
    new THREE.Vector2(0, a.y - below),
    new THREE.Vector2(len, b.y - below),
    new THREE.Vector2(len, b.y - below - drop),
    new THREE.Vector2(0, a.y - below - drop),
  ]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false }).translate(0, 0, -w / 2);
  g.rotateY(-Math.atan2(b.z - a.z, b.x - a.x));
  g.translate(a.x, 0, a.z);
  // Indexed like the boxes it is merged with.
  const out = mergeVertices(g);
  g.dispose();
  return out;
}

function post(x: number, z: number, y0: number, y1: number, size: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(size, y1 - y0, size).translate(x, (y0 + y1) / 2, z);
}

/** Handrail, spindles and newel posts for each run, merged into one mesh. */
function balustradeGeometry(runs: RailRun[]): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  for (const r of runs) {
    const at = (t: number) => ({ x: r.a.x + (r.b.x - r.a.x) * t, z: r.a.y + (r.b.y - r.a.y) * t, y: r.ya + (r.yb - r.ya) * t });
    const a = at(0);
    const b = at(1);
    parts.push(beam(new THREE.Vector3(a.x, a.y + RAIL_H, a.z), new THREE.Vector3(b.x, b.y + RAIL_H, b.z), 0.06, 0.05));
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.round(len / SPINDLE_GAP));
    for (let i = 1; i < n; i++) {
      const p = at(i / n);
      parts.push(post(p.x, p.z, p.y, p.y + RAIL_H, 0.032));
    }
    // Newel posts stand on the floor below (on a flight, inside the boxed-in understairs), or hang
    // from the flight's soffit where it has passed over a wall into another room.
    parts.push(post(a.x, a.z, r.fa ?? 0, a.y + RAIL_H + 0.12, 0.09), post(b.x, b.z, r.fb ?? 0, b.y + RAIL_H + 0.12, 0.09));
    // Up a flight, a string board along the open side covers the ends of the treads.
    // Its ends are cut plumb at the newels, so neither pokes past them.
    if (r.yb !== r.ya) parts.push(stringBoard(a, b, 0.035, 0.3, 0.08));
  }
  if (!parts.length) return null;
  const g = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return g;
}

export function Balustrade({ runs }: { runs: RailRun[] }) {
  const geom = useMemo(() => balustradeGeometry(runs), [runs]);
  useEffect(() => () => geom?.dispose(), [geom]);
  return geom ? <mesh geometry={geom} material={getMaterial(TIMBER)} castShadow receiveShadow /> : null;
}
