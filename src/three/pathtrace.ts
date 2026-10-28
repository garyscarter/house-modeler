import * as THREE from "three";
import { GradientEquirectTexture, WebGLPathTracer } from "three-gpu-pathtracer";
import type { CameraPose } from "../lib/cameraViews";
import { exportable, getCapture } from "./capture";

/**
 * Path-traced stills ("Render"), loaded on demand so neither the app shell
 * nor the Viewer chunk carries the tracer. The viewer's own renderer traces
 * the live scene progressively into its canvas, then the picture is copied
 * out as a PNG and the viewer is put back as it was.
 *
 * Not traced: the sky dome and sun-hours overlay (shader materials), halos
 * (Points), the instanced bulbs and light pools (the tracer ignores instance
 * matrices), unlit overlays and contact shadows (basic materials), helpers.
 * The section cut is not honoured: the tracer has no clipping planes.
 */

export interface StillOptions {
  width: number;
  height: number;
  samples: number;
  /** Tuning overrides for the sky fill and the sun, as multiples of the live scene's; normally left out. */
  envScale?: number;
  sunScale?: number;
}

/** The traced sky fill and sun as multiples of the live scene's environment and sun intensities (tuned against the live view). */
const ENV_SCALE = 0.75;
const SUN_SCALE = 1.15;

/** From src/three/Lighting.tsx: environment gradient (zenith, horizon, ground), dusk zenith and horizon, and where warming starts. */
const ENV_GRADIENT = ["#a7bcd8", "#eceef0", "#857b6c"];
const ENV_DUSK = ["#9ea8c4", "#f0cfae"];
const DUSK_ALTITUDE = 25;
/** From src/three/Lighting.tsx: the visible backdrop (zenith, horizon, ground) by day and after dusk, and night's altitude. */
const DAY_BACKDROP = ["#8fb2e0", "#e2e9f0", "#d9ddd6"];
const NIGHT_BACKDROP = ["#0c1529", "#2d3c60", "#1b2232"];
const NIGHT_ALTITUDE = -4;

/** Smallest layer of the tracer's texture array, px; raised (to 2048 at most) when a finish canvas is bigger. */
const TEXTURE_SIZE = 1024;
const MAX_TEXTURE_SIZE = 2048;

/** Meshes the tracer can draw faithfully: lit standard or physical materials, no instancing, nothing exports would drop (but the far ground stays). */
function traceable(o: THREE.Object3D): boolean {
  if ((o as THREE.Light).isLight) return true;
  if ((o as THREE.Points).isPoints || (o as THREE.Line).isLine) return false;
  const mesh = o as THREE.Mesh;
  if (!mesh.isMesh) return exportable(o);
  if ((mesh as THREE.InstancedMesh).isInstancedMesh) return false;
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  if (!mats.every((m) => (m as THREE.MeshStandardMaterial).isMeshStandardMaterial)) return false;
  if (exportable(o)) return true;
  // The far ground is a standard-material plane too big for an export; in a still it carries the ground to the horizon.
  return mats.every((m) => {
    const map = (m as THREE.MeshStandardMaterial).map as (THREE.Texture & { isRenderTargetTexture?: boolean }) | null;
    return !map || (!!map.image && !map.isRenderTargetTexture);
  });
}

/** A three-stop vertical gradient like Lighting's skyGradientMaterial, as an equirect the tracer can sample. */
function gradient(top: THREE.Color, horizon: THREE.Color, bottom: THREE.Color, resolution = 256): GradientEquirectTexture {
  const tex = new GradientEquirectTexture(resolution);
  const dir = new THREE.Vector3();
  tex.generationCallback = (polar: THREE.Spherical, _uv: THREE.Vector2, _coord: THREE.Vector2, color: THREE.Color) => {
    dir.setFromSpherical(polar);
    const h = dir.y;
    if (h > 0) color.lerpColors(horizon, top, Math.pow(THREE.MathUtils.smoothstep(h, 0, 1), 0.6));
    else color.lerpColors(horizon, bottom, THREE.MathUtils.smoothstep(-h, 0, 0.25));
  };
  tex.update();
  return tex;
}

/** The scene's sun: its shadow-casting directional light, and the sun's altitude in degrees. */
function sunOf(scene: THREE.Scene): { light: THREE.DirectionalLight | null; altitude: number } {
  let light: THREE.DirectionalLight | null = null;
  scene.traverse((o) => {
    const l = o as THREE.DirectionalLight;
    if (!light && l.isDirectionalLight && l.castShadow) light = l;
  });
  if (!light) return { light, altitude: 50 };
  const l = light as THREE.DirectionalLight;
  const d = new THREE.Vector3().setFromMatrixPosition(l.matrixWorld).sub(new THREE.Vector3().setFromMatrixPosition(l.target.matrixWorld)).normalize();
  return { light, altitude: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(d.y, -1, 1))) };
}

/** Largest image side among the textures of the traced meshes. */
function largestTexture(scene: THREE.Scene): number {
  let max = 0;
  scene.traverseVisible((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      for (const v of Object.values(m)) {
        const img = (v as THREE.Texture | null)?.isTexture ? ((v as THREE.Texture).image as { width?: number; height?: number } | undefined) : undefined;
        if (img?.width && img.height) max = Math.max(max, img.width, img.height);
      }
    }
  });
  return max;
}

/**
 * Single-material stand-ins for the visible multi-material meshes, added at the scene root. The tracer's
 * merge gives each mesh one group and numbers it by mesh, while its material list holds every material of
 * every mesh, so a mesh with two materials shifts the material of every mesh merged after it.
 */
function splitMultiMaterial(scene: THREE.Scene): { parts: THREE.Mesh[]; originals: THREE.Mesh[] } {
  const parts: THREE.Mesh[] = [];
  const originals: THREE.Mesh[] = [];
  scene.traverseVisible((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !Array.isArray(mesh.material)) return;
    const g = mesh.geometry;
    const groups = g.groups.length ? g.groups : [{ start: 0, count: Infinity, materialIndex: 0 }];
    const total = g.index ? g.index.count : g.attributes.position.count;
    for (const grp of groups) {
      const mat = mesh.material[grp.materialIndex ?? 0];
      if (!mat) continue;
      const start = grp.start, end = Math.min(total, grp.start + grp.count);
      const index = new Uint32Array(end - start);
      for (let i = start; i < end; i++) index[i - start] = g.index ? g.index.getX(i) : i;
      const part = new THREE.BufferGeometry();
      for (const [name, attr] of Object.entries(g.attributes)) part.setAttribute(name, attr);
      part.setIndex(new THREE.BufferAttribute(index, 1));
      const m = new THREE.Mesh(part, mat);
      m.matrixAutoUpdate = false;
      m.matrix.copy(mesh.matrixWorld);
      parts.push(m);
    }
    originals.push(mesh);
  });
  return { parts, originals };
}

const abortError = () => new DOMException("The render was cancelled.", "AbortError");
const nextFrame = () => new Promise<number>((r) => requestAnimationFrame(r));
const encodePng = (c: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode the render."))), "image/png"));

/**
 * Path-trace viewer `id` from `pose` (or its camera as it is now) at
 * `opts.width x opts.height`, `opts.samples` samples per pixel. The image
 * builds up in the viewer's canvas; `onProgress` hears the sample count every
 * frame (0 while the scene is built). Rejects with an AbortError when
 * `signal` aborts. The viewer's size, pixel ratio, tone mapping, camera,
 * environment and visibility are restored whatever happens.
 */
export async function renderStill(
  id: string | undefined,
  pose: CameraPose | null,
  opts: StillOptions,
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  const t = getCapture(id);
  if (!t) throw new Error("Open the 3D view to render a still.");
  const { gl, scene } = t;
  const { width: w, height: h, samples: total } = opts;
  if (signal?.aborted) throw abortError();

  const camera = (t.camera as THREE.PerspectiveCamera).clone();
  if (pose) {
    camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
  }
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  const size = gl.getSize(new THREE.Vector2());
  const ratio = gl.getPixelRatio();
  const toneMapping = gl.toneMapping;
  const environment = scene.environment;
  const background = scene.background;
  const environmentIntensity = scene.environmentIntensity;
  const sunIntensity = sunOf(scene).light?.intensity ?? 0;
  let sun: THREE.DirectionalLight | null = null;
  const hidden: THREE.Object3D[] = [];
  const parts: THREE.Mesh[] = [];
  const textures: THREE.Texture[] = [];
  let tracer: WebGLPathTracer | null = null;
  onProgress(0, total);
  try {
    // Let the dialog paint "Building the scene…" before the BVH build holds the thread.
    await nextFrame();
    await nextFrame();
    if (signal?.aborted) throw abortError();

    scene.traverse((o) => {
      if (o !== scene && o.visible && !traceable(o)) hidden.push(o);
    });
    hidden.forEach((o) => (o.visible = false));
    scene.updateMatrixWorld(true);
    const split = splitMultiMaterial(scene);
    split.originals.forEach((o) => (o.visible = false));
    hidden.push(...split.originals);
    parts.push(...split.parts);
    if (parts.length) scene.add(...parts);
    scene.updateMatrixWorld(true);

    // The live environment is a PMREM cube-UV map the tracer cannot sample: trace the same gradient as an equirect.
    const { altitude, light: sunLight } = sunOf(scene);
    const night = altitude < NIGHT_ALTITUDE;
    const warmth = night ? 0 : THREE.MathUtils.clamp(1 - altitude / DUSK_ALTITUDE, 0, 1);
    const env = gradient(
      new THREE.Color(ENV_GRADIENT[0]).lerp(new THREE.Color(ENV_DUSK[0]), warmth),
      new THREE.Color(ENV_GRADIENT[1]).lerp(new THREE.Color(ENV_DUSK[1]), warmth),
      new THREE.Color(ENV_GRADIENT[2]),
    );
    const back = (night ? NIGHT_BACKDROP : DAY_BACKDROP).map((c) => new THREE.Color(c));
    const sky = gradient(back[0], back[1], back[2]);
    textures.push(env, sky);
    scene.environment = env;
    scene.background = sky;
    scene.environmentIntensity = environmentIntensity * (opts.envScale ?? ENV_SCALE);
    if (sunLight) sunLight.intensity = sunIntensity * (opts.sunScale ?? SUN_SCALE);
    sun = sunLight;

    gl.setPixelRatio(1);
    gl.setSize(w, h, false);
    if (toneMapping === THREE.NoToneMapping) gl.toneMapping = THREE.NeutralToneMapping;

    tracer = new WebGLPathTracer(gl);
    tracer.bounces = 5;
    tracer.transmissiveBounces = 8;
    tracer.filterGlossyFactor = 0.5;
    tracer.renderScale = 1;
    tracer.tiles.set(2, 2);
    tracer.multipleImportanceSampling = true;
    const texSize = THREE.MathUtils.clamp(THREE.MathUtils.ceilPowerOfTwo(Math.max(1, largestTexture(scene))), TEXTURE_SIZE, MAX_TEXTURE_SIZE);
    tracer.textureSize.set(texSize, texSize);
    // Show only traced samples, straight away: no raster fallback, delay or fade.
    tracer.rasterizeScene = false;
    tracer.renderToCanvas = true;
    tracer.dynamicLowRes = false;
    tracer.minSamples = 1;
    tracer.renderDelay = 0;
    tracer.fadeDuration = 0;
    // Under 100k triangles the synchronous BVH build takes a moment; the worker build would need a bundled worker.
    tracer.setScene(scene, camera);
    // The tracer has read the environment, background and lights; the live scene gets its own back.
    scene.environment = environment;
    scene.background = background;
    scene.environmentIntensity = environmentIntensity;
    if (sun) sun.intensity = sunIntensity;
    hidden.forEach((o) => (o.visible = true));
    hidden.length = 0;
    if (parts.length) scene.remove(...parts);
    parts.length = 0;

    // One tile in flight at a time: requestAnimationFrame does not wait for the GPU, so without a fence a slow
    // GPU queues up minutes of work, the page stops painting and the progress runs ahead of the picture.
    const ctx = gl.getContext() as WebGL2RenderingContext;
    let fence: WebGLSync | null = null;
    try {
      while (tracer.samples < total) {
        if (signal?.aborted) throw abortError();
        if (fence) {
          if (ctx.clientWaitSync(fence, 0, 0) === ctx.TIMEOUT_EXPIRED) {
            await nextFrame();
            continue;
          }
          ctx.deleteSync(fence);
          fence = null;
        }
        tracer.renderSample();
        onProgress(tracer.samples, total);
        if (tracer.samples >= total) break;
        fence = ctx.fenceSync(ctx.SYNC_GPU_COMMANDS_COMPLETE, 0);
        ctx.flush();
        await nextFrame();
      }
    } finally {
      if (fence) ctx.deleteSync(fence);
    }
    // The drawing buffer is cleared once the frame is shown, so copy it out in the same task as the last sample.
    const out = document.createElement("canvas");
    out.width = gl.domElement.width;
    out.height = gl.domElement.height;
    out.getContext("2d")!.drawImage(gl.domElement, 0, 0);
    return await encodePng(out);
  } finally {
    scene.environmentIntensity = environmentIntensity;
    if (sun) sun.intensity = sunIntensity;
    hidden.forEach((o) => (o.visible = true));
    if (parts.length) scene.remove(...parts);
    scene.environment = environment;
    scene.background = background;
    tracer?.dispose();
    textures.forEach((x) => x.dispose());
    gl.toneMapping = toneMapping;
    gl.setPixelRatio(ratio);
    gl.setSize(size.x, size.y, false);
    gl.shadowMap.needsUpdate = true;
    t.invalidate?.();
  }
}
