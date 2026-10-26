import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Floor, HouseModel, Photo, Room, VariantKey } from "../types";
import { House } from "./House";
import { modelBounds, type V2 } from "../lib/geometry";
import { useStore } from "../store";
import { STICKY_MS, wheelClassifier, wheelPixels, wheelZoomFactor } from "../lib/wheelGesture";
import { depthOf, dollyStep } from "../lib/wheelDolly";
import { usePanelPrefs } from "../components/panelPrefs";
import { easeInOut, frameFor, homeView, INSPECTOR_INSET_PX, isValidPose, poseFits, presetView, type CameraPose, type FrameBox, type ViewRequest, type ViewSide } from "../lib/cameraViews";
import { houseHeight } from "../lib/viewFraming";
import { ViewCube } from "./ViewCube";
import { requestView } from "./viewRequest";
import { ContextMenu, type MenuState } from "../components/ContextMenu";
import { lastPose, publishPose, subscribePose } from "./cameraLink";
import { loadCameraPose, saveCameraPose } from "./cameraPose";
import { Lighting, SkyBackdrop } from "./Lighting";
import { SiteScene } from "./Site";
import { CaptureBridge } from "./capture";
import { SunControls } from "../components/SunControls";
import { ViewedVariant } from "./viewedVariant";
import { SiteDiff } from "./SiteDiff";
import { FrameOnCommit, Precompile, ShadowUpdates, TrackScene } from "./frameLoop";
import { Loader } from "../components/Loader";
import "./Viewer.css";

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
  /** False while the 3D view is kept mounted but hidden (another tab or mode): nothing renders or updates. */
  active?: boolean;
  /** Show the title, view cube and sun panel (default). Off, the owner of the layout (the wipe) draws them once. */
  chrome?: boolean;
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
  const { model, ghost, photos, showLabels, showCeilings, doorsOpen, selectedRoomId, onSelectRoom, onPickWall, title, maxLevel, showExterior, captureId, variant, ghostVariant, active = true, chrome = true } = props;
  // Subscribed only while shown: a store subscription would re-render this hidden view on every plan edit, memo or not.
  const liveVariants = useStore((s) => (active ? s.variants : null));
  const seenVariants = useRef(liveVariants ?? useStore.getState().variants);
  if (liveVariants) seenVariants.current = liveVariants;
  const variants = seenVariants.current;
  // Both layouts and both plots frame the same camera, so As listed and Proposed open on one view.
  const framed = useMemo(() => {
    const list: HouseModel[] = [];
    for (const m of [variants.current, variants.proposed, model, ghost]) if (m && !list.includes(m)) list.push(m);
    return list;
  }, [variants, model, ghost]);
  const raw = useMemo(() => modelBounds(framed.flatMap((m) => m.floors)), [framed]);
  // Keyed on the numbers, so an edit that doesn't move the outline keeps the same objects.
  const bounds = useMemo(() => ({ x0: raw.x0, x1: raw.x1, y0: raw.y0, y1: raw.y1, w: raw.w, h: raw.h }), [raw.x0, raw.x1, raw.y0, raw.y1, raw.w, raw.h]);
  const centre = useMemo(() => new THREE.Vector3((bounds.x0 + bounds.x1) / 2, 1, (bounds.y0 + bounds.y1) / 2), [bounds]);
  const size = Math.max(bounds.w, bounds.h, 6);
  const quality = useStore((s) => s.settings.quality);
  const cap = maxLevel ?? null;
  const levels = [...new Set([...model.floors, ...(ghost?.floors ?? [])].map((f) => f.level))];
  const visibleLevels = cap === null ? null : levels.filter((l) => l <= cap);
  // What the opening view frames: both houses with their roofs.
  const frame = useMemo<FrameBox>(() => frameFor(framed), [framed]);
  // The elevation presets frame the house's real height (ridge included); worked out when a preset is chosen, not on every edit.
  const heightOf = useCallback(() => Math.max(houseHeight(model), ghost ? houseHeight(ghost) : 0), [model, ghost]);

  // Frames are drawn on demand, and held until the shaders for this quality have compiled.
  const [compiled, setCompiled] = useState<string | null>(null);
  // A lost WebGL context (GPU reset, too many contexts) remounts the canvas, which rebuilds the renderer from the scene.
  const [canvasKey, setCanvasKey] = useState(0);
  const [lost, setLost] = useState(false);
  const restoreTimer = useRef(0);
  const restore = useCallback(() => {
    window.clearTimeout(restoreTimer.current);
    setLost(false);
    setCompiled(null);
    setCanvasKey((k) => k + 1);
  }, []);
  useEffect(() => () => window.clearTimeout(restoreTimer.current), []);
  const frameloop = active && compiled === quality ? "demand" : "never";
  const before = useCallback(() => (quality === "high" ? loadEffects() : Promise.resolve()), [quality]);

  // Right-click menu on a room. The handler is kept stable (it reads the latest props through a ref) so floors stay memoised.
  const [menu, setMenu] = useState<MenuState | null>(null);
  const live = useRef({ variant, onSelectRoom });
  live.current = { variant, onSelectRoom };
  const openRoomMenu = useCallback((floor: Floor, room: Room, x: number, y: number) => {
    const st = useStore.getState;
    const { variant: v, onSelectRoom: select } = live.current;
    const first = () => {
      if (v && st().activeVariant !== v) st().setUi({ activeVariant: v });
    };
    setMenu({
      x,
      y,
      items: [
        {
          label: "Select",
          run: () => {
            first();
            select(floor, room);
          },
        },
        {
          label: "Edit on the plan",
          run: () => {
            first();
            if (st().mode !== "build" && st().mode !== "decorate") st().setMode("build");
            st().setUi({ tab: "plan", editFloorId: floor.id, selectedRoomId: room.id });
          },
        },
        {
          label: "Decorate this room",
          run: () => {
            first();
            st().setMode("decorate");
            st().setUi({ selectedRoomId: room.id, editFloorId: floor.id });
          },
        },
        "sep",
        { label: "Show up to this floor", run: () => st().setUi({ maxLevel: floor.level, editFloorId: floor.id }) },
        { label: "Look from above", run: () => requestView("top") },
      ],
    });
  }, []);

  return (
    <ViewedVariant.Provider value={variant}>
    <div className="viewer">
      {chrome && title && <div className="viewer-title">{title}</div>}
      {chrome && <ViewCube />}
      {/* One sun drives both views, so side by side (captureId "proposed" is its right-hand view) shows a single panel. */}
      {chrome && captureId !== "proposed" && <SunControls />}
      {(compiled === null || lost) && (
        <div className="viewer-loading" role="status">
          <Loader kind="blueprint" size={40} />
          {lost ? "Restoring the 3D view" : "Preparing the 3D view"}
        </div>
      )}
      <Canvas
        key={canvasKey}
        shadows="percentage"
        gl={{ toneMapping: THREE.NeutralToneMapping }}
        frameloop={frameloop}
        dpr={DPR[quality]}
        camera={{ position: [centre.x + size * 0.9, size * 0.9, centre.z + size * 0.9], fov: 45, near: 0.1, far: 500 }}
        onCreated={({ gl }) => {
          // Checking every program's log stalls on each link; only worth it while developing.
          gl.debug.checkShaderErrors = import.meta.env.DEV;
          gl.shadowMap.autoUpdate = false;
          const el = gl.domElement;
          el.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
            setLost(true);
            window.clearTimeout(restoreTimer.current);
            restoreTimer.current = window.setTimeout(restore, 2000);
          });
          // The canvas is replaced on restore, so these listeners go with the old element.
          el.addEventListener("webglcontextrestored", restore);
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
          onContextRoom={openRoomMenu}
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
        <ShadowUpdates deps={[model, ghost, showCeilings, doorsOpen, visibleLevels?.join(), showExterior, quality, photos]} />
        <Precompile token={quality} before={before} onDone={setCompiled} />
        <Orbit linkId={captureId ?? "main"} centre={centre} size={size} bounds={bounds} frame={frame} heightOf={heightOf} />
        <TrackScene />
        <FrameOnCommit />
      </Canvas>
      <ContextMenu menu={menu} onClose={() => setMenu(null)} />
    </div>
    </ViewedVariant.Provider>
  );
}

/**
 * Device pixel ratio range per render quality; "low" renders at 1x.
 * "high" runs the post-processing composer, whose passes scale with the
 * pixel count, so it stops at 1.5x like "balanced".
 */
const DPR: Record<"high" | "balanced" | "low", [number, number]> = { high: [1, 1.5], balanced: [1, 1.5], low: [1, 1] };

export type { ViewSide };

const GLIDE_MS = 650;
/** How much of the drag the camera catches up each frame. The controls' 0.05 trails the pointer and coasts for about 1.5 s after
 *  release, which reads as drift; this settles in about half a second and still eases out. */
const DAMPING = 0.12;

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

interface Glide {
  t0: number;
  from: { target: THREE.Vector3; offset: THREE.Spherical };
  to: { target: THREE.Vector3; offset: THREE.Spherical };
}

/**
 * Orbit controls, the opening view and the preset glides. The camera is placed once, when the view opens (on the
 * last camera if there is one), and then only by the user, a preset or a linked view: edits to the house leave it alone.
 */
function Orbit({
  linkId,
  centre,
  size,
  bounds,
  frame,
  heightOf,
}: {
  /** Names this view on the camera link; other views follow its camera. */
  linkId: string;
  centre: THREE.Vector3;
  size: number;
  bounds: { x0: number; x1: number; y0: number; y1: number };
  frame: FrameBox;
  heightOf: () => number;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const canvasSize = useThree((s) => s.size);
  const controls = useRef<OrbitControlsImpl>(null);
  const glide = useRef<Glide | null>(null);
  const first = useRef(true);
  /** True while this view is applying a pose it was handed, so its own change event isn't sent back out. */
  const applying = useRef(false);
  const saveTimer = useRef(0);
  /** The pose waiting to be saved, so an unmount inside the debounce still saves it. */
  const unsaved = useRef<CameraPose | null>(null);
  const lastYaw = useRef(NaN);
  /** After a drag ends, until the controls' damping has run down; then whatever momentum is left is dropped. */
  const coasting = useRef(false);
  /** Did the controls move the camera during this frame? */
  const moved = useRef(false);
  const aspect = canvasSize.width && canvasSize.height ? canvasSize.width / canvasSize.height : 1.6;
  const maxDistance = Math.max(size * 6, 60);
  const latest = useRef({ aspect, frame, bounds, size, centre, heightOf, maxDistance });
  latest.current = { aspect, frame, bounds, size, centre, heightOf, maxDistance };

  /** Width of the canvas the floating inspector card covers, if it is open over this view. */
  // The dock (about 44 px) plus its 16 px gap plus breathing room covers the bottom of the canvas.
  const DOCK_INSET_PX = 88;
  const coveredRight = () => (gl.domElement.closest("main")?.querySelector(".inspector-card") ? INSPECTOR_INSET_PX : 0);
  const poseFor = (side: ViewRequest): CameraPose => {
    const l = latest.current;
    return side === "home"
      ? homeView(l.frame, camera.fov, l.aspect, undefined, undefined, undefined, coveredRight(), canvasSize.width, DOCK_INSET_PX, canvasSize.height)
      : presetView(side, l.bounds, l.size, { x: l.centre.x, y: l.centre.y, z: l.centre.z }, { height: l.heightOf(), fovDeg: camera.fov, aspect: l.aspect });
  };
  const current = (): CameraPose => {
    const t = controls.current?.target ?? centre;
    return { position: { x: camera.position.x, y: camera.position.y, z: camera.position.z }, target: { x: t.x, y: t.y, z: t.z } };
  };
  /**
   * Drop any momentum left from this view's own last drag: with damping, update() would keep adding it after a
   * jump or glide, and two linked views coasting at once would hand the camera back and forth.
   */
  const dropMomentum = () => {
    const c = controls.current;
    if (c?.enableDamping) {
      c.enableDamping = false;
      c.update();
      c.enableDamping = true;
    }
  };
  /** Move the camera without announcing it. */
  const jump = (pose: CameraPose) => {
    applying.current = true;
    try {
      dropMomentum();
      camera.position.set(pose.position.x, pose.position.y, pose.position.z);
      controls.current?.target.set(pose.target.x, pose.target.y, pose.target.z);
      camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
      controls.current?.update();
      invalidate();
    } finally {
      applying.current = false;
    }
  };
  const spherical = (pose: CameraPose) => ({
    target: new THREE.Vector3(pose.target.x, pose.target.y, pose.target.z),
    offset: new THREE.Spherical().setFromVector3(new THREE.Vector3(pose.position.x - pose.target.x, pose.position.y - pose.target.y, pose.position.z - pose.target.z)),
  });
  /** Remember the pose for next time, debounced (damping keeps moving the camera after a drag ends). */
  const remember = (p: CameraPose) => {
    unsaved.current = p;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      unsaved.current = null;
      saveCameraPose(p);
    }, 300);
  };
  /** Tell the other views, and remember the pose. */
  const settle = () => {
    const p = current();
    publishPose(linkId, p);
    remember(p);
  };
  const startGlide = (pose: CameraPose) => {
    const c = controls.current;
    if (!c || reducedMotion()) {
      glide.current = null;
      jump(pose);
      settle();
      return;
    }
    applying.current = true;
    try {
      dropMomentum();
    } finally {
      applying.current = false;
    }
    glide.current = { t0: performance.now(), from: spherical(current()), to: spherical(pose) };
    invalidate();
  };

  // Open on the last camera (this session, then the last visit), else a good view of the whole house and plot.
  // Waits for a real canvas size so the home view is fitted to the right aspect.
  useEffect(() => {
    if (!first.current || canvasSize.width <= 0 || canvasSize.height <= 0 || !controls.current) return;
    first.current = false;
    // A remembered pose must suit this house: one saved for another house or plot opens on home instead.
    const l = latest.current;
    const fits = (p: CameraPose | null) => (p && poseFits(p, l.frame, l.maxDistance) ? p : null);
    jump(fits(lastPose()) ?? fits(loadCameraPose()) ?? poseFor("home"));
    publishPose(linkId, current());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasSize.width, canvasSize.height]);

  // Every linked view glides to a requested side, and follows another view's camera.
  useEffect(() => {
    const onView = (e: Event) => {
      const detail = (e as CustomEvent<{ side?: ViewRequest; pose?: unknown }>).detail;
      if (detail?.pose !== undefined) {
        if (isValidPose(detail.pose)) startGlide({ position: { ...detail.pose.position }, target: { ...detail.pose.target } });
      } else if (detail?.side) startGlide(poseFor(detail.side));
    };
    window.addEventListener("house:view", onView);
    const off = subscribePose((from, pose) => {
      if (from === linkId) return;
      // Another view moved: it is being dragged, or its glide (started by the same request as ours) has just ended.
      // Either way it wins, so a drag in one view stops a glide in the others rather than being yanked back by it.
      glide.current = null;
      first.current = false;
      jump(pose);
    });
    return () => {
      window.removeEventListener("house:view", onView);
      off();
      window.clearTimeout(saveTimer.current);
      if (unsaved.current) saveCameraPose(unsaved.current);
      unsaved.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkId]);

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const cancel = () => {
      glide.current = null;
      coasting.current = false;
    };
    const onEnd = () => {
      coasting.current = true;
      settle();
    };
    const onChange = () => {
      moved.current = true;
      if (applying.current || glide.current) return;
      const p = current();
      publishPose(linkId, p);
      remember(p);
    };
    c.addEventListener("start", cancel);
    c.addEventListener("change", onChange);
    c.addEventListener("end", onEnd);
    return () => {
      c.removeEventListener("start", cancel);
      c.removeEventListener("change", onChange);
      c.removeEventListener("end", onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkId]);

  // A trackpad two-finger swipe pans the view across the screen; a pinch or a mouse wheel zooms towards what is
  // under the cursor. Both are handled here, in the capture phase on the canvas's parent, so OrbitControls never
  // sees a wheel: its own zoom moves a fixed 5 % an event whatever the event's size (a Windows mouse sends one
  // event a notch, a Mac or a trackpad many), towards its target wherever that is (so how close it could get
  // depended on where the last pan or preset had left the target).
  useEffect(() => {
    const host = gl.domElement.parentElement;
    if (!host) return;
    const intentOf = wheelClassifier(() => usePanelPrefs.getState().wheel);
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    const forward = new THREE.Vector3();
    const ndc = new THREE.Vector2();
    const ray = new THREE.Raycaster();
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hitPoint = new THREE.Vector3();
    /** The zoom gesture in progress: when its last event came, and the world point it zooms towards (null: the sky). */
    let zoom: { at: number; anchor: THREE.Vector3 | null } | null = null;
    const shown = (o: THREE.Object3D | null) => {
      for (; o; o = o.parent) if (!o.visible) return false;
      return true;
    };
    /** What is under the cursor: the nearest shown object, else the ground plane, else nothing (the sky). */
    const under = (): THREE.Vector3 | null => {
      const hit = ray.intersectObjects(scene.children, true).find((h) => h.distance > camera.near && shown(h.object));
      if (hit) return hit.point.clone();
      return ray.ray.intersectPlane(ground, hitPoint) ? hitPoint.clone() : null;
    };
    const onWheel = (e: WheelEvent) => {
      const c = controls.current;
      if (!c) return;
      const intent = intentOf(e, e.timeStamp);
      e.preventDefault();
      e.stopPropagation();
      glide.current = null;
      const { dx, dy } = wheelPixels(e);
      if (intent === "pan") {
        zoom = null;
        // The same scale as OrbitControls' own pan: a swipe the height of the canvas moves one view height at the target.
        const h = gl.domElement.clientHeight || 1;
        const reach = (2 * camera.position.distanceTo(c.target) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / h;
        right.setFromMatrixColumn(camera.matrix, 0).multiplyScalar(dx * reach);
        up.setFromMatrixColumn(camera.matrix, 1).multiplyScalar(-dy * reach);
        right.add(up);
        camera.position.add(right);
        c.target.add(right);
        c.update();
        return;
      }
      const rect = gl.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - rect.left) / (rect.width || 1)) * 2 - 1, -((e.clientY - rect.top) / (rect.height || 1)) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      // A gesture finds what is under the cursor once, on its first event, and every event of it zooms towards that.
      if (!zoom || e.timeStamp - zoom.at >= STICKY_MS) zoom = { at: 0, anchor: under() };
      zoom.at = e.timeStamp;
      camera.getWorldDirection(forward);
      const depth = zoom.anchor ? depthOf(camera.position, forward, zoom.anchor) : camera.position.distanceTo(c.target);
      const next = dollyStep(camera.position, forward, ray.ray.direction, depth, wheelZoomFactor(dy, e.ctrlKey), c.minDistance, c.maxDistance);
      camera.position.set(next.position.x, next.position.y, next.position.z);
      c.target.set(next.target.x, next.target.y, next.target.z);
      c.update();
    };
    host.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => host.removeEventListener("wheel", onWheel, { capture: true });
  }, [gl, camera, scene]);

  // Dev builds expose the camera and controls (like window.__houseStore) for the Playwright checks.
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { __houseCamera: { camera, controls: controls.current }, __houseRenderer: gl });
  }, [camera, gl]);

  const tmp = useMemo(() => ({ off: new THREE.Spherical(), v: new THREE.Vector3(), t: new THREE.Vector3() }), []);
  const viewer = useRef<HTMLElement | null>(null);
  useEffect(() => {
    // The wipe has one view cube for both canvases, so it carries the yaw.
    viewer.current = gl.domElement.closest(".wipe") ?? gl.domElement.closest(".viewer");
  }, [gl]);
  useFrame(() => {
    const g = glide.current;
    const c = controls.current;
    // The controls stop asking for frames once a coast slows below a millimetre a frame, but keep the rest of the
    // momentum, so any later redraw (a hover, a save, a shadow update) would nudge the camera on. Drop it then.
    // (This runs after the controls' own update, which drei schedules first.)
    if (coasting.current && !moved.current && !g) {
      coasting.current = false;
      dropMomentum();
    }
    moved.current = false;
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
      } else invalidate();
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

  return (
    <OrbitControls ref={controls} makeDefault dampingFactor={DAMPING} maxPolarAngle={Math.PI / 2 - 0.02} minDistance={1.5} maxDistance={maxDistance} />
  );
}
