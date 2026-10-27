import { useEffect, type RefObject } from "react";
import { useThree } from "@react-three/fiber";
import type * as THREE from "three";
import type { Slots } from "../lib/lights";

/** Lit lamp lights in use and the pool, for the dev hook window.__houseLights (litReady is set by Precompile once the lit shaders are built). */
export const lampStats = { active: 0, pool: 0, point: 0, spot: 0, casters: 0, slots: { point: [], spot: [] } as Slots, litReady: false };

/** The lamp light pools of each renderer's houses (see LampLights): groups hidden while no lamp is lit, which Precompile shows to compile the lit variant. */
const lampPools = new WeakMap<THREE.WebGLRenderer, Set<THREE.Object3D>>();

/** This renderer's lamp pools. */
export const lampPoolsOf = (gl: THREE.WebGLRenderer): THREE.Object3D[] => [...(lampPools.get(gl) ?? [])];

/** Registers the object in `ref` as a lamp light pool for precompiling while the calling component is mounted. */
export function useLampPool(ref: RefObject<THREE.Object3D | null>) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const o = ref.current;
    if (!o) return;
    let set = lampPools.get(gl);
    if (!set) lampPools.set(gl, (set = new Set()));
    set.add(o);
    return () => {
      set.delete(o);
    };
  }, [gl, ref]);
}
