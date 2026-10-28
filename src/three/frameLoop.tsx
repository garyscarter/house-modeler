import { useEffect, useLayoutEffect, useRef } from "react";
import { addAfterEffect, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "../store";
import { useSiteView } from "./siteView";
import { trackScene } from "./textures";
import { lampPoolsOf, lampStats, onLampPoolChange, setLampWarming } from "./lampPool";

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
 * from (`deps` from the viewer, plus site, sun, variant, site view and section cut), and
 * whenever the renderer's geometry, texture or program counts change, which
 * catches textures and other content that arrive asynchronously. Err on the
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
  const sectionHeight = useStore((s) => s.sectionHeight);

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
  useLayoutEffect(() => mark.current(), [...deps, sun, sites, showSite, activeVariant, siteView, sectionHeight]);

  const scene = useThree((s) => s.scene);
  useFrame(() => {
    gl.shadowMap.autoUpdate = false;
    if (dirty.current <= 0) return;
    // Every casting light keeps its own flag (shadow.autoUpdate false, set where the light is made), so a spot that
    // moves slot redraws only its own map. Here the scene changed, so every lit caster redraws; a light at intensity 0
    // (the sun below the horizon) has nothing to show and its 4096 map is the dearest pass there is. A map that has
    // never been drawn must be drawn regardless: the lit shaders sample it, and an unallocated one fails every draw
    // call (GL_INVALID_OPERATION, a blank scene when the page opens straight into night).
    scene.traverse((o) => {
      const light = o as THREE.Light & { shadow?: THREE.LightShadow };
      if (light.isLight && light.castShadow && light.shadow && (light.intensity > 0 || !light.shadow.map)) light.shadow.needsUpdate = true;
    });
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
/** Main-thread time per frame for building the other lamp state's programs in the background, ms. */
const WARM_SLICE_MS = 8;
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
    // This run's mark in the warming set: lights are held off until the other lamp state is built.
    const warmKey = {};
    setLampWarming(warmKey, true);
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
    // The pass in flight, resolving to the pool generation it built for.
    let running: Promise<number> | null = null;
    // Pool size changes (a light fitting added or removed), counted from the start, so one that lands during a pass
    // makes that pass go again: its programs were for the old size.
    let poolGen = 0;
    let onPool = () => {};
    const stopPool = onLampPoolChange(gl, () => {
      poolGen++;
      onPool();
    });
    // The other lamp state, in the background: three bakes the light counts into every lit material's shader, so with
    // the lamp pool hidden (no lamp lit) the lit programs don't exist yet, and with it shown the unlit ones don't.
    // Building that variant now means switching lights compiles nothing. It goes a material at a time, a few
    // milliseconds a frame, so a driver that compiles on the main thread never stops the page for long.
    const isReady = (p: THREE.WebGLProgram) => (p as unknown as { isReady(): boolean }).isReady();
    const otherLampState = () =>
      (running ??= (async () => {
        const pools = lampPoolsOf(gl);
        const target = offscreen ? new THREE.WebGLRenderTarget(1, 1) : null;
        // The pool this pass builds for: taken when it reads the scene, so a change after that sends warmFully round again.
        let gen = -1;
        try {
          await nextFrame();
          await nextFrame();
          if (cancelled) return gen;
          gen = poolGen;
          // One object per material (and the offstage stand-ins): compiling it compiles that material's program.
          const reps = new Map<THREE.Material, THREE.Object3D>();
          const take = (o: THREE.Object3D) => {
            const m = (o as THREE.Mesh).material;
            for (const mm of m ? (Array.isArray(m) ? m : [m]) : []) if (!reps.has(mm)) reps.set(mm, o);
          };
          scene.traverseVisible(take);
          for (const o of offstage.get(gl) ?? []) take(o);
          const entries = [...reps];
          // Still drawn: its object still wears the material, and is still in this scene or still a stand-in. One that
          // went in the meantime (unmounted, recoloured) is skipped, or compiling it would build a program nothing frees.
          const live = (m: THREE.Material, o: THREE.Object3D) => {
            const cur = (o as THREE.Mesh).material;
            if (!(Array.isArray(cur) ? cur.includes(m) : cur === m)) return false;
            if (offstage.get(gl)?.has(o)) return true;
            let root: THREE.Object3D = o;
            while (root.parent) root = root.parent;
            return root === scene;
          };
          const added: THREE.WebGLProgram[] = [];
          // Picks one object's programs for the other lamp state, as Precompile's first pass does for the scene.
          const compileOne = (o: THREE.Object3D) => {
            const had = new Set<THREE.WebGLProgram>(gl.info.programs ?? []);
            const was = pools.map((x) => x.visible);
            const previous = gl.getRenderTarget();
            try {
              for (const x of pools) x.visible = !x.visible;
              gl.setRenderTarget(target);
              gl.compile(o, camera, scene);
            } finally {
              gl.setRenderTarget(previous);
              pools.forEach((x, i) => (x.visible = was[i]));
            }
            for (const p of gl.info.programs ?? []) if (!had.has(p)) added.push(p);
          };
          // Submitting is cheap (the driver links in the background); a program's first use checks its link and reads
          // its uniforms, which waits for that link. So: submit everything a slice at a time, let the driver finish
          // where it says when (KHR_parallel_shader_compile), then give each program its first use a slice at a time.
          const firstUse = (p: THREE.WebGLProgram) => {
            if ((gl.info.programs ?? []).includes(p)) p.getUniforms();
          };
          const done = new Set<THREE.Object3D>();
          for (let i = 0; i < entries.length && !cancelled; ) {
            const t0 = performance.now();
            do {
              const [m, o] = entries[i++];
              if (done.has(o) || !live(m, o)) continue;
              done.add(o);
              compileOne(o);
            } while (i < entries.length && performance.now() - t0 < WARM_SLICE_MS);
            await nextFrame();
          }
          const end = performance.now() + COMPILE_TIMEOUT;
          // A program released in the meantime (a material disposed) is settled: a deleted program never reports ready.
          const settled = () => {
            const alive = new Set(gl.info.programs ?? []);
            return added.every((p) => !alive.has(p) || typeof (p as unknown as { isReady?: () => boolean }).isReady !== "function" || isReady(p));
          };
          while (!cancelled && performance.now() < end && !settled()) await new Promise((r) => setTimeout(r, 16));
          for (let j = 0; j < added.length && !cancelled; ) {
            const t0 = performance.now();
            do firstUse(added[j++]);
            while (j < added.length && performance.now() - t0 < WARM_SLICE_MS);
            await nextFrame();
          }
        } catch {
          // Only an optimisation.
        } finally {
          target?.dispose();
          running = null;
        }
        return gen;
      })());
    // A pass that is current for the pool it ends with: again while the pool changed size during it.
    const warmFully = async () => {
      while (!cancelled && (await otherLampState()) !== poolGen);
    };
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
      await warmFully();
      if (cancelled) return;
      lampStats.litReady = true;
      setLampWarming(warmKey, false);
      // Materials that first appear later (a new colour, a fitting added) were compiled only for the lamp state they
      // appeared in, and a pool that changes size (a light fitting added or removed) needs both states again: once the
      // renderer's programs stop growing, or the pool settles, build the other variant too.
      let known = gl.info.programs?.length ?? 0;
      const later = (hold = false) => {
        // A pool that changed size holds the lights off until both its states are built.
        if (hold) setLampWarming(warmKey, true);
        window.clearTimeout(rewarm);
        rewarm = window.setTimeout(() => {
          void warmFully().then(() => {
            known = gl.info.programs?.length ?? 0;
            if (!cancelled) setLampWarming(warmKey, false);
          });
        }, REWARM_MS);
      };
      const stopAfter = addAfterEffect(() => {
        const n = gl.info.programs?.length ?? 0;
        if (running || n <= known) return;
        known = n;
        later();
      });
      onPool = () => later(true);
      stopWatch = stopAfter;
    })();
    return () => {
      cancelled = true;
      stopWatch();
      stopPool();
      window.clearTimeout(rewarm);
      setLampWarming(warmKey, false);
    };
  }, [gl, scene, camera, token, offscreen]);
  return null;
}
