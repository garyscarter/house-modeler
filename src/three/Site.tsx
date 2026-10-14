import * as THREE from "three";

/** Ground level relative to the ground floor's finished floor (floor 0 sits on a 0.25 m slab). */
export const GROUND_Y = -0.26;

/** Ground, plot, garden surfaces and neighbouring buildings. */
export function SiteScene({ centre, size }: { centre: THREE.Vector3; size: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[centre.x, GROUND_Y, centre.z]} receiveShadow>
      <planeGeometry args={[size * 4, size * 4]} />
      <meshStandardMaterial color="#cfd6cc" />
    </mesh>
  );
}
