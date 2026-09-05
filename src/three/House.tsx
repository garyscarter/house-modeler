import { Suspense, useMemo } from "react";
import * as THREE from "three";
import { Billboard, Html, Image as DreiImage } from "@react-three/drei";
import { useLoader } from "@react-three/fiber";
import type { Floor, HouseModel, Photo, Room } from "../types";
import {
  buildWalls,
  cutWall,
  diffWalls,
  polygonCentroid,
  roomWorldPolygon,
  toWorld,
  type OpeningPlacement,
  type V2,
  type WallPiece,
} from "../lib/geometry";

export const WALL_T = 0.12;

export function floorBaseY(model: HouseModel, floor: Floor) {
  return floor.level * (model.ceilingHeight + model.slabThickness);
}

const ROOM_COLORS: Record<string, string> = {
  kitchen: "#e8d9b5",
  bath: "#cfe3ec",
  shower: "#cfe3ec",
  wc: "#cfe3ec",
  "en-suite": "#cfe3ec",
  ensuite: "#cfe3ec",
  bed: "#e3d5e6",
  living: "#d9e4cf",
  lounge: "#d9e4cf",
  recep: "#d9e4cf",
  sitting: "#d9e4cf",
  dining: "#e6dcc8",
  hall: "#e2e2dc",
  landing: "#e2e2dc",
  garage: "#cfcfcf",
  util: "#dcdcd0",
  study: "#d6dfe8",
  office: "#d6dfe8",
  conserv: "#d8ebe0",
  store: "#d9d9d9",
  cupboard: "#d9d9d9",
};

export function roomColor(room: Room): string {
  if (room.color) return room.color;
  const n = room.name.toLowerCase();
  for (const k of Object.keys(ROOM_COLORS)) if (n.includes(k)) return ROOM_COLORS[k];
  return "#e4e1d8";
}

interface HouseProps {
  model: HouseModel;
  photos: Photo[];
  ghost?: boolean;
  showLabels?: boolean;
  showCeilings?: boolean;
  selectedRoomId?: string | null;
  onSelectRoom?: (floor: Floor, room: Room) => void;
  /** Only render these floor levels (used to hide floors above the walk floor). */
  visibleLevels?: number[] | null;
  /**
   * Another variant to compare against. In ghost mode only walls missing from
   * it are drawn (what the renovation removes); in solid mode walls missing
   * from it are highlighted green (what the renovation adds).
   */
  diffAgainst?: HouseModel;
}

export function House({
  model,
  photos,
  ghost,
  showLabels = true,
  showCeilings = false,
  selectedRoomId,
  onSelectRoom,
  visibleLevels,
  diffAgainst,
}: HouseProps) {
  return (
    <group>
      {model.floors
        .filter((f) => !visibleLevels || visibleLevels.includes(f.level))
        .map((floor) => (
          <FloorGroup
            key={floor.id}
            model={model}
            floor={floor}
            photos={photos}
            ghost={!!ghost}
            showLabels={showLabels}
            showCeilings={showCeilings}
            selectedRoomId={selectedRoomId}
            onSelectRoom={onSelectRoom}
            otherFloor={diffAgainst?.floors.find((f) => f.level === floor.level) ?? null}
          />
        ))}
    </group>
  );
}

function FloorGroup({
  model,
  floor,
  photos,
  ghost,
  showLabels,
  showCeilings,
  selectedRoomId,
  onSelectRoom,
  otherFloor,
}: {
  model: HouseModel;
  floor: Floor;
  photos: Photo[];
  ghost: boolean;
  showLabels: boolean;
  showCeilings: boolean;
  selectedRoomId?: string | null;
  onSelectRoom?: (floor: Floor, room: Room) => void;
  otherFloor?: Floor | null;
}) {
  const y0 = floorBaseY(model, floor);
  const H = model.ceilingHeight;
  const allWalls = useMemo(() => buildWalls(floor), [floor]);
  const otherWalls = useMemo(() => (otherFloor ? buildWalls(otherFloor) : null), [otherFloor]);
  // Walls of this floor that the other variant does not have.
  const changed = useMemo(() => (otherWalls ? diffWalls(allWalls, otherWalls) : []), [allWalls, otherWalls]);
  // Ghost mode with a comparison draws only the removed walls.
  const walls = ghost && otherWalls ? changed : allWalls;
  const cut = useMemo(() => walls.map((w) => cutWall(w, H)), [walls, H]);
  const pieces = cut.flatMap((c) => c.pieces);
  const placements = cut.flatMap((c) => c.placements);

  const wallMat = ghost ? (
    <meshStandardMaterial color="#e0332f" transparent opacity={0.28} depthWrite={false} />
  ) : (
    <meshStandardMaterial color="#f4f1ea" roughness={0.9} />
  );

  return (
    <group position={[0, y0, 0]}>
      {!ghost && (
        <>
          {/* Structural slab under the whole floor so nothing floats. */}
          {floor.rooms.map((room) => (
            <RoomFloor
              key={room.id}
              floor={floor}
              room={room}
              photos={photos}
              selected={room.id === selectedRoomId}
              onSelect={() => onSelectRoom?.(floor, room)}
              slab={model.slabThickness}
            />
          ))}
          {showCeilings &&
            floor.rooms.map((room) => <RoomCeiling key={room.id} floor={floor} room={room} height={H} />)}
        </>
      )}

      {pieces.map((p, i) => (
        <WallBox key={i} piece={p} ghost={ghost}>
          {wallMat}
        </WallBox>
      ))}

      {!ghost && placements.map((pl, i) => <OpeningMesh key={i} placement={pl} />)}

      {!ghost &&
        otherWalls &&
        changed.map((w, i) => (
          <WallBox key={"new" + i} piece={{ a: w.a, b: w.b, y0: 0, y1: H }} ghost thickness={WALL_T + 0.04}>
            <meshStandardMaterial color="#16a34a" transparent opacity={0.55} depthWrite={false} />
          </WallBox>
        ))}

      {!ghost && floor.stairs && <Stairs floor={floor} height={H} />}

      {!ghost && showLabels && floor.rooms.map((room) => <RoomLabel key={room.id} floor={floor} room={room} />)}

      {!ghost && floor.rooms.map((room) => <PhotoPin key={room.id} floor={floor} room={room} photos={photos} />)}
    </group>
  );
}

function shapeFrom(poly: V2[]): THREE.Shape {
  const s = new THREE.Shape();
  poly.forEach((p, i) => (i === 0 ? s.moveTo(p.x, -p.y) : s.lineTo(p.x, -p.y)));
  s.closePath();
  return s;
}

function RoomFloor({
  floor,
  room,
  photos,
  selected,
  onSelect,
  slab,
}: {
  floor: Floor;
  room: Room;
  photos: Photo[];
  selected: boolean;
  onSelect: () => void;
  slab: number;
}) {
  const poly = useMemo(() => roomWorldPolygon(floor, room), [floor, room]);
  const geom = useMemo(() => new THREE.ShapeGeometry(shapeFrom(poly)), [poly]);
  const slabGeom = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(shapeFrom(poly), { depth: slab, bevelEnabled: false });
    return g;
  }, [poly, slab]);
  const photo = room.floorPhotoId ? photos.find((p) => p.id === room.floorPhotoId) : undefined;
  const color = selected ? "#ffd166" : roomColor(room);

  return (
    <group>
      <mesh geometry={slabGeom} rotation={[-Math.PI / 2, 0, 0]} position={[0, -slab, 0]} receiveShadow>
        <meshStandardMaterial color="#b8b3a8" />
      </mesh>
      <mesh
        geometry={geom}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.012, 0]}
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        {photo ? (
          <Suspense fallback={<meshStandardMaterial color={color} />}>
            <PhotoFloorMaterial url={photo.dataUrl} tint={selected ? "#ffd166" : "#ffffff"} />
          </Suspense>
        ) : (
          <meshStandardMaterial color={color} roughness={0.85} />
        )}
      </mesh>
    </group>
  );
}

function PhotoFloorMaterial({ url, tint }: { url: string; tint: string }) {
  const tex = useLoader(THREE.TextureLoader, url);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(0.5, 0.5);
  tex.colorSpace = THREE.SRGBColorSpace;
  return <meshStandardMaterial map={tex} color={tint} roughness={0.8} />;
}

function RoomCeiling({ floor, room, height }: { floor: Floor; room: Room; height: number }) {
  const poly = useMemo(() => roomWorldPolygon(floor, room), [floor, room]);
  const geom = useMemo(() => new THREE.ShapeGeometry(shapeFrom(poly)), [poly]);
  return (
    <mesh geometry={geom} rotation={[-Math.PI / 2, 0, 0]} position={[0, height, 0]}>
      <meshStandardMaterial color="#f3f3f0" emissive="#ffffff" emissiveIntensity={0.35} side={THREE.DoubleSide} />
    </mesh>
  );
}

function WallBox({
  piece,
  ghost,
  children,
  thickness = WALL_T,
}: {
  piece: WallPiece;
  ghost: boolean;
  children: React.ReactNode;
  thickness?: number;
}) {
  const dx = piece.b.x - piece.a.x;
  const dz = piece.b.y - piece.a.y;
  const len = Math.hypot(dx, dz);
  const h = piece.y1 - piece.y0;
  if (len < 0.01 || h < 0.01) return null;
  return (
    <mesh
      position={[(piece.a.x + piece.b.x) / 2, piece.y0 + h / 2, (piece.a.y + piece.b.y) / 2]}
      rotation={[0, -Math.atan2(dz, dx), 0]}
      castShadow={!ghost}
      receiveShadow={!ghost}
    >
      <boxGeometry args={[len, h, thickness]} />
      {children}
    </mesh>
  );
}

function OpeningMesh({ placement }: { placement: OpeningPlacement }) {
  const { opening, centre, dir, width } = placement;
  const rotY = -Math.atan2(dir.y, dir.x);
  if (opening.kind === "window") {
    return (
      <group position={[centre.x, 0, centre.y]} rotation={[0, rotY, 0]}>
        <mesh position={[0, 1.5, 0]}>
          <boxGeometry args={[width, 1.2, 0.02]} />
          <meshPhysicalMaterial color="#9ecbe6" transparent opacity={0.45} roughness={0.1} />
        </mesh>
        <mesh position={[0, 0.9, 0]}>
          <boxGeometry args={[width, 0.05, WALL_T + 0.02]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0, 2.1, 0]}>
          <boxGeometry args={[width, 0.05, WALL_T + 0.02]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
      </group>
    );
  }
  // Door leaf, hinged at one jamb and swung open ~75 degrees.
  const leaf = Math.min(width, 1.0);
  return (
    <group position={[centre.x, 0, centre.y]} rotation={[0, rotY, 0]}>
      <group position={[-width / 2, 0, 0]} rotation={[0, -Math.PI * 0.42, 0]}>
        <mesh position={[leaf / 2, 1.0, 0]}>
          <boxGeometry args={[leaf, 2.0, 0.04]} />
          <meshStandardMaterial color="#c9a26b" />
        </mesh>
      </group>
      {width > 1.4 && (
        <mesh position={[0, 1.05, 0]}>
          <boxGeometry args={[width, 2.0, 0.02]} />
          <meshPhysicalMaterial color="#9ecbe6" transparent opacity={0.35} roughness={0.1} />
        </mesh>
      )}
    </group>
  );
}

function Stairs({ floor, height }: { floor: Floor; height: number }) {
  const c = toWorld(floor, floor.stairs!);
  const steps = 10;
  const run = 2.6;
  return (
    <group position={[c.x, 0, c.y]}>
      {Array.from({ length: steps }, (_, i) => (
        <mesh key={i} position={[0, ((i + 0.5) * height) / steps, -run / 2 + ((i + 0.5) * run) / steps]}>
          <boxGeometry args={[0.9, height / steps, run / steps]} />
          <meshStandardMaterial color="#a89a86" />
        </mesh>
      ))}
    </group>
  );
}

function RoomLabel({ floor, room }: { floor: Floor; room: Room }) {
  const c = useMemo(() => polygonCentroid(roomWorldPolygon(floor, room)), [floor, room]);
  return (
    <Html position={[c.x, 0.05, c.y]} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
      <div className="room-label">
        {room.name}
        {room.dims && (
          <span>
            {room.dims.w.toFixed(2)} × {room.dims.h.toFixed(2)} m
          </span>
        )}
      </div>
    </Html>
  );
}

function PhotoPin({ floor, room, photos }: { floor: Floor; room: Room; photos: Photo[] }) {
  const mine = photos.filter((p) => p.floorName === floor.name && p.roomName === room.name);
  const c = useMemo(() => polygonCentroid(roomWorldPolygon(floor, room)), [floor, room]);
  const setUi = useUiSetter();
  if (!mine.length) return null;
  const first = mine[0];
  return (
    <Billboard position={[c.x, 1.55, c.y]}>
      <Suspense fallback={null}>
        <DreiImage
          url={first.dataUrl}
          scale={[1.1, 0.8]}
          transparent
          onClick={(e) => {
            e.stopPropagation();
            setUi({ selectedRoomId: room.id, selectedPhotoId: first.id });
          }}
        />
      </Suspense>
      {mine.length > 1 && (
        <Html position={[0.5, 0.35, 0]} center style={{ pointerEvents: "none" }}>
          <div className="pin-badge">{mine.length}</div>
        </Html>
      )}
    </Billboard>
  );
}

// Small indirection so House doesn't import the store at module top (keeps it testable).
import { useStore } from "../store";
function useUiSetter() {
  return useStore((s) => s.setUi);
}
