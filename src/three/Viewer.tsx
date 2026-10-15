import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Floor, HouseModel, Photo, Room } from "../types";
import { House } from "./House";
import { modelBounds } from "../lib/geometry";
import { useStore, type CameraMode } from "../store";
import { Lighting, SkyBackdrop } from "./Lighting";
import { GROUND_Y, SiteScene } from "./Site";
import { newWalkInput, Walker } from "./Walker";
import { CaptureBridge } from "./capture";
import { Effects } from "./Effects";
import { SunControls } from "../components/SunControls";
import { useWalkSettings, WalkControls } from "../components/WalkControls";
import { useMediaQuery } from "../components/useMediaQuery";

interface ViewerProps {
  model: HouseModel;
  ghost?: HouseModel;
  photos: Photo[];
  cameraMode: CameraMode;
  walkFloorId: string | null;
  showLabels: boolean;
  showCeilings: boolean;
  selectedRoomId: string | null;
  onSelectRoom: (floor: Floor, room: Room) => void;
  title?: string;
  maxLevel?: number | null;
  showExterior?: boolean;
  /** Identifier used by exports to find this viewer's renderer. */
  captureId?: string;
}

export function Viewer(props: ViewerProps) {
  const { model, ghost, photos, cameraMode, walkFloorId, showLabels, showCeilings, selectedRoomId, onSelectRoom, title, maxLevel, showExterior, captureId } =
    props;
  const bounds = useMemo(() => modelBounds([...model.floors, ...(ghost?.floors ?? [])]), [model, ghost]);
  const centre = useMemo(
    () => new THREE.Vector3((bounds.x0 + bounds.x1) / 2, 1, (bounds.y0 + bounds.y1) / 2),
    [bounds],
  );
  const size = Math.max(bounds.w, bounds.h, 6);
  const walkFloor = model.floors.find((f) => f.id === walkFloorId) ?? model.floors[0];
  const walking = cameraMode === "walk" && !!walkFloor;
  const [locked, setLocked] = useState(false);
  const [view, setView] = useState<{ id: number; side: ViewSide } | null>(null);
  const quality = useStore((s) => s.settings.quality);
  const setUi = useStore((s) => s.setUi);
  const [walkInput] = useState(newWalkInput);
  const [walkSettings, setWalkSettings] = useWalkSettings();
  // Touch screens get a joystick and never lock the pointer.
  const coarse = useMediaQuery("(pointer: coarse)");
  const onWalkFloor = useCallback((id: string) => setUi({ walkFloorId: id }), [setUi]);

  // When walking, hide floors above the one you are on, except the next one
  // up when there are stairs to it (seen through the stairwell); otherwise
  // honour the "show floors up to" control.
  const stairsUp = walking && !!walkFloor.stairs && model.floors.some((f) => f.level === walkFloor.level + 1);
  const cap = walking && !showCeilings ? walkFloor.level + (stairsUp ? 1 : 0) : maxLevel ?? null;
  const levels = [...new Set([...model.floors, ...(ghost?.floors ?? [])].map((f) => f.level))];
  const visibleLevels = cap === null ? null : levels.filter((l) => l <= cap);

  return (
    <div className="viewer">
      {title && <div className="viewer-title">{title}</div>}
      {!walking && (
        <div className="view-buttons">
          {(["front", "rear", "left", "right", "top"] as ViewSide[]).map((side) => (
            <button key={side} onClick={() => setView({ id: Date.now(), side })} title={`Look at the ${side}`}>
              {side}
            </button>
          ))}
        </div>
      )}
      {!walking && <SunControls />}
      {walking && (
        <WalkControls
          input={walkInput}
          settings={walkSettings}
          onSettings={setWalkSettings}
          coarse={coarse}
          locked={locked}
          floors={model.floors}
          floorId={walkFloor.id}
          onFloor={onWalkFloor}
          onExit={() => setUi({ cameraMode: "orbit" })}
        />
      )}
      <Canvas
        shadows="percentage"
        dpr={DPR[quality]}
        camera={{ position: [centre.x + size * 0.9, size * 0.9, centre.z + size * 0.9], fov: 45, near: 0.05, far: 500 }}
        onPointerMissed={() => {}}
      >
        <SkyBackdrop />
        <Lighting centre={centre} size={size} walking={walking} />
        <House
          model={model}
          photos={photos}
          showLabels={showLabels && !walking}
          showCeilings={showCeilings || walking}
          selectedRoomId={walking ? null : selectedRoomId}
          onSelectRoom={walking ? undefined : onSelectRoom}
          visibleLevels={visibleLevels}
          diffAgainst={ghost}
          showExterior={!!showExterior && cap === null}
        />
        {ghost && <House model={ghost} photos={[]} ghost showLabels={false} diffAgainst={model} visibleLevels={visibleLevels} />}
        <SiteScene centre={centre} size={size} model={model} />
        {!walking && <ContactShadows position={[centre.x, GROUND_Y - 0.01, centre.z]} scale={size * 3} blur={2} opacity={0.35} far={20} />}
        <CaptureBridge id={captureId ?? "main"} />
        <Effects />
        {walking ? (
          <Walker
            model={model}
            floor={walkFloor}
            centre={centre}
            input={walkInput}
            eye={walkSettings.eye}
            speed={walkSettings.speed}
            coarse={coarse}
            onFloor={onWalkFloor}
            onLock={setLocked}
          />
        ) : (
          <Orbit centre={centre} size={size} view={view} bounds={bounds} />
        )}
      </Canvas>
    </div>
  );
}

/** Device pixel ratio range per render quality; phones on "low" render at 1x. */
const DPR: Record<"high" | "balanced" | "low", [number, number]> = { high: [1, 2], balanced: [1, 1.5], low: [1, 1] };

export type ViewSide = "front" | "rear" | "left" | "right" | "top";

function Orbit({
  centre,
  size,
  view,
  bounds,
}: {
  centre: THREE.Vector3;
  size: number;
  view: { id: number; side: ViewSide } | null;
  bounds: { x0: number; x1: number; y0: number; y1: number };
}) {
  const camera = useThree((s) => s.camera);
  const controls = useRef<OrbitControlsImpl>(null);
  const first = useRef(true);
  useEffect(() => {
    if (!first.current) return;
    first.current = false;
    camera.position.set(centre.x + size * 0.9, size * 0.9, centre.z + size * 0.9);
    camera.lookAt(centre);
  }, [camera, centre, size]);

  // Camera presets: elevations are seen from street level, slightly raised.
  useEffect(() => {
    if (!view) return;
    const d = size * 1.6;
    const eye = 2.2;
    const t = new THREE.Vector3(centre.x, 1.6, centre.z);
    switch (view.side) {
      case "front":
        camera.position.set(centre.x, eye, bounds.y1 + d);
        break;
      case "rear":
        camera.position.set(centre.x, eye, bounds.y0 - d);
        break;
      case "left":
        camera.position.set(bounds.x0 - d, eye, centre.z);
        break;
      case "right":
        camera.position.set(bounds.x1 + d, eye, centre.z);
        break;
      case "top":
        camera.position.set(centre.x, size * 2.2, centre.z + 0.01);
        break;
    }
    controls.current?.target.copy(t);
    camera.lookAt(t);
    controls.current?.update();
  }, [view, camera, centre, size, bounds]);

  return (
    <OrbitControls ref={controls} target={centre} makeDefault maxPolarAngle={Math.PI / 2 - 0.02} minDistance={1.5} maxDistance={size * 6} />
  );
}

