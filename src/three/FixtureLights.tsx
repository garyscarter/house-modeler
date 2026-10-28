import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { assignSlots, coneGain, focusPoint, type LampLight, type PoolSizes, type Slots } from "../lib/lights";
import { lampPoolChanged, lampStats, useLampPool } from "./lampPool";

/** Point light intensity per candela: the scene is lit in the renderer's units with the sun at a few units, so a real bulb's candela is scaled to sit with it. */
export const LAMP_SCALE = 0.06;
/**
 * Spot light intensity per candela of the bulb's even-sphere candela (lights.ts), before the cone gain (see
 * spotIntensity). Tuned so a 450 lm downlight from a 2.25 m ceiling makes a soft pool about 1.5 m across.
 */
export const SPOT_SCALE = 0.03;
/** Re-pick the nearest lamps once the view's focus has moved this far (metres). */
const REPICK_M = 1;
/** A pan or orbit re-picks the lights only once the camera has been still this long, so no shadow map redraws mid-motion. */
const SETTLE_MS = 180;
const _dir = new THREE.Vector3();
const _focus = new THREE.Vector3();
/** Where an empty slot's light waits: far below the house, dark and with a tiny reach, so it lights and shadows nothing. */
const PARK: [number, number, number] = [0, -500, 0];

/**
 * A spot light's intensity: brighter than a bare bulb as its output is gathered into the cone, by the square root of
 * the flux-keeping gain (coneGain), so a tight spot bar does not burn out next to a wide pendant once tone-mapped.
 */
export const spotIntensity = (l: Pick<LampLight, "candela" | "spot">): number => l.candela * SPOT_SCALE * Math.sqrt(coneGain(l.spot?.angle));

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/**
 * The lit lamps of every shown floor as a pool of lights of a fixed size `sizes` (poolFor in lib/lights.ts: one slot
 * per lamp bulb in the house, up to POOL's cap): point lights, and spot lights aimed straight down for fittings with a
 * cone, filled with the lamps nearest to where the view is looking (focusPoint; the rest only glow). Three bakes the number of lights into every
 * lit material's shader, so the pool keeps its size while lights switch: an empty slot stays mounted, parked dark, and
 * the whole pool is hidden while no lamp is lit. Precompile builds the lit shaders ahead of the first switch-on, and
 * again when the size changes (a light fitting added or removed). The nearest `casters` spot slots cast shadows; point
 * lights never do. A lamp that stays picked keeps its slot (assignSlots). The pick runs when the lamps change or the
 * focus has moved a metre, so orbiting costs no React renders.
 */
export function LampLights({ lamps, sizes }: { lamps: LampLight[]; sizes: PoolSizes }) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const group = useRef<THREE.Group>(null);
  useLampPool(group);
  // The first run is the mount, which Precompile's own pass covers.
  const sized = useRef(false);
  useEffect(() => {
    if (sized.current) lampPoolChanged(gl);
    sized.current = true;
  }, [gl, sizes]);
  const [slots, setSlots] = useState<Slots>(() => assignSlots(null, [], [0, 0, 0], sizes));
  const last = useRef<{ focus: THREE.Vector3; lamps: LampLight[] | null; sizes: PoolSizes }>({ focus: new THREE.Vector3(Infinity, 0, 0), lamps: null, sizes });
  // Where the camera last looked and when it last moved: a pick caused by motion waits for the motion to stop.
  const still = useRef({ at: new THREE.Vector3(Infinity, 0, 0), t: 0, timer: 0 });
  const repick = () => {
    const l = last.current;
    const eye = camera.position;
    const d = camera.getWorldDirection(_dir);
    const focus = focusPoint([eye.x, eye.y, eye.z], [d.x, d.y, d.z]);
    _focus.set(focus[0], focus[1], focus[2]);
    const changed = l.lamps !== lamps || l.sizes !== sizes;
    if (!changed && l.focus.distanceTo(_focus) < REPICK_M) return;
    if (!changed) {
      // Camera motion: each shadow-casting spot that changes slot redraws its map, so wait until the view settles,
      // and ask for a frame then (frames are on demand, so nothing would otherwise run this again).
      const s = still.current;
      const now = performance.now();
      if (s.at.distanceToSquared(_focus) > 1e-6) {
        s.at.copy(_focus);
        s.t = now;
      }
      if (now - s.t < SETTLE_MS) {
        window.clearTimeout(s.timer);
        s.timer = window.setTimeout(() => invalidate(), SETTLE_MS);
        return;
      }
    }
    l.focus.copy(_focus);
    l.lamps = lamps;
    l.sizes = sizes;
    setSlots((prev) => assignSlots(prev, lamps, focus, sizes));
  };
  useEffect(repick);
  useFrame(repick);
  useEffect(() => () => window.clearTimeout(still.current.timer), []);
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
    const s = ref.current;
    if (!cast || !s) return;
    // Only this map: the other casters (the sun's 4096 map above all) keep theirs until the scene changes.
    s.shadow.autoUpdate = false;
    s.shadow.needsUpdate = true;
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
