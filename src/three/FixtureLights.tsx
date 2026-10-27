import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { POOL, assignSlots, coneGain, type LampLight, type PoolSizes, type Slots } from "../lib/lights";
import { useStore } from "../store";
import { useLampPool } from "./frameLoop";

/** Point light intensity per candela: the scene is lit in the renderer's units with the sun at a few units, so a real bulb's candela is scaled to sit with it. */
export const LAMP_SCALE = 0.06;
/**
 * Spot light intensity per candela of the bulb's even-sphere candela (lights.ts), before the cone gain (see
 * spotIntensity). Tuned so a 450 lm downlight from a 2.25 m ceiling makes a soft pool about 1.5 m across.
 */
export const SPOT_SCALE = 0.03;
/** Re-pick the nearest lamps once the camera has moved this far (metres). */
const REPICK_M = 1;
/** Where an empty slot's light waits: far below the house, dark and with a tiny reach, so it lights and shadows nothing. */
const PARK: [number, number, number] = [0, -500, 0];

/**
 * A spot light's intensity: brighter than a bare bulb as its output is gathered into the cone, by the square root of
 * the flux-keeping gain (coneGain), so a tight spot bar does not burn out next to a wide pendant once tone-mapped.
 */
export const spotIntensity = (l: Pick<LampLight, "candela" | "spot">): number => l.candela * SPOT_SCALE * Math.sqrt(coneGain(l.spot?.angle));

/** Lit lamp lights in use and the pool, for the dev hook window.__houseLights (litReady is set by Precompile once the lit shaders are built). */
export const lampStats = { active: 0, pool: 0, point: 0, spot: 0, casters: 0, slots: { point: [], spot: [] } as Slots, litReady: false };

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/**
 * The lit lamps of every shown floor as a fixed pool of lights: point lights, and spot lights aimed straight down for
 * fittings with a cone, filled with the lamps nearest to the camera (the rest only glow; see POOL in lib/lights.ts).
 * Three bakes the number of lights into every lit material's shader, so the pool never changes size: an empty slot
 * stays mounted, parked dark, and the whole pool is hidden while no lamp is lit. Precompile builds the lit shaders ahead
 * of the first switch-on. The nearest `casters` spot slots cast shadows; point lights never do. A lamp that stays picked
 * keeps its slot (assignSlots). The pick runs when the lamps change or the camera has moved a metre, so orbiting costs
 * no React renders.
 */
export function LampLights({ lamps }: { lamps: LampLight[] }) {
  const quality = useStore((s) => s.settings.quality);
  const sizes = POOL[quality];
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const group = useRef<THREE.Group>(null);
  useLampPool(group);
  const [slots, setSlots] = useState<Slots>(() => assignSlots(null, [], [0, 0, 0], sizes));
  const last = useRef<{ eye: THREE.Vector3; lamps: LampLight[] | null; sizes: PoolSizes }>({ eye: new THREE.Vector3(Infinity, 0, 0), lamps: null, sizes });
  const repick = () => {
    const l = last.current;
    const eye = camera.position;
    if (l.lamps === lamps && l.sizes === sizes && l.eye.distanceTo(eye) < REPICK_M) return;
    l.eye.copy(eye);
    l.lamps = lamps;
    l.sizes = sizes;
    setSlots((prev) => assignSlots(prev, lamps, [eye.x, eye.y, eye.z], sizes));
  };
  useEffect(repick);
  useFrame(repick);
  useEffect(() => invalidate(), [slots, invalidate]);
  const byId = useMemo(() => new Map(lamps.map((l) => [l.id, l])), [lamps]);
  // For the dev hook window.__houseLights: lights in use and the pool.
  useEffect(() => {
    lampStats.active = slots.point.filter(Boolean).length + slots.spot.filter(Boolean).length;
    lampStats.pool = sizes.point + sizes.spot;
    lampStats.point = sizes.point;
    lampStats.spot = sizes.spot;
    lampStats.casters = sizes.casters;
    lampStats.slots = slots;
  }, [slots, sizes]);
  const at = (id: string | null | undefined) => (id ? byId.get(id) : undefined);
  return (
    <group ref={group} visible={lamps.length > 0}>
      {range(sizes.point).map((i) => (
        <PoolPoint key={"p" + i} light={at(slots.point[i])} />
      ))}
      {range(sizes.spot).map((i) => (
        <PoolSpot key={"s" + i} light={at(slots.spot[i])} cast={i < sizes.casters} />
      ))}
    </group>
  );
}

/** One point light slot: the lamp's light, or parked dark when the slot is empty. */
function PoolPoint({ light: l }: { light?: LampLight }) {
  return <pointLight position={l ? l.pos : PARK} color={l ? l.color : "#ffffff"} intensity={l ? l.candela * LAMP_SCALE : 0} decay={2} distance={l ? l.reach : 0.2} castShadow={false} />;
}

/**
 * One spot light slot, aimed straight down from the bulb; its target sits a metre below (outside the scene, so placed
 * by hand). `cast` is fixed for the slot, as it is part of the shader's light count; an empty caster slot is parked
 * with a reach of 0.2 m, so its shadow camera (far = the light's distance) sees nothing.
 */
function PoolSpot({ light: l, cast }: { light?: LampLight; cast: boolean }) {
  const ref = useRef<THREE.SpotLight>(null);
  const pos = l ? l.pos : PARK;
  useLayoutEffect(() => {
    const s = ref.current;
    if (!s) return;
    s.target.position.set(pos[0], pos[1] - 1, pos[2]);
    s.target.updateMatrixWorld();
  }, [pos]);
  // Shadow maps are redrawn only on demand (see ShadowUpdates): a spot that starts casting, or moves, needs one drawn.
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const id = l?.id;
  // A layout effect, so the next frame (the first that samples the new map) draws it first.
  useLayoutEffect(() => {
    if (!cast) return;
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [cast, id, pos, gl, invalidate]);
  return (
    <spotLight
      ref={ref}
      position={pos}
      color={l ? l.color : "#ffffff"}
      intensity={l ? spotIntensity(l) : 0}
      angle={l?.spot ? l.spot.angle : 0.1}
      penumbra={l?.spot ? l.spot.penumbra : 0}
      decay={2}
      distance={l ? l.reach : 0.2}
      castShadow={cast}
      shadow-mapSize={[512, 512]}
      shadow-bias={-0.0005}
      shadow-camera-near={0.1}
    />
  );
}
