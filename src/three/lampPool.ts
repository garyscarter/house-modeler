import { useEffect, type RefObject } from "react";
import { useThree } from "@react-three/fiber";
import { create } from "zustand";
import type * as THREE from "three";
import type { Slots } from "../lib/lights";

/** Lit lamp lights in use and the pool, for the dev hook window.__houseLights (litReady is set by Precompile once the lit shaders are built). */
export const lampStats = { active: 0, pool: 0, point: 0, spot: 0, casters: 0, slots: { point: [], spot: [] } as Slots, litReady: false };

/**
 * Renderers still building the shaders for the lamp pool's other state (Precompile's background pass, or a pool that
 * changed size). The lights stay off until none are, so switching them on never stops the page while the graphics
 * driver compiles; the viewer shows a busy state meanwhile.
 */
export const useLampWarming = create<{ warming: ReadonlySet<object> }>(() => ({ warming: new Set() }));

/** Marks `key` (one Precompile run) as warming or done. */
export function setLampWarming(key: object, on: boolean) {
  useLampWarming.setState((s) => {
    if (s.warming.has(key) === on) return s;
    const warming = new Set(s.warming);
    if (on) warming.add(key);
    else warming.delete(key);
    return { warming };
  });
}

/** Whether lights may come on now: no renderer is still building their shaders. */
export const useLampsReady = () => useLampWarming((s) => s.warming.size === 0);

/** The lamp light pools of each renderer's houses (see LampLights): groups hidden while no lamp is lit, which Precompile shows to compile the lit variant. */
const lampPools = new WeakMap<THREE.WebGLRenderer, Set<THREE.Object3D>>();

/** This renderer's lamp pools. */
export const lampPoolsOf = (gl: THREE.WebGLRenderer): THREE.Object3D[] => [...(lampPools.get(gl) ?? [])];

/** Who to tell when a renderer's pool changes size (a light fitting added or removed): Precompile, to build the other lamp state for the new size. */
const poolListeners = new WeakMap<THREE.WebGLRenderer, Set<() => void>>();

/** Calls `fn` whenever a lamp pool of this renderer changes size; returns the unsubscribe. */
export function onLampPoolChange(gl: THREE.WebGLRenderer, fn: () => void): () => void {
  let set = poolListeners.get(gl);
  if (!set) poolListeners.set(gl, (set = new Set()));
  set.add(fn);
  return () => {
    set.delete(fn);
  };
}

/** Tells the listeners a lamp pool of this renderer has changed size. */
export function lampPoolChanged(gl: THREE.WebGLRenderer) {
  for (const fn of poolListeners.get(gl) ?? []) fn();
}

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
