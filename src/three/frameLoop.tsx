import { useEffect, useLayoutEffect, useRef } from "react";
import { addAfterEffect, useFrame, useThree } from "@react-three/fiber";
import type * as THREE from "three";
import { useStore } from "../store";
import { useSiteView } from "./siteView";

/** Frames to redraw the shadow map for after mounting, while the scene settles. */
const MOUNT_FRAMES = 3;
/** Frames to redraw it for after a change: the frame that shows it, and one more in case React commits late. */
const CHANGE_FRAMES = 2;

/** Changes when the renderer gains or loses geometry, textures or shader programs (an async load landing, say). */
const contentSignature = (gl: THREE.WebGLRenderer) => `${gl.info.memory.geometries}:${gl.info.memory.textures}:${gl.info.programs?.length ?? 0}`;

/**
 * The sun's shadow map costs a second pass over the whole scene, so it is
 * only redrawn when something in the scene may have changed, never for a
 * frame that only moves the camera. The map is marked dirty (and a frame
 * requested) on mount, on any change to the stores the scene is built from
 * (model, site, sun, variant, doors, visibility, quality, site view), and
 * whenever the renderer's geometry, texture or program counts change, which
 * catches photos and other content that arrive asynchronously. Err on the
 * side of redrawing: a stale shadow is a visible bug, a spare redraw is not.
 */
export function ShadowUpdates() {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const dirty = useRef(MOUNT_FRAMES);

  useLayoutEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    dirty.current = Math.max(dirty.current, MOUNT_FRAMES);
    const mark = () => {
      dirty.current = Math.max(dirty.current, CHANGE_FRAMES);
      invalidate();
    };
    let last = contentSignature(gl);
    const stop = [
      useStore.subscribe(mark),
      useSiteView.subscribe(mark),
      // After each frame: did that render upload or drop anything?
      addAfterEffect(() => {
        const sig = contentSignature(gl);
        if (sig === last) return;
        last = sig;
        mark();
      }),
    ];
    invalidate();
    return () => {
      stop.forEach((s) => s());
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl, invalidate]);

  useFrame(() => {
    gl.shadowMap.autoUpdate = false;
    if (dirty.current <= 0) return;
    gl.shadowMap.needsUpdate = true;
    dirty.current--;
    if (dirty.current > 0) invalidate();
  });
  return null;
}

/** Longest wait for shaders to compile before drawing anyway, ms. */
const COMPILE_TIMEOUT = 5000;

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/**
 * Compiles every material in the scene with `compileAsync` (which lets the
 * driver link shaders in parallel, off the main thread where it can) before
 * the first frame, and again when the quality changes, since turning
 * post-processing on or off changes the renderer's tone mapping and so every
 * program. `before` is awaited first, so lazily loaded parts that change the
 * renderer (the post-processing chunk) are in place. The viewer holds its
 * frame loop until `onDone` is called. Anything not ready in time simply
 * compiles on first use, as it would have anyway.
 */
export function Precompile({ token, before, onDone }: { token: string; before?: () => Promise<unknown>; onDone: (token: string) => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const done = useRef(onDone);
  done.current = onDone;
  const prepare = useRef(before);
  prepare.current = before;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await prepare.current?.();
        // Let React commit what just loaded and run its effects.
        await nextFrame();
        await nextFrame();
        if (cancelled) return;
        await Promise.race([gl.compileAsync(scene, camera), new Promise((r) => setTimeout(r, COMPILE_TIMEOUT))]);
      } catch {
        // Compiling ahead is only an optimisation; draw regardless.
      }
      if (!cancelled) done.current(token);
    })();
    return () => {
      cancelled = true;
    };
  }, [gl, scene, camera, token]);
  return null;
}
