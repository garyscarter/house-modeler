import { useMemo } from "react";
import * as THREE from "three";
import type { HouseModel } from "../types";
import { exteriorOf, planRoofs } from "../lib/roof";

/** Gable and flat roofs, plus canopy pillars, planned from the floors. */
export function Roof({ model }: { model: HouseModel }) {
  const ext = exteriorOf(model);
  const plan = useMemo(() => planRoofs(model), [model]);
  const mats = useMemo(
    () => ({
      roof: new THREE.MeshStandardMaterial({ color: ext.roofColor, roughness: 0.95 }),
      gableEnd: new THREE.MeshStandardMaterial({ color: ext.wallColor, roughness: 0.9 }),
      flat: new THREE.MeshStandardMaterial({ color: "#4b4b4b", roughness: 1 }),
      pillar: new THREE.MeshStandardMaterial({ color: "#a8553a", roughness: 0.9 }),
    }),
    [ext.roofColor, ext.wallColor],
  );
  const pitch = (ext.pitchDeg * Math.PI) / 180;
  const o = ext.overhang;

  return (
    <group>
      {plan.gables.map((g, i) => {
        const across = g.axis === "x" ? g.z1 - g.z0 : g.x1 - g.x0;
        const along = g.axis === "x" ? g.x1 - g.x0 : g.z1 - g.z0;
        const s = across / 2 + o;
        const h = s * Math.tan(pitch);
        const base = g.y - o * Math.tan(pitch);
        const shape = new THREE.Shape();
        shape.moveTo(-s, 0);
        shape.lineTo(s, 0);
        shape.lineTo(0, h);
        shape.closePath();
        const geom = new THREE.ExtrudeGeometry(shape, { depth: along + 2 * o, bevelEnabled: false });
        const cx = (g.x0 + g.x1) / 2;
        const cz = (g.z0 + g.z1) / 2;
        const L = along + 2 * o;
        return g.axis === "x" ? (
          <mesh key={i} geometry={geom} material={[mats.gableEnd, mats.roof]} position={[cx - L / 2, base, cz]} rotation={[0, Math.PI / 2, 0]} castShadow />
        ) : (
          <mesh key={i} geometry={geom} material={[mats.gableEnd, mats.roof]} position={[cx, base, cz - L / 2]} castShadow />
        );
      })}
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
