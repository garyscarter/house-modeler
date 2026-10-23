import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Floor, HouseModel, Photo, Room, VariantKey } from "../types";
import { House } from "./House";
import { modelBounds } from "../lib/geometry";
import { useSite, useStore } from "../store";
import { easeInOut, homeView, presetView, type CameraPose, type FrameBox, type ViewRequest, type ViewSide } from "../lib/cameraViews";
import { ViewCube } from "./ViewCube";
import { Lighting, SkyBackdrop } from "./Lighting";
import { GROUND_Y, SiteScene } from "./Site";
import { CaptureBridge } from "./capture";
import { Effects } from "./Effects";
import { SunControls } from "../components/SunControls";
import { ViewedVariant } from "./viewedVariant";
import { SiteDiff } from "./SiteDiff";

interface ViewerProps {
  model: HouseModel;
  ghost?: HouseModel;
  photos: Photo[];
  showLabels: boolean;
  showCeilings: boolean;
  doorsOpen?: boolean;
  selectedRoomId: string | null;
  onSelectRoom: (floor: Floor, room: Room) => void;
  title?: string;
  maxLevel?: number | null;
  showExterior?: boolean;
  /** Identifier used by exports to find this viewer's renderer. */
  captureId?: string;
  /** The layout this view shows; its plot, sun and lighting follow it. Defaults to the active one. */
  variant?: VariantKey;
  /** The layout `ghost` comes from, so the overlay can mark plot boundary changes. */
  ghostVariant?: VariantKey;
}

export function Viewer(props: ViewerProps) {
  const { model, ghost, photos, showLabels, showCeilings, doorsOpen, selectedRoomId, onSelectRoom, title, maxLevel, showExterior, captureId, variant, ghostVariant } = props;
  const bounds = useMemo(() => modelBounds([...model.floors, ...(ghost?.floors ?? [])]), [model, ghost]);
  const centre = useMemo(
    () => new THREE.Vector3((bounds.x0 + bounds.x1) / 2, 1, (bounds.y0 + bounds.y1) / 2),
    [bounds],
  );
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

  return (
    <ViewedVariant.Provider value={variant}>
    <div className="viewer">
      {title && <div className="viewer-title">{title}</div>}
      <ViewCube onView={(side) => setView({ id: Date.now(), side })} />
      <SunControls />
      <Canvas
        shadows="percentage"
        dpr={DPR[quality]}
        camera={{ position: [centre.x + size * 0.9, size * 0.9, centre.z + size * 0.9], fov: 45, near: 0.05, far: 500 }}
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
          visibleLevels={visibleLevels}
          diffAgainst={ghost}
          showExterior={!!showExterior && cap === null}
        />
        {ghost && <House model={ghost} photos={[]} ghost showLabels={false} diffAgainst={model} visibleLevels={visibleLevels} />}
        <SiteScene centre={centre} size={size} model={model} />
        {ghost && variant && ghostVariant && <SiteDiff variant={variant} other={ghostVariant} />}
        <ContactShadows position={[centre.x, GROUND_Y - 0.01, centre.z]} scale={size * 3} blur={2} opacity={0.35} far={20} />
        <CaptureBridge id={captureId ?? "main"} />
        <Effects />
        <Orbit centre={centre} size={size} view={view} bounds={bounds} frame={frame} />
      </Canvas>
    </div>
    </ViewedVariant.Provider>
  );
}

/** Device pixel ratio range per render quality; phones on "low" render at 1x. */
const DPR: Record<"high" | "balanced" | "low", [number, number]> = { high: [1, 2], balanced: [1, 1.5], low: [1, 1] };

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

function Orbit({
  centre,
  size,
  view,
  bounds,
  frame,
}: {
  centre: THREE.Vector3;
  size: number;
  view: { id: number; side: ViewRequest } | null;
  bounds: { x0: number; x1: number; y0: number; y1: number };
  frame: FrameBox;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const canvasSize = useThree((s) => s.size);
  const controls = useRef<OrbitControlsImpl>(null);
  const glide = useRef<Glide | null>(null);
  const first = useRef(true);
  const lastYaw = useRef(NaN);
  const aspect = canvasSize.width && canvasSize.height ? canvasSize.width / canvasSize.height : 1.6;
  const latest = useRef({ aspect, frame, bounds, size, centre });
  latest.current = { aspect, frame, bounds, size, centre };

  const poseFor = (side: ViewRequest): CameraPose => {
    const l = latest.current;
    return side === "home" ? homeView(l.frame, camera.fov, l.aspect) : presetView(side, l.bounds, l.size, { x: l.centre.x, y: l.centre.y, z: l.centre.z });
  };
  const jump = (pose: CameraPose) => {
    camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    controls.current?.target.set(pose.target.x, pose.target.y, pose.target.z);
    camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
    controls.current?.update();
  };
  const spherical = (pose: CameraPose) => ({
    target: new THREE.Vector3(pose.target.x, pose.target.y, pose.target.z),
    offset: new THREE.Spherical().setFromVector3(new THREE.Vector3(pose.position.x - pose.target.x, pose.position.y - pose.target.y, pose.position.z - pose.target.z)),
  });

  // Open on a good view: the whole house and plot from the front three-quarter.
  useEffect(() => {
    if (!first.current) return;
    first.current = false;
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
    }
    // Camera azimuth around the house (0 = in front, 90 = on the +x side) for the view cube's faces.
    const e = camera.matrixWorld.elements;
    const yaw = (Math.atan2(-(e[4] - e[8]), -(e[6] - e[10])) * 180) / Math.PI;
    if (viewer.current && !(Math.abs(yaw - lastYaw.current) <= 0.2)) {
      lastYaw.current = yaw;
      viewer.current.style.setProperty("--view-yaw", yaw.toFixed(1));
    }
  });

  return (
    <OrbitControls ref={controls} target={centre} makeDefault maxPolarAngle={Math.PI / 2 - 0.02} minDistance={1.5} maxDistance={Math.max(size * 6, 60)} />
  );
}
