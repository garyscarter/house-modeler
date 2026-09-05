import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls, PointerLockControls } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Floor, HouseModel, Photo, Room } from "../types";
import { House, floorBaseY } from "./House";
import { modelBounds, pointInPolygon, polygonArea, polygonCentroid, roomWorldPolygon, toWorld } from "../lib/geometry";
import type { CameraMode } from "../store";

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
}

export function Viewer(props: ViewerProps) {
  const { model, ghost, photos, cameraMode, walkFloorId, showLabels, showCeilings, selectedRoomId, onSelectRoom, title, maxLevel, showExterior } =
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

  // When walking, hide floors above so the ceiling doesn't block the view;
  // otherwise honour the "show floors up to" control.
  const cap = walking && !showCeilings ? walkFloor.level : maxLevel ?? null;
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
      {walking && !locked && (
        <div className="walk-hint">
          Click the view to walk. <b>WASD</b> or arrows to move, mouse to look, <b>Esc</b> to release.
        </div>
      )}
      <Canvas
        shadows
        camera={{ position: [centre.x + size * 0.9, size * 0.9, centre.z + size * 0.9], fov: 45, near: 0.05, far: 500 }}
        onPointerMissed={() => {}}
      >
        <color attach="background" args={["#eef0f3"]} />
        <hemisphereLight args={["#ffffff", "#b0b8c8", 0.7]} />
        <ambientLight intensity={walking ? 1.8 : 0.3} />
        <directionalLight
          position={[centre.x + 10, 20, centre.z + 8]}
          intensity={1.3}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0004}
          shadow-normalBias={0.02}
          shadow-camera-left={-size}
          shadow-camera-right={size}
          shadow-camera-top={size}
          shadow-camera-bottom={-size}
        />
        <House
          model={model}
          photos={photos}
          showLabels={showLabels && !walking}
          showCeilings={showCeilings || walking}
          selectedRoomId={selectedRoomId}
          onSelectRoom={onSelectRoom}
          visibleLevels={visibleLevels}
          diffAgainst={ghost}
          showExterior={!!showExterior && cap === null}
        />
        {ghost && <House model={ghost} photos={[]} ghost showLabels={false} diffAgainst={model} visibleLevels={visibleLevels} />}
        <Ground centre={centre} size={size} />
        {!walking && <ContactShadows position={[centre.x, -0.26 - 0.01, centre.z]} scale={size * 3} blur={2} opacity={0.35} far={20} />}
        {walking ? (
          <Walker model={model} floor={walkFloor} centre={centre} onLock={setLocked} />
        ) : (
          <Orbit centre={centre} size={size} view={view} bounds={bounds} />
        )}
      </Canvas>
    </div>
  );
}

function Ground({ centre, size }: { centre: THREE.Vector3; size: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[centre.x, -0.26, centre.z]} receiveShadow>
      <planeGeometry args={[size * 4, size * 4]} />
      <meshStandardMaterial color="#cfd6cc" />
    </mesh>
  );
}

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

const KEYS: Record<string, string> = {
  KeyW: "fwd",
  ArrowUp: "fwd",
  KeyS: "back",
  ArrowDown: "back",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  ShiftLeft: "run",
  ShiftRight: "run",
};

function Walker({
  model,
  floor,
  centre,
  onLock,
}: {
  model: HouseModel;
  floor: Floor;
  centre: THREE.Vector3;
  onLock: (v: boolean) => void;
}) {
  const camera = useThree((s) => s.camera);
  const keys = useRef<Record<string, boolean>>({});
  const eye = floorBaseY(model, floor) + 1.6;

  useEffect(() => {
    // Start in the middle of the largest room on this floor, facing its
    // nearest door (or the floor's centre if it has none).
    let start = { x: centre.x, y: centre.z };
    let bestPoly: ReturnType<typeof roomWorldPolygon> | null = null;
    let best = 0;
    for (const room of floor.rooms) {
      const poly = roomWorldPolygon(floor, room);
      const a = Math.abs(polygonArea(poly));
      if (a > best) {
        best = a;
        start = polygonCentroid(poly);
        bestPoly = poly;
      }
    }
    let target = { x: centre.x, y: centre.z };
    let bestD = Infinity;
    for (const op of floor.openings) {
      if (op.kind !== "door") continue;
      const p = toWorld(floor, { x: op.x, y: op.y });
      const d = Math.hypot(p.x - start.x, p.y - start.y);
      // Doors on this room's boundary are within a wall-width of its polygon.
      const near = bestPoly && (pointInPolygon(p, bestPoly) || d < 6);
      if (near && d < bestD) {
        bestD = d;
        target = p;
      }
    }
    if (Math.hypot(target.x - start.x, target.y - start.y) < 0.1) target = { x: start.x + 1, y: start.y };
    camera.position.set(start.x, eye, start.y);
    camera.lookAt(target.x, eye, target.y);
    const down = (e: KeyboardEvent) => {
      const k = KEYS[e.code];
      if (k) {
        keys.current[k] = true;
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      const k = KEYS[e.code];
      if (k) keys.current[k] = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [camera, centre, eye, floor]);

  useFrame((_, dt) => {
    const k = keys.current;
    const speed = (k.run ? 4 : 2) * Math.min(dt, 0.05);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = 0;
    dir.normalize();
    const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));
    if (k.fwd) camera.position.addScaledVector(dir, speed);
    if (k.back) camera.position.addScaledVector(dir, -speed);
    if (k.left) camera.position.addScaledVector(side, -speed);
    if (k.right) camera.position.addScaledVector(side, speed);
    camera.position.y = eye;
  });

  // Restrict pointer lock to the 3D canvas; by default drei locks on any document click.
  return <PointerLockControls makeDefault selector=".viewer canvas" onLock={() => onLock(true)} onUnlock={() => onLock(false)} />;
}
