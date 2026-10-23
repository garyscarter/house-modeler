import * as THREE from "three";

/** BufferGeometry from flat xyz triangle soup (and optional uv pairs), with flat normals. */
export function triangles(pos: number[], uv?: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  if (uv && uv.length) g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
