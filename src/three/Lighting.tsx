import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Sky } from "@react-three/drei";
import * as THREE from "three";
import { useStore } from "../store";
import { daylight, worldToBearing } from "../lib/sun";
import { useSunInfo } from "./useSun";
import { GROUND_Y } from "./Site";

/** Default key light: high, from the front right, so the front elevation reads with soft side shadows. */
const DEFAULT_DIR = new THREE.Vector3(0.5, 0.78, 0.38).normalize();
const SHADOW_MAP = { high: 4096, balanced: 2048, low: 1024 } as const;
/** Shadow edge softness in shadow-map texels. */
const SHADOW_RADIUS = { high: 3, balanced: 2, low: 1 } as const;

const WHITE_SUN = new THREE.Color("#fff3e2");
const LOW_SUN = new THREE.Color("#ff9a52");
const DAY_SKY = new THREE.Color("#dfe9f7");
const DUSK_SKY = new THREE.Color("#5d6f9c");
const GROUND_BOUNCE = new THREE.Color("#8d8270");

/**
 * Scene lighting: soft sky light (hemisphere plus a gradient environment
 * map) and a shadow-casting key light. With the sun study on, the key light
 * is the real sun for the site's location, date and time; below the
 * horizon only a dim twilight remains.
 */
export function Lighting({ centre, size, walking }: { centre: THREE.Vector3; size: number; walking: boolean }) {
  const sun = useSunInfo();
  const site = useStore((s) => s.site);
  const showSite = useStore((s) => s.showSite);
  const quality = useStore((s) => s.settings.quality);
  const scene = useThree((s) => s.scene);
  const light = useRef<THREE.DirectionalLight>(null);
  useSkyEnvironment();

  const active = !!sun?.active;
  const altitude = active ? sun!.position.altitude : 50;
  const day = daylight(altitude);
  const dir = useMemo(() => (active ? new THREE.Vector3(...sun!.vector) : DEFAULT_DIR.clone()), [active, sun]);

  // Everything that casts or catches a shadow worth seeing: the house, and the plot and neighbours when shown.
  const box = useMemo(() => {
    const b = new THREE.Box3(
      new THREE.Vector3(centre.x - size / 2 - 1, GROUND_Y, centre.z - size / 2 - 1),
      new THREE.Vector3(centre.x + size / 2 + 1, 11, centre.z + size / 2 + 1),
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
    const target = box.getCenter(new THREE.Vector3());
    const dist = box.getBoundingSphere(new THREE.Sphere()).radius + 5;
    l.position.copy(target).addScaledVector(dir, dist);
    l.target.position.copy(target);
    l.target.updateMatrixWorld();
    // Same basis as the shadow camera's lookAt: z towards the light, x = up × z.
    const z = dir.clone();
    const x = new THREE.Vector3(0, 1, 0).cross(z);
    if (x.lengthSq() < 1e-8) x.set(1, 0, 0);
    x.normalize();
    const y = new THREE.Vector3().crossVectors(z, x);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    const c = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      c.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(target);
      const px = c.dot(x), py = c.dot(y), pz = c.dot(z);
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
      l.shadow.map?.dispose();
      (l.shadow as { map: THREE.WebGLRenderTarget | null }).map = null;
    }
    l.shadow.radius = SHADOW_RADIUS[quality];
    // A texel's footprint sets how much bias is needed to avoid acne.
    const texel = Math.max(x1 - x0, y1 - y0) / mapSize;
    l.shadow.normalBias = Math.max(0.01, texel * 1.5);
    l.shadow.bias = -0.0002;
    l.shadow.needsUpdate = true;
  }, [box, dir, quality]);

  // Walk mode wants bright, even light indoors; the sun still comes through the windows.
  const keyIntensity = (active ? 5 * day.sun : 4.2) * (walking ? 0.5 : 1);
  const keyColor = useMemo(() => (active ? WHITE_SUN.clone().lerp(LOW_SUN, day.warmth) : WHITE_SUN.clone()), [active, day.warmth]);
  const skyLevel = active ? day.sky : 1;
  const skyColor = useMemo(() => DUSK_SKY.clone().lerp(DAY_SKY, active ? Math.min(1, day.sky * 1.2) : 1), [active, day.sky]);

  useEffect(() => {
    scene.environmentIntensity = skyLevel * (walking ? 1.1 : 0.5);
  }, [scene, skyLevel, walking]);

  return (
    <>
      <hemisphereLight color={skyColor} groundColor={GROUND_BOUNCE} intensity={skyLevel * (walking ? 1.5 : 0.5)} />
      <ambientLight intensity={walking ? 0.6 : 0} />
      {/* Always casts, even at night, so the sun setting doesn't recompile every material. */}
      <directionalLight ref={light} intensity={keyIntensity} color={keyColor} castShadow />
      {site && <CompassBridge frontBearing={site.frontBearing} />}
    </>
  );
}

/**
 * Soft image-based light with no download: a sky-to-ground gradient
 * rendered into a prefiltered environment map once per renderer.
 */
function useSkyEnvironment() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = new THREE.Scene();
    const mat = skyGradientMaterial(new THREE.Color("#7fa7dc"), new THREE.Color("#eef2f6"), new THREE.Color("#6f6656"), false);
    const geo = new THREE.SphereGeometry(10, 32, 16);
    env.add(new THREE.Mesh(geo, mat));
    const rt = pmrem.fromScene(env, 0.02);
    geo.dispose();
    mat.dispose();
    pmrem.dispose();
    scene.environment = rt.texture;
    return () => {
      if (scene.environment === rt.texture) scene.environment = null;
      rt.dispose();
    };
  }, [gl, scene]);
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

const BACKDROP_TOP = new THREE.Color("#a9c6ea");
const BACKDROP_HORIZON = new THREE.Color("#eef1f4");
const BACKDROP_BOTTOM = new THREE.Color("#d9ddd6");

/**
 * The sky behind the scene: a physical sky lit by the sun during a sun
 * study, otherwise a soft blue gradient. Fog fades the far ground into it.
 */
export function SkyBackdrop() {
  const sun = useSunInfo();
  const camera = useThree((s) => s.camera);
  const dome = useRef<THREE.Mesh>(null);
  const backdrop = useMemo(() => skyGradientMaterial(BACKDROP_TOP, BACKDROP_HORIZON, BACKDROP_BOTTOM, true), []);
  useEffect(() => () => backdrop.dispose(), [backdrop]);
  // Keep the dome centred on the camera so its horizon stays level wherever it goes.
  useFrame(() => dome.current?.position.copy(camera.position));

  if (sun?.active) {
    const alt = sun.position.altitude;
    const day = daylight(alt);
    const fog = new THREE.Color("#2b3550").lerp(new THREE.Color("#dbe3ea"), day.sky).lerp(new THREE.Color("#f0c8a0"), day.warmth * day.sun * 0.6);
    return (
      <>
        <Sky distance={400} sunPosition={sun.vector} turbidity={5} rayleigh={alt > 0 ? 1.4 : 2.5} mieCoefficient={0.004} mieDirectionalG={0.85} />
        <fog attach="fog" args={[fog, 140, 420]} />
      </>
    );
  }
  return (
    <>
      <mesh ref={dome} material={backdrop} renderOrder={-1000} frustumCulled={false}>
        <sphereGeometry args={[300, 32, 16]} />
      </mesh>
      <fog attach="fog" args={[BACKDROP_HORIZON, 140, 420]} />
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
    el.current = gl.domElement.closest(".viewer");
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
