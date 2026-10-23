import { lazy, memo, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Floor, HouseModel, Photo, Room, VariantKey } from "../types";
import { House } from "./House";
import { modelBounds } from "../lib/geometry";
import { useStore } from "../store";
import { Lighting, SkyBackdrop } from "./Lighting";
import { SiteScene } from "./Site";
import { CaptureBridge } from "./capture";
import { SunControls } from "../components/SunControls";
import { ViewedVariant } from "./viewedVariant";
import { SiteDiff } from "./SiteDiff";
import { Precompile, ShadowUpdates } from "./frameLoop";
import { elevationFraming, houseHeight } from "../lib/viewFraming";

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
  /** False while the 3D view is kept mounted but hidden (the Plan tab): nothing renders or updates. */
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
  const { model, ghost, photos, showLabels, showCeilings, doorsOpen, selectedRoomId, onSelectRoom, title, maxLevel, showExterior, captureId, variant, ghostVariant, active = true } = props;
  const raw = useMemo(() => modelBounds([...model.floors, ...(ghost?.floors ?? [])]), [model, ghost]);
  // Keyed on the numbers, so an edit that doesn't move the outline keeps the same objects.
  const bounds = useMemo(() => ({ x0: raw.x0, x1: raw.x1, y0: raw.y0, y1: raw.y1, w: raw.w, h: raw.h }), [raw.x0, raw.x1, raw.y0, raw.y1, raw.w, raw.h]);
  const centre = useMemo(() => new THREE.Vector3((bounds.x0 + bounds.x1) / 2, 1, (bounds.y0 + bounds.y1) / 2), [bounds]);
  const size = Math.max(bounds.w, bounds.h, 6);
  const [view, setView] = useState<{ id: number; side: ViewSide } | null>(null);
  const quality = useStore((s) => s.settings.quality);
  const cap = maxLevel ?? null;
  const levels = [...new Set([...model.floors, ...(ghost?.floors ?? [])].map((f) => f.level))];
  const visibleLevels = cap === null ? null : levels.filter((l) => l <= cap);
  // Elevation presets frame the house's height; worked out when a button is pressed, not on every edit.
  const heightOf = useCallback(() => Math.max(houseHeight(model), ghost ? houseHeight(ghost) : 0), [model, ghost]);

  // Frames are drawn on demand, and held until the shaders for this quality have compiled.
  const [compiled, setCompiled] = useState<string | null>(null);
  const frameloop = active && compiled === quality ? "demand" : "never";
  const before = useCallback(() => (quality === "high" ? loadEffects() : Promise.resolve()), [quality]);

  return (
    <ViewedVariant.Provider value={variant}>
    <div className="viewer">
      {title && <div className="viewer-title">{title}</div>}
      <div className="view-buttons">
        {(["front", "rear", "left", "right", "top"] as ViewSide[]).map((side) => (
          <button key={side} onClick={() => setView({ id: Date.now(), side })} title={`Look at the ${side}`}>
            {side}
          </button>
        ))}
      </div>
      <SunControls />
      {compiled === null && <div className="viewer-loading">Preparing the 3D view…</div>}
      <Canvas
        shadows="percentage"
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
          visibleLevels={visibleLevels}
          diffAgainst={ghost}
          showExterior={!!showExterior && cap === null}
        />
        {ghost && <House model={ghost} photos={[]} ghost showLabels={false} diffAgainst={model} visibleLevels={visibleLevels} />}
        <SiteScene centre={centre} size={size} model={model} />
        {ghost && variant && ghostVariant && <SiteDiff variant={variant} other={ghostVariant} />}
        <CaptureBridge id={captureId ?? "main"} />
        {quality === "high" && (
          <Suspense fallback={null}>
            <Effects />
          </Suspense>
        )}
        <ShadowUpdates />
        <Precompile token={quality} before={before} onDone={setCompiled} />
        <Orbit centre={centre} size={size} view={view} bounds={bounds} heightOf={heightOf} />
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

export type ViewSide = "front" | "rear" | "left" | "right" | "top";

interface Bounds {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  w: number;
  h: number;
}

/**
 * Orbit controls plus the view buttons. The camera and its orbit target are
 * placed once, when the view opens, and then only by the user or a view
 * button: edits to the house (which can move its centre) leave them alone.
 */
function Orbit({
  centre,
  size,
  view,
  bounds,
  heightOf,
}: {
  centre: THREE.Vector3;
  size: number;
  view: { id: number; side: ViewSide } | null;
  bounds: Bounds;
  heightOf: () => number;
}) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const controls = useRef<OrbitControlsImpl>(null);
  const latest = useRef({ centre, size, bounds, heightOf });
  latest.current = { centre, size, bounds, heightOf };

  useLayoutEffect(() => {
    const { centre, size } = latest.current;
    camera.position.set(centre.x + size * 0.9, size * 0.9, centre.z + size * 0.9);
    controls.current?.target.copy(centre);
    camera.lookAt(centre);
    controls.current?.update();
  }, [camera]);

  // Camera presets: elevations are seen from standing eye level, framed on the house rather than the road.
  useEffect(() => {
    if (!view) return;
    const { centre, size, bounds, heightOf } = latest.current;
    const persp = camera as THREE.PerspectiveCamera;
    const fov = persp.isPerspectiveCamera ? persp.fov : 45;
    const aspect = persp.isPerspectiveCamera ? persp.aspect : 1;
    const across = view.side === "front" || view.side === "rear" ? bounds.w : bounds.h;
    const f = elevationFraming(heightOf(), across, fov, aspect);
    const d = f.distance;
    const t = new THREE.Vector3(centre.x, f.targetY, centre.z);
    switch (view.side) {
      case "front":
        camera.position.set(centre.x, f.eyeY, bounds.y1 + d);
        break;
      case "rear":
        camera.position.set(centre.x, f.eyeY, bounds.y0 - d);
        break;
      case "left":
        camera.position.set(bounds.x0 - d, f.eyeY, centre.z);
        break;
      case "right":
        camera.position.set(bounds.x1 + d, f.eyeY, centre.z);
        break;
      case "top":
        t.set(centre.x, 1.6, centre.z);
        camera.position.set(centre.x, size * 2.2, centre.z + 0.01);
        break;
    }
    controls.current?.target.copy(t);
    camera.lookAt(t);
    controls.current?.update();
    invalidate();
  }, [view, camera, invalidate]);

  return <OrbitControls ref={controls} makeDefault maxPolarAngle={Math.PI / 2 - 0.02} minDistance={1.5} maxDistance={size * 6} />;
}
