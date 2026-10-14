import * as THREE from "three";

/**
 * Scene lighting: sky/ground fill plus a shadow-casting key light. The sun
 * study drives the key light from the site's real sun position.
 */
export function Lighting({ centre, size, walking }: { centre: THREE.Vector3; size: number; walking: boolean }) {
  return (
    <>
      <hemisphereLight args={["#ffffff", "#b0b8c8", 0.7]} />
      <ambientLight intensity={walking ? 1.8 : 0.3} />
      <directionalLight
        position={[centre.x + 10, 20, centre.z + 8]}
        intensity={1.3}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-size}
        shadow-camera-right={size}
        shadow-camera-top={size}
        shadow-camera-bottom={-size}
      />
    </>
  );
}
