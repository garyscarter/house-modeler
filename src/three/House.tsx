import { Suspense, useMemo } from "react";
import * as THREE from "three";
import { Billboard, Html, Image as DreiImage } from "@react-three/drei";
import { useLoader } from "@react-three/fiber";
import type { Elevation, Floor, HouseModel, Photo, Room } from "../types";
import { exteriorOf } from "../lib/roof";
import { Roof } from "./Roof";
import {
  type WallSeg,
  buildWalls,
  cutWall,
  diffWalls,
  modelBounds,
  pointInPolygon,
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
  /** Draw roofs, canopies and exterior photo pins. */
  showExterior?: boolean;
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
  showExterior,
}: HouseProps) {
  const ext = exteriorOf(model);
  return (
    <group>
      {showExterior && !ghost && ext.showRoof && <Roof model={model} />}
      {showExterior && !ghost && <ExteriorPins model={model} photos={photos} />}
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
            wallColor={ext.wallColor}
            trimColor={ext.trimColor}
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
  wallColor,
  trimColor,
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
  wallColor: string;
  trimColor: string;
}) {
  const y0 = floorBaseY(model, floor);
  const H = model.ceilingHeight;
  const hasAbove = model.floors.some((f) => f.level === floor.level + 1);
  const allWalls = useMemo(() => buildWalls(floor), [floor]);
  const otherWalls = useMemo(() => (otherFloor ? buildWalls(otherFloor) : null), [otherFloor]);
  // Walls of this floor that the other variant does not have.
  const changed = useMemo(() => (otherWalls ? diffWalls(allWalls, otherWalls) : []), [allWalls, otherWalls]);
  // Ghost mode with a comparison draws only the removed walls.
  const walls = ghost && otherWalls ? changed : allWalls;
  const cut = useMemo(() => walls.map((w) => cutWall(w, H)), [walls, H]);
  const roomsById = useMemo(() => new Map(floor.rooms.map((r) => [r.id, r])), [floor.rooms]);
  const colourOf = (w: WallSeg) =>
    w.exterior ? (w.roomId && roomsById.get(w.roomId)?.exteriorColor) || wallColor : "#f4f1ea";
  const pieces = cut.flatMap((c, i) => c.pieces.map((p) => ({ piece: p, color: colourOf(walls[i]) })));
  const placements = cut.flatMap((c, i) => c.placements.map((pl) => ({ placement: pl, wall: walls[i] })));
  const worldRooms = useMemo(() => floor.rooms.map((r) => roomWorldPolygon(floor, r)), [floor]);

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

      {pieces.map(({ piece, color }, i) => (
        <WallBox key={i} piece={piece} ghost={ghost}>
          {ghost ? (
            <meshStandardMaterial color="#e0332f" transparent opacity={0.28} depthWrite={false} />
          ) : (
            <meshStandardMaterial color={color} roughness={0.9} />
          )}
        </WallBox>
      ))}

      {!ghost &&
        placements.map(({ placement, wall }, i) => (
          <OpeningMesh
            key={i}
            placement={placement}
            trimColor={trimColor}
            wallColor={(wall.roomId && roomsById.get(wall.roomId)?.exteriorColor) || wallColor}
            outward={outwardNormal(placement, worldRooms)}
          />
        ))}

      {!ghost &&
        otherWalls &&
        changed.map((w, i) => (
          <WallBox key={"new" + i} piece={{ a: w.a, b: w.b, y0: 0, y1: H }} ghost thickness={WALL_T + 0.04}>
            <meshStandardMaterial color="#16a34a" transparent opacity={0.55} depthWrite={false} />
          </WallBox>
        ))}

      {!ghost && floor.stairs && hasAbove && <Stairs floor={floor} height={H + model.slabThickness} />}

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

/** Unit normal pointing out of the building at an opening (or null when unknown). */
function outwardNormal(pl: OpeningPlacement, rooms: V2[][]): V2 | null {
  const n = { x: -pl.dir.y, y: pl.dir.x };
  const probe = (sign: number) => ({ x: pl.centre.x + n.x * 0.4 * sign, y: pl.centre.y + n.y * 0.4 * sign });
  const inPlus = rooms.some((r) => pointInPolygon(probe(1), r));
  const inMinus = rooms.some((r) => pointInPolygon(probe(-1), r));
  if (inPlus && !inMinus) return { x: -n.x, y: -n.y };
  if (inMinus && !inPlus) return n;
  return null;
}

function OpeningMesh({
  placement,
  trimColor,
  wallColor,
  outward,
}: {
  placement: OpeningPlacement;
  trimColor: string;
  wallColor: string;
  outward: V2 | null;
}) {
  const { opening, centre, dir, width } = placement;
  const rotY = -Math.atan2(dir.y, dir.x);
  if (opening.kind === "window" || opening.kind === "bay") {
    // Bays project outward; the local +z axis is the wall normal, so pick its sign from `outward`.
    const nz = { x: -dir.y, y: dir.x };
    const sign = outward ? Math.sign(outward.x * nz.x + outward.y * nz.y) || 1 : 1;
    const depth = opening.kind === "bay" ? 0.6 : 0;
    const off = depth ? (sign * depth) / 2 + (sign * WALL_T) / 2 : 0;
    return (
      <group position={[centre.x, 0, centre.y]} rotation={[0, rotY, 0]}>
        {depth > 0 && (
          <>
            <mesh position={[0, 0.45, off]} castShadow>
              <boxGeometry args={[width, 0.9, depth]} />
              <meshStandardMaterial color={wallColor} />
            </mesh>
            <mesh position={[0, 2.25, off]} castShadow>
              <boxGeometry args={[width, 0.3, depth]} />
              <meshStandardMaterial color={wallColor} />
            </mesh>
            <mesh position={[0, 2.45, off]} castShadow>
              <boxGeometry args={[width + 0.2, 0.1, depth + 0.15]} />
              <meshStandardMaterial color="#4b4b4b" />
            </mesh>
          </>
        )}
        <mesh position={[0, 1.5, off]}>
          <boxGeometry args={[width, 1.2, depth || 0.02]} />
          <meshPhysicalMaterial color="#9ecbe6" transparent opacity={0.45} roughness={0.1} />
        </mesh>
        <mesh position={[0, 0.9, off]}>
          <boxGeometry args={[width + 0.06, 0.06, (depth || WALL_T) + 0.03]} />
          <meshStandardMaterial color={trimColor} />
        </mesh>
        <mesh position={[0, 2.1, off]}>
          <boxGeometry args={[width + 0.06, 0.06, (depth || WALL_T) + 0.03]} />
          <meshStandardMaterial color={trimColor} />
        </mesh>
      </group>
    );
  }
  if (opening.kind === "garage") {
    // Panelled up-and-over door: frame, leaf, a grid of raised panels and a handle.
    const col = opening.color ?? "#b3202e";
    const cols = width > 2.8 ? 3 : 2;
    const rows = 3;
    const pw = (width - 0.1) / cols;
    const ph = 2.05 / rows;
    return (
      <group position={[centre.x, 0, centre.y]} rotation={[0, rotY, 0]}>
        <mesh position={[0, 1.1, 0]}>
          <boxGeometry args={[width + 0.12, 2.2, WALL_T + 0.02]} />
          <meshStandardMaterial color={trimColor} />
        </mesh>
        <mesh position={[0, 1.05, 0]}>
          <boxGeometry args={[width, 2.05, WALL_T + 0.04]} />
          <meshStandardMaterial color={col} roughness={0.6} />
        </mesh>
        {Array.from({ length: cols * rows }, (_, i) => {
          const c = i % cols;
          const r = Math.floor(i / cols);
          return (
            <mesh key={i} position={[-width / 2 + 0.05 + (c + 0.5) * pw, 0.05 + (r + 0.5) * ph, 0]}>
              <boxGeometry args={[pw - 0.12, ph - 0.12, WALL_T + 0.08]} />
              <meshStandardMaterial color={col} roughness={0.5} />
            </mesh>
          );
        })}
        <mesh position={[0, 1.0, 0]}>
          <boxGeometry args={[0.16, 0.05, WALL_T + 0.12]} />
          <meshStandardMaterial color="#222" metalness={0.6} roughness={0.4} />
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
          <meshStandardMaterial color={opening.color ?? "#c9a26b"} />
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

/** A straight flight from this floor to the one above, rising in `stairsDir`. */
function Stairs({ floor, height }: { floor: Floor; height: number }) {
  const c = toWorld(floor, floor.stairs!);
  const run = floor.stairsLen ?? 2.6;
  const w = floor.stairsWidth ?? 0.9;
  const steps = Math.max(6, Math.round(run / 0.25));
  // Local flight rises towards +z; rotate so +z points in the chosen plan direction.
  const rot = { down: 0, up: Math.PI, right: Math.PI / 2, left: -Math.PI / 2 }[floor.stairsDir ?? "up"];
  return (
    <group position={[c.x, 0, c.y]} rotation={[0, rot, 0]}>
      {Array.from({ length: steps }, (_, i) => (
        <mesh key={i} position={[0, ((i + 0.5) * height) / steps, -run / 2 + ((i + 0.5) * run) / steps]} castShadow>
          <boxGeometry args={[w, height / steps, run / steps]} />
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

/** Exterior photos float beside the elevation they show. */
function ExteriorPins({ model, photos }: { model: HouseModel; photos: Photo[] }) {
  const b = useMemo(() => modelBounds(model.floors), [model]);
  const setUi = useUiSetter();
  const byElev = new Map<Elevation, Photo[]>();
  for (const p of photos) if (p.elevation) byElev.set(p.elevation, [...(byElev.get(p.elevation) ?? []), p]);
  const cx = (b.x0 + b.x1) / 2;
  const cz = (b.y0 + b.y1) / 2;
  const GAP = 2.6;
  const place = (e: Elevation, i: number, n: number): [number, number, number] => {
    const t = (i - (n - 1) / 2) * 2.4;
    switch (e) {
      case "front":
        return [cx + t, 1.8, b.y1 + GAP];
      case "rear":
        return [cx - t, 1.8, b.y0 - GAP];
      case "left":
        return [b.x0 - GAP, 1.8, cz - t];
      case "right":
        return [b.x1 + GAP, 1.8, cz + t];
    }
  };
  return (
    <group>
      {[...byElev.entries()].flatMap(([e, list]) =>
        list.map((p, i) => (
          <Billboard key={p.id} position={place(e, i, list.length)}>
            <Suspense fallback={null}>
              <DreiImage
                url={p.dataUrl}
                scale={[2.2, 1.5]}
                transparent
                onClick={(ev) => {
                  ev.stopPropagation();
                  setUi({ selectedPhotoId: p.id });
                }}
              />
            </Suspense>
          </Billboard>
        )),
      )}
    </group>
  );
}

// Small indirection so House doesn't import the store at module top (keeps it testable).
import { useStore } from "../store";
function useUiSetter() {
  return useStore((s) => s.setUi);
}
