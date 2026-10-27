import { useEffect, useLayoutEffect, useRef } from "react";
import { addAfterEffect, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "../store";
import { useSiteView } from "./siteView";
import { trackScene } from "./textures";
import { lampPoolsOf, lampStats } from "./lampPool";

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
 * requested) on mount, in the commit of any change to what the scene is built
 * from (`deps` from the viewer, plus site, sun, variant and site view), and
 * whenever the renderer's geometry, texture or program counts change, which
 * catches photos and other content that arrive asynchronously. Err on the
 * side of redrawing: a stale shadow is a visible bug, a spare redraw is not.
 */
export function ShadowUpdates({ deps }: { deps: unknown[] }) {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const dirty = useRef(MOUNT_FRAMES);
  const mark = useRef(() => {});
  mark.current = () => {
    dirty.current = Math.max(dirty.current, CHANGE_FRAMES);
    invalidate();
  };
  const sun = useStore((s) => s.sun);
  const sites = useStore((s) => s.sites);
  const showSite = useStore((s) => s.showSite);
  const activeVariant = useStore((s) => s.activeVariant);
  const siteView = useSiteView((s) => s);

  useLayoutEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    dirty.current = Math.max(dirty.current, MOUNT_FRAMES);
    let last = contentSignature(gl);
    // After each frame: did that render upload or drop anything? The after-effect runs once R3F
    // has worked out whether the loop continues, so a direct invalidate would be lost on a burst's
    // last frame (frames stuck at 1); a microtask lets the loop settle first.
    const stop = addAfterEffect(() => {
      const sig = contentSignature(gl);
      if (sig === last) return;
      last = sig;
      queueMicrotask(() => mark.current());
    });
    invalidate();
    return () => {
      stop();
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl, invalidate]);

  // Runs in the same commit as the scene change, so the shadow pass sees the new geometry.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => mark.current(), [...deps, sun, sites, showSite, activeVariant, siteView]);

  useFrame(() => {
    gl.shadowMap.autoUpdate = false;
    if (dirty.current <= 0) return;
    gl.shadowMap.needsUpdate = true;
    dirty.current--;
    if (dirty.current > 0) invalidate();
  });
  return null;
}

/** Redraws after every React commit. R3F's own invalidate skips a commit when a burst's last frame left the loop with frames stuck at 1, so ask again from a microtask. */
export function FrameOnCommit() {
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    queueMicrotask(() => invalidate());
  });
  return null;
}

/** Tells the material caches which scene is on screen, so they never dispose what it still draws. */
export function TrackScene() {
  const scene = useThree((s) => s.scene);
  useEffect(() => trackScene(scene), [scene]);
  return null;
}

/**
 * Objects drawn only in some states (the physical sky shows only during a sun study), per renderer.
 * Precompile compiles them with the scene, so the first switch into that state doesn't stall on a
 * shader compile. Register stand-ins (a mesh sharing the material), not the live objects: compiling
 * only reads them, but they must never be added to a scene.
 */
const offstage = new WeakMap<THREE.WebGLRenderer, Set<THREE.Object3D>>();

/** Adds `objects` to this renderer's precompile list while the calling component is mounted. */
export function useOffstageCompile(objects: THREE.Object3D[]) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    let set = offstage.get(gl);
    if (!set) offstage.set(gl, (set = new Set()));
    for (const o of objects) set.add(o);
    return () => {
      for (const o of objects) set.delete(o);
    };
  }, [gl, objects]);
}

/** Longest wait for shaders to compile before drawing anyway, ms. */
const COMPILE_TIMEOUT = 5000;
/** Programs given their first use per frame while the other lamp state is built in the background. */
const WARM_PER_FRAME = 2;
/** Quiet time after the renderer's programs last grew before the other lamp state is built for the newcomers, ms. */
const REWARM_MS = 600;

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/**
 * Compiles every material in the scene with `compileAsync` (which lets the
 * driver link shaders in parallel, off the main thread where it can) before
 * the first frame, and again when the quality changes, since turning
 * post-processing on or off changes the renderer's tone mapping and so every
 * program. `before` is awaited first, so lazily loaded parts that change the
 * renderer (the post-processing chunk) are in place. The viewer holds its
 * frame loop until `onDone` is called. Anything not ready in time simply
 * compiles on first use, as it would have anyway. Objects registered with
 * useOffstageCompile are compiled too, lit as the scene is. With `offscreen`
 * (post-processing on), the scene is drawn into the composer's buffer, not the
 * canvas, so it is compiled with a render target bound: those programs differ
 * (linear output, no tone mapping) and would otherwise all compile again on
 * the first frame.
 */
export function Precompile({ token, offscreen = false, before, onDone }: { token: string; offscreen?: boolean; before?: () => Promise<unknown>; onDone: (token: string) => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const done = useRef(onDone);
  done.current = onDone;
  const prepare = useRef(before);
  prepare.current = before;

  useEffect(() => {
    let cancelled = false;
    lampStats.litReady = false;
    // compileAsync picks each program while it is called; only the wait for linking is async. `added` lists the programs this call created.
    const compileNow = () => {
      const target = offscreen ? new THREE.WebGLRenderTarget(1, 1) : null;
      const previous = gl.getRenderTarget();
      const had = new Set<THREE.WebGLProgram>(gl.info.programs ?? []);
      let linked: Promise<unknown>;
      gl.setRenderTarget(target);
      try {
        linked = Promise.all([gl.compileAsync(scene, camera), ...[...(offstage.get(gl) ?? [])].map((o) => gl.compileAsync(o, camera, scene))]);
      } finally {
        gl.setRenderTarget(previous);
        target?.dispose();
      }
      return { linked, added: () => (gl.info.programs ?? []).filter((p) => !had.has(p)) };
    };
    let stopWatch = () => {};
    let rewarm = 0;
    let running: Promise<void> | null = null;
    // The other lamp state, in the background: three bakes the light counts into every lit material's shader, so with
    // the lamp pool hidden (no lamp lit) the lit programs don't exist yet, and with it shown the unlit ones don't.
    // Building that variant now means switching lights compiles nothing.
    const otherLampState = () =>
      (running ??= (async () => {
        const pools = lampPoolsOf(gl);
        try {
          await nextFrame();
          await nextFrame();
          if (cancelled) return;
          const was = pools.map((o) => o.visible);
          let added: THREE.WebGLProgram[] = [];
          try {
            for (const o of pools) o.visible = !o.visible;
            added = compileNow().added();
          } finally {
            pools.forEach((o, i) => (o.visible = was[i]));
          }
          // Not compileAsync's own promise: a render in between points materials back at the other variant, so poll these programs.
          const end = performance.now() + COMPILE_TIMEOUT;
          while (!cancelled && performance.now() < end && !added.every((p) => (p as unknown as { isReady(): boolean }).isReady())) await new Promise((r) => setTimeout(r, 16));
          // A program's first use checks its link and reads its uniforms, which blocks until it is linked (at once
          // where the driver can't link in parallel): do that here, a few per frame, not in the frame that switches.
          for (let i = 0; i < added.length && !cancelled; i += WARM_PER_FRAME) {
            const live = new Set(gl.info.programs ?? []);
            for (const p of added.slice(i, i + WARM_PER_FRAME)) if (live.has(p)) p.getUniforms();
            await nextFrame();
          }
        } catch {
          // Only an optimisation.
        } finally {
          running = null;
        }
      })());
    void (async () => {
      try {
        await prepare.current?.();
        // Let React commit what just loaded and run its effects.
        await nextFrame();
        await nextFrame();
        if (cancelled) return;
        await Promise.race([compileNow().linked, new Promise((r) => setTimeout(r, COMPILE_TIMEOUT))]);
      } catch {
        // Compiling ahead is only an optimisation; draw regardless.
      }
      if (cancelled) return;
      done.current(token);
      await otherLampState();
      if (cancelled) return;
      lampStats.litReady = true;
      // Materials that first appear later (a new colour, a fitting added) were compiled only for the lamp state they
      // appeared in: once the renderer's programs stop growing, build their other variant too.
      let known = gl.info.programs?.length ?? 0;
      stopWatch = addAfterEffect(() => {
        const n = gl.info.programs?.length ?? 0;
        if (running || n <= known) return;
        known = n;
        window.clearTimeout(rewarm);
        rewarm = window.setTimeout(() => {
          void otherLampState().then(() => (known = gl.info.programs?.length ?? 0));
        }, REWARM_MS);
      });
    })();
    return () => {
      cancelled = true;
      stopWatch();
      window.clearTimeout(rewarm);
    };
  }, [gl, scene, camera, token, offscreen]);
  return null;
}
