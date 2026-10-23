import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Floor, HouseModel, Photo, Room, VariantKey } from "../types";
import { House } from "./House";
import { modelBounds, type V2 } from "../lib/geometry";
import { useStore } from "../store";
import { siteOf } from "../lib/sites";
import { easeInOut, frameFor, homeView, presetView, type CameraPose, type FrameBox, type ViewRequest, type ViewSide } from "../lib/cameraViews";
import { ViewCube, requestView } from "./ViewCube";
import { ContextMenu, type MenuState } from "../components/ContextMenu";
import { lastPose, publishPose, subscribePose } from "./cameraLink";
import { loadCameraPose, saveCameraPose } from "./cameraPose";
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
  /** Decorate: a click on a wall face, with the hit point and the face's normal in the plan frame (world x, z). */
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
  /** Show the title, view cube and sun panel (default). Off, the owner of the layout (the wipe) draws them once. */
  chrome?: boolean;
}

export function Viewer(props: ViewerProps) {
  const { model, ghost, photos, showLabels, showCeilings, doorsOpen, selectedRoomId, onSelectRoom, onPickWall, title, maxLevel, showExterior, captureId, variant, ghostVariant, chrome = true } = props;
  const variants = useStore((s) => s.variants);
  const sites = useStore((s) => s.sites);
  // Both layouts and both plots frame the same camera, so As listed and Proposed open on one view.
  const framed = useMemo(() => {
    const list: HouseModel[] = [];
    for (const m of [variants.current, variants.proposed, model, ghost]) if (m && !list.includes(m)) list.push(m);
    return list;
  }, [variants, model, ghost]);
  const bounds = useMemo(() => modelBounds(framed.flatMap((m) => m.floors)), [framed]);
  const centre = useMemo(
    () => new THREE.Vector3((bounds.x0 + bounds.x1) / 2, 1, (bounds.y0 + bounds.y1) / 2),
    [bounds],
  );
  const size = Math.max(bounds.w, bounds.h, 6);
  const quality = useStore((s) => s.settings.quality);
  const cap = maxLevel ?? null;
  const levels = [...new Set([...model.floors, ...(ghost?.floors ?? [])].map((f) => f.level))];
  const visibleLevels = cap === null ? null : levels.filter((l) => l <= cap);
  // What the opening view frames: both houses with their roofs, and both plots.
  const frame = useMemo<FrameBox>(
    () => frameFor(framed, [siteOf(sites, "current"), siteOf(sites, "proposed")].flatMap((st) => (st?.boundary ? [st.boundary] : []))),
    [framed, sites],
  );

  const [menu, setMenu] = useState<MenuState | null>(null);
  const openRoomMenu = (floor: Floor, room: Room, x: number, y: number) => {
    const st = useStore.getState;
    const pick = () => {
      if (variant && st().activeVariant !== variant) st().setUi({ activeVariant: variant });
      onSelectRoom(floor, room);
    };
    setMenu({
      x,
      y,
      items: [
        { label: "Select", run: pick },
        {
          label: "Edit on the plan",
          run: () => {
            if (variant) st().setUi({ activeVariant: variant });
            if (st().mode !== "build" && st().mode !== "decorate") st().setMode("build");
            st().setUi({ tab: "plan", editFloorId: floor.id, selectedRoomId: room.id });
          },
        },
        {
          label: "Decorate this room",
          run: () => {
            if (variant) st().setUi({ activeVariant: variant });
            st().setMode("decorate");
            st().setUi({ selectedRoomId: room.id, editFloorId: floor.id });
          },
        },
        "sep",
        { label: "Show up to this floor", run: () => st().setUi({ maxLevel: floor.level, editFloorId: floor.id }) },
        { label: "Look from above", run: () => requestView("top") },
      ],
    });
  };

  return (
    <ViewedVariant.Provider value={variant}>
    <div className="viewer">
      {chrome && title && <div className="viewer-title">{title}</div>}
      {chrome && <ViewCube />}
      {/* One sun drives both views, so side by side (captureId "proposed" is its right-hand view) shows a single panel. */}
      {chrome && captureId !== "proposed" && <SunControls />}
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
          onContextRoom={openRoomMenu}
          onPickWall={onPickWall}
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
        <Orbit linkId={captureId ?? "main"} centre={centre} size={size} bounds={bounds} frame={frame} />
      </Canvas>
      <ContextMenu menu={menu} onClose={() => setMenu(null)} />
    </div>
    </ViewedVariant.Provider>
  );
}

/** Device pixel ratio range per render quality; "low" renders at 1x. */
const DPR: Record<"high" | "balanced" | "low", [number, number]> = { high: [1, 2], balanced: [1, 1.5], low: [1, 1] };

export type { ViewSide };

const GLIDE_MS = 650;

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

interface Glide {
  t0: number;
  from: { target: THREE.Vector3; offset: THREE.Spherical };
  to: { target: THREE.Vector3; offset: THREE.Spherical };
}

function Orbit({
  linkId,
  centre,
  size,
  bounds,
  frame,
}: {
  /** Names this view on the camera link; other views follow its camera. */
  linkId: string;
  centre: THREE.Vector3;
  size: number;
  bounds: { x0: number; x1: number; y0: number; y1: number };
  frame: FrameBox;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const canvasSize = useThree((s) => s.size);
  const controls = useRef<OrbitControlsImpl>(null);
  const glide = useRef<Glide | null>(null);
  const first = useRef(true);
  /** True while this view is applying a pose it was handed, so its own change event isn't sent back out. */
  const applying = useRef(false);
  const saveTimer = useRef(0);
  const lastYaw = useRef(NaN);
  const aspect = canvasSize.width && canvasSize.height ? canvasSize.width / canvasSize.height : 1.6;
  const latest = useRef({ aspect, frame, bounds, size, centre });
  latest.current = { aspect, frame, bounds, size, centre };

  const poseFor = (side: ViewRequest): CameraPose => {
    const l = latest.current;
    return side === "home" ? homeView(l.frame, camera.fov, l.aspect) : presetView(side, l.bounds, l.size, { x: l.centre.x, y: l.centre.y, z: l.centre.z });
  };
  const current = (): CameraPose => {
    const t = controls.current?.target ?? centre;
    return { position: { x: camera.position.x, y: camera.position.y, z: camera.position.z }, target: { x: t.x, y: t.y, z: t.z } };
  };
  /** Move the camera without announcing it. */
  const jump = (pose: CameraPose) => {
    applying.current = true;
    try {
      camera.position.set(pose.position.x, pose.position.y, pose.position.z);
      controls.current?.target.set(pose.target.x, pose.target.y, pose.target.z);
      camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
      controls.current?.update();
    } finally {
      applying.current = false;
    }
  };
  const spherical = (pose: CameraPose) => ({
    target: new THREE.Vector3(pose.target.x, pose.target.y, pose.target.z),
    offset: new THREE.Spherical().setFromVector3(new THREE.Vector3(pose.position.x - pose.target.x, pose.position.y - pose.target.y, pose.position.z - pose.target.z)),
  });
  /** Tell the other views, and remember the pose for next time (debounced). */
  const settle = () => {
    const p = current();
    publishPose(linkId, p);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => saveCameraPose(p), 300);
  };
  const startGlide = (pose: CameraPose) => {
    const c = controls.current;
    if (!c || reducedMotion()) {
      glide.current = null;
      jump(pose);
      settle();
      return;
    }
    glide.current = { t0: performance.now(), from: spherical(current()), to: spherical(pose) };
  };

  // Open on the last camera (this session, then the last visit), else a good view of the whole house and plot.
  // Waits for a real canvas size so the home view is fitted to the right aspect.
  useEffect(() => {
    if (!first.current || canvasSize.width <= 0 || canvasSize.height <= 0 || !controls.current) return;
    first.current = false;
    jump(lastPose() ?? loadCameraPose() ?? poseFor("home"));
    publishPose(linkId, current());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasSize.width, canvasSize.height]);

  // Every linked view glides to a requested side, and follows another view's camera.
  useEffect(() => {
    const onView = (e: Event) => {
      const side = (e as CustomEvent<{ side?: ViewRequest }>).detail?.side;
      if (side) startGlide(poseFor(side));
    };
    window.addEventListener("house:view", onView);
    const off = subscribePose((from, pose) => {
      if (from === linkId || glide.current) return;
      first.current = false;
      jump(pose);
    });
    return () => {
      window.removeEventListener("house:view", onView);
      off();
      window.clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkId]);

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const cancel = () => {
      glide.current = null;
    };
    const onChange = () => {
      if (applying.current || glide.current) return;
      publishPose(linkId, current());
    };
    c.addEventListener("start", cancel);
    c.addEventListener("change", onChange);
    c.addEventListener("end", settle);
    return () => {
      c.removeEventListener("start", cancel);
      c.removeEventListener("change", onChange);
      c.removeEventListener("end", settle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkId]);

  const tmp = useMemo(() => ({ off: new THREE.Spherical(), v: new THREE.Vector3(), t: new THREE.Vector3() }), []);
  const viewer = useRef<HTMLElement | null>(null);
  useEffect(() => {
    // The wipe has one view cube for both canvases, so it carries the yaw.
    viewer.current = gl.domElement.closest(".wipe") ?? gl.domElement.closest(".viewer");
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
      applying.current = true;
      c.target.copy(tmp.t);
      camera.position.copy(tmp.t).add(tmp.v.setFromSpherical(tmp.off));
      c.update();
      applying.current = false;
      if (k >= 1) {
        glide.current = null;
        settle();
      }
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
