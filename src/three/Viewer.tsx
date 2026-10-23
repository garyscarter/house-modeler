import { lazy, memo, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Floor, HouseModel, Photo, Room, VariantKey } from "../types";
import { House } from "./House";
import { modelBounds, type V2 } from "../lib/geometry";
import { useSite, useStore } from "../store";
import { easeInOut, homeView, presetView, type CameraPose, type FrameBox, type ViewRequest, type ViewSide } from "../lib/cameraViews";
import { houseHeight } from "../lib/viewFraming";
import { ViewCube } from "./ViewCube";
import { Lighting, SkyBackdrop } from "./Lighting";
import { SiteScene } from "./Site";
import { CaptureBridge } from "./capture";
import { SunControls } from "../components/SunControls";
import { ViewedVariant } from "./viewedVariant";
import { SiteDiff } from "./SiteDiff";
import { Precompile, ShadowUpdates } from "./frameLoop";

interface ViewerProps {
  model: HouseModel;
  ghost?: HouseModel;
  photos: Photo[];
  showLabels: boolean;
  showCeilings: boolean;
  doorsOpen?: boolean;
  selectedRoomId: string | null;
  onSelectRoom: (floor: Floor, room: Room) => void;
  /** Decorate: a tap on a wall face, with the hit point and the face's normal in the plan frame (world x, z). */
  onPickWall?: (floor: Floor, hit: V2, normal: V2, bays?: { id: string; poly: V2[] }[]) => void;
  title?: string;
  maxLevel?: number | null;
  showExterior?: boolean;
  /** Identifier used by exports to find this viewer's renderer. */
  captureId?: string;
  /** The layout this view shows; its plot, sun and lighting follow it. Defaults to the active one. */
  variant?: VariantKey;
  /** The layout `ghost` comes from, so the overlay can mark plot boundary changes. */
  ghostVariant?: VariantKey;
  /** False while the 3D view is kept mounted but hidden (another tab or mode): nothing renders or updates. */
  active?: boolean;
}

/** Post-processing (and its libraries) load only when "high" quality turns it on. */
const loadEffects = () => import("./Effects");
const Effects = lazy(() => loadEffects().then((m) => ({ default: m.Effects })));

/**
 * The 3D view. While hidden (`active` false) it keeps its WebGL context,
 * compiled shaders and textures but skips React updates, so plan edits
 * don't rebuild a scene nobody can see; it catches up when shown again.
 */
export const Viewer = memo(ViewerImpl, (prev, next) => prev.active === false && next.active === false);

function ViewerImpl(props: ViewerProps) {
  const { model, ghost, photos, showLabels, showCeilings, doorsOpen, selectedRoomId, onSelectRoom, onPickWall, title, maxLevel, showExterior, captureId, variant, ghostVariant, active = true } = props;
  const raw = useMemo(() => modelBounds([...model.floors, ...(ghost?.floors ?? [])]), [model, ghost]);
  // Keyed on the numbers, so an edit that doesn't move the outline keeps the same objects.
  const bounds = useMemo(() => ({ x0: raw.x0, x1: raw.x1, y0: raw.y0, y1: raw.y1, w: raw.w, h: raw.h }), [raw.x0, raw.x1, raw.y0, raw.y1, raw.w, raw.h]);
  const centre = useMemo(() => new THREE.Vector3((bounds.x0 + bounds.x1) / 2, 1, (bounds.y0 + bounds.y1) / 2), [bounds]);
  const size = Math.max(bounds.w, bounds.h, 6);
  const [view, setView] = useState<{ id: number; side: ViewRequest } | null>(null);
  const site = useSite(variant);
  const quality = useStore((s) => s.settings.quality);
  const cap = maxLevel ?? null;
  const levels = [...new Set([...model.floors, ...(ghost?.floors ?? [])].map((f) => f.level))];
  const visibleLevels = cap === null ? null : levels.filter((l) => l <= cap);
  // What the opening view frames: the house with its roof, and the plot if there is one.
  const frame = useMemo<FrameBox>(() => {
    const floors = [...model.floors, ...(ghost?.floors ?? [])];
    const top = floors.length ? Math.max(...floors.map((f) => f.level)) : 0;
    const height = (top + 1) * (model.ceilingHeight + model.slabThickness) + ROOF_ALLOWANCE;
    const box = { x0: bounds.x0, x1: bounds.x1, y0: bounds.y0, y1: bounds.y1 };
    for (const p of site?.boundary ?? []) {
      box.x0 = Math.min(box.x0, p.x);
      box.x1 = Math.max(box.x1, p.x);
      box.y0 = Math.min(box.y0, p.y);
      box.y1 = Math.max(box.y1, p.y);
    }
    return { ...box, height };
  }, [model, ghost, bounds, site]);
  // The elevation presets frame the house's real height (ridge included); worked out when a preset is chosen, not on every edit.
  const heightOf = useCallback(() => Math.max(houseHeight(model), ghost ? houseHeight(ghost) : 0), [model, ghost]);

  // Frames are drawn on demand, and held until the shaders for this quality have compiled.
  const [compiled, setCompiled] = useState<string | null>(null);
  const frameloop = active && compiled === quality ? "demand" : "never";
  const before = useCallback(() => (quality === "high" ? loadEffects() : Promise.resolve()), [quality]);

  return (
    <ViewedVariant.Provider value={variant}>
    <div className="viewer">
      {title && <div className="viewer-title">{title}</div>}
      <ViewCube onView={(side) => setView({ id: Date.now(), side })} />
      <SunControls />
      {compiled === null && <div className="viewer-loading">Preparing the 3D view…</div>}
      <Canvas
        shadows="percentage"
        gl={{ toneMapping: THREE.NeutralToneMapping }}
        frameloop={frameloop}
        dpr={DPR[quality]}
        camera={{ position: [centre.x + size * 0.9, size * 0.9, centre.z + size * 0.9], fov: 45, near: 0.1, far: 500 }}
        onCreated={({ gl }) => {
          // Checking every program's log stalls on each link; only worth it while developing.
          gl.debug.checkShaderErrors = import.meta.env.DEV;
          gl.shadowMap.autoUpdate = false;
        }}
        onPointerMissed={() => {}}
      >
        <SkyBackdrop />
        <Lighting centre={centre} size={size} />
        <House
          model={model}
          photos={photos}
          showLabels={showLabels}
          showCeilings={showCeilings}
          doorsOpen={doorsOpen}
          selectedRoomId={selectedRoomId}
          onSelectRoom={onSelectRoom}
          onPickWall={onPickWall}
          visibleLevels={visibleLevels}
          diffAgainst={ghost}
          showExterior={!!showExterior && cap === null}
        />
        {ghost && <House model={ghost} photos={[]} ghost showLabels={false} diffAgainst={model} visibleLevels={visibleLevels} />}
        <SiteScene centre={centre} size={size} model={model} />
        {ghost && variant && ghostVariant && <SiteDiff variant={variant} other={ghostVariant} />}
        {/* Hidden views are stale until shown again, so exports only see the visible ones. */}
        {active && <CaptureBridge id={captureId ?? "main"} />}
        {quality === "high" && (
          <Suspense fallback={null}>
            <Effects />
          </Suspense>
        )}
        <ShadowUpdates />
        <Precompile token={quality} before={before} onDone={setCompiled} />
        <Orbit centre={centre} size={size} view={view} bounds={bounds} frame={frame} heightOf={heightOf} />
      </Canvas>
    </div>
    </ViewedVariant.Provider>
  );
}

/**
 * Device pixel ratio range per render quality; phones on "low" render at 1x.
 * "high" runs the post-processing composer, whose passes scale with the
 * pixel count, so it stops at 1.5x like "balanced".
 */
const DPR: Record<"high" | "balanced" | "low", [number, number]> = { high: [1, 1.5], balanced: [1, 1.5], low: [1, 1] };

export type { ViewSide };

/** Allowance for the roof above the top storey when framing the house, metres. */
const ROOF_ALLOWANCE = 3.5;
const GLIDE_MS = 650;

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

interface Glide {
  t0: number;
  from: { target: THREE.Vector3; offset: THREE.Spherical };
  to: { target: THREE.Vector3; offset: THREE.Spherical };
}

/**
 * Orbit controls, the opening view and the preset glides. The camera and its
 * orbit target are placed once, when the view opens, and then only by the
 * user or a preset: edits to the house (which can move its centre) leave
 * them alone, so no `target` prop on the controls.
 */
function Orbit({
  centre,
  size,
  view,
  bounds,
  frame,
  heightOf,
}: {
  centre: THREE.Vector3;
  size: number;
  view: { id: number; side: ViewRequest } | null;
  bounds: { x0: number; x1: number; y0: number; y1: number };
  frame: FrameBox;
  heightOf: () => number;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const canvasSize = useThree((s) => s.size);
  const controls = useRef<OrbitControlsImpl>(null);
  const glide = useRef<Glide | null>(null);
  const lastYaw = useRef(NaN);
  const aspect = canvasSize.width && canvasSize.height ? canvasSize.width / canvasSize.height : 1.6;
  const latest = useRef({ aspect, frame, bounds, size, centre, heightOf });
  latest.current = { aspect, frame, bounds, size, centre, heightOf };

  const poseFor = (side: ViewRequest): CameraPose => {
    const l = latest.current;
    return side === "home"
      ? homeView(l.frame, camera.fov, l.aspect)
      : presetView(side, l.bounds, l.size, { x: l.centre.x, y: l.centre.y, z: l.centre.z }, { height: l.heightOf(), fovDeg: camera.fov, aspect: l.aspect });
  };
  const jump = (pose: CameraPose) => {
    camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    controls.current?.target.set(pose.target.x, pose.target.y, pose.target.z);
    camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
    controls.current?.update();
    invalidate();
  };
  const spherical = (pose: CameraPose) => ({
    target: new THREE.Vector3(pose.target.x, pose.target.y, pose.target.z),
    offset: new THREE.Spherical().setFromVector3(new THREE.Vector3(pose.position.x - pose.target.x, pose.position.y - pose.target.y, pose.position.z - pose.target.z)),
  });

  // Open on a good view: the whole house and plot from the front three-quarter. Once only.
  useLayoutEffect(() => {
    jump(poseFor("home"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Preset changes glide; dragging cancels the glide; reduced motion jumps.
  useEffect(() => {
    if (!view) return;
    const pose = poseFor(view.side);
    const c = controls.current;
    if (!c || reducedMotion()) {
      glide.current = null;
      jump(pose);
      return;
    }
    glide.current = {
      t0: performance.now(),
      from: spherical({ position: camera.position, target: c.target }),
      to: spherical(pose),
    };
    // Frames are on demand: start the glide; each glide frame asks for the next.
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const cancel = () => {
      glide.current = null;
    };
    c.addEventListener("start", cancel);
    return () => c.removeEventListener("start", cancel);
  }, []);

  const tmp = useMemo(() => ({ off: new THREE.Spherical(), v: new THREE.Vector3(), t: new THREE.Vector3() }), []);
  const viewer = useRef<HTMLElement | null>(null);
  useEffect(() => {
    viewer.current = gl.domElement.closest(".viewer");
  }, [gl]);
  useFrame(() => {
    const g = glide.current;
    const c = controls.current;
    if (g && c) {
      const k = easeInOut((performance.now() - g.t0) / GLIDE_MS);
      tmp.t.copy(g.from.target).lerp(g.to.target, k);
      // Turn the short way round the house.
      let dTheta = g.to.offset.theta - g.from.offset.theta;
      dTheta -= Math.round(dTheta / (2 * Math.PI)) * 2 * Math.PI;
      tmp.off.set(
        g.from.offset.radius + (g.to.offset.radius - g.from.offset.radius) * k,
        g.from.offset.phi + (g.to.offset.phi - g.from.offset.phi) * k,
        g.from.offset.theta + dTheta * k,
      );
      c.target.copy(tmp.t);
      camera.position.copy(tmp.t).add(tmp.v.setFromSpherical(tmp.off));
      c.update();
      if (k >= 1) glide.current = null;
      else invalidate();
    }
    // Camera azimuth around the house (0 = in front, 90 = on the +x side) for the view cube's faces.
    // Frames are on demand, so read this frame's camera, not the last one's.
    camera.updateMatrixWorld();
    const e = camera.matrixWorld.elements;
    const yaw = (Math.atan2(-(e[4] - e[8]), -(e[6] - e[10])) * 180) / Math.PI;
    if (viewer.current && !(Math.abs(yaw - lastYaw.current) <= 0.2)) {
      lastYaw.current = yaw;
      viewer.current.style.setProperty("--view-yaw", yaw.toFixed(1));
    }
  });

  return <OrbitControls ref={controls} makeDefault maxPolarAngle={Math.PI / 2 - 0.02} minDistance={1.5} maxDistance={Math.max(size * 6, 60)} />;
}
