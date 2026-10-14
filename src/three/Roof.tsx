import { useMemo } from "react";
import * as THREE from "three";
import type { HouseModel } from "../types";
import { exteriorOf, planRoofs, roofGeometry, type RoofMesh } from "../lib/roof";

/** BufferGeometry from flat xyz triangle soup, with flat normals. */
export function triangles(pos: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Pitched (hipped or gabled) and flat roofs, plus canopy pillars, planned from the floors. */
export function Roof({ model }: { model: HouseModel }) {
  const ext = exteriorOf(model);
  const plan = useMemo(() => planRoofs(model), [model]);
  const meshes = useMemo(
    () =>
      plan.blocks.map((b) => {
        const m: RoofMesh = roofGeometry(b);
        return { slopes: triangles(m.slopes), gables: triangles(m.gables) };
      }),
    [plan],
  );
  const mats = useMemo(
    () => ({
      roof: new THREE.MeshStandardMaterial({ color: ext.roofColor, roughness: 0.95, side: THREE.DoubleSide }),
      gableEnd: new THREE.MeshStandardMaterial({ color: ext.wallColor, roughness: 0.9, side: THREE.DoubleSide }),
      flat: new THREE.MeshStandardMaterial({ color: "#4b4b4b", roughness: 1 }),
      pillar: new THREE.MeshStandardMaterial({ color: "#a8553a", roughness: 0.9 }),
    }),
    [ext.roofColor, ext.wallColor],
  );

  return (
    <group>
      {meshes.map((m, i) => (
        <group key={i}>
          <mesh geometry={m.slopes} material={mats.roof} castShadow receiveShadow />
          <mesh geometry={m.gables} material={mats.gableEnd} castShadow receiveShadow />
        </group>
      ))}
      {plan.flats.map((f, i) => (
        <mesh key={"f" + i} material={mats.flat} position={[(f.x0 + f.x1) / 2, f.y + 0.12, (f.z0 + f.z1) / 2]} castShadow receiveShadow>
          <boxGeometry args={[f.x1 - f.x0 + 0.1, 0.24, f.z1 - f.z0 + 0.1]} />
        </mesh>
      ))}
      {plan.pillars.map((p, i) => (
        <mesh key={"p" + i} material={mats.pillar} position={[p.x, (p.y0 + p.y1) / 2, p.z]} castShadow>
          <boxGeometry args={[0.3, p.y1 - p.y0, 0.3]} />
        </mesh>
      ))}
    </group>
  );
}
