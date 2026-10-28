import { usePanelPrefs } from "../components/panelPrefs";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Sky } from "three-stdlib";
import { useStore } from "../store";
import { useViewedSite } from "./viewedVariant";
import { daylight, worldToBearing } from "../lib/sun";
import { useSunInfo } from "./useSun";
import { GROUND_Y } from "./Site";
import { setGlassMode } from "./textures";

/** Default key light: high, from the front right, so the front elevation reads with soft side shadows. */
const DEFAULT_DIR = new THREE.Vector3(0.5, 0.78, 0.38).normalize();
/** Key light intensities: the default front-right light, and the real sun at full height. */
const KEY_DEFAULT = 4.2;
const KEY_SUN = 5;
/** Extra key light (warm) while the sun sits on the horizon, and how much the sky dims then. */
const DUSK_KEY = 0.7;
const DUSK_DIM = 0.35;
const SHADOW_MAP = { high: 4096, balanced: 2048, low: 1024 } as const;
/**
 * The sun's shadows are variance shadow maps (the canvas sets `shadows="variance"`): the map holds depth and
 * its square, blurred, so the edge is a filtered penumbra rather than a stencil. The blur is set in metres,
 * so the penumbra is the same width at every quality; a coarser map just takes fewer taps to reach it.
 */
const PENUMBRA = 0.12;
/** Blur taps per axis (the blur runs only when the shadow map is redrawn, not every frame). */
const SHADOW_SAMPLES = { high: 16, balanced: 12, low: 8 } as const;
/** Blur radius limits, in shadow-map texels. */
const MIN_RADIUS = 1.5;
const MAX_RADIUS = 12;

const WHITE_SUN = new THREE.Color("#fff3e2");
const LOW_SUN = new THREE.Color("#ffae78");
const DAY_SKY = new THREE.Color("#eef0f2");
const DUSK_SKY = new THREE.Color("#5d6f9c");
const GROUND_BOUNCE = new THREE.Color("#8d8270");
const MOON = new THREE.Color("#9db4ff");
/** Below this sun altitude (degrees) it is night: the physical sky gives way to a gradient, windows light up. */
const NIGHT_ALTITUDE = -4;
// Scratch objects for fitting the shadow camera, which runs every frame while the sun study plays.
const _target = new THREE.Vector3();
const _sphere = new THREE.Sphere();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _c = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Scene lighting: soft sky light (an environment map, with a faint
 * hemisphere light) and a shadow-casting key light. With the sun study on, the key light
 * is the real sun for the site's location, date and time; below the
 * horizon only a dim twilight remains, with a cool moon fill and lit windows.
 */
export function Lighting({ centre, size }: { centre: THREE.Vector3; size: number }) {
  const sun = useSunInfo();
  const site = useViewedSite();
  const showSite = useStore((s) => s.showSite);
  const quality = useStore((s) => s.settings.quality);
  const invalidate = useThree((s) => s.invalidate);
  const light = useRef<THREE.DirectionalLight>(null);

  const active = !!sun?.active;
  const altitude = active ? sun!.position.altitude : 50;
  const day = daylight(altitude);
  const night = active && altitude < NIGHT_ALTITUDE;
  const low = active ? 1 - THREE.MathUtils.smoothstep(altitude, 0, 6) : 0;
  const skyLevel = active ? day.sky * (1 - DUSK_DIM * low) : 1;
  useSkyEnvironment(active && !night ? sun!.vector : null, altitude, skyLevel);
  const dir = useMemo(() => (active ? new THREE.Vector3(...sun!.vector) : DEFAULT_DIR.clone()), [active, sun]);

  // Everything that casts or catches a shadow worth seeing: the house, and the plot and neighbours when shown.
  const box = useMemo(() => {
    const b = new THREE.Box3(
      new THREE.Vector3(centre.x - size / 2 - 1, GROUND_Y, centre.z - size / 2 - 1),
      new THREE.Vector3(centre.x + size / 2 + 1, 13, centre.z + size / 2 + 1),
    );
    if (site && showSite) {
      const p = new THREE.Vector3();
      for (const v of site.boundary) b.expandByPoint(p.set(v.x, GROUND_Y, v.y));
      for (const n of site.neighbours) for (const v of n.polygon) b.expandByPoint(p.set(v.x, GROUND_Y + n.eaves + 3, v.y));
    }
    return b;
  }, [centre, size, site, showSite]);

  // Aim the light and fit its shadow camera tightly around the box, seen from the light.
  useLayoutEffect(() => {
    const l = light.current;
    if (!l) return;
    const target = box.getCenter(_target);
    const dist = box.getBoundingSphere(_sphere).radius + 5;
    l.position.copy(target).addScaledVector(dir, dist);
    l.target.position.copy(target);
    l.target.updateMatrixWorld();
    // Same basis as the shadow camera's lookAt: z towards the light, x = up × z.
    const x = _x.crossVectors(UP, dir);
    if (x.lengthSq() < 1e-8) x.set(1, 0, 0);
    x.normalize();
    const y = _y.crossVectors(dir, x);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      const c = _c.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(target);
      const px = c.dot(x), py = c.dot(y), pz = c.dot(dir);
      x0 = Math.min(x0, px); x1 = Math.max(x1, px);
      y0 = Math.min(y0, py); y1 = Math.max(y1, py);
      z0 = Math.min(z0, pz); z1 = Math.max(z1, pz);
    }
    const cam = l.shadow.camera;
    const pad = 0.5;
    cam.left = x0 - pad;
    cam.right = x1 + pad;
    cam.bottom = y0 - pad;
    cam.top = y1 + pad;
    cam.near = Math.max(0.1, dist - z1 - pad);
    cam.far = dist - z0 + pad;
    cam.updateProjectionMatrix();
    const mapSize = SHADOW_MAP[quality];
    if (l.shadow.mapSize.x !== mapSize) {
      l.shadow.mapSize.set(mapSize, mapSize);
      // The blur's intermediate target is sized once, so it goes too.
      l.shadow.map?.dispose();
      l.shadow.map = null;
      l.shadow.mapPass?.dispose();
      l.shadow.mapPass = null;
    }
    // A texel's footprint sets the blur radius and how much bias is needed to avoid acne.
    const texel = Math.max(x1 - x0, y1 - y0) / mapSize;
    l.shadow.radius = THREE.MathUtils.clamp(PENUMBRA / texel, MIN_RADIUS, MAX_RADIUS);
    l.shadow.blurSamples = SHADOW_SAMPLES[quality];
    l.shadow.normalBias = Math.max(0.01, texel);
    l.shadow.bias = -0.0005;
    l.shadow.needsUpdate = true;
  }, [box, dir, quality]);

  // Glass is real transmission on high quality, and lit from inside at night.
  useEffect(() => {
    setGlassMode(quality === "high", night);
    invalidate();
  }, [quality, night, invalidate]);

  // Dusk, the sun within a few degrees of the horizon: a weak, warm raking light stays on (the daylight curve
  // alone leaves almost none), and the sky dims so garden lights read.
  const dusk = active ? THREE.MathUtils.smoothstep(altitude, -1.5, 0.5) * (1 - THREE.MathUtils.smoothstep(altitude, 3, 8)) : 0;
  const keyIntensity = active ? KEY_SUN * day.sun + DUSK_KEY * dusk : KEY_DEFAULT;
  const keyColor = useMemo(() => (active ? WHITE_SUN.clone().lerp(LOW_SUN, day.warmth) : WHITE_SUN.clone()), [active, day.warmth]);
  const skyColor = useMemo(() => DUSK_SKY.clone().lerp(DAY_SKY, active ? Math.min(1, day.sky * 1.2) : 1), [active, day.sky]);

  return (
    <>
      <hemisphereLight color={skyColor} groundColor={GROUND_BOUNCE} intensity={Math.max(skyLevel * 0.15, 0.35 * dusk)} />
      <directionalLight position={[-0.3, 0.8, 0.5]} color={MOON} intensity={night ? 0.3 : 0} />
      {/* Always casts, even at night, so the sun setting doesn't recompile every material. */}
      <directionalLight ref={light} intensity={keyIntensity} color={keyColor} castShadow />
      {site && <CompassBridge frontBearing={site.frontBearing} />}
    </>
  );
}

/** Environment gradient (zenith, horizon, ground): muted, so shadows stay neutral rather than cyan. */
const ENV_GRADIENT = ["#a7bcd8", "#eceef0", "#857b6c"];
/** Environment light as a share of the sky level: the main ambient light. */
const ENV_INTENSITY = 0.8;
/** Zenith and horizon the gradient warms toward as the sun nears the horizon in a sun study. */
const ENV_DUSK = ["#9ea8c4", "#f0cfae"];
/** Sun altitude (degrees) below which the environment starts to warm. */
const DUSK_ALTITUDE = 25;
/** The environment is re-baked at most this often while the sun moves. */
const REBAKE_MS = 250;

/** The visible physical sky dome. Unscaled, it would blow out to white. */
function makeSky(scale: number) {
  const sky = new Sky();
  if (scale !== 1) {
    sky.material.fragmentShader = sky.material.fragmentShader.replace("gl_FragColor = vec4( retColor, 1.0 );", `gl_FragColor = vec4( retColor * ${scale.toFixed(3)}, 1.0 );`);
  }
  return sky;
}

function aimSky(sky: Sky, sunVector: readonly number[], altitude: number) {
  const u = sky.material.uniforms;
  u.sunPosition.value.set(sunVector[0], sunVector[1], sunVector[2]);
  u.turbidity.value = 5;
  u.rayleigh.value = altitude > 0 ? 1.4 : 2.5;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.85;
}

/**
 * Soft image-based light with no download: a prefiltered environment map
 * that is the scene's main ambient light. By default a muted sky-to-ground
 * gradient; during a sun study (`sunVector` set) the gradient warms as the
 * sun nears the horizon, so dusk gets warm ambient light. (Baking the
 * physical sky itself doesn't work: it draws nothing into PMREM's cube
 * camera.) Re-baking is throttled, and the last position always lands.
 */
function useSkyEnvironment(sunVector: [number, number, number] | null, altitude: number, skyLevel: number) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const bake = useRef<(v: readonly number[] | null, alt: number) => void>(() => {});
  const wanted = useRef({ v: sunVector as readonly number[] | null, alt: altitude });
  wanted.current = { v: sunVector, alt: altitude };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef(0);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const gradient = new THREE.Scene();
    const gradientGeo = new THREE.SphereGeometry(10, 32, 16);
    const gradientMat = skyGradientMaterial(new THREE.Color(ENV_GRADIENT[0]), new THREE.Color(ENV_GRADIENT[1]), new THREE.Color(ENV_GRADIENT[2]), false);
    gradient.add(new THREE.Mesh(gradientGeo, gradientMat));
    const top = new THREE.Color(ENV_GRADIENT[0]), horizon = new THREE.Color(ENV_GRADIENT[1]);
    const duskTop = new THREE.Color(ENV_DUSK[0]), duskHorizon = new THREE.Color(ENV_DUSK[1]);
    let rt: THREE.WebGLRenderTarget | null = null;
    let baked = -1;
    bake.current = (v, alt) => {
      // Warmth in twentieth steps, so a playing sun re-bakes only when the colour visibly changes.
      const warmth = v ? Math.round(THREE.MathUtils.clamp(1 - alt / DUSK_ALTITUDE, 0, 1) * 20) / 20 : 0;
      if (rt && warmth === baked) return;
      baked = warmth;
      gradientMat.uniforms.top.value.copy(top).lerp(duskTop, warmth);
      gradientMat.uniforms.horizon.value.copy(horizon).lerp(duskHorizon, warmth);
      const next = pmrem.fromScene(gradient, 0.02);
      scene.environment = next.texture;
      rt?.dispose();
      rt = next;
      invalidate();
    };
    bake.current(wanted.current.v, wanted.current.alt);
    return () => {
      bake.current = () => {};
      if (rt && scene.environment === rt.texture) scene.environment = null;
      rt?.dispose();
      gradientGeo.dispose();
      gradientMat.dispose();
      pmrem.dispose();
    };
  }, [gl, scene, invalidate]);

  // The sun moved: re-bake now, or once the throttle allows, with whatever the latest position is by then.
  const key = sunVector ? sunVector.join() : "";
  useEffect(() => {
    if (timer.current) return;
    const run = () => {
      timer.current = null;
      last.current = performance.now();
      bake.current(wanted.current.v, wanted.current.alt);
    };
    const wait = REBAKE_MS - (performance.now() - last.current);
    if (wait <= 0) run();
    else timer.current = setTimeout(run, wait);
  }, [key]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    },
    [],
  );

  useEffect(() => {
    scene.environmentIntensity = skyLevel * ENV_INTENSITY;
    invalidate();
  }, [scene, skyLevel, invalidate]);
}

/**
 * Vertical gradient by view direction: zenith, horizon, ground. As a
 * backdrop it is drawn first and ignores depth so it sits behind everything.
 */
function skyGradientMaterial(top: THREE.Color, horizon: THREE.Color, bottom: THREE.Color, backdrop: boolean) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: !backdrop,
    uniforms: { top: { value: top }, horizon: { value: horizon }, bottom: { value: bottom } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vDir = wp.xyz - cameraPosition;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top;
      uniform vec3 horizon;
      uniform vec3 bottom;
      varying vec3 vDir;
      void main() {
        float h = normalize(vDir).y;
        vec3 c = h > 0.0 ? mix(horizon, top, pow(smoothstep(0.0, 1.0, h), 0.6)) : mix(horizon, bottom, smoothstep(0.0, 0.25, -h));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/** Backdrop gradients (zenith, horizon, ground): a soft day sky, and a deep blue for after dusk. */
const DAY_BACKDROP = ["#8fb2e0", "#e2e9f0", "#d9ddd6"].map((c) => new THREE.Color(c));
const NIGHT_BACKDROP = ["#0c1529", "#2d3c60", "#1b2232"].map((c) => new THREE.Color(c));
/** Share of the physical sky's brightness shown behind the house. */
const SKY_BRIGHTNESS = 0.4;
const SUN_HAZE = new THREE.Color("#dbe3ea");
const LOW_HAZE = new THREE.Color("#f0c8a0");
/** Fog starts well beyond the plot so only the far ground fades; the colour is set as a prop. */
const FOG_ARGS: [string, number, number] = ["#e2e9f0", 140, 420];
/** Quiet canvas: fog starts about 60 m out and is solid by the edge of the 300 m ground, so no hard edge shows. */
const QUIET_FOG: [number, number] = [60, 220];

/**
 * The sky behind the scene: a physical sky lit by the sun during a sun
 * study (a deep blue gradient once the sun is well down, where the
 * physical sky turns black), otherwise a soft blue gradient. Fog fades the
 * far ground into the horizon.
 */
export function SkyBackdrop() {
  const quiet = usePanelPrefs((s) => s.quiet);
  const sun = useSunInfo();
  const camera = useThree((s) => s.camera);
  const dome = useRef<THREE.Mesh>(null);
  const backdrop = useMemo(() => skyGradientMaterial(DAY_BACKDROP[0].clone(), DAY_BACKDROP[1].clone(), DAY_BACKDROP[2].clone(), true), []);
  useEffect(() => () => backdrop.dispose(), [backdrop]);
  // The visible sky is scaled down: unscaled it comes out near white and the house disappears into it.
  const sky = useMemo(() => {
    const k = makeSky(SKY_BRIGHTNESS);
    k.scale.setScalar(400);
    // Not something to zoom towards (Viewer's wheel handler raycasts the scene).
    k.raycast = () => {};
    return k;
  }, []);
  useEffect(
    () => () => {
      sky.geometry.dispose();
      sky.material.dispose();
    },
    [sky],
  );
  const invalidate = useThree((s) => s.invalidate);
  // Keep the dome centred on the camera so its horizon stays level wherever it goes.
  useFrame(() => dome.current?.position.copy(camera.position));

  const alt = sun?.active ? sun.position.altitude : null;
  const physical = alt !== null && alt > NIGHT_ALTITUDE;
  const night = alt !== null && !physical;
  useEffect(() => {
    const cols = night ? NIGHT_BACKDROP : DAY_BACKDROP;
    (["top", "horizon", "bottom"] as const).forEach((k, i) => (backdrop.uniforms[k].value as THREE.Color).copy(cols[i]));
  }, [backdrop, night]);
  useEffect(() => {
    if (!sun?.active || alt === null) return;
    aimSky(sky, sun.vector, alt);
    invalidate();
  }, [sky, sun, alt, invalidate]);
  const fog = useMemo(() => {
    if (alt === null || night) return (night ? NIGHT_BACKDROP : DAY_BACKDROP)[1].clone();
    const day = daylight(alt);
    return NIGHT_BACKDROP[1].clone().lerp(SUN_HAZE, (day.sky - 0.25) / 0.75).lerp(LOW_HAZE, day.warmth * day.sun * 0.6);
  }, [alt, night]);

  return (
    <>
      {physical ? (
        <primitive object={sky} />
      ) : (
        <mesh ref={dome} material={backdrop} renderOrder={-1000} frustumCulled={false} raycast={() => null}>
          <sphereGeometry args={[300, 32, 16]} />
        </mesh>
      )}
      <fog attach="fog" args={[FOG_ARGS[0], quiet ? QUIET_FOG[0] : FOG_ARGS[1], quiet ? QUIET_FOG[1] : FOG_ARGS[2]]} color={fog} />
    </>
  );
}

/**
 * Publishes which compass bearing the camera faces as the CSS variable
 * --view-bearing on the viewer, for the compass rose overlay. Written only
 * when it changes, so orbiting costs no React renders.
 */
function CompassBridge({ frontBearing }: { frontBearing: number }) {
  const gl = useThree((s) => s.gl);
  const last = useRef(NaN);
  const el = useRef<HTMLElement | null>(null);
  useEffect(() => {
    el.current = gl.domElement.closest(".wipe") ?? gl.domElement.closest(".viewer");
    last.current = NaN;
  }, [gl, frontBearing]);
  useFrame(({ camera }) => {
    if (!el.current) return;
    // The ground direction that is "up" on screen: forward plus up, flattened (works looking straight down too).
    const e = camera.matrixWorld.elements;
    const b = worldToBearing(frontBearing, e[4] - e[8], e[6] - e[10]);
    if (!(Math.abs(b - last.current) <= 0.2)) {
      last.current = b;
      el.current.style.setProperty("--view-bearing", b.toFixed(1));
    }
  });
  return null;
}
